import fs from "node:fs";
import { randomBytes } from "node:crypto";
import type { Groth16Proof, PublicSignals } from "snarkjs";
import { VKEY_FILE } from "@pqid/common/paths";
import {
  getPoseidon,
  issuerKeyHash,
  policyHash as computePolicyHash,
  verifierDomainTag,
  stmtCodeForDomain,
  PREDICATE_AGE_GTE,
  PREDICATE_AGE_LT,
} from "@pqid/common/encoding";
import type { Ledger } from "@pqid/ledger";

/**
 * Verifier service (paper §III-B.4a, "off-circuit checks performed by the
 * verifier"): (i) Groth16.verify against the pinned vkey; (ii) on-chain
 * resolution of pk_issuer with equality against public signal 0;
 * (iii) on-chain resolution of revRoot with equality against signal 1;
 * (iv) session-nonce freshness (single-use, TTL).
 * Plus: policy-hash equality (signal 2) and statement-code check (signal 4).
 */
export interface Presentation {
  proof: Groth16Proof;
  publicSignals: PublicSignals; // [issuerKeyHash, revRoot, policyHash, nonce, stmtCode]
  issuerDid: string; // which issuer the credential claims (public context)
}

export interface VerifyDecision {
  accepted: boolean;
  reasons: string[];
  checks: {
    proofValid: boolean;
    issuerResolvedAndAccredited: boolean;
    issuerKeyHashMatches: boolean;
    revRootMatches: boolean;
    policyHashMatches: boolean;
    nonceFresh: boolean;
    stmtCodeValid: boolean;
  };
}

export interface VerifierPolicy {
  type: "age_gte" | "age_lt";
  threshold: number;
}

/** Single-use session nonces with a TTL (replay protection). */
export class NonceRegistry {
  private readonly issued = new Map<string, number>(); // nonce -> expiry epoch ms
  constructor(private readonly ttlMs = 5 * 60_000) {}

  issue(): bigint {
    const nonce = BigInt("0x" + randomBytes(16).toString("hex"));
    this.issued.set(nonce.toString(), Date.now() + this.ttlMs);
    return nonce;
  }

  /** Consume a nonce: valid exactly once, before expiry. */
  consume(nonce: string): boolean {
    const expiry = this.issued.get(nonce);
    if (expiry === undefined) return false;
    this.issued.delete(nonce);
    return Date.now() <= expiry;
  }
}

export class Verifier {
  private readonly nonces: NonceRegistry;
  private readonly vkey: unknown;
  /** This verifier's identifier — folded into stmtCode by honest wallets (V6 §F3). */
  readonly verifierId: string;

  constructor(
    private readonly ledger: Ledger,
    opts: { nonceTtlMs?: number; vkeyFile?: string; verifierId?: string } = {}
  ) {
    this.nonces = new NonceRegistry(opts.nonceTtlMs);
    this.vkey = JSON.parse(fs.readFileSync(opts.vkeyFile ?? VKEY_FILE, "utf8"));
    this.verifierId = opts.verifierId ?? "pqid:verifier:demo";
  }

  /** Step 1 of a session: the verifier issues a fresh nonce (sent in the request). */
  newSessionNonce(): bigint {
    return this.nonces.issue();
  }

  async verifyPresentation(
    presentation: Presentation,
    expectedPolicy: VerifierPolicy
  ): Promise<VerifyDecision> {
    const reasons: string[] = [];
    const signals = presentation.publicSignals;
    const checks: VerifyDecision["checks"] = {
      proofValid: false,
      issuerResolvedAndAccredited: false,
      issuerKeyHashMatches: false,
      revRootMatches: false,
      policyHashMatches: false,
      nonceFresh: false,
      stmtCodeValid: false,
    };

    if (signals.length !== 5) {
      return {
        accepted: false,
        reasons: [`expected 5 public signals, got ${signals.length}`],
        checks,
      };
    }
    const [sigIssuerKeyHash, sigRevRoot, sigPolicyHash, sigNonce, sigStmtCode] =
      signals as [string, string, string, string, string];

    const poseidon = await getPoseidon();

    // (ii) resolve pk_issuer on-chain; equality against signal 0
    try {
      const doc = await this.ledger.resolveDid(presentation.issuerDid);
      const accredited = await this.ledger.isAccredited(presentation.issuerDid);
      checks.issuerResolvedAndAccredited = doc.active && accredited;
      if (!doc.active) reasons.push("issuer DID is deactivated");
      if (!accredited) reasons.push("issuer is not accredited in the Issuer Registry");
      const pk = Buffer.from(doc.publicKeyDilithium, "hex");
      const expectedKeyHash = issuerKeyHash(poseidon, pk).toString();
      checks.issuerKeyHashMatches = expectedKeyHash === sigIssuerKeyHash;
      if (!checks.issuerKeyHashMatches) {
        reasons.push("Poseidon(pk_issuer) does not match public signal 0");
      }
    } catch (e) {
      reasons.push(`issuer DID resolution failed: ${(e as Error).message}`);
    }

    // (iii) resolve current revRoot on-chain; equality against signal 1
    try {
      const chainRoot = await this.ledger.getRevRoot(presentation.issuerDid);
      checks.revRootMatches = chainRoot.toString() === sigRevRoot;
      if (!checks.revRootMatches) {
        reasons.push(
          `revocation root mismatch: proof used ${sigRevRoot}, chain has ${chainRoot}`
        );
      }
    } catch (e) {
      reasons.push(`revRoot resolution failed: ${(e as Error).message}`);
    }

    // policy commitment equality (signal 2)
    const predicateCode =
      expectedPolicy.type === "age_gte" ? PREDICATE_AGE_GTE : PREDICATE_AGE_LT;
    const expectedPolicyHash = computePolicyHash(
      poseidon,
      predicateCode,
      BigInt(expectedPolicy.threshold)
    ).toString();
    checks.policyHashMatches = expectedPolicyHash === sigPolicyHash;
    if (!checks.policyHashMatches) reasons.push("policy hash does not match the requested policy");

    // (iv) nonce freshness — single use
    checks.nonceFresh = this.nonces.consume(sigNonce);
    if (!checks.nonceFresh) reasons.push("nonce is stale, unknown, or already used");

    // statement code must bind THIS verifier's domain (V6 §F3): a proof made
    // for another verifier carries a different stmtCode and is rejected here.
    const expectedStmtCode = stmtCodeForDomain(
      poseidon,
      verifierDomainTag(poseidon, this.verifierId)
    ).toString();
    checks.stmtCodeValid = sigStmtCode === expectedStmtCode;
    if (!checks.stmtCodeValid) {
      reasons.push("stmtCode does not bind this verifier's domain (cross-verifier replay?)");
    }

    // (i) Groth16 proof verification
    const snarkjs = await import("snarkjs");
    checks.proofValid = await snarkjs.groth16.verify(
      this.vkey,
      signals,
      presentation.proof
    );
    if (!checks.proofValid) reasons.push("Groth16 proof verification failed");

    const accepted = Object.values(checks).every(Boolean);
    return { accepted, reasons, checks };
  }
}

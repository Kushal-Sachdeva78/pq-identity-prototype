import { randomBytes } from "node:crypto";
import type { VerifiableCredential } from "@pqid/issuer";
import { computeCredId } from "@pqid/issuer";
import { dilithiumKeygen, dilithiumVerify, type SigKeypair } from "@pqid/pqc";
import { didFromPublicKey } from "@pqid/common/did";
import {
  getPoseidon,
  issuerKeyHash,
  policyHash as computePolicyHash,
  holderCommit as computeHolderCommit,
  verifierDomainTag,
  stmtCodeForDomain,
  PREDICATE_AGE_GTE,
  PREDICATE_AGE_LT,
  BN254_P,
} from "@pqid/common/encoding";
import type { NonMembershipProof } from "@pqid/revocation";
import { buildCircuitInput, type CircuitInput, type PublicInputs } from "./witness.ts";
import { prove, proveBoth, type ProverBackend, type ProveResult } from "./prove.ts";

/**
 * Wallet / Prover (Algorithm 3): performs the OFF-CIRCUIT checks — issuer
 * Dilithium signature, holder binding, policy applicability — then builds the
 * witness (incl. the depth-32 non-membership opening) and runs Groth16.Prove.
 * The off-circuit checks are the load-bearing half of the two-phase
 * verification (Assumption 5); see harness/malicious_wallet_probe.ts for what
 * happens when a wallet skips them.
 */
export interface HolderWallet {
  did: string;
  keys: SigKeypair;
  holderSecret: bigint;
  holderCommit: bigint;
}

/** Supported policy predicates (V6: two working predicate types). */
export interface PolicyV1 {
  type: "age_gte" | "age_lt";
  attribute: "age";
  threshold: number;
}

export function predicateCodeFor(policy: PolicyV1): bigint {
  return policy.type === "age_gte" ? PREDICATE_AGE_GTE : PREDICATE_AGE_LT;
}

export interface ProofRequest {
  policy: PolicyV1;
  /** Verifier-chosen session nonce, sent in the request (freshness). */
  nonce: bigint;
  /** Requesting verifier's identifier — folded into stmtCode (V6 §F3). */
  verifierId: string;
}

export async function createWallet(): Promise<HolderWallet> {
  const poseidon = await getPoseidon();
  const keys = dilithiumKeygen();
  // 248-bit secret < BN254 p
  const holderSecret = BigInt("0x" + randomBytes(31).toString("hex")) % BN254_P;
  return {
    did: didFromPublicKey(keys.publicKey),
    keys,
    holderSecret,
    holderCommit: computeHolderCommit(poseidon, holderSecret),
  };
}

export interface OffCircuitCheckResult {
  credIdConsistent: boolean;
  dilithiumValid: boolean;
  holderBound: boolean;
  policyApplicable: boolean;
  ok: boolean;
}

/** The wallet's off-circuit checks. If any fails, NO proof is generated. */
export function walletCheckCredential(
  wallet: HolderWallet,
  vc: VerifiableCredential,
  pkIssuer: Buffer,
  policy: PolicyV1
): OffCircuitCheckResult {
  const recomputed = computeCredId(vc.credential, pkIssuer).toString("hex");
  const credIdConsistent = recomputed === vc.credID;
  const dilithiumValid =
    credIdConsistent &&
    dilithiumVerify(
      pkIssuer,
      Buffer.from(vc.credID, "hex"),
      Buffer.from(vc.signature, "hex")
    );
  const holderBound =
    vc.credential.holderCommit === wallet.holderCommit.toString() &&
    vc.credential.subject === wallet.did;
  const claimValue = vc.credential.claims[policy.attribute];
  const policyApplicable =
    typeof claimValue === "number" &&
    (policy.type === "age_gte"
      ? claimValue >= policy.threshold
      : claimValue < policy.threshold);
  const ok = credIdConsistent && dilithiumValid && holderBound && policyApplicable;
  return { credIdConsistent, dilithiumValid, holderBound, policyApplicable, ok };
}

export interface GenerateProofArgs {
  wallet: HolderWallet;
  vc: VerifiableCredential;
  request: ProofRequest;
  pkIssuer: Buffer;
  /** Current on-chain revocation root (resolved by the wallet). */
  revRoot: bigint;
  /** Non-membership opening obtained from the issuer's revocation service. */
  nonMembership: NonMembershipProof;
  /** If true, SKIP the off-circuit checks (malicious-wallet probe ONLY). */
  dangerouslySkipOffCircuitChecks?: boolean;
}

export async function buildProofInput(args: GenerateProofArgs): Promise<CircuitInput> {
  const poseidon = await getPoseidon();
  if (!args.dangerouslySkipOffCircuitChecks) {
    const check = walletCheckCredential(
      args.wallet,
      args.vc,
      args.pkIssuer,
      args.request.policy
    );
    if (!check.ok) {
      throw new Error(
        `off-circuit check failed: ${JSON.stringify(check)} — no proof generated`
      );
    }
  }
  const predicateCode = predicateCodeFor(args.request.policy);
  const domainTag = verifierDomainTag(poseidon, args.request.verifierId);
  const pub: PublicInputs = {
    issuerKeyHash: issuerKeyHash(poseidon, args.pkIssuer),
    revRoot: args.revRoot,
    policyHash: computePolicyHash(
      poseidon,
      predicateCode,
      BigInt(args.request.policy.threshold)
    ),
    nonce: args.request.nonce,
    stmtCode: stmtCodeForDomain(poseidon, domainTag),
  };
  return buildCircuitInput(pub, {
    credId: Buffer.from(args.vc.credID, "hex"),
    holderSecret: args.wallet.holderSecret,
    holderCommit: BigInt(args.vc.credential.holderCommit),
    claimAge: BigInt(args.vc.credential.claims["age"] as number),
    threshold: BigInt(args.request.policy.threshold),
    predicateCode,
    domainTag,
    nonMembership: args.nonMembership,
  });
}

/** Algorithm 3 end-to-end: checks → witness → Groth16.Prove. */
export async function generateProof(
  args: GenerateProofArgs,
  backend: ProverBackend = "snarkjs"
): Promise<ProveResult> {
  const input = await buildProofInput(args);
  return prove(input, backend);
}

export { prove, proveBoth, type ProverBackend, type ProveResult };
export { buildCircuitInput, type CircuitInput } from "./witness.ts";

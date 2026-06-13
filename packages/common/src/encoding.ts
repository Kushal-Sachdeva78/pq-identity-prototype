import { buildPoseidon, type Poseidon } from "circomlibjs";

/**
 * Field-element encodings shared by the JS protocol code and the Circom
 * circuit. Every encoding here is documented in ARCHITECTURE.md §Public
 * signals; the circuit (circuits/credential_auth.circom) must stay in sync.
 *
 * BN254 scalar field prime (the snark field of circom/snarkjs):
 */
export const BN254_P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Policy predicate codes (bound into policyHash; circuit-enforced set). */
export const PREDICATE_AGE_GTE = 1n; // claims.age >= threshold
export const PREDICATE_AGE_LT = 2n; // claims.age <  threshold
/** v1 statement version: possession ∧ policy ∧ issuer-bound ∧ not-revoked. */
export const STMT_V1 = 1n;
/** Domain tag for the Poseidon fold of issuer public keys. */
export const DOMAIN_ISSUER_KEY = 1001n;
/** Domain tag for the Poseidon fold of verifier identifiers (V6 §F3). */
export const DOMAIN_VERIFIER_ID = 1002n;

let poseidonSingleton: Poseidon | null = null;

export async function getPoseidon(): Promise<Poseidon> {
  if (!poseidonSingleton) poseidonSingleton = await buildPoseidon();
  return poseidonSingleton;
}

export function poseidonBig(
  poseidon: Poseidon,
  inputs: ReadonlyArray<bigint>
): bigint {
  return poseidon.F.toObject(poseidon(inputs as Array<bigint>));
}

/** Interpret ≤31 big-endian bytes as a field element (always < p). */
export function fieldFromBytesBE(bytes: Uint8Array): bigint {
  if (bytes.length > 31) throw new Error("chunk too large for one field element");
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

/**
 * Poseidon fold of an arbitrary byte string (used for issuerKeyHash over the
 * 1,312-byte ML-DSA-44 public key):
 *   chunks = 31-byte big-endian chunks of `bytes` (last chunk may be short)
 *   h0 = Poseidon(domainTag, len(bytes))
 *   h_{i+1} = Poseidon(h_i, chunk_i)
 * Computed OFF-circuit only (wallet + verifier); the circuit sees the result
 * as the public signal issuerKeyHash.
 */
export function poseidonFoldBytes(
  poseidon: Poseidon,
  bytes: Uint8Array,
  domainTag: bigint
): bigint {
  let h = poseidonBig(poseidon, [domainTag, BigInt(bytes.length)]);
  for (let i = 0; i < bytes.length; i += 31) {
    const chunk = bytes.subarray(i, Math.min(i + 31, bytes.length));
    h = poseidonBig(poseidon, [h, fieldFromBytesBE(chunk)]);
  }
  return h;
}

/** issuerKeyHash = PoseidonFold(pk_issuer) with the issuer-key domain tag. */
export function issuerKeyHash(poseidon: Poseidon, pkIssuer: Uint8Array): bigint {
  return poseidonFoldBytes(poseidon, pkIssuer, DOMAIN_ISSUER_KEY);
}

/**
 * credID field packing (Gap 11): the 256-bit SHA3-256 digest does not fit one
 * BN254 field element, so it is carried as two 128-bit big-endian limbs.
 */
export function credIdLimbs(credId: Uint8Array): { hi: bigint; lo: bigint } {
  if (credId.length !== 32) throw new Error("credID must be 32 bytes");
  return {
    hi: fieldFromBytesBE(credId.subarray(0, 16)),
    lo: fieldFromBytesBE(credId.subarray(16, 32)),
  };
}

/** SMT key derivation: smtKey = Poseidon(credIDHi, credIDLo). */
export function smtKeyFromCredId(poseidon: Poseidon, credId: Uint8Array): bigint {
  const { hi, lo } = credIdLimbs(credId);
  return poseidonBig(poseidon, [hi, lo]);
}

/** policyHash = Poseidon(predicateCode, threshold). */
export function policyHash(
  poseidon: Poseidon,
  predicateCode: bigint,
  threshold: bigint
): bigint {
  return poseidonBig(poseidon, [predicateCode, threshold]);
}

/** holderCommit = Poseidon(holderSecret). */
export function holderCommit(poseidon: Poseidon, holderSecret: bigint): bigint {
  return poseidonBig(poseidon, [holderSecret]);
}

/**
 * Verifier-domain separation (V6 §F3):
 *   domainTag = PoseidonFold(utf8(verifierId)) with the verifier domain tag;
 *   stmtCode  = Poseidon(STMT_V1, domainTag)
 * The wallet folds the requesting verifier's identifier into the statement, so
 * a proof generated for verifier A cannot be replayed at verifier B — B's
 * expected stmtCode differs. Works even for stateless verifiers (no nonce
 * registry needed for this property).
 */
export function verifierDomainTag(poseidon: Poseidon, verifierId: string): bigint {
  return poseidonFoldBytes(
    poseidon,
    new TextEncoder().encode(verifierId),
    DOMAIN_VERIFIER_ID
  );
}

export function stmtCodeForDomain(poseidon: Poseidon, domainTag: bigint): bigint {
  return poseidonBig(poseidon, [STMT_V1, domainTag]);
}

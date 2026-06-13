import { canonicalJsonBytes, sha3_256 } from "@pqid/common/hash";
import { didFromPublicKey } from "@pqid/common/did";
import {
  dilithiumKeygen,
  dilithiumSign,
  dilithiumKeygenDpy,
  dilithiumSignDpy,
  type SigKeypair,
} from "@pqid/pqc";

/**
 * Issuer service (Algorithm 2 of the paper):
 *   cred   = {subject, claims, issuer, issuedAt, holderCommit}
 *   credID = SHA3-256( canonicalJson(cred) ‖ pk_issuer )       (32 bytes)
 *   σ      = Dilithium.Sign(I.sk, credID)                       (ML-DSA-44)
 *   VC     = {credential, credID, signature}
 *
 * holderCommit = Poseidon(holderSecret) is supplied by the holder's wallet at
 * issuance time and carried inside the signed credential (holder binding).
 */
export interface Claims {
  [name: string]: string | number;
}

export interface Credential {
  subject: string; // holder DID
  claims: Claims;
  issuer: string; // issuer DID
  issuedAt: string; // ISO-8601 UTC
  holderCommit: string; // Poseidon(holderSecret), decimal field element
  schema: string; // schema id registered in the Schema Registry
}

export interface VerifiableCredential {
  credential: Credential;
  credID: string; // hex, 32 bytes
  signature: string; // hex, ML-DSA-44 signature over credID
}

/**
 * ML-DSA-44 implementation used for issuance. "liboqs" is the default;
 * "dilithium-py" matches the paper's A.5 harness issuance step (portability)
 * and is byte-compatible with liboqs (enforced by tests/interop). Timing
 * tables never include dilithium-py operations.
 */
export type SigImpl = "liboqs" | "dilithium-py";

export interface Issuer {
  did: string;
  keys: SigKeypair;
  impl: SigImpl;
}

export function createIssuer(impl: SigImpl = "liboqs"): Issuer {
  const keys = impl === "dilithium-py" ? dilithiumKeygenDpy() : dilithiumKeygen();
  return { did: didFromPublicKey(keys.publicKey), keys, impl };
}

export function computeCredId(cred: Credential, pkIssuer: Uint8Array): Buffer {
  return sha3_256(canonicalJsonBytes(cred), pkIssuer);
}

export function issueCredential(args: {
  issuer: Issuer;
  subjectDid: string;
  claims: Claims;
  holderCommit: bigint;
  schema?: string;
  issuedAt?: string;
}): VerifiableCredential {
  const cred: Credential = {
    subject: args.subjectDid,
    claims: args.claims,
    issuer: args.issuer.did,
    issuedAt: args.issuedAt ?? new Date().toISOString(),
    holderCommit: args.holderCommit.toString(),
    schema: args.schema ?? "pqid:schema:identity-v1",
  };
  const credId = computeCredId(cred, args.issuer.keys.publicKey);
  const signature =
    args.issuer.impl === "dilithium-py"
      ? dilithiumSignDpy(args.issuer.keys.secretKey, credId)
      : dilithiumSign(args.issuer.keys.secretKey, credId);
  return {
    credential: cred,
    credID: credId.toString("hex"),
    signature: signature.toString("hex"),
  };
}

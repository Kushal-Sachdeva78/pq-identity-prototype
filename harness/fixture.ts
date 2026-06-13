import fs from "node:fs";
import path from "node:path";
import { sha3_256 } from "@pqid/common/hash";
import {
  getPoseidon,
  issuerKeyHash,
  policyHash,
  holderCommit,
  verifierDomainTag,
  stmtCodeForDomain,
  PREDICATE_AGE_GTE,
} from "@pqid/common/encoding";
import { REPO_ROOT } from "@pqid/common/paths";
import { RevocationTree } from "@pqid/revocation";
import { buildCircuitInput, type CircuitInput } from "@pqid/wallet/witness";

/**
 * Deterministic fixture pipeline shared by the ZK bench, the gas measurement,
 * and the determinism test. Uses constant fixtures (no PQC key generation) so
 * runs are reproducible; the full PQC-backed pipeline lives in harness/e2e.ts.
 */
export const FIXTURE_PK_ISSUER = Buffer.alloc(1312, 0xa7);
export const FIXTURE_HOLDER_SECRET = 123456789n;
export const FIXTURE_THRESHOLD = 18n;
export const FIXTURE_AGE = 42n;
export const FIXTURE_NONCE = 424242n;
export const FIXTURE_VERIFIER_ID = "pqid:verifier:demo";

export function fixtureRevokedCredIds(): Buffer[] {
  const revoked = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "fixtures", "revoked-set.json"), "utf8")
  ) as { labels: string[] };
  return revoked.labels.map((label) => sha3_256(Buffer.from(label, "utf8")));
}

export async function buildFixtureTree(): Promise<RevocationTree> {
  const tree = await RevocationTree.create();
  for (const credId of fixtureRevokedCredIds()) await tree.insert(credId);
  return tree;
}

export async function buildFixtureProofInput(
  overrides: { nonce?: bigint } = {}
): Promise<CircuitInput> {
  const poseidon = await getPoseidon();
  const tree = await buildFixtureTree();
  const subjectCredId = sha3_256(Buffer.from("pqid-fixture-subject", "utf8"));
  const nonMembership = await tree.getNonMembershipProof(subjectCredId);
  const domainTag = verifierDomainTag(poseidon, FIXTURE_VERIFIER_ID);
  return buildCircuitInput(
    {
      issuerKeyHash: issuerKeyHash(poseidon, FIXTURE_PK_ISSUER),
      revRoot: tree.root(),
      policyHash: policyHash(poseidon, PREDICATE_AGE_GTE, FIXTURE_THRESHOLD),
      nonce: overrides.nonce ?? FIXTURE_NONCE,
      stmtCode: stmtCodeForDomain(poseidon, domainTag),
    },
    {
      credId: subjectCredId,
      holderSecret: FIXTURE_HOLDER_SECRET,
      holderCommit: holderCommit(poseidon, FIXTURE_HOLDER_SECRET),
      claimAge: FIXTURE_AGE,
      threshold: FIXTURE_THRESHOLD,
      predicateCode: PREDICATE_AGE_GTE,
      domainTag,
      nonMembership,
    }
  );
}

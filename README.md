# PQ-ID Prototype

Reproducible reference prototype for the IEEE Access paper **"A Privacy-Focused,
Post-Quantum-Oriented Digital Identity System Using Blockchain and Zero-Knowledge
Proofs"** (Access-2026-15409).

The prototype exists to produce **real, measured evidence** for the paper's claims
and to make its protocol executable. It optimizes for correctness, reproducibility,
and reviewer-defensibility — not product polish. Every metric is measured at runtime
and written to `results/*.json` with the host CPU, OS build, and toolchain embedded;
nothing is hard-coded or tuned to match the paper. Where measurement and manuscript
disagree, the divergence is reported loudly (see `RESULTS.md` and
`MANUSCRIPT_RECONCILIATION.md`).

## What it demonstrates

A full credential lifecycle on real cryptography:

```
DID registration → credential issuance → off-circuit Dilithium verify →
witness build (depth-32 Merkle non-membership) → Groth16 proof (snarkJS + rapidsnark) →
verifier resolve + equality + verify + nonce → revocation → re-verify rejects
```

plus a benchmark harness that regenerates the paper's **Table IV** (PQC), **Table V**
(Groth16, dual prover on byte-identical inputs), and **Table VI** (centralized baseline)
as measured JSON, and a passing **negative test** (revoked credential ⇒ no accepted proof).

## V6 revision highlights

- **Benchmark discipline (§B):** every timing run is guard-protected (refuses on a contended
  machine), staged on native ext4, executed ≥3× in independent processes with inter-run CV
  flags, and ships its controls (affinity policy + live probe, governor, power source) inside
  the results JSON. The V5 rapidsnark figure (274.59 ms) was a contended-run artifact; the
  controlled campaign is the valid measurement (see RESULTS.md).
- **Cold + amortized prover bases (§C):** rapidsnark measured both as per-proof subprocess wall
  (paper-comparable) and with the zkey parsed once (`groth16_prover_create`); snarkJS mirrored;
  speedups quoted only on identical bases.
- **Circuit v2 (§F3 + §H):** verifier-domain separation (`stmtCode = Poseidon(STMT_V1,
  domainTag)` — cross-verifier replay is rejected cryptographically) and a second policy
  predicate (`age < threshold`), both circuit-enforced. 21,715 constraints / 5 public / 43 private.
- **Soundness audit (§F):** circomspect gate (build-blocking on our template) — 2 findings,
  both the intentional public-input binding squares, triaged with justification.
- **Auto-generated divergence table (§D)** in RESULTS.md, mirrored with reconciliation actions
  into MANUSCRIPT_RECONCILIATION.md; **end-to-end latency budget (§E)** in
  `results/e2e_latency.json`.

## Quick start

```bash
# 1. native toolchain (liboqs, GMP, rapidsnark, python venv) inside WSL2/Linux:
make provision            # or: bash docker/provision-wsl.sh

# 2. toolchains + ptau (pinned) + circuit + zkey (pinned) + Solidity verifier:
make setup

# 3. tests (unit, integration, negative, interop, determinism):
make test

# 4. measured benchmarks -> results/*.json, then regenerate RESULTS.md:
make bench
make tables

# 5. one-command lifecycle demo (incl. post-revocation rejection):
make demo
```

On Windows, run `make` from Git Bash, or use the `npm run …` scripts directly (see
`package.json`). Native pieces are containerized under `docker/` for a clean Linux host.

## Authoritative technical decisions (resolving the paper's gaps)

- **In-circuit hash: Poseidon, not SHA-3.** A single Keccak block is 239,176 R1CS constraints
  (measured), so SHA-3 in-circuit is incompatible with the ~21k budget. The circuit uses
  Poseidon for the depth-32 Merkle tree; `credID = SHA3-256(cred ‖ pk_issuer)` is computed
  off-circuit and its issuer binding enforced by the wallet's Dilithium check + the verifier's
  on-chain `pk_issuer` equality. See `circuits/research/` for the rejected SHA-3 variant `[F]`.
- **Five public signals** `[Poseidon(pk_issuer), revRoot, Poseidon(policy), nonce, stmtCode]`.
- **credID field packing:** 256-bit digest carried as two 128-bit limbs; SMT key =
  `Poseidon(credIDHi, credIDLo)`, identical in the JS tree and the circuit.
- **Holder binding:** `holderCommit = Poseidon(holderSecret)`; the circuit proves knowledge of
  `holderSecret`.
- **Revocation:** depth-32 Poseidon sparse-Merkle tree; non-membership = empty leaf at the key.
- **DID method:** `did:pq:<base58(SHA3-256(pk)[:20])>`.
- **Ledger:** single-node EVM (Anvil) hosting DID/Issuer/Revocation/Schema registries.
  Multi-node BFT is `[F]`.

See `ARCHITECTURE.md` for the full trust-boundary and public-signal specification.

## Trust boundary (Assumption 5)

The issuer Dilithium signature is verified **off-circuit**, by design (in-circuit ML-DSA is
millions of constraints). End-to-end unforgeability therefore assumes an honest wallet that
actually performs the off-circuit check. `harness/malicious_wallet_probe.ts` demonstrates the
gap honestly: a wallet skipping the check produces a proof for a forged credential that the
verifier accepts. Mitigations (in-circuit ML-DSA, TEE attestation) are `[F]`.

## Repository layout

```
pqid-prototype/
├── circuits/            credential_auth.circom (Poseidon) + research/ SHA-3 [F] report
├── setup/               ptau pin, zkey/vkey gen, SHA-256 pins, Solidity export
├── packages/
│   ├── common/          encodings, hashing, did:pq, metadata, stats
│   ├── pqc/             liboqs ML-DSA-44 + ML-KEM-512 bridge + bench + Kyber demo
│   ├── issuer/          VC build + credID + Dilithium sign
│   ├── wallet/          off-circuit checks + witness + dual prover
│   ├── revocation/      depth-32 SMT
│   ├── verifier/        resolve + equality + Groth16.verify + nonce
│   ├── ledger/          EVM registries + did:pq resolver
│   └── baseline/        OAuth2 + ECDSA P-256 + PostgreSQL
├── onchain/             Solidity Groth16 verifier deploy + gas measurement
├── harness/             benches, table generator, e2e, negative, malicious probe
├── cli/                 demo CLI
├── fixtures/            VC schema, revoked-set (8), bench config
├── results/             measured JSON (+ sample/)
├── tests/               unit, integration, negative, interop, determinism
└── docker/              reproducible liboqs + rapidsnark builds + compose
```

## Labels

Every quantitative output is labeled, matching the paper: `[M]` measured, `[S]`
simulated/estimated, `[A]` assumption, `[F]` future work.

## Documents

- `RESULTS.md` — every measured value mapped to its paper table cell, with a Divergences section.
- `ARCHITECTURE.md` — subsystems, data flow, trust boundary, five public signals, Assumption 5.
- `REPRODUCE.md` — exact commands + Docker to regenerate every number; ptau/zkey pin verification.
- `MANUSCRIPT_RECONCILIATION.md` — the precise manuscript edits the prototype implies.

## Guides for reviewers and researchers

Task-focused guides live under [`docs/`](docs/):

- [`docs/SETUP.md`](docs/SETUP.md) — install paths (JS-only, +Anvil, +native toolchain).
- [`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md) — fidelity tiers and the reproducibility contract.
- [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) — what each benchmark measures and where it maps in the paper.
- [`docs/TESTING.md`](docs/TESTING.md) — the test suites, the required negative test, and the Assumption-5 probe.
- [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) — every paper claim/table/figure/algorithm mapped to exact files.
- [`docs/VALIDATION_REPORT.md`](docs/VALIDATION_REPORT.md) — what is reproducible, what cannot be verified in a given environment, and repository readiness.
- [`docs/MISSING_ARTIFACTS.md`](docs/MISSING_ARTIFACTS.md) — paper-referenced artifacts not present, and documentation discrepancies found.

Project-level files: [`CITATION.cff`](CITATION.cff) (how to cite), [`CONTRIBUTING.md`](CONTRIBUTING.md), and [`tools/README.md`](tools/README.md) (obtaining the excluded platform binaries).

## License

MIT — see `LICENSE`.

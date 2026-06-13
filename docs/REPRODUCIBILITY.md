# Reproducibility Guide

This is the high-level map of *what* can be reproduced and *to what fidelity*.
The exact, step-by-step commands live in [`../REPRODUCE.md`](../REPRODUCE.md);
this page orients you and links the pieces together.

## The reproducibility contract

- **No number is hard-coded.** Every measured value is produced at runtime by a
  script and written to `results/*.json` with the host CPU model, OS build, and
  toolchain versions embedded. `RESULTS.md` is generated *from* those JSON files
  by `harness/generate_results.ts` and is never edited by hand.
- **Pinned, verifiable artifacts.** The powers-of-tau, the proving key (zkey),
  and the verifying key (vkey) have their SHA-256 recorded in
  [`../setup/pins.json`](../setup/pins.json) and re-verified on every setup and
  benchmark run; a drift aborts. `tests/determinism.test.ts` re-checks them and
  proves the beacon setup reproduces the pinned zkey byte-for-byte.
- **Like-for-like prover comparison.** snarkJS and rapidsnark consume the
  *byte-identical* zkey + witness (asserted by SHA-256 equality in `proveBoth`),
  which is what makes the speedup a fair comparison.
- **Hardware honesty.** If your hardware differs, your milliseconds will differ.
  The committed results were measured on a 13th-Gen Intel Core i7-1355U (2 P + 8
  E, 15 W ULV) under WSL2. The *scientific* claims are robust to hardware; the
  exact timings are not, and divergences are reported in `RESULTS.md`'s
  auto-generated divergence table.

## Three fidelity tiers

| Tier | What you need | What you can reproduce |
|---|---|---|
| **1 — JS only (any OS)** | `npm ci` | The circuit, determinism, and harness-helper test suites (`tests/circuit.test.ts`, `tests/determinism.test.ts`, `tests/bench_env.test.ts`); the **revoked-credential negative test** (`npm run negative`); and Groth16 witness generation, proving, and verifying with snarkJS — all against the committed, pinned circuit build, zkey, and ptau. |
| **2 — + Anvil (Foundry)** | install Foundry | On-chain Groth16-verifier **gas measurement** (`npm run gas`) using a real proof on a local EVM. |
| **3 — + native Linux toolchain** | WSL2/Docker build of liboqs 0.15.0, rapidsnark v0.0.8, GMP 6.3.0, + PostgreSQL | The PQC timing table (Table V) and rapidsnark proving/thermal characterization (Table VI); the `protocol`, `kyber`, and `ledger_verifier` test suites and `dilithium-py ↔ liboqs` interop; the centralized baseline (Table VII); and the full lifecycle `npm run demo` / `npm run e2e` / Assumption-5 `npm run probe` (these use real ML-DSA-44 keys and/or Anvil). |

Tier 1 reproduces the circuit correctness, determinism, and the required negative
test. Tier 2 adds on-chain gas. Tier 3 reproduces the PQC/ZK timing tables, the
baseline, and the full end-to-end lifecycle. See [`SETUP.md`](SETUP.md) for
installing each tier and [`BENCHMARKS.md`](BENCHMARKS.md) for the measured campaign.

## Where each claim is reproduced

The complete mapping of every abstract claim, table, figure, algorithm, and
appendix number to the exact file(s) that produce or validate it is in
[`TRACEABILITY.md`](TRACEABILITY.md). The honest accounting of what is *not*
reproducible from this repository (and why) is in
[`VALIDATION_REPORT.md`](VALIDATION_REPORT.md) and
[`MISSING_ARTIFACTS.md`](MISSING_ARTIFACTS.md).

## Known pin-documentation note

The committed `setup/pins.json`, `results/zk.json`, `RESULTS.md`, and the
manuscript Appendix A.1 all agree the committed proving key has SHA-256
`63529c2b8a3320ce…` (verified against the on-disk `setup/out/credential_auth_final.zkey`).
The "Pinning and verifying" prose in [`../REPRODUCE.md`](../REPRODUCE.md) cites
an older `2f9216e3…` value and refers to the paper's earlier `22e69c5b…` build;
these are stale strings in that one section and do not affect the pinned
artifact or the determinism check. This is recorded (and left unaltered, to
avoid editing reported values) in [`VALIDATION_REPORT.md`](VALIDATION_REPORT.md).

# REPRODUCE

Exact commands to regenerate every measured number from scratch. Two paths are
supported: **(A)** the host configuration used to produce the committed results
(Windows 11 + WSL2 Ubuntu), and **(B)** a clean Linux host via Docker.

All measured values are written to `results/*.json` with the host CPU model, OS
build, and toolchain versions embedded, then mapped into `RESULTS.md` by
`harness/generate_results.ts`. **No number is hard-coded.** If your hardware
differs, your numbers will differ — that is expected, and `RESULTS.md` records
the measurement host alongside every table.

---

## Pinned versions

| Component | Version |
|---|---|
| Node.js | 22.16.0 |
| snarkJS | 0.7.4 |
| Circom | 2.2.3 |
| circomlib / circomlibjs | 2.0.5 / 0.1.7 |
| rapidsnark | v0.0.8 (commit `81eddf1`) |
| GMP (static, in rapidsnark) | 6.3.0 |
| GCC (native) | 15.x |
| liboqs | 0.15.0 (reference optimized-C; + AVX2 dist build) |
| liboqs-python | matched to 0.15.0 |
| dilithium-py | 1.4.0 (E2E issuance only; excluded from timing tables) |
| Python | 3.11+ |
| Solidity / solc-js | 0.8.28 |
| Foundry (Anvil) / Hardhat | Anvil (Foundry stable) |
| PostgreSQL | 14+ (measured on 18.4) |
| ptau | `powersOfTau28_hez_final_15.ptau` (2^15) |

Forced substitutions for this environment are listed under **Divergences** in
`RESULTS.md` and **Toolchain notes** below.

---

## Path A — Windows 11 + WSL2 (the committed-results configuration)

### A.0 Prerequisites
- Windows 11 with WSL2 Ubuntu installed (`wsl --install`).
- Node.js 22.16.0 on Windows; `circom.exe` 2.2.3 and Foundry `anvil.exe` live under `tools/`
  (the repo includes a download step; see `setup`).

### A.1 Build the native toolchain inside WSL (once)
```powershell
# from the repo root, in PowerShell:
wsl -u root -e bash -c "tr -d '\r' < docker/provision-wsl.sh > /root/provision-wsl.sh && bash /root/provision-wsl.sh"
```
This builds, under `~/pqid-native` (≈ `/root/pqid-native`):
- liboqs 0.15.0 **generic** (AVX2 off — matches the paper's Table IV config) and **avx2** (dist) builds,
- static **GMP 6.3.0**,
- **rapidsnark v0.0.8** (`81eddf1`) with GCC-15 `<cstdint>` patches,
- a Python venv with **liboqs-python** and **dilithium-py 1.4.0**.

Logs and pinned commits are under `~/pqid-native/logs/`.

### A.2 Toolchains + trusted setup + circuit + zkey (pins verified on every run)
```powershell
npm install
npm run setup        # download_ptau -> build_circuit -> groth16_setup -> research_sha3_report
```
- `setup/download_ptau.ts` downloads the ptau and **pins** its SHA-256 in `setup/pins.json`
  (trust-on-first-use; a later mismatch aborts).
- `setup/build_circuit.ts` compiles `credential_auth.circom` with circom 2.2.3 and records the
  **real** constraint/wire/input counts in `circuits/build/circuit_info.json`.
- `setup/groth16_setup.ts` runs a deterministic beacon phase-2 setup and **pins** the zkey +
  vkey SHA-256. The zkey is byte-stable across rebuilds (verified by the determinism test).

### A.3 Tests
```powershell
npm test                          # vitest: circuit, protocol, ledger+verifier, kyber, determinism
# interop (dilithium-py <-> liboqs), inside WSL:
wsl -u root -e bash -c "cd /mnt/c/.../pqid-prototype && OQS_INSTALL_PATH=/root/pqid-native/liboqs-generic /root/pqid-native/venv/bin/python -m pytest tests/interop -q"
```

### A.4 Benchmarks — V6 §B measurement discipline (read before running)

**All published numbers come from `npm run campaign`** (= `make bench`), which runs every
measured artifact **strictly serially on a quiesced machine**:

```powershell
npm run campaign   # circomspect gate -> pqc -> zk -> baseline -> gas -> negative
                   # -> probe -> e2e -> latency budget -> RESULTS.md
```

The §B controls, all enforced/recorded automatically:

1. **Quiesce guard** — every bench calls `assertQuiesced()` (harness/bench_env.ts) and REFUSES
   to start if build tooling (tsc/eslint/vitest/circom/cargo), another prover, surplus node
   processes, >30% Windows CPU load, or WSL loadavg > 1.0 are present. Do not run anything else
   during the campaign. Override only with `PQID_BENCH_FORCE=1` (recorded in the results JSON).
2. **Affinity policy (documented §B2 deviation)** — rapidsnark v0.0.8 is pthread-pool
   MULTI-threaded (verified: 0 OpenMP / 7 pthread symbols), and a live probe embedded in every
   `zk.json` shows 1-vCPU pinning ≈2.7× slower than free scheduling — single-P-core pinning
   would not reproduce the paper's method. Inside the WSL2 VM, vCPU→P/E placement is
   hypervisor-controlled and unconfigurable from the guest. Effective controls: quiesced
   machine + native fs + warm cache + ≥3-run stability, with the probe as recorded evidence.
3. **Native filesystem** — rapidsnark inputs (zkey, witness, prover, amortized harness) are
   staged on WSL-native ext4 (`~/pqid-native/bench/`), SHA-256-verified after copy; never
   `/mnt/c`/9p. Warmup runs warm the cache.
4. **Governor / power** — `cpupower` is unavailable under WSL2 (host-managed frequency);
   recorded as such in `controls.cpuGovernor`. AC-vs-battery state is recorded
   (`controls.powerSource`); benchmark on AC.
5. **≥3 independent invocations** — separate processes per run (Node workers / WSL loops);
   per-run stats + inter-run medians, spread, CV; CV > 10% is flagged `⚠ UNSTABLE`.
6. **Median headline when σ/mean > 0.2** — applies to snarkJS proving (JIT/GC tails); the
   basis is recorded per metric (`headline.basis`).

rapidsnark is measured on two bases (§C): **cold** (per-proof subprocess wall incl. process
start + zkey/wtns I/O — the paper's A.2 method) and **amortized** (zkey loaded+parsed once via
`groth16_prover_create`, prove-only per call — `harness/native/amortized_prover.c`; note:
v0.0.8's `groth16_prover_create_zkey_file` has a use-after-free and must not be used).
snarkJS mirrors both bases (file-based / in-memory buffers). Speedups are only ever quoted
cold/cold or amortized/amortized (§C3).

Smoke-run with lowered N (never for published numbers):
```powershell
$env:PQID_ZK_RUNS=1; $env:PQID_ZK_SNARKJS_N=3; $env:PQID_ZK_RAPIDSNARK_N=5; $env:PQID_ZK_WARMUP=1; npm run bench:zk
```

**Why the V5 rapidsnark number (274.59 ms) diverged from the paper (156.28 ms):** the V5 run
executed concurrently with builds (ESLint/tsc/doc-gen) on this hybrid 2P+8E CPU, contending
the multithreaded prover, and read its inputs over the slow 9p `/mnt/c` mount. The V6
controlled re-measurement under the §B regime is the valid number (see RESULTS.md).

**Thermal protocol (the §C finding).** Under §B controls the dominant residual variable on
this 15 W ULV laptop is package thermal state: truly-cool ≈177 ms, self-heated ≈228 ms,
heat-soaked ≈250–286 ms for the same rapidsnark cold proof (and 981 ms vs 2.1 s for snarkJS).
The campaign measures rapidsnark last (heat-soaked); the §C1 cool-state figure comes from:

```powershell
# after >=10 minutes of idle on the quiesced machine:
npx tsx harness/bench_rapidsnark_cool.ts   # -> results/zk_rapidsnark_cool.json
```

Report both states (RESULTS.md "Thermal-state characterization"). For single-authentication
latency the cool state is representative; for bulk proving the sustained state is.

### A.5 Demo + packaging
```powershell
npm run demo            # register -> issue -> prove -> verify -> revoke -> re-verify(reject)
npx tsx tools/package_supplementary.ts   # -> pqid-prototype-supplementary.zip
```

---

## Path B — clean Linux host via Docker

```bash
# PQC environment (Table IV) + native rapidsnark image:
docker build -f docker/Dockerfile.liboqs   -t pqid/liboqs .
docker build -f docker/Dockerfile.native   -t pqid/rapidsnark .

# bring up Anvil + PostgreSQL + build images:
docker compose -f docker/docker-compose.yml up --build

# PQC bench inside the liboqs image:
docker run --rm -v "$PWD:/work" -w /work pqid/liboqs \
  bash -lc 'OQS_INSTALL_PATH=/opt/liboqs-generic python3 packages/pqc/bench_pqc.py --n 1000 --warmup 5'
```
The native Dockerfile reproduces the rapidsnark ~156 ms-class path on a clean Linux host
(GCC 15, static GMP 6.3.0, rapidsnark `81eddf1`). Point `RAPIDSNARK_PROVER_WSL` (in
`packages/common/src/paths.ts`) at the container/host prover path to run `bench:zk` against it.

---

## Pinning and verifying the ptau and zkey hashes

`setup/pins.json` holds the SHA-256 of the ptau, the final zkey, and the vkey:

```bash
# re-verify on demand (also re-checked inside groth16_setup and bench:zk):
npm run verify-pins
```

`setup/groth16_setup.ts` and `harness/bench_zk.ts` re-read `setup/pins.json` and **abort** if
the ptau or zkey SHA-256 has drifted. To intentionally regenerate (e.g. after a circuit change),
delete the relevant entry from `setup/pins.json` and re-run `npm run setup`; the new hash is
re-pinned and the change is visible in git.

The committed `setup/pins.json` in this repo:
- `powersOfTau28_hez_final_15.ptau` — `3ef2ecc5b75d687048cf2d59195119b42fb07c5af639c5f283d84bfa69829e7f`
- `credential_auth_final.zkey` — `63529c2b8a3320ce352401b3bf89fa0cde4ff3d0c5354e6d5b6f28c83f9101cc`

This is the same proving-key hash reported in the submitted manuscript's Appendix A.1 (V6.6) and
embedded in `results/zk.json` — the committed artifact, the pin, and the paper agree, and you can
verify it yourself with `npm run verify-pins` or `sha256sum setup/out/credential_auth_final.zkey`.
The integrity guarantee is that *both* provers consume the *same* zkey+witness (asserted by SHA-256
equality in `proveBoth`/`bench:zk`), which is what makes the snarkJS↔rapidsnark speedup a
like-for-like comparison.

---

## Toolchain notes (forced substitutions, recorded per the integrity rules)

1. **GCC 15 + GMP 6.3.0** — GMP 6.3.0's configure tests fail under GCC 15's default C23 dialect
   ("long long reliability test"); we pass `CFLAGS="-O2 -fomit-frame-pointer -std=gnu17"`. No
   functional change to GMP.
2. **rapidsnark `<cstdint>`** — rapidsnark v0.0.8 headers assume transitive `<cstdint>`, which
   GCC 15's libstdc++ no longer provides; we prepend `#include <cstdint>` to four headers.
   No functional change.
3. **Measurement OS** — the paper measured liboqs on Windows/MinGW (AVX2 gated off upstream).
   This prototype measures the AVX2-off `generic` build inside WSL2 to match that configuration
   on a reproducible clean-Linux toolchain, and additionally reports the AVX2 `dist` build (the
   paper's `[A]`).
4. **PostgreSQL 18.4** — satisfies the "14+" pin; the exact server version is embedded in
   `results/baseline.json`. Under NAT-mode WSL2 the baseline auto-discovers the distro's eth0 IP.

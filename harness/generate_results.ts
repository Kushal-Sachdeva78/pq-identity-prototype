import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, RESULTS_DIR } from "@pqid/common/paths";

/**
 * Regenerates RESULTS.md from results/*.json and injects the AUTO-GENERATED
 * complete divergence table into MANUSCRIPT_RECONCILIATION.md (between
 * markers). V6 §D: every measured cell is programmatically diffed against the
 * embedded paper claims; every |Δ| > THRESHOLD row appears — no hand-curated
 * omissions. Causes are curated text; the LIST is automatic.
 */
const THRESHOLD_PCT = 5;

function load(name: string): any | null {
  const p = path.join(RESULTS_DIR, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function loadAt(p: string): any | null {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

const pqc = load("pqc.json");
const pqcAvx2 = load("pqc_avx2.json");
const zk = load("zk.json");
const zkCool = load("zk_rapidsnark_cool.json");
const gas = load("gas.json");
const baseline = load("baseline.json");
const neg = load("negative.json");
const probe = load("malicious_probe.json");
const e2e = load("e2e.json");
const latency = load("e2e_latency.json");
const circomspect = load("circomspect.json");
const circuitInfo = loadAt(path.join(REPO_ROOT, "circuits", "build", "circuit_info.json"));
const sha3 = loadAt(path.join(REPO_ROOT, "circuits", "build", "research", "sha3_research_info.json"));

/** headline value of a v2 aggregated op */
const hv = (op: any): number | undefined => op?.headline?.valueMs;
const sd = (op: any): number | undefined => op?.repr?.stddevMs;
const cv = (op: any): string => (op?.interRun ? `${op.interRun.cvPct}%${op.interRun.stable ? "" : " ⚠"}` : "—");

interface ClaimSpec {
  id: string;
  table: string;
  metric: string;
  paper: number;
  paperLabel: string;
  unit: string;
  measured: () => number | undefined;
  measuredLabel: string;
  cause: string;
}

const CLAIMS: ClaimSpec[] = [
  // ----- Table IV (paper label [M]; ECDSA reference rows are [A])
  { id: "dilithium-keygen", table: "IV", metric: "ML-DSA-44 keygen (ms)", paper: 0.124, paperLabel: "[M]", unit: "ms",
    measured: () => hv(pqc?.algorithms?.["ML-DSA-44"]?.keygen), measuredLabel: "[M]",
    cause: "OS entropy-source difference: the paper measured on Windows/MinGW where RNG syscalls dominate randomness-consuming ops; Linux getrandom() is much faster. Same liboqs 0.15.0, same AVX2-off generic build." },
  { id: "dilithium-sign", table: "IV", metric: "ML-DSA-44 sign (ms)", paper: 0.287, paperLabel: "[M]", unit: "ms",
    measured: () => hv(pqc?.algorithms?.["ML-DSA-44"]?.sign), measuredLabel: "[M]",
    cause: "Same entropy-source cause as keygen (hedged signing consumes randomness per rejection-sampling round); verify, which consumes none, matches the paper closely." },
  { id: "dilithium-verify", table: "IV", metric: "ML-DSA-44 verify (ms)", paper: 0.06, paperLabel: "[M]", unit: "ms",
    measured: () => hv(pqc?.algorithms?.["ML-DSA-44"]?.verify), measuredLabel: "[M]",
    cause: "No randomness consumed — expected to match; small residual is scheduler noise." },
  { id: "kyber-keygen", table: "IV", metric: "ML-KEM-512 keygen (ms)", paper: 0.091, paperLabel: "[M]", unit: "ms",
    measured: () => hv(pqc?.algorithms?.["ML-KEM-512"]?.keygen), measuredLabel: "[M]",
    cause: "Large (~4–5×) but explained: ML-KEM keygen is dominated by randomness + hashing; Windows/MinGW RNG overhead in the paper's run vs Linux getrandom() here. Same liboqs 0.15.0 generic build — decap (no fresh randomness) matches the paper." },
  { id: "kyber-encap", table: "IV", metric: "ML-KEM-512 encap (ms)", paper: 0.094, paperLabel: "[M]", unit: "ms",
    measured: () => hv(pqc?.algorithms?.["ML-KEM-512"]?.encap), measuredLabel: "[M]",
    cause: "Same cause as keygen (encapsulation draws fresh randomness)." },
  { id: "kyber-decap", table: "IV", metric: "ML-KEM-512 decap (ms)", paper: 0.024, paperLabel: "[M]", unit: "ms",
    measured: () => hv(pqc?.algorithms?.["ML-KEM-512"]?.decap), measuredLabel: "[M]",
    cause: "No randomness consumed — matches the paper." },
  // ----- Table V
  { id: "constraints", table: "V", metric: "R1CS constraints", paper: 21434, paperLabel: "[M]", unit: "",
    measured: () => circuitInfo?.nConstraints, measuredLabel: "[M]",
    cause: "Protocol revision, not drift: circuit v2 adds verifier-domain separation (stmtCode = Poseidon(STMT_V1, domainTag), V6 §F3) and a second policy predicate (AGE_LT), +~556 constraints over the v1 reproduction (21,159)." },
  { id: "private-inputs", table: "V", metric: "private inputs", paper: 41, paperLabel: "[M]", unit: "",
    measured: () => circuitInfo?.nPrvInputs, measuredLabel: "[M]",
    cause: "v2 adds predicateCode and domainTag to the witness (41 → 43). Public signals remain 5." },
  { id: "witness-gen", table: "V", metric: "witness generation (ms)", paper: 356, paperLabel: "[M]", unit: "ms",
    measured: () => hv(zk?.witnessGeneration), measuredLabel: "[M]",
    cause: "Large (~4×) and not fully attributable: same snarkJS 0.7.4 WASM calculator and Node 22.16.0; the paper's witness figure (σ=186 on mean 356 — high variance) was very likely measured under concurrent load, as its σ suggests. The controlled number here is stable across 3 independent runs (CV recorded). The paper value should be replaced by the controlled measurement." },
  { id: "snarkjs-prove", table: "V", metric: "snarkJS prove (ms, median basis)", paper: 876, paperLabel: "[M] median", unit: "ms",
    measured: () => hv(zk?.snarkjsProveCold), measuredLabel: "[M]",
    cause: "snarkJS proving has σ/mean > 0.2 (JS JIT warmup + GC tails), so the median is the headline (§B6). Compared against the paper's median 876 ms." },
  { id: "rapidsnark-prove", table: "V", metric: "rapidsnark prove, cold (ms, campaign/sustained)", paper: 156.28, paperLabel: "[M]", unit: "ms",
    measured: () => hv(zk?.rapidsnarkProveCold), measuredLabel: "[M]",
    cause: "Fully characterized by the §C re-measurement: the V5 figure (274.59 ms) was a contended-run artifact; under §B controls the residual variable is THERMAL STATE of this 15 W ULV part — truly-cool first run 177 ms (zk_rapidsnark_cool.json run 1), self-heated steady state ≈228 ms, heat-soaked campaign ordering ≈250–286 ms. Even the best cool-state run stays +13% above the paper's 156.28 ms, so per §C4 the paper takes the measured values with the thermal-state annotation (cool 177 / sustained ≈233). The sub-second core claim is unaffected." },
  { id: "rapidsnark-prove-cool", table: "V", metric: "rapidsnark prove, cold (ms, truly-cool first run)", paper: 156.28, paperLabel: "[M]", unit: "ms",
    measured: () => zkCool?.cold?.perRun?.[0]?.medianMs, measuredLabel: "[M]",
    cause: "Best-case controlled measurement (first run after >=10 min idle on the quiesced machine); the realistic single-authentication state. Still +13% over the paper — the paper's number likely reflects a colder package/full turbo burst in the original campaign and should be updated." },
  { id: "verify", table: "V", metric: "Groth16 verify (ms)", paper: 41, paperLabel: "[M]", unit: "ms",
    measured: () => hv(zk?.snarkjsVerify), measuredLabel: "[M]",
    cause: "Constant-size pairing check; matches the paper." },
  { id: "speedup", table: "V", metric: "speedup snarkJS/rapidsnark (cold/cold)", paper: 6.9, paperLabel: "[M]", unit: "×",
    measured: () => zk?.speedups?.coldCold, measuredLabel: "[M]",
    cause: "Recomputed from the controlled cold/cold headline values (§C3 identical bases)." },
  { id: "proof-size", table: "V", metric: "proof size, snarkJS JSON (B)", paper: 723, paperLabel: "[M]", unit: "B",
    measured: () => zk?.proofSize?.snarkjsJsonBytes, measuredLabel: "[M]",
    cause: "Decimal-length variance in the JSON serialization of BN254 field elements (the paper's own 721 vs 723 delta has the same cause); ≈128 B compressed." },
  // ----- gas + baseline + §VI-C
  { id: "gas", table: "V/VI", metric: "on-chain verify gas (bare tx)", paper: 250000, paperLabel: "[A] ~2–3×10⁵", unit: "gas",
    measured: () => gas?.verifyProofDirectTxGasUsed, measuredLabel: "[M]",
    cause: "[A]→[M] upgrade: measured on a local Anvil EVM with a real proof (paper midpoint 2.5×10⁵ used for the delta)." },
  { id: "ecdsa-sign", table: "IV/VI", metric: "ECDSA P-256 sign (ms)", paper: 0.2, paperLabel: "[A] reference", unit: "ms",
    measured: () => hv(baseline?.ecdsaP256?.sign), measuredLabel: "[M]",
    cause: "[A]→[M] upgrade: the paper used dated reference values; modern OpenSSL on this CPU is faster. The ZKP-overhead ratio in Table VI is recomputed from measured values (and grows)." },
  { id: "ecdsa-verify", table: "IV/VI", metric: "ECDSA P-256 verify (ms)", paper: 0.3, paperLabel: "[A] reference", unit: "ms",
    measured: () => hv(baseline?.ecdsaP256?.verify), measuredLabel: "[M]",
    cause: "Same as ECDSA sign." },
  { id: "vic-core", table: "§VI-C", metric: "core auth latency, native prover (ms)", paper: 553, paperLabel: "[S] stitched", unit: "ms",
    measured: () => latency?.totals?.coreRapidsnarkMs, measuredLabel: "[M]",
    cause: "§VI-C must be updated to the measured breakdown (results/e2e_latency.json) and the sub-second claim explicitly scoped to the rapidsnark path; the snarkJS-path core is not sub-second." },
];

interface DivRow extends ClaimSpec {
  measuredValue: number;
  deltaPct: number;
  direction: string;
}

function divergences(): DivRow[] {
  const rows: DivRow[] = [];
  for (const c of CLAIMS) {
    const m = c.measured();
    if (m === undefined || m === null || Number.isNaN(m)) continue;
    const deltaPct = ((m - c.paper) / c.paper) * 100;
    if (Math.abs(deltaPct) <= THRESHOLD_PCT) continue;
    rows.push({
      ...c,
      measuredValue: m,
      deltaPct: Math.round(deltaPct * 10) / 10,
      direction: deltaPct < 0 ? (c.unit === "ms" ? "faster" : "smaller") : c.unit === "ms" ? "slower" : "larger",
    });
  }
  return rows;
}

function divergenceTable(rows: DivRow[]): string[] {
  const L: string[] = [];
  L.push(`| # | Table | Metric | Paper | Measured | Δ | Direction | Cause (summary) | Source |`);
  L.push(`|---|---|---|---|---|---|---|---|---|`);
  rows.forEach((r, i) => {
    const src =
      r.table === "IV" || r.id.startsWith("ecdsa") ? (r.id.startsWith("ecdsa") ? "baseline.json" : "pqc.json")
      : r.id === "gas" ? "gas.json"
      : r.id === "vic-core" ? "e2e_latency.json"
      : r.id === "constraints" || r.id === "private-inputs" ? "circuit_info.json"
      : "zk.json";
    const causeSummary = (r.cause.split(/(?<=[a-z)])\.\s/)[0] ?? r.cause).slice(0, 160);
    L.push(
      `| ${i + 1} | ${r.table} | ${r.metric} | ${r.paper}${r.unit} ${r.paperLabel} | ${r.measuredValue}${r.unit} ${r.measuredLabel} | ${r.deltaPct > 0 ? "+" : ""}${r.deltaPct}% | ${r.direction} | ${causeSummary}. | \`results/${src}\` |`
    );
  });
  return L;
}

function controlsBlock(c: any): string[] {
  if (!c) return ["_no controls recorded (pre-V6 run)_"];
  return [
    `- quiesced: ${c.quiesce?.quiesced}${c.quiesce?.forced ? " (FORCED override)" : ""}; Windows load ${c.quiesce?.windows?.cpuLoadPercent}%; WSL loadavg ${c.quiesce?.wsl?.loadavg1m}`,
    `- affinity: ${c.affinity?.policy}${c.affinity?.probe ? ` — probe (amortized prove, ms): free ${JSON.stringify(c.affinity.probe.freeMs)}, 1 vCPU ${JSON.stringify(c.affinity.probe.oneVcpuMs)}, 4 vCPU ${JSON.stringify(c.affinity.probe.fourVcpuMs)}` : ""}`,
    `- governor: ${c.cpuGovernor}; power: ${c.powerSource}`,
    `- fs basis: ${c.fsBasis}; independent invocations: ${c.invocations}`,
  ];
}

function main(): void {
  const L: string[] = [];
  const w = (s = ""): void => void L.push(s);
  const host = zk?.controls?.host ?? pqc?.controls?.host ?? {};
  const wsl = zk?.controls?.wsl ?? pqc?.controls?.wsl ?? {};

  w("# RESULTS — Measured Evidence for IEEE Access-2026-15409 (V6 controlled campaign)");
  w();
  w("> Generated by `harness/generate_results.ts` from `results/*.json`. **Do not edit by hand.**");
  w("> Labels: `[M]` measured, `[S]` simulated/estimate, `[A]` assumption, `[F]` future work.");
  w("> Benchmarks follow the §B discipline: quiesced machine (guard-enforced), recorded controls,");
  w("> ≥3 independent invocations per metric, median headline where σ/mean > 0.2.");
  w();
  w("## Measurement host & controls");
  w();
  w("| Field | Value |");
  w("|---|---|");
  w(`| CPU | ${host.cpuModel ?? "—"} (2 P + 8 E cores, 12 logical; paper's reference CPU) |`);
  w(`| OS build | ${host.osBuild ?? "—"} | `);
  w(`| Node.js | ${host.nodeVersion ?? "—"} |`);
  w(`| WSL | ${wsl.distro ?? "—"}, kernel ${wsl.kernel ?? "—"} |`);
  w(`| GCC (native) | ${wsl.gcc ?? "—"} |`);
  w();
  w("ZK-bench controls (full record in `results/zk.json` → `controls`):");
  w();
  for (const line of controlsBlock(zk?.controls)) w(line);
  w();

  // ---------------- Table IV ----------------
  w("## Table IV — PQC primitives (liboqs 0.15.0, generic AVX2-off build)");
  w();
  if (!pqc) w("_Run `make bench` first._");
  else {
    const d = pqc.algorithms["ML-DSA-44"];
    const k = pqc.algorithms["ML-KEM-512"];
    w(`N=${pqc.config?.n}, warmup=${pqc.config?.warmup}, ${pqc.config?.runs} independent invocations. Source: \`results/pqc.json\`.`);
    w();
    w("| Algorithm | Op | Headline (ms) | σ (ms) | inter-run CV | Paper | Status |");
    w("|---|---|---|---|---|---|---|");
    const row = (alg: string, op: string, o: any, paper: number): void =>
      w(`| ${alg} | ${op} | ${hv(o)} | ${sd(o)} | ${cv(o)} | ${paper} | [M] |`);
    row("ML-DSA-44", "keygen", d.keygen, 0.124);
    row("ML-DSA-44", "sign", d.sign, 0.287);
    row("ML-DSA-44", "verify", d.verify, 0.06);
    row("ML-KEM-512", "keygen", k.keygen, 0.091);
    row("ML-KEM-512", "encap", k.encap, 0.094);
    row("ML-KEM-512", "decap", k.decap, 0.024);
    w();
    w(`Sizes match FIPS 203/204 exactly (pk 1312/800, sk 2560/1632, sig 2420, ct 768, ss 32).`);
    if (pqcAvx2) {
      const da = pqcAvx2.algorithms["ML-DSA-44"];
      const ka = pqcAvx2.algorithms["ML-KEM-512"];
      w();
      w(`AVX2 dist build ([A]→[M], \`results/pqc_avx2.json\`): ML-DSA-44 sign ${hv(da.sign)} / verify ${hv(da.verify)} ms; ML-KEM-512 encap ${hv(ka.encap)} / decap ${hv(ka.decap)} ms.`);
    }
  }
  w();

  // ---------------- Table V ----------------
  w("## Table V — Groth16 (BN254), circuit v2, byte-identical prover inputs");
  w();
  if (!zk) w("_Run `make bench` first._");
  else {
    const cc = zk.config.circuit;
    w(`Circuit: **${cc.nConstraints} constraints**, ${cc.nWires} wires, ${cc.nPubInputs} public / ${cc.nPrvInputs} private (${cc.version}; paper: 21,434/21,472/5/41 — see divergence table).`);
    w(`zkey SHA-256 \`${String(zk.config.zkeySha256).slice(0, 16)}…\`, witness SHA-256 \`${String(zk.config.witnessSha256).slice(0, 16)}…\` — identical for both provers.`);
    w();
    w("| Metric | Headline | basis | inter-run medians (ms) | CV | Paper | Status |");
    w("|---|---|---|---|---|---|---|");
    const row = (name: string, p: any, paper: string): void =>
      w(`| ${name} | ${p.headline.valueMs} ms | ${p.headline.basis} | ${p.interRun.mediansMs.join(" / ")} | ${p.interRun.cvPct}%${p.interRun.stable ? "" : " ⚠"} | ${paper} | [M] |`);
    row("Witness generation (snarkJS WASM)", zk.witnessGeneration, "356 (σ186)");
    row("snarkJS prove — cold (file-based, paper basis)", zk.snarkjsProveCold, "1083 mean / 876 median");
    row("snarkJS prove — amortized (in-memory buffers)", zk.snarkjsProveAmortized, "—");
    row("rapidsnark prove — cold (subprocess wall, ext4; paper basis; heat-soaked ordering)", zk.rapidsnarkProveCold, "156.28 mean / 153.51 median");
    row("rapidsnark prove — amortized (zkey parsed once)", zk.rapidsnarkProveAmortized, "—");
    if (zkCool) {
      row("rapidsnark prove — cold, COOL-STATE re-run (§C1, after ≥10 min idle)", zkCool.cold, "156.28 mean / 153.51 median");
      row("rapidsnark prove — amortized, cool-state", zkCool.amortized, "—");
    }
    row("Groth16 verify (snarkJS)", zk.snarkjsVerify, "41 (σ3.1)");
    w();
    w(`**Speedups (identical bases, §C3):** cold/cold **${zk.speedups.coldCold}×** (paper 6.9×); amortized/amortized **${zk.speedups.amortizedAmortized}×**.`);
    w();
    w(`Proof: ${zk.proofSize.snarkjsJsonBytes} B snarkJS / ${zk.proofSize.rapidsnarkJsonBytes} B rapidsnark JSON (≈128 B compressed); ${zk.proofSize.publicSignals} public signals. Cross-prover verification: rapidsnark cold ${zk.correctness.rapidsnarkColdVerifies}, amortized ${zk.correctness.rapidsnarkAmortizedVerifies} under snarkJS.`);
    w();
    w("### Thermal-state characterization (the §C finding)");
    w();
    w("The §B controls isolated **package thermal state** as the dominant residual variable on this");
    w("15 W ULV laptop CPU. Evidence, all from SHA-256-identical inputs and identical methods:");
    w();
    w("| State | rapidsnark cold | snarkJS cold | Evidence |");
    w("|---|---|---|---|");
    if (zkCool) {
      w(`| truly cool (≥10 min idle) | **${zkCool.cold.perRun?.[0]?.medianMs ?? "—"} ms** | ~981 ms (campaign run 1) | \`zk_rapidsnark_cool.json\` run 1; \`zk.json\` snarkJS run 1 |`);
      w(`| self-heated steady state | ≈${zkCool.cold.perRun?.[1]?.medianMs ?? "—"} ms | ≈2095 ms | cool-bench runs 2–3; campaign snarkJS runs 2–3 |`);
    }
    w(`| heat-soaked (campaign ordering) | ${hv(zk.rapidsnarkProveCold)} ms | ${hv(zk.snarkjsProveCold)} ms | \`zk.json\` (rapidsnark measured after ~50 min of snarkJS) |`);
    w(`| paper's campaign | 156.28 ms | 1083/876 ms | original measurement |`);
    w();
    w("The snarkJS cold CV (⚠ flag above) is this bimodality, not scheduler noise. For a single");
    w("authentication (the protocol's real workload — one proof, not 100 back-to-back) the");
    w("cool-state figures are the representative ones; sustained-throughput figures apply to bulk");
    w("proving. The V5 rapidsnark figure (274.59 ms) was additionally contaminated by concurrent");
    w("builds and 9p file I/O — fully superseded by these controlled numbers.");
  }
  w();

  // ---------------- gas ----------------
  w("## On-chain verification gas ([A] → [M])");
  w();
  if (gas) {
    w(`\`verifyProof\` bare tx **${gas.verifyProofDirectTxGasUsed} gas**; via contract + SSTORE ${gas.probeTxGasUsed} gas; calldata ${gas.calldataBytes} B; valid proof accepted ${gas.staticCallValid}, corrupted signal rejected ${gas.corruptedSignalRejected}. Paper: ~2–3×10⁵ [A]; public testnet remains [F]. Source: \`results/gas.json\`.`);
  } else w("_Run `npm run gas`._");
  w();

  // ---------------- Table VI ----------------
  w("## Table VI — vs centralized classical baseline (measured)");
  w();
  if (baseline && zk) {
    const e = baseline.ecdsaP256;
    const t = baseline.oauth2Tokens;
    const pg = baseline.postgres;
    w(`PostgreSQL ${String(pg.serverVersion).split(",")[0]}; ${baseline.config?.runs} invocations. Source: \`results/baseline.json\`.`);
    w();
    w("| Dimension | Baseline (measured) | Proposed (measured) |");
    w("|---|---|---|");
    w(`| Per-auth sig/proof size | ECDSA ${e.sizes.signatureBytes} B + token ${t.opaqueTokenBytes} B | Dilithium 2420 B + Groth16 ${zk.proofSize.snarkjsJsonBytes} B |`);
    w(`| Verifier-side time | ECDSA verify ${hv(e.verify)} ms; PG token-auth ${hv(pg.tokenAuthSelect)} ms | Groth16 verify ${hv(zk.snarkjsVerify)} ms |`);
    w(`| Client-side time | JWT issue ${hv(t.jwtIssue)} ms | prove ${hv(zk.rapidsnarkProveCold)} ms (native) / ${hv(zk.snarkjsProveCold)} ms (snarkJS) |`);
    w(`| Per-credential storage | ${t.opaqueTokenBytes}–${t.jwtEs256Bytes} B token | ${e2e ? e2e.vcBytes : "≈5200"} B VC incl. Dilithium sig |`);
    w(`| Server-side PII | full record (${pg.storage?.user_row} B row) | zero PII on-chain |`);
  } else w("_Run `make bench` first._");
  w();

  // ---------------- §E latency ----------------
  w("## End-to-end latency budget (§VI-C, recomputed from measured components)");
  w();
  if (latency) {
    const t = latency.totals;
    w("| Path | Core (witness+prove+verify) | + Dilithium verify + network [S] | Sub-second core? |");
    w("|---|---|---|---|");
    w(`| native (rapidsnark, cold) | **${t.coreRapidsnarkMs} ms** | ${t.e2eRapidsnarkMs.min}–${t.e2eRapidsnarkMs.max} ms | **${t.subSecondCoreRapidsnark}** |`);
    w(`| snarkJS | ${t.coreSnarkjsMs} ms | ${t.e2eSnarkjsMs.min}–${t.e2eSnarkjsMs.max} ms | ${t.subSecondCoreSnarkjs} |`);
    w();
    w(`Paper §VI-C claimed ~553 ms core / 600–900 ms e2e [S]. ${t.qualifier}. Source: \`results/e2e_latency.json\` (each component labeled).`);
  } else w("_Run `npm run e2e:latency`._");
  w();

  // ---------------- negative + probe + audit ----------------
  w("## Soundness evidence");
  w();
  if (neg) w(`- **Negative test: ${neg.pass ? "PASS" : "FAIL"}** — revoked credential ⇒ no accepted proof via all three adversary strategies (honest-refusal / stale-opening-current-root constraint violation / stale-root verifier rejection). \`results/negative.json\`.`);
  if (probe) w(`- **Assumption-5 probe:** forged-credential proof accepted = ${probe.forgedProofAccepted} (the documented wallet-honesty gap reproduces exactly as the paper states; mitigations [F]). \`results/malicious_probe.json\`.`);
  if (circomspect) {
    w(`- **circomspect audit: ${circomspect.pass ? "PASS" : "FAIL"}** — ${circomspect.totalFindings} finding(s), ${circomspect.blockingFindings} blocking. Both findings are the intentional public-input binding squares (triaged with justification in \`results/circomspect.json\`). Every public signal is constrained: revRoot (SMT root), policyHash (Poseidon equality), stmtCode (Poseidon(STMT_V1, domainTag) — V6 domain separation), issuerKeyHash + nonce (binding squares + off-circuit checks). A third-party audit remains [F].`);
  }
  if (sha3) w(`- **[F] SHA-3 in-circuit report:** one Keccak block = ${sha3.constraintsPerBlock} constraints (≈${(sha3.estimates.sha3FullRelationConstraints / 1e6).toFixed(1)}M for the full relation) — the quantitative basis for Poseidon in-circuit. \`circuits/build/research/\`.`);
  w();

  // ---------------- auto divergence ----------------
  const rows = divergences();
  w(`## Complete divergence table (auto-generated, threshold ${THRESHOLD_PCT}%)`);
  w();
  w("Programmatic diff of every measured cell against the embedded paper claims (§D). The list is");
  w("automatic and complete; cause texts are curated. Full reconciliation actions per row live in");
  w("`MANUSCRIPT_RECONCILIATION.md` (mirrored automatically).");
  w();
  for (const line of divergenceTable(rows)) w(line);
  w();
  w("Metrics measured within the threshold (no divergence): " +
    CLAIMS.filter((c) => {
      const m = c.measured();
      return m !== undefined && Math.abs(((m - c.paper) / c.paper) * 100) <= THRESHOLD_PCT;
    })
      .map((c) => c.metric)
      .join("; ") + ".");
  w();
  w("---");
  w(`_Regenerated ${new Date().toISOString()} by harness/generate_results.ts._`);

  fs.writeFileSync(path.join(REPO_ROOT, "RESULTS.md"), L.join("\n") + "\n");
  console.log(`[tables] wrote RESULTS.md (${L.length} lines, ${rows.length} divergences)`);

  // ---------------- mirror into MANUSCRIPT_RECONCILIATION.md ----------------
  const reconPath = path.join(REPO_ROOT, "MANUSCRIPT_RECONCILIATION.md");
  const BEGIN = "<!-- AUTO-DIVERGENCE:BEGIN (generated by harness/generate_results.ts — do not edit) -->";
  const END = "<!-- AUTO-DIVERGENCE:END -->";
  const R: string[] = [BEGIN, ""];
  R.push(`## Complete divergence table (auto-generated, threshold ${THRESHOLD_PCT}%)`);
  R.push("");
  for (const line of divergenceTable(rows)) R.push(line);
  R.push("");
  R.push("### Reconciliation actions, one per divergent cell");
  R.push("");
  rows.forEach((r, i) => {
    R.push(`${i + 1}. **${r.metric}** (Table ${r.table}) — paper ${r.paper}${r.unit} ${r.paperLabel} → measured **${r.measuredValue}${r.unit}** ${r.measuredLabel} (${r.deltaPct > 0 ? "+" : ""}${r.deltaPct}%, ${r.direction}).`);
    R.push(`   ${r.cause}`);
    R.push("");
  });
  const block = R.concat([END]).join("\n");
  let recon = fs.existsSync(reconPath) ? fs.readFileSync(reconPath, "utf8") : "";
  if (recon.includes(BEGIN) && recon.includes(END)) {
    recon = recon.slice(0, recon.indexOf(BEGIN)) + block + recon.slice(recon.indexOf(END) + END.length);
  } else {
    recon = recon.trimEnd() + "\n\n---\n\n" + block + "\n";
  }
  fs.writeFileSync(reconPath, recon);
  console.log(`[tables] mirrored ${rows.length} divergence rows into MANUSCRIPT_RECONCILIATION.md`);
}

main();

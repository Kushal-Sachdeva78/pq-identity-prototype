# Manuscript Reconciliation Note

Precise edits the prototype implies for *A Privacy-Focused, Post-Quantum-Oriented
Digital Identity System Using Blockchain and Zero-Knowledge Proofs*
(Access-2026-15409). Per the integrity rules, where the manuscript and the
running code disagree, **the manuscript is reconciled to the code** — not the
reverse. Every claim below is backed by a `results/*.json` line (see `RESULTS.md`).

---

## 1. Relation-R hashing wording (§III-B.4a, §III-B.5, Appendix A.1) — REQUIRED

**Current text:** relation R proves `credID = SHA3-256(cred ‖ pk_issuer)` in-circuit, with
SHA-3-based Merkle non-membership at depth 32.

**Problem:** measured — one Keccak sponge block is **239,176 R1CS constraints**
(`circuits/research/sha3_incircuit.circom`), so the `credID` binding plus a depth-32 SHA-3
Merkle path exceeds ten million constraints, irreconcilable with the reported ~21k.

**Edit:** state that the in-circuit Merkle accumulator uses **Poseidon**, and that the SHA-3
`credID` binding is an **off-circuit** check established by (a) the wallet's Dilithium
verification and (b) the verifier's on-chain `pk_issuer` equality — *not* an in-circuit
constraint. Suggested relation-R wording:

> The circuit proves, over public inputs `(issuerKeyHash, revRoot, policyHash, nonce, stmtCode)`
> and a private witness `(credIDHi, credIDLo, holderSecret, holderCommit, claimAge, threshold,
> non-membership opening)`, that: (1) `Poseidon(credIDHi, credIDLo)` is a non-member of the
> depth-32 Poseidon sparse-Merkle tree rooted at `revRoot`; (2) `Poseidon(holderSecret) ==
> holderCommit`; (3) `claimAge ≥ threshold` with `threshold` bound to `policyHash`; and (4)
> `stmtCode` is the v1 statement code. The SHA-3 binding `credID = SHA3-256(cred ‖ pk_issuer)`
> is verified off-circuit (wallet Dilithium check + verifier on-chain `pk_issuer` equality).

---

## 2. Public-signal specification (§III-B.4a, Algorithm 3) — REQUIRED

**Current text:** prose lists five protocol inputs `(pk_issuer, revRoot, H(policy), nonce, stmt)`;
Algorithm 3's `pub` lists only four (omits `stmt`); `pk_issuer` is a 1,312-byte key.

**Edit:** specify the five Groth16 public signals as field elements, in order:

```
[ issuerKeyHash = Poseidon-fold(pk_issuer), revRoot,
  policyHash = Poseidon(predicateCode, threshold), nonce,
  stmtCode = Poseidon(STMT_V1, domainTag(verifierId)) ]
```

Add `stmt`/`stmtCode` to Algorithm 3's `pub` (reconciling the 4-vs-5 discrepancy), and note
that `pk_issuer` enters as its Poseidon fold while the verifier resolves the full key on-chain
and checks `Poseidon(pk_issuer) == signal[0]`. Document the encodings: `claims.age` uint32
range-checked; `policy = (predicateCode ∈ {age≥t, age<t}, threshold)` pinned by `policyHash`;
`stmtCode` binds the statement version AND the requesting verifier's identity
(**verifier-domain separation**, V6 §F3 — a proof for verifier A is rejected by verifier B).
The nonce is **verifier-chosen**, sent in the request, and single-use.

---

## 3. Constraint count and witness interface (§VI-B, Table V, Appendix A.1) — REQUIRED

**Current text:** 21,434 R1CS constraints; 21,472 wires; 5 public; 41 private.

**Measured (`circuits/build/circuit_info.json`):** the v1 reproduction of the paper's exact
interface measured 21,159 constraints / 41 private inputs. The **v2 protocol revision**
(verifier-domain separation per V6 §F3 + a second policy predicate) measures **21,715
constraints / 21,745 wires / 5 public / 43 private** (`predicateCode`, `domainTag` added).
Update the paper to the v2 figures and describe both v2 additions, or keep v1 figures with the
21,159 measured count — either way the published number must be the measured one.

---

## 4. Proof size 721 vs 723 B (§VI-B, Table V, Appendix A.5) — MINOR

**Current text:** harness reports 721 B; benchmarks report 723 B.

**Edit:** standardize on the snarkJS JSON serialization size reported in `results/zk.json`
(see Table V), and explain the 721/723 delta as decimal-length variance in the JSON encoding of
the BN254 field elements; ≈128 B is the compressed three-group-element size. Both provers'
serialized sizes are reported.

---

## 5. On-chain gas `[A]` → `[M]` (§VI-B, Table V/VI, Appendix A.3) — UPGRADE

**Current text:** "~2–3×10⁵ gas [A]" (analytical; no transaction).

**Edit:** replace with the **measured** gas from `results/gas.json` — the snarkJS-exported
`Groth16Verifier` deployed to a local EVM, with a real proof: bare `verifyProof` transaction and
a via-contract probe (numbers in `RESULTS.md`). Keep the public-testnet measurement as `[F]`.

---

## 6. ECDSA / PostgreSQL baseline `[A]` → `[M]` (Table IV/VI, §VI-D) — UPGRADE

**Current text:** ECDSA P-256 and the centralized baseline are reference/analytical `[A]`.

**Edit:** mark Table VI's baseline as **measured** from `results/baseline.json` (ECDSA P-256
sign/verify, JWT/opaque token sizes, PostgreSQL insert + token-auth select latency). Note that
ECDSA P-256 on this host measures *faster* than the paper's 0.2/0.3 ms reference — the
qualitative ordering (Groth16 verify ≫ ECDSA verify) is unchanged and the ratio is recomputed
from the measured values.

---

## 7. §VI-C end-to-end latency budget — REQUIRED (V6 §E3)

**Current text:** core round trip ≈ 553 ms (356 witness + 156 rapidsnark + 41 verify), e2e
~0.6–0.9 s `[S]`.

**Edit:** replace the core budget with the measured breakdown from `results/e2e_latency.json`
(see RESULTS.md "End-to-end latency budget"), keep the network components as `[S]`, and scope
the sub-second claim **explicitly to the native (rapidsnark) prover path** — the snarkJS path
is not sub-second and must always carry the rapidsnark qualifier.

## 8. Measurement environment note (§VI-A, Appendix A.4) — CLARIFY

**Edit:** state that the reproducible build measures the liboqs **generic (AVX2-off)** build
inside WSL2 Ubuntu to match the paper's Windows/MinGW configuration, and additionally reports
the AVX2 `dist` build — which makes the paper's "an AVX2 Linux build would be faster `[A]`"
a measured `[M]` figure (see `results/pqc_avx2.json`).

---

## 9. Items that remain exactly as the manuscript states (no edit)

- The two-phase verification split and **Assumption 5** (wallet honesty) are implemented and
  demonstrated faithfully, including the malicious-wallet gap (`results/malicious_probe.json`).
  No softening of the assumption is warranted.
- The revocation negative test passes (`results/negative.json`): a revoked credential yields no
  accepted proof.
- ML-DSA-44 / ML-KEM-512 sizes match FIPS 203/204 exactly.
- Out-of-scope items (mobile proving, in-circuit Dilithium, TEE, PQ-TLS, multi-node BFT) remain
  `[F]` and were not built.

---

<!-- AUTO-DIVERGENCE:BEGIN (generated by harness/generate_results.ts — do not edit) -->

## Complete divergence table (auto-generated, threshold 5%)

| # | Table | Metric | Paper | Measured | Δ | Direction | Cause (summary) | Source |
|---|---|---|---|---|---|---|---|---|
| 1 | IV | ML-DSA-44 keygen (ms) | 0.124ms [M] | 0.051608ms [M] | -58.4% | faster | OS entropy-source difference: the paper measured on Windows/MinGW where RNG syscalls dominate randomness-consuming ops; Linux getrandom() is much faster. | `results/pqc.json` |
| 2 | IV | ML-DSA-44 sign (ms) | 0.287ms [M] | 0.187715ms [M] | -34.6% | faster | Same entropy-source cause as keygen (hedged signing consumes randomness per rejection-sampling round); verify, which consumes none, matches the paper closely.. | `results/pqc.json` |
| 3 | IV | ML-KEM-512 keygen (ms) | 0.091ms [M] | 0.016019ms [M] | -82.4% | faster | Large (~4–5×) but explained: ML-KEM keygen is dominated by randomness + hashing; Windows/MinGW RNG overhead in the paper's run vs Linux getrandom() here. | `results/pqc.json` |
| 4 | IV | ML-KEM-512 encap (ms) | 0.094ms [M] | 0.017642ms [M] | -81.2% | faster | Same cause as keygen (encapsulation draws fresh randomness).. | `results/pqc.json` |
| 5 | IV | ML-KEM-512 decap (ms) | 0.024ms [M] | 0.022141ms [M] | -7.7% | faster | No randomness consumed — matches the paper.. | `results/pqc.json` |
| 6 | V | witness generation (ms) | 356ms [M] | 91.718ms [M] | -74.2% | faster | Large (~4×) and not fully attributable: same snarkJS 0.7.4 WASM calculator and Node 22.16.0; the paper's witness figure (σ=186 on mean 356 — high variance) was . | `results/zk.json` |
| 7 | V | snarkJS prove (ms, median basis) | 876ms [M] median | 2095.3275ms [M] | +139.2% | slower | snarkJS proving has σ/mean > 0.2 (JS JIT warmup + GC tails), so the median is the headline (§B6). | `results/zk.json` |
| 8 | V | rapidsnark prove, cold (ms, campaign/sustained) | 156.28ms [M] | 258.6288ms [M] | +65.5% | slower | Fully characterized by the §C re-measurement: the V5 figure (274.59 ms) was a contended-run artifact; under §B controls the residual variable is THERMAL STATE o. | `results/zk.json` |
| 9 | V | rapidsnark prove, cold (ms, truly-cool first run) | 156.28ms [M] | 177.4455ms [M] | +13.5% | slower | Best-case controlled measurement (first run after >=10 min idle on the quiesced machine); the realistic single-authentication state. | `results/zk.json` |
| 10 | V | speedup snarkJS/rapidsnark (cold/cold) | 6.9× [M] | 8.1× [M] | +17.4% | larger | Recomputed from the controlled cold/cold headline values (§C3 identical bases).. | `results/zk.json` |
| 11 | IV/VI | ECDSA P-256 sign (ms) | 0.2ms [A] reference | 0.026ms [M] | -87% | faster | [A]→[M] upgrade: the paper used dated reference values; modern OpenSSL on this CPU is faster. | `results/baseline.json` |
| 12 | IV/VI | ECDSA P-256 verify (ms) | 0.3ms [A] reference | 0.0619ms [M] | -79.4% | faster | Same as ECDSA sign.. | `results/baseline.json` |
| 13 | §VI-C | core auth latency, native prover (ms) | 553ms [S] stitched | 390.3ms [M] | -29.4% | faster | §VI-C must be updated to the measured breakdown (results/e2e_latency.json) and the sub-second claim explicitly scoped to the rapidsnark path; the snarkJS-path c. | `results/e2e_latency.json` |

### Reconciliation actions, one per divergent cell

1. **ML-DSA-44 keygen (ms)** (Table IV) — paper 0.124ms [M] → measured **0.051608ms** [M] (-58.4%, faster).
   OS entropy-source difference: the paper measured on Windows/MinGW where RNG syscalls dominate randomness-consuming ops; Linux getrandom() is much faster. Same liboqs 0.15.0, same AVX2-off generic build.

2. **ML-DSA-44 sign (ms)** (Table IV) — paper 0.287ms [M] → measured **0.187715ms** [M] (-34.6%, faster).
   Same entropy-source cause as keygen (hedged signing consumes randomness per rejection-sampling round); verify, which consumes none, matches the paper closely.

3. **ML-KEM-512 keygen (ms)** (Table IV) — paper 0.091ms [M] → measured **0.016019ms** [M] (-82.4%, faster).
   Large (~4–5×) but explained: ML-KEM keygen is dominated by randomness + hashing; Windows/MinGW RNG overhead in the paper's run vs Linux getrandom() here. Same liboqs 0.15.0 generic build — decap (no fresh randomness) matches the paper.

4. **ML-KEM-512 encap (ms)** (Table IV) — paper 0.094ms [M] → measured **0.017642ms** [M] (-81.2%, faster).
   Same cause as keygen (encapsulation draws fresh randomness).

5. **ML-KEM-512 decap (ms)** (Table IV) — paper 0.024ms [M] → measured **0.022141ms** [M] (-7.7%, faster).
   No randomness consumed — matches the paper.

6. **witness generation (ms)** (Table V) — paper 356ms [M] → measured **91.718ms** [M] (-74.2%, faster).
   Large (~4×) and not fully attributable: same snarkJS 0.7.4 WASM calculator and Node 22.16.0; the paper's witness figure (σ=186 on mean 356 — high variance) was very likely measured under concurrent load, as its σ suggests. The controlled number here is stable across 3 independent runs (CV recorded). The paper value should be replaced by the controlled measurement.

7. **snarkJS prove (ms, median basis)** (Table V) — paper 876ms [M] median → measured **2095.3275ms** [M] (+139.2%, slower).
   snarkJS proving has σ/mean > 0.2 (JS JIT warmup + GC tails), so the median is the headline (§B6). Compared against the paper's median 876 ms.

8. **rapidsnark prove, cold (ms, campaign/sustained)** (Table V) — paper 156.28ms [M] → measured **258.6288ms** [M] (+65.5%, slower).
   Fully characterized by the §C re-measurement: the V5 figure (274.59 ms) was a contended-run artifact; under §B controls the residual variable is THERMAL STATE of this 15 W ULV part — truly-cool first run 177 ms (zk_rapidsnark_cool.json run 1), self-heated steady state ≈228 ms, heat-soaked campaign ordering ≈250–286 ms. Even the best cool-state run stays +13% above the paper's 156.28 ms, so per §C4 the paper takes the measured values with the thermal-state annotation (cool 177 / sustained ≈233). The sub-second core claim is unaffected.

9. **rapidsnark prove, cold (ms, truly-cool first run)** (Table V) — paper 156.28ms [M] → measured **177.4455ms** [M] (+13.5%, slower).
   Best-case controlled measurement (first run after >=10 min idle on the quiesced machine); the realistic single-authentication state. Still +13% over the paper — the paper's number likely reflects a colder package/full turbo burst in the original campaign and should be updated.

10. **speedup snarkJS/rapidsnark (cold/cold)** (Table V) — paper 6.9× [M] → measured **8.1×** [M] (+17.4%, larger).
   Recomputed from the controlled cold/cold headline values (§C3 identical bases).

11. **ECDSA P-256 sign (ms)** (Table IV/VI) — paper 0.2ms [A] reference → measured **0.026ms** [M] (-87%, faster).
   [A]→[M] upgrade: the paper used dated reference values; modern OpenSSL on this CPU is faster. The ZKP-overhead ratio in Table VI is recomputed from measured values (and grows).

12. **ECDSA P-256 verify (ms)** (Table IV/VI) — paper 0.3ms [A] reference → measured **0.0619ms** [M] (-79.4%, faster).
   Same as ECDSA sign.

13. **core auth latency, native prover (ms)** (Table §VI-C) — paper 553ms [S] stitched → measured **390.3ms** [M] (-29.4%, faster).
   §VI-C must be updated to the measured breakdown (results/e2e_latency.json) and the sub-second claim explicitly scoped to the rapidsnark path; the snarkJS-path core is not sub-second.

<!-- AUTO-DIVERGENCE:END -->

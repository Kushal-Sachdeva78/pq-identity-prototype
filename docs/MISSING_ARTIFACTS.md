# Missing Artifacts & Documentation Discrepancies

An honest accounting of (A) artifacts the manuscript references that are **not
present** in the prototype repository, and (B) **documentation discrepancies**
found during the release review. The functional source code (TypeScript, Python,
Circom, Solidity) and the measured `results/*.json` remain **unaltered and
byte-identical** to the original prototype. The documentation-only discrepancies
B1–B3 have since been **fixed** in this public repo, and the manuscript
reconciliation has been **brought current to the submitted revision (V6.6)** —
see Section C. Items that remain are author-side (manuscript edits) and are
surfaced for the author rather than changed here.

---

## A. Paper-referenced artifacts not present in the repository

| # | Referenced as | Status | Notes |
|---|---|---|---|
| A1 | **Figure 1** (system architecture + trust boundaries) — manuscript §III-A | Image source absent | The repository ships the **executable + textual** equivalent (`ARCHITECTURE.md` §2–§3 ASCII data-flow and the in/off-circuit boundary, realized by `packages/wallet` + `packages/verifier`). The vector/figure source file (e.g. `.drawio`/`.svg`/`.pdf`) used to render Figure 1 in the manuscript is not part of the code prototype. |
| A2 | **Figure 2** (protocol sequence diagram) — manuscript §III-B | Image source absent | Same as A1: `harness/e2e_core.ts` is the executable realization of the sequence; the diagram source is not in the repo. |
| A3 | **GitHub URL placeholder** "(LINK OVER HERE)" — manuscript §VI, first paragraph | Placeholder unfilled in manuscript body | The response-to-reviewers and abstract reference `https://github.com/Kushal-Sachdeva78/pq-identity-prototype` (release v1.0). The manuscript body's `(LINK OVER HERE)` should be replaced with that URL. This repository is intended to be published at exactly that location/tag. |
| A4 | **`results/zk.json` AVX2 / additional live runs on other hardware** | Single committed host | All committed `results/*.json` are from one host (i7-1355U). This is expected for a single-machine evaluation (the paper says so); not "missing", but cross-hardware results are out of scope `[F]`. |
| A5 | Large downloadables: powers-of-tau (`*.ptau`), Foundry/circom binaries, the 38 MB research SHA-3 r1cs | Intentionally not committed | Regenerated/downloaded on demand and SHA-256-pinned (`setup/download_ptau.ts`, `tools/README.md`, `.github/workflows/ci.yml`). Their committed summaries/pins are present (`setup/pins.json`, `circuits/build/research/sha3_research_info.json`). Not a reproducibility gap. |
| A6 | `node_modules/` | Not committed | Reproduced exactly via `npm ci` against the committed `package-lock.json`. |

> **None of A1–A6 blocks reproduction of any *quantitative* claim.** A1–A2 are
> figure renderings (the substance is reproduced in code + `ARCHITECTURE.md`);
> A3 is a manuscript-side editorial fix; A4–A6 are by-design downloadables.

---

## B. Documentation discrepancies found (B1–B3 now FIXED)

The discrepancies below were found in the first release pass. B1–B3 are now
**resolved** in the public repo (they are documentation-only and touch no
measured value, algorithm, circuit, contract, or test). B4 is provenance and is
intentionally left verbatim.

| # | Where | Discrepancy | Status |
|---|---|---|---|
| B1 | `REPRODUCE.md`, "Pinning and verifying" section | Cited committed zkey SHA-256 `2f9216e3…` and "paper's zkey was `22e69c5b…`". The **actual** committed `setup/out/credential_auth_final.zkey`, `setup/pins.json`, `results/zk.json`, `RESULTS.md`, and **manuscript Appendix A.1 (V6.6)** all use `63529c2b8a3320ce…`. | **FIXED.** The section now states the zkey hash as `63529c2b…`, notes the agreement with V6.6 Appendix A.1 and `results/zk.json`, and points to `npm run verify-pins` / `sha256sum`. The `22e69c5b…` reference was removed. |
| B2 | `REPRODUCE.md` referenced `npm run verify-pins` | No `verify-pins` npm script existed (only a `verify-pins` Make target). | **FIXED.** A `"verify-pins": "tsx setup/download_ptau.ts"` script was added to `package.json`, mirroring the Make target; `npm run verify-pins` now works as documented. |
| B3 | `fixtures/vc-schema.json` → `encoding` field | Described `policyHash` as `Poseidon(1, threshold)` and `stmtCode: 1 = STMT_V1`, predating the V6 generalized predicate and domain-separated `stmtCode`. | **FIXED.** The `encoding` comment now reads `policyHash = Poseidon(predicateCode, threshold)` (`1 = AGE_GTE, 2 = AGE_LT`) and `stmtCode = Poseidon(STMT_V1, domainTag)`. (This is a human-readable doc field; the on-chain schema hash it produces is not asserted by any test or committed result, so the change is functionally inert.) |
| B4 | `circuits/build/circuit_info.json` → `circomStdout` | Embeds an absolute Windows build path (`C:\Users\kusha\…`). | **Left verbatim (provenance, not a bug).** A captured build log recording where/when the artifact was produced; not a path the code resolves. |

> The B1–B3 fixes are **documentation-level** and do not affect any executable
> behaviour, measurement, test result, circuit, contract, or cryptographic
> operation. The 141 functional source files (TypeScript, Python, Circom,
> Solidity) remain byte-identical to the original prototype; the only changed
> files are documentation, the release `.gitignore`, the paper-claim reference
> constants in `harness/generate_results.ts` (versioned to V6.6 — see below),
> the regenerated `RESULTS.md`/`MANUSCRIPT_RECONCILIATION.md`, the added
> `verify-pins` script, and the `vc-schema.json` comment.

---

## C. Reconciliation status

**Done in the public repo:**

- **B1** — `REPRODUCE.md` zkey hashes corrected to `63529c2b…`; `22e69c5b…` removed.
- **B2** — `verify-pins` npm script added.
- **B3** — `fixtures/vc-schema.json` `encoding` comment refreshed to V6 wording.
- **Manuscript reconciliation brought current to V6.6** — the paper-claim
  reference values in `harness/generate_results.ts` were versioned to the
  submitted manuscript (V6.6), `RESULTS.md` and `MANUSCRIPT_RECONCILIATION.md`
  were regenerated, and the auto-divergence table now collapses to **0 rows**
  (the paper and the prototype report the same numbers). The reconciliation prose
  is relabelled "incorporated in V6.6".

**Still author-side (cannot be done from this repo):**

- **A3** — replace the `(LINK OVER HERE)` placeholder in §VI of the manuscript
  with `https://github.com/Kushal-Sachdeva78/pq-identity-prototype`.
- **A1, A2** *(optional)* — add the Figure 1 / Figure 2 diagram sources (e.g.
  under a `figures/` directory) so the rendered figures are reproducible, not
  only their executable equivalent.

None of the author-side items are required to reproduce the paper's measured
results; they are camera-ready polish.

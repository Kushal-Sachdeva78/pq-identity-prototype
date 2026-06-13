# Missing Artifacts & Documentation Discrepancies

An honest accounting of (A) artifacts the manuscript references that are **not
present** in the prototype repository, and (B) **documentation discrepancies**
found during the release review. Per the integrity rules for this archival
release, reported values and source code were left **unaltered**; the items
below are surfaced for the author to reconcile rather than silently changed.

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

## B. Documentation discrepancies found (left unaltered)

| # | Where | Discrepancy | Impact |
|---|---|---|---|
| B1 | `REPRODUCE.md`, "Pinning and verifying" section | Cites committed zkey SHA-256 `2f9216e3…` and "paper's zkey was `22e69c5b…`". The **actual** committed `setup/out/credential_auth_final.zkey`, `setup/pins.json`, `results/zk.json`, `RESULTS.md`, and **manuscript Appendix A.1** all use `63529c2b8a3320ce…` (independently re-verified against the on-disk file). | **Cosmetic / stale strings.** The pinned artifact and the determinism test are self-consistent at `63529c2b…`; only that one prose section is stale. Left unaltered to avoid editing a "reported value"; recommended fix: update the two hashes in that section to `63529c2b…` (and drop the `22e69c5b…` reference, which the manuscript no longer uses). |
| B2 | `REPRODUCE.md` (§A.4 / Pinning section) references `npm run verify-pins` | No `verify-pins` script exists in `package.json` (only a `verify-pins` **Make** target exists, `Makefile` lines 77–78, which runs `setup/download_ptau.ts`). | **Minor.** `make verify-pins` works; `npm run verify-pins` errors. Recommended fix: add a `"verify-pins"` npm script mirroring the Make target, **or** change the doc to `make verify-pins`. Not changed here because adding an npm script alters the command surface. |
| B3 | `fixtures/vc-schema.json` → `encoding` field | Describes `policyHash` as `Poseidon(1, threshold) — 1 = POLICY_V1_AGE_GTE` and `stmtCode: 1 = STMT_V1`, which predates the V6 generalized policy predicate (`predicateCode ∈ {1,2}`) and the domain-separated `stmtCode = Poseidon(STMT_V1, domainTag)`. | **Inert.** It is a human-readable documentation field inside a fixture, not consumed by any code path; the actual circuit/encoding logic (`circuits/credential_auth.circom`, `packages/common/src/encoding.ts`) is correct and V6-current. Recommended fix: refresh the comment text. |
| B4 | `circuits/build/circuit_info.json` → `circomStdout` | Embeds an absolute Windows build path (`C:\Users\kusha\…`). | **Provenance, not a bug.** It is a captured build log faithfully recording where/when the artifact was produced; it is not a path the code resolves. Left verbatim as measurement provenance. |

> B1–B4 are **documentation-level** and do not affect any executable behaviour,
> measurement, test result, circuit, contract, or cryptographic operation. They
> are reported here (rather than edited) to keep the release scientifically and
> functionally identical to the prototype that produced the paper's evaluation.

---

## C. Recommended manuscript/repo reconciliations (for the author)

1. Replace the `(LINK OVER HERE)` placeholder in §VI with
   `https://github.com/Kushal-Sachdeva78/pq-identity-prototype` (v1.0) — **A3**.
2. (Optional) Add the Figure 1/Figure 2 diagram sources to the repository (e.g.
   under a `figures/` directory) so the rendered figures are reproducible, not
   only their executable equivalent — **A1, A2**.
3. Correct the stale zkey hashes in `REPRODUCE.md`'s pinning section to
   `63529c2b…` — **B1**.
4. Reconcile `npm run verify-pins` vs the Make target — **B2**.
5. Refresh the `encoding` comment in `fixtures/vc-schema.json` to the V6
   predicate/stmtCode wording — **B3**.

None of these are required to reproduce the paper's measured results; they are
polish for the public release and manuscript camera-ready.

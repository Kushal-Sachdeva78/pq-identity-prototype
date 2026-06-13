# Contributing

This repository is the **reference research artifact** for the IEEE Access paper
*"A Privacy-Focused, Post-Quantum-Oriented Digital Identity System Using
Blockchain and Zero-Knowledge Proofs"* (Access-2026-15409). Its primary purpose
is to make the paper's claims **reproducible and inspectable**, not to be a
production library.

## What this repository optimizes for

- **Reproducibility** — every quantitative result is measured at runtime and
  written to `results/*.json` with the host CPU, OS build, and toolchain
  embedded. Nothing is hard-coded to match the paper; divergences are reported
  loudly (see [`RESULTS.md`](RESULTS.md) and
  [`MANUSCRIPT_RECONCILIATION.md`](MANUSCRIPT_RECONCILIATION.md)).
- **Reviewer-defensibility** — pinned toolchains, SHA-256-pinned trusted-setup
  artifacts, a guard-protected benchmark discipline (§B), and a soundness audit
  gate (circomspect).
- **Honest scoping** — implementation status is labelled throughout as
  `[M]` measured, `[S]` simulated/estimated, `[A]` assumption, `[F]` future work.

## How to engage

- **Reproducing results** — start with [`docs/SETUP.md`](docs/SETUP.md), then
  [`REPRODUCE.md`](REPRODUCE.md). Your numbers will differ from the paper's if
  your hardware differs; that is expected and documented.
- **Questions / issues** — please open a GitHub issue describing your host
  (CPU, OS, Node/Python/toolchain versions) and attach the relevant
  `results/*.json`. The embedded host metadata makes mismatches diagnosable.
- **Corrections** — factual corrections to the documentation, build scripts, or
  portability fixes are welcome via pull request. Changes that alter measured
  behaviour, algorithms, the circuit, the contracts, or the cryptographic
  operations are **out of scope** for this archival artifact: the code is meant
  to remain functionally identical to what produced the paper's evaluation. If
  you find a genuine soundness or correctness bug, please open an issue first so
  it can be discussed and clearly recorded.

## Ground rules for changes

1. Keep the `[M]`/`[S]`/`[A]`/`[F]` labelling discipline intact.
2. Never commit secret key material (`fixtures/keys/` is git-ignored).
3. Re-run `npm run build` (typecheck), `npm run lint`, and `npm test` before
   proposing a change.
4. If a change is intended to update a pinned artifact (zkey/ptau), delete the
   relevant entry from `setup/pins.json`, re-run `npm run setup`, and make the
   new hash visible in the diff — never silently overwrite a pin.

## Code of conduct

Be respectful and constructive. This is a student-led academic project; good
-faith questions and careful, well-documented contributions are appreciated.

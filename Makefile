# PQ-ID prototype — reproducible build & measurement (IEEE Access-2026-15409)
#
# Native (liboqs, rapidsnark, PostgreSQL) builds run inside WSL2/Linux. On
# Windows, run `make` from Git Bash or use the npm scripts directly; the
# heavy native pieces are containerized under docker/ for clean-host repro.
#
# Idempotent targets: setup, build, test, bench, demo.

SHELL := bash
.ONESHELL:
.PHONY: all help provision setup build test bench bench-pqc bench-zk bench-baseline gas \
        e2e negative probe tables demo lint clean package verify-pins

PREFIX ?= $(HOME)/pqid-native

all: setup build test bench tables ## setup + build + test + bench + tables

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}'

provision: ## build native toolchain in WSL/Linux (liboqs, GMP, rapidsnark, venv)
	bash docker/provision-wsl.sh

setup: ## toolchains + ptau (pinned) + zkey/vkey (pinned) + Solidity verifier
	npm install
	npx tsx setup/download_ptau.ts
	npx tsx setup/build_circuit.ts
	npx tsx setup/groth16_setup.ts
	npx tsx setup/research_sha3_report.ts

build: ## typecheck all workspaces
	npx tsc -p tsconfig.json --noEmit

lint: ## eslint
	npx eslint .

test: ## unit + integration + negative + interop + determinism
	npx vitest run
	OQS_INSTALL_PATH=$(PREFIX)/liboqs-generic $(PREFIX)/venv/bin/python -m pytest tests/interop -q

bench: ## V6 §B controlled campaign: guard-protected, strictly serial, ≥3 invocations
	npx tsx harness/campaign.ts

audit: ## circomspect soundness gate (§F) — build-blocking on our template
	npx tsx harness/circomspect_audit.ts

bench-legacy: bench-pqc bench-zk bench-baseline gas ## individual benches (each self-guards)

bench-pqc: ## Table IV — liboqs ML-DSA-44 + ML-KEM-512 (N=1000, 5 warmup)
	npx tsx harness/bench_pqc.ts

bench-zk: ## Table V — Groth16 dual prover on byte-identical inputs
	npx tsx harness/bench_zk.ts

bench-baseline: ## Table VI — OAuth2 + ECDSA P-256 + PostgreSQL
	npx tsx packages/baseline/bench_baseline.ts

gas: ## on-chain Groth16 verifier gas [A]->[M]
	npx tsx onchain/measure_gas.ts

e2e: ## headless end-to-end positive lifecycle
	npx tsx harness/e2e.ts

negative: ## required negative test (revoked -> no accepted proof)
	npx tsx harness/negative_test.ts

probe: ## Assumption-5 malicious-wallet probe
	npx tsx harness/malicious_wallet_probe.ts

tables: ## regenerate RESULTS.md from results/*.json
	npx tsx harness/generate_results.ts

demo: ## one-command lifecycle: register->issue->prove->verify->revoke->reject
	npx tsx cli/demo.ts

verify-pins: ## re-check ptau + zkey SHA-256 against setup/pins.json
	npx tsx setup/download_ptau.ts

package: tables ## build the IEEE supplementary .zip
	npx tsx tools/package_supplementary.ts

clean: ## remove generated build artifacts (keeps pins.json + results/sample)
	rm -rf circuits/build setup/out node_modules dist
	find results -maxdepth 1 -name '*.json' -delete || true
	rm -f results/_bench_*.log results/demo_transcript.txt

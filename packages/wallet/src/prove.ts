import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Groth16Proof, PublicSignals } from "snarkjs";
import {
  WASM_FILE,
  ZKEY_FILE,
  RAPIDSNARK_PROVER_WSL,
  toWslPath,
} from "@pqid/common/paths";
import { sha256File } from "@pqid/common/hash";
import type { CircuitInput } from "./witness.ts";

export type ProverBackend = "snarkjs" | "rapidsnark";

export interface ProveResult {
  backend: ProverBackend;
  proof: Groth16Proof;
  publicSignals: PublicSignals;
  /** SHA-256 of the proving key actually used. */
  zkeySha256: string;
  /** SHA-256 of the witness file actually used. */
  witnessSha256: string;
  timings: {
    witnessMs?: number;
    proveMs: number;
    /** rapidsnark: subprocess wall time incl. process start + file I/O
     *  (slight over-estimate of pure proving, as in the paper, A.2). */
    proveIsSubprocessWall: boolean;
  };
  proofJsonBytes: number;
}

/** Compute the witness for `input` into a fresh temp .wtns file. */
export async function computeWitness(
  input: CircuitInput
): Promise<{ wtnsFile: string; witnessMs: number }> {
  const snarkjs = await import("snarkjs");
  const wtnsFile = path.join(
    os.tmpdir(),
    `pqid-${Date.now()}-${randomBytes(4).toString("hex")}.wtns`
  );
  const t0 = process.hrtime.bigint();
  await snarkjs.wtns.calculate(input, WASM_FILE, wtnsFile);
  const witnessMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { wtnsFile, witnessMs };
}

/** snarkJS 0.7.4 JS prover on a prepared witness file. */
export async function proveSnarkjsOnWitness(wtnsFile: string): Promise<ProveResult> {
  const snarkjs = await import("snarkjs");
  const t0 = process.hrtime.bigint();
  const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY_FILE, wtnsFile);
  const proveMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    backend: "snarkjs",
    proof,
    publicSignals,
    zkeySha256: sha256File(ZKEY_FILE),
    witnessSha256: sha256File(wtnsFile),
    timings: { proveMs, proveIsSubprocessWall: false },
    proofJsonBytes: Buffer.byteLength(JSON.stringify(proof), "utf8"),
  };
}

/** rapidsnark v0.0.8 native prover (inside WSL) on the same zkey + witness. */
export function proveRapidsnarkOnWitness(wtnsFile: string): ProveResult {
  const tag = randomBytes(4).toString("hex");
  const proofFile = path.join(os.tmpdir(), `pqid-proof-${tag}.json`);
  const publicFile = path.join(os.tmpdir(), `pqid-public-${tag}.json`);
  const cmd = [
    RAPIDSNARK_PROVER_WSL,
    toWslPath(ZKEY_FILE),
    toWslPath(wtnsFile),
    toWslPath(proofFile),
    toWslPath(publicFile),
  ].join(" ");

  const t0 = process.hrtime.bigint();
  const res = spawnSync("wsl", ["-u", "root", "-e", "bash", "-c", cmd], {
    encoding: "utf8",
  });
  const proveMs = Number(process.hrtime.bigint() - t0) / 1e6;
  if (res.status !== 0) {
    throw new Error(`rapidsnark prover failed (${res.status}): ${res.stderr} ${res.stdout}`);
  }
  const proof = JSON.parse(fs.readFileSync(proofFile, "utf8")) as Groth16Proof;
  const publicSignals = JSON.parse(
    fs.readFileSync(publicFile, "utf8")
  ) as PublicSignals;
  const proofJsonBytes = fs.statSync(proofFile).size;
  fs.rmSync(proofFile);
  fs.rmSync(publicFile);
  return {
    backend: "rapidsnark",
    proof,
    publicSignals,
    zkeySha256: sha256File(ZKEY_FILE),
    witnessSha256: sha256File(wtnsFile),
    timings: { proveMs, proveIsSubprocessWall: true },
    proofJsonBytes,
  };
}

/** Full pipeline: witness + prove with the chosen backend. */
export async function prove(
  input: CircuitInput,
  backend: ProverBackend
): Promise<ProveResult> {
  const { wtnsFile, witnessMs } = await computeWitness(input);
  try {
    const result =
      backend === "snarkjs"
        ? await proveSnarkjsOnWitness(wtnsFile)
        : proveRapidsnarkOnWitness(wtnsFile);
    result.timings.witnessMs = witnessMs;
    return result;
  } finally {
    fs.rmSync(wtnsFile, { force: true });
  }
}

/**
 * Dual-prover run on byte-identical zkey + witness (Table V integrity crux):
 * computes ONE witness, proves with both backends, and asserts SHA-256
 * equality of the inputs both provers consumed.
 */
export async function proveBoth(input: CircuitInput): Promise<{
  snarkjs: ProveResult;
  rapidsnark: ProveResult;
  witnessMs: number;
  inputsIdentical: true;
}> {
  const { wtnsFile, witnessMs } = await computeWitness(input);
  try {
    const sj = await proveSnarkjsOnWitness(wtnsFile);
    const rs = proveRapidsnarkOnWitness(wtnsFile);
    if (sj.zkeySha256 !== rs.zkeySha256 || sj.witnessSha256 !== rs.witnessSha256) {
      throw new Error("prover inputs diverged — zkey/witness SHA-256 mismatch");
    }
    return { snarkjs: sj, rapidsnark: rs, witnessMs, inputsIdentical: true };
  } finally {
    fs.rmSync(wtnsFile, { force: true });
  }
}

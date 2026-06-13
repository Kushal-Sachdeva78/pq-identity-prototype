import { spawnSync } from "node:child_process";
import path from "node:path";
import { REPO_ROOT, PQID_NATIVE_WSL, toWslPath } from "@pqid/common/paths";

/**
 * Node-side wrapper over the liboqs 0.15.0 native build living inside WSL.
 * Every call is a one-shot subprocess (JSON over stdin/stdout); this bridge is
 * used for protocol operations only — all timing numbers come from
 * bench_pqc.py, which loops inside a single process.
 */
export type LiboqsBuild = "generic" | "avx2";

export interface SigKeypair {
  publicKey: Buffer;
  secretKey: Buffer;
}
export interface KemKeypair {
  publicKey: Buffer;
  secretKey: Buffer;
}
export interface KemEncapResult {
  ciphertext: Buffer;
  sharedSecret: Buffer;
}

const PQC_CLI_WSL = toWslPath(path.join(REPO_ROOT, "packages", "pqc", "pqc_cli.py"));

interface PqcRequest {
  op: string;
  publicKey?: string;
  secretKey?: string;
  message?: string;
  signature?: string;
  ciphertext?: string;
}

function callPqc(
  req: PqcRequest,
  build: LiboqsBuild = "generic"
): Record<string, string | boolean> {
  const env = `OQS_INSTALL_PATH=${PQID_NATIVE_WSL}/liboqs-${build}`;
  const cmd = `${env} ${PQID_NATIVE_WSL}/venv/bin/python ${PQC_CLI_WSL}`;
  const res = spawnSync("wsl", ["-u", "root", "-e", "bash", "-c", cmd], {
    input: JSON.stringify(req),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`pqc_cli failed (${res.status}): ${res.stderr}`);
  }
  const payload = res.stdout.split("===PQID_JSON===")[1];
  if (!payload) throw new Error(`pqc_cli: no JSON payload in output`);
  return JSON.parse(payload) as Record<string, string | boolean>;
}

export function dilithiumKeygen(): SigKeypair {
  const out = callPqc({ op: "sig-keygen" });
  return {
    publicKey: Buffer.from(out["publicKey"] as string, "hex"),
    secretKey: Buffer.from(out["secretKey"] as string, "hex"),
  };
}

export function dilithiumSign(secretKey: Buffer, message: Buffer): Buffer {
  const out = callPqc({
    op: "sig-sign",
    secretKey: secretKey.toString("hex"),
    message: message.toString("hex"),
  });
  return Buffer.from(out["signature"] as string, "hex");
}

export function dilithiumVerify(
  publicKey: Buffer,
  message: Buffer,
  signature: Buffer
): boolean {
  const out = callPqc({
    op: "sig-verify",
    publicKey: publicKey.toString("hex"),
    message: message.toString("hex"),
    signature: signature.toString("hex"),
  });
  return out["valid"] === true;
}

export function kyberKeygen(): KemKeypair {
  const out = callPqc({ op: "kem-keygen" });
  return {
    publicKey: Buffer.from(out["publicKey"] as string, "hex"),
    secretKey: Buffer.from(out["secretKey"] as string, "hex"),
  };
}

export function kyberEncap(publicKey: Buffer): KemEncapResult {
  const out = callPqc({ op: "kem-encap", publicKey: publicKey.toString("hex") });
  return {
    ciphertext: Buffer.from(out["ciphertext"] as string, "hex"),
    sharedSecret: Buffer.from(out["sharedSecret"] as string, "hex"),
  };
}

export function kyberDecap(secretKey: Buffer, ciphertext: Buffer): Buffer {
  const out = callPqc({
    op: "kem-decap",
    secretKey: secretKey.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  });
  return Buffer.from(out["sharedSecret"] as string, "hex");
}

/**
 * dilithium-py 1.4.0 keygen/sign — E2E-harness issuance step ONLY (paper
 * A.5). Never used in timing tables; liboqs↔dilithium-py interop is enforced
 * by tests/interop/test_mldsa_interop.py.
 */
export function dilithiumKeygenDpy(): SigKeypair {
  const out = callPqc({ op: "sig-keygen-dpy" });
  return {
    publicKey: Buffer.from(out["publicKey"] as string, "hex"),
    secretKey: Buffer.from(out["secretKey"] as string, "hex"),
  };
}

export function dilithiumSignDpy(secretKey: Buffer, message: Buffer): Buffer {
  const out = callPqc({
    op: "sig-sign-dpy",
    secretKey: secretKey.toString("hex"),
    message: message.toString("hex"),
  });
  return Buffer.from(out["signature"] as string, "hex");
}

/** Expected ML-DSA-44 sizes (FIPS 204) — used in tests and docs. */
export const ML_DSA_44_SIZES = { publicKey: 1312, secretKey: 2560, signature: 2420 } as const;
/** Expected ML-KEM-512 sizes (FIPS 203) — used in tests and docs. */
export const ML_KEM_512_SIZES = { publicKey: 800, secretKey: 1632, ciphertext: 768, sharedSecret: 32 } as const;

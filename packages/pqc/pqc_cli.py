"""One-shot PQC operation CLI used by the Node packages via the WSL bridge.

Reads a single JSON request on stdin, writes a JSON response on stdout.
Keys and messages are hex-encoded. Secret keys never touch argv or logs.

Requests:
  {"op": "sig-keygen"}                          -> {publicKey, secretKey}
  {"op": "sig-sign",   "secretKey", "message"}  -> {signature}
  {"op": "sig-verify", "publicKey", "message", "signature"} -> {valid}
  {"op": "kem-keygen"}                          -> {publicKey, secretKey}
  {"op": "kem-encap",  "publicKey"}             -> {ciphertext, sharedSecret}
  {"op": "kem-decap",  "secretKey", "ciphertext"} -> {sharedSecret}

Algorithms are fixed to the paper's parameter sets: ML-DSA-44 (Dilithium-II)
and ML-KEM-512 (Kyber-512).
"""
from __future__ import annotations

import json
import sys

import oqs

SIG_ALG = "ML-DSA-44"
KEM_ALG = "ML-KEM-512"


def main() -> None:
    req = json.load(sys.stdin)
    op = req["op"]
    if op == "sig-keygen":
        with oqs.Signature(SIG_ALG) as s:
            pk = s.generate_keypair()
            sk = s.export_secret_key()
        out = {"publicKey": pk.hex(), "secretKey": sk.hex()}
    elif op == "sig-sign":
        sk = bytes.fromhex(req["secretKey"])
        msg = bytes.fromhex(req["message"])
        with oqs.Signature(SIG_ALG, secret_key=sk) as s:
            sig = s.sign(msg)
        out = {"signature": sig.hex()}
    elif op == "sig-verify":
        pk = bytes.fromhex(req["publicKey"])
        msg = bytes.fromhex(req["message"])
        sig = bytes.fromhex(req["signature"])
        with oqs.Signature(SIG_ALG) as s:
            valid = s.verify(msg, sig, pk)
        out = {"valid": bool(valid)}
    elif op == "kem-keygen":
        with oqs.KeyEncapsulation(KEM_ALG) as k:
            pk = k.generate_keypair()
            sk = k.export_secret_key()
        out = {"publicKey": pk.hex(), "secretKey": sk.hex()}
    elif op == "kem-encap":
        pk = bytes.fromhex(req["publicKey"])
        with oqs.KeyEncapsulation(KEM_ALG) as k:
            ct, ss = k.encap_secret(pk)
        out = {"ciphertext": ct.hex(), "sharedSecret": ss.hex()}
    elif op == "kem-decap":
        sk = bytes.fromhex(req["secretKey"])
        ct = bytes.fromhex(req["ciphertext"])
        with oqs.KeyEncapsulation(KEM_ALG, secret_key=sk) as k:
            ss = k.decap_secret(ct)
        out = {"sharedSecret": ss.hex()}
    elif op == "sig-keygen-dpy":
        # dilithium-py 1.4.0 — E2E harness issuance step ONLY (paper A.5).
        # Interop with liboqs is enforced by tests/interop/test_mldsa_interop.py
        # and excluded from all timing tables.
        from dilithium_py.ml_dsa import ML_DSA_44

        pk, sk = ML_DSA_44.keygen()
        out = {"publicKey": pk.hex(), "secretKey": sk.hex(), "impl": "dilithium-py 1.4.0"}
    elif op == "sig-sign-dpy":
        from dilithium_py.ml_dsa import ML_DSA_44

        sk = bytes.fromhex(req["secretKey"])
        msg = bytes.fromhex(req["message"])
        sig = ML_DSA_44.sign(sk, msg)
        out = {"signature": sig.hex(), "impl": "dilithium-py 1.4.0"}
    else:
        raise SystemExit(f"unknown op: {op}")
    # Sentinel separates the JSON payload from any import-time library notices.
    sys.stdout.write("\n===PQID_JSON===\n")
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()

// Minimal typed surface of snarkjs 0.7.4 as used by this prototype.
declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
    protocol: string;
    curve: string;
  }
  export type PublicSignals = string[];

  export interface Groth16ProveResult {
    proof: Groth16Proof;
    publicSignals: PublicSignals;
  }

  export const groth16: {
    prove(
      zkeyFileName: string | Uint8Array,
      witnessFileName: string | Uint8Array,
      logger?: unknown
    ): Promise<Groth16ProveResult>;
    verify(
      vkVerifier: unknown,
      publicSignals: PublicSignals,
      proof: Groth16Proof,
      logger?: unknown
    ): Promise<boolean>;
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFileName: string,
      logger?: unknown
    ): Promise<Groth16ProveResult>;
    exportSolidityCallData(
      proof: Groth16Proof,
      publicSignals: PublicSignals
    ): Promise<string>;
  };

  export const zKey: {
    newZKey(
      r1csName: string,
      ptauName: string,
      zkeyName: string,
      logger?: unknown
    ): Promise<unknown>;
    contribute(
      zkeyNameOld: string,
      zkeyNameNew: string,
      name: string,
      entropy: string,
      logger?: unknown
    ): Promise<unknown>;
    exportVerificationKey(zkeyName: string, logger?: unknown): Promise<unknown>;
    exportSolidityVerifier(
      zkeyName: string,
      templates: Record<string, string>,
      logger?: unknown
    ): Promise<string>;
    verifyFromR1cs(
      r1csName: string,
      ptauName: string,
      zkeyName: string,
      logger?: unknown
    ): Promise<boolean>;
  };

  export const r1cs: {
    info(r1csName: string, logger?: unknown): Promise<{
      n8: number;
      prime: bigint;
      nVars: number;
      nOutputs: number;
      nPubInputs: number;
      nPrvInputs: number;
      nLabels: number;
      nConstraints: number;
    }>;
  };

  export const wtns: {
    calculate(
      input: Record<string, unknown>,
      wasmFileName: string,
      wtnsFileName: string
    ): Promise<void>;
  };
}

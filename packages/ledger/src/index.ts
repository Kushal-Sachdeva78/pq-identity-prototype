import type { Contract, JsonRpcProvider } from "ethers";
import { didRegistryKey, type DidDocument } from "@pqid/common/did";
import { sha3_256, canonicalJsonBytes } from "@pqid/common/hash";
import {
  compileRegistries,
  deployContract,
  devSigner,
  startAnvil,
  type AnvilHandle,
} from "./evm.ts";

/**
 * Ledger / registry layer (paper §III-C) on a single-node EVM. The four
 * registries are real Solidity contracts; multi-node BFT is out of scope [F].
 */
export interface RegistryAddresses {
  didRegistry: string;
  issuerRegistry: string;
  revocationRegistry: string;
  schemaRegistry: string;
}

export class Ledger {
  private constructor(
    readonly rpcUrl: string,
    readonly addresses: RegistryAddresses,
    private readonly didRegistry: Contract,
    private readonly issuerRegistry: Contract,
    private readonly revocationRegistry: Contract,
    private readonly schemaRegistry: Contract,
    private readonly provider: JsonRpcProvider
  ) {}

  /** Deploy all four registries to the EVM at rpcUrl. */
  static async deploy(rpcUrl: string): Promise<Ledger> {
    const { signer, provider } = devSigner(rpcUrl);
    const compiled = compileRegistries();
    const get = (n: string) => {
      const c = compiled[n];
      if (!c) throw new Error(`contract ${n} missing from compilation`);
      return c;
    };
    const didRegistry = await deployContract(get("DIDRegistry"), signer);
    const issuerRegistry = await deployContract(get("IssuerRegistry"), signer);
    const revocationRegistry = await deployContract(get("RevocationRegistry"), signer, [
      await didRegistry.getAddress(),
    ]);
    const schemaRegistry = await deployContract(get("SchemaRegistry"), signer);
    return new Ledger(
      rpcUrl,
      {
        didRegistry: await didRegistry.getAddress(),
        issuerRegistry: await issuerRegistry.getAddress(),
        revocationRegistry: await revocationRegistry.getAddress(),
        schemaRegistry: await schemaRegistry.getAddress(),
      },
      didRegistry,
      issuerRegistry,
      revocationRegistry,
      schemaRegistry,
      provider
    );
  }

  /** Algorithm 1 (on-chain half): register a DID Document. */
  async registerDid(did: string, publicKeyDilithium: Uint8Array, endpoints: string[] = []): Promise<void> {
    const key = didRegistryKey(did);
    const tx = await this.didRegistry["registerDID"]?.(
      key,
      did,
      publicKeyDilithium,
      JSON.stringify(endpoints)
    );
    await tx.wait();
  }

  /** did:pq resolver: DID Document from the DID Registry. */
  async resolveDid(did: string): Promise<DidDocument & { active: boolean }> {
    const key = didRegistryKey(did);
    const fn = this.didRegistry["resolveDID"];
    if (!fn) throw new Error("resolveDID missing on contract");
    const [didStr, pk, endpoints, active] = (await fn(key)) as [string, string, string, boolean];
    return {
      id: didStr,
      publicKeyDilithium: pk.replace(/^0x/, ""),
      endpoints: JSON.parse(endpoints) as string[],
      active,
    };
  }

  async accreditIssuer(did: string): Promise<void> {
    const tx = await this.issuerRegistry["accredit"]?.(didRegistryKey(did));
    await tx.wait();
  }

  async isAccredited(did: string): Promise<boolean> {
    const fn = this.issuerRegistry["accredited"];
    if (!fn) throw new Error("accredited missing on contract");
    return (await fn(didRegistryKey(did))) as boolean;
  }

  /** Algorithm 4 (on-chain half): publish a new revocation root. */
  async publishRevRoot(issuerDid: string, root: bigint): Promise<void> {
    const tx = await this.revocationRegistry["publishRevRoot"]?.(
      didRegistryKey(issuerDid),
      root
    );
    await tx.wait();
  }

  async getRevRoot(issuerDid: string): Promise<bigint> {
    const fn = this.revocationRegistry["revRoot"];
    if (!fn) throw new Error("revRoot missing on contract");
    return (await fn(didRegistryKey(issuerDid))) as bigint;
  }

  async registerSchema(schemaId: string, schemaJson: unknown, uri: string): Promise<void> {
    const idKey = sha3_256(Buffer.from(schemaId, "utf8"));
    const schemaHash = sha3_256(canonicalJsonBytes(schemaJson));
    const tx = await this.schemaRegistry["registerSchema"]?.(idKey, schemaHash, uri);
    await tx.wait();
  }

  destroy(): void {
    this.provider.destroy();
  }
}

export { startAnvil, type AnvilHandle };

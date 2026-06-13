import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  JsonRpcProvider,
  Wallet as EthWallet,
  NonceManager,
  ContractFactory,
  Contract,
} from "ethers";
import solc from "solc";
import { REPO_ROOT } from "@pqid/common/paths";

/** Anvil's deterministic dev account #0 (publicly known test key). */
export const ANVIL_DEV_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export interface AnvilHandle {
  proc: ChildProcess;
  rpcUrl: string;
  stop(): void;
}

function anvilBinary(): string {
  const win = path.join(REPO_ROOT, "tools", "foundry", "anvil.exe");
  if (process.platform === "win32" && fs.existsSync(win)) return win;
  return "anvil";
}

/** Start a single-node local EVM (Anvil) and wait until the RPC answers. */
export async function startAnvil(port = 8545): Promise<AnvilHandle> {
  const proc = spawn(anvilBinary(), ["--port", String(port), "--silent"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const provider = new JsonRpcProvider(rpcUrl);
  const deadline = Date.now() + 30_000;
  // poll until the node answers
  for (;;) {
    try {
      await provider.getBlockNumber();
      break;
    } catch {
      if (Date.now() > deadline) {
        proc.kill();
        throw new Error("anvil did not start within 30 s");
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  provider.destroy();
  return {
    proc,
    rpcUrl,
    stop: () => {
      proc.kill();
    },
  };
}

export interface CompiledContract {
  abi: unknown[];
  bytecode: string;
}

/** Compile .sol sources with the pinned solc-js (0.8.x) via standard JSON. */
export function compileSolidity(
  sources: Record<string, string>
): Record<string, CompiledContract> {
  const input = {
    language: "Solidity",
    sources: Object.fromEntries(
      Object.entries(sources).map(([name, content]) => [name, { content }])
    ),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts?: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
  };
  const fatal = (output.errors ?? []).filter((e) => e.severity === "error");
  if (fatal.length > 0) {
    throw new Error("solc errors:\n" + fatal.map((e) => e.formattedMessage).join("\n"));
  }
  const result: Record<string, CompiledContract> = {};
  for (const file of Object.values(output.contracts ?? {})) {
    for (const [name, c] of Object.entries(file)) {
      result[name] = { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };
    }
  }
  return result;
}

export function compileRegistries(): Record<string, CompiledContract> {
  const solPath = path.join(REPO_ROOT, "onchain", "contracts", "Registries.sol");
  return compileSolidity({ "Registries.sol": fs.readFileSync(solPath, "utf8") });
}

export async function deployContract(
  compiled: CompiledContract,
  signer: NonceManager,
  args: unknown[] = []
): Promise<Contract> {
  const factory = new ContractFactory(
    compiled.abi as never,
    compiled.bytecode,
    signer
  );
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract as unknown as Contract;
}

export interface DevSigner {
  signer: NonceManager;
  provider: JsonRpcProvider;
}

/**
 * Dev account #0 wrapped in a NonceManager: ethers v6 caches
 * eth_getTransactionCount per block tick, which races against Anvil's
 * insta-mining on rapid sequential transactions; local nonce tracking fixes it.
 */
export function devSigner(rpcUrl: string): DevSigner {
  const provider = new JsonRpcProvider(rpcUrl);
  provider.pollingInterval = 100; // Anvil insta-mines; default 4 s polling just adds latency
  return { signer: new NonceManager(new EthWallet(ANVIL_DEV_KEY, provider)), provider };
}

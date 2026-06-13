# tools/

Platform-specific tool binaries used by the prototype on Windows. They are
**not committed** to this repository (they are large, OS-specific, and freely
downloadable at pinned versions). The build/benchmark scripts look for them
here on Windows and otherwise fall back to the executables on your `PATH`
(Linux/macOS/CI), so populating this directory is only required on Windows.

| Path | Tool | Pinned version | How to obtain |
|---|---|---|---|
| `tools/circom.exe` | Circom compiler | 2.2.3 | [iden3/circom v2.2.3 release](https://github.com/iden3/circom/releases/tag/v2.2.3) — download `circom-windows-amd64.exe`, rename to `circom.exe` |
| `tools/foundry/anvil.exe` | Foundry Anvil (local EVM) | Foundry stable | Install [Foundry](https://book.getfoundry.sh/getting-started/installation) (`foundryup`) and copy `anvil.exe` here, or use the `ghcr.io/foundry-rs/foundry:stable` image (see `docker/docker-compose.yml`) |
| `tools/foundry/forge.exe`, `cast.exe`, `chisel.exe` | Foundry suite | Foundry stable | Same as above (optional; only `anvil` is required for gas measurement) |

On Linux/CI the scripts call `circom` and `anvil` directly from `PATH`; see
`.github/workflows/ci.yml`, which installs the pinned circom 2.2.3 release
binary, and `docker/docker-compose.yml`, which uses the official Foundry image.

The code paths that reference these binaries
(`packages/common/src/paths.ts`, `packages/ledger/src/evm.ts`,
`setup/build_circuit.ts`) all degrade gracefully to `PATH` when the Windows
binaries are absent — no source change is needed to run on a non-Windows host.

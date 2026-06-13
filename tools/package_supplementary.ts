import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { REPO_ROOT } from "@pqid/common/paths";

/**
 * Assemble the IEEE Access supplementary .zip: source tree (no node_modules,
 * no secret keys, no huge ptau), the measured results, RESULTS.md, and the
 * demo transcript. Uses PowerShell Compress-Archive on Windows, `zip` else.
 */
const STAGE = path.join(REPO_ROOT, "package_supplementary");
const INCLUDE_DIRS = [
  "circuits",
  "packages",
  "setup",
  "onchain",
  "harness",
  "cli",
  "fixtures",
  "docker",
  "tests",
  "types",
  "tools",
  "results",
];
const INCLUDE_FILES = [
  "README.md",
  "ARCHITECTURE.md",
  "REPRODUCE.md",
  "RESULTS.md",
  "MANUSCRIPT_RECONCILIATION.md",
  "Makefile",
  "LICENSE",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vitest.config.ts",
  "eslint.config.mjs",
  ".gitignore",
  ".gitattributes",
];
// Excluded even if nested: secrets, build junk, large/derived/platform binaries.
const EXCLUDE = [
  /node_modules/,
  /[\\/]build[\\/]/,
  /setup[\\/]out[\\/]/,
  /setup[\\/]ptau[\\/]/,
  /fixtures[\\/]keys[\\/]/,
  /tools[\\/]foundry/, // platform-specific Anvil binaries (re-downloaded by setup)
  /\.wtns$/,
  /\.zkey$/,
  /\.ptau$/,
  /\.exe$/, // circom.exe etc. — platform-specific, re-downloaded by setup
  /_bench_.*\.log$/,
];

function copyRec(src: string, dst: string): void {
  const stat = fs.statSync(src);
  if (EXCLUDE.some((re) => re.test(src))) return;
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRec(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

function main(): void {
  fs.rmSync(STAGE, { recursive: true, force: true });
  const root = path.join(STAGE, "pqid-prototype");
  fs.mkdirSync(root, { recursive: true });

  for (const d of INCLUDE_DIRS) {
    const src = path.join(REPO_ROOT, d);
    if (fs.existsSync(src)) copyRec(src, path.join(root, d));
  }
  for (const f of INCLUDE_FILES) {
    const src = path.join(REPO_ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(root, f));
  }

  const zipPath = path.join(REPO_ROOT, "pqid-prototype-supplementary.zip");
  fs.rmSync(zipPath, { force: true });
  if (process.platform === "win32") {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${root}' -DestinationPath '${zipPath}' -Force`,
      ],
      { stdio: "inherit" }
    );
  } else {
    execFileSync("zip", ["-r", "-q", zipPath, "pqid-prototype"], { cwd: STAGE, stdio: "inherit" });
  }
  const sizeMiB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
  console.log(`[package] wrote ${zipPath} (${sizeMiB} MiB)`);
  fs.rmSync(STAGE, { recursive: true, force: true });
}

main();

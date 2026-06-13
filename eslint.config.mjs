import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "circuits/build/**",
      "setup/out/**",
      "setup/ptau/**",
      "results/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { process: "readonly", Buffer: "readonly", console: "readonly", URL: "readonly", fetch: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The report generator stitches heterogeneous JSON; pragmatic any is fine.
    files: ["harness/generate_results.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  }
);

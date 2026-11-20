// Configuración plana de ESLint con typescript-eslint.
// NFR5: `no-explicit-any` en error.
// El front (`web/src/**/*.ts`, incluidos los `.svelte.ts`) se revisa aquí; los `.svelte` los revisa `svelte-check`.
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["node_modules/**", "out/**", "tests/.tmp/**", "aidlc/**", ".claude/**", "fixtures/**", "docs/**", "web/dist/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);

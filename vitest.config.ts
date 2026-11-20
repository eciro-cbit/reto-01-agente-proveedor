import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

const CONFIG_SVELTE = fileURLToPath(new URL("./web/svelte.config.js", import.meta.url));

// Estrategia Minimal (scope express): sin umbral de cobertura.
// Dos proyectos: `node` (backend, Bolts 1–2) y `web` (front Svelte 5 en jsdom, Bolt 3).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["node_modules/**", "tests/.tmp/**"],
          testTimeout: 30000,
        },
      },
      {
        plugins: [svelte({ configFile: CONFIG_SVELTE }), svelteTesting()],
        test: {
          name: "web",
          environment: "jsdom",
          include: ["web/src/**/*.test.ts"],
          testTimeout: 15000,
        },
      },
    ],
  },
});

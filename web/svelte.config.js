// Configuración de Svelte compartida por Vite (web/vite.config.ts), vitest (proyecto `web`) y svelte-check.
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
};

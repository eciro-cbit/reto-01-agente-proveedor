/**
 * Vite para el front del chat (Bolt 3).
 * - `root` es `web/`; el build sale a `web/dist` y lo sirve el mismo backend (`npm start`).
 * - En desarrollo (`npm run dev`) el front corre en :5173 y `/api/*` se reenvía al API Hono (`PORT`, 3000 por defecto),
 *   así el navegador siempre llama a rutas relativas y no hay CORS ni URLs distintas entre dev y producción.
 */
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const RAIZ_WEB = fileURLToPath(new URL(".", import.meta.url));
const PUERTO_API = process.env.PORT ?? "3000";

export default defineConfig({
  root: RAIZ_WEB,
  plugins: [svelte()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": `http://localhost:${PUERTO_API}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});

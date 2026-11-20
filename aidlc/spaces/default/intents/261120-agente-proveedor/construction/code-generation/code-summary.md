# Resumen de código — Bolt 3

Registros previos: `bolt-1/code-summary.md`, `bolt-2/code-summary.md`.

## Archivos creados / modificados

- Nuevo `web/`: `index.html`, `vite.config.ts` (root `web/`, proxy `/api`, puerto 5173 fijo, salida `web/dist`), `svelte.config.js`, `tsconfig.json` (DOM, para svelte-check), `src/main.ts`, `src/App.svelte`, `src/app.css`, `src/lib/{tipos,api,sesion,chat.svelte,formato}.ts`, `src/componentes/{Encabezado,ListaMensajes,Mensaje,TarjetaHerramienta,BarraConfirmacion,EntradaMensaje,Pensando}.svelte`, `src/pruebas/datos.ts`.
- Pruebas front: `web/src/lib/{api,sesion,chat}.test.ts`, `web/src/componentes/{TarjetaHerramienta,BarraConfirmacion}.test.ts`, `web/src/App.test.ts`.
- Modificados: `package.json` (deps Svelte/Vite/testing/concurrently; scripts `dev`, `build`, `start`, `check:web`; `typecheck` incluye svelte-check), `vitest.config.ts` (proyectos `node` y `web`), `tsconfig.json`, `eslint.config.js`, `.gitignore` (`web/dist/`), `src/server.ts` (sirve `web/dist` fuera de `/api/*`), `tests/api/server.test.ts` (+4).

## Decisiones clave

- Svelte 5 solo con runes; `ChatEstado` (`.svelte.ts`) con dependencias inyectables y contador de generación que descarta respuestas tardías; cabecera con equivalencias Angular.
- Tipos del front importados de `src/agente/tipos.ts` (sin duplicar).
- Cliente API nunca lanza; timeout 90 s; valida forma de respuesta; 404 de sesión = `null`.
- Texto del agente en texto plano `pre-wrap`; sin `{@html}` (verificado: solo aparece en comentarios). Bundle sin rastro de clave ni SDK.
- `check:web` con `--fail-on-warnings`: avisos de accesibilidad rompen el typecheck.
- El servidor solo sirve el front si existe `web/dist/index.html`.

## Pruebas

- `npx vitest run`: 23 archivos, **189/189** (node 154 = 150 previas + 4 estáticos; web 35 en jsdom). Verificado de nuevo por el orquestador.
- `npm run typecheck` (tsc + svelte-check 0 errores/0 avisos), `npm run lint`, `npm run build` (JS 63,5 kB / 24,4 kB gzip): limpios.
- `npm run dev`: `:5173/` sirve el chat, proxy `/api/health` y `/api/chat` (sin clave → mensaje claro). `npm run build && npm start`: `:3000/` sirve el chat y la API.

Pruebas no ejecutadas aquí: humo en navegador real (Chromium) y turno real con `ANTHROPIC_API_KEY`; quedan para Build and Test / la persona. Las pruebas del front corren en jsdom (evidencia de integración, no de navegador).

## Desviaciones del plan

1. `dev` arranca la API con `node --import tsx --watch src/server.ts`: `tsx watch` dentro de `concurrently` no llegaba a abrir el puerto (proxy 502). `dev:api` sin cambios.
2. El front se comprueba con `web/tsconfig.json` vía svelte-check, no con el tsconfig raíz.
3. Archivos extra: `web/src/lib/formato.ts`, `web/src/pruebas/datos.ts`.
4. `check:web` con `--tsconfig ./tsconfig.json --fail-on-warnings`.

## Pendientes observados

- "Pensando" vive dentro de la región `role="log"` sin `role="status"` propio: revisar en navegador real.
- 2 avisos moderados de `npm audit` (uuid vía exceljs) y aviso `allowScripts` de esbuild, previos.

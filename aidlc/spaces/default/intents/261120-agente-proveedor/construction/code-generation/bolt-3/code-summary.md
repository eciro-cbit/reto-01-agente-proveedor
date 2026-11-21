# Bolt 3 — registro archivado

Plan aprobado y construido (Steps 1–11). Build and Test aprobado el 2026-11-20: 189/189 pruebas (node 154 + web 35 en jsdom), tsc + svelte-check sin avisos, lint y `vite build` limpios; humo en Chromium real (Edge headless) del flujo completo con `/api/chat` simulado: tarjetas, confirmación, 360 px, modo oscuro.

## Archivos

- `web/` (Svelte 5 + Vite): `App.svelte`, componentes `Encabezado`, `ListaMensajes`, `Mensaje`, `TarjetaHerramienta`, `BarraConfirmacion`, `EntradaMensaje`, `Pensando`; `lib/{tipos,api,sesion,chat.svelte,formato}.ts`; pruebas jsdom.
- `package.json` scripts `dev` (`concurrently` con `node --import tsx --watch src/server.ts` + Vite), `build`, `start`, `check:web`; `vitest.config.ts` con proyectos `node` y `web`; `src/server.ts` sirve `web/dist`.

## Decisiones

- Svelte 5 solo runes; `ChatEstado` inyectable; tipos importados del backend; sin `{@html}`; `--fail-on-warnings` en svelte-check.

## Pendientes

- "Pensando" sin `role="status"` propio; turno real con Anthropic sin verificar.

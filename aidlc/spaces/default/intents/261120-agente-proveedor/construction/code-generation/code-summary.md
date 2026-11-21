# Resumen de código — Bolt 3.5 (preparación de despliegue)

Registros previos: `bolt-1/`, `bolt-2/`, `bolt-3/`. Origen: `operation/deployment-pipeline/cd-config.md`.

## Archivos

- Nuevos: `src/seguridad/acceso.ts` (comparación en tiempo constante, middleware `exigirClave`), `src/seguridad/limite.ts` (ventana deslizante, `ipCliente`, middleware `limitarPeticiones`), `web/src/lib/acceso.ts`, `web/src/componentes/PantallaAcceso.svelte`, `.github/workflows/ci.yml`, `render.yaml` (idénticos a `cd-config.md`), pruebas `tests/seguridad/*`, `web/src/componentes/PantallaAcceso.test.ts`.
- Modificados: `src/config.ts`, `src/server.ts`, `.env.example`, `web/src/lib/{api,chat.svelte,tipos}.ts`, `web/src/App.svelte`, `web/src/pruebas/datos.ts`; pruebas `tests/api/server.test.ts`, `tests/llm/adapter.test.ts`, `web/src/lib/{api,chat}.test.ts`.

## Decisiones clave

- En `POST /api/chat` el límite corre antes del código de acceso: frena también a quien adivina el código.
- Memoria del limitador acotada: máx. `maximo` marcas por IP, purga de IPs inactivas por ventana, tope 10 000 IPs.
- `server.ts` dejó de pasar la config completa (con la clave del modelo) al ciclo del agente; solo topes.
- Front reacciona al 401 de la primera llamada (no consulta health), reintenta una vez el mensaje pendiente; 429 con segundos de `Retry-After`; rechaza códigos no ASCII imprimibles.
- Clave nunca devuelta ni registrada; el arranque solo dice "con/sin código de acceso".

## Pruebas

- `npx vitest run`: 26 archivos, **229/229** (189 previas + 40 nuevas). Verificado de nuevo por el orquestador.
- typecheck (tsc + svelte-check 0 avisos), lint, build, demo: limpios.
- curl con `CLAVE_ACCESO=prueba-local-123`: health 200 `requiereClave: true`; chat sin header 401, con header 200; sesiones sin header 401; `/` 200; 21 peticiones → la 21 da 429 con `retry-after`.

No ejecutado: primer run real de `ci.yml` (no hay remoto todavía) y despliegue en Render.

## Desviaciones

- Archivo extra `web/src/lib/acceso.ts`.
- El front no usa `requiereClave` de health; reacciona al 401.
- `engines` ya existía.
- 40 pruebas en vez de ~12.
- Dos aserciones exactas existentes actualizadas por el nuevo campo `requiereClave` y la nueva config (sin debilitar criterios).

## Riesgos abiertos

1. `x-forwarded-for` lo puede enviar el cliente; si Render conserva el valor del cliente, el primer valor es falsificable y el límite se puede rotar. Verificar en Render cuál valor agrega su proxy.
2. `GET /api/sessions/*` no tiene límite: permite probar códigos sin freno (solo lectura del historial).
3. Límite en memoria: se reinicia con cada despliegue; una sola instancia.

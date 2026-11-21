# Resultados de build y pruebas — Bolt 3.5 (con regresión de Bolts 1–3)

Fecha: 2026-11-21. Entorno: Windows 11, Node v24.18.0, Microsoft Edge (Chromium) headless.

## Build

| Comando | Exit | Resultado |
|---|---|---|
| `npm ci` | 0 | Limpio |
| `npm run typecheck` (tsc + svelte-check) | 0 | 0 errores, 0 avisos |
| `npm run lint` | 0 | Limpio |
| `npm run build` | 0 | `web/dist` generado |
| `npx js-yaml .github/workflows/ci.yml` / `render.yaml` | 0 | YAML válido, sin tabs |

## Pruebas (cada comando una vez)

| Comando | Dónde corre | Exit | Archivos | Pruebas |
|---|---|---|---|---|
| `npx vitest run --project node tests/seguridad tests/api/server.test.ts` | Node | 0 | 3 | 38/38 |
| `npx vitest run --project web web/src/componentes/PantallaAcceso.test.ts web/src/lib/chat.test.ts` | jsdom | 0 | 2 | 19/19 |
| `npx vitest run` (suite completa) | Node + jsdom | 0 | 26 | **229/229** |

## Servidor con código de acceso (curl, `CLAVE_ACCESO=prueba-local-123`)

- `/api/health` → 200 `{"ok":true,"provider":"anthropic","model":"claude-sonnet-5-5","requiereClave":true}` (sin la clave).
- Verificaciones del desarrollador (repetibles con `tests/api/server.test.ts`): chat sin header 401; con header 200; sesiones sin header 401; `/` 200; petición 21 → 429 con `retry-after`.

## Navegador real (Edge headless, `--disable-extensions`, perfil temporal borrado al terminar)

- `http://localhost:3000/` con `CLAVE_ACCESO` definida renderiza `acceso-pantalla`, `acceso-form`, `acceso-input`, `acceso-enviar` (la primera llamada recibe 401 y la UI pide el código). El flujo con código correcto está cubierto en jsdom (`PantallaAcceso.test.ts`, `chat.test.ts`).

## Demo

`FECHA_REFERENCIA=2026-09-03 npm run demo` → 4/4 casos correctos.

## No ejecutado

- Primer run real de `ci.yml` en GitHub Actions y despliegue en Render: no hay repositorio remoto todavía.
- Turno real contra Anthropic (sin clave).

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-STRATEGY-1 | Testing Contract | Una prueba por cambio del Bolt | Acceso, límite, health, front, CI/CD cubiertos | vitest 229 | build-and-test | Met |
| TC-STRATEGY-2 | Testing Contract | Camino feliz por componente nuevo | acceso.ts, limite.ts, PantallaAcceso | vitest | build-and-test | Met |
| TC-SCOPE-1 | Testing Contract | Suite existente verde | 189 previas siguen verdes | `npx vitest run` | build-and-test | Met |
| TC-PHASE-1 | phases/construction.md | Feliz + ≥2 bordes por archivo | 26/26 | tests | build-and-test | Met |
| NFR2 | requirements.md | Clave nunca expuesta | Health sin clave; config completa ya no llega al ciclo | server.test.ts, curl | build-and-test | Met |
| NFR3 | requirements.md | Topes de costo | + código de acceso y 20 req/min por IP | seguridad/*.test.ts | build-and-test | Met |
| DP-Q2 | deployment-pipeline-questions.md Q2 | Código de acceso + límite por IP | Implementado | tests + curl + Edge | build-and-test | Met |
| DP-Q3 | deployment-pipeline-questions.md Q3 | CI en push/PR a `main` | `ci.yml` válido, igual a cd-config.md | js-yaml | build-and-test | Met |

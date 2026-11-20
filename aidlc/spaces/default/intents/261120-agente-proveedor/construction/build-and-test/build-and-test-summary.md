# Resumen de Build and Test — Bolt 3

## Estado general

Build verde (`npm ci`, tsc + svelte-check, lint, `vite build`). 189/189 pruebas (35 front en jsdom + 154 Node). Humo en Chromium real (Edge headless) del flujo completo con `/api/chat` simulado en el navegador.

## Inventario de tipos de prueba

- Unitarias/integración Node: 154 (Bolts 1–2 + estáticos).
- Front en jsdom: 35 (cliente API, sesión, estado, componentes, recorrido App). Evidencia de integración, no de navegador.
- Humo en navegador real (Chromium): carga, envío, tarjetas, confirmación, 360 px, modo oscuro.

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-STRATEGY-1 | Testing Contract | Una prueba por requisito | Cubierto | cross-unit-traceability.md | build-and-test | Met |
| TC-STRATEGY-2 | Testing Contract | Camino feliz por componente | 23/23 | vitest | build-and-test | Met |
| TC-SCOPE-1 | Testing Contract | Suite existente verde | Verde | `--project node` | build-and-test | Met |
| TC-PHASE-1 | phases/construction.md | Feliz + ≥2 bordes | 23/23 | tests | build-and-test | Met |
| FR11.1 | requirements.md | Chat funcional | Chromium real | humo Edge | build-and-test | Met |
| FR11.2 | requirements.md | Tool calls visibles | Chromium real | humo Edge | build-and-test | Met |
| FR11.3 | requirements.md | Confirmación resaltada | Chromium real | humo Edge | build-and-test | Met |
| NFR6 | requirements.md | Un comando | `npm run dev` / `npm start` | humo + code-summary | build-and-test | Met |
| NFR1–NFR5, NFR7 | requirements.md | Bolts 1–2 | Verdes | `--project node` | build-and-test | Met |

## Preparación

- Build-ready, test-ready: sí.
- Deployment-ready: la app completa (front + API en un proceso) existe; falta el despliegue público y el Bolt 4 (docs y `modulo/`).

## Limitaciones y pendientes

- Turno real contra Anthropic sin verificar (sin clave). El humo de navegador usó respuestas simuladas del backend.
- "Pensando" sin `role="status"` propio (accesibilidad menor).
- NFR6 "< 2 min en máquina limpia" no cronometrado en máquina limpia.
- 4 requisitos del Bolt 4 pendientes: FR12.1, FR12.2, FR13.1, FR13.2.
- `npm audit`: 2 moderadas transitivas (uuid vía exceljs).

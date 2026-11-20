# Resultados de build y pruebas — Bolt 3 (con regresión de Bolts 1–2)

Fecha: 2026-11-20. Entorno: Windows 11, Node v24.18.0, Microsoft Edge (Chromium) headless.

## Build

| Comando | Exit | Resultado |
|---|---|---|
| `npm ci` | 0 | Instalación limpia |
| `npm run typecheck` (tsc + svelte-check `--fail-on-warnings`) | 0 | 0 errores, 0 avisos |
| `npm run lint` | 0 | Limpio |
| `npm run build` | 0 | `web/dist`: JS 63,46 kB (24,37 kB gzip), CSS 7,06 kB |

## Pruebas automatizadas (cada comando una vez)

| Comando | Dónde corre | Exit | Archivos | Pruebas |
|---|---|---|---|---|
| `npx vitest run --project web` | jsdom (emulador de DOM) | 0 | 6 | 35/35 |
| `npx vitest run --project node` (Bolts 1–2 + estáticos) | Node | 0 | 17 | 154/154 |
| **Total** | | | **23** | **189/189** |

## Humo en navegador real (Microsoft Edge headless, Chromium)

Servidor: `npm run build && npm start` en `:3000` sin `ANTHROPIC_API_KEY`. `/api/chat` simulado **dentro del navegador** con CDP `Fetch.fulfillRequest` (respuestas con la forma real del backend), porque sin clave no hay turnos del modelo. Script: `tests/.tmp/humo/cdp.mjs` (no versionado).

| Comprobación | Resultado |
|---|---|
| Carga del chat desde el build servido por Hono | OK; encabezado muestra "Modelo: claude-sonnet-5-5" vía `/api/health` real |
| Escribir y enviar con teclado real (`Input.insertText` + clic) | OK; botón se habilita al escribir |
| Turno 1: 5 tarjetas de herramienta con nombre legible, estado ok, resumen y "Argumentos" plegable | OK (FR11.2) |
| Respuesta que pide confirmación marcada + barra "Sí, enviar / No, todavía no" visible | OK (FR11.3) |
| Clic en "Sí, enviar" → envía "Sí, confirmo el envío"; turno 2 con tarjeta `simular envio`; barra desaparece | OK (CA3) |
| 360 px de ancho: sin scroll horizontal (`scrollWidth` 360 = `clientWidth` 360) | OK |
| `prefers-color-scheme: dark`: fondo `rgb(15, 19, 24)` | OK |
| Capturas | `tests/.tmp/humo/{1280-confirmacion,360-confirmacion,1280-oscuro}.png` |

Hallazgo menor de accesibilidad: el indicador "pensando" no tiene `role="status"` propio (vive dentro de la región `aria-live` de la lista). No es un objetivo medible del Bolt; queda anotado.

Nota de entorno: Edge headless cargó las extensiones del perfil del sistema en el perfil temporal; se cerró la instancia y se borró el perfil (`tests/.tmp/humo/perfil`) al terminar.

## Desarrollo

`npm run dev`: verificado por el desarrollador (`:5173/` sirve el chat, proxy `/api/health` y `/api/chat` correctos).

## Demo

`FECHA_REFERENCIA=2026-09-03 npm run demo` → 4/4 casos correctos, sin cambios.

## No ejecutado

- Turno real contra Anthropic (sin `ANTHROPIC_API_KEY`).

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-STRATEGY-1 | Testing Contract | Una prueba por requisito construido | FR1–FR11, NFR1–NFR7 trazados | cross-unit-traceability.md | build-and-test | Met |
| TC-STRATEGY-2 | Testing Contract | Camino feliz por componente | 23/23 archivos | vitest | build-and-test | Met |
| TC-SCOPE-1 | Testing Contract | Suite existente verde | 150 previas + 4 nuevas node, verde | `--project node` exit 0 | build-and-test | Met |
| TC-PHASE-1 | phases/construction.md | Feliz + ≥2 bordes por archivo | 23/23 | tests/**, web/src/**/*.test.ts | build-and-test | Met |
| FR11.1 | requirements.md | Chat con historial, entrada, "pensando" | Renderizado y envío en Chromium real | humo Edge + App.test.ts (jsdom) | build-and-test | Met |
| FR11.2 | requirements.md | Cada tool call visible | 5 + 1 tarjetas en Chromium real | humo Edge | build-and-test | Met |
| FR11.3 | requirements.md | Confirmación resaltada | Barra visible y funcional en Chromium real | humo Edge | build-and-test | Met |
| NFR6 | requirements.md | Un comando levanta front y back | `npm run dev` y `npm start` verificados | code-summary.md, humo | build-and-test | Met |
| NFR1–NFR5, NFR7 | requirements.md | Ver Bolts 1–2 | Siguen verdes | `--project node` | build-and-test | Met |

Nota: el criterio "< 2 minutos en máquina limpia" de NFR6 se apoya en `npm ci` local (cache caliente); en máquina limpia no se cronometró.

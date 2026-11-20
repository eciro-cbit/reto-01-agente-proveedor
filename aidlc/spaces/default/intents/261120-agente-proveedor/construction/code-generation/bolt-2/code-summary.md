# Bolt 2 — registro archivado

Plan aprobado y construido (Steps 1–12; la prueba manual con clave real quedó sin ejecutar por falta de `ANTHROPIC_API_KEY`). Build and Test aprobado el 2026-11-20: 150/150 pruebas (72 nuevas + 78 del Bolt 1), typecheck y lint limpios, humo del servidor sin clave correcto.

## Archivos

- `agent/prompt.md`, `src/knowledge/registro-proveedor.md`, `src/config.ts`, `src/llm/{adapter,anthropic,index}.ts`, `src/agente/{tipos,sesiones,prompt,herramientas-llm,confirmacion,ciclo}.ts`, `src/server.ts`.
- Deps: `@anthropic-ai/sdk@1.12.0`, `hono@4.13.19`, `@hono/node-server@2.1.11`. Scripts `dev:api`, `start:api`.
- Pruebas: `tests/apoyo/llm-guionizado.ts`, `tests/llm/*`, `tests/agente/*`, `tests/api/server.test.ts`.

## Decisiones clave

- Solo `src/llm/anthropic.ts` importa el SDK; contenido del asistente reenviado como dato opaco `contenidoProveedor`.
- `claude-sonnet-5-5` por defecto, `fallbacks: "default"`, `effort: medium`, `max_tokens: 16000`, caché del system prompt, timeout `LLM_TIMEOUT_MS`.
- Errores traducidos a mensajes fijos en español (la clave no puede filtrarse).
- RN4: confirmación pendiente vale un turno; envío solo con confirmación del mismo caso y mensaje afirmativo sin reservas.
- API Hono: `POST /api/chat`, `GET /api/sessions/:id` (historial visible), `GET /api/health`; cola por sesión; CORS `localhost:5173`.

## Pendientes

- Turno real contra Anthropic sin verificar.
- Tope de tokens revisado antes de cada llamada (la última puede excederlo).

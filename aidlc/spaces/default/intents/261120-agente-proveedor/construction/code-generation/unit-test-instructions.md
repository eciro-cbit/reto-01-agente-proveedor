# Instrucciones de pruebas unitarias — Bolt 3 (front Svelte 5)

## Framework y configuración

- `vitest` con `projects` en `vitest.config.ts`: `node` (pruebas existentes en `tests/**`) y `web` (`web/src/**/*.test.ts`, entorno `jsdom`, plugin de Svelte, `@testing-library/svelte` con `svelteTesting()`).
- Prerrequisito: `npm install` en la raíz. Sin clave ni red: `fetch` se simula con `vi.fn()`.

## Comando de este Bolt

Ejecutable desde el Step 2 del plan:

```bash
npx vitest run --project web
```

Por capa:

```bash
npx vitest run --project web web/src/lib/api.test.ts web/src/lib/sesion.test.ts
npx vitest run --project web web/src/lib/chat.test.ts
npx vitest run --project web web/src/componentes
npx vitest run --project web web/src/App.test.ts
npx vitest run --project node tests/api/server.test.ts
```

Regresión de los Bolts 1–2 (comando propio, debe seguir en verde):

```bash
npx vitest run --project node
```

## Cobertura esperada

- Minimal: una prueba por requisito FR11.1–FR11.3 y NFR6 (servir el build), camino feliz por componente (api, sesión, estado del chat, TarjetaHerramienta, BarraConfirmacion, App, servidor de estáticos).
- Cada archivo: feliz + ≥2 bordes o errores. Sin piso de cobertura de líneas. Total estimado: ~15 pruebas nuevas.
- Dónde corre: las pruebas del front corren en **jsdom** (emulador de DOM), por lo tanto son evidencia de integración, no de navegador. El comportamiento en un navegador real (Chromium) se comprueba con un humo manual en Build and Test.

## Mocks y stubs

- `fetch`: `vi.fn()` que devuelve respuestas con la forma real del backend (`{ reply, toolCalls, needsConfirmation }`), construidas a partir de los tipos de `src/agente/tipos.ts`.
- `localStorage`: el de jsdom; para el caso de error, un stub que lanza.

## Datos de prueba

- Respuestas de ejemplo: flujo de `ec-corp-andina` (5 toolCalls, `needsConfirmation: true`) y segundo turno de envío.
- Prueba de estáticos: `dist` falso con un `index.html` mínimo en `tests/.tmp/<id>/web/dist/`.

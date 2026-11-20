## Summary

- Builds: Bolt 3 — front de chat en Svelte 5 (runes) + Vite: historial, entrada, "pensando", tarjetas de tool call (nombre, argumentos, resultado resumido) y confirmación resaltada; `npm run dev` único para front + back; build servido por el mismo backend
- Touches: `web/` (nuevo), `package.json` (deps + scripts `dev`, `build`, `start`), `vitest.config.ts` (proyecto `web` con jsdom), `tsconfig.json`/`eslint.config.js` (incluir `web/`), `src/server.ts` (servir `web/dist`), `.gitignore` (`web/dist/`), `tests/api/server.test.ts` (estáticos)
- Tests: ~15 pruebas vitest nuevas del front en jsdom (cliente API, estado, componentes, recorrido del chat con fetch simulado) + humo en navegador real en Build and Test; suites de Bolts 1–2 (150) en verde

# Plan de generación de código — Bolt 3

Alcance: FR11.1–FR11.3 y NFR6 de `inception/requirements-analysis/requirements.md`, más PRD §6.1 (front: historial, entrada, "pensando", cada tool call visible, confirmación resaltada) y CA3/CA4/CA5 vistos desde el usuario. Registros previos: `bolt-1/code-summary.md`, `bolt-2/code-summary.md`. El Bolt 4 (`modulo/`, `SOLUCION.md`, `README.md`) queda fuera.

## Decisiones técnicas

| Tema | Decisión | Alternativa descartada |
|---|---|---|
| Framework | **Svelte 5** con runes (`$state`, `$derived`, `$effect`, `$props`) + **Vite** + TypeScript (Q4 = A). Equivalencias para alguien de Angular: `$state` ≈ `signal()`, `$derived` ≈ `computed()`, `$effect` ≈ `effect()`, `$props` ≈ `input()`; estado compartido en una clase `.svelte.ts` ≈ servicio inyectable | SvelteKit: router y SSR que el chat no necesita |
| Paquetes | Un solo `package.json` en la raíz (un `npm install` para todo, NFR6 < 2 min); `web/` solo contiene código y config de Vite | Workspace aparte en `web/`: dos instalaciones y scripts más largos |
| Dev | `npm run dev` = `concurrently` de `dev:api` (Hono, :3000) y `vite` (:5173) con proxy `/api` → `:3000`; el front llama siempre a rutas relativas `/api/...` | Llamar `http://localhost:3000` desde el front: CORS y URL distinta en producción |
| Producción | `npm run build` (vite build a `web/dist`) y `npm start`: el mismo servidor Hono sirve la API y los estáticos (`serveStatic` de `@hono/node-server`). Un solo proceso facilita el link público | Servir el front en otro host: dos despliegues |
| Sesión | `sessionId` = `crypto.randomUUID()` guardado en `localStorage` (con try/catch); botón "Nueva conversación"; al cargar recupera el historial con `GET /api/sessions/:id` | Sin persistencia: se pierde al recargar |
| Texto del agente | Se muestra como texto plano con saltos de línea (`white-space: pre-wrap`), sin `{@html}` | Renderizar Markdown: requiere sanitizar HTML (riesgo XSS) y otra dependencia |
| Tool calls | Tarjeta por llamada: nombre, estado ok/error, argumentos (JSON plegable) y resultado resumido; `agente_solicitar_confirmacion` se muestra como aviso destacado | Ocultar detalles: el PRD exige verlas |
| Confirmación | Con `needsConfirmation: true`, la última respuesta lleva borde/ícono de alerta y aparece una barra con "Sí, enviar" (manda "Sí, confirmo el envío") y "No, todavía no" (manda "No envíes todavía"); el usuario también puede escribir | Solo resaltar sin acciones |
| Pruebas | `vitest` con un segundo proyecto `web` (entorno `jsdom`, plugin de Svelte) y `@testing-library/svelte`; el proyecto Node existente no cambia. Se suma humo en navegador real (Chromium) durante Build and Test | Playwright E2E automatizado: descarga de navegadores, más pesado de lo que pide la estrategia Minimal |
| Accesibilidad | Lista de mensajes con `aria-live="polite"`, botones con texto, foco en la entrada tras enviar, `data-testid` en elementos interactivos | — |

## Estructura objetivo

```
web/
  index.html
  vite.config.ts            # plugin svelte, proxy /api, outDir web/dist
  svelte.config.js
  src/
    main.ts
    App.svelte              # layout: encabezado, lista, barra de confirmación, entrada
    app.css                 # tokens de color, claro/oscuro, layout responsive
    lib/
      tipos.ts              # RespuestaChat, ToolCallVisible, MensajeVisible (espejo del contrato del backend)
      api.ts                # enviarMensaje, obtenerSesion, obtenerSalud (fetch con timeout y errores claros)
      chat.svelte.ts        # clase ChatEstado con runes: mensajes, pensando, needsConfirmation, error
      sesion.ts             # sessionId en localStorage
    componentes/
      Encabezado.svelte     # título, modelo (health), nueva conversación
      ListaMensajes.svelte
      Mensaje.svelte
      TarjetaHerramienta.svelte
      BarraConfirmacion.svelte
      EntradaMensaje.svelte
      Pensando.svelte
```

## Pasos

Trazabilidad: FR/NFR = `requirements.md`; CA = PRD §6.3.

### Step 1: Dependencias, scripts y configuración (NFR6)
- [x] `npm install -D svelte vite @sveltejs/vite-plugin-svelte svelte-check @testing-library/svelte @testing-library/user-event jsdom concurrently` (versiones estables actuales).
- [x] Scripts: `dev` (`concurrently -n api,web "npm:dev:api" "vite --config web/vite.config.ts"`), `build` (`vite build --config web/vite.config.ts`), `start` (`tsx src/server.ts`), `check:web` (`svelte-check --workspace web`). `typecheck` añade `svelte-check`. Los scripts existentes se conservan.
- [x] `web/vite.config.ts` (root `web/`, proxy `/api` → `http://localhost:${PORT ?? 3000}`, `build.outDir` `web/dist`), `web/svelte.config.js`, `web/index.html`.
- [x] `tsconfig.json` y `eslint.config.js`: incluir `web/src` (lint de `.ts`; `.svelte` lo revisa `svelte-check`).
- [x] `.gitignore`: añadir `web/dist/`.

### Step 2: Runner de pruebas del front
- [x] `vitest.config.ts` con `projects`: `node` (lo actual: `tests/**/*.test.ts`) y `web` (`web/src/**/*.test.ts`, entorno `jsdom`, plugin de Svelte y `svelteTesting()`).
- [x] Verificar que `npx vitest run --project web` arranca y que `npx vitest run --project node` sigue dando 150/150.

### Step 3: Modelo de datos — tipos y cliente de la API (FR11.2, CA5)
- [x] `web/src/lib/tipos.ts`: tipos espejo de `{ reply, toolCalls[], needsConfirmation }` y del historial de `GET /api/sessions/:id`, tomados de `src/agente/tipos.ts` (import de tipos, sin duplicar si el compilador lo permite).
- [x] `web/src/lib/api.ts`: `enviarMensaje`, `obtenerSesion`, `obtenerSalud`; timeout del navegador (90 s, mayor que el del LLM); errores de red, 4xx y 5xx convertidos en mensajes claros en español; nunca lanza hacia la UI.
- [x] `web/src/lib/sesion.ts`: leer/crear/reiniciar `sessionId` con `localStorage` protegido por try/catch.

### Step 4: Modelo de datos — pruebas
- [x] `web/src/lib/api.test.ts` (fetch simulado): respuesta 200 se tipa bien; 400/500 → mensaje claro; error de red y timeout → mensaje claro sin lanzar.
- [x] `web/src/lib/sesion.test.ts`: crea y reutiliza el id; `localStorage` que lanza → id en memoria.

### Step 5: Lógica de UI — estado del chat (FR11.1, FR11.3, CA3)
- [x] `web/src/lib/chat.svelte.ts`: clase `ChatEstado` con `$state` (mensajes, `pensando`, `needsConfirmation`, `error`) y `$derived` (puede enviar); `enviar(texto)` agrega el mensaje del usuario, marca `pensando`, llama a la API, agrega la respuesta con sus toolCalls, actualiza `needsConfirmation`; un error queda como mensaje de error en el chat y el estado se recupera; `cargarHistorial()`; `nuevaConversacion()`.

### Step 6: Lógica de UI — pruebas
- [x] `web/src/lib/chat.test.ts`: envío feliz agrega usuario + agente con toolCalls; `needsConfirmation` se refleja y se apaga en el siguiente turno; error de API deja mensaje de error y permite reenviar; no envía texto vacío ni mientras `pensando`.

### Step 7: Frontend — componentes (FR11.1–FR11.3)
- [x] `TarjetaHerramienta.svelte`: nombre legible (`proveedor_armar_paquete` → "armar paquete"), badge ok/error, argumentos en `<details>` con JSON formateado, resultado resumido; variante destacada para `agente_solicitar_confirmacion`.
- [x] `Mensaje.svelte` (usuario / agente / error; texto plano `pre-wrap`; tarjetas de sus toolCalls; marca de "pide confirmación"), `ListaMensajes.svelte` (`aria-live`, autoscroll), `Pensando.svelte`, `EntradaMensaje.svelte` (Enter envía, Shift+Enter salto, deshabilitada mientras piensa), `BarraConfirmacion.svelte` (visible solo con `needsConfirmation`; "Sí, enviar" / "No, todavía no"), `Encabezado.svelte` (modelo desde `/api/health`, "Nueva conversación").
- [x] `App.svelte` + `app.css`: layout de chat a pantalla completa, ancho máximo legible, responsive desde 360 px, colores con tokens y modo oscuro, `data-testid` en controles.
- [x] Mensaje de bienvenida con el prompt de ejemplo del PRD §11 como sugerencia clicable.

### Step 8: Frontend — pruebas (jsdom)
- [x] `web/src/componentes/TarjetaHerramienta.test.ts`: muestra nombre, argumentos y resultado; error con estilo de error; variante de confirmación.
- [x] `web/src/componentes/BarraConfirmacion.test.ts`: oculta sin `needsConfirmation`; visible y destacada con él; "Sí, enviar" dispara el envío del texto de confirmación.
- [x] `web/src/App.test.ts` (fetch simulado): recorrido "Procesa el caso ec-corp-andina…" → aparecen "pensando", luego la respuesta con 5 tarjetas y la barra de confirmación; clic en "Sí, enviar" → segundo turno sin barra; error del backend → mensaje claro y la entrada sigue habilitada.

### Step 9: API / endpoint — backend sirve el front (NFR6)
- [x] `src/server.ts`: si existe `web/dist`, servirlo con `serveStatic` para rutas que no son `/api/*` (fallback a `index.html`); sin `web/dist` no cambia nada. Sin reglas de negocio nuevas.
- [x] `tests/api/server.test.ts`: con un `dist` de prueba en `tests/.tmp`, `GET /` devuelve el HTML; `/api/health` sigue respondiendo JSON; sin `dist` → 404 en `/` sin romper la API.

### Step 10: Configuración de entorno/build — verificación local
- [x] `npm run typecheck` (incluye `svelte-check`), `npm run lint`, `npx vitest run` (proyectos `node` y `web`), `npm run build`, `npm run demo` en verde.
- [x] `npm run dev` levanta API y front; `http://localhost:5173` carga el chat; sin clave el chat muestra el mensaje claro de falta de `ANTHROPIC_API_KEY`.
- [x] `npm run build && npm start`: `http://localhost:3000` sirve el chat.

### Step 11: Documentación y trazabilidad
- [x] Comentarios breves en `chat.svelte.ts` y `api.ts`; notas de Svelte 5 ↔ Angular en un comentario de cabecera de `chat.svelte.ts` (README en el Bolt 4).

## Fuera de este Bolt

`modulo/`, `SOLUCION.md`, `README.md` (Bolt 4); despliegue público (Deployment Pipeline).

## Testing Contract

```json
{
  "version": 1,
  "methodology": "test-after",
  "source": "org",
  "ordering": "implement each applicable testable layer, then write and run that layer's tests.",
  "scope": "express",
  "test_strategy": "minimal",
  "project_type": "greenfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    }
  ],
  "obligations": {
    "strategy": "minimal",
    "strategy_volume": [
      "One verifiable test per requirement at the narrowest effective level.",
      "At least one happy-path unit test per component.",
      "Unit tests are the default; a bugfix/security scope floor may require an integration or E2E regression when that is the narrowest level that reproduces the defect."
    ],
    "scope_floor": [
      "Keep the existing test suite green.",
      "This scope adds no extra new-test floor beyond the selected test strategy."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "test-after",
    "runner_step": "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
      "Data model / database behavior - implement.",
      "Data model / database behavior - write and run its tests after implementation.",
      "Repository / data access - implement.",
      "Repository / data access - write and run its tests after implementation.",
      "Business logic - implement.",
      "Business logic - write and run its tests after implementation.",
      "API / endpoint - implement.",
      "API / endpoint - write and run its tests after implementation.",
      "Frontend behavior - implement.",
      "Frontend behavior - write and run its tests after implementation.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:6cb23162168334768ff8f29699669845616670119c9eb58bf9bb05af6fefd3de",
  "contract_sha256": "sha256:283a836cf0757ed2efa4b5dd3135f3986eb59880b3017f4ba87a685cfebedfdb"
}
```

Mapa de capas: "Data model" = tipos y cliente API del front; "Repository / data access" = sesión en `localStorage` (incluida en el Step 3–4); "Business logic" = estado del chat; "API / endpoint" = backend sirviendo el front; "Frontend behavior" = componentes.

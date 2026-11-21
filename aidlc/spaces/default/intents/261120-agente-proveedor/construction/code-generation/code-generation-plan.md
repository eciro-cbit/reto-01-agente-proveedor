## Summary

- Builds: Bolt 3.5 — preparación para Render: código de acceso (`CLAVE_ACCESO`, header `x-clave-acceso`) en backend y front, límite de peticiones por IP en `/api/chat`, `engines`, `.github/workflows/ci.yml` y `render.yaml`
- Touches: `src/config.ts`, `src/server.ts`, nuevo `src/seguridad/{acceso,limite}.ts`, `web/src/lib/{api,chat.svelte}.ts`, nuevo `web/src/componentes/PantallaAcceso.svelte`, `web/src/App.svelte`, `package.json` (`engines`), `.env.example`, nuevos `.github/workflows/ci.yml` y `render.yaml`, pruebas
- Tests: ~12 pruebas vitest nuevas (acceso 401/200, health público, comparación segura, límite 429 y reinicio de ventana, IP desde `x-forwarded-for`, pantalla de acceso y reintento en el front) + las 189 existentes en verde

# Plan de generación de código — Bolt 3.5 (preparación de despliegue)

Origen: `operation/deployment-pipeline/cd-config.md` § "Cambios de código necesarios antes del primer despliegue", aprobado en Deployment Pipeline (Q1 Render, Q2 código de acceso + límite por IP, Q3 CI en GitHub Actions sobre `main`). Refuerza NFR2/NFR3 (seguridad y costo) y FR11.1 (el front pide el código). Registros previos: `bolt-1/`, `bolt-2/`, `bolt-3/`. El Bolt 4 (`modulo/`, docs) queda fuera.

## Decisiones técnicas

| Tema | Decisión | Alternativa descartada |
|---|---|---|
| Código de acceso | Middleware Hono en `/api/chat` y `/api/sessions/*`: exige `x-clave-acceso` igual a `CLAVE_ACCESO` con `crypto.timingSafeEqual` sobre hashes SHA-256 (longitud fija). Si `CLAVE_ACCESO` no está definida (local, pruebas existentes), no exige nada. `/api/health` y los estáticos quedan públicos. 401 con mensaje en español | Basic auth del navegador: diálogo feo y sin control de mensaje; login con usuarios: fuera de alcance (PRD §3.2) |
| Límite por IP | Ventana deslizante en memoria (`Map<ip, timestamps>`), `LIMITE_PETICIONES_MINUTO` (20) solo en `POST /api/chat`; IP = primer valor de `x-forwarded-for` (Render pone proxy), si no la del socket; limpieza periódica para no crecer sin límite; 429 con `Retry-After` y mensaje claro | Paquete externo de rate-limit: una dependencia más para ~40 líneas; Redis: fuera de alcance |
| Front | `PantallaAcceso.svelte` cuando `/api/health` informa `requiereClave: true` o una llamada devuelve 401; guarda el código en `sessionStorage` (try/catch) y lo envía en cada llamada; 401 posterior → borra y vuelve a pedir; 429 → mensaje "demasiadas solicitudes, espera N s" | Pedir el código en cada mensaje: mala experiencia |
| Health | `/api/health` añade `requiereClave: boolean` (nunca la clave) | Que el front descubra la protección por prueba y error |
| CI / CD | `ci.yml` y `render.yaml` exactamente como `cd-config.md`; `"engines": { "node": ">=20" }` | — |

## Pasos

### Step 1: Configuración (NFR2, NFR3)
- [x] `src/config.ts`: `CLAVE_ACCESO` opcional (si viene, mínimo 8 caracteres o error claro al arrancar) y `LIMITE_PETICIONES_MINUTO` (entero > 0, default 20).
- [x] `.env.example`: `CLAVE_ACCESO=` y `LIMITE_PETICIONES_MINUTO=20`. `package.json`: `"engines": { "node": ">=20" }`.

### Step 2: Runner de pruebas
- [x] Sin cambios de configuración; verificar que `npx vitest run` sigue en 189/189 antes de editar (línea base).

### Step 3: Lógica de negocio — seguridad del backend
- [x] `src/seguridad/acceso.ts`: `claveValida(enviada, esperada)` con comparación en tiempo constante; middleware `exigirClave(config)`.
- [x] `src/seguridad/limite.ts`: `crearLimitador({ maximo, ventanaMs, ahora })` con reloj inyectable; `ipCliente(c)`; middleware `limitarPeticiones`.

### Step 4: Lógica de negocio — pruebas
- [x] `tests/seguridad/acceso.test.ts`: clave correcta pasa; incorrecta o ausente falla; longitudes distintas no lanzan.
- [x] `tests/seguridad/limite.test.ts`: 20 pasan y la 21 se rechaza con segundos de espera; tras la ventana vuelve a pasar (reloj inyectado); IPs distintas no se afectan; `x-forwarded-for` con varias IPs toma la primera.

### Step 5: API / endpoint — servidor
- [x] `src/server.ts`: aplicar `exigirClave` a `/api/chat` y `/api/sessions/*`, `limitarPeticiones` a `POST /api/chat`; `/api/health` con `requiereClave`; CORS permite el header `x-clave-acceso`.

### Step 6: API / endpoint — pruebas
- [x] `tests/api/server.test.ts` (+): con `CLAVE_ACCESO` definida: chat sin header → 401, con header correcto → 200, health sin header → 200 con `requiereClave: true` y sin la clave en el cuerpo, `/` (estáticos) sin header → 200; 21 peticiones seguidas → 429; sin `CLAVE_ACCESO`: todo como antes.

### Step 7: Frontend — acceso y límites (FR11.1)
- [x] `web/src/lib/api.ts`: enviar `x-clave-acceso` si hay código; resultados tipados para 401 (`requiereClave`) y 429 (`esperaSegundos`).
- [x] `web/src/lib/chat.svelte.ts`: estado `necesitaClave`, `guardarClave(codigo)`, reintento del último mensaje tras ingresar el código; 429 como mensaje de error claro.
- [x] `web/src/componentes/PantallaAcceso.svelte` (campo tipo password, botón, error si el código es rechazado, `data-testid`) y uso en `App.svelte`.

### Step 8: Frontend — pruebas (jsdom)
- [x] `web/src/componentes/PantallaAcceso.test.ts`: envía el código; muestra error tras 401.
- [x] `web/src/lib/chat.test.ts` (+): 401 activa `necesitaClave`; tras guardar el código reintenta y envía el header; 429 muestra el mensaje con segundos.

### Step 9: Configuración de entorno/build — CI y Render
- [x] `.github/workflows/ci.yml` y `render.yaml` con el contenido de `operation/deployment-pipeline/cd-config.md`.
- [x] Verificación local: `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build`, `npm run demo`; `npm start` con `CLAVE_ACCESO=prueba-local-123` y curl: health 200 (`requiereClave: true`), chat sin header 401, con header 200.

### Step 10: Documentación y trazabilidad
- [x] Comentarios breves en `acceso.ts` y `limite.ts` (por qué tiempo constante, por qué `x-forwarded-for`). README en el Bolt 4.

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

Capas "Data model" y "Repository" no aplican (sin entidades ni persistencia nuevas).

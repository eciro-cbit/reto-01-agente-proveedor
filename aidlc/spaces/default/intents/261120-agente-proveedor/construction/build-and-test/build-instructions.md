# Instrucciones de build — Bolt 1

## Prerrequisitos

- Node 20+ (verificado con Node v24.18.0) y npm. Bun opcional (no verificado en esta máquina).
- Sin servicios locales ni claves: Bolt 1 no usa red ni proveedor LLM.

## Instalación de dependencias

```bash
npm ci
```

`npm ci` avisa que `esbuild` tiene un script `postinstall` no aprobado por `allowScripts`; las pruebas y `tsx` funcionan igual porque esbuild trae su binario como dependencia opcional por plataforma. Si en otra máquina falla `tsx`, ejecutar `npm approve-scripts esbuild` y reinstalar.

## Variables de entorno

- `FECHA_REFERENCIA` (opcional, `AAAA-MM-DD`): fecha contra la que se evalúan vigencias. Vacía = fecha del sistema. Ver `.env.example`.

## Build / verificación

No hay paso de compilación (TypeScript se ejecuta con `tsx` / Bun). La verificación de build es:

```bash
npm run typecheck   # tsc --noEmit, modo estricto
npm run lint        # eslint, no-explicit-any en error
```

## Ejecución

```bash
npm run demo                                # fecha del sistema
FECHA_REFERENCIA=2026-09-03 npm run demo    # escenario del PRD
bun run demo.ts                             # alternativa con Bun
```

Salida en `out/` (se limpia al inicio de cada demo).

## API del agente (Bolt 2)

Variables (ver `.env.example`): `ANTHROPIC_API_KEY` (secreta, solo en el entorno del backend), `LLM_MODELO` (`claude-sonnet-5-5`), `LLM_TIMEOUT_MS` (60000), `MAX_ITERACIONES` (25), `MAX_TOKENS_SESION` (200000), `PORT` (3000).

```bash
npm run dev:api     # tsx watch src/server.ts
npm run start:api   # tsx src/server.ts
curl localhost:3000/api/health
curl -X POST localhost:3000/api/chat -H 'content-type: application/json' \
  -d '{"sessionId":"demo-1","message":"Procesa el caso \"ec-corp-andina\". No envíes nada todavía."}'
```

Sin clave el servidor arranca igual: `/api/health` responde y `/api/chat` explica que falta `ANTHROPIC_API_KEY`.

## App completa (Bolt 3)

```bash
npm run dev                  # API :3000 + Vite :5173 (proxy /api); abrir http://localhost:5173
npm run build && npm start   # build en web/dist; un solo proceso sirve chat + API en http://localhost:3000
npm run typecheck            # tsc + svelte-check (avisos de accesibilidad fallan)
npx vitest run --project web # pruebas del front (jsdom)
```

## Problemas comunes

- `ERR_UNKNOWN_FILE_EXTENSION .ts`: ejecutar con `npm run demo` (usa `tsx`), no con `node demo.ts`.
- `FECHA_REFERENCIA inválida`: usar formato `2026-09-03`.
- Windows/PowerShell: `$env:FECHA_REFERENCIA="2026-09-03"; npm run demo`.

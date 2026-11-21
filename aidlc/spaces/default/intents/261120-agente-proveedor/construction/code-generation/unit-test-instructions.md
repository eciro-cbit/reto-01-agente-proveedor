# Instrucciones de pruebas unitarias — Bolt 3.5 (acceso, límite, CI/CD)

## Framework

- `vitest` existente: proyecto `node` (`tests/**`) y `web` (`web/src/**`, jsdom). Sin cambios de configuración. Prerrequisito: `npm install`. Sin red ni clave del modelo.

## Comando de este Bolt

```bash
npx vitest run --project node tests/seguridad tests/api/server.test.ts
npx vitest run --project web web/src/componentes/PantallaAcceso.test.ts web/src/lib/chat.test.ts
```

Regresión completa (comando propio, debe seguir en verde):

```bash
npx vitest run
```

## Cobertura esperada

- Minimal: una prueba por cambio (acceso, health público, límite 429, IP de proxy, pantalla de acceso, reintento del front) y camino feliz por componente nuevo (`acceso.ts`, `limite.ts`, `PantallaAcceso.svelte`). Cada archivo: feliz + ≥2 bordes. Sin piso de líneas. ~12 pruebas nuevas.

## Mocks y stubs

- Reloj inyectado en el limitador (sin `setTimeout` reales).
- Clave de acceso de prueba `prueba-local-123` inyectada en el `env` de `crearApp`; nunca valores reales.
- `fetch` simulado en el front con respuestas 401 / 429 / 200.

## Datos de prueba

- Escrituras solo en `tests/.tmp/<id>/`.
- `ci.yml` y `render.yaml` se validan en Build and Test (YAML parseable y contenido igual a `cd-config.md`); el primer run real de CI ocurre al hacer push al repo.

# Resumen de Build and Test — Bolt 3.5

## Estado general

Build verde, 229/229 pruebas, YAML de CI y Render válidos, pantalla de acceso verificada en Chromium real.

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-STRATEGY-1 | Testing Contract | Una prueba por cambio | Cubierto | vitest | build-and-test | Met |
| TC-STRATEGY-2 | Testing Contract | Camino feliz por componente | Cubierto | vitest | build-and-test | Met |
| TC-SCOPE-1 | Testing Contract | Suite existente verde | 189 + 40 | vitest | build-and-test | Met |
| TC-PHASE-1 | phases/construction.md | Feliz + ≥2 bordes | 26/26 | tests | build-and-test | Met |
| NFR2 | requirements.md | Clave nunca expuesta | Sí | server.test.ts | build-and-test | Met |
| NFR3 | requirements.md | Topes de costo | + acceso + límite IP | seguridad tests | build-and-test | Met |
| DP-Q2 | deployment-pipeline Q2 | Acceso + límite | Implementado | tests + Edge | build-and-test | Met |
| DP-Q3 | deployment-pipeline Q3 | CI en `main` | ci.yml válido | js-yaml | build-and-test | Met |

## Preparación

- Build-ready, test-ready: sí. Deployment-ready: sí en código; falta el repositorio remoto para que corran CI y Render.

## Riesgos abiertos

1. `x-forwarded-for` puede venir del cliente; confirmar en Render qué valor agrega su proxy antes de confiar en el límite.
2. `GET /api/sessions/*` sin límite (permite probar códigos sin freno).
3. Límite en memoria, una instancia, se reinicia por despliegue.
4. Turno real con Anthropic sin verificar.

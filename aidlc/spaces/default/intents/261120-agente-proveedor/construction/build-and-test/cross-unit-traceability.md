# Trazabilidad final de cobertura — tras el Bolt 3

Fuente: `aidlc engine sensor-traceability --stage build-and-test`. Trabajo sin Units (express).

**Veredicto: FAIL (esperado).** 47 IDs construidos (Bolts 1–3). Los 4 sin cubrir son del Bolt 4.

## Cubiertos

| ID | Archivo |
|---|---|
| FR1.1–FR8.3 | Bolt 1 (`bolt-1/code-summary.md`) |
| FR9.1–FR10.3, NFR2–NFR4 | Bolt 2 (`bolt-2/code-summary.md`) |
| FR11.1 | web/src/App.svelte |
| FR11.2 | web/src/componentes/TarjetaHerramienta.svelte |
| FR11.3 | web/src/componentes/BarraConfirmacion.svelte |
| NFR6 | package.json (`dev`, `build`, `start`) |
| NFR1, NFR5, NFR7 | tests/demo.test.ts, eslint.config.js, src/dominio/fixtures.ts |

## Sin cubrir (diferidos)

| ID | Bolt dueño |
|---|---|
| FR12.1, FR12.2 | Bolt 4 (`modulo/` reutilizando las mismas piezas) |
| FR13.1, FR13.2 | Bolt 4 (`SOLUCION.md`, `README.md`) |

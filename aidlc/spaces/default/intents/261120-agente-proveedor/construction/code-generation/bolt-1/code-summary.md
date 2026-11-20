# Bolt 1 — registro archivado

Plan aprobado y construido completo (Steps 1–15 marcados): herramientas `proveedor_*` con zod, runner, dominio (mapeo, vigencias, xlsx/pdf/portal, paquete) y `demo.ts`. Build and Test aprobado el 2026-11-20: 78/78 pruebas, typecheck y lint limpios, demo igual al oráculo 2.4 en ambas fechas. El plan original queda en el historial de auditoría de esta etapa; el archivo `code-generation-plan.md` pasa a contener el plan del Bolt 2.

## Archivos del Bolt 1

- Configuración: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.env.example`; `.gitignore` (+ `tests/.tmp/`).
- Contrato: `src/tools/tipos.ts`, `src/tools/proveedor.ts`, `src/tools/runner.ts`.
- Dominio: `src/dominio/{esquemas,fixtures,salida,registro,reglas,mapeo,vigencia,documentos,paquete}.ts`, `src/dominio/formularios/{comun,xlsx,pdf,portal,generar}.ts`.
- `demo.ts`; pruebas en `tests/` (10 archivos, 78 pruebas).

## Decisiones clave

- Mapeo por tokens ignora palabras vacías.
- `generar_formulario` relee el valor del maestro (CA2); ruta distinta a la automática = `requiere_confirmacion`.
- `leer_solicitud` devuelve también `de`, `asunto`, `cuerpo`.
- Soportes vencidos se copian marcados; soporte sin archivo = `ausente`.
- Borrador sin valores `banco.*` (RN2), verificado antes de escribir.
- Metadatos xlsx/pdf con la fecha de referencia; PDF idéntico byte a byte.

## Pendientes

- 2 vulnerabilidades moderadas transitivas de exceljs; Bun no verificado; glosario con 38 etiquetas.

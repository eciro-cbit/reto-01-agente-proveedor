# Requirements Analysis — Preguntas

Contexto: análisis de `docs/PRD.md` y de todos los fixtures de `fixtures/reto-01/`. Solo se pregunta lo que no se puede deducir del PRD ni de los fixtures; el resto queda como supuesto documentado en `requirements.md`.

## Q1. [Analista administrativa] Fecha de referencia para decidir si un soporte está vencido

El PRD dice "vigencia_hasta anterior a la fecha de ejecución" (HU-4) y a la vez exige que `demo.ts` sea determinista (NFR Determinismo). Con la fecha de hoy (2026-11-20) quedan vencidos **Cámara de Comercio (2026-09-30)** y **parafiscales (2026-08-31)**, así que ningún caso queda `listo_para_firma`. Con la fecha del PRD (2026-09-03) solo vence parafiscales.

A. Siempre la fecha del sistema (hoy)
B. Siempre una fecha fija (2026-09-03, la del PRD)
C. Fecha del sistema por defecto, con override por variable `FECHA_REFERENCIA` (formato AAAA-MM-DD); `demo.ts` la imprime en el resumen para que el resultado sea reproducible (recomendada)
X. Other (please specify)

[Answer]: C

## Q2. [Analista administrativa] Respuesta de la herramienta cuando el formato es portal (caso pa-logistica-istmo)

HU-3 P2 pide responder `formato no soportado` y además producir `out/<caso>/valores-portal.md`. HU-5 pide que el proceso continúe con lo que sí puede hacer. Hay que decidir la forma del resultado de `proveedor_generar_formulario`.

A. `{ ok: true, data: { ruta: "out/<caso>/valores-portal.md", formato: "portal", soportado: false, aviso: "formato no soportado" } }` — el flujo sigue hasta el paquete sin tratarlo como error (recomendada)
B. `{ ok: false, error: "formato no soportado" }` pero igual se escribe `valores-portal.md` y se informa la ruta en el mensaje
X. Other (please specify)

[Answer]: A

## Q3. [Desarrollador] Runtime y gestor de paquetes

En esta máquina hay Node v24.18.0 y **no** hay Bun. El PRD acepta Bun o Node 20+ y su ejemplo de verificación es `bun install && bun run demo.ts`.

A. Solo Node 24 + npm + `tsx` (cero instalación extra)
B. Solo Bun (instalarlo; runtime más nuevo, ejecuta TS nativo)
C. Código portable sin APIs propias de Bun: scripts que corren con Node + `tsx` y también con `bun run demo.ts` (recomendada: cubre al evaluador con cualquiera de los dos)
X. Other (please specify)

[Answer]: C

## Q4. [Desarrollador] Tecnología del front de chat (Bolt 3)

El PRD limita el front a "React, Svelte, Vue o HTML plano": **Angular no está en la lista**. Tu base es Angular y quieres aprender algo de punta.

A. Svelte 5 + Vite (runes `$state`/`$derived` se parecen a los signals de Angular; muy poco boilerplate; tecnología nueva para ti) (recomendada)
B. Vue 3 + Vite (plantillas y directivas muy parecidas a Angular)
C. React 19 + Vite (la más demandada en el mercado)
D. HTML plano + TypeScript sin framework
X. Other (please specify)

[Answer]: A

## Q5. [Desarrollador] Proveedor de modelo de lenguaje (Bolt 2)

El adaptador `enviar(mensajes, herramientas)` aísla al proveedor, pero la primera implementación necesita uno. La clave será tuya y vivirá solo en una variable de entorno del backend.

A. Anthropic Claude (Sonnet 5.5 para el agente; Haiku 5.5 como opción económica)
B. OpenAI
C. Google Gemini
D. Modelo local (Ollama)
X. Other (please specify)

[Answer]: A

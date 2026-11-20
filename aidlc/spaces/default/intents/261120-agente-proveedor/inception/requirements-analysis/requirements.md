# Requisitos — Agente "Registro como Proveedor" (Reto 01)

Fuentes: `docs/PRD.md` (v2.0, idéntico a `fixtures/reto-01/docs/PRD-01-agente-registro-proveedor 3_0452.md`), todos los archivos de `fixtures/reto-01/`, y las respuestas de `requirements-analysis-questions.md` (Q1–Q5).

## 1. Análisis de intención

La analista administrativa de Periferia transcribe a mano entre 8 y 12 formularios de registro como proveedor al mes. Se construye un agente conversacional que lee la solicitud del cliente, mapea cada campo al repositorio maestro **sin inventar valores**, genera el formulario en el formato pedido (xlsx, pdf o valores para portal), arma el paquete para firma y **pide confirmación humana** antes de cualquier "envío" (simulado). Se evalúa sobre todo: contrato de herramientas tipado con `zod`, ciclo del agente con tope y confirmación, separación prompt / conocimiento / ejecución, y determinismo de `demo.ts`.

Entrega en 4 Bolts (pedido del usuario):

| Bolt | Contenido | Requisitos |
|---|---|---|
| 1 | Herramientas tipadas con zod (P0/P1/P2) + `demo.ts` determinista sin LLM | FR1–FR8, NFR1, NFR4, NFR5, NFR7 |
| 2 | Adaptador LLM (Anthropic) + ciclo del agente + API HTTP + `agent/prompt.md` + conocimiento | FR9, FR10, NFR2, NFR3, NFR4, NFR6 |
| 3 | Front de chat Svelte 5 con tool calls visibles y confirmación resaltada | FR11, NFR6 |
| 4 | Bonus `modulo/` reutilizando las mismas piezas + `SOLUCION.md` + `README.md` | FR12, FR13 |

## 2. Análisis de los fixtures reales

### 2.1 Repositorio maestro (`repositorio/maestro.json`)

- Una sola empresa: Periferia IT Group S.A.S., país `CO`, `nit` `900123456`, `digito_verificacion` `7`.
- Claves en `snake_case`, con objetos anidados: `ingresos_ultimo_ano.{valor,moneda,ano}`, `representante_legal.*`, `contacto_comercial.*`, `contacto_financiero.*`, `banco.*`. El mapeo usa rutas con punto (`banco.swift`).
- Tipos no-string: `numero_empleados` (480), `ingresos_ultimo_ano.valor` (98000000000, moneda COP aparte), `gran_contribuyente`/`autorretenedor` (boolean), `certificaciones` (array).
- `pais` vale `"CO"` (código ISO), no "Colombia".
- No existen en el maestro: número de contribuyente especial, referencias comerciales, identificadores tributarios extranjeros (RUC/RTN).

### 2.2 Glosario (`glosario-campos.json`)

- 37 etiquetas → 27 rutas del maestro. Varias etiquetas convergen en `nit` (`NIT`, `RUC`, `RTN`, `Identificación tributaria`, `Número de identificación fiscal`).
- `Correo electrónico` → `contacto_comercial.email` (no el del representante legal).
- Etiquetas sin uso en los casos: `Departamento / Provincia`, `Tipo de sociedad`, `Matrícula mercantil`, `Contacto financiero`, `Correo de facturación`, etc.
- Ninguna etiqueta del glosario apunta a `ciiu_secundario`, `certificaciones`, `gran_contribuyente`, `autorretenedor`.

### 2.3 Soportes (`repositorio/soportes/index.json`)

| tipo | archivo | vigencia_hasta | Estado a 2026-11-20 (hoy) | Estado a 2026-09-03 (fecha del PRD) |
|---|---|---|---|---|
| camara_comercio | camara-comercio-2026-08.txt | 2026-09-30 | **vencido** | vigente |
| rut | rut-2026.txt | `null` | vigente (no vence) | vigente (no vence) |
| certificacion_bancaria | certificacion-bancaria-2026-08.txt | 2026-12-31 | vigente | vigente |
| parafiscales | parafiscales-2026-07.txt | 2026-08-31 | **vencido** | **vencido** |
| estados_financieros | estados-financieros-2025.txt | 2027-03-31 | vigente | vigente |
| certificado_iso_9001 | iso-9001-2025.txt | 2028-05-20 | vigente | vigente |

- Todos los archivos `.txt` existen y son placeholders; todos `pais_emisor: CO`.
- **No existe** `certificado_cumplimiento_tributario` (lo exige ec-corp-andina).

### 2.4 Casos

| Caso | Formato | País | Plantilla | Campos | Llenos | Requiere confirmación | Faltantes | Soportes exigidos |
|---|---|---|---|---|---|---|---|---|
| co-industrias-delta | xlsx | CO | `plantilla-celdas.json`: 2 hojas (`Datos Proveedor` B3:C15, `Datos Bancarios` B3:C6) | 17 | 17 | 0 | 0 | camara_comercio, rut, certificacion_bancaria, estados_financieros |
| ec-corp-andina | pdf | EC | `plantilla-campos.json`: 15 campos ordenados | 15 | 13 | 1: `RUC` (identificador extranjero) | 1: `Número de contribuyente especial` (opcional) | + certificado_cumplimiento_tributario (**ausente**) |
| hn-agroexport-sula | xlsx | HN | `plantilla-celdas.json`: hoja `Registro` A2:B12 | 11 | 9 | 1: `RTN` (identificador extranjero) | 1: `Referencias comerciales` | camara_comercio, rut, parafiscales (**vencido**) |
| pa-logistica-istmo | portal | PA | `plantilla-campos.json`: 9 campos (formato portal, pero trae plantilla) | 9 | 8 | 1: `RUC` (identificador extranjero) | 0 | camara_comercio, rut |

Resultado esperado de `listo_para_firma` (oráculo de pruebas):

| Caso | Con `FECHA_REFERENCIA=2026-09-03` | Con hoy (2026-11-20) | Motivo |
|---|---|---|---|
| co-industrias-delta | `true` | `false` | Cámara de Comercio vence 2026-09-30 |
| ec-corp-andina | `false` | `false` | Falta `certificado_cumplimiento_tributario` (+ Cámara vencida hoy) |
| hn-agroexport-sula | `false` | `false` | Parafiscales vencido 2026-08-31 (+ Cámara vencida hoy) |
| pa-logistica-istmo | `true` | `false` | Cámara de Comercio vence 2026-09-30 |

### 2.5 Casos borde detectados

- **Soporte vencido por fecha de ejecución**: la fecha de ejecución cambia el resultado; se resuelve con fecha de referencia configurable (Q1 = C).
- **`vigencia_hasta: null`** (RUT): significa "no vence"; nunca se marca vencido.
- **Soporte exigido inexistente en el índice** (EC): estado `ausente`, bloquea.
- **Vencido exactamente en la fecha de referencia**: `vigencia_hasta` igual a la fecha de referencia sigue vigente (el PRD dice "anterior a").
- **Formato portal con plantilla**: pa-logistica-istmo trae `plantilla-campos.json`; se usa para `valores-portal.md`. El cuerpo menciona URL y credenciales "enviadas por separado": el agente no las pide, no las guarda, no las registra.
- **Identificador tributario extranjero** (EC/PA RUC, HN RTN): se llena con el NIT y queda `requiere_confirmacion` con nota "identificador extranjero" (RN1).
- **Datos bancarios**: solicitados explícitamente en CO, EC y PA, así que se llenan; HN no los pide y no aparecen. Nunca van al borrador de correo (RN2).
- **Soporte colombiano para cliente extranjero**: HN pide "registro tributario de su país"; se adjunta el RUT (`pais_emisor: CO`) y el checklist anota que el emisor es CO.
- **"Cámara de Comercio no mayor a 30 días"** (cuerpo del correo CO): no hay fecha de expedición en el índice; se valida solo con `vigencia_hasta` y se deja nota en el checklist.
- **Valores numéricos**: `Número de empleados` (480) e `Ingresos anuales` (98000000000) se escriben como número en xlsx; la moneda (COP, año 2025) va como nota desde el maestro, no como valor inventado.
- **`País` = `CO`**: se escribe el valor del maestro tal cual.
- **Celdas con layout distinto**: CO usa columnas B/C desde fila 3 en 2 hojas; HN usa A/B desde fila 2 en 1 hoja. La plantilla manda; nada se asume por posición.
- **Entradas inválidas** (no están en fixtures, pero las exige HU-5): caso inexistente, nombre de caso con `../`, JSON corrupto, formato desconocido, plantilla faltante para el formato.

## 3. Requisitos funcionales

### FR1 · Leer solicitud (`proveedor_leer_solicitud`, P0, HU-1)
- **FR1.1** Dado un `caso` existente, devuelve `{ pais, cliente, formato, campos[], soportes[] }`, donde `campos` sale de `plantilla-celdas.json` (xlsx) o `plantilla-campos.json` (pdf y portal), en el orden de la plantilla, y `soportes` de `soportes-exigidos.json`. Criterio: los 4 casos devuelven 17 / 15 / 11 / 9 campos y 4 / 5 / 3 / 2 soportes.
- **FR1.2** Las etiquetas genéricas de identificador tributario (`Identificación tributaria`, `Número de identificación fiscal`) se reportan como ambiguas con el equivalente del país propuesto (CO→NIT, EC/PE/PA→RUC, HN→RTN).
- **FR1.3** Caso inexistente, nombre de caso inválido (fuera de `^[a-z0-9-]+$`), JSON corrupto o plantilla ausente para el formato devuelven `{ ok: false, error }` en lenguaje claro, sin traza.

### FR2 · Mapear campos (`proveedor_mapear_campos`, P0, HU-2)
- **FR2.1** Cada campo termina en exactamente un estado: `lleno` (con `ruta` y `valor` del maestro), `faltante` o `requiere_confirmacion` (con `ruta`, `valor` si existe, `confianza` y `nota`).
- **FR2.2** Ningún campo recibe un valor que no exista en el maestro. Sin fuente = `faltante`.
- **FR2.3** Los sinónimos del glosario se resuelven automáticamente: coincidencia exacta = confianza 1.0; coincidencia tras normalizar (minúsculas, sin tildes, espacios colapsados) = 0.95; coincidencia aproximada por tokens = su similitud.
- **FR2.4** Confianza < 0.8 produce `requiere_confirmacion` con el candidato propuesto; sin candidato produce `faltante`.
- **FR2.5** RN1: si la ruta es `nit` y el país del caso no es CO, el campo se llena con el NIT y queda `requiere_confirmacion` con nota "identificador extranjero (se esperaba RUC|RTN)".
- **FR2.6** Criterio: los conteos de llenos / requiere_confirmacion / faltantes coinciden con la tabla 2.4.

### FR3 · Generar formulario (`proveedor_generar_formulario`, HU-3)
- **FR3.1** (P0) xlsx: `out/<caso>/formulario.xlsx` con cada etiqueta en `celda_etiqueta` y su valor en `celda_valor` de la `hoja` indicada. Criterio: releer el archivo y comparar celda por celda con la plantilla.
- **FR3.2** (P1) pdf: `out/<caso>/formulario.pdf` generado (no AcroForm) con todos los campos, etiqueta y valor, en el orden de la plantilla, marcando los obligatorios. Criterio: extraer el texto y verificar las 15 etiquetas en orden.
- **FR3.3** (P2) portal: `out/<caso>/valores-portal.md` con tabla etiqueta / valor / estado lista para copiar, y respuesta `{ ok: true, data: { ruta, formato: "portal", soportado: false, aviso: "formato no soportado" } }` (Q2 = A).
- **FR3.4** CA2: la herramienta relee cada valor del maestro por `ruta`; cualquier `valor` que venga en `mapeo` se ignora. Un `mapeo` con una ruta inexistente deja ese campo vacío y lo reporta.
- **FR3.5** Campos `faltante` quedan con valor vacío en xlsx y con "(faltante)" en pdf y portal; campos `requiere_confirmacion` se escriben con su valor y se listan como pendientes.

### FR4 · Armar paquete (`proveedor_armar_paquete`, P0, HU-4)
- **FR4.1** Crea `out/<caso>/paquete/` con el formulario generado, copias de los soportes exigidos que existan, `checklist.md` y `borrador-correo.md`. Si el formulario aún no existe, lo genera primero.
- **FR4.2** Estado de cada soporte exigido: `vigente`, `vencido` (`vigencia_hasta` < fecha de referencia) o `ausente`. `null` = no vence.
- **FR4.3** RN3: `listo_para_firma = true` solo si no hay soportes vencidos ni ausentes. Faltantes y `requiere_confirmacion` no bloquean, pero aparecen en el checklist. Criterio: tabla de oráculo 2.4.
- **FR4.4** RN2: `borrador-correo.md` no contiene banco, tipo de cuenta, número de cuenta, titular ni SWIFT. Criterio: búsqueda de esos valores en el archivo = 0 coincidencias.
- **FR4.5** Fecha de referencia: la del sistema por defecto; override con `FECHA_REFERENCIA` (AAAA-MM-DD). Valor inválido = error claro (Q1 = C).

### FR5 · Simular envío (`proveedor_simular_envio`, P1, HU-4, RN4)
- **FR5.1** Con `confirmado: true` escribe `out/<caso>/ENVIO-SIMULADO.md` y devuelve `{ ruta }`.
- **FR5.2** Con `confirmado: false` devuelve `{ ok: false, error: "requiere confirmación explícita" }` y no escribe nada.
- **FR5.3** Si el paquete no existe, devuelve error claro sin escribir.

### FR6 · Contrato y manejo de errores (HU-5, §6.2)
- **FR6.1** Cada herramienta es `{ description, args, execute }` con `args` como esquemas zod con `.describe()`; se exporta desde `src/tools/proveedor.ts` y su nombre visible es `proveedor_<export>`.
- **FR6.2** `execute` devuelve siempre un string JSON `{ ok: true, data }` o `{ ok: false, error }` y nunca lanza (try/catch en el borde).
- **FR6.3** Un runner común valida los args con zod antes de ejecutar y devuelve el error de validación como `{ ok: false, error }`.

### FR7 · Registro de ejecución (RN5, CA4)
- **FR7.1** Cada llamada a herramienta añade `{ ts, herramienta, ok, resumen }` a `out/<caso>/log.jsonl` y a `out/log.jsonl`.

### FR8 · `demo.ts` (§6.6)
- **FR8.1** Limpia `out/`, ejecuta los 4 casos llamando directamente a las herramientas (leer → mapear → generar → armar → simular envío sin confirmar y luego confirmado) e imprime un resumen por caso con la fecha de referencia usada.
- **FR8.2** Corre sin clave de proveedor con `npm run demo` (Node + tsx) y con `bun run demo.ts` (Q3 = C).
- **FR8.3** Un caso que falla no detiene los siguientes.

### FR9 · Ciclo del agente y adaptador LLM (Bolt 2, §6.1, §6.3)
- **FR9.1** Interfaz propia `enviar(mensajes, herramientas) → respuesta` en `src/llm/adapter.ts`; implementación Anthropic en `src/llm/anthropic.ts` (Q5 = A). Cambiar de proveedor no toca el ciclo.
- **FR9.2** CA1: tope de iteraciones por turno (por defecto 25, configurable); al alcanzarlo responde con lo que tiene y lo que falta.
- **FR9.3** CA3 / RN4: `needsConfirmation` se activa cuando el agente cierra con pregunta de confirmación; `proveedor_simular_envio` con `confirmado: true` solo se acepta si el mensaje inmediatamente anterior del usuario confirma (validado por el backend, no solo por el prompt).
- **FR9.4** CA5: un error de herramienta o del proveedor se muestra en lenguaje claro y la sesión sigue viva.
- **FR9.5** System prompt en `agent/prompt.md`; conocimiento del proceso en `src/knowledge/registro-proveedor.md`.

### FR10 · API HTTP (Bolt 2, §6.4)
- **FR10.1** `POST /api/chat` `{ sessionId, message }` → `{ reply, toolCalls[], needsConfirmation }`.
- **FR10.2** `GET /api/sessions/:id` devuelve el historial completo.
- **FR10.3** `GET /api/health` devuelve `{ ok: true, provider, model }` sin claves.

### FR11 · Front de chat (Bolt 3)
- **FR11.1** Svelte 5 + Vite (Q4 = A): historial, entrada, indicador "pensando".
- **FR11.2** Cada tool call visible con nombre, argumentos y resultado resumido.
- **FR11.3** Estado de confirmación pendiente resaltado visualmente.

### FR12 · Módulo reutilizable (Bolt 4, §9.4)
- **FR12.1** `modulo/agent.md` (frontmatter `description`, `mode: primary`, `permission {edit: deny, bash: deny}`), `modulo/tools/proveedor.ts`, `modulo/skill/registro-proveedor/SKILL.md`.
- **FR12.2** Las tres piezas son las mismas que usa la app: una sola fuente, verificada por una prueba que falla si divergen.

### FR13 · Documentación (Bolt 4, §9)
- **FR13.1** `SOLUCION.md` con las 10 secciones obligatorias, incluido el diseño del portal web (§7.4) y el uso de IA.
- **FR13.2** `README.md`: un comando para levantar, variables de entorno, cómo correr `demo.ts`, link de prueba.

## 4. Requisitos no funcionales

- **NFR1 Determinismo**: dos ejecuciones de `demo.ts` con la misma `FECHA_REFERENCIA` producen los mismos archivos y el mismo resumen, salvo timestamps de log. Los generadores de xlsx y pdf fijan sus metadatos de fecha.
- **NFR2 Seguridad**: la clave del modelo solo vive en una variable de entorno del backend; no aparece en repo, front, logs ni respuestas. `.env.example` sin valores. Sin credenciales de portal en ningún lado.
- **NFR3 Costo**: tope de iteraciones por turno (25) y tope de tokens por sesión, ambos configurables por variable de entorno.
- **NFR4 Robustez**: errores tipados `{ ok: false, error }`; timeout al proveedor LLM (por defecto 60 s) con mensaje claro; un caso malo no impide el siguiente.
- **NFR5 Legibilidad**: TypeScript `strict`, sin `any` (verificado con `tsc --noEmit` y la regla `no-explicit-any`), funciones cortas.
- **NFR6 Arranque**: un comando (`npm run dev`) levanta front y backend en menos de 2 minutos en máquina limpia.
- **NFR7 Aislamiento de archivos**: las herramientas solo leen de `fixtures/` y solo escriben en `out/`, resuelven rutas desde `ctx.directory`, rechazan nombres de caso con separadores de ruta y nunca ejecutan comandos de shell.

## 5. Restricciones

- TypeScript; runtime portable Node 20+ / Bun (Q3 = C). Entorno local: Node v24.18.0, Bun no instalado.
- `zod` obligatorio para args de herramientas.
- Front entre React / Svelte / Vue / HTML plano: Svelte 5 (Q4 = A). Angular está fuera de las opciones del PRD.
- `fixtures/` no se modifica. Sin base de datos. Sin `node_modules/`, `out/` ni `.env` en el repo (ya cubierto por `.gitignore`).
- El agente nunca firma ni envía de verdad.

## 6. Supuestos

- La fecha de referencia por defecto es la del sistema; para reproducir el escenario del PRD se usa `FECHA_REFERENCIA=2026-09-03`. [Q1]
- Para xlsx no se recibe el archivo `.xlsx` del cliente (solo `plantilla-celdas.json`); se genera un libro nuevo con las hojas y celdas indicadas.
- `Correo electrónico` se llena con el correo comercial porque así lo define el glosario.
- Los soportes se copian al paquete aunque estén vencidos, marcados como tales en el checklist, para que la analista vea qué actualizar.
- Librerías propuestas para Bolt 1 (se confirman en el plan de código): `exceljs` para xlsx, `pdf-lib` para pdf, `vitest` para pruebas, `tsx` para ejecutar TypeScript en Node.

## 7. Fuera de alcance

- Integración real con correo, SharePoint, firma electrónica o portales; llenado automático de portales (solo diseño en `SOLUCION.md`).
- Autenticación, roles, multiusuario, base de datos.
- Validar la antigüedad de expedición de la Cámara de Comercio (no hay dato de expedición).

## 8. Preguntas abiertas (para Bolts posteriores)

- Plataforma de despliegue del link público (Bolt 2/3).
- Cómo se garantiza fuente única entre `agent/prompt.md` y `modulo/agent.md` (copia generada con prueba de igualdad, o la app lee del módulo) (Bolt 4).

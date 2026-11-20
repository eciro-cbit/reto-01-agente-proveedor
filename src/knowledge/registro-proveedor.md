# Conocimiento del proceso: registro como proveedor

## Para qué sirve

Los clientes de Periferia en Colombia, Ecuador, Perú, Panamá y Honduras piden registrarla como proveedor. Cada solicitud llega por correo con una plantilla (Excel, PDF o portal web) y una lista de soportes. Los datos ya existen en el repositorio maestro; el trabajo es llenar la plantilla sin errores, juntar los soportes vigentes y preparar el paquete para la firma del representante legal.

## Estructura de un caso

Cada caso vive en `fixtures/reto-01/casos/<caso>/` y se nombra por su carpeta (por ejemplo `ec-corp-andina`):

| Archivo | Contenido |
|---|---|
| `solicitud.json` | Correo normalizado: remitente, asunto, fecha, país, cliente, cuerpo, formato y adjuntos. |
| `plantilla-celdas.json` | Solo formato `xlsx`: hoja, celda de la etiqueta, etiqueta y celda del valor. |
| `plantilla-campos.json` | Formatos `pdf` y `portal`: lista ordenada de etiquetas y si son obligatorias. |
| `soportes-exigidos.json` | Tipos de soporte que el cliente exige. |

El repositorio maestro está en `fixtures/reto-01/repositorio/`: `maestro.json` (datos de la empresa), `soportes/index.json` (soportes con tipo, archivo, `vigencia_hasta` y país emisor) y `fixtures/reto-01/glosario-campos.json` (sinónimos de etiquetas). Las herramientas leen esos archivos; el agente nunca los lee por su cuenta.

## Formatos de salida

| Prioridad | Formato | Resultado |
|---|---|---|
| P0 | `xlsx` | `out/<caso>/formulario.xlsx` con cada valor en la hoja y celda que indica la plantilla. |
| P1 | `pdf` | `out/<caso>/formulario.pdf` generado con todas las etiquetas y valores en el orden dado. |
| P2 | `portal` | No se automatiza: la herramienta avisa "formato no soportado" y escribe `out/<caso>/valores-portal.md` con los valores listos para copiar. Una persona ingresa al portal con sus credenciales y hace el envío. |

## Estados de un campo

| Estado | Significado | Qué decir |
|---|---|---|
| `lleno` | Se encontró la ruta en el maestro con confianza suficiente; el valor sale del maestro. | Se puede listar como lleno. |
| `requiere_confirmacion` | Mapeo con confianza menor a 0.8, etiqueta ambigua o regla de país (RN1). | Pedir a la persona que lo revise; mostrar la nota. |
| `faltante` | No existe en el maestro. | Listarlo como faltante; nunca proponer un valor. |

## Estados de un soporte

| Estado | Significado |
|---|---|
| `vigente` | Existe en el repositorio y su `vigencia_hasta` es igual o posterior a la fecha de referencia (o no vence). |
| `vencido` | Existe, pero su `vigencia_hasta` es anterior a la fecha de referencia. Hay que pedir uno actualizado. |
| `ausente` | El cliente lo exige y no existe en el repositorio. Hay que conseguirlo. |

La fecha de referencia es `FECHA_REFERENCIA` (formato AAAA-MM-DD) si el servidor la define; si no, la fecha del día. Los resultados de `proveedor_armar_paquete` traen la fecha usada en `checklist.fecha_referencia`.

## Reglas de negocio

- **RN1 · Identificador tributario por país.** Colombia usa NIT; Ecuador, Perú y Panamá usan RUC; Honduras usa RTN. Periferia solo tiene NIT colombiano: en otros países el campo se llena con el NIT y queda `requiere_confirmacion` con la nota "identificador extranjero".
- **RN2 · Datos bancarios.** Solo se llenan si la plantilla los pide explícitamente y nunca se incluyen en `borrador-correo.md`.
- **RN3 · Listo para firma.** Un soporte vencido o un soporte exigido ausente bloquean `listo_para_firma`. Un campo faltante no lo bloquea, pero aparece en el checklist.
- **RN4 · Confirmación.** Ninguna acción externa (envío, firma, carga a portal) ocurre sin una confirmación explícita de la persona en el mensaje inmediatamente anterior. En este sistema "enviar" solo escribe `out/<caso>/ENVIO-SIMULADO.md`.
- **RN5 · Registro.** Cada llamada a herramienta queda en `out/log.jsonl` y en `out/<caso>/log.jsonl`.

| País | Código | Identificador |
|---|---|---|
| Colombia | CO | NIT |
| Ecuador | EC | RUC |
| Perú | PE | RUC |
| Panamá | PA | RUC |
| Honduras | HN | RTN |

## Paquete para firma

`proveedor_armar_paquete` crea `out/<caso>/paquete/` con el formulario, copias de los soportes que existan (los vencidos se copian marcados), `checklist.md` (soportes vigentes, vencidos y ausentes, campos faltantes y pendientes de confirmación) y `borrador-correo.md` para el cliente. El paquete lo firma el representante legal, que nunca interactúa con el agente.

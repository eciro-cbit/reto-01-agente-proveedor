/**
 * Herramientas del agente "Registro como Proveedor" (§6.2 del PRD).
 * Cada export es `{ description, args, execute }`; el nombre visible para el modelo es `proveedor_<export>`.
 * `execute` devuelve siempre un string JSON `{ ok: true, data }` o `{ ok: false, error }` y nunca lanza.
 * Solo leen de `<ctx.directory>/fixtures` y solo escriben en `<ctx.directory>/out`.
 */
import { z } from "zod";
import { etiquetasDePlantilla, leerCaso, leerRepositorio } from "../dominio/fixtures";
import { generarFormulario as generarFormularioDominio } from "../dominio/formularios/generar";
import { esEtiquetaAmbigua, mapearCampos } from "../dominio/mapeo";
import { armarPaquete as armarPaqueteDominio, simularEnvio as simularEnvioDominio } from "../dominio/paquete";
import { identificadorDelPais } from "../dominio/reglas";
import { resolverFechaReferencia } from "../dominio/vigencia";
import type { ContextoHerramienta, FormaArgs, Herramienta, Resultado } from "./tipos";
import { exito, fallo, mensajeDeError } from "./tipos";

const argCaso = z.string().min(1).describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/ (ej. co-industrias-delta)");

function definir<S extends FormaArgs>(herramienta: Herramienta<S>): Herramienta<S> {
  return herramienta;
}

/** Envuelve el trabajo: serializa el resultado y convierte cualquier excepción en `{ ok: false }`. */
async function ejecutarSeguro<T>(trabajo: () => Promise<Resultado<T>>): Promise<string> {
  try {
    return JSON.stringify(await trabajo());
  } catch (error) {
    return JSON.stringify(fallo(`Error inesperado: ${mensajeDeError(error)}`));
  }
}

/** Fecha de referencia vigente: `FECHA_REFERENCIA` o la fecha local del sistema. */
function fechaReferencia(): Resultado<string> {
  return resolverFechaReferencia(process.env, new Date());
}

async function leerSolicitudDelCaso(caso: string, ctx: ContextoHerramienta) {
  const leido = await leerCaso(ctx, caso);
  if (!leido.ok) return leido;
  const { solicitud, plantilla, soportesExigidos } = leido.data;
  const campos = etiquetasDePlantilla(plantilla);
  const propuesta = identificadorDelPais(solicitud.pais) ?? "identificador local";
  return exito({
    caso,
    pais: solicitud.pais,
    cliente: solicitud.cliente,
    formato: solicitud.formato,
    de: solicitud.de,
    asunto: solicitud.asunto,
    cuerpo: solicitud.cuerpo,
    campos,
    soportes: soportesExigidos,
    campos_ambiguos: campos.filter(esEtiquetaAmbigua).map((etiqueta) => ({ etiqueta, estado: "requiere_confirmacion", propuesta })),
  });
}

/** Lee la solicitud del cliente: país, cliente, formato, campos de la plantilla y soportes exigidos. */
export const leer_solicitud = definir({
  description: "Lee la solicitud de un caso y devuelve país, cliente, formato, campos de la plantilla en orden, soportes exigidos y campos ambiguos.",
  args: { caso: argCaso },
  execute: (args, ctx) => ejecutarSeguro(() => leerSolicitudDelCaso(args.caso, ctx)),
});

async function mapearCamposDelCaso(caso: string, campos: string[], ctx: ContextoHerramienta) {
  const leido = await leerCaso(ctx, caso);
  if (!leido.ok) return leido;
  const repo = await leerRepositorio(ctx);
  if (!repo.ok) return repo;
  return exito(mapearCampos(campos, { pais: leido.data.solicitud.pais, maestro: repo.data.maestro, glosario: repo.data.glosario }));
}

/**
 * Cruza cada etiqueta con el maestro vía glosario: exacta = 1.0, normalizada = 0.95, aproximada = similitud;
 * < 0.8 o identificador extranjero (RN1) = requiere_confirmacion; sin fuente = faltante. Nunca inventa valores.
 */
export const mapear_campos = definir({
  description: "Mapea las etiquetas de la plantilla al repositorio maestro y las clasifica en llenos, faltantes y requiere_confirmacion, sin inventar valores.",
  args: {
    caso: argCaso,
    campos: z.array(z.string().min(1)).min(1).describe("Etiquetas de los campos tal como aparecen en la plantilla (salida campos de leer_solicitud)"),
  },
  execute: (args, ctx) => ejecutarSeguro(() => mapearCamposDelCaso(args.caso, args.campos, ctx)),
});

const argMapeo = z
  .array(
    z.object({
      etiqueta: z.string().min(1).describe("Etiqueta del campo en la plantilla"),
      ruta: z.string().min(1).optional().describe("Ruta con punto en el maestro (ej. banco.swift); omitirla deja el campo faltante"),
    }),
  )
  .describe("Mapeo etiqueta → ruta del maestro; los valores siempre se releen del maestro y las etiquetas no incluidas usan el mapeo automático");

/** Genera el formulario en el formato del cliente (xlsx P0, pdf P1; portal P2 = valores-portal.md y formato no soportado). */
export const generar_formulario = definir({
  description: "Genera el formulario del caso en su formato (xlsx, pdf o valores para portal) releyendo cada valor del maestro por su ruta.",
  args: { caso: argCaso, mapeo: argMapeo },
  execute: (args, ctx) =>
    ejecutarSeguro(async () => {
      const fecha = fechaReferencia();
      if (!fecha.ok) return fecha;
      return generarFormularioDominio(ctx, { caso: args.caso, mapeo: args.mapeo, fechaReferencia: fecha.data });
    }),
});

/** Arma el paquete para firma con formulario, soportes, checklist y borrador de correo; calcula listo_para_firma (RN3). */
export const armar_paquete = definir({
  description: "Arma out/<caso>/paquete/ con formulario, soportes, checklist.md y borrador-correo.md, e indica si está listo para firma.",
  args: { caso: argCaso },
  execute: (args, ctx) =>
    ejecutarSeguro(async () => {
      const fecha = fechaReferencia();
      if (!fecha.ok) return fecha;
      return armarPaqueteDominio(ctx, args.caso, fecha.data);
    }),
});

/** Simula el envío (escribe ENVIO-SIMULADO.md) solo con confirmación explícita del usuario (RN4). */
export const simular_envio = definir({
  description: "Simula el envío del paquete escribiendo out/<caso>/ENVIO-SIMULADO.md; solo con confirmación explícita del usuario.",
  args: {
    caso: argCaso,
    confirmado: z.boolean().describe("true solo si el usuario confirmó explícitamente el envío en su último mensaje"),
  },
  execute: (args, ctx) =>
    ejecutarSeguro(async () => {
      if (!args.confirmado) return fallo("requiere confirmación explícita");
      const fecha = fechaReferencia();
      if (!fecha.ok) return fecha;
      return simularEnvioDominio(ctx, args.caso, fecha.data);
    }),
});

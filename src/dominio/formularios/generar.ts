import type { ContextoHerramienta, Resultado } from "../../tools/tipos";
import { exito, fallo, mensajeDeError } from "../../tools/tipos";
import type { Formato } from "../esquemas";
import { leerCaso, leerRepositorio, type Caso, type Repositorio } from "../fixtures";
import { asegurarCarpetaDe, rutaCasoOut, rutaVisible } from "../salida";
import { resolverCamposFormulario, type CamposResueltos, type EntradaMapeo } from "./comun";
import { escribirPdf } from "./pdf";
import { AVISO_PORTAL, escribirValoresPortal } from "./portal";
import { escribirXlsx } from "./xlsx";

/** Nombre del archivo de formulario por formato. */
export const ARCHIVO_FORMULARIO: Readonly<Record<Formato, string>> = {
  xlsx: "formulario.xlsx",
  pdf: "formulario.pdf",
  portal: "valores-portal.md",
};

export interface ResultadoFormulario {
  ruta: string;
  formato: Formato;
  /** Etiquetas escritas con valor pero pendientes de confirmación humana. */
  pendientes: string[];
  /** Etiquetas sin valor en el maestro. */
  faltantes: string[];
  rutas_sin_valor: string[];
  etiquetas_ignoradas: string[];
  soportado?: false;
  aviso?: string;
}

export interface OpcionesFormulario {
  caso: string;
  mapeo?: readonly EntradaMapeo[] | undefined;
  fechaReferencia: string;
}

async function escribirSegunFormato(ruta: string, caso: Caso, resueltos: CamposResueltos, fecha: string): Promise<void> {
  const { solicitud, plantilla } = caso;
  if (plantilla.tipo === "celdas") {
    await escribirXlsx(ruta, plantilla.celdas, resueltos.campos, fecha);
    return;
  }
  const datos = { cliente: solicitud.cliente, fechaReferencia: fecha, campos: resueltos.campos };
  if (solicitud.formato === "pdf") await escribirPdf(ruta, datos);
  else await escribirValoresPortal(ruta, { ...datos, cuerpoSolicitud: solicitud.cuerpo });
}

function armarResultado(ctx: ContextoHerramienta, ruta: string, formato: Formato, resueltos: CamposResueltos): ResultadoFormulario {
  const etiquetasCon = (estado: string): string[] => resueltos.campos.filter((c) => c.estado === estado).map((c) => c.etiqueta);
  const data: ResultadoFormulario = {
    ruta: rutaVisible(ctx, ruta),
    formato,
    pendientes: etiquetasCon("requiere_confirmacion"),
    faltantes: etiquetasCon("faltante"),
    rutas_sin_valor: resueltos.rutas_sin_valor,
    etiquetas_ignoradas: resueltos.etiquetas_ignoradas,
  };
  return formato === "portal" ? { ...data, soportado: false, aviso: AVISO_PORTAL } : data;
}

/** Genera el formulario del caso en su formato; los valores siempre salen del maestro (CA2). */
export async function generarFormulario(ctx: ContextoHerramienta, opciones: OpcionesFormulario): Promise<Resultado<ResultadoFormulario>> {
  const caso = await leerCaso(ctx, opciones.caso);
  if (!caso.ok) return caso;
  const repo = await leerRepositorio(ctx);
  if (!repo.ok) return repo;
  return generarConDatos(ctx, caso.data, repo.data, opciones);
}

async function generarConDatos(
  ctx: ContextoHerramienta,
  caso: Caso,
  repo: Repositorio,
  opciones: OpcionesFormulario,
): Promise<Resultado<ResultadoFormulario>> {
  const formato = caso.solicitud.formato;
  const contexto = { pais: caso.solicitud.pais, maestro: repo.maestro, glosario: repo.glosario };
  const resueltos = resolverCamposFormulario(caso.plantilla, opciones.mapeo, contexto);
  const ruta = rutaCasoOut(ctx, caso.nombre, ARCHIVO_FORMULARIO[formato]);
  await asegurarCarpetaDe(ruta);
  try {
    await escribirSegunFormato(ruta, caso, resueltos, opciones.fechaReferencia);
  } catch (error) {
    return fallo(`No se pudo escribir el formulario ${ARCHIVO_FORMULARIO[formato]} de '${caso.nombre}': ${mensajeDeError(error)}`);
  }
  return exito(armarResultado(ctx, ruta, formato, resueltos));
}

import { copyFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ContextoHerramienta, Resultado } from "../tools/tipos";
import { exito, fallo } from "../tools/tipos";
import {
  construirBorradorCorreo,
  construirChecklistMd,
  contieneDatosBancarios,
  estaListoParaFirma,
  evaluarSoportes,
  motivosDeBloqueo,
  notasDeSolicitud,
  type Checklist,
  type SoporteEvaluado,
} from "./documentos";
import { etiquetasDePlantilla, existe, leerCaso, leerRepositorio, rutaSoporte, type Caso, type Repositorio } from "./fixtures";
import { ARCHIVO_FORMULARIO, generarFormulario } from "./formularios/generar";
import { mapearCampos } from "./mapeo";
import { asegurarCarpeta, rutaCasoOut, rutaVisible } from "./salida";

export const CARPETA_PAQUETE = "paquete";
export const ARCHIVO_ENVIO = "ENVIO-SIMULADO.md";

export interface ResultadoPaquete {
  ruta: string;
  listo_para_firma: boolean;
  checklist: Checklist;
  archivos: string[];
}

export interface ResultadoEnvio {
  ruta: string;
  listo_para_firma: boolean;
  advertencia?: string;
}

interface Datos {
  caso: Caso;
  repo: Repositorio;
}

async function leerDatos(ctx: ContextoHerramienta, caso: string): Promise<Resultado<Datos>> {
  const leido = await leerCaso(ctx, caso);
  if (!leido.ok) return leido;
  const repo = await leerRepositorio(ctx);
  if (!repo.ok) return repo;
  return exito({ caso: leido.data, repo: repo.data });
}

async function soportesDelCaso(ctx: ContextoHerramienta, datos: Datos, fechaReferencia: string): Promise<SoporteEvaluado[]> {
  const disponibles = new Set<string>();
  for (const soporte of datos.repo.soportes) {
    if (await existe(rutaSoporte(ctx, soporte.archivo))) disponibles.add(soporte.archivo);
  }
  return evaluarSoportes(datos.caso.soportesExigidos, datos.repo.soportes, {
    fechaReferencia,
    paisCliente: datos.caso.solicitud.pais,
    archivosDisponibles: disponibles,
  });
}

function construirChecklist(datos: Datos, soportes: SoporteEvaluado[], fechaReferencia: string): Checklist {
  const { solicitud, plantilla } = datos.caso;
  const contexto = { pais: solicitud.pais, maestro: datos.repo.maestro, glosario: datos.repo.glosario };
  const mapeo = mapearCampos(etiquetasDePlantilla(plantilla), contexto);
  return {
    fecha_referencia: fechaReferencia,
    soportes,
    campos_faltantes: mapeo.faltantes.map((c) => c.etiqueta),
    pendientes_confirmacion: mapeo.requiere_confirmacion.map((c) => (c.nota ? { etiqueta: c.etiqueta, nota: c.nota } : { etiqueta: c.etiqueta })),
    notas: notasDeSolicitud(solicitud.cuerpo),
  };
}

/** Garantiza que el formulario exista; si no, lo genera con el mapeo automático. */
async function asegurarFormulario(ctx: ContextoHerramienta, caso: Caso, fechaReferencia: string): Promise<Resultado<string>> {
  const ruta = rutaCasoOut(ctx, caso.nombre, ARCHIVO_FORMULARIO[caso.solicitud.formato]);
  if (await existe(ruta)) return exito(ruta);
  const generado = await generarFormulario(ctx, { caso: caso.nombre, fechaReferencia });
  return generado.ok ? exito(ruta) : generado;
}

/** Copia formulario y soportes existentes (también los vencidos) a la carpeta del paquete. */
async function copiarArchivos(ctx: ContextoHerramienta, carpeta: string, formulario: string, soportes: SoporteEvaluado[]): Promise<string[]> {
  await copyFile(formulario, join(carpeta, basename(formulario)));
  const copiados = [basename(formulario)];
  for (const soporte of soportes) {
    if (soporte.estado === "ausente" || soporte.archivo === undefined) continue;
    await copyFile(rutaSoporte(ctx, soporte.archivo), join(carpeta, soporte.archivo));
    copiados.push(soporte.archivo);
  }
  return copiados;
}

/** Arma `out/<caso>/paquete/` con formulario, soportes, checklist y borrador de correo (FR4). */
export async function armarPaquete(ctx: ContextoHerramienta, caso: string, fechaReferencia: string): Promise<Resultado<ResultadoPaquete>> {
  const datos = await leerDatos(ctx, caso);
  if (!datos.ok) return datos;
  const formulario = await asegurarFormulario(ctx, datos.data.caso, fechaReferencia);
  if (!formulario.ok) return formulario;

  const soportes = await soportesDelCaso(ctx, datos.data, fechaReferencia);
  const listo = estaListoParaFirma(soportes);
  const checklist = construirChecklist(datos.data, soportes, fechaReferencia);
  const { solicitud } = datos.data.caso;
  const carpeta = rutaCasoOut(ctx, caso, CARPETA_PAQUETE);
  await rm(carpeta, { recursive: true, force: true });
  await asegurarCarpeta(carpeta);
  const adjuntos = await copiarArchivos(ctx, carpeta, formulario.data, soportes);
  const correo = construirBorradorCorreo({ solicitud, adjuntos, listo, bloqueo: motivosDeBloqueo(soportes) });
  if (contieneDatosBancarios(correo, datos.data.repo.maestro)) {
    return fallo("El borrador de correo contendría datos bancarios; se detuvo el armado del paquete (RN2)");
  }
  await writeFile(join(carpeta, "checklist.md"), construirChecklistMd({ caso, solicitud, checklist, listo }), "utf8");
  await writeFile(join(carpeta, "borrador-correo.md"), correo, "utf8");
  const archivos = [...adjuntos, "borrador-correo.md", "checklist.md"].sort();
  return exito({ ruta: rutaVisible(ctx, carpeta), listo_para_firma: listo, checklist, archivos });
}

function contenidoEnvio(caso: Caso, archivos: string[], fechaReferencia: string, advertencia: string | undefined): string {
  return [
    "# Envío simulado",
    "",
    "No se envió nada: este archivo solo deja constancia de lo que se habría enviado tras la confirmación explícita del usuario.",
    "",
    `- Caso: ${caso.nombre}`,
    `- Destinatario: ${caso.solicitud.de}`,
    `- Asunto: RE: ${caso.solicitud.asunto}`,
    `- Fecha de referencia: ${fechaReferencia}`,
    ...(advertencia ? [`- Advertencia: ${advertencia}`] : []),
    "",
    "## Archivos del paquete",
    "",
    ...archivos.map((a) => `- ${a}`),
    "",
  ].join("\n");
}

/** Escribe `out/<caso>/ENVIO-SIMULADO.md`; la confirmación se valida en la herramienta (RN4). */
export async function simularEnvio(ctx: ContextoHerramienta, caso: string, fechaReferencia: string): Promise<Resultado<ResultadoEnvio>> {
  const datos = await leerDatos(ctx, caso);
  if (!datos.ok) return datos;
  const carpeta = rutaCasoOut(ctx, caso, CARPETA_PAQUETE);
  if (!(await existe(join(carpeta, "checklist.md")))) {
    return fallo(`El paquete de '${caso}' no existe: arme el paquete antes de simular el envío`);
  }
  const soportes = await soportesDelCaso(ctx, datos.data, fechaReferencia);
  const listo = estaListoParaFirma(soportes);
  const advertencia = listo ? undefined : `el paquete no está listo para firma: ${motivosDeBloqueo(soportes).join("; ")}`;
  const archivos = (await readdir(carpeta)).sort();
  const ruta = rutaCasoOut(ctx, caso, ARCHIVO_ENVIO);
  await writeFile(ruta, contenidoEnvio(datos.data.caso, archivos, fechaReferencia, advertencia), "utf8");
  const data: ResultadoEnvio = { ruta: rutaVisible(ctx, ruta), listo_para_firma: listo };
  return exito(advertencia ? { ...data, advertencia } : data);
}

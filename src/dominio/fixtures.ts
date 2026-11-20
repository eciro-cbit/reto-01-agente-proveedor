import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { z } from "zod";
import type { ContextoHerramienta, Resultado } from "../tools/tipos";
import { exito, fallo } from "../tools/tipos";
import {
  describirErrorZod,
  esquemaGlosario,
  esquemaIndiceSoportes,
  esquemaMaestro,
  esquemaPlantillaCampos,
  esquemaPlantillaCeldas,
  esquemaSoportesExigidos,
  esquemaSolicitud,
  type CampoPlantilla,
  type CeldaPlantilla,
  type Glosario,
  type Maestro,
  type SoporteIndice,
  type Solicitud,
} from "./esquemas";

/** Nombre de caso permitido: minúsculas, dígitos y guiones (NFR7). */
export const PATRON_CASO = /^[a-z0-9-]+$/;

/** Plantilla del caso según el formato pedido. */
export type PlantillaCaso =
  | { tipo: "celdas"; celdas: CeldaPlantilla[] }
  | { tipo: "campos"; campos: CampoPlantilla[] };

export interface Caso {
  nombre: string;
  solicitud: Solicitud;
  plantilla: PlantillaCaso;
  soportesExigidos: string[];
}

export interface Repositorio {
  maestro: Maestro;
  glosario: Glosario;
  soportes: SoporteIndice[];
}

/** Indica si `ruta` está dentro de `base` (o es la misma). */
export function dentroDe(base: string, ruta: string): boolean {
  const rel = relative(resolve(base), resolve(ruta));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export async function existe(ruta: string): Promise<boolean> {
  try {
    await stat(ruta);
    return true;
  } catch {
    return false;
  }
}

/** Raíz de solo lectura: `<ctx.directory>/fixtures/reto-01`. */
export function raizReto(ctx: ContextoHerramienta): string {
  return resolve(ctx.directory, "fixtures", "reto-01");
}

/** Resuelve una ruta bajo la raíz de fixtures; falla si escapa de ella. */
export function rutaEnReto(ctx: ContextoHerramienta, ...partes: string[]): string {
  const base = raizReto(ctx);
  const ruta = resolve(base, ...partes);
  if (!dentroDe(base, ruta)) throw new Error("Ruta fuera de fixtures/ rechazada");
  return ruta;
}

export function validarNombreCaso(caso: string): Resultado<string> {
  if (!PATRON_CASO.test(caso)) {
    return fallo(`El nombre de caso '${caso}' no es válido: solo se permiten minúsculas, dígitos y guiones`);
  }
  return exito(caso);
}

interface Descriptor {
  /** Ej.: "La plantilla de 'x'". */
  nombre: string;
  femenino: boolean;
}

/** Lee un JSON, lo parsea y lo valida; errores en lenguaje claro. */
export async function leerJson<E extends z.ZodType>(
  ruta: string,
  esquema: E,
  descriptor: Descriptor,
): Promise<Resultado<z.infer<E>>> {
  let texto: string;
  try {
    texto = await readFile(ruta, "utf8");
  } catch {
    return fallo(`${descriptor.nombre} no existe o no se puede leer`);
  }
  const corrupto = descriptor.femenino ? "está corrupta" : "está corrupto";
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return fallo(`${descriptor.nombre} ${corrupto}: no es un JSON válido`);
  }
  const resultado = esquema.safeParse(crudo);
  if (!resultado.success) return fallo(`${descriptor.nombre} ${corrupto}: ${describirErrorZod(resultado.error)}`);
  return exito(resultado.data);
}

async function leerPlantilla(ctx: ContextoHerramienta, caso: string, solicitud: Solicitud): Promise<Resultado<PlantillaCaso>> {
  const archivo = solicitud.formato === "xlsx" ? "plantilla-celdas.json" : "plantilla-campos.json";
  const ruta = rutaEnReto(ctx, "casos", caso, archivo);
  if (!(await existe(ruta))) {
    return fallo(`La plantilla de '${caso}' no existe: el formato ${solicitud.formato} requiere ${archivo}`);
  }
  const descriptor = { nombre: `La plantilla de '${caso}'`, femenino: true };
  if (solicitud.formato === "xlsx") {
    const celdas = await leerJson(ruta, esquemaPlantillaCeldas, descriptor);
    return celdas.ok ? exito({ tipo: "celdas", celdas: celdas.data }) : celdas;
  }
  const campos = await leerJson(ruta, esquemaPlantillaCampos, descriptor);
  return campos.ok ? exito({ tipo: "campos", campos: campos.data }) : campos;
}

/** Lee y valida todos los archivos de un caso. */
export async function leerCaso(ctx: ContextoHerramienta, caso: string): Promise<Resultado<Caso>> {
  const nombre = validarNombreCaso(caso);
  if (!nombre.ok) return nombre;
  if (!(await existe(rutaEnReto(ctx, "casos", caso)))) return fallo(`El caso '${caso}' no existe`);

  const solicitud = await leerJson(rutaEnReto(ctx, "casos", caso, "solicitud.json"), esquemaSolicitud, {
    nombre: `La solicitud de '${caso}'`,
    femenino: true,
  });
  if (!solicitud.ok) return solicitud;
  const plantilla = await leerPlantilla(ctx, caso, solicitud.data);
  if (!plantilla.ok) return plantilla;
  const soportes = await leerJson(rutaEnReto(ctx, "casos", caso, "soportes-exigidos.json"), esquemaSoportesExigidos, {
    nombre: `La lista de soportes exigidos de '${caso}'`,
    femenino: true,
  });
  if (!soportes.ok) return soportes;
  return exito({ nombre: caso, solicitud: solicitud.data, plantilla: plantilla.data, soportesExigidos: soportes.data });
}

/** Lee maestro, glosario e índice de soportes. */
export async function leerRepositorio(ctx: ContextoHerramienta): Promise<Resultado<Repositorio>> {
  const maestro = await leerJson(rutaEnReto(ctx, "repositorio", "maestro.json"), esquemaMaestro, {
    nombre: "El repositorio maestro",
    femenino: false,
  });
  if (!maestro.ok) return maestro;
  const glosario = await leerJson(rutaEnReto(ctx, "glosario-campos.json"), esquemaGlosario, {
    nombre: "El glosario de campos",
    femenino: false,
  });
  if (!glosario.ok) return glosario;
  const soportes = await leerJson(rutaEnReto(ctx, "repositorio", "soportes", "index.json"), esquemaIndiceSoportes, {
    nombre: "El índice de soportes",
    femenino: false,
  });
  if (!soportes.ok) return soportes;
  return exito({ maestro: maestro.data, glosario: glosario.data, soportes: soportes.data });
}

/** Ruta del archivo de un soporte dentro del repositorio. */
export function rutaSoporte(ctx: ContextoHerramienta, archivo: string): string {
  return rutaEnReto(ctx, "repositorio", "soportes", archivo);
}

/** Etiquetas de la plantilla en su orden. */
export function etiquetasDePlantilla(plantilla: PlantillaCaso): string[] {
  return plantilla.tipo === "celdas" ? plantilla.celdas.map((c) => c.etiqueta) : plantilla.campos.map((c) => c.etiqueta);
}

import { appendFile } from "node:fs/promises";
import type { ContextoHerramienta } from "../tools/tipos";
import { mensajeDeError } from "../tools/tipos";
import { existe, PATRON_CASO, rutaEnReto } from "./fixtures";
import { asegurarCarpetaDe, rutaCasoOut, rutaEnOut } from "./salida";

/** Línea de registro de una llamada a herramienta (RN5). */
export interface EntradaRegistro {
  ts: string;
  herramienta: string;
  ok: boolean;
  resumen: string;
}

async function anexar(ruta: string, entrada: EntradaRegistro): Promise<void> {
  await asegurarCarpetaDe(ruta);
  await appendFile(ruta, `${JSON.stringify(entrada)}\n`, "utf8");
}

/** Solo se crea log por caso si el nombre es válido y el caso existe en fixtures. */
async function rutaLogCaso(ctx: ContextoHerramienta, caso: string | undefined): Promise<string | undefined> {
  if (caso === undefined || !PATRON_CASO.test(caso)) return undefined;
  if (!(await existe(rutaEnReto(ctx, "casos", caso)))) return undefined;
  return rutaCasoOut(ctx, caso, "log.jsonl");
}

/**
 * Añade la entrada a `out/log.jsonl` y, si aplica, a `out/<caso>/log.jsonl`.
 * Un fallo de escritura del log se informa por consola y no rompe la herramienta.
 */
export async function registrar(ctx: ContextoHerramienta, caso: string | undefined, entrada: EntradaRegistro): Promise<void> {
  try {
    await anexar(rutaEnOut(ctx, "log.jsonl"), entrada);
    const rutaCaso = await rutaLogCaso(ctx, caso);
    if (rutaCaso !== undefined) await anexar(rutaCaso, entrada);
  } catch (error) {
    console.warn(`No se pudo escribir el registro de ${entrada.herramienta}: ${mensajeDeError(error)}`);
  }
}

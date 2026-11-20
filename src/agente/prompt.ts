import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Resultado } from "../tools/tipos";
import { exito, fallo, mensajeDeError } from "../tools/tipos";

/** Comportamiento del agente (FR9.5). */
export const RUTA_PROMPT = "agent/prompt.md";
/** Conocimiento del proceso (FR9.5). */
export const RUTA_CONOCIMIENTO = "src/knowledge/registro-proveedor.md";

async function leerMarkdown(directory: string, relativa: string): Promise<Resultado<string>> {
  try {
    const texto = (await readFile(resolve(directory, relativa), "utf8")).trim();
    if (texto === "") return fallo(`El archivo ${relativa} está vacío`);
    return exito(texto);
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException).code;
    if (codigo === "ENOENT") return fallo(`No se encontró ${relativa}: el agente no puede arrancar sin él`);
    return fallo(`No se pudo leer ${relativa}: ${mensajeDeError(error)}`);
  }
}

/**
 * Arma el system prompt desde disco: `agent/prompt.md` seguido de `src/knowledge/registro-proveedor.md`.
 * Ningún texto del prompt vive en código.
 */
export async function cargarSistema(directory: string): Promise<Resultado<string>> {
  const prompt = await leerMarkdown(directory, RUTA_PROMPT);
  if (!prompt.ok) return prompt;
  const conocimiento = await leerMarkdown(directory, RUTA_CONOCIMIENTO);
  if (!conocimiento.ok) return conocimiento;
  return exito(`${prompt.data}\n\n---\n\n${conocimiento.data}\n`);
}

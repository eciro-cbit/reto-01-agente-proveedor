import { readFile, rename, writeFile } from "node:fs/promises";
import { asegurarCarpetaDe, rutaEnOut } from "../dominio/salida";
import type { ContextoHerramienta, Resultado } from "../tools/tipos";
import { exito, fallo, mensajeDeError } from "../tools/tipos";
import type { Sesion } from "./tipos";

/** Identificador de sesión aceptado (también es nombre de archivo). */
export const PATRON_SESION = /^[A-Za-z0-9_-]{1,64}$/;

export function validarSessionId(id: string): Resultado<string> {
  if (!PATRON_SESION.test(id)) return fallo("sessionId inválido: use de 1 a 64 letras, números, '-' o '_'");
  return exito(id);
}

export function sesionNueva(id: string, ahora = new Date()): Sesion {
  return { id, creada: ahora.toISOString(), historial: [], mensajesLLM: [], tokensUsados: 0 };
}

function esCodigo(error: unknown, codigo: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === codigo;
}

/**
 * Sesiones en memoria con espejo JSON en `out/sesiones/<id>.json` (FR10.2): sobreviven a un
 * reinicio local. La escritura es atómica (archivo temporal + rename).
 */
export class AlmacenSesiones {
  private readonly memoria = new Map<string, Sesion>();

  constructor(private readonly directory: string) {}

  private ruta(id: string): string {
    const ctx: ContextoHerramienta = { directory: this.directory, sessionId: id };
    return rutaEnOut(ctx, "sesiones", `${id}.json`);
  }

  private async leerDeDisco(id: string): Promise<Resultado<Sesion | undefined>> {
    try {
      const sesion = JSON.parse(await readFile(this.ruta(id), "utf8")) as Sesion;
      return exito(sesion);
    } catch (error) {
      if (esCodigo(error, "ENOENT")) return exito(undefined);
      return fallo(`No se pudo leer la sesión '${id}': ${mensajeDeError(error)}`);
    }
  }

  /** Sesión existente (memoria o disco) o `undefined` si no existe. */
  async obtener(id: string): Promise<Resultado<Sesion | undefined>> {
    const valido = validarSessionId(id);
    if (!valido.ok) return valido;
    const enMemoria = this.memoria.get(id);
    if (enMemoria !== undefined) return exito(enMemoria);
    const leido = await this.leerDeDisco(id);
    if (leido.ok && leido.data !== undefined) this.memoria.set(id, leido.data);
    return leido;
  }

  /** Devuelve la sesión existente o crea una nueva en memoria (se persiste al guardar). */
  async obtenerOCrear(id: string): Promise<Resultado<Sesion>> {
    const existente = await this.obtener(id);
    if (!existente.ok) return existente;
    if (existente.data !== undefined) return exito(existente.data);
    const nueva = sesionNueva(id);
    this.memoria.set(id, nueva);
    return exito(nueva);
  }

  /** Persiste la sesión en memoria y en disco. */
  async guardar(sesion: Sesion): Promise<Resultado<string>> {
    const valido = validarSessionId(sesion.id);
    if (!valido.ok) return valido;
    this.memoria.set(sesion.id, sesion);
    try {
      const ruta = this.ruta(sesion.id);
      await asegurarCarpetaDe(ruta);
      const temporal = `${ruta}.${process.pid}.tmp`;
      await writeFile(temporal, JSON.stringify(sesion, null, 2), "utf8");
      await rename(temporal, ruta);
      return exito(ruta);
    } catch (error) {
      return fallo(`No se pudo guardar la sesión '${sesion.id}': ${mensajeDeError(error)}`);
    }
  }
}

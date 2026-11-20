import type { z } from "zod";

/** Contexto que el runner entrega a cada herramienta (§6.2 del PRD). */
export interface ContextoHerramienta {
  /** Raíz del proyecto; toda ruta se resuelve desde aquí. */
  directory: string;
  sessionId: string;
}

/** Resultado tipado: éxito con datos o fallo con mensaje claro en español. */
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };

/** Forma de los argumentos: un objeto de esquemas zod con `.describe()`. */
export type FormaArgs = Record<string, z.ZodType>;

/** Argumentos ya validados para una forma dada. */
export type ArgsDe<S extends FormaArgs> = z.infer<z.ZodObject<S>>;

/** Contrato de una herramienta: `{ description, args, execute }`. */
export interface Herramienta<S extends FormaArgs = FormaArgs> {
  description: string;
  args: S;
  /** Devuelve siempre un string JSON `{ ok, data }` o `{ ok: false, error }`; nunca lanza. */
  execute(args: ArgsDe<S>, ctx: ContextoHerramienta): Promise<string>;
}

export function exito<T>(data: T): Resultado<T> {
  return { ok: true, data };
}

export function fallo<T = never>(error: string): Resultado<T> {
  return { ok: false, error };
}

/** Mensaje legible de cualquier valor lanzado, sin traza. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

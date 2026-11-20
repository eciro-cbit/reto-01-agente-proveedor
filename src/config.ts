import { z } from "zod";
import { describirErrorZod } from "./dominio/esquemas";
import type { Resultado } from "./tools/tipos";
import { exito, fallo } from "./tools/tipos";

/** Variables de entorno del backend; los números vacíos toman su valor por defecto. */
export type Entorno = Readonly<Record<string, string | undefined>>;

/** Proveedor LLM configurado (solo uno por ahora). */
export const PROVEEDOR_LLM = "anthropic";

const vacioComoIndefinido = (valor: unknown): unknown => (typeof valor === "string" && valor.trim() === "" ? undefined : valor);

const entero = (porDefecto: number, minimo: number) =>
  z.preprocess(vacioComoIndefinido, z.coerce.number().int().min(minimo).default(porDefecto));

const esquemaConfig = z.object({
  ANTHROPIC_API_KEY: z.preprocess(vacioComoIndefinido, z.string().optional()),
  LLM_MODELO: z.preprocess(vacioComoIndefinido, z.string().min(1).default("claude-sonnet-5-5")),
  LLM_TIMEOUT_MS: entero(60000, 1000),
  MAX_ITERACIONES: entero(25, 1),
  MAX_TOKENS_SESION: entero(200000, 1000),
  PORT: entero(3000, 1),
});

/** Configuración validada del backend. `claveApi` nunca se registra ni se devuelve en respuestas. */
export interface Config {
  claveApi: string | undefined;
  modelo: string;
  timeoutMs: number;
  maxIteraciones: number;
  maxTokensSesion: number;
  puerto: number;
}

/**
 * Lee y valida la configuración (NFR2, NFR3). La clave es opcional para que `/api/health`
 * responda aunque falte; el adaptador avisa con un mensaje claro al primer uso.
 */
export function leerConfig(env: Entorno): Resultado<Config> {
  const leido = esquemaConfig.safeParse(env);
  if (!leido.success) return fallo(`Configuración inválida: ${describirErrorZod(leido.error)}`);
  const d = leido.data;
  return exito({
    claveApi: d.ANTHROPIC_API_KEY,
    modelo: d.LLM_MODELO,
    timeoutMs: d.LLM_TIMEOUT_MS,
    maxIteraciones: d.MAX_ITERACIONES,
    maxTokensSesion: d.MAX_TOKENS_SESION,
    puerto: d.PORT,
  });
}

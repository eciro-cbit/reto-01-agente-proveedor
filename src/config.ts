import { z } from "zod";
import { describirErrorZod } from "./dominio/esquemas";
import type { Resultado } from "./tools/tipos";
import { exito, fallo } from "./tools/tipos";

/** Variables de entorno del backend; los números vacíos toman su valor por defecto. */
export type Entorno = Readonly<Record<string, string | undefined>>;

/** Proveedor LLM configurado (solo uno por ahora). */
export const PROVEEDOR_LLM = "anthropic";

/** Largo mínimo del código de acceso del despliegue (`CLAVE_ACCESO`), para que no sea trivial de adivinar. */
export const LARGO_MINIMO_CLAVE_ACCESO = 8;
/** Peticiones de chat por IP y por minuto cuando `LIMITE_PETICIONES_MINUTO` no está definida. */
export const LIMITE_PETICIONES_POR_DEFECTO = 20;

const vacioComoIndefinido =(valor: unknown): unknown => (typeof valor === "string" && valor.trim() === "" ? undefined : valor);

const entero = (porDefecto: number, minimo: number) =>
  z.preprocess(vacioComoIndefinido, z.coerce.number().int().min(minimo).default(porDefecto));

const esquemaConfig = z.object({
  ANTHROPIC_API_KEY: z.preprocess(vacioComoIndefinido, z.string().optional()),
  LLM_MODELO: z.preprocess(vacioComoIndefinido, z.string().min(1).default("claude-sonnet-5-5")),
  LLM_TIMEOUT_MS: entero(60000, 1000),
  MAX_ITERACIONES: entero(25, 1),
  MAX_TOKENS_SESION: entero(200000, 1000),
  PORT: entero(3000, 1),
  CLAVE_ACCESO: z.preprocess(
    vacioComoIndefinido,
    z.string().min(LARGO_MINIMO_CLAVE_ACCESO, `debe tener al menos ${LARGO_MINIMO_CLAVE_ACCESO} caracteres`).optional(),
  ),
  LIMITE_PETICIONES_MINUTO: entero(LIMITE_PETICIONES_POR_DEFECTO, 1),
});

/**
 * Configuración validada del backend. `claveApi` y `claveAcceso` nunca se registran ni se devuelven en respuestas.
 * `claveAcceso` ausente = el API no exige código (desarrollo local y pruebas).
 */
export interface Config {
  claveApi: string | undefined;
  modelo: string;
  timeoutMs: number;
  maxIteraciones: number;
  maxTokensSesion: number;
  puerto: number;
  claveAcceso: string | undefined;
  limitePeticionesMinuto: number;
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
    claveAcceso: d.CLAVE_ACCESO,
    limitePeticionesMinuto: d.LIMITE_PETICIONES_MINUTO,
  });
}

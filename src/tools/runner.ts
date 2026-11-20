import { z } from "zod";
import { describirErrorZod } from "../dominio/esquemas";
import { registrar } from "../dominio/registro";
import * as proveedor from "./proveedor";
import type { ContextoHerramienta, Herramienta, Resultado } from "./tipos";
import { fallo, mensajeDeError } from "./tipos";

/** Registro de herramientas por nombre visible (`<archivo>_<export>`). */
export type RegistroHerramientas = Readonly<Record<string, Herramienta>>;

const LARGO_RESUMEN = 200;

function esHerramienta(valor: unknown): valor is Herramienta {
  if (valor === null || typeof valor !== "object") return false;
  const candidato = valor as Partial<Record<keyof Herramienta, unknown>>;
  return typeof candidato.description === "string" && typeof candidato.args === "object" && typeof candidato.execute === "function";
}

/** Construye el registro `<prefijo>_<export>` a partir de los exports de un módulo de herramientas. */
export function construirRegistro(modulo: Readonly<Record<string, unknown>>, prefijo: string): RegistroHerramientas {
  const registro: Record<string, Herramienta> = {};
  for (const [nombre, valor] of Object.entries(modulo)) {
    if (esHerramienta(valor)) registro[`${prefijo}_${nombre}`] = valor;
  }
  return registro;
}

/** Herramientas de `src/tools/proveedor.ts` con su nombre visible para el modelo. */
export const herramientas: RegistroHerramientas = construirRegistro(proveedor, "proveedor");

/** Interpreta la salida de una herramienta; una salida que no es JSON válido se trata como fallo. */
export function leerResultado(salida: string): Resultado<unknown> {
  try {
    const valor = JSON.parse(salida) as { ok?: unknown; data?: unknown; error?: unknown };
    if (valor.ok === true) return { ok: true, data: valor.data };
    return fallo(typeof valor.error === "string" ? valor.error : "La herramienta devolvió un error sin descripción");
  } catch {
    return fallo("La herramienta devolvió una salida que no es JSON");
  }
}

/** Claves de texto libre del correo que no aportan al resumen. */
const CLAVES_OMITIDAS = new Set(["de", "asunto", "cuerpo", "cliente"]);
const LARGO_VALOR = 60;

/** Resumen corto y determinista: escalares breves tal cual y longitud de las listas. */
export function resumir(resultado: Resultado<unknown>): string {
  if (!resultado.ok) return resultado.error.slice(0, LARGO_RESUMEN);
  const data = resultado.data;
  if (data === null || typeof data !== "object") return String(data).slice(0, LARGO_RESUMEN);
  const partes = Object.entries(data).flatMap(([clave, valor]) => {
    if (CLAVES_OMITIDAS.has(clave)) return [];
    if (Array.isArray(valor)) return [`${clave}: ${valor.length}`];
    const esEscalar = typeof valor === "number" || typeof valor === "boolean" || typeof valor === "string";
    return esEscalar && String(valor).length <= LARGO_VALOR ? [`${clave}: ${String(valor)}`] : [];
  });
  return partes.join(", ").slice(0, LARGO_RESUMEN);
}

function casoDeArgs(args: unknown): string | undefined {
  if (args === null || typeof args !== "object") return undefined;
  const caso = (args as { caso?: unknown }).caso;
  return typeof caso === "string" ? caso : undefined;
}

async function validarYEjecutar(nombre: string, argsCrudos: unknown, ctx: ContextoHerramienta, registro: RegistroHerramientas): Promise<string> {
  const herramienta = registro[nombre];
  if (herramienta === undefined) return JSON.stringify(fallo(`La herramienta '${nombre}' no existe`));
  const validados = z.object(herramienta.args).safeParse(argsCrudos ?? {});
  if (!validados.success) return JSON.stringify(fallo(`Argumentos inválidos para ${nombre}: ${describirErrorZod(validados.error)}`));
  try {
    return await herramienta.execute(validados.data, ctx);
  } catch (error) {
    return JSON.stringify(fallo(`La herramienta ${nombre} falló: ${mensajeDeError(error)}`));
  }
}

/**
 * Punto único de ejecución: valida los args con zod, ejecuta sin dejar escapar excepciones
 * y registra `{ ts, herramienta, ok, resumen }` en `out/log.jsonl` y `out/<caso>/log.jsonl`.
 */
export async function ejecutarHerramienta(
  nombre: string,
  argsCrudos: unknown,
  ctx: ContextoHerramienta,
  registro: RegistroHerramientas = herramientas,
): Promise<string> {
  const salida = await validarYEjecutar(nombre, argsCrudos, ctx, registro);
  const resultado = leerResultado(salida);
  await registrar(ctx, casoDeArgs(argsCrudos), { ts: new Date().toISOString(), herramienta: nombre, ok: resultado.ok, resumen: resumir(resultado) });
  return salida;
}

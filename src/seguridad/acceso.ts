/**
 * Código de acceso del despliegue (NFR2, NFR3): protege el gasto de la clave del modelo en el servidor público.
 * No es autenticación de usuarios (fuera de alcance, PRD §3.2): todos comparten un mismo código.
 *
 * - El código viaja en el header `x-clave-acceso` y se compara con `CLAVE_ACCESO`.
 * - Sin `CLAVE_ACCESO` definida (desarrollo local, pruebas) no se exige nada.
 * - El código nunca se registra ni se devuelve en una respuesta.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export const HEADER_CLAVE_ACCESO = "x-clave-acceso";

export const MENSAJE_CLAVE_FALTANTE = "Este agente requiere un código de acceso. Ingrésalo para continuar.";
export const MENSAJE_CLAVE_INVALIDA = "El código de acceso no es válido. Revísalo e intenta de nuevo.";

/**
 * Resumen SHA-256 del texto: siempre 32 bytes. `timingSafeEqual` exige buffers del mismo largo y lanza si difieren;
 * comparar resúmenes evita ese error y no revela el largo del código esperado.
 */
const resumen = (texto: string): Buffer => createHash("sha256").update(texto, "utf8").digest();

/**
 * ¿El código enviado coincide con el esperado? Comparación en tiempo constante: con `===` el tiempo de respuesta
 * depende de cuántos caracteres iniciales coinciden y un atacante podría adivinar el código carácter a carácter.
 */
export function claveValida(enviada: string | undefined, esperada: string): boolean {
  if (enviada === undefined) return false;
  return timingSafeEqual(resumen(enviada), resumen(esperada));
}

/** Middleware que exige el código de acceso; responde 401 con un mensaje claro en español si falta o no coincide. */
export function exigirClave(config: { claveAcceso?: string | undefined }): MiddlewareHandler {
  const esperada = config.claveAcceso;
  return async (c, next) => {
    if (esperada === undefined) return next();
    const enviada = c.req.header(HEADER_CLAVE_ACCESO);
    if (claveValida(enviada, esperada)) return next();
    const faltante = enviada === undefined || enviada.trim() === "";
    const error = faltante
      ? { code: "CLAVE_REQUERIDA", message: MENSAJE_CLAVE_FALTANTE }
      : { code: "CLAVE_INVALIDA", message: MENSAJE_CLAVE_INVALIDA };
    return c.json({ error }, 401);
  };
}

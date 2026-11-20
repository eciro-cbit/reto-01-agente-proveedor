/**
 * Guarda de confirmación humana (CA3, RN4), aplicada en el backend y no solo en el prompt.
 * Una acción externa solo se autoriza si había una confirmación pendiente para ese caso
 * y el mensaje actual de la persona es una confirmación afirmativa sin reservas.
 */
import type { Resultado } from "../tools/tipos";
import { exito, fallo } from "../tools/tipos";
import type { ConfirmacionPendiente } from "./tipos";

/** Error que recibe el modelo cuando intenta enviar sin autorización (contrato §6.2). */
export const ERROR_SIN_CONFIRMACION = "requiere confirmación explícita";

const AFIRMACIONES = new Set(["si", "confirmo", "confirmado", "envia", "envialo", "enviala", "envialos", "adelante", "procede", "ok", "dale"]);
const FRASES_AFIRMATIVAS = ["de acuerdo"];
const RESERVAS = new Set(["no", "espera", "esperes", "todavia", "aun", "cancela", "cancelar", "detente", "pero"]);

/** Minúsculas sin tildes y solo letras, números y espacios. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * true si el texto confirma explícitamente ("sí", "confirmo", "envía", "adelante", "procede",
 * "de acuerdo", "ok"); false si contiene una reserva ("no", "espera", "todavía", "aún", "pero"…).
 */
export function esConfirmacion(texto: string): boolean {
  const normal = normalizar(texto);
  const palabras = normal.split(" ");
  if (palabras.some((p) => RESERVAS.has(p))) return false;
  return palabras.some((p) => AFIRMACIONES.has(p)) || FRASES_AFIRMATIVAS.some((f) => ` ${normal} `.includes(` ${f} `));
}

/** Autoriza el envío de `caso` solo con confirmación pendiente para ese caso y mensaje afirmativo. */
export function autorizarEnvio(pendiente: ConfirmacionPendiente | undefined, caso: string, mensajeUsuario: string): Resultado<ConfirmacionPendiente> {
  if (pendiente === undefined) return fallo(`${ERROR_SIN_CONFIRMACION}: primero pregunta con agente_solicitar_confirmacion y espera la respuesta`);
  if (pendiente.caso !== caso) return fallo(`${ERROR_SIN_CONFIRMACION}: la confirmación pendiente es para el caso '${pendiente.caso}', no para '${caso}'`);
  if (!esConfirmacion(mensajeUsuario)) return fallo(`${ERROR_SIN_CONFIRMACION}: el último mensaje de la persona no confirma el envío`);
  return exito(pendiente);
}

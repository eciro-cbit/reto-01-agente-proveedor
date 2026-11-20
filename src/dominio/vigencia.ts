import type { Resultado } from "../tools/tipos";
import { exito, fallo } from "../tools/tipos";
import type { SoporteIndice } from "./esquemas";

export type EstadoSoporte = "vigente" | "vencido" | "ausente";

export type Entorno = Readonly<Record<string, string | undefined>>;

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const dosDigitos = (n: number): string => String(n).padStart(2, "0");

/** Fecha local del sistema en formato AAAA-MM-DD. */
export function fechaLocal(ahora: Date): string {
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`;
}

function esFechaReal(texto: string): boolean {
  const partes = FECHA_ISO.exec(texto);
  if (partes === null) return false;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const fecha = new Date(Date.UTC(ano, mes - 1, dia));
  return fecha.getUTCFullYear() === ano && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

/**
 * Fecha de referencia para vigencias (FR4.5): `FECHA_REFERENCIA` (AAAA-MM-DD) si está definida,
 * si no la fecha local del sistema.
 */
export function resolverFechaReferencia(env: Entorno, ahora: Date): Resultado<string> {
  const valor = env["FECHA_REFERENCIA"]?.trim();
  if (valor === undefined || valor === "") return exito(fechaLocal(ahora));
  if (!esFechaReal(valor)) {
    return fallo(`FECHA_REFERENCIA='${valor}' no es válida: use el formato AAAA-MM-DD (por ejemplo 2026-09-03)`);
  }
  return exito(valor);
}

/**
 * Estado de un soporte a la fecha de referencia (FR4.2):
 * sin entrada = `ausente`; `vigencia_hasta` null = no vence; anterior a la referencia = `vencido`;
 * igual o posterior = `vigente`.
 */
export function estadoSoporte(soporte: SoporteIndice | undefined, fechaReferencia: string): EstadoSoporte {
  if (soporte === undefined) return "ausente";
  if (soporte.vigencia_hasta === null) return "vigente";
  return soporte.vigencia_hasta < fechaReferencia ? "vencido" : "vigente";
}

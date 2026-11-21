/**
 * Cliente HTTP del chat. Siempre llama a rutas relativas `/api/...`: en desarrollo Vite las reenvía al API
 * (proxy) y en producción el mismo servidor sirve front y API.
 *
 * Regla de esta capa: ninguna función lanza. Red caída, timeout, 4xx, 5xx o un cuerpo con forma inesperada
 * se convierten en `{ ok: false, error }` con un mensaje claro en español que la UI muestra tal cual (CA5).
 * El front nunca conoce la clave del proveedor: solo habla con nuestro backend.
 *
 * Despliegue: si hay un código de acceso guardado se envía en `x-clave-acceso`. Un 401 vuelve como falla con
 * `requiereClave: true` (la UI pide el código) y un 429 con `esperaSegundos` (tomado de `Retry-After`).
 */
import { leerClaveAcceso } from "./acceso";
import type { EntradaHistorial, FallaApi, RespuestaTurno, ResultadoApi, Salud, ToolCallVisible, VistaSesion } from "./tipos";

/** Mayor que el timeout del LLM en el backend, para que sea el backend quien explique el error. */
export const TIEMPO_MAXIMO_MS = 90_000;
export const HEADER_CLAVE_ACCESO = "x-clave-acceso";

export interface OpcionesApi {
  timeoutMs?: number;
  /** Código de acceso a enviar; por defecto, el guardado en `sessionStorage`. */
  claveAcceso?: string;
}

type Registro = Record<string, unknown>;

const esRegistro = (valor: unknown): valor is Registro => typeof valor === "object" && valor !== null && !Array.isArray(valor);

function esToolCall(valor: unknown): valor is ToolCallVisible {
  return esRegistro(valor) && typeof valor.nombre === "string" && typeof valor.resumen === "string" && typeof valor.ok === "boolean";
}

function esRespuestaTurno(valor: unknown): valor is RespuestaTurno {
  return (
    esRegistro(valor) &&
    typeof valor.reply === "string" &&
    typeof valor.needsConfirmation === "boolean" &&
    Array.isArray(valor.toolCalls) &&
    valor.toolCalls.every(esToolCall)
  );
}

function esEntradaHistorial(valor: unknown): valor is EntradaHistorial {
  if (!esRegistro(valor)) return false;
  const rolValido = valor.rol === "usuario" || valor.rol === "asistente";
  const toolCallsValidas = valor.toolCalls === undefined || (Array.isArray(valor.toolCalls) && valor.toolCalls.every(esToolCall));
  return rolValido && typeof valor.texto === "string" && toolCallsValidas;
}

function esVistaSesion(valor: unknown): valor is VistaSesion {
  return esRegistro(valor) && typeof valor.id === "string" && Array.isArray(valor.historial) && valor.historial.every(esEntradaHistorial);
}

function esSalud(valor: unknown): valor is Salud {
  return (
    esRegistro(valor) &&
    valor.ok === true &&
    typeof valor.provider === "string" &&
    typeof valor.model === "string" &&
    typeof valor.requiereClave === "boolean"
  );
}

/** Extrae `error.message` del sobre de error del backend (`{ error: { code, message } }`), si viene. */
function detalleDelBackend(cuerpo: unknown): string | undefined {
  if (!esRegistro(cuerpo) || !esRegistro(cuerpo.error)) return undefined;
  return typeof cuerpo.error.message === "string" ? cuerpo.error.message : undefined;
}

/** Segundos de espera de un 429: el header `Retry-After` (en segundos); si falta o no es válido, 60. */
export function segundosDeEspera(retryAfter: string | null): number {
  const segundos = retryAfter === null ? Number.NaN : Number.parseInt(retryAfter, 10);
  return Number.isFinite(segundos) && segundos > 0 ? segundos : 60;
}

export function mensajeHttp(estado: number, cuerpo: unknown, esperaSegundos = 60): string {
  const detalle = detalleDelBackend(cuerpo);
  if (estado >= 500) return `El servidor del agente tuvo un error (${estado}). Intenta de nuevo en un momento.`;
  if (estado === 400) return `El servidor rechazó la solicitud: ${detalle ?? "datos inválidos"}.`;
  if (estado === 401) return detalle ?? "Este agente requiere un código de acceso. Ingrésalo para continuar.";
  if (estado === 404) return `El servidor no encontró lo pedido${detalle ? `: ${detalle}` : ""}.`;
  if (estado === 429) return `Demasiadas solicitudes seguidas. Espera ${esperaSegundos} s antes de enviar otro mensaje.`;
  return `Respuesta inesperada del servidor (${estado}). Intenta de nuevo.`;
}

interface RespuestaCruda {
  estado: number;
  cuerpo: unknown;
  retryAfter: string | null;
}

/** Convierte una respuesta HTTP no exitosa en una falla tipada (401 → `requiereClave`, 429 → `esperaSegundos`). */
function fallaHttp({ estado, cuerpo, retryAfter }: RespuestaCruda): FallaApi {
  if (estado === 401) return { ok: false, error: mensajeHttp(estado, cuerpo), requiereClave: true };
  if (estado === 429) {
    const esperaSegundos = segundosDeEspera(retryAfter);
    return { ok: false, error: mensajeHttp(estado, cuerpo, esperaSegundos), esperaSegundos };
  }
  return { ok: false, error: mensajeHttp(estado, cuerpo) };
}

const exitoso = (estado: number): boolean => estado >= 200 && estado < 300;

function mensajeExcepcion(porTimeout: boolean, timeoutMs: number): string {
  if (porTimeout) return `El agente tardó demasiado en responder (más de ${Math.round(timeoutMs / 1000)} s). Intenta de nuevo.`;
  return "No se pudo conectar con el servidor del agente. Revisa que el API esté corriendo (npm run dev) e intenta de nuevo.";
}

async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    return undefined; // cuerpo vacío o no JSON: lo trata quien valida la forma
  }
}

/** Cabeceras de la petición más el código de acceso, si hay uno. */
function cabecerasCon(base: Record<string, string>, opciones: OpcionesApi): Record<string, string> {
  const clave = opciones.claveAcceso ?? leerClaveAcceso();
  return clave === undefined ? base : { ...base, [HEADER_CLAVE_ACCESO]: clave };
}

/** `fetch` con timeout que devuelve el estado HTTP, el cuerpo JSON y `Retry-After`, o un error ya redactado. */
async function pedir(ruta: string, init: RequestInit & { headers?: Record<string, string> }, opciones: OpcionesApi): Promise<ResultadoApi<RespuestaCruda>> {
  const timeoutMs = opciones.timeoutMs ?? TIEMPO_MAXIMO_MS;
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await fetch(ruta, { ...init, headers: cabecerasCon(init.headers ?? {}, opciones), signal: controlador.signal });
    return { ok: true, datos: { estado: respuesta.status, cuerpo: await leerJson(respuesta), retryAfter: respuesta.headers.get("Retry-After") } };
  } catch (error) {
    console.warn(`Fallo de red en ${ruta}:`, error);
    return { ok: false, error: mensajeExcepcion(controlador.signal.aborted, timeoutMs) };
  } finally {
    clearTimeout(temporizador);
  }
}

const FORMATO_INESPERADO = "La respuesta del servidor no tiene el formato esperado. Intenta de nuevo.";

/** Envía un mensaje del usuario y devuelve la respuesta del turno (`POST /api/chat`). */
export async function enviarMensaje(sessionId: string, message: string, opciones: OpcionesApi = {}): Promise<ResultadoApi<RespuestaTurno>> {
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, message }) };
  const resultado = await pedir("/api/chat", init, opciones);
  if (!resultado.ok) return resultado;
  const { estado, cuerpo } = resultado.datos;
  if (!exitoso(estado)) return fallaHttp(resultado.datos);
  return esRespuestaTurno(cuerpo) ? { ok: true, datos: cuerpo } : { ok: false, error: FORMATO_INESPERADO };
}

/** Historial de una sesión (`GET /api/sessions/:id`). Una sesión que aún no existe no es un error: devuelve `null`. */
export async function obtenerSesion(sessionId: string, opciones: OpcionesApi = {}): Promise<ResultadoApi<VistaSesion | null>> {
  const resultado = await pedir(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" }, opciones);
  if (!resultado.ok) return resultado;
  const { estado, cuerpo } = resultado.datos;
  if (estado === 404) return { ok: true, datos: null };
  if (!exitoso(estado)) return fallaHttp(resultado.datos);
  return esVistaSesion(cuerpo) ? { ok: true, datos: cuerpo } : { ok: false, error: FORMATO_INESPERADO };
}

/** Proveedor, modelo activo y si se exige código (`GET /api/health`, público), para el encabezado. */
export async function obtenerSalud(opciones: OpcionesApi = {}): Promise<ResultadoApi<Salud>> {
  const resultado = await pedir("/api/health", { method: "GET" }, opciones);
  if (!resultado.ok) return resultado;
  const { estado, cuerpo } = resultado.datos;
  if (!exitoso(estado)) return fallaHttp(resultado.datos);
  return esSalud(cuerpo) ? { ok: true, datos: cuerpo } : { ok: false, error: FORMATO_INESPERADO };
}

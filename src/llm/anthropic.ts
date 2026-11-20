/**
 * Implementación Anthropic de `AdaptadorLLM` (Messages API con tool use).
 * Único archivo que importa el SDK. Las funciones de traducción son puras y exportadas
 * para probarlas sin red ni clave.
 */
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaStopReason,
  BetaTool,
  BetaToolUseBlock,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AdaptadorLLM, DefinicionHerramienta, LlamadaHerramienta, Mensaje, MotivoFin, RespuestaLLM } from "./adapter";
import { ErrorLLM } from "./adapter";

export const PROVEEDOR_ANTHROPIC = "anthropic";

/** Tope de salida por respuesta: amplio para no cortar el resumen y bajo el timeout HTTP sin streaming. */
const MAX_TOKENS_RESPUESTA = 16000;
/** Reintento server-side en otro modelo si el solicitado declina por política (los modelos sin soporte lo ignoran). */
const BETA_FALLBACK = "server-side-fallback-2026-07-01";
const REINTENTOS_SDK = 1;

type RolAnthropic = "user" | "assistant";
interface Turno {
  role: RolAnthropic;
  content: BetaContentBlockParam[];
}

function bloqueTexto(texto: string): BetaContentBlockParam[] {
  return texto.trim() === "" ? [] : [{ type: "text", text: texto }];
}

function bloquesAsistente(texto: string, llamadas: readonly LlamadaHerramienta[], original: unknown): BetaContentBlockParam[] {
  // El contenido original se reenvía sin cambios (bloques de razonamiento incluidos).
  if (Array.isArray(original) && original.length > 0) return original as BetaContentBlockParam[];
  const usos: BetaContentBlockParam[] = llamadas.map((l) => ({ type: "tool_use", id: l.id, name: l.nombre, input: l.argumentos ?? {} }));
  return [...bloqueTexto(texto), ...usos];
}

function aTurno(mensaje: Mensaje): Turno {
  switch (mensaje.rol) {
    case "usuario":
      return { role: "user", content: bloqueTexto(mensaje.texto) };
    case "herramienta":
      return {
        role: "user",
        content: mensaje.resultados.map((r) => ({ type: "tool_result", tool_use_id: r.idLlamada, content: r.contenido, is_error: r.esError })),
      };
    case "asistente":
      return { role: "assistant", content: bloquesAsistente(mensaje.texto, mensaje.llamadas, mensaje.contenidoProveedor) };
  }
}

/**
 * Traduce la transcripción neutral a mensajes de la Messages API. Une turnos consecutivos del
 * mismo rol (resultados de herramientas + texto del usuario) y omite turnos vacíos.
 */
export function aMensajesAnthropic(mensajes: readonly Mensaje[]): BetaMessageParam[] {
  const turnos: Turno[] = [];
  for (const turno of mensajes.map(aTurno)) {
    if (turno.content.length === 0) continue;
    const ultimo = turnos.at(-1);
    if (ultimo !== undefined && ultimo.role === turno.role) ultimo.content.push(...turno.content);
    else turnos.push({ role: turno.role, content: [...turno.content] });
  }
  return turnos;
}

/** Traduce las definiciones neutrales a herramientas de la Messages API. */
export function aHerramientasAnthropic(definiciones: readonly DefinicionHerramienta[]): BetaTool[] {
  return definiciones.map((d) => ({
    name: d.nombre,
    description: d.descripcion,
    input_schema: { ...d.esquema, type: "object" },
  }));
}

function motivoFin(motivo: BetaStopReason | null): MotivoFin {
  switch (motivo) {
    case "tool_use":
      return "herramientas";
    case "end_turn":
    case "stop_sequence":
      return "fin";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "limite_salida";
    case "refusal":
      return "rechazo";
    default:
      return "otro";
  }
}

const esUsoHerramienta = (bloque: BetaMessage["content"][number]): bloque is BetaToolUseBlock => bloque.type === "tool_use";

/** Traduce una respuesta de la Messages API a `RespuestaLLM`; el uso suma los tokens leídos de caché. */
export function deRespuestaAnthropic(respuesta: BetaMessage): RespuestaLLM {
  const texto = respuesta.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
  const llamadas = respuesta.content.filter(esUsoHerramienta).map((b) => ({ id: b.id, nombre: b.name, argumentos: b.input }));
  const u = respuesta.usage;
  const entrada = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return { texto, llamadas, uso: { entrada, salida: u.output_tokens }, motivoFin: motivoFin(respuesta.stop_reason), contenidoProveedor: respuesta.content };
}

/**
 * Convierte cualquier error del SDK en `ErrorLLM` con un mensaje fijo en español.
 * Nunca copia el mensaje del SDK (podría contener datos de la petición) ni la clave.
 */
export function traducirError(error: unknown): ErrorLLM {
  if (error instanceof ErrorLLM) return error;
  if (error instanceof APIConnectionTimeoutError) {
    return new ErrorLLM("timeout", "El modelo no respondió a tiempo. Intenta de nuevo en un momento; la conversación sigue activa.");
  }
  if (error instanceof APIConnectionError) {
    return new ErrorLLM("red", "No hay conexión con el proveedor del modelo. Revisa la red del servidor e intenta de nuevo.");
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new ErrorLLM("autenticacion", "El proveedor rechazó la clave del servidor (ANTHROPIC_API_KEY inválida o sin permisos). Avisa a quien administra el servidor.");
  }
  if (error instanceof RateLimitError) {
    return new ErrorLLM("limite", "El proveedor del modelo está limitando las solicitudes. Espera un momento e intenta de nuevo.");
  }
  if (error instanceof APIError) {
    const estado = error.status === undefined ? "" : ` (HTTP ${error.status})`;
    return new ErrorLLM("proveedor", `El proveedor del modelo devolvió un error${estado}. Intenta de nuevo; si persiste, avisa a quien administra el servidor.`);
  }
  return new ErrorLLM("proveedor", "Ocurrió un error inesperado al consultar el modelo. Intenta de nuevo.");
}

export interface ConfigAnthropic {
  claveApi: string;
  modelo: string;
  timeoutMs: number;
}

/** Envía una petición ya armada; se inyecta en pruebas para no usar red. */
export type CrearMensaje = (parametros: MessageCreateParamsNonStreaming, opciones: { timeout: number }) => Promise<BetaMessage>;

/** Arma la petición: system prompt cacheable, herramientas, esfuerzo medio y fallback por defecto. */
export function armarPeticion(
  config: Pick<ConfigAnthropic, "modelo">,
  mensajes: readonly Mensaje[],
  herramientas: readonly DefinicionHerramienta[],
  sistema: string,
): MessageCreateParamsNonStreaming {
  return {
    model: config.modelo,
    max_tokens: MAX_TOKENS_RESPUESTA,
    system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
    messages: aMensajesAnthropic(mensajes),
    tools: aHerramientasAnthropic(herramientas),
    output_config: { effort: "medium" },
    betas: [BETA_FALLBACK],
    fallbacks: "default",
  };
}

function crearMensajeConSdk(config: ConfigAnthropic): CrearMensaje {
  const cliente = new Anthropic({ apiKey: config.claveApi, maxRetries: REINTENTOS_SDK });
  return (parametros, opciones) => cliente.beta.messages.create(parametros, opciones);
}

/** Adaptador Anthropic; `crear` permite sustituir el SDK en pruebas. */
export function crearAdaptadorAnthropic(config: ConfigAnthropic, crear: CrearMensaje = crearMensajeConSdk(config)): AdaptadorLLM {
  return {
    proveedor: PROVEEDOR_ANTHROPIC,
    modelo: config.modelo,
    async enviar(mensajes, herramientas, { sistema }) {
      try {
        const respuesta = await crear(armarPeticion(config, mensajes, herramientas, sistema), { timeout: config.timeoutMs });
        return deRespuestaAnthropic(respuesta);
      } catch (error) {
        throw traducirError(error);
      }
    },
  };
}

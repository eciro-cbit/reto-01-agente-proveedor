import type { Mensaje } from "../llm/adapter";

/** Llamada a herramienta tal como se muestra en el chat (CA4). */
export interface ToolCallVisible {
  nombre: string;
  argumentos: unknown;
  /** Resultado resumido (sin volcar datos completos). */
  resumen: string;
  ok: boolean;
}

/** Entrada del historial visible de la sesión. */
export interface EntradaHistorial {
  rol: "usuario" | "asistente";
  texto: string;
  ts: string;
  toolCalls?: ToolCallVisible[];
  needsConfirmation?: boolean;
}

/** Acción externa que espera confirmación explícita del usuario (CA3, RN4). */
export interface ConfirmacionPendiente {
  caso: string;
  accion: "simular_envio";
  resumen: string;
}

/**
 * Sesión del chat: historial visible para el front y transcripción neutral para el modelo.
 * Nunca contiene la clave del proveedor (NFR2).
 */
export interface Sesion {
  id: string;
  creada: string;
  historial: EntradaHistorial[];
  mensajesLLM: Mensaje[];
  confirmacionPendiente?: ConfirmacionPendiente;
  tokensUsados: number;
}

/** Respuesta de un turno del agente (contrato de `POST /api/chat`). */
export interface RespuestaTurno {
  reply: string;
  toolCalls: ToolCallVisible[];
  needsConfirmation: boolean;
}

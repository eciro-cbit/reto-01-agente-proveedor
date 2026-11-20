/**
 * Tipos del front. Los del contrato HTTP se importan (solo tipos) del backend para no duplicarlos:
 * si el backend cambia la forma de `POST /api/chat`, el front deja de compilar.
 */
import type { ConfirmacionPendiente, EntradaHistorial, RespuestaTurno, ToolCallVisible } from "../../../src/agente/tipos";

export type { ConfirmacionPendiente, EntradaHistorial, RespuestaTurno, ToolCallVisible };

/** Cuerpo de `GET /api/sessions/:id` (ver `vistaSesion` en `src/server.ts`). */
export interface VistaSesion {
  id: string;
  creada: string;
  historial: EntradaHistorial[];
  confirmacionPendiente: ConfirmacionPendiente | null;
  tokensUsados: number;
}

/** Cuerpo de `GET /api/health`. */
export interface Salud {
  ok: true;
  provider: string;
  model: string;
}

/** Resultado de una llamada a la API: nunca lanza; el error ya viene redactado en español para el chat. */
export type ResultadoApi<T> = { ok: true; datos: T } | { ok: false; error: string };

export type RolMensaje = "usuario" | "asistente" | "error";

/** Mensaje tal como lo pinta la lista del chat. */
export interface MensajeVisible {
  id: number;
  rol: RolMensaje;
  texto: string;
  toolCalls: ToolCallVisible[];
  /** Solo en respuestas del agente: el turno terminó pidiendo confirmación (CA3). */
  needsConfirmation: boolean;
}

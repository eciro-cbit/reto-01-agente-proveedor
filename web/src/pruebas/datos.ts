/**
 * Datos y `fetch` simulado para las pruebas del front (solo se importan desde `*.test.ts`).
 * Las respuestas se tipan con el contrato real del backend (`src/agente/tipos.ts`): si cambia su forma, las pruebas no compilan.
 */
import { vi } from "vitest";
import type { RespuestaTurno, Salud, ToolCallVisible, VistaSesion } from "../lib/tipos";

export const PROMPT_ECUADOR =
  'Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles faltan, si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.';

export function toolCall(nombre: string, cambios: Partial<ToolCallVisible> = {}): ToolCallVisible {
  return { nombre, argumentos: { caso: "ec-corp-andina" }, resumen: `${nombre} ejecutada`, ok: true, ...cambios };
}

/** Primer turno de `ec-corp-andina`: 5 herramientas y pregunta de confirmación (PRD §11). */
export function respuestaEcuador(): RespuestaTurno {
  return {
    reply: "Paquete en out/ec-corp-andina/paquete/. Estado: listo_para_firma.\nFaltan 2 campos. ¿Quieres que simule el envío?",
    toolCalls: [
      toolCall("proveedor_leer_solicitud", { resumen: "Solicitud de Corp Andina (EC) leída" }),
      toolCall("proveedor_mapear_campos", { resumen: "18 campos llenos, 2 faltantes" }),
      toolCall("proveedor_generar_formulario", { resumen: "Formulario PDF generado" }),
      toolCall("proveedor_armar_paquete", { resumen: "Paquete listo_para_firma" }),
      toolCall("agente_solicitar_confirmacion", { argumentos: { caso: "ec-corp-andina", accion: "simular_envio" }, resumen: "Se pidió confirmación para simular el envío" }),
    ],
    needsConfirmation: true,
  };
}

/** Segundo turno tras confirmar: el envío simulado. */
export function respuestaEnvio(): RespuestaTurno {
  return {
    reply: "Listo: escribí out/ec-corp-andina/ENVIO-SIMULADO.md.",
    toolCalls: [toolCall("proveedor_simular_envio", { resumen: "ENVIO-SIMULADO.md escrito" })],
    needsConfirmation: false,
  };
}

export const SALUD: Salud = { ok: true, provider: "anthropic", model: "claude-sonnet-5-5", requiereClave: false };

export function vistaSesion(cambios: Partial<VistaSesion> = {}): VistaSesion {
  return { id: "sesion-prueba", creada: "2026-11-20T10:00:00.000Z", historial: [], confirmacionPendiente: null, tokensUsados: 0, ...cambios };
}

export function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
}

export type Manejador = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/**
 * Instala un `fetch` global simulado que enruta por URL. `/api/health` y `/api/sessions/*` tienen respuestas
 * por defecto (sesión inexistente → 404); `/api/chat` usa la cola `turnos`, en orden.
 */
export function instalarFetch(turnos: Manejador[], extra: { sesion?: Manejador; salud?: Manejador } = {}) {
  const pendientes = [...turnos];
  const simulado = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (url.startsWith("/api/health")) return (extra.salud ?? (() => respuestaJson(SALUD)))(url, init);
    if (url.startsWith("/api/sessions/")) return (extra.sesion ?? (() => respuestaJson({ error: { code: "SESION_NO_EXISTE", message: "no existe" } }, 404)))(url, init);
    const siguiente = pendientes.shift();
    if (url === "/api/chat" && siguiente !== undefined) return siguiente(url, init);
    throw new Error(`fetch simulado sin respuesta para ${url}`);
  });
  vi.stubGlobal("fetch", simulado);
  return simulado;
}

/** Cuerpo JSON enviado en la llamada `n` a `/api/chat`. */
export function cuerpoEnviado(simulado: ReturnType<typeof instalarFetch>, n: number): unknown {
  const llamadas = simulado.mock.calls.filter(([entrada]) => entrada === "/api/chat");
  const init = llamadas[n]?.[1];
  return typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
}

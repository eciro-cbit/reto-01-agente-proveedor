import { APIConnectionError, APIConnectionTimeoutError, AuthenticationError, InternalServerError, RateLimitError } from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it } from "vitest";
import type { Mensaje } from "../../src/llm/adapter";
import { ErrorLLM } from "../../src/llm/adapter";
import { aMensajesAnthropic, armarPeticion, crearAdaptadorAnthropic, deRespuestaAnthropic, traducirError } from "../../src/llm/anthropic";
import { crearAdaptador, MENSAJE_SIN_CLAVE } from "../../src/llm/index";

const CLAVE_FALSA = "sk-ant-prueba-no-real";

/** Respuesta con la forma de la Messages API; parte de un mensaje válido y cambia solo lo necesario. */
function respuestaApi(cambios: Partial<BetaMessage> = {}): BetaMessage {
  return {
    id: "msg_prueba",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [
      { type: "text", text: "Voy a leer la solicitud.", citations: null },
      { type: "tool_use", id: "toolu_1", name: "proveedor_leer_solicitud", input: { caso: "ec-corp-andina" } },
    ],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 300 },
    ...cambios,
  } as BetaMessage;
}

describe("aMensajesAnthropic", () => {
  it("traduce usuario, asistente con tool use y resultados, uniendo turnos consecutivos del usuario", () => {
    const mensajes: Mensaje[] = [
      { rol: "usuario", texto: "Procesa ec-corp-andina" },
      { rol: "asistente", texto: "", llamadas: [{ id: "toolu_1", nombre: "proveedor_leer_solicitud", argumentos: { caso: "ec-corp-andina" } }] },
      { rol: "herramienta", resultados: [{ idLlamada: "toolu_1", contenido: '{"ok":true,"data":{}}', esError: false }] },
      { rol: "usuario", texto: "sigue" },
    ];
    expect(aMensajesAnthropic(mensajes)).toEqual([
      { role: "user", content: [{ type: "text", text: "Procesa ec-corp-andina" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "proveedor_leer_solicitud", input: { caso: "ec-corp-andina" } }] },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: '{"ok":true,"data":{}}', is_error: false },
          { type: "text", text: "sigue" },
        ],
      },
    ]);
  });

  it("reenvía sin cambios el contenido original del proveedor (bloques de razonamiento incluidos)", () => {
    const original = [{ type: "thinking", thinking: "", signature: "firma" }, ...respuestaApi().content];
    const r = aMensajesAnthropic([{ rol: "usuario", texto: "hola" }, { rol: "asistente", texto: "x", llamadas: [], contenidoProveedor: original }]);
    expect(r[1]).toEqual({ role: "assistant", content: original });
  });

  it("omite los textos vacíos", () => {
    expect(aMensajesAnthropic([{ rol: "usuario", texto: "   " }])).toEqual([]);
  });
});

describe("deRespuestaAnthropic", () => {
  it("convierte una respuesta con tool_use en RespuestaLLM y suma los tokens de caché", () => {
    const r = deRespuestaAnthropic(respuestaApi());
    expect(r).toMatchObject({
      texto: "Voy a leer la solicitud.",
      llamadas: [{ id: "toolu_1", nombre: "proveedor_leer_solicitud", argumentos: { caso: "ec-corp-andina" } }],
      uso: { entrada: 1500, salida: 80 },
      motivoFin: "herramientas",
    });
  });

  it.each([
    ["end_turn", "fin"],
    ["max_tokens", "limite_salida"],
    ["refusal", "rechazo"],
    ["pause_turn", "otro"],
  ] as const)("stop_reason %s → motivoFin %s", (stop, motivo) => {
    expect(deRespuestaAnthropic(respuestaApi({ stop_reason: stop })).motivoFin).toBe(motivo);
  });
});

describe("armarPeticion", () => {
  it("usa el modelo configurado, todas las herramientas, el system prompt y nunca la clave", () => {
    const p = armarPeticion({ modelo: "claude-haiku-5-5" }, [{ rol: "usuario", texto: "hola" }], [{ nombre: "h1", descripcion: "d", esquema: { properties: {} } }], "SISTEMA");
    expect(p).toMatchObject({ model: "claude-haiku-5-5", fallbacks: "default", tools: [{ name: "h1", description: "d", input_schema: { type: "object", properties: {} } }] });
    expect(JSON.stringify(p)).toContain("SISTEMA");
    expect(JSON.stringify(p)).not.toContain(CLAVE_FALSA);
  });
});

describe("traducirError", () => {
  it("401 → autenticacion, en español y sin la clave", () => {
    const e = traducirError(new AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${CLAVE_FALSA}` } }, `invalid x-api-key ${CLAVE_FALSA}`, new Headers()));
    expect(e.tipo).toBe("autenticacion");
    expect(e.message).toMatch(/ANTHROPIC_API_KEY inválida/);
    expect(e.message).not.toContain(CLAVE_FALSA);
  });

  it("timeout del SDK → timeout con mensaje claro", () => {
    const e = traducirError(new APIConnectionTimeoutError());
    expect(e).toBeInstanceOf(ErrorLLM);
    expect(e.tipo).toBe("timeout");
    expect(e.message).toMatch(/no respondió a tiempo/);
  });

  it("429, 5xx, red y errores desconocidos tienen su tipo", () => {
    expect(traducirError(new RateLimitError(429, undefined, "rate", new Headers())).tipo).toBe("limite");
    const e500 = traducirError(new InternalServerError(500, undefined, "boom", new Headers()));
    expect([e500.tipo, e500.message]).toEqual(["proveedor", expect.stringContaining("HTTP 500")]);
    expect(traducirError(new APIConnectionError({ message: "ECONNRESET" })).tipo).toBe("red");
    expect(traducirError(new Error(`algo con ${CLAVE_FALSA}`)).message).not.toContain(CLAVE_FALSA);
  });
});

describe("crearAdaptadorAnthropic", () => {
  it("envía la petición con el timeout configurado y traduce la respuesta", async () => {
    const opcionesVistas: number[] = [];
    const adaptador = crearAdaptadorAnthropic({ claveApi: CLAVE_FALSA, modelo: "claude-sonnet-5-5", timeoutMs: 1234 }, async (_p, opciones) => {
      opcionesVistas.push(opciones.timeout);
      return respuestaApi({ stop_reason: "end_turn", content: [{ type: "text", text: "listo", citations: null }] });
    });
    const r = await adaptador.enviar([{ rol: "usuario", texto: "hola" }], [], { sistema: "S" });
    expect(r.texto).toBe("listo");
    expect(opcionesVistas).toEqual([1234]);
  });

  it("un error del SDK sale como ErrorLLM", async () => {
    const adaptador = crearAdaptadorAnthropic({ claveApi: CLAVE_FALSA, modelo: "m", timeoutMs: 10 }, () => Promise.reject(new APIConnectionTimeoutError()));
    await expect(adaptador.enviar([{ rol: "usuario", texto: "hola" }], [], { sistema: "S" })).rejects.toMatchObject({ tipo: "timeout" });
  });
});

describe("crearAdaptador", () => {
  it("sin clave responde un ErrorLLM claro sin llamar a la red", async () => {
    const adaptador = crearAdaptador({ claveApi: undefined, modelo: "claude-sonnet-5-5", timeoutMs: 1000 });
    expect(adaptador.modelo).toBe("claude-sonnet-5-5");
    await expect(adaptador.enviar([], [], { sistema: "" })).rejects.toMatchObject({ tipo: "autenticacion", message: MENSAJE_SIN_CLAVE });
  });
});

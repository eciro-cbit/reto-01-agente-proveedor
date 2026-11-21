import { describe, expect, it, vi } from "vitest";
import { respuestaEcuador, respuestaEnvio, vistaSesion } from "../pruebas/datos";
import { ChatEstado, LARGO_MAXIMO_MENSAJE, type DependenciasChat } from "./chat.svelte";
import type { RespuestaTurno, ResultadoApi, VistaSesion } from "./tipos";

type ResultadoTurno = ResultadoApi<RespuestaTurno>;

/** ChatEstado con API y sesión dobles; `turnos` responde a cada envío en orden. */
function crearChat(turnos: ResultadoTurno[], extra: Partial<DependenciasChat> = {}) {
  const pendientes = [...turnos];
  const enviarMensaje = vi.fn(async (): Promise<ResultadoTurno> => pendientes.shift() ?? { ok: false, error: "sin respuesta preparada" });
  const deps: Partial<DependenciasChat> = {
    enviarMensaje,
    obtenerSesion: async () => ({ ok: true, datos: null }),
    obtenerSessionId: () => "sesion-a",
    reiniciarSessionId: () => "sesion-b",
    ...extra,
  };
  return { chat: new ChatEstado(deps), enviarMensaje };
}

const ok = (datos: RespuestaTurno): ResultadoTurno => ({ ok: true, datos });

describe("ChatEstado.enviar", () => {
  it("agrega el mensaje del usuario y la respuesta del agente con sus toolCalls", async () => {
    const { chat, enviarMensaje } = crearChat([ok(respuestaEcuador())]);
    const enviado = await chat.enviar("  Procesa ec-corp-andina  ");
    expect(enviado).toBe(true);
    expect(enviarMensaje).toHaveBeenCalledWith("sesion-a", "Procesa ec-corp-andina");
    expect(chat.mensajes.map((m) => m.rol)).toEqual(["usuario", "asistente"]);
    expect(chat.mensajes[1]?.toolCalls).toHaveLength(5);
    expect(chat.pensando).toBe(false);
  });

  it("marca pensando mientras espera y bloquea un segundo envío", async () => {
    let responder: (r: ResultadoTurno) => void = () => undefined;
    const enviarMensaje = vi.fn(() => new Promise<ResultadoTurno>((r) => (responder = r)));
    const { chat } = crearChat([], { enviarMensaje });
    const enCurso = chat.enviar("hola");
    expect(chat.pensando).toBe(true);
    expect(chat.puedeEnviar).toBe(false);
    expect(await chat.enviar("otro")).toBe(false);
    responder(ok(respuestaEnvio()));
    await enCurso;
    expect(chat.puedeEnviar).toBe(true);
    expect(enviarMensaje).toHaveBeenCalledTimes(1);
  });

  it("needsConfirmation se refleja en el turno y se apaga en el siguiente", async () => {
    const { chat } = crearChat([ok(respuestaEcuador()), ok(respuestaEnvio())]);
    await chat.enviar("Procesa ec-corp-andina");
    expect(chat.needsConfirmation).toBe(true);
    expect(chat.mensajes[1]?.needsConfirmation).toBe(true);
    await chat.enviar("Sí, confirmo el envío");
    expect(chat.needsConfirmation).toBe(false);
  });

  it("un error de la API queda como mensaje de error y se puede reenviar", async () => {
    const { chat } = crearChat([{ ok: false, error: "No se pudo conectar con el servidor del agente." }, ok(respuestaEnvio())]);
    await chat.enviar("hola");
    expect(chat.mensajes.at(-1)).toMatchObject({ rol: "error", texto: "No se pudo conectar con el servidor del agente." });
    expect(chat.error).toMatch(/No se pudo conectar/);
    expect(chat.pensando).toBe(false);
    expect(await chat.enviar("hola otra vez")).toBe(true);
    expect(chat.mensajes.at(-1)?.rol).toBe("asistente");
    expect(chat.error).toBeNull();
  });

  it("no envía texto vacío ni un mensaje más largo que el límite del backend", async () => {
    const { chat, enviarMensaje } = crearChat([]);
    expect(await chat.enviar("   ")).toBe(false);
    expect(await chat.enviar("x".repeat(LARGO_MAXIMO_MENSAJE + 1))).toBe(false);
    expect(enviarMensaje).not.toHaveBeenCalled();
    expect(chat.mensajes.map((m) => m.rol)).toEqual(["error"]);
  });
});

describe("código de acceso y límite de peticiones", () => {
  /** Almacén del código en memoria para no depender de sessionStorage. */
  function almacenCodigo(inicial?: string) {
    let codigo = inicial;
    return {
      leerClaveAcceso: () => codigo,
      guardarClaveAcceso: vi.fn((c: string) => (codigo = c)),
      borrarClaveAcceso: vi.fn(() => (codigo = undefined)),
      actual: () => codigo,
    };
  }
  const noAutorizado = (error = "Este agente requiere un código de acceso."): ResultadoTurno => ({ ok: false, error, requiereClave: true });

  it("un 401 activa necesitaClave sin error en la primera visita y no deja un mensaje de error en el chat", async () => {
    const almacen = almacenCodigo();
    const { chat } = crearChat([noAutorizado()], almacen);
    await chat.enviar("hola");
    expect(chat.necesitaClave).toBe(true);
    expect(chat.errorClave).toBeNull();
    expect(chat.pensando).toBe(false);
    expect(chat.mensajes.map((m) => m.rol)).toEqual(["usuario"]);
  });

  it("tras guardar el código reintenta el mismo mensaje una sola vez y recibe la respuesta", async () => {
    const almacen = almacenCodigo();
    const { chat, enviarMensaje } = crearChat([noAutorizado(), ok(respuestaEnvio())], almacen);
    await chat.enviar("Sí, confirmo el envío");
    expect(await chat.guardarClave("  prueba-local-123  ")).toBe(true);
    expect(almacen.actual()).toBe("prueba-local-123");
    expect(chat.necesitaClave).toBe(false);
    expect(enviarMensaje).toHaveBeenCalledTimes(2);
    expect(enviarMensaje).toHaveBeenLastCalledWith("sesion-a", "Sí, confirmo el envío");
    expect(chat.mensajes.map((m) => m.rol)).toEqual(["usuario", "asistente"]);
  });

  it("un código guardado que el servidor rechaza se borra y se explica el motivo", async () => {
    const almacen = almacenCodigo("codigo-viejo-1");
    const { chat } = crearChat([noAutorizado("El código de acceso no es válido.")], almacen);
    await chat.enviar("hola");
    expect(almacen.borrarClaveAcceso).toHaveBeenCalled();
    expect(almacen.actual()).toBeUndefined();
    expect(chat.errorClave).toBe("El código de acceso no es válido.");
  });

  it("un código vacío o con caracteres no válidos no se guarda", async () => {
    const almacen = almacenCodigo();
    const { chat } = crearChat([], almacen);
    expect(await chat.guardarClave("   ")).toBe(false);
    expect(await chat.guardarClave("contraseña-ñ")).toBe(false);
    expect(chat.errorClave).toMatch(/sin tildes/);
    expect(almacen.guardarClaveAcceso).not.toHaveBeenCalled();
  });

  it("un 401 al cargar el historial pide el código; al guardarlo se carga el historial", async () => {
    const almacen = almacenCodigo();
    const vista = vistaSesion({ historial: [{ rol: "usuario", texto: "mensaje anterior", ts: "t1" }] });
    const respuestas: ResultadoApi<VistaSesion | null>[] = [{ ok: false, error: "Falta el código.", requiereClave: true }, { ok: true, datos: vista }];
    const { chat } = crearChat([], { ...almacen, obtenerSesion: async () => respuestas.shift() ?? { ok: true, datos: null } });
    await chat.cargarHistorial();
    expect(chat.necesitaClave).toBe(true);
    expect(chat.mensajes).toEqual([]);
    await chat.guardarClave("prueba-local-123");
    expect(chat.mensajes.map((m) => m.texto)).toEqual(["mensaje anterior"]);
  });

  it("un 429 se muestra como error claro con los segundos de espera y se puede volver a enviar", async () => {
    const limitado: ResultadoTurno = { ok: false, error: "Demasiadas solicitudes seguidas. Espera 42 s antes de enviar otro mensaje.", esperaSegundos: 42 };
    const { chat } = crearChat([limitado, ok(respuestaEnvio())]);
    await chat.enviar("hola");
    expect(chat.mensajes.at(-1)).toMatchObject({ rol: "error", texto: expect.stringMatching(/Espera 42 s/) });
    expect(chat.necesitaClave).toBe(false);
    expect(await chat.enviar("otra vez")).toBe(true);
    expect(chat.mensajes.at(-1)?.rol).toBe("asistente");
  });
});

describe("historial y nueva conversación", () => {
  it("cargarHistorial pinta las entradas guardadas y la confirmación pendiente", async () => {
    const vista = vistaSesion({
      historial: [
        { rol: "usuario", texto: "Procesa ec-corp-andina", ts: "t1" },
        { rol: "asistente", texto: "¿Simulo el envío?", ts: "t2", toolCalls: respuestaEcuador().toolCalls, needsConfirmation: true },
      ],
      confirmacionPendiente: { caso: "ec-corp-andina", accion: "simular_envio", resumen: "envío" },
    });
    const { chat } = crearChat([], { obtenerSesion: async () => ({ ok: true, datos: vista }) });
    await chat.cargarHistorial();
    expect(chat.mensajes.map((m) => m.rol)).toEqual(["usuario", "asistente"]);
    expect(chat.mensajes[1]?.toolCalls).toHaveLength(5);
    expect(chat.needsConfirmation).toBe(true);
  });

  it("si falla la carga del historial se muestra un error claro", async () => {
    const { chat } = crearChat([], { obtenerSesion: async () => ({ ok: false, error: "El servidor del agente tuvo un error (500)." }) });
    await chat.cargarHistorial();
    expect(chat.mensajes[0]).toMatchObject({ rol: "error", texto: expect.stringMatching(/No se pudo recuperar la conversación anterior/) });
  });

  it("nuevaConversacion limpia todo, cambia de sesión y descarta una respuesta tardía", async () => {
    let responder: (r: ResultadoTurno) => void = () => undefined;
    const { chat } = crearChat([], { enviarMensaje: () => new Promise<ResultadoTurno>((r) => (responder = r)) });
    const enCurso = chat.enviar("hola");
    chat.nuevaConversacion();
    responder(ok(respuestaEcuador()));
    await enCurso;
    expect(chat.sessionId).toBe("sesion-b");
    expect(chat.mensajes).toEqual([]);
    expect(chat.needsConfirmation).toBe(false);
    expect(chat.pensando).toBe(false);
  });
});

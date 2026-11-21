import { afterEach, describe, expect, it, vi } from "vitest";
import { cuerpoEnviado, instalarFetch, respuestaEcuador, respuestaJson, vistaSesion } from "../pruebas/datos";
import { enviarMensaje, obtenerSalud, obtenerSesion } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("enviarMensaje", () => {
  it("una respuesta 200 llega tipada y el cuerpo enviado lleva sessionId y message", async () => {
    const simulado = instalarFetch([() => respuestaJson(respuestaEcuador())]);
    const resultado = await enviarMensaje("s-1", "Procesa ec-corp-andina");
    expect(resultado).toEqual({ ok: true, datos: respuestaEcuador() });
    expect(cuerpoEnviado(simulado, 0)).toEqual({ sessionId: "s-1", message: "Procesa ec-corp-andina" });
  });

  it("un 400 del backend se convierte en un mensaje claro con su detalle", async () => {
    instalarFetch([() => respuestaJson({ error: { code: "CUERPO_INVALIDO", message: "Cuerpo inválido: message vacío" } }, 400)]);
    const resultado = await enviarMensaje("s-1", "x");
    expect(resultado).toEqual({ ok: false, error: "El servidor rechazó la solicitud: Cuerpo inválido: message vacío." });
  });

  it("un 500 se convierte en un mensaje claro sin detalles internos", async () => {
    instalarFetch([() => respuestaJson({ error: { code: "ERROR_INTERNO", message: "stack interno" } }, 500)]);
    const resultado = await enviarMensaje("s-1", "x");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toMatch(/servidor del agente tuvo un error \(500\)/);
      expect(resultado.error).not.toContain("stack interno");
    }
  });

  it("un error de red no lanza y explica que el API no responde", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    instalarFetch([() => Promise.reject(new TypeError("Failed to fetch"))]);
    const resultado = await enviarMensaje("s-1", "x");
    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/No se pudo conectar con el servidor del agente/) });
  });

  it("un timeout aborta la petición y devuelve un mensaje claro", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const colgado = (_url: string, init: RequestInit | undefined) =>
      new Promise<Response>((_resolver, rechazar) => init?.signal?.addEventListener("abort", () => rechazar(new DOMException("abortado", "AbortError"))));
    instalarFetch([colgado]);
    const resultado = await enviarMensaje("s-1", "x", { timeoutMs: 20 });
    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/tardó demasiado en responder/) });
  });

  it("un 200 con forma inesperada no se acepta", async () => {
    instalarFetch([() => respuestaJson({ reply: 42 })]);
    const resultado = await enviarMensaje("s-1", "x");
    expect(resultado).toEqual({ ok: false, error: expect.stringMatching(/formato esperado/) });
  });
});

describe("código de acceso y límite (401 / 429)", () => {
  it("envía x-clave-acceso cuando hay código y no lo envía cuando no hay", async () => {
    const simulado = instalarFetch([() => respuestaJson(respuestaEcuador()), () => respuestaJson(respuestaEcuador())]);
    await enviarMensaje("s-1", "hola", { claveAcceso: "prueba-local-123" });
    sessionStorage.clear();
    await enviarMensaje("s-1", "hola");
    const cabeceras = simulado.mock.calls.map(([, init]) => init?.headers as Record<string, string>);
    expect(cabeceras[0]).toMatchObject({ "x-clave-acceso": "prueba-local-123", "Content-Type": "application/json" });
    expect(cabeceras[1]).not.toHaveProperty("x-clave-acceso");
  });

  it("un 401 devuelve requiereClave con el mensaje del backend", async () => {
    instalarFetch([() => respuestaJson({ error: { code: "CLAVE_INVALIDA", message: "El código de acceso no es válido." } }, 401)]);
    expect(await enviarMensaje("s-1", "x")).toEqual({ ok: false, error: "El código de acceso no es válido.", requiereClave: true });
  });

  it("un 429 toma los segundos de Retry-After; sin header usa 60", async () => {
    const limitado = (cabeceras: Record<string, string>) => () =>
      new Response(JSON.stringify({ error: { code: "DEMASIADAS_SOLICITUDES", message: "x" } }), { status: 429, headers: cabeceras });
    instalarFetch([limitado({ "Retry-After": "17" }), limitado({})]);
    expect(await enviarMensaje("s-1", "x")).toEqual({ ok: false, error: expect.stringMatching(/Espera 17 s/), esperaSegundos: 17 });
    expect(await enviarMensaje("s-1", "x")).toMatchObject({ ok: false, esperaSegundos: 60 });
  });

  it("obtenerSesion con 401 también pide el código", async () => {
    instalarFetch([], { sesion: () => respuestaJson({ error: { code: "CLAVE_REQUERIDA", message: "Falta el código." } }, 401) });
    expect(await obtenerSesion("s-1")).toMatchObject({ ok: false, requiereClave: true });
  });
});

describe("obtenerSesion y obtenerSalud", () => {
  it("devuelve el historial de una sesión existente y codifica el id en la URL", async () => {
    const vista = vistaSesion({ historial: [{ rol: "usuario", texto: "hola", ts: "2026-11-20T10:00:00.000Z" }] });
    const simulado = instalarFetch([], { sesion: () => respuestaJson(vista) });
    expect(await obtenerSesion("s-1")).toEqual({ ok: true, datos: vista });
    expect(simulado).toHaveBeenCalledWith("/api/sessions/s-1", expect.objectContaining({ method: "GET" }));
  });

  it("una sesión inexistente (404) no es un error: devuelve null", async () => {
    instalarFetch([]);
    expect(await obtenerSesion("nueva")).toEqual({ ok: true, datos: null });
  });

  it("salud con 503 devuelve un mensaje claro", async () => {
    instalarFetch([], { salud: () => new Response("caído", { status: 503 }) });
    expect(await obtenerSalud()).toEqual({ ok: false, error: expect.stringMatching(/\(503\)/) });
  });
});

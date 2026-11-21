import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cargarSistema } from "../../src/agente/prompt";
import { leerConfig } from "../../src/config";
import { ErrorLLM } from "../../src/llm/adapter";
import { crearAdaptador } from "../../src/llm/index";
import { crearApp, ORIGEN_FRONT_DESARROLLO } from "../../src/server";
import { crearEntorno } from "../apoyo/entorno";
import type { PasoGuion } from "../apoyo/llm-guionizado";
import { crearLLMGuionizado, llamada, pedirHerramientas, responderTexto } from "../apoyo/llm-guionizado";

const CLAVE_FALSA = "sk-ant-prueba-no-real";
const entorno = crearEntorno("api");
afterAll(() => entorno.limpiar());

const sistema = await cargarSistema(entorno.raiz);
if (!sistema.ok) throw new Error(sistema.error);
const config = { maxIteraciones: 25, maxTokensSesion: 200000 };

function appCon(pasos: PasoGuion[]) {
  return crearApp({ adaptador: crearLLMGuionizado(pasos, { modelo: "claude-sonnet-5-5" }), config, directory: entorno.raiz, sistema: sistema.ok ? sistema.data : "" });
}

const postChat = (app: ReturnType<typeof appCon>, cuerpo: unknown) =>
  app.request("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });

describe("POST /api/chat", () => {
  it("devuelve reply, toolCalls y needsConfirmation", async () => {
    const app = appCon([pedirHerramientas([llamada("proveedor_leer_solicitud", { caso: "ec-corp-andina" })]), responderTexto("Leí la solicitud.")]);
    const res = await postChat(app, { sessionId: "api-feliz", message: "Lee ec-corp-andina" });
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(cuerpo).sort()).toEqual(["needsConfirmation", "reply", "toolCalls"]);
    expect(cuerpo).toMatchObject({ reply: "Leí la solicitud.", needsConfirmation: false, toolCalls: [{ nombre: "proveedor_leer_solicitud", ok: true }] });
  });

  it.each([
    ["JSON roto", "{no-es-json"],
    ["sin message", { sessionId: "api-x" }],
    ["sessionId con ruta", { sessionId: "../x", message: "hola" }],
    ["mensaje vacío", { sessionId: "api-x", message: "   " }],
  ])("%s → 400 con mensaje claro", async (_caso, cuerpo) => {
    const res = await postChat(appCon([]), cuerpo);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("CUERPO_INVALIDO");
    expect(json.error.message).not.toMatch(/at .*\.ts/);
  });

  it("un error del proveedor responde 200 con reply claro y la sesión sigue", async () => {
    const app = appCon([new ErrorLLM("limite", "El proveedor del modelo está limitando las solicitudes. Espera un momento e intenta de nuevo."), responderTexto("Aquí sigo.")]);
    const primero = await postChat(app, { sessionId: "api-error", message: "hola" });
    expect(primero.status).toBe(200);
    expect(((await primero.json()) as { reply: string }).reply).toMatch(/limitando las solicitudes/);
    const segundo = await postChat(app, { sessionId: "api-error", message: "¿sigues?" });
    expect(((await segundo.json()) as { reply: string }).reply).toBe("Aquí sigo.");
  });

  it("aplica CORS solo para el origen del front en desarrollo", async () => {
    const res = await appCon([]).request("/api/health", { headers: { Origin: ORIGEN_FRONT_DESARROLLO } });
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGEN_FRONT_DESARROLLO);
  });
});

describe("GET /api/sessions/:id", () => {
  it("devuelve el historial con los toolCalls de la sesión", async () => {
    const app = appCon([pedirHerramientas([llamada("proveedor_leer_solicitud", { caso: "ec-corp-andina" })]), responderTexto("Hecho.")]);
    await postChat(app, { sessionId: "api-historial", message: "Lee ec-corp-andina" });
    const res = await app.request("/api/sessions/api-historial");
    expect(res.status).toBe(200);
    const s = (await res.json()) as { id: string; historial: { rol: string; toolCalls?: { nombre: string }[] }[] };
    expect(s.id).toBe("api-historial");
    expect(s.historial.map((h) => h.rol)).toEqual(["usuario", "asistente"]);
    expect(s.historial[1]?.toolCalls?.[0]?.nombre).toBe("proveedor_leer_solicitud");
  });

  it("404 para una sesión inexistente y 400 para un id inválido", async () => {
    const app = appCon([]);
    expect((await app.request("/api/sessions/no-existe")).status).toBe(404);
    expect((await app.request("/api/sessions/con%20espacio")).status).toBe(400);
  });
});

describe("GET /api/health y la clave (NFR2)", () => {
  it("responde proveedor y modelo sin la clave aunque esté definida", async () => {
    const leida = leerConfig({ ANTHROPIC_API_KEY: CLAVE_FALSA, LLM_MODELO: "claude-haiku-5-5" });
    if (!leida.ok) throw new Error(leida.error);
    const app = crearApp({ adaptador: crearAdaptador(leida.data), config, directory: entorno.raiz, sistema: "S" });
    const res = await app.request("/api/health");
    const texto = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(texto)).toEqual({ ok: true, provider: "anthropic", model: "claude-haiku-5-5", requiereClave: false });
    expect(texto).not.toContain(CLAVE_FALSA);
  });

  it("sin clave, el chat responde un error claro y ni sesiones ni logs contienen la clave", async () => {
    const leida = leerConfig({});
    if (!leida.ok) throw new Error(leida.error);
    const app = crearApp({ adaptador: crearAdaptador(leida.data), config, directory: entorno.raiz, sistema: "S" });
    const res = await postChat(app, { sessionId: "api-sin-clave", message: "hola" });
    expect(((await res.json()) as { reply: string }).reply).toMatch(/Falta ANTHROPIC_API_KEY/);
    const archivos = readdirSync(entorno.rutaOut("sesiones")).map((a) => readFileSync(join(entorno.rutaOut("sesiones"), a), "utf8"));
    expect(archivos.join("\n")).not.toContain(CLAVE_FALSA);
    expect(readFileSync(entorno.rutaOut("log.jsonl"), "utf8")).not.toContain(CLAVE_FALSA);
  });

  it("una ruta desconocida responde 404 JSON", async () => {
    const res = await appCon([]).request("/api/otra");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NO_ENCONTRADO", message: "Ruta no encontrada" } });
  });
});

describe("código de acceso y límite por IP (despliegue)", () => {
  const CLAVE_ACCESO = "prueba-local-123";
  const CON_CLAVE = { "x-clave-acceso": CLAVE_ACCESO };

  function appProtegida(pasos: PasoGuion[] = [], extra: { limitePeticionesMinuto?: number; dirFront?: string } = {}) {
    const { limitePeticionesMinuto = 20, dirFront } = extra;
    return crearApp({
      adaptador: crearLLMGuionizado(pasos, { modelo: "claude-sonnet-5-5" }),
      config: { ...config, claveAcceso: CLAVE_ACCESO, limitePeticionesMinuto },
      directory: entorno.raiz,
      sistema: "S",
      ahora: () => 1_000_000,
      ...(dirFront === undefined ? {} : { dirFront }),
    });
  }

  const chat = (app: ReturnType<typeof appProtegida>, cabeceras: Record<string, string>, sessionId = "api-acceso") =>
    app.request("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", ...cabeceras }, body: JSON.stringify({ sessionId, message: "hola" }) });

  it("chat sin header → 401 claro; con el header correcto → 200", async () => {
    const app = appProtegida([responderTexto("Hola, ¿qué caso proceso?")]);
    const sin = await chat(app, {});
    expect(sin.status).toBe(401);
    expect(((await sin.json()) as { error: { code: string; message: string } }).error).toMatchObject({ code: "CLAVE_REQUERIDA", message: expect.stringMatching(/código de acceso/) });
    const con = await chat(app, CON_CLAVE);
    expect(con.status).toBe(200);
    expect(((await con.json()) as { reply: string }).reply).toBe("Hola, ¿qué caso proceso?");
  });

  it("sessions exige el código: sin header o con uno incorrecto → 401, con el correcto llega a la ruta", async () => {
    const app = appProtegida();
    expect((await app.request("/api/sessions/no-existe")).status).toBe(401);
    const mala = await app.request("/api/sessions/no-existe", { headers: { "x-clave-acceso": "otra-clave-999" } });
    expect(mala.status).toBe(401);
    expect(((await mala.json()) as { error: { code: string } }).error.code).toBe("CLAVE_INVALIDA");
    expect((await app.request("/api/sessions/no-existe", { headers: CON_CLAVE })).status).toBe(404);
  });

  it("health es público, informa requiereClave: true y nunca incluye la clave", async () => {
    const res = await appProtegida().request("/api/health");
    const texto = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(texto)).toEqual({ ok: true, provider: "guion", model: "claude-sonnet-5-5", requiereClave: true });
    expect(texto).not.toContain(CLAVE_ACCESO);
  });

  it("los estáticos del front se sirven sin header", async () => {
    const dirFront = join(entorno.raiz, "web", "dist-acceso");
    mkdirSync(dirFront, { recursive: true });
    writeFileSync(join(dirFront, "index.html"), "<!doctype html><title>front</title>", "utf8");
    const res = await appProtegida([], { dirFront }).request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("front");
  });

  it("21 peticiones seguidas de la misma IP → la 21 recibe 429 con Retry-After; otra IP sigue pasando", async () => {
    const pasos = Array.from({ length: 21 }, () => responderTexto("ok"));
    const app = appProtegida(pasos);
    const ip = { ...CON_CLAVE, "x-forwarded-for": "203.0.113.10" };
    for (let i = 0; i < 20; i += 1) expect((await chat(app, ip, `api-limite-${i}`)).status).toBe(200);
    const bloqueada = await chat(app, ip, "api-limite-20");
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers.get("retry-after")).toBe("60");
    expect(((await bloqueada.json()) as { error: { message: string } }).error.message).toMatch(/Demasiadas solicitudes seguidas\. Espera 60 s/);
    expect((await chat(app, { ...CON_CLAVE, "x-forwarded-for": "203.0.113.11" }, "api-limite-otra")).status).toBe(200);
  });

  it("el límite también frena intentos sin código (va antes del 401)", async () => {
    const app = appProtegida([], { limitePeticionesMinuto: 2 });
    const ip = { "x-forwarded-for": "203.0.113.20", "x-clave-acceso": "adivinanza-1" };
    expect((await chat(app, ip)).status).toBe(401);
    expect((await chat(app, ip)).status).toBe(401);
    expect((await chat(app, ip)).status).toBe(429);
  });

  it("sin CLAVE_ACCESO todo funciona como antes, sin header", async () => {
    const app = appCon([responderTexto("Sin código.")]);
    const res = await postChat(app, { sessionId: "api-sin-codigo", message: "hola" });
    expect(res.status).toBe(200);
    const salud = await app.request("/api/health");
    expect(await salud.json()).toMatchObject({ requiereClave: false });
  });

  it("CORS del front en desarrollo permite el header x-clave-acceso", async () => {
    const res = await appProtegida().request("/api/chat", {
      method: "OPTIONS",
      headers: { Origin: ORIGEN_FRONT_DESARROLLO, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-clave-acceso" },
    });
    expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("x-clave-acceso");
  });
});

describe("front estático desde web/dist (NFR6)", () => {
  const HTML = '<!doctype html><html lang="es"><body><div id="app"></div></body></html>';
  const dirFront = join(entorno.raiz, "web", "dist");
  mkdirSync(join(dirFront, "assets"), { recursive: true });
  writeFileSync(join(dirFront, "index.html"), HTML, "utf8");
  writeFileSync(join(dirFront, "assets", "app.js"), "console.log('front');", "utf8");
  const appConFront = (dir: string) => crearApp({ adaptador: crearLLMGuionizado([]), config, directory: entorno.raiz, sistema: "S", dirFront: dir });

  it("GET / devuelve el index.html y los assets con su tipo", async () => {
    const app = appConFront(dirFront);
    const raiz = await app.request("/");
    expect(raiz.status).toBe(200);
    expect(raiz.headers.get("content-type")).toMatch(/text\/html/);
    expect(await raiz.text()).toBe(HTML);
    const js = await app.request("/assets/app.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toMatch(/javascript/);
  });

  it("con el front servido, la API sigue respondiendo JSON y su 404 no cae en el index.html", async () => {
    const app = appConFront(dirFront);
    const salud = await app.request("/api/health");
    expect(salud.status).toBe(200);
    expect(await salud.json()).toMatchObject({ ok: true });
    const otra = await app.request("/api/otra");
    expect(otra.status).toBe(404);
    expect(await otra.json()).toEqual({ error: { code: "NO_ENCONTRADO", message: "Ruta no encontrada" } });
  });

  it("una ruta del front que no es archivo responde el index.html", async () => {
    const res = await appConFront(dirFront).request("/conversacion/123");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(HTML);
  });

  it("sin build del front, GET / responde 404 JSON y la API funciona", async () => {
    const app = appConFront(join(entorno.raiz, "web", "no-existe"));
    const raiz = await app.request("/");
    expect(raiz.status).toBe(404);
    expect(await raiz.json()).toEqual({ error: { code: "NO_ENCONTRADO", message: "Ruta no encontrada" } });
    expect((await app.request("/api/health")).status).toBe(200);
  });
});

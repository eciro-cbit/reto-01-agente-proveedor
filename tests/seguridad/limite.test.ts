import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { crearLimitador, IP_DESCONOCIDA, ipCliente, limitarPeticiones, VENTANA_MINUTO_MS } from "../../src/seguridad/limite";

/** Reloj manual: la prueba decide cuánto tiempo pasa. */
function reloj(inicio = 1_000_000) {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
}

describe("crearLimitador", () => {
  it("permite 20 peticiones y rechaza la 21 con los segundos de espera", () => {
    const r = reloj();
    const limitador = crearLimitador({ maximo: 20, ventanaMs: VENTANA_MINUTO_MS, ahora: r.ahora });
    for (let i = 0; i < 20; i += 1) {
      expect(limitador.registrar("1.1.1.1")).toEqual({ permitido: true });
      r.avanzar(1000);
    }
    // La primera petición fue hace 20 s: faltan 40 s para que salga de la ventana.
    expect(limitador.registrar("1.1.1.1")).toEqual({ permitido: false, esperaSegundos: 40 });
  });

  it("tras pasar la ventana vuelve a permitir", () => {
    const r = reloj();
    const limitador = crearLimitador({ maximo: 2, ventanaMs: VENTANA_MINUTO_MS, ahora: r.ahora });
    limitador.registrar("ip");
    limitador.registrar("ip");
    expect(limitador.registrar("ip").permitido).toBe(false);
    r.avanzar(VENTANA_MINUTO_MS);
    expect(limitador.registrar("ip").permitido).toBe(true);
  });

  it("IPs distintas no se afectan entre sí", () => {
    const limitador = crearLimitador({ maximo: 1, ventanaMs: VENTANA_MINUTO_MS, ahora: reloj().ahora });
    expect(limitador.registrar("a").permitido).toBe(true);
    expect(limitador.registrar("a").permitido).toBe(false);
    expect(limitador.registrar("b").permitido).toBe(true);
  });

  it("la memoria no crece sin límite: limpia IPs viejas y respeta el tope de claves", () => {
    const r = reloj();
    const limitador = crearLimitador({ maximo: 5, ventanaMs: VENTANA_MINUTO_MS, ahora: r.ahora, maxClaves: 3 });
    for (const ip of ["a", "b", "c", "d", "e"]) limitador.registrar(ip);
    expect(limitador.tamano).toBe(3);
    r.avanzar(VENTANA_MINUTO_MS);
    limitador.registrar("f");
    expect(limitador.tamano).toBe(1);
  });

  it("rechaza una configuración inválida con un error claro", () => {
    expect(() => crearLimitador({ maximo: 0, ventanaMs: VENTANA_MINUTO_MS })).toThrow(/entero mayor que 0/);
    expect(() => crearLimitador({ maximo: 1, ventanaMs: 0 })).toThrow(/ventana/);
  });
});

describe("ipCliente y limitarPeticiones", () => {
  const appIp = () => {
    const app = new Hono();
    app.get("/ip", (c) => c.text(ipCliente(c)));
    return app;
  };

  it("x-forwarded-for con varias IPs toma la primera", async () => {
    const res = await appIp().request("/ip", { headers: { "x-forwarded-for": " 203.0.113.7 , 10.0.0.1, 10.0.0.2" } });
    expect(await res.text()).toBe("203.0.113.7");
  });

  it("sin x-forwarded-for ni socket usa un valor fijo y recorta valores enormes", async () => {
    expect(await (await appIp().request("/ip")).text()).toBe(IP_DESCONOCIDA);
    const larga = await appIp().request("/ip", { headers: { "x-forwarded-for": "9".repeat(500) } });
    expect((await larga.text()).length).toBe(64);
  });

  it("el middleware responde 429 con Retry-After y mensaje en español", async () => {
    const app = new Hono();
    app.use("/chat", limitarPeticiones(crearLimitador({ maximo: 1, ventanaMs: VENTANA_MINUTO_MS, ahora: reloj().ahora })));
    app.get("/chat", (c) => c.text("ok"));
    const cabeceras = { "x-forwarded-for": "198.51.100.1" };
    expect((await app.request("/chat", { headers: cabeceras })).status).toBe(200);
    const segunda = await app.request("/chat", { headers: cabeceras });
    expect(segunda.status).toBe(429);
    expect(segunda.headers.get("retry-after")).toBe("60");
    expect(await segunda.json()).toEqual({
      error: { code: "DEMASIADAS_SOLICITUDES", message: "Demasiadas solicitudes seguidas. Espera 60 s e intenta de nuevo.", esperaSegundos: 60 },
    });
  });
});

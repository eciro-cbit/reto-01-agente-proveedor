import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { claveValida, exigirClave, HEADER_CLAVE_ACCESO, MENSAJE_CLAVE_FALTANTE, MENSAJE_CLAVE_INVALIDA } from "../../src/seguridad/acceso";

const CLAVE = "prueba-local-123";

function appProtegida(claveAcceso: string | undefined) {
  const app = new Hono();
  app.use("/protegida", exigirClave({ claveAcceso }));
  app.get("/protegida", (c) => c.text("dentro"));
  return app;
}

describe("claveValida", () => {
  it("acepta el código correcto", () => {
    expect(claveValida(CLAVE, CLAVE)).toBe(true);
  });

  it("rechaza un código incorrecto o ausente", () => {
    expect(claveValida("prueba-local-124", CLAVE)).toBe(false);
    expect(claveValida(undefined, CLAVE)).toBe(false);
    expect(claveValida("", CLAVE)).toBe(false);
  });

  it("longitudes distintas no lanzan (timingSafeEqual sobre resúmenes de largo fijo)", () => {
    expect(() => claveValida("x", CLAVE)).not.toThrow();
    expect(claveValida("x", CLAVE)).toBe(false);
    expect(claveValida(`${CLAVE}${"y".repeat(500)}`, CLAVE)).toBe(false);
  });
});

describe("exigirClave", () => {
  it("con el header correcto deja pasar", async () => {
    const res = await appProtegida(CLAVE).request("/protegida", { headers: { [HEADER_CLAVE_ACCESO]: CLAVE } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("dentro");
  });

  it("sin header responde 401 CLAVE_REQUERIDA y con uno incorrecto 401 CLAVE_INVALIDA, sin repetir la clave", async () => {
    const app = appProtegida(CLAVE);
    const sin = await app.request("/protegida");
    expect(sin.status).toBe(401);
    expect(await sin.json()).toEqual({ error: { code: "CLAVE_REQUERIDA", message: MENSAJE_CLAVE_FALTANTE } });
    const mala = await app.request("/protegida", { headers: { [HEADER_CLAVE_ACCESO]: "otra-clave-999" } });
    expect(mala.status).toBe(401);
    const texto = await mala.text();
    expect(JSON.parse(texto)).toEqual({ error: { code: "CLAVE_INVALIDA", message: MENSAJE_CLAVE_INVALIDA } });
    expect(texto).not.toContain(CLAVE);
  });

  it("sin CLAVE_ACCESO configurada no exige nada", async () => {
    const res = await appProtegida(undefined).request("/protegida");
    expect(res.status).toBe(200);
  });
});

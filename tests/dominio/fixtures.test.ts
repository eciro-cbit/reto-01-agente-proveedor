import { afterAll, describe, expect, it } from "vitest";
import { dentroDe, leerCaso, leerRepositorio, rutaEnReto } from "../../src/dominio/fixtures";
import { crearEntorno } from "../apoyo/entorno";

const entorno = crearEntorno("fixtures");
afterAll(() => entorno.limpiar());

describe("lectura de fixtures", () => {
  it("lee co-industrias-delta con su plantilla de celdas y soportes", async () => {
    const resultado = await leerCaso(entorno.ctx, "co-industrias-delta");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.data.solicitud.formato).toBe("xlsx");
    expect(resultado.data.plantilla.tipo).toBe("celdas");
    if (resultado.data.plantilla.tipo === "celdas") expect(resultado.data.plantilla.celdas).toHaveLength(17);
    expect(resultado.data.soportesExigidos).toEqual(["camara_comercio", "rut", "certificacion_bancaria", "estados_financieros"]);
  });

  it("lee el repositorio completo", async () => {
    const resultado = await leerRepositorio(entorno.ctx);
    expect(resultado.ok && resultado.data.soportes.length).toBe(6);
  });

  it("informa claramente un caso inexistente", async () => {
    expect(await leerCaso(entorno.ctx, "no-existe")).toEqual({ ok: false, error: "El caso 'no-existe' no existe" });
  });

  it("rechaza nombres de caso con separadores de ruta", async () => {
    const resultado = await leerCaso(entorno.ctx, "../maestro");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain("no es válido");
    expect(() => rutaEnReto(entorno.ctx, "..", "..", "package.json")).toThrow(/fuera de fixtures/);
  });

  it("informa una plantilla corrupta sin traza", async () => {
    entorno.escribirEnReto("casos/ec-corp-andina/plantilla-campos.json", "{ esto no es json");
    const resultado = await leerCaso(entorno.ctx, "ec-corp-andina");
    expect(resultado).toEqual({ ok: false, error: "La plantilla de 'ec-corp-andina' está corrupta: no es un JSON válido" });
  });

  it("informa una plantilla ausente para el formato", async () => {
    entorno.borrarEnReto("casos/hn-agroexport-sula/plantilla-celdas.json");
    const resultado = await leerCaso(entorno.ctx, "hn-agroexport-sula");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain("requiere plantilla-celdas.json");
  });

  it("dentroDe distingue rutas internas y externas", () => {
    expect(dentroDe("/a/b", "/a/b/c")).toBe(true);
    expect(dentroDe("/a/b", "/a/bc")).toBe(false);
    expect(dentroDe("/a/b", "/a")).toBe(false);
  });
});

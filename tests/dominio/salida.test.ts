import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { registrar } from "../../src/dominio/registro";
import { limpiarOut, rutaEnOut } from "../../src/dominio/salida";
import { crearEntorno } from "../apoyo/entorno";

const entorno = crearEntorno("salida");
afterAll(() => entorno.limpiar());

const leerLineas = (ruta: string): Array<Record<string, unknown>> =>
  readFileSync(ruta, "utf8")
    .trim()
    .split("\n")
    .map((linea) => JSON.parse(linea) as Record<string, unknown>);

describe("salida y registro", () => {
  it("limpiarOut borra solo out/ y deja fixtures intacto", async () => {
    mkdirSync(entorno.rutaOut("caso-x"), { recursive: true });
    writeFileSync(entorno.rutaOut("caso-x/archivo.txt"), "x");
    await limpiarOut(entorno.ctx);
    expect(existsSync(entorno.rutaOut(""))).toBe(false);
    expect(existsSync(entorno.rutaReto("repositorio/maestro.json"))).toBe(true);
  });

  it("limpiarOut no falla si out/ no existe", async () => {
    await expect(limpiarOut(entorno.ctx)).resolves.toBeUndefined();
  });

  it("rechaza rutas que escapan de out/", () => {
    expect(() => rutaEnOut(entorno.ctx, "..", "fixtures")).toThrow(/fuera de out/);
  });

  it("registra la llamada en out/log.jsonl y out/<caso>/log.jsonl con las 4 claves", async () => {
    const entrada = { ts: "2026-09-03T00:00:00.000Z", herramienta: "proveedor_leer_solicitud", ok: true, resumen: "17 campos" };
    await registrar(entorno.ctx, "co-industrias-delta", entrada);
    const global = leerLineas(join(entorno.raiz, "out", "log.jsonl"));
    const delCaso = leerLineas(join(entorno.raiz, "out", "co-industrias-delta", "log.jsonl"));
    expect(global).toEqual([entrada]);
    expect(delCaso).toEqual([entrada]);
    expect(Object.keys(delCaso[0] ?? {}).sort()).toEqual(["herramienta", "ok", "resumen", "ts"]);
  });

  it("no crea log por caso para un caso inválido o inexistente", async () => {
    await registrar(entorno.ctx, "../escape", { ts: "t", herramienta: "h", ok: false, resumen: "r" });
    await registrar(entorno.ctx, "no-existe", { ts: "t", herramienta: "h", ok: false, resumen: "r" });
    expect(existsSync(entorno.rutaOut("no-existe"))).toBe(false);
    expect(leerLineas(entorno.rutaOut("log.jsonl")).length).toBeGreaterThanOrEqual(2);
  });
});

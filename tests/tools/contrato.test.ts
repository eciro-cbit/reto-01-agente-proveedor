import { readFileSync } from "node:fs";
import { z } from "zod";
import { afterAll, describe, expect, it } from "vitest";
import { ejecutarHerramienta, herramientas, leerResultado, type RegistroHerramientas } from "../../src/tools/runner";
import type { Herramienta } from "../../src/tools/tipos";
import { crearEntorno } from "../apoyo/entorno";

const entorno = crearEntorno("contrato");
afterAll(() => entorno.limpiar());

const lineasLog = (ruta: string): Array<Record<string, unknown>> =>
  readFileSync(ruta, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe("contrato de herramientas proveedor_*", () => {
  it("el registro expone exactamente los 5 nombres proveedor_<export>", () => {
    expect(Object.keys(herramientas).sort()).toEqual([
      "proveedor_armar_paquete",
      "proveedor_generar_formulario",
      "proveedor_leer_solicitud",
      "proveedor_mapear_campos",
      "proveedor_simular_envio",
    ]);
  });

  it("cada herramienta tiene descripción de una frase y todo argumento tiene .describe()", () => {
    for (const [nombre, herramienta] of Object.entries(herramientas)) {
      expect(herramienta.description.length, nombre).toBeGreaterThan(20);
      expect(herramienta.description.trim().endsWith("."), nombre).toBe(true);
      for (const [arg, esquema] of Object.entries(herramienta.args)) {
        expect(esquema.description, `${nombre}.${arg}`).toBeTruthy();
      }
    }
  });

  it("args inválidos devuelven { ok: false } sin ejecutar la herramienta", async () => {
    let ejecutada = false;
    const espia: Herramienta = {
      description: "Herramienta de prueba que registra si se ejecutó.",
      args: { caso: z.string().describe("caso") },
      execute: async () => {
        ejecutada = true;
        return JSON.stringify({ ok: true, data: {} });
      },
    };
    const salida = await ejecutarHerramienta("prueba_espia", { caso: 42 }, entorno.ctx, { prueba_espia: espia });
    const resultado = leerResultado(salida);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/^Argumentos inválidos para prueba_espia: caso: /);
    expect(ejecutada).toBe(false);
  });

  it("una herramienta que lanza por dentro devuelve { ok: false } y no lanza", async () => {
    const rota: RegistroHerramientas = {
      prueba_rota: {
        description: "Herramienta de prueba que siempre lanza.",
        args: {},
        execute: async () => {
          throw new Error("disco lleno");
        },
      },
    };
    const salida = await ejecutarHerramienta("prueba_rota", {}, entorno.ctx, rota);
    expect(JSON.parse(salida)).toEqual({ ok: false, error: "La herramienta prueba_rota falló: disco lleno" });
  });

  it("una herramienta desconocida devuelve un error claro", async () => {
    const salida = await ejecutarHerramienta("proveedor_borrar_todo", {}, entorno.ctx);
    expect(JSON.parse(salida)).toEqual({ ok: false, error: "La herramienta 'proveedor_borrar_todo' no existe" });
  });

  it("cada llamada deja una línea en out/log.jsonl y en out/<caso>/log.jsonl", async () => {
    await ejecutarHerramienta("proveedor_leer_solicitud", { caso: "co-industrias-delta" }, entorno.ctx);
    await ejecutarHerramienta("proveedor_simular_envio", { caso: "co-industrias-delta", confirmado: false }, entorno.ctx);
    const delCaso = lineasLog(entorno.rutaOut("co-industrias-delta/log.jsonl"));
    expect(delCaso.map((l) => [l["herramienta"], l["ok"]])).toEqual([
      ["proveedor_leer_solicitud", true],
      ["proveedor_simular_envio", false],
    ]);
    expect(delCaso[0]?.["resumen"]).toContain("campos: 17");
    expect(delCaso[1]?.["resumen"]).toBe("requiere confirmación explícita");
    const global = lineasLog(entorno.rutaOut("log.jsonl"));
    expect(global.filter((l) => String(l["herramienta"]).startsWith("proveedor_leer")).length).toBeGreaterThanOrEqual(1);
    for (const linea of global) expect(Object.keys(linea).sort()).toEqual(["herramienta", "ok", "resumen", "ts"]);
  });
});

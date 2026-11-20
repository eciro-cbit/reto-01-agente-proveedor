import { existsSync, readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { AlmacenSesiones, validarSessionId } from "../../src/agente/sesiones";
import { crearEntorno } from "../apoyo/entorno";

const CLAVE_FALSA = "sk-ant-prueba-no-real";
const entorno = crearEntorno("sesiones");
afterAll(() => entorno.limpiar());

describe("AlmacenSesiones", () => {
  it("crea, guarda y recupera una sesión desde out/sesiones aunque se reinicie el almacén", async () => {
    const almacen = new AlmacenSesiones(entorno.raiz);
    const creada = await almacen.obtenerOCrear("demo-1");
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;
    creada.data.historial.push({ rol: "usuario", texto: "hola", ts: "2026-11-20T00:00:00.000Z" });
    const guardada = await almacen.guardar(creada.data);
    expect(guardada.ok).toBe(true);
    expect(existsSync(entorno.rutaOut("sesiones/demo-1.json"))).toBe(true);

    const otro = new AlmacenSesiones(entorno.raiz);
    const leida = await otro.obtener("demo-1");
    expect(leida.ok && leida.data?.historial).toEqual([{ rol: "usuario", texto: "hola", ts: "2026-11-20T00:00:00.000Z" }]);
  });

  it("una sesión inexistente se devuelve como undefined, no como error", async () => {
    const r = await new AlmacenSesiones(entorno.raiz).obtener("no-existe");
    expect(r).toEqual({ ok: true, data: undefined });
  });

  it.each(["../escape", "con espacio", "", "a".repeat(65)])("rechaza el sessionId inválido '%s' sin tocar disco", async (id) => {
    const r = await new AlmacenSesiones(entorno.raiz).obtenerOCrear(id);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/sessionId inválido/);
  });

  it("el archivo de sesión no contiene la clave del proveedor", async () => {
    process.env["ANTHROPIC_API_KEY"] = CLAVE_FALSA;
    try {
      const almacen = new AlmacenSesiones(entorno.raiz);
      const s = await almacen.obtenerOCrear("sin-clave");
      if (!s.ok) throw new Error(s.error);
      s.data.historial.push({ rol: "asistente", texto: "listo", ts: "2026-11-20T00:00:00.000Z" });
      await almacen.guardar(s.data);
      expect(readFileSync(entorno.rutaOut("sesiones/sin-clave.json"), "utf8")).not.toContain(CLAVE_FALSA);
    } finally {
      delete process.env["ANTHROPIC_API_KEY"];
    }
  });
});

describe("validarSessionId", () => {
  it("acepta letras, números, guiones y guion bajo", () => {
    expect(validarSessionId("Sesion_01-a")).toEqual({ ok: true, data: "Sesion_01-a" });
  });
});

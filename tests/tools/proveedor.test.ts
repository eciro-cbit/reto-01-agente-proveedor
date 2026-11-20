import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { armar_paquete, generar_formulario, leer_solicitud, mapear_campos, simular_envio } from "../../src/tools/proveedor";
import { ejecutarHerramienta } from "../../src/tools/runner";
import { crearEntorno } from "../apoyo/entorno";

const entorno = crearEntorno("proveedor");
const ctx = entorno.ctx;
afterAll(() => entorno.limpiar());
beforeEach(() => {
  vi.stubEnv("FECHA_REFERENCIA", "2026-09-03");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

interface Respuesta {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}
const json = (salida: string): Respuesta => JSON.parse(salida) as Respuesta;

describe("proveedor_leer_solicitud", () => {
  it.each([
    { caso: "co-industrias-delta", campos: 17, soportes: 4, formato: "xlsx", pais: "CO" },
    { caso: "ec-corp-andina", campos: 15, soportes: 5, formato: "pdf", pais: "EC" },
    { caso: "hn-agroexport-sula", campos: 11, soportes: 3, formato: "xlsx", pais: "HN" },
    { caso: "pa-logistica-istmo", campos: 9, soportes: 2, formato: "portal", pais: "PA" },
  ])("$caso: $campos campos y $soportes soportes", async ({ caso, campos, soportes, formato, pais }) => {
    const r = json(await leer_solicitud.execute({ caso }, ctx));
    expect(r.ok).toBe(true);
    expect(r.data?.["campos"]).toHaveLength(campos);
    expect(r.data?.["soportes"]).toHaveLength(soportes);
    expect(r.data).toMatchObject({ formato, pais, campos_ambiguos: [] });
  });

  it("reporta etiquetas ambiguas con la propuesta del país", async () => {
    const roto = crearEntorno("proveedor-ambigua");
    roto.escribirEnReto("casos/pa-logistica-istmo/plantilla-campos.json", JSON.stringify([{ etiqueta: "Identificación tributaria", obligatorio: true }]));
    const r = json(await leer_solicitud.execute({ caso: "pa-logistica-istmo" }, roto.ctx));
    roto.limpiar();
    expect(r.data?.["campos_ambiguos"]).toEqual([{ etiqueta: "Identificación tributaria", estado: "requiere_confirmacion", propuesta: "RUC" }]);
  });

  it("caso inexistente o con ruta devuelve { ok: false } con mensaje claro", async () => {
    expect(json(await leer_solicitud.execute({ caso: "no-existe" }, ctx))).toEqual({ ok: false, error: "El caso 'no-existe' no existe" });
    const escape = json(await leer_solicitud.execute({ caso: "../repositorio" }, ctx));
    expect(escape.ok).toBe(false);
    expect(escape.error).not.toMatch(/at .*\.ts/);
  });
});

describe("proveedor_mapear_campos", () => {
  it("clasifica los campos de hn-agroexport-sula", async () => {
    const leidos = json(await leer_solicitud.execute({ caso: "hn-agroexport-sula" }, ctx));
    const r = json(await mapear_campos.execute({ caso: "hn-agroexport-sula", campos: leidos.data?.["campos"] as string[] }, ctx));
    expect([r.data?.["llenos"], r.data?.["requiere_confirmacion"], r.data?.["faltantes"]].map((l) => (l as unknown[]).length)).toEqual([9, 1, 1]);
  });

  it("una lista vacía de campos es rechazada por el runner", async () => {
    const r = json(await ejecutarHerramienta("proveedor_mapear_campos", { caso: "hn-agroexport-sula", campos: [] }, ctx));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Argumentos inválidos");
  });
});

describe("proveedor_generar_formulario", () => {
  it("CA2: ignora un valor falso enviado en el mapeo y escribe el del maestro", async () => {
    const mapeoConValorFalso = [{ etiqueta: "NIT", ruta: "nit", valor: "999999999" }];
    const salida = await ejecutarHerramienta("proveedor_generar_formulario", { caso: "co-industrias-delta", mapeo: mapeoConValorFalso }, ctx);
    expect(json(salida)).toMatchObject({ ok: true, data: { ruta: "out/co-industrias-delta/formulario.xlsx", formato: "xlsx" } });
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.readFile(entorno.rutaOut("co-industrias-delta/formulario.xlsx"));
    expect(libro.getWorksheet("Datos Proveedor")?.getCell("C4").value).toBe("900123456");
  });

  it("una ruta inexistente en el mapeo deja el campo vacío y lo reporta", async () => {
    const r = json(await generar_formulario.execute({ caso: "co-industrias-delta", mapeo: [{ etiqueta: "NIT", ruta: "no.existe" }] }, ctx));
    expect(r.data?.["rutas_sin_valor"]).toEqual(["no.existe"]);
    expect(r.data?.["faltantes"]).toEqual(["NIT"]);
  });

  it("portal devuelve ok con soportado: false y aviso", async () => {
    const r = json(await generar_formulario.execute({ caso: "pa-logistica-istmo", mapeo: [] }, ctx));
    expect(r).toMatchObject({ ok: true, data: { ruta: "out/pa-logistica-istmo/valores-portal.md", formato: "portal", soportado: false, aviso: "formato no soportado" } });
  });

  it("FECHA_REFERENCIA inválida devuelve un error claro", async () => {
    vi.stubEnv("FECHA_REFERENCIA", "03-09-2026");
    const r = json(await generar_formulario.execute({ caso: "ec-corp-andina", mapeo: [] }, ctx));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("FECHA_REFERENCIA='03-09-2026' no es válida");
  });
});

describe("proveedor_armar_paquete y proveedor_simular_envio", () => {
  it("simular_envio sin paquete devuelve error y no escribe", async () => {
    const r = json(await simular_envio.execute({ caso: "ec-corp-andina", confirmado: true }, ctx));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no existe");
    expect(existsSync(entorno.rutaOut("ec-corp-andina/ENVIO-SIMULADO.md"))).toBe(false);
  });

  it("confirmado: false no escribe; confirmado: true escribe ENVIO-SIMULADO.md", async () => {
    const paquete = json(await armar_paquete.execute({ caso: "pa-logistica-istmo" }, ctx));
    expect(paquete).toMatchObject({ ok: true, data: { ruta: "out/pa-logistica-istmo/paquete", listo_para_firma: true } });
    const sinConfirmar = json(await simular_envio.execute({ caso: "pa-logistica-istmo", confirmado: false }, ctx));
    expect(sinConfirmar).toEqual({ ok: false, error: "requiere confirmación explícita" });
    expect(existsSync(entorno.rutaOut("pa-logistica-istmo/ENVIO-SIMULADO.md"))).toBe(false);
    const confirmado = json(await simular_envio.execute({ caso: "pa-logistica-istmo", confirmado: true }, ctx));
    expect(confirmado).toEqual({ ok: true, data: { ruta: "out/pa-logistica-istmo/ENVIO-SIMULADO.md", listo_para_firma: true } });
    expect(existsSync(entorno.rutaOut("pa-logistica-istmo/ENVIO-SIMULADO.md"))).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { afterAll, describe, expect, it } from "vitest";
import { ejecutarDemo, formatearResumen, type ResumenDemo } from "../demo";
import { crearEntorno } from "./apoyo/entorno";

const entorno = crearEntorno("demo");
afterAll(() => entorno.limpiar());
const ENV = { FECHA_REFERENCIA: "2026-09-03" };

async function celdas(caso: string): Promise<string[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(entorno.rutaOut(`${caso}/formulario.xlsx`));
  const valores: string[] = [];
  libro.eachSheet((hoja) => hoja.eachRow((fila, n) => fila.eachCell((celda, c) => valores.push(`${hoja.name}!${n}:${c}=${String(celda.value)}`))));
  return valores;
}

/** Contenido observable de una corrida: resumen + celdas xlsx + archivos de texto del paquete. */
async function corrida(): Promise<{ resumen: ResumenDemo; contenido: string[] }> {
  const resultado = await ejecutarDemo({ directory: entorno.raiz, env: ENV });
  if (!resultado.ok) throw new Error(resultado.error);
  const textos = ["ec-corp-andina/paquete/checklist.md", "pa-logistica-istmo/valores-portal.md", "hn-agroexport-sula/ENVIO-SIMULADO.md"].map((r) =>
    readFileSync(entorno.rutaOut(r), "utf8"),
  );
  const pdf = readFileSync(entorno.rutaOut("ec-corp-andina/formulario.pdf")).toString("base64");
  return { resumen: resultado.data, contenido: [...(await celdas("co-industrias-delta")), ...(await celdas("hn-agroexport-sula")), ...textos, pdf] };
}

describe("demo.ts", () => {
  it("reproduce el oráculo de la tabla 2.4 con FECHA_REFERENCIA=2026-09-03", async () => {
    const { resumen } = await corrida();
    expect(resumen.fecha_referencia).toBe("2026-09-03");
    expect(resumen.casos.map((c) => [c.caso, c.llenos, c.por_confirmar, c.faltantes, c.listo_para_firma])).toEqual([
      ["co-industrias-delta", 17, 0, 0, true],
      ["ec-corp-andina", 13, 1, 1, false],
      ["hn-agroexport-sula", 9, 1, 1, false],
      ["pa-logistica-istmo", 8, 1, 0, true],
    ]);
    expect(resumen.casos.every((c) => c.envio_sin_confirmar === "rechazado (requiere confirmación explícita)")).toBe(true);
    expect(formatearResumen(resumen)).toContain("Fecha de referencia: 2026-09-03 (FECHA_REFERENCIA)");
  });

  it("es determinista: dos ejecuciones dan el mismo resumen y el mismo contenido", async () => {
    const primera = await corrida();
    const segunda = await corrida();
    expect(segunda.resumen).toEqual(primera.resumen);
    expect(segunda.contenido).toEqual(primera.contenido);
    expect(segunda.contenido.length).toBeGreaterThan(30);
  });

  it("un caso inexistente en la lista no impide los demás", async () => {
    const resultado = await ejecutarDemo({ directory: entorno.raiz, env: ENV, casos: ["no-existe", "pa-logistica-istmo"] });
    if (!resultado.ok) throw new Error(resultado.error);
    const [malo, bueno] = resultado.data.casos;
    expect(malo).toEqual({ caso: "no-existe", ok: false, error: "proveedor_leer_solicitud: El caso 'no-existe' no existe" });
    expect(bueno).toMatchObject({ caso: "pa-logistica-istmo", ok: true, aviso: "formato no soportado" });
    expect(formatearResumen(resultado.data)).toContain("Casos: 2 (1 correctos, 1 con error)");
  });

  it("FECHA_REFERENCIA inválida detiene la demo con un error claro", async () => {
    const resultado = await ejecutarDemo({ directory: entorno.raiz, env: { FECHA_REFERENCIA: "ayer" } });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain("FECHA_REFERENCIA='ayer' no es válida");
  });

  it("con la fecha de hoy (2026-11-20) ningún caso queda listo para firma", async () => {
    const resultado = await ejecutarDemo({ directory: entorno.raiz, env: { FECHA_REFERENCIA: "2026-11-20" } });
    if (!resultado.ok) throw new Error(resultado.error);
    expect(resultado.data.casos.map((c) => c.listo_para_firma)).toEqual([false, false, false, false]);
    expect(resultado.data.casos[0]?.soportes_vencidos).toEqual(["camara_comercio"]);
  });
});

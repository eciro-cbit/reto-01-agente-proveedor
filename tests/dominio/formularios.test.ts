import { readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { afterAll, describe, expect, it } from "vitest";
import type { CeldaPlantilla } from "../../src/dominio/esquemas";
import { generarFormulario } from "../../src/dominio/formularios/generar";
import { construirLineasPdf, TEXTO_FALTANTE } from "../../src/dominio/formularios/pdf";
import { urlDelPortal } from "../../src/dominio/formularios/portal";
import { crearEntorno, RAIZ_PROYECTO } from "../apoyo/entorno";

const entorno = crearEntorno("formularios");
afterAll(() => entorno.limpiar());
const FECHA = "2026-09-03";

const plantillaCeldas = (caso: string): CeldaPlantilla[] =>
  JSON.parse(readFileSync(join(RAIZ_PROYECTO, "fixtures/reto-01/casos", caso, "plantilla-celdas.json"), "utf8")) as CeldaPlantilla[];

async function leerLibro(caso: string): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(entorno.rutaOut(`${caso}/formulario.xlsx`));
  return libro;
}

describe("formulario xlsx (P0)", () => {
  it("co-industrias-delta: 17 parejas etiqueta/valor en hoja y celda exactas, 2 hojas", async () => {
    const resultado = await generarFormulario(entorno.ctx, { caso: "co-industrias-delta", fechaReferencia: FECHA });
    expect(resultado).toMatchObject({ ok: true, data: { ruta: "out/co-industrias-delta/formulario.xlsx", formato: "xlsx" } });
    const libro = await leerLibro("co-industrias-delta");
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Datos Proveedor", "Datos Bancarios"]);
    for (const celda of plantillaCeldas("co-industrias-delta")) {
      const hoja = libro.getWorksheet(celda.hoja);
      expect(hoja?.getCell(celda.celda_etiqueta).value).toBe(celda.etiqueta);
      expect(hoja?.getCell(celda.celda_valor).value).not.toBeNull();
    }
    expect(libro.getWorksheet("Datos Proveedor")?.getCell("C4").value).toBe("900123456");
    expect(libro.getWorksheet("Datos Bancarios")?.getCell("C6").value).toBe("Periferia IT Group S.A.S.");
  });

  it("hn-agroexport-sula: faltante queda vacío y el número sigue siendo número", async () => {
    const resultado = await generarFormulario(entorno.ctx, { caso: "hn-agroexport-sula", fechaReferencia: FECHA });
    expect(resultado.ok && resultado.data.faltantes).toEqual(["Referencias comerciales"]);
    expect(resultado.ok && resultado.data.pendientes).toEqual(["RTN"]);
    const hoja = (await leerLibro("hn-agroexport-sula")).getWorksheet("Registro");
    expect(hoja?.getCell("A12").value).toBe("Referencias comerciales");
    expect(hoja?.getCell("B12").value).toBeNull();
    expect(hoja?.getCell("B10").value).toBe(480);
    expect(hoja?.getCell("B11").value).toBe(98000000000);
  });

  it("falla con mensaje claro si la plantilla está corrupta", async () => {
    const roto = crearEntorno("formularios-roto");
    roto.escribirEnReto("casos/co-industrias-delta/plantilla-celdas.json", '[{"hoja":"X"}]');
    const resultado = await generarFormulario(roto.ctx, { caso: "co-industrias-delta", fechaReferencia: FECHA });
    roto.limpiar();
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatch(/^La plantilla de 'co-industrias-delta' está corrupta: /);
  });
});

describe("formulario pdf (P1)", () => {
  it("ec-corp-andina: líneas en el orden de la plantilla, faltante marcado, y el PDF carga", async () => {
    const resultado = await generarFormulario(entorno.ctx, { caso: "ec-corp-andina", fechaReferencia: FECHA });
    expect(resultado).toMatchObject({ ok: true, data: { ruta: "out/ec-corp-andina/formulario.pdf", formato: "pdf" } });
    const documento = await PDFDocument.load(readFileSync(entorno.rutaOut("ec-corp-andina/formulario.pdf")));
    expect(documento.getPageCount()).toBe(1);
    expect(documento.getCreationDate()?.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(documento.getTitle()).toContain("Corporación Andina");
  });

  it("construirLineasPdf respeta orden, obligatorios, faltantes y pendientes", () => {
    const lineas = construirLineasPdf({
      cliente: "Cliente",
      fechaReferencia: FECHA,
      campos: [
        { etiqueta: "Nombre de la empresa", obligatorio: true, estado: "lleno", valor: "Periferia IT Group S.A.S." },
        { etiqueta: "RUC", obligatorio: true, estado: "requiere_confirmacion", valor: "900123456" },
        { etiqueta: "Número de contribuyente especial", obligatorio: false, estado: "faltante" },
      ],
    });
    const campos = lineas.slice(4, 7);
    expect(campos).toEqual([
      "Nombre de la empresa (*): Periferia IT Group S.A.S.",
      "RUC (*): 900123456 [pendiente de confirmación]",
      `Número de contribuyente especial: ${TEXTO_FALTANTE}`,
    ]);
  });
});

describe("valores para portal (P2)", () => {
  it("pa-logistica-istmo: tabla con 9 filas, aviso de no soportado y sin credenciales", async () => {
    const resultado = await generarFormulario(entorno.ctx, { caso: "pa-logistica-istmo", fechaReferencia: FECHA });
    expect(resultado).toMatchObject({ ok: true, data: { formato: "portal", soportado: false, aviso: "formato no soportado" } });
    const md = readFileSync(entorno.rutaOut("pa-logistica-istmo/valores-portal.md"), "utf8");
    const filas = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Etiqueta"));
    expect(filas).toHaveLength(9);
    expect(md).toContain("https://vendorhub.logisticaistmo-ficticia.pa");
    expect(md).toMatch(/\| RUC \| 900123456 \| requiere_confirmacion \|/);
    expect(md.toLowerCase()).not.toMatch(/contraseña|password|usuario:/);
  });

  it("urlDelPortal quita la puntuación final y tolera cuerpos sin URL", () => {
    expect(urlDelPortal("Entre a https://portal.ejemplo.pa. Gracias")).toBe("https://portal.ejemplo.pa");
    expect(urlDelPortal("sin enlace")).toBeUndefined();
  });
});

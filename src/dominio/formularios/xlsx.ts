import ExcelJS from "exceljs";
import type { CeldaPlantilla } from "../esquemas";
import { fechaMetadatos, type CampoFormulario } from "./comun";

const AUTOR = "Agente Registro como Proveedor";

/**
 * P0: escribe un libro nuevo con las hojas de la plantilla. Cada etiqueta va en `celda_etiqueta`
 * y su valor nativo (un número sigue siendo número) en `celda_valor`; un faltante deja la celda vacía.
 */
export async function escribirXlsx(
  ruta: string,
  celdas: readonly CeldaPlantilla[],
  campos: readonly CampoFormulario[],
  fechaReferencia: string,
): Promise<void> {
  const libro = new ExcelJS.Workbook();
  const fecha = fechaMetadatos(fechaReferencia);
  libro.creator = AUTOR;
  libro.lastModifiedBy = AUTOR;
  libro.created = fecha;
  libro.modified = fecha;
  celdas.forEach((celda, i) => {
    const hoja = libro.getWorksheet(celda.hoja) ?? libro.addWorksheet(celda.hoja);
    hoja.getCell(celda.celda_etiqueta).value = celda.etiqueta;
    const valor = campos[i]?.valor;
    if (valor !== undefined) hoja.getCell(celda.celda_valor).value = valor;
  });
  await libro.xlsx.writeFile(ruta);
}

import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { fechaMetadatos, valorComoTexto, type CampoFormulario } from "./comun";

export const TEXTO_FALTANTE = "(faltante)";
export const MARCA_PENDIENTE = "[pendiente de confirmación]";

export interface DatosPdf {
  cliente: string;
  fechaReferencia: string;
  campos: readonly CampoFormulario[];
}

const TAMANO = 10;
const INTERLINEA = 14;
const MARGEN = 50;
const ANCHO_PAGINA = 595.28;
const ALTO_PAGINA = 841.89;
const AUTOR = "Agente Registro como Proveedor";

/** Línea de un campo: `etiqueta (*): valor`, con "(faltante)" y marca de pendiente. */
export function lineaDeCampo(campo: CampoFormulario): string {
  const marca = campo.obligatorio ? " (*)" : "";
  const valor = valorComoTexto(campo.valor) ?? TEXTO_FALTANTE;
  const pendiente = campo.estado === "requiere_confirmacion" ? ` ${MARCA_PENDIENTE}` : "";
  return `${campo.etiqueta}${marca}: ${valor}${pendiente}`;
}

/** Contenido textual del PDF en orden (función pura, verificable sin abrir el PDF). */
export function construirLineasPdf(datos: DatosPdf): string[] {
  return [
    "Formulario de registro como proveedor",
    `Cliente: ${datos.cliente}`,
    `Fecha de referencia: ${datos.fechaReferencia}`,
    "",
    ...datos.campos.map(lineaDeCampo),
    "",
    "(*) Campo obligatorio.",
  ];
}

/** Parte una línea en renglones que caben en el ancho útil. */
function partirLinea(linea: string, fuente: PDFFont, ancho: number): string[] {
  const renglones: string[] = [];
  let actual = "";
  for (const palabra of linea.split(" ")) {
    const candidato = actual === "" ? palabra : `${actual} ${palabra}`;
    if (actual !== "" && fuente.widthOfTextAtSize(candidato, TAMANO) > ancho) {
      renglones.push(actual);
      actual = palabra;
    } else {
      actual = candidato;
    }
  }
  renglones.push(actual);
  return renglones;
}

/** P1: genera un PDF (no AcroForm) con fuentes estándar y metadatos de fecha fijos. */
export async function escribirPdf(ruta: string, datos: DatosPdf): Promise<void> {
  const documento = await PDFDocument.create();
  const fecha = fechaMetadatos(datos.fechaReferencia);
  documento.setTitle(`Formulario de registro como proveedor - ${datos.cliente}`);
  documento.setAuthor(AUTOR);
  documento.setCreator(AUTOR);
  documento.setProducer(AUTOR);
  documento.setCreationDate(fecha);
  documento.setModificationDate(fecha);
  const fuente = await documento.embedFont(StandardFonts.Helvetica);
  const ancho = ANCHO_PAGINA - 2 * MARGEN;
  let pagina: PDFPage = documento.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  let y = ALTO_PAGINA - MARGEN;
  for (const linea of construirLineasPdf(datos)) {
    for (const renglon of partirLinea(linea, fuente, ancho)) {
      if (y < MARGEN) {
        pagina = documento.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
        y = ALTO_PAGINA - MARGEN;
      }
      pagina.drawText(renglon, { x: MARGEN, y, size: TAMANO, font: fuente });
      y -= INTERLINEA;
    }
  }
  await writeFile(ruta, await documento.save());
}

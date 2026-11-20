import { writeFile } from "node:fs/promises";
import { valorComoTexto, type CampoFormulario } from "./comun";
import { TEXTO_FALTANTE } from "./pdf";

export const AVISO_PORTAL = "formato no soportado";

export interface DatosPortal {
  cliente: string;
  cuerpoSolicitud: string;
  fechaReferencia: string;
  campos: readonly CampoFormulario[];
}

/** Primera URL http(s) del cuerpo del correo, sin puntuación final. */
export function urlDelPortal(cuerpo: string): string | undefined {
  const encontrada = /https?:\/\/[^\s<>"')]+/.exec(cuerpo)?.[0];
  return encontrada?.replace(/[.,;:]+$/, "");
}

const celdaMd = (texto: string): string => texto.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** P2: tabla etiqueta / valor / estado lista para copiar en el portal (función pura). */
export function construirValoresPortal(datos: DatosPortal): string {
  const url = urlDelPortal(datos.cuerpoSolicitud);
  const filas = datos.campos.map((c) => {
    const valor = valorComoTexto(c.valor) ?? TEXTO_FALTANTE;
    return `| ${celdaMd(c.etiqueta)} | ${celdaMd(valor)} | ${c.estado} |`;
  });
  return [
    `# Valores para el portal — ${datos.cliente}`,
    "",
    `- Portal: ${url ?? "(no se encontró la dirección en la solicitud)"}`,
    `- Fecha de referencia: ${datos.fechaReferencia}`,
    `- Estado: ${AVISO_PORTAL}; el llenado automático de portales no está implementado.`,
    "",
    "> El ingreso de credenciales y el clic en \"Enviar\" los hace una persona.",
    "> Este agente no pide, no guarda y no registra credenciales del portal.",
    "",
    "| Etiqueta | Valor | Estado |",
    "|---|---|---|",
    ...filas,
    "",
  ].join("\n");
}

export async function escribirValoresPortal(ruta: string, datos: DatosPortal): Promise<void> {
  await writeFile(ruta, construirValoresPortal(datos), "utf8");
}

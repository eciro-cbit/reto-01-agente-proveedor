import type { Maestro, SoporteIndice, Solicitud } from "./esquemas";
import { normalizar } from "./mapeo";
import { PREFIJO_BANCARIO } from "./reglas";
import { estadoSoporte, type EstadoSoporte } from "./vigencia";

/** Soporte exigido evaluado a la fecha de referencia. */
export interface SoporteEvaluado {
  tipo: string;
  estado: EstadoSoporte;
  archivo?: string;
  vigencia_hasta?: string | null;
  pais_emisor?: string;
  nota?: string;
}

export interface PendienteConfirmacion {
  etiqueta: string;
  nota?: string;
}

export interface Checklist {
  fecha_referencia: string;
  soportes: SoporteEvaluado[];
  campos_faltantes: string[];
  pendientes_confirmacion: PendienteConfirmacion[];
  notas: string[];
}

function evaluarUno(tipo: string, entrada: SoporteIndice | undefined, fecha: string, paisCliente: string, disponible: boolean): SoporteEvaluado {
  if (entrada === undefined) return { tipo, estado: "ausente", nota: "no existe en el repositorio de soportes" };
  const base = { tipo, archivo: entrada.archivo, vigencia_hasta: entrada.vigencia_hasta, pais_emisor: entrada.pais_emisor };
  if (!disponible) return { ...base, estado: "ausente", nota: `el archivo ${entrada.archivo} no está en el repositorio` };
  const evaluado: SoporteEvaluado = { ...base, estado: estadoSoporte(entrada, fecha) };
  if (entrada.pais_emisor !== paisCliente) evaluado.nota = `emitido en ${entrada.pais_emisor}; el cliente es de ${paisCliente}`;
  return evaluado;
}

/** Evalúa cada soporte exigido: vigente / vencido / ausente (FR4.2). */
export function evaluarSoportes(
  exigidos: readonly string[],
  indice: readonly SoporteIndice[],
  opciones: { fechaReferencia: string; paisCliente: string; archivosDisponibles: ReadonlySet<string> },
): SoporteEvaluado[] {
  return exigidos.map((tipo) => {
    const entrada = indice.find((s) => s.tipo === tipo);
    const disponible = entrada !== undefined && opciones.archivosDisponibles.has(entrada.archivo);
    return evaluarUno(tipo, entrada, opciones.fechaReferencia, opciones.paisCliente, disponible);
  });
}

/** RN3: listo para firma solo sin soportes vencidos ni ausentes. */
export function estaListoParaFirma(soportes: readonly SoporteEvaluado[]): boolean {
  return soportes.every((s) => s.estado === "vigente");
}

/** Motivos que bloquean la firma, legibles. */
export function motivosDeBloqueo(soportes: readonly SoporteEvaluado[]): string[] {
  return soportes
    .filter((s) => s.estado !== "vigente")
    .map((s) => (s.estado === "vencido" ? `${s.tipo} vencido (vigencia hasta ${s.vigencia_hasta ?? "?"})` : `${s.tipo} ausente`));
}

/** Notas que salen del texto de la solicitud (ej. "no mayor a 30 días"). */
export function notasDeSolicitud(cuerpo: string): string[] {
  const antiguedad = /no mayor a (\d+) dias/.exec(normalizar(cuerpo));
  if (antiguedad === null) return [];
  return [
    `La solicitud pide un documento "no mayor a ${antiguedad[1]} días": el índice solo registra vigencia_hasta; verifique la fecha de expedición antes de firmar.`,
  ];
}

const siNo = (valor: boolean): string => (valor ? "Sí" : "No");
const listaOVacia = (items: readonly string[], vacio = "Ninguno"): string[] => (items.length > 0 ? items.map((i) => `- ${i}`) : [`- ${vacio}`]);

function filaSoporte(s: SoporteEvaluado): string {
  const vigencia = s.vigencia_hasta === undefined ? "—" : (s.vigencia_hasta ?? "no vence");
  return `| ${s.tipo} | ${s.estado} | ${s.archivo ?? "—"} | ${vigencia} | ${s.nota ?? ""} |`;
}

/** Contenido de `checklist.md`. */
export function construirChecklistMd(datos: { caso: string; solicitud: Solicitud; checklist: Checklist; listo: boolean }): string {
  const { checklist, solicitud } = datos;
  const bloqueo = motivosDeBloqueo(checklist.soportes);
  return [
    `# Checklist del paquete — ${solicitud.cliente}`,
    "",
    `- Caso: ${datos.caso}`,
    `- Formato: ${solicitud.formato}`,
    `- Fecha de referencia: ${checklist.fecha_referencia}`,
    `- Listo para firma: ${siNo(datos.listo)}${bloqueo.length > 0 ? ` (${bloqueo.join("; ")})` : ""}`,
    "",
    "## Soportes exigidos",
    "",
    "| Soporte | Estado | Archivo | Vigencia hasta | Nota |",
    "|---|---|---|---|---|",
    ...checklist.soportes.map(filaSoporte),
    "",
    "## Campos faltantes",
    "",
    ...listaOVacia(checklist.campos_faltantes),
    "",
    "## Pendientes de confirmación",
    "",
    ...listaOVacia(checklist.pendientes_confirmacion.map((p) => (p.nota ? `${p.etiqueta}: ${p.nota}` : p.etiqueta))),
    "",
    "## Notas",
    "",
    ...listaOVacia(checklist.notas, "Ninguna"),
    "",
  ].join("\n");
}

/** Contenido de `borrador-correo.md`; nunca incluye datos bancarios (RN2). */
export function construirBorradorCorreo(datos: { solicitud: Solicitud; adjuntos: readonly string[]; listo: boolean; bloqueo: readonly string[] }): string {
  const { solicitud } = datos;
  const aviso = datos.listo
    ? []
    : ["> Nota interna (borrar antes de enviar): el paquete no está listo para firma:", `> ${datos.bloqueo.join("; ")}.`, ""];
  return [
    `Para: ${solicitud.de}`,
    `Asunto: RE: ${solicitud.asunto}`,
    "",
    ...aviso,
    "Buenos días,",
    "",
    `En respuesta a su solicitud, adjuntamos la información para el registro de Periferia como proveedor de ${solicitud.cliente}:`,
    "",
    ...datos.adjuntos.map((a) => `- ${a}`),
    "",
    "El formulario se envía firmado por el representante legal.",
    "Quedamos atentos a cualquier comentario.",
    "",
    "Cordialmente,",
    "Área Administrativa",
    "Periferia",
    "",
  ].join("\n");
}

/** Valores bajo `banco.*` (≥ 4 caracteres; se excluye el titular cuando coincide con la razón social). */
function valoresBancarios(maestro: Maestro): string[] {
  const banco = maestro[PREFIJO_BANCARIO.slice(0, -1)];
  if (banco === null || banco === undefined || typeof banco !== "object" || Array.isArray(banco)) return [];
  const razonSocial = maestro["razon_social"];
  return Object.values(banco)
    .map((valor) => (typeof valor === "string" || typeof valor === "number" ? String(valor) : ""))
    .filter((v) => v.length >= 4 && v !== razonSocial);
}

/** Defensa RN2: indica si el texto contiene algún dato bancario del maestro. */
export function contieneDatosBancarios(texto: string, maestro: Maestro): boolean {
  return valoresBancarios(maestro).some((valor) => texto.includes(valor));
}

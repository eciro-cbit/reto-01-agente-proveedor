import type { Escalar, Glosario, Maestro, ValorMaestro } from "./esquemas";
import {
  CONFIANZA_EXACTA,
  CONFIANZA_NORMALIZADA,
  ETIQUETAS_AMBIGUAS,
  PAIS_MAESTRO,
  RUTA_IDENTIFICADOR,
  UMBRAL_CANDIDATO,
  UMBRAL_CONFIANZA,
  identificadorDelPais,
} from "./reglas";

export type EstadoCampo = "lleno" | "requiere_confirmacion" | "faltante";

/** Resultado del mapeo de una etiqueta de la plantilla. */
export interface CampoMapeado {
  etiqueta: string;
  estado: EstadoCampo;
  /** Ruta con punto en el maestro (ej. `banco.swift`), si hay candidato. */
  ruta?: string;
  /** Valor leído del maestro por `ruta`; nunca inventado. */
  valor?: Exclude<Escalar, null>;
  confianza: number;
  nota?: string;
}

export interface ResultadoMapeo {
  llenos: CampoMapeado[];
  faltantes: CampoMapeado[];
  requiere_confirmacion: CampoMapeado[];
}

export interface ContextoMapeo {
  pais: string;
  maestro: Maestro;
  glosario: Glosario;
}

interface Candidato {
  ruta: string;
  confianza: number;
  etiquetaGlosario: string;
}

/** Palabras vacías que no aportan a la similitud por tokens. */
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "o", "y", "e", "en", "para", "por", "a"]);

/** Minúsculas, sin tildes y con espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(texto: string): Set<string> {
  const palabras = normalizar(texto).split(/[^a-z0-9]+/);
  return new Set(palabras.filter((p) => p.length > 0 && !PALABRAS_VACIAS.has(p)));
}

/** Coeficiente de Dice entre los conjuntos de tokens significativos (0..1). */
export function similitud(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes += 1;
  return (2 * comunes) / (ta.size + tb.size);
}

const redondear = (n: number): number => Math.round(n * 100) / 100;

/**
 * Busca la ruta del maestro para una etiqueta, en este orden:
 * 1. clave exacta del glosario → confianza 1.0;
 * 2. clave igual tras normalizar → 0.95;
 * 3. mejor similitud por tokens (Dice) contra las claves del glosario → su valor
 *    (empates: primera clave en el orden del glosario).
 */
export function buscarCandidato(etiqueta: string, glosario: Glosario): Candidato | undefined {
  const exacta = glosario[etiqueta];
  if (exacta !== undefined) return { ruta: exacta, confianza: CONFIANZA_EXACTA, etiquetaGlosario: etiqueta };
  const normalizada = normalizar(etiqueta);
  let mejor: Candidato | undefined;
  for (const [clave, ruta] of Object.entries(glosario)) {
    if (normalizar(clave) === normalizada) return { ruta, confianza: CONFIANZA_NORMALIZADA, etiquetaGlosario: clave };
    const confianza = redondear(similitud(etiqueta, clave));
    if (mejor === undefined || confianza > mejor.confianza) mejor = { ruta, confianza, etiquetaGlosario: clave };
  }
  return mejor;
}

/** Lee el valor por ruta con punto; solo devuelve escalares no nulos. */
export function resolverRuta(maestro: Maestro, ruta: string): Exclude<Escalar, null> | undefined {
  let actual: ValorMaestro | undefined = maestro;
  for (const parte of ruta.split(".")) {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return undefined;
    actual = actual[parte];
  }
  if (typeof actual === "string" || typeof actual === "number" || typeof actual === "boolean") return actual;
  return undefined;
}

export function esEtiquetaAmbigua(etiqueta: string): boolean {
  const normalizada = normalizar(etiqueta);
  return ETIQUETAS_AMBIGUAS.some((a) => normalizar(a) === normalizada);
}

/** Nota de contexto para valores con unidad en el maestro (ej. moneda y año de ingresos). */
function notaDeContexto(maestro: Maestro, ruta: string): string | undefined {
  if (!ruta.endsWith(".valor")) return undefined;
  const base = ruta.slice(0, -".valor".length);
  const moneda = resolverRuta(maestro, `${base}.moneda`);
  const ano = resolverRuta(maestro, `${base}.ano`);
  if (moneda === undefined) return undefined;
  return ano === undefined ? `moneda ${moneda}` : `moneda ${moneda}, año ${ano}`;
}

/** Motivo para pedir confirmación, o undefined si el campo puede quedar lleno. */
function motivoConfirmacion(etiqueta: string, candidato: Candidato, pais: string): string | undefined {
  const notas: string[] = [];
  if (esEtiquetaAmbigua(etiqueta)) {
    notas.push(`etiqueta genérica de identificador tributario: para ${pais} se propone ${identificadorDelPais(pais) ?? "el identificador local"}`);
  }
  if (candidato.ruta === RUTA_IDENTIFICADOR && pais !== PAIS_MAESTRO) {
    notas.push(`identificador extranjero (se esperaba ${identificadorDelPais(pais) ?? "el identificador local"})`);
  }
  if (candidato.confianza < UMBRAL_CONFIANZA) {
    notas.push(`coincidencia aproximada con '${candidato.etiquetaGlosario}'`);
  }
  return notas.length > 0 ? notas.join("; ") : undefined;
}

/** Mapea una etiqueta al maestro. Nunca inventa valores: sin fuente = `faltante`. */
export function mapearCampo(etiqueta: string, contexto: ContextoMapeo): CampoMapeado {
  const candidato = buscarCandidato(etiqueta, contexto.glosario);
  if (candidato === undefined || candidato.confianza < UMBRAL_CANDIDATO) {
    return { etiqueta, estado: "faltante", confianza: candidato?.confianza ?? 0, nota: "sin equivalente en el glosario ni en el maestro" };
  }
  const { ruta, confianza } = candidato;
  const valor = resolverRuta(contexto.maestro, ruta);
  if (valor === undefined) {
    return { etiqueta, estado: "faltante", ruta, confianza, nota: `la ruta '${ruta}' no tiene valor en el maestro` };
  }
  const motivo = motivoConfirmacion(etiqueta, candidato, contexto.pais);
  const contextoValor = notaDeContexto(contexto.maestro, ruta);
  const nota = [motivo, contextoValor].filter((n) => n !== undefined).join("; ");
  const estado: EstadoCampo = motivo === undefined ? "lleno" : "requiere_confirmacion";
  return nota.length > 0 ? { etiqueta, estado, ruta, valor, confianza, nota } : { etiqueta, estado, ruta, valor, confianza };
}

/** Mapea todas las etiquetas y las agrupa por estado, conservando el orden de entrada. */
export function mapearCampos(etiquetas: readonly string[], contexto: ContextoMapeo): ResultadoMapeo {
  const resultado: ResultadoMapeo = { llenos: [], faltantes: [], requiere_confirmacion: [] };
  for (const etiqueta of etiquetas) {
    const campo = mapearCampo(etiqueta, contexto);
    if (campo.estado === "lleno") resultado.llenos.push(campo);
    else if (campo.estado === "faltante") resultado.faltantes.push(campo);
    else resultado.requiere_confirmacion.push(campo);
  }
  return resultado;
}

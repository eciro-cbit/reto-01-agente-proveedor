import type { Escalar } from "../esquemas";
import type { PlantillaCaso } from "../fixtures";
import { mapearCampo, resolverRuta, type ContextoMapeo, type EstadoCampo } from "../mapeo";

/** Entrada de mapeo que envía el agente: solo etiqueta y ruta; cualquier valor se ignora (CA2). */
export interface EntradaMapeo {
  etiqueta: string;
  ruta?: string | undefined;
}

/** Campo listo para escribir en un formulario. */
export interface CampoFormulario {
  etiqueta: string;
  obligatorio: boolean;
  estado: EstadoCampo;
  ruta?: string;
  valor?: Exclude<Escalar, null>;
}

export interface CamposResueltos {
  campos: CampoFormulario[];
  /** Rutas indicadas en el mapeo que no existen o no tienen valor en el maestro. */
  rutas_sin_valor: string[];
  /** Etiquetas del mapeo que no están en la plantilla. */
  etiquetas_ignoradas: string[];
}

/** Valor como texto para pdf, portal y markdown. */
export function valorComoTexto(valor: Exclude<Escalar, null> | undefined): string | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  return String(valor);
}

function etiquetasConObligatorio(plantilla: PlantillaCaso): Array<{ etiqueta: string; obligatorio: boolean }> {
  if (plantilla.tipo === "campos") return plantilla.campos;
  return plantilla.celdas.map((c) => ({ etiqueta: c.etiqueta, obligatorio: true }));
}

/** Campo a partir de la ruta que indicó el agente; el valor siempre se relee del maestro. */
function campoDesdeRuta(base: CampoFormulario, ruta: string | undefined, contexto: ContextoMapeo, sinValor: string[]): CampoFormulario {
  if (ruta === undefined) return { etiqueta: base.etiqueta, obligatorio: base.obligatorio, estado: "faltante" };
  const valor = resolverRuta(contexto.maestro, ruta);
  if (valor === undefined) {
    sinValor.push(ruta);
    return { etiqueta: base.etiqueta, obligatorio: base.obligatorio, estado: "faltante", ruta };
  }
  const estado: EstadoCampo = ruta === base.ruta ? base.estado : "requiere_confirmacion";
  return { etiqueta: base.etiqueta, obligatorio: base.obligatorio, estado, ruta, valor };
}

/**
 * Une la plantilla con el mapeo del agente. Etiquetas sin entrada en `mapeo` usan el mapeo
 * automático; una ruta distinta a la automática queda pendiente de confirmación.
 */
export function resolverCamposFormulario(
  plantilla: PlantillaCaso,
  mapeo: readonly EntradaMapeo[] | undefined,
  contexto: ContextoMapeo,
): CamposResueltos {
  const porEtiqueta = new Map((mapeo ?? []).map((m) => [m.etiqueta, m]));
  const sinValor: string[] = [];
  const etiquetas = etiquetasConObligatorio(plantilla);
  const campos = etiquetas.map(({ etiqueta, obligatorio }) => {
    const auto = mapearCampo(etiqueta, contexto);
    const base: CampoFormulario = { etiqueta, obligatorio, estado: auto.estado };
    if (auto.ruta !== undefined) base.ruta = auto.ruta;
    if (auto.valor !== undefined) base.valor = auto.valor;
    const entrada = porEtiqueta.get(etiqueta);
    return entrada === undefined ? base : campoDesdeRuta(base, entrada.ruta, contexto, sinValor);
  });
  const conocidas = new Set(etiquetas.map((e) => e.etiqueta));
  const etiquetas_ignoradas = [...porEtiqueta.keys()].filter((e) => !conocidas.has(e));
  return { campos, rutas_sin_valor: sinValor, etiquetas_ignoradas };
}

/** Fecha fija (medianoche UTC de la fecha de referencia) para metadatos deterministas. */
export function fechaMetadatos(fechaReferencia: string): Date {
  return new Date(`${fechaReferencia}T00:00:00.000Z`);
}

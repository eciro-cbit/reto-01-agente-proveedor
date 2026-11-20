/** Reglas de negocio del registro como proveedor (§7.3 del PRD). */

/** RN1: identificador tributario esperado por país. */
export const IDENTIFICADOR_POR_PAIS: Readonly<Record<string, string>> = {
  CO: "NIT",
  EC: "RUC",
  PE: "RUC",
  PA: "RUC",
  HN: "RTN",
};

/** País de Periferia: el único identificador que existe en el maestro es su NIT. */
export const PAIS_MAESTRO = "CO";

/** Ruta del identificador tributario en el maestro. */
export const RUTA_IDENTIFICADOR = "nit";

/** Etiquetas genéricas de identificador tributario que se reportan como ambiguas (HU-1). */
export const ETIQUETAS_AMBIGUAS: readonly string[] = ["Identificación tributaria", "Número de identificación fiscal"];

/** Confianza mínima para llenar sin confirmación (HU-2). */
export const UMBRAL_CONFIANZA = 0.8;

/** Confianza mínima para proponer un candidato; por debajo el campo es faltante. */
export const UMBRAL_CANDIDATO = 0.5;

/** Confianza de una coincidencia exacta y de una coincidencia tras normalizar. */
export const CONFIANZA_EXACTA = 1;
export const CONFIANZA_NORMALIZADA = 0.95;

/** RN2: rutas con datos bancarios (nunca van al borrador de correo). */
export const PREFIJO_BANCARIO = "banco.";

export function esRutaBancaria(ruta: string): boolean {
  return ruta.startsWith(PREFIJO_BANCARIO);
}

/** Identificador esperado para el país, o undefined si el país no está en la tabla. */
export function identificadorDelPais(pais: string): string | undefined {
  return IDENTIFICADOR_POR_PAIS[pais];
}

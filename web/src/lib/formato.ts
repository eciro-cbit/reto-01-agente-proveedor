/** Utilidades de presentación para las tarjetas de herramientas (puras, sin estado). */

export const HERRAMIENTA_CONFIRMACION = "agente_solicitar_confirmacion";

/** Prompt de ejemplo de la demo (PRD §11), ofrecido como sugerencia en la bienvenida. */
export const PROMPT_EJEMPLO =
  'Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles faltan, si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.';

/** `proveedor_armar_paquete` → "armar paquete"; `agente_solicitar_confirmacion` → "solicitar confirmacion". */
export function nombreLegible(nombre: string): string {
  const sinPrefijo = nombre.replace(/^(proveedor|agente)_/, "");
  return sinPrefijo.replaceAll("_", " ").trim() || nombre;
}

/** Argumentos como JSON con sangría; nunca lanza (texto plano, se pinta sin `{@html}`). */
export function argumentosComoTexto(argumentos: unknown): string {
  if (argumentos === undefined) return "(sin argumentos)";
  try {
    return JSON.stringify(argumentos, null, 2) ?? String(argumentos);
  } catch {
    return String(argumentos);
  }
}

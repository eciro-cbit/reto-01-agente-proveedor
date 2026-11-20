import { z } from "zod";
import type { DefinicionHerramienta } from "../llm/adapter";
import type { RegistroHerramientas } from "../tools/runner";
import { herramientas } from "../tools/runner";
import type { FormaArgs } from "../tools/tipos";

/** Herramienta interna con la que el modelo cierra el turno pidiendo confirmación (CA3). */
export const HERRAMIENTA_CONFIRMACION = "agente_solicitar_confirmacion";
/** Única acción externa del reto: requiere confirmación validada por el backend (RN4). */
export const HERRAMIENTA_ENVIO = "proveedor_simular_envio";

export const argsConfirmacion = {
  caso: z.string().min(1).describe("Nombre de la carpeta del caso cuyo paquete se propone enviar"),
  accion: z.literal("simular_envio").describe("Acción externa que requiere confirmación; por ahora solo simular_envio"),
  resumen: z.string().min(1).max(2000).describe("Pregunta explícita de sí o no que verá la persona, con lo que se va a enviar"),
} satisfies FormaArgs;

export const esquemaConfirmacion = z.object(argsConfirmacion);

const DESCRIPCION_CONFIRMACION =
  "Termina el turno con una pregunta explícita de confirmación antes de una acción externa; el envío solo procede si la persona confirma en su siguiente mensaje.";

/** JSON Schema de los argumentos desde los mismos esquemas zod que valida el runner (una sola fuente). */
export function esquemaJson(forma: FormaArgs): Record<string, unknown> {
  const esquema: Record<string, unknown> = { ...z.toJSONSchema(z.object(forma), { io: "input" }) };
  delete esquema["$schema"];
  return esquema;
}

/** Definiciones que ve el modelo: las herramientas `proveedor_*` del Bolt 1 más la de confirmación. */
export function definicionesParaModelo(registro: RegistroHerramientas = herramientas): DefinicionHerramienta[] {
  const proveedor = Object.entries(registro).map(([nombre, h]) => ({ nombre, descripcion: h.description, esquema: esquemaJson(h.args) }));
  return [...proveedor, { nombre: HERRAMIENTA_CONFIRMACION, descripcion: DESCRIPCION_CONFIRMACION, esquema: esquemaJson(argsConfirmacion) }];
}

import type { AdaptadorLLM, DefinicionHerramienta, LlamadaHerramienta, Mensaje, RespuestaLLM } from "../../src/llm/adapter";
import { ErrorLLM } from "../../src/llm/adapter";

/** Un paso del guion: respuesta fija, error a lanzar o función que decide a partir de lo recibido. */
export type PasoGuion = RespuestaLLM | ErrorLLM | ((mensajes: readonly Mensaje[]) => RespuestaLLM);

export interface Recibido {
  mensajes: Mensaje[];
  herramientas: string[];
  sistema: string;
}

export interface LLMGuionizado extends AdaptadorLLM {
  /** Copia de lo que recibió cada llamada a `enviar`. */
  readonly recibidos: Recibido[];
  /** Pasos del guion que aún no se consumieron. */
  pendientes(): number;
}

export interface OpcionesGuion {
  /** Demora artificial por llamada, en milisegundos. */
  demoraMs?: number;
  /** Nombre de modelo que expone el adaptador falso. */
  modelo?: string;
}

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** `AdaptadorLLM` falso que reproduce un guion en orden; sin red ni clave. */
export function crearLLMGuionizado(pasos: PasoGuion[], opciones: OpcionesGuion = {}): LLMGuionizado {
  const cola = [...pasos];
  const recibidos: Recibido[] = [];
  return {
    proveedor: "guion",
    modelo: opciones.modelo ?? "modelo-guion",
    recibidos,
    pendientes: () => cola.length,
    async enviar(mensajes: readonly Mensaje[], herramientas: readonly DefinicionHerramienta[], { sistema }) {
      recibidos.push({ mensajes: structuredClone([...mensajes]), herramientas: herramientas.map((h) => h.nombre), sistema });
      if (opciones.demoraMs !== undefined) await esperar(opciones.demoraMs);
      const paso = cola.shift();
      if (paso === undefined) throw new Error("El guion del LLM falso se agotó");
      if (paso instanceof ErrorLLM) throw paso;
      return typeof paso === "function" ? paso(mensajes) : paso;
    },
  };
}

let contador = 0;

/** Llamada a herramienta con id único. */
export function llamada(nombre: string, argumentos: unknown): LlamadaHerramienta {
  contador += 1;
  return { id: `toolu_${contador}`, nombre, argumentos };
}

/** Respuesta que pide herramientas. */
export function pedirHerramientas(llamadas: LlamadaHerramienta[], texto = "", uso = { entrada: 100, salida: 20 }): RespuestaLLM {
  return { texto, llamadas, uso, motivoFin: "herramientas" };
}

/** Respuesta final de texto. */
export function responderTexto(texto: string, uso = { entrada: 100, salida: 20 }): RespuestaLLM {
  return { texto, llamadas: [], uso, motivoFin: "fin" };
}

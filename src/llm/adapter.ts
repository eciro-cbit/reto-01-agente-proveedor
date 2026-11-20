/**
 * Interfaz propia del proveedor LLM (§6.1 del PRD, FR9.1).
 * El ciclo del agente solo conoce estos tipos neutrales; cada proveedor traduce desde y hacia ellos.
 * Cambiar de proveedor = escribir otra implementación de `AdaptadorLLM`, sin tocar el ciclo.
 */

/** Llamada a herramienta pedida por el modelo. `argumentos` llega sin validar. */
export interface LlamadaHerramienta {
  id: string;
  nombre: string;
  argumentos: unknown;
}

/** Resultado de una herramienta que vuelve al modelo (string JSON `{ ok, data }` o `{ ok: false, error }`). */
export interface ResultadoHerramienta {
  idLlamada: string;
  contenido: string;
  esError: boolean;
}

export interface MensajeUsuario {
  rol: "usuario";
  texto: string;
}

export interface MensajeAsistente {
  rol: "asistente";
  texto: string;
  llamadas: LlamadaHerramienta[];
  /**
   * Contenido original del proveedor, opaco para el ciclo. El mismo adaptador lo reenvía tal cual
   * en la siguiente petición (p. ej. bloques de razonamiento que el proveedor exige sin cambios).
   */
  contenidoProveedor?: unknown;
}

/** Todos los resultados de las llamadas de una respuesta van juntos en un solo mensaje. */
export interface MensajeHerramienta {
  rol: "herramienta";
  resultados: ResultadoHerramienta[];
}

export type Mensaje = MensajeUsuario | MensajeAsistente | MensajeHerramienta;

/** Herramienta tal como se le ofrece al modelo: nombre, una frase y JSON Schema de los argumentos. */
export interface DefinicionHerramienta {
  nombre: string;
  descripcion: string;
  esquema: Record<string, unknown>;
}

export interface UsoTokens {
  entrada: number;
  salida: number;
}

/**
 * Por qué terminó la respuesta: `fin` (respuesta final), `herramientas` (pide herramientas),
 * `limite_salida` (cortada por tope de tokens de salida), `rechazo` (el proveedor declinó), `otro`.
 */
export type MotivoFin = "fin" | "herramientas" | "limite_salida" | "rechazo" | "otro";

export interface RespuestaLLM {
  texto: string;
  llamadas: LlamadaHerramienta[];
  uso: UsoTokens;
  motivoFin: MotivoFin;
  contenidoProveedor?: unknown;
}

export type TipoErrorLLM = "timeout" | "autenticacion" | "limite" | "proveedor" | "red";

/** Error tipado del proveedor con un mensaje claro en español; nunca incluye la clave ni trazas. */
export class ErrorLLM extends Error {
  readonly tipo: TipoErrorLLM;

  constructor(tipo: TipoErrorLLM, mensaje: string) {
    super(mensaje);
    this.name = "ErrorLLM";
    this.tipo = tipo;
  }
}

export interface OpcionesEnvio {
  /** System prompt completo (comportamiento + conocimiento). */
  sistema: string;
}

/** Contrato de un proveedor: `enviar` resuelve con la respuesta o rechaza con `ErrorLLM`. */
export interface AdaptadorLLM {
  readonly proveedor: string;
  readonly modelo: string;
  enviar(mensajes: readonly Mensaje[], herramientas: readonly DefinicionHerramienta[], opciones: OpcionesEnvio): Promise<RespuestaLLM>;
}

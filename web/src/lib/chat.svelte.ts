/**
 * Estado del chat (FR11.1–FR11.3, CA3, CA5): una clase con runes de Svelte 5.
 *
 * Svelte 5 ↔ Angular, para leer este front:
 * - `$state(valor)`   ≈ `signal(valor)`: campo reactivo; se lee y se asigna como una propiedad normal (sin `()` ni `.set()`).
 *   Los arrays y objetos son reactivos en profundidad: `this.mensajes.push(...)` ya actualiza la vista.
 * - `$derived(expr)`  ≈ `computed(() => expr)`: se recalcula solo cuando cambian los `$state` que lee.
 * - `$effect(() => …)` ≈ `effect(() => …)`: efecto secundario que se repite al cambiar lo que lee (se usa en componentes).
 * - `$props()`        ≈ `input()`: props de un componente, desestructuradas con valores por defecto.
 * - Callbacks como props (`onEnviar`) ≈ `output()`: en Svelte 5 un evento es simplemente una función recibida por props.
 * - Esta clase ≈ un servicio `@Injectable`: no hay inyector; `App.svelte` crea una instancia (o la recibe en pruebas)
 *   y la pasa a los componentes. El archivo debe terminar en `.svelte.ts` para que el compilador procese las runes.
 */
import { borrarClaveAcceso, guardarClaveAcceso, leerClaveAcceso } from "./acceso";
import { enviarMensaje, obtenerSesion } from "./api";
import { obtenerSessionId, reiniciarSessionId } from "./sesion";
import type { EntradaHistorial, FallaApi, MensajeVisible, ResultadoApi, RespuestaTurno, RolMensaje, ToolCallVisible, VistaSesion } from "./tipos";

/** Mismo tope que valida el backend (`LARGO_MAXIMO_MENSAJE`). */
export const LARGO_MAXIMO_MENSAJE = 8000;
export const TEXTO_CONFIRMAR = "Sí, confirmo el envío";
export const TEXTO_RECHAZAR = "No envíes todavía";
/** Un header HTTP solo admite caracteres imprimibles ASCII sin problemas; con otros, `fetch` fallaría. */
const PATRON_CODIGO = /^[\x20-\x7E]+$/;
export const MENSAJE_CODIGO_INVALIDO = "El código solo puede tener letras sin tildes, números y símbolos.";

/** Dependencias inyectables: por defecto, la API, la sesión y el almacén del código reales; las pruebas pasan dobles. */
export interface DependenciasChat {
  enviarMensaje: (sessionId: string, mensaje: string) => Promise<ResultadoApi<RespuestaTurno>>;
  obtenerSesion: (sessionId: string) => Promise<ResultadoApi<VistaSesion | null>>;
  obtenerSessionId: () => string;
  reiniciarSessionId: () => string;
  leerClaveAcceso: () => string | undefined;
  guardarClaveAcceso: (codigo: string) => void;
  borrarClaveAcceso: () => void;
}

const DEPENDENCIAS_REALES: DependenciasChat = {
  enviarMensaje: (id, mensaje) => enviarMensaje(id, mensaje),
  obtenerSesion: (id) => obtenerSesion(id),
  obtenerSessionId,
  reiniciarSessionId,
  leerClaveAcceso,
  guardarClaveAcceso,
  borrarClaveAcceso,
};

export class ChatEstado {
  mensajes = $state<MensajeVisible[]>([]);
  pensando = $state(false);
  /** El último turno del agente pidió confirmación; se apaga con el siguiente turno exitoso. */
  needsConfirmation = $state(false);
  /** Último error mostrado (también queda como mensaje en la lista). */
  error = $state<string | null>(null);
  puedeEnviar = $derived(!this.pensando);
  /** El servidor respondió 401: la UI muestra la pantalla de acceso en lugar del chat. */
  necesitaClave = $state(false);
  /** Motivo por el que se rechazó el código ingresado (null en la primera visita). */
  errorClave = $state<string | null>(null);

  #deps: DependenciasChat;
  #sessionId: string;
  #siguienteId = 1;
  /** Cambia con "Nueva conversación": una respuesta que llega tarde a una conversación vieja se descarta. */
  #generacion = 0;
  /** Mensaje que no llegó al agente por falta de código; se reenvía al guardar uno. */
  #pendiente: string | undefined;

  constructor(deps: Partial<DependenciasChat> = {}) {
    this.#deps = { ...DEPENDENCIAS_REALES, ...deps };
    this.#sessionId = this.#deps.obtenerSessionId();
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  /** Envía un mensaje del usuario. Devuelve `false` si no se envió (vacío, demasiado largo o ya pensando). */
  async enviar(texto: string): Promise<boolean> {
    const limpio = texto.trim();
    if (limpio === "" || this.pensando) return false;
    if (limpio.length > LARGO_MAXIMO_MENSAJE) {
      this.#mostrarError(`El mensaje es demasiado largo (${limpio.length} caracteres; máximo ${LARGO_MAXIMO_MENSAJE}).`);
      return false;
    }
    this.#agregar("usuario", limpio);
    await this.#entregar(limpio);
    return true;
  }

  /**
   * Guarda el código de acceso y retoma lo que quedó a medias: reenvía el mensaje pendiente o, si no hay,
   * carga el historial. Devuelve `false` si el código está vacío o tiene caracteres no válidos.
   */
  async guardarClave(codigo: string): Promise<boolean> {
    const limpio = codigo.trim();
    if (limpio === "") return false;
    if (!PATRON_CODIGO.test(limpio)) {
      this.errorClave = MENSAJE_CODIGO_INVALIDO;
      return false;
    }
    this.#deps.guardarClaveAcceso(limpio);
    this.necesitaClave = false;
    this.errorClave = null;
    const pendiente = this.#pendiente;
    this.#pendiente = undefined;
    if (pendiente !== undefined) await this.#entregar(pendiente);
    else if (this.mensajes.length === 0) await this.cargarHistorial();
    return true;
  }

  /** Recupera el historial de la sesión guardada (al recargar la página). */
  async cargarHistorial(): Promise<void> {
    const generacion = this.#generacion;
    const resultado = await this.#deps.obtenerSesion(this.#sessionId);
    if (generacion !== this.#generacion || this.mensajes.length > 0) return;
    if (!resultado.ok) {
      if (resultado.requiereClave === true) this.#pedirClave(resultado);
      else this.#mostrarError(`No se pudo recuperar la conversación anterior. ${resultado.error}`);
      return;
    }
    if (resultado.datos === null) return;
    for (const entrada of resultado.datos.historial) this.#agregarDelHistorial(entrada);
    const ultima = resultado.datos.historial.at(-1);
    this.needsConfirmation = resultado.datos.confirmacionPendiente !== null && ultima?.needsConfirmation === true;
  }

  /** Empieza de cero con otro `sessionId`. */
  nuevaConversacion(): void {
    this.#generacion += 1;
    this.#sessionId = this.#deps.reiniciarSessionId();
    this.#pendiente = undefined;
    this.mensajes = [];
    this.pensando = false;
    this.needsConfirmation = false;
    this.error = null;
  }

  /** Envía al backend un mensaje ya mostrado en la lista y pinta la respuesta o el error. */
  async #entregar(texto: string): Promise<void> {
    this.pensando = true;
    this.error = null;
    const generacion = this.#generacion;
    const resultado = await this.#deps.enviarMensaje(this.#sessionId, texto);
    if (generacion !== this.#generacion) return;
    this.pensando = false;
    if (resultado.ok) this.#recibirTurno(resultado.datos);
    else if (resultado.requiereClave === true) {
      this.#pendiente = texto;
      this.#pedirClave(resultado);
    } else this.#mostrarError(resultado.error);
  }

  /**
   * 401: olvida el código guardado y muestra la pantalla de acceso. Si había un código, el servidor lo rechazó y
   * se explica por qué; en la primera visita no hay error que mostrar.
   */
  #pedirClave(falla: FallaApi): void {
    const habiaCodigo = this.#deps.leerClaveAcceso() !== undefined;
    this.#deps.borrarClaveAcceso();
    this.errorClave = habiaCodigo ? falla.error : null;
    this.necesitaClave = true;
  }

  #recibirTurno(turno: RespuestaTurno): void {
    this.#agregar("asistente", turno.reply, turno.toolCalls, turno.needsConfirmation);
    this.needsConfirmation = turno.needsConfirmation;
  }

  #agregarDelHistorial(entrada: EntradaHistorial): void {
    this.#agregar(entrada.rol, entrada.texto, entrada.toolCalls ?? [], entrada.needsConfirmation ?? false);
  }

  /** Un error queda visible en el chat; la sesión y la entrada siguen utilizables (CA5). */
  #mostrarError(texto: string): void {
    this.error = texto;
    this.#agregar("error", texto);
  }

  #agregar(rol: RolMensaje, texto: string, toolCalls: ToolCallVisible[] = [], needsConfirmation = false): void {
    this.mensajes.push({ id: this.#siguienteId++, rol, texto, toolCalls, needsConfirmation: rol === "asistente" && needsConfirmation });
  }
}

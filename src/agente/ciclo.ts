/**
 * Ciclo del agente (§6.3 del PRD, FR9.1–FR9.4): prompt → modelo → herramientas → respuesta.
 *
 * - CA1 / NFR3: tope de llamadas al modelo por turno y de tokens por sesión; al llegar a un tope
 *   responde con lo hecho y lo que falta.
 * - CA3 / RN4: `agente_solicitar_confirmacion` cierra el turno con `needsConfirmation`; el envío con
 *   `confirmado: true` solo se ejecuta si `autorizarEnvio` lo permite. La confirmación pendiente
 *   vale solo para el turno siguiente.
 * - CA4: cada llamada queda en `toolCalls` visibles y en `out/log.jsonl` (+ `out/<caso>/log.jsonl`).
 * - CA5: un `ErrorLLM` se convierte en `reply` claro y la sesión sigue aceptando mensajes.
 * Solo depende de la interfaz `AdaptadorLLM`, nunca de un proveedor concreto.
 */
import { registrar } from "../dominio/registro";
import type { AdaptadorLLM, DefinicionHerramienta, LlamadaHerramienta, RespuestaLLM, ResultadoHerramienta } from "../llm/adapter";
import { ErrorLLM } from "../llm/adapter";
import type { RegistroHerramientas } from "../tools/runner";
import { ejecutarHerramienta, herramientas, leerResultado, resumir } from "../tools/runner";
import type { ContextoHerramienta, Resultado } from "../tools/tipos";
import { exito, fallo } from "../tools/tipos";
import { autorizarEnvio } from "./confirmacion";
import { definicionesParaModelo, esquemaConfirmacion, HERRAMIENTA_CONFIRMACION, HERRAMIENTA_ENVIO } from "./herramientas-llm";
import type { ConfirmacionPendiente, RespuestaTurno, Sesion, ToolCallVisible } from "./tipos";

export interface DependenciasTurno {
  adaptador: AdaptadorLLM;
  /** Raíz del proyecto (contiene fixtures/ y out/). */
  directory: string;
  /** System prompt ya armado (prompt.md + conocimiento). */
  sistema: string;
  maxIteraciones: number;
  maxTokensSesion: number;
  /** Registro de herramientas; por defecto el del Bolt 1. */
  registro?: RegistroHerramientas;
}

interface EstadoTurno {
  sesion: Sesion;
  ctx: ContextoHerramienta;
  mensajeUsuario: string;
  /** Confirmación pedida en el turno anterior; se consume al autorizar un envío. */
  pendiente: ConfirmacionPendiente | undefined;
  /** Confirmación pedida en este turno (cierra el turno). */
  nuevaConfirmacion: ConfirmacionPendiente | undefined;
  toolCalls: ToolCallVisible[];
  ultimoTexto: string;
}

interface Cierre {
  reply: string;
  needsConfirmation: boolean;
}

interface Ejecucion {
  salida: string;
  visible: ToolCallVisible;
}

const ahoraIso = (): string => new Date().toISOString();

function iniciarTurno(sesion: Sesion, mensaje: string, directory: string): EstadoTurno {
  const pendiente = sesion.confirmacionPendiente;
  delete sesion.confirmacionPendiente;
  sesion.historial.push({ rol: "usuario", texto: mensaje, ts: ahoraIso() });
  sesion.mensajesLLM.push({ rol: "usuario", texto: mensaje });
  const ctx = { directory, sessionId: sesion.id };
  return { sesion, ctx, mensajeUsuario: mensaje, pendiente, nuevaConfirmacion: undefined, toolCalls: [], ultimoTexto: "" };
}

function casoDe(argumentos: unknown): string | undefined {
  if (argumentos === null || typeof argumentos !== "object") return undefined;
  const caso = (argumentos as { caso?: unknown }).caso;
  return typeof caso === "string" ? caso : undefined;
}

/** Registra en log.jsonl una llamada que el backend resolvió sin pasar por el runner. */
async function registrarInterna(estado: EstadoTurno, nombre: string, argumentos: unknown, resultado: Resultado<unknown>): Promise<string> {
  await registrar(estado.ctx, casoDe(argumentos), { ts: ahoraIso(), herramienta: nombre, ok: resultado.ok, resumen: resumir(resultado) });
  return JSON.stringify(resultado);
}

async function solicitarConfirmacion(estado: EstadoTurno, argumentos: unknown): Promise<string> {
  const validado = esquemaConfirmacion.safeParse(argumentos ?? {});
  if (!validado.success) {
    return registrarInterna(estado, HERRAMIENTA_CONFIRMACION, argumentos, fallo("Argumentos inválidos: se requieren caso, accion 'simular_envio' y resumen"));
  }
  estado.nuevaConfirmacion = validado.data;
  return registrarInterna(estado, HERRAMIENTA_CONFIRMACION, argumentos, exito({ estado: "pregunta enviada; el turno termina hasta que la persona responda" }));
}

/** Guarda de RN4: `simular_envio` con `confirmado: true` solo con autorización del backend. */
async function simularEnvioGuardado(estado: EstadoTurno, argumentos: unknown, registro: RegistroHerramientas): Promise<string> {
  const pideEnvio = (argumentos as { confirmado?: unknown } | null)?.confirmado === true;
  if (!pideEnvio) return ejecutarHerramienta(HERRAMIENTA_ENVIO, argumentos, estado.ctx, registro);
  const autorizado = autorizarEnvio(estado.pendiente, casoDe(argumentos) ?? "", estado.mensajeUsuario);
  if (!autorizado.ok) return registrarInterna(estado, HERRAMIENTA_ENVIO, argumentos, autorizado);
  estado.pendiente = undefined;
  return ejecutarHerramienta(HERRAMIENTA_ENVIO, argumentos, estado.ctx, registro);
}

async function ejecutarLlamada(estado: EstadoTurno, llamada: LlamadaHerramienta, registro: RegistroHerramientas): Promise<Ejecucion> {
  const { nombre, argumentos } = llamada;
  let salida: string;
  if (nombre === HERRAMIENTA_CONFIRMACION) salida = await solicitarConfirmacion(estado, argumentos);
  else if (nombre === HERRAMIENTA_ENVIO) salida = await simularEnvioGuardado(estado, argumentos, registro);
  else salida = await ejecutarHerramienta(nombre, argumentos, estado.ctx, registro);
  const resultado = leerResultado(salida);
  return { salida, visible: { nombre, argumentos, resumen: resumir(resultado), ok: resultado.ok } };
}

/** Ejecuta las llamadas en orden y devuelve todos los resultados al modelo en un solo mensaje. */
async function ejecutarLlamadas(estado: EstadoTurno, llamadas: readonly LlamadaHerramienta[], registro: RegistroHerramientas): Promise<void> {
  const resultados: ResultadoHerramienta[] = [];
  for (const llamada of llamadas) {
    const { salida, visible } = await ejecutarLlamada(estado, llamada, registro);
    estado.toolCalls.push(visible);
    resultados.push({ idLlamada: llamada.id, contenido: salida, esError: !visible.ok });
  }
  estado.sesion.mensajesLLM.push({ rol: "herramienta", resultados });
}

function listaHecho(estado: EstadoTurno): string {
  if (estado.toolCalls.length === 0) return "ninguna herramienta en este turno";
  return estado.toolCalls.map((t) => `${t.nombre} (${t.ok ? "ok" : "error"})`).join(", ");
}

function cierreTopeIteraciones(estado: EstadoTurno, maximo: number): Cierre {
  const previo = estado.ultimoTexto === "" ? "" : `${estado.ultimoTexto}\n\n`;
  return {
    reply: `${previo}Llegué al tope de ${maximo} pasos en este turno. Hecho: ${listaHecho(estado)}. Falta: completar el proceso; escribe "continúa" para seguir donde quedé.`,
    needsConfirmation: false,
  };
}

function cierreTopeTokens(estado: EstadoTurno, maximo: number): Cierre {
  return {
    reply: `Se alcanzó el tope de ${maximo} tokens de esta sesión (${estado.sesion.tokensUsados} usados). Hecho: ${listaHecho(estado)}. Falta: lo que no se completó; inicia una sesión nueva para continuar.`,
    needsConfirmation: false,
  };
}

function cierreConfirmacion(estado: EstadoTurno, confirmacion: ConfirmacionPendiente): Cierre {
  const texto = estado.ultimoTexto;
  const reply = texto.includes(confirmacion.resumen) ? texto : [texto, confirmacion.resumen].filter((t) => t !== "").join("\n\n");
  return { reply, needsConfirmation: true };
}

/** Respuesta final cuando el modelo no pidió herramientas. */
function cierreFinal(respuesta: RespuestaLLM): Cierre {
  if (respuesta.motivoFin === "rechazo") {
    const previo = respuesta.texto === "" ? "" : `${respuesta.texto}\n\n`;
    return { reply: `${previo}El modelo declinó responder esta solicitud. Reformúlala o pide otra acción.`, needsConfirmation: false };
  }
  if (respuesta.motivoFin === "limite_salida") {
    return { reply: `${respuesta.texto}\n\n(La respuesta se cortó por longitud; pide que continúe.)`.trim(), needsConfirmation: false };
  }
  return { reply: respuesta.texto === "" ? "El modelo no devolvió texto. Intenta reformular tu mensaje." : respuesta.texto, needsConfirmation: false };
}

async function consultarModelo(estado: EstadoTurno, deps: DependenciasTurno, definiciones: DefinicionHerramienta[]): Promise<Resultado<RespuestaLLM>> {
  try {
    return exito(await deps.adaptador.enviar(estado.sesion.mensajesLLM, definiciones, { sistema: deps.sistema }));
  } catch (error) {
    if (error instanceof ErrorLLM) return fallo(error.message);
    console.error(`Error inesperado del adaptador LLM en la sesión ${estado.sesion.id}: ${error instanceof Error ? error.name : typeof error}`);
    return fallo("Ocurrió un error inesperado al consultar el modelo. Intenta de nuevo; la conversación sigue activa.");
  }
}

function anotarRespuesta(estado: EstadoTurno, respuesta: RespuestaLLM): void {
  estado.sesion.tokensUsados += respuesta.uso.entrada + respuesta.uso.salida;
  estado.sesion.mensajesLLM.push({ rol: "asistente", texto: respuesta.texto, llamadas: respuesta.llamadas, contenidoProveedor: respuesta.contenidoProveedor });
  if (respuesta.texto !== "") estado.ultimoTexto = respuesta.texto;
}

async function recorrerCiclo(estado: EstadoTurno, deps: DependenciasTurno): Promise<Cierre> {
  const registro = deps.registro ?? herramientas;
  const definiciones = definicionesParaModelo(registro);
  for (let iteracion = 0; iteracion < deps.maxIteraciones; iteracion += 1) {
    if (estado.sesion.tokensUsados >= deps.maxTokensSesion) return cierreTopeTokens(estado, deps.maxTokensSesion);
    const consulta = await consultarModelo(estado, deps, definiciones);
    if (!consulta.ok) return { reply: consulta.error, needsConfirmation: false };
    anotarRespuesta(estado, consulta.data);
    if (consulta.data.llamadas.length === 0) return cierreFinal(consulta.data);
    await ejecutarLlamadas(estado, consulta.data.llamadas, registro);
    if (estado.nuevaConfirmacion !== undefined) return cierreConfirmacion(estado, estado.nuevaConfirmacion);
  }
  return cierreTopeIteraciones(estado, deps.maxIteraciones);
}

/**
 * Ejecuta un turno completo sobre la sesión (la modifica en memoria; persistirla es del llamador).
 * Nunca lanza: cualquier fallo termina en un `reply` claro.
 */
export async function ejecutarTurno(sesion: Sesion, mensaje: string, deps: DependenciasTurno): Promise<RespuestaTurno> {
  const estado = iniciarTurno(sesion, mensaje, deps.directory);
  const cierre = await recorrerCiclo(estado, deps);
  if (cierre.needsConfirmation && estado.nuevaConfirmacion !== undefined) sesion.confirmacionPendiente = estado.nuevaConfirmacion;
  sesion.historial.push({ rol: "asistente", texto: cierre.reply, ts: ahoraIso(), toolCalls: estado.toolCalls, needsConfirmation: cierre.needsConfirmation });
  return { reply: cierre.reply, toolCalls: estado.toolCalls, needsConfirmation: cierre.needsConfirmation };
}

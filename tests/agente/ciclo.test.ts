import { existsSync, readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DependenciasTurno } from "../../src/agente/ciclo";
import { ejecutarTurno } from "../../src/agente/ciclo";
import { HERRAMIENTA_CONFIRMACION } from "../../src/agente/herramientas-llm";
import { sesionNueva } from "../../src/agente/sesiones";
import type { Mensaje, MensajeHerramienta } from "../../src/llm/adapter";
import { ErrorLLM } from "../../src/llm/adapter";
import { crearEntorno } from "../apoyo/entorno";
import type { PasoGuion } from "../apoyo/llm-guionizado";
import { crearLLMGuionizado, llamada, pedirHerramientas, responderTexto } from "../apoyo/llm-guionizado";

const CASO = "ec-corp-andina";
const entorno = crearEntorno("ciclo");
afterAll(() => entorno.limpiar());
beforeEach(() => {
  vi.stubEnv("FECHA_REFERENCIA", "2026-09-03");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const campos = (JSON.parse(readFileSync(entorno.rutaReto(`casos/${CASO}/plantilla-campos.json`), "utf8")) as { etiqueta: string }[]).map((c) => c.etiqueta);
const rutaEnvio = (): string => entorno.rutaOut(`${CASO}/ENVIO-SIMULADO.md`);
let contadorSesiones = 0;
const nuevaSesion = () => sesionNueva(`ciclo-${(contadorSesiones += 1)}`);

function deps(pasos: PasoGuion[], extra: Partial<DependenciasTurno> = {}) {
  const adaptador = crearLLMGuionizado(pasos);
  return { adaptador, deps: { adaptador, directory: entorno.raiz, sistema: "SISTEMA DE PRUEBA", maxIteraciones: 25, maxTokensSesion: 200000, ...extra } };
}

const pedirConfirmacion = (caso = CASO) =>
  pedirHerramientas([llamada(HERRAMIENTA_CONFIRMACION, { caso, accion: "simular_envio", resumen: `¿Confirmas que envíe el paquete de ${caso}?` })], "Resumen: paquete armado.");
const enviarConfirmado = (caso = CASO) => pedirHerramientas([llamada("proveedor_simular_envio", { caso, confirmado: true })]);

/** Guion del primer turno del PRD §11: leer → mapear → generar → armar → pedir confirmación. */
const guionProceso = (): PasoGuion[] => [
  pedirHerramientas([llamada("proveedor_leer_solicitud", { caso: CASO })]),
  pedirHerramientas([llamada("proveedor_mapear_campos", { caso: CASO, campos })]),
  pedirHerramientas([llamada("proveedor_generar_formulario", { caso: CASO, mapeo: [] })]),
  pedirHerramientas([llamada("proveedor_armar_paquete", { caso: CASO })]),
  pedirConfirmacion(),
];

const ultimosResultados = (mensajes: Mensaje[]): MensajeHerramienta => mensajes.filter((m): m is MensajeHerramienta => m.rol === "herramienta").at(-1)!;

describe("ejecutarTurno — flujo completo con confirmación (FR9.3, CA3, CA4)", () => {
  it("procesa el caso, pide confirmación y solo con 'sí, envía' escribe ENVIO-SIMULADO.md", async () => {
    const sesion = nuevaSesion();
    const { adaptador, deps: d } = deps([...guionProceso(), enviarConfirmado(), responderTexto("Envío simulado listo.")]);

    const turno1 = await ejecutarTurno(sesion, `Procesa el caso "${CASO}". No envíes nada todavía.`, d);
    expect(turno1.needsConfirmation).toBe(true);
    expect(turno1.toolCalls.map((t) => [t.nombre, t.ok])).toEqual([
      ["proveedor_leer_solicitud", true],
      ["proveedor_mapear_campos", true],
      ["proveedor_generar_formulario", true],
      ["proveedor_armar_paquete", true],
      [HERRAMIENTA_CONFIRMACION, true],
    ]);
    expect(turno1.reply).toContain(`¿Confirmas que envíe el paquete de ${CASO}?`);
    expect(sesion.confirmacionPendiente?.caso).toBe(CASO);
    expect(existsSync(rutaEnvio())).toBe(false);

    const turno2 = await ejecutarTurno(sesion, "sí, envía", d);
    expect(turno2).toMatchObject({ reply: "Envío simulado listo.", needsConfirmation: false });
    expect(turno2.toolCalls).toEqual([expect.objectContaining({ nombre: "proveedor_simular_envio", ok: true })]);
    expect(existsSync(rutaEnvio())).toBe(true);
    expect(adaptador.pendientes()).toBe(0);
    expect(adaptador.recibidos[0]?.herramientas).toContain(HERRAMIENTA_CONFIRMACION);
    expect(adaptador.recibidos[0]?.sistema).toBe("SISTEMA DE PRUEBA");

    const log = readFileSync(entorno.rutaOut(`${CASO}/log.jsonl`), "utf8");
    expect(log).toContain('"herramienta":"proveedor_leer_solicitud"');
    expect(log).toContain(`"herramienta":"${HERRAMIENTA_CONFIRMACION}"`);
    expect(sesion.historial.map((h) => h.rol)).toEqual(["usuario", "asistente", "usuario", "asistente"]);
  });
});

describe("ejecutarTurno — guarda de RN4", () => {
  it("simular_envio confirmado sin confirmación previa queda bloqueado y no escribe archivo", async () => {
    entorno.borrarEnRaiz(`out/${CASO}/ENVIO-SIMULADO.md`);
    const sesion = nuevaSesion();
    const { adaptador, deps: d } = deps([enviarConfirmado(), responderTexto("No pude enviar.")]);
    const turno = await ejecutarTurno(sesion, "envía el paquete de ec-corp-andina", d);
    expect(turno.toolCalls[0]).toMatchObject({ nombre: "proveedor_simular_envio", ok: false });
    expect(turno.toolCalls[0]?.resumen).toMatch(/^requiere confirmación explícita/);
    expect(ultimosResultados(adaptador.recibidos[1]!.mensajes).resultados[0]?.esError).toBe(true);
    expect(existsSync(rutaEnvio())).toBe(false);
  });

  it("la confirmación pendiente caduca si pasa un turno sin usarla", async () => {
    entorno.borrarEnRaiz(`out/${CASO}/ENVIO-SIMULADO.md`);
    const sesion = nuevaSesion();
    const { deps: d } = deps([pedirConfirmacion(), responderTexto("Entendido."), enviarConfirmado(), responderTexto("Bloqueado.")]);
    await ejecutarTurno(sesion, "prepara el envío", d);
    await ejecutarTurno(sesion, "déjame revisar el checklist", d);
    expect(sesion.confirmacionPendiente).toBeUndefined();
    const turno = await ejecutarTurno(sesion, "sí, envía", d);
    expect(turno.toolCalls[0]?.ok).toBe(false);
    expect(existsSync(rutaEnvio())).toBe(false);
  });

  it("un mensaje con reserva o una confirmación de otro caso no autorizan el envío", async () => {
    entorno.borrarEnRaiz(`out/${CASO}/ENVIO-SIMULADO.md`);
    const sesion = nuevaSesion();
    const { deps: d } = deps([pedirConfirmacion("co-industrias-delta"), enviarConfirmado(), responderTexto("Bloqueado.")]);
    await ejecutarTurno(sesion, "prepara el envío", d);
    const turno = await ejecutarTurno(sesion, "sí, envía", d);
    expect(turno.toolCalls[0]?.resumen).toMatch(/es para el caso 'co-industrias-delta'/);
    expect(existsSync(rutaEnvio())).toBe(false);
  });
});

describe("ejecutarTurno — errores y topes (CA1, CA5, NFR3)", () => {
  it("argumentos inválidos vuelven al modelo como error y el ciclo sigue", async () => {
    const { adaptador, deps: d } = deps([pedirHerramientas([llamada("proveedor_leer_solicitud", { caso: 5 })]), responderTexto("Corregí el caso.")]);
    const turno = await ejecutarTurno(nuevaSesion(), "lee la solicitud", d);
    expect(turno.reply).toBe("Corregí el caso.");
    expect(turno.toolCalls[0]).toMatchObject({ ok: false, resumen: expect.stringContaining("Argumentos inválidos") });
    expect(ultimosResultados(adaptador.recibidos[1]!.mensajes).resultados[0]?.esError).toBe(true);
  });

  it("al llegar al tope de iteraciones responde con lo hecho y lo que falta", async () => {
    const leer = () => pedirHerramientas([llamada("proveedor_leer_solicitud", { caso: CASO })]);
    const { adaptador, deps: d } = deps([leer, leer, leer, leer], { maxIteraciones: 3 });
    const turno = await ejecutarTurno(nuevaSesion(), "procesa", d);
    expect(turno.toolCalls).toHaveLength(3);
    expect(turno.reply).toMatch(/tope de 3 pasos/);
    expect(turno.reply).toMatch(/Hecho: proveedor_leer_solicitud \(ok\)/);
    expect(adaptador.pendientes()).toBe(1);
  });

  it("al llegar al tope de tokens de la sesión responde claro y no vuelve a llamar al modelo", async () => {
    const caro = pedirHerramientas([llamada("proveedor_leer_solicitud", { caso: CASO })], "", { entrada: 900, salida: 200 });
    const { adaptador, deps: d } = deps([caro, responderTexto("no debería llegar")], { maxTokensSesion: 1000 });
    const sesion = nuevaSesion();
    const turno = await ejecutarTurno(sesion, "procesa", d);
    expect(turno.reply).toMatch(/tope de 1000 tokens/);
    expect(sesion.tokensUsados).toBe(1100);
    expect(adaptador.recibidos).toHaveLength(1);
  });

  it("un ErrorLLM de timeout da un reply claro y la sesión acepta otro mensaje", async () => {
    const timeout = new ErrorLLM("timeout", "El modelo no respondió a tiempo. Intenta de nuevo en un momento; la conversación sigue activa.");
    const { deps: d } = deps([timeout, responderTexto("Hola de nuevo.")]);
    const sesion = nuevaSesion();
    const turno1 = await ejecutarTurno(sesion, "hola", d);
    expect(turno1).toEqual({ reply: timeout.message, toolCalls: [], needsConfirmation: false });
    const turno2 = await ejecutarTurno(sesion, "¿sigues ahí?", d);
    expect(turno2.reply).toBe("Hola de nuevo.");
    expect(sesion.historial).toHaveLength(4);
  });

  it("un rechazo del proveedor se explica en lenguaje claro", async () => {
    const { deps: d } = deps([{ texto: "", llamadas: [], uso: { entrada: 1, salida: 1 }, motivoFin: "rechazo" }]);
    const turno = await ejecutarTurno(nuevaSesion(), "algo", d);
    expect(turno.reply).toMatch(/declinó responder/);
  });
});

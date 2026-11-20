import { describe, expect, it } from "vitest";
import { autorizarEnvio, ERROR_SIN_CONFIRMACION, esConfirmacion } from "../../src/agente/confirmacion";
import type { ConfirmacionPendiente } from "../../src/agente/tipos";

const pendiente: ConfirmacionPendiente = { caso: "ec-corp-andina", accion: "simular_envio", resumen: "¿Confirmas el envío?" };

describe("esConfirmacion", () => {
  it.each(["sí, envía", "Si", "confirmo", "Envíalo", "adelante", "procede", "de acuerdo", "OK"])("'%s' confirma", (texto) => {
    expect(esConfirmacion(texto)).toBe(true);
  });

  it.each(["no envíes todavía", "espera", "sí, pero cambia el banco", "aún no", "revisa el checklist", ""])("'%s' no confirma", (texto) => {
    expect(esConfirmacion(texto)).toBe(false);
  });
});

describe("autorizarEnvio", () => {
  it("autoriza con confirmación pendiente del mismo caso y mensaje afirmativo", () => {
    expect(autorizarEnvio(pendiente, "ec-corp-andina", "sí, envía")).toEqual({ ok: true, data: pendiente });
  });

  it("falla sin acción pendiente", () => {
    const r = autorizarEnvio(undefined, "ec-corp-andina", "sí, envía");
    expect(!r.ok && r.error).toMatch(new RegExp(`^${ERROR_SIN_CONFIRMACION}`));
  });

  it("falla si la confirmación pendiente es de otro caso", () => {
    const r = autorizarEnvio(pendiente, "co-industrias-delta", "sí, envía");
    expect(!r.ok && r.error).toMatch(/es para el caso 'ec-corp-andina'/);
  });

  it("falla si el mensaje no confirma", () => {
    expect(autorizarEnvio(pendiente, "ec-corp-andina", "no envíes todavía").ok).toBe(false);
  });
});

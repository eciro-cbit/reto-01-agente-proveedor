import { describe, expect, it } from "vitest";
import { leerConfig } from "../../src/config";
import { ErrorLLM } from "../../src/llm/adapter";

describe("leerConfig", () => {
  it("aplica los valores por defecto con un entorno vacío", () => {
    const r = leerConfig({});
    expect(r).toEqual({
      ok: true,
      data: {
        claveApi: undefined,
        modelo: "claude-sonnet-5-5",
        timeoutMs: 60000,
        maxIteraciones: 25,
        maxTokensSesion: 200000,
        puerto: 3000,
        claveAcceso: undefined,
        limitePeticionesMinuto: 20,
      },
    });
  });

  it("lee CLAVE_ACCESO y LIMITE_PETICIONES_MINUTO", () => {
    const r = leerConfig({ CLAVE_ACCESO: "prueba-local-123", LIMITE_PETICIONES_MINUTO: "5" });
    expect(r.ok && r.data).toMatchObject({ claveAcceso: "prueba-local-123", limitePeticionesMinuto: 5 });
  });

  it("una CLAVE_ACCESO corta se rechaza con un error claro que no la repite", () => {
    const r = leerConfig({ CLAVE_ACCESO: "corta1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^Configuración inválida: CLAVE_ACCESO: debe tener al menos 8 caracteres/);
    expect(!r.ok && r.error).not.toContain("corta1");
  });

  it("LIMITE_PETICIONES_MINUTO en 0 se rechaza", () => {
    const r = leerConfig({ LIMITE_PETICIONES_MINUTO: "0" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/LIMITE_PETICIONES_MINUTO/);
  });

  it("lee los valores definidos y trata los vacíos como no definidos", () => {
    const r = leerConfig({ ANTHROPIC_API_KEY: "sk-ant-prueba-no-real", LLM_MODELO: "claude-haiku-5-5", MAX_ITERACIONES: "5", LLM_TIMEOUT_MS: "", PORT: " " });
    expect(r.ok && r.data).toMatchObject({ claveApi: "sk-ant-prueba-no-real", modelo: "claude-haiku-5-5", maxIteraciones: 5, timeoutMs: 60000, puerto: 3000 });
  });

  it("un número inválido en MAX_ITERACIONES da un error claro", () => {
    const r = leerConfig({ MAX_ITERACIONES: "muchas" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^Configuración inválida: MAX_ITERACIONES/);
  });

  it("un tope por debajo del mínimo se rechaza", () => {
    const r = leerConfig({ MAX_ITERACIONES: "0" });
    expect(r.ok).toBe(false);
  });

  it("la ausencia de ANTHROPIC_API_KEY no rompe la carga", () => {
    const r = leerConfig({ ANTHROPIC_API_KEY: "" });
    expect(r.ok && r.data.claveApi).toBeUndefined();
  });
});

describe("ErrorLLM", () => {
  it("conserva el tipo y el mensaje en español", () => {
    const error = new ErrorLLM("timeout", "El modelo tardó demasiado");
    expect(error).toBeInstanceOf(Error);
    expect(error.tipo).toBe("timeout");
    expect(error.message).toBe("El modelo tardó demasiado");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `sesion.ts` guarda el id en una variable de módulo: cada prueba importa una copia nueva.
async function cargarModulo() {
  vi.resetModules();
  return import("./sesion");
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sessionId en localStorage", () => {
  it("crea un id válido, lo guarda y lo reutiliza", async () => {
    const { obtenerSessionId, CLAVE_SESION } = await cargarModulo();
    const id = obtenerSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(localStorage.getItem(CLAVE_SESION)).toBe(id);
    expect(obtenerSessionId()).toBe(id);
  });

  it("al recargar (módulo nuevo) recupera el id guardado", async () => {
    const primero = (await cargarModulo()).obtenerSessionId();
    const segundo = (await cargarModulo()).obtenerSessionId();
    expect(segundo).toBe(primero);
  });

  it("un valor guardado inválido se descarta y se crea otro id", async () => {
    const { obtenerSessionId, CLAVE_SESION } = await cargarModulo();
    localStorage.setItem(CLAVE_SESION, "../fuera de patrón");
    const id = obtenerSessionId();
    expect(id).not.toBe("../fuera de patrón");
    expect(localStorage.getItem(CLAVE_SESION)).toBe(id);
  });

  it("reiniciar genera un id distinto", async () => {
    const { obtenerSessionId, reiniciarSessionId } = await cargarModulo();
    const antes = obtenerSessionId();
    const despues = reiniciarSessionId();
    expect(despues).not.toBe(antes);
    expect(obtenerSessionId()).toBe(despues);
  });

  it("si localStorage lanza, el id vive en memoria y no rompe", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const roto = {
      getItem: () => {
        throw new DOMException("bloqueado", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("bloqueado", "SecurityError");
      },
    };
    vi.stubGlobal("localStorage", roto);
    const { obtenerSessionId } = await cargarModulo();
    const id = obtenerSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(obtenerSessionId()).toBe(id);
    expect(console.warn).toHaveBeenCalled();
  });
});

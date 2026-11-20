import { describe, expect, it } from "vitest";
import type { SoporteIndice } from "../../src/dominio/esquemas";
import { estadoSoporte, fechaLocal, resolverFechaReferencia } from "../../src/dominio/vigencia";

const soporte = (vigencia_hasta: string | null): SoporteIndice => ({
  tipo: "camara_comercio",
  archivo: "camara-comercio-2026-08.txt",
  vigencia_hasta,
  pais_emisor: "CO",
  descripcion: "Certificado de existencia",
});

const AHORA = new Date(2026, 10, 20, 9, 30);

describe("vigencia de soportes", () => {
  it("un soporte sin fecha de vigencia (null) nunca vence", () => {
    expect(estadoSoporte(soporte(null), "2099-01-01")).toBe("vigente");
  });

  it("vence el día siguiente a vigencia_hasta, no el mismo día", () => {
    expect(estadoSoporte(soporte("2026-09-30"), "2026-09-30")).toBe("vigente");
    expect(estadoSoporte(soporte("2026-09-29"), "2026-09-30")).toBe("vencido");
  });

  it("sin entrada en el índice el soporte está ausente", () => {
    expect(estadoSoporte(undefined, "2026-09-03")).toBe("ausente");
  });

  it("FECHA_REFERENCIA válida tiene prioridad sobre la fecha del sistema", () => {
    expect(resolverFechaReferencia({ FECHA_REFERENCIA: "2026-09-03" }, AHORA)).toEqual({ ok: true, data: "2026-09-03" });
  });

  it("sin FECHA_REFERENCIA (o vacía) usa la fecha local del sistema", () => {
    expect(resolverFechaReferencia({}, AHORA)).toEqual({ ok: true, data: "2026-11-20" });
    expect(resolverFechaReferencia({ FECHA_REFERENCIA: "  " }, AHORA)).toEqual({ ok: true, data: fechaLocal(AHORA) });
  });

  it("FECHA_REFERENCIA inválida devuelve un error claro", () => {
    for (const invalida of ["03/09/2026", "2026-02-30", "mañana"]) {
      const resultado = resolverFechaReferencia({ FECHA_REFERENCIA: invalida }, AHORA);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.error).toContain("use el formato AAAA-MM-DD");
    }
  });
});

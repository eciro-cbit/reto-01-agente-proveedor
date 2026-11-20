import { beforeAll, describe, expect, it } from "vitest";
import type { Repositorio } from "../../src/dominio/fixtures";
import { etiquetasDePlantilla, leerCaso, leerRepositorio } from "../../src/dominio/fixtures";
import { mapearCampo, mapearCampos, normalizar, resolverRuta, type ContextoMapeo } from "../../src/dominio/mapeo";
import { crearEntorno } from "../apoyo/entorno";

const entorno = crearEntorno("mapeo");
let repo: Repositorio;

beforeAll(async () => {
  const leido = await leerRepositorio(entorno.ctx);
  if (!leido.ok) throw new Error(leido.error);
  repo = leido.data;
  return () => entorno.limpiar();
});

const contexto = (pais: string): ContextoMapeo => ({ pais, maestro: repo.maestro, glosario: repo.glosario });

describe("mapeo de campos (oráculo tabla 2.4)", () => {
  it.each([
    { caso: "co-industrias-delta", llenos: 17, confirmar: 0, faltantes: 0 },
    { caso: "ec-corp-andina", llenos: 13, confirmar: 1, faltantes: 1 },
    { caso: "hn-agroexport-sula", llenos: 9, confirmar: 1, faltantes: 1 },
    { caso: "pa-logistica-istmo", llenos: 8, confirmar: 1, faltantes: 0 },
  ])("$caso: $llenos llenos, $confirmar por confirmar, $faltantes faltantes", async ({ caso, llenos, confirmar, faltantes }) => {
    const leido = await leerCaso(entorno.ctx, caso);
    if (!leido.ok) throw new Error(leido.error);
    const resultado = mapearCampos(etiquetasDePlantilla(leido.data.plantilla), contexto(leido.data.solicitud.pais));
    expect(resultado.llenos).toHaveLength(llenos);
    expect(resultado.requiere_confirmacion).toHaveLength(confirmar);
    expect(resultado.faltantes).toHaveLength(faltantes);
    for (const campo of [...resultado.llenos, ...resultado.requiere_confirmacion]) {
      expect(campo.valor).toBe(resolverRuta(repo.maestro, campo.ruta ?? ""));
    }
  });

  it("resuelve etiquetas sin tildes ni mayúsculas con confianza 0.95", () => {
    const campo = mapearCampo("NOMBRE DE LA EMPRESA", contexto("CO"));
    expect(normalizar("  Número   de Cuenta ")).toBe("numero de cuenta");
    expect(campo).toMatchObject({ estado: "lleno", ruta: "razon_social", confianza: 0.95, valor: "Periferia IT Group S.A.S." });
  });

  it("pide confirmación cuando la similitud es menor a 0.8", () => {
    const campo = mapearCampo("Teléfono principal", contexto("CO"));
    expect(campo.estado).toBe("requiere_confirmacion");
    expect(campo.ruta).toBe("telefono");
    expect(campo.confianza).toBeLessThan(0.8);
    expect(campo.nota).toContain("coincidencia aproximada");
  });

  it("deja faltante, sin valor, lo que no existe en el maestro", () => {
    const referencias = mapearCampo("Referencias comerciales", contexto("HN"));
    expect(referencias.estado).toBe("faltante");
    expect(referencias.valor).toBeUndefined();
    const contribuyente = mapearCampo("Número de contribuyente especial", contexto("EC"));
    expect(contribuyente.estado).toBe("faltante");
    expect(contribuyente.valor).toBeUndefined();
  });

  it("RN1: RUC en EC se llena con el NIT y pide confirmación; NIT en CO queda lleno", () => {
    const ruc = mapearCampo("RUC", contexto("EC"));
    expect(ruc).toMatchObject({ estado: "requiere_confirmacion", ruta: "nit", valor: "900123456" });
    expect(ruc.nota).toContain("identificador extranjero (se esperaba RUC)");
    const rtn = mapearCampo("RTN", contexto("HN"));
    expect(rtn.nota).toContain("se esperaba RTN");
    expect(mapearCampo("NIT", contexto("CO"))).toMatchObject({ estado: "lleno", valor: "900123456", confianza: 1 });
  });

  it("etiqueta genérica de identificador pide confirmación y propone el del país", () => {
    const enCo = mapearCampo("Identificación tributaria", contexto("CO"));
    expect(enCo.estado).toBe("requiere_confirmacion");
    expect(enCo.nota).toContain("para CO se propone NIT");
    const enHn = mapearCampo("Número de identificación fiscal", contexto("HN"));
    expect(enHn.nota).toContain("para HN se propone RTN");
  });

  it("conserva números y anota la moneda de los ingresos", () => {
    const ingresos = mapearCampo("Ingresos anuales", contexto("HN"));
    expect(ingresos.valor).toBe(98000000000);
    expect(ingresos.nota).toBe("moneda COP, año 2025");
    expect(resolverRuta(repo.maestro, "certificaciones")).toBeUndefined();
    expect(resolverRuta(repo.maestro, "banco.inexistente")).toBeUndefined();
  });
});

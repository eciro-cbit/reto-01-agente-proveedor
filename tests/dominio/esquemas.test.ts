import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describirErrorZod,
  esquemaGlosario,
  esquemaIndiceSoportes,
  esquemaMaestro,
  esquemaPlantillaCampos,
  esquemaPlantillaCeldas,
  esquemaSoportesExigidos,
  esquemaSolicitud,
} from "../../src/dominio/esquemas";
import { RAIZ_PROYECTO } from "../apoyo/entorno";

const RETO = join(RAIZ_PROYECTO, "fixtures", "reto-01");
const leer = (relativa: string): unknown => JSON.parse(readFileSync(join(RETO, relativa), "utf8"));

const CASOS = [
  { caso: "co-industrias-delta", plantilla: "plantilla-celdas.json" },
  { caso: "ec-corp-andina", plantilla: "plantilla-campos.json" },
  { caso: "hn-agroexport-sula", plantilla: "plantilla-celdas.json" },
  { caso: "pa-logistica-istmo", plantilla: "plantilla-campos.json" },
] as const;

describe("esquemas de fixtures", () => {
  it.each(CASOS)("valida solicitud, plantilla y soportes de $caso", ({ caso, plantilla }) => {
    expect(esquemaSolicitud.safeParse(leer(`casos/${caso}/solicitud.json`)).success).toBe(true);
    const esquema = plantilla === "plantilla-celdas.json" ? esquemaPlantillaCeldas : esquemaPlantillaCampos;
    expect(esquema.safeParse(leer(`casos/${caso}/${plantilla}`)).success).toBe(true);
    expect(esquemaSoportesExigidos.safeParse(leer(`casos/${caso}/soportes-exigidos.json`)).success).toBe(true);
  });

  it("valida el repositorio real (maestro, índice de soportes y glosario)", () => {
    const maestro = esquemaMaestro.parse(leer("repositorio/maestro.json"));
    expect(maestro["nit"]).toBe("900123456");
    expect(esquemaIndiceSoportes.parse(leer("repositorio/soportes/index.json"))).toHaveLength(6);
    expect(Object.keys(esquemaGlosario.parse(leer("glosario-campos.json")))).toHaveLength(38);
  });

  it("rechaza un formato desconocido con mensaje legible", () => {
    const solicitud = { ...(leer("casos/co-industrias-delta/solicitud.json") as object), formato: "docx" };
    const resultado = esquemaSolicitud.safeParse(solicitud);
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const mensaje = describirErrorZod(resultado.error);
      expect(mensaje).toMatch(/^formato: /);
      expect(mensaje).toMatch(/xlsx/);
    }
  });

  it("rechaza una celda vacía en la plantilla con la ruta del problema", () => {
    const plantilla = leer("casos/co-industrias-delta/plantilla-celdas.json") as Array<Record<string, string>>;
    const rota = plantilla.map((celda, i) => (i === 2 ? { ...celda, celda_valor: "" } : celda));
    const resultado = esquemaPlantillaCeldas.safeParse(rota);
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(describirErrorZod(resultado.error)).toMatch(/^2\.celda_valor: .*C3/);
    }
  });

  it("rechaza una plantilla vacía", () => {
    const resultado = esquemaPlantillaCampos.safeParse([]);
    expect(resultado.success).toBe(false);
    if (!resultado.success) expect(describirErrorZod(resultado.error)).toContain("no tiene campos");
  });
});

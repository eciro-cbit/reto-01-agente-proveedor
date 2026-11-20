import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cargarSistema } from "../../src/agente/prompt";
import { crearEntorno, RAIZ_PROYECTO } from "../apoyo/entorno";

/** Frase distintiva de la prohibición CA2 en `agent/prompt.md`. */
const FRASE_CA2 = "Nunca afirmes un valor que no haya salido de una herramienta";
/** Frase distintiva del conocimiento en `src/knowledge/registro-proveedor.md`. */
const FRASE_CONOCIMIENTO = "Identificador tributario por país";

const entornos = [crearEntorno("prompt"), crearEntorno("prompt-sin"), crearEntorno("prompt-sin-con")];
afterAll(() => entornos.forEach((e) => e.limpiar()));

function archivosTs(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) return archivosTs(ruta);
    return e.name.endsWith(".ts") ? [ruta] : [];
  });
}

describe("cargarSistema", () => {
  it("arma el system prompt con el comportamiento seguido del conocimiento", async () => {
    const r = await cargarSistema(entornos[0]!.raiz);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toContain(FRASE_CA2);
    expect(r.data).toContain(FRASE_CONOCIMIENTO);
    expect(r.data.indexOf(FRASE_CA2)).toBeLessThan(r.data.indexOf(FRASE_CONOCIMIENTO));
  });

  it("sin agent/prompt.md devuelve un error claro", async () => {
    entornos[1]!.borrarEnRaiz("agent/prompt.md");
    const r = await cargarSistema(entornos[1]!.raiz);
    expect(r).toEqual({ ok: false, error: "No se encontró agent/prompt.md: el agente no puede arrancar sin él" });
  });

  it("sin el conocimiento devuelve un error claro", async () => {
    entornos[2]!.borrarEnRaiz("src/knowledge/registro-proveedor.md");
    const r = await cargarSistema(entornos[2]!.raiz);
    expect(!r.ok && r.error).toMatch(/src\/knowledge\/registro-proveedor\.md/);
  });

  it("ningún archivo .ts de src/ contiene el texto del prompt ni del conocimiento", () => {
    const archivos = archivosTs(join(RAIZ_PROYECTO, "src"));
    expect(archivos.length).toBeGreaterThan(0);
    const conTexto = archivos.filter((a) => {
      const contenido = readFileSync(a, "utf8");
      return contenido.includes(FRASE_CA2) || contenido.includes(FRASE_CONOCIMIENTO);
    });
    expect(conTexto).toEqual([]);
  });
});

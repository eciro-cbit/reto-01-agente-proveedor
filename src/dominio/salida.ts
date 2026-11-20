import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import type { ContextoHerramienta } from "../tools/tipos";
import { dentroDe } from "./fixtures";

/** Raíz de escritura: `<ctx.directory>/out` (NFR7). */
export function raizOut(ctx: ContextoHerramienta): string {
  return resolve(ctx.directory, "out");
}

/** Resuelve una ruta bajo `out/`; falla si escapa de ella. */
export function rutaEnOut(ctx: ContextoHerramienta, ...partes: string[]): string {
  const base = raizOut(ctx);
  const ruta = resolve(base, ...partes);
  if (!dentroDe(base, ruta)) throw new Error("Ruta fuera de out/ rechazada");
  return ruta;
}

/** Carpeta de salida de un caso: `out/<caso>/`. */
export function rutaCasoOut(ctx: ContextoHerramienta, caso: string, ...partes: string[]): string {
  return rutaEnOut(ctx, caso, ...partes);
}

/** Crea la carpeta (y las intermedias) si no existe. */
export async function asegurarCarpeta(ruta: string): Promise<void> {
  await mkdir(ruta, { recursive: true });
}

/** Crea la carpeta que contendrá `rutaArchivo`. */
export async function asegurarCarpetaDe(rutaArchivo: string): Promise<void> {
  await asegurarCarpeta(dirname(rutaArchivo));
}

/** Borra `out/` completo, solo si la ruta resuelta es `<ctx.directory>/out`. */
export async function limpiarOut(ctx: ContextoHerramienta): Promise<void> {
  const out = raizOut(ctx);
  const esOutDelProyecto = basename(out) === "out" && dentroDe(ctx.directory, out) && out !== resolve(ctx.directory);
  if (!esOutDelProyecto) throw new Error("Se rechazó limpiar una carpeta que no es out/ del proyecto");
  await rm(out, { recursive: true, force: true });
}

/** Ruta relativa al proyecto con barras '/', para mostrar al usuario. */
export function rutaVisible(ctx: ContextoHerramienta, rutaAbsoluta: string): string {
  return relative(resolve(ctx.directory), rutaAbsoluta).split(sep).join("/");
}

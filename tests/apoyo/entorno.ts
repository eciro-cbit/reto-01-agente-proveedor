import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { ContextoHerramienta } from "../../src/tools/tipos";

/** Raíz del proyecto (dos niveles arriba de tests/apoyo). */
export const RAIZ_PROYECTO = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const RAIZ_TMP = join(RAIZ_PROYECTO, "tests", ".tmp");

export interface Entorno {
  ctx: ContextoHerramienta;
  /** Directorio aislado que actúa como `ctx.directory`. */
  raiz: string;
  /** Ruta absoluta dentro de la copia de `fixtures/reto-01/`. */
  rutaReto(relativa: string): string;
  /** Sobrescribe un archivo dentro de la copia de `fixtures/reto-01/` (casos rotos). */
  escribirEnReto(relativa: string, contenido: string): void;
  /** Elimina un archivo dentro de la copia de `fixtures/reto-01/`. */
  borrarEnReto(relativa: string): void;
  /** Ruta absoluta dentro de `out/` del entorno. */
  rutaOut(relativa: string): string;
  /** Elimina un archivo relativo a la raíz del entorno (p. ej. `agent/prompt.md`). */
  borrarEnRaiz(relativa: string): void;
  limpiar(): void;
}

/** Copias de conocimiento y prompt que necesitan el ciclo y la API (Bolt 2). */
const COPIAS_AGENTE = [join("agent"), join("src", "knowledge")];

/**
 * Crea `tests/.tmp/<id>/` con una copia de `fixtures/`, `agent/` y `src/knowledge/`;
 * los originales nunca se tocan.
 */
export function crearEntorno(prefijo = "t"): Entorno {
  const raiz = join(RAIZ_TMP, `${prefijo}-${randomUUID().slice(0, 8)}`);
  mkdirSync(raiz, { recursive: true });
  cpSync(join(RAIZ_PROYECTO, "fixtures"), join(raiz, "fixtures"), { recursive: true });
  for (const carpeta of COPIAS_AGENTE) {
    if (existsSync(join(RAIZ_PROYECTO, carpeta))) cpSync(join(RAIZ_PROYECTO, carpeta), join(raiz, carpeta), { recursive: true });
  }
  const reto = join(raiz, "fixtures", "reto-01");
  return {
    ctx: { directory: raiz, sessionId: `sesion-${prefijo}` },
    raiz,
    rutaReto: (relativa) => join(reto, relativa),
    escribirEnReto(relativa, contenido) {
      const destino = join(reto, relativa);
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, contenido, "utf8");
    },
    borrarEnReto(relativa) {
      rmSync(join(reto, relativa), { force: true });
    },
    rutaOut: (relativa) => join(raiz, "out", relativa),
    borrarEnRaiz(relativa) {
      rmSync(join(raiz, relativa), { force: true });
    },
    limpiar() {
      if (existsSync(raiz)) rmSync(raiz, { recursive: true, force: true });
    },
  };
}

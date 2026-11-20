/**
 * demo.ts — verificación sin modelo (§6.6 del PRD).
 * Limpia out/, recorre los casos de fixtures/reto-01/casos/ llamando a las herramientas por el runner
 * (validación zod + registro en log.jsonl) e imprime un resumen por caso con la fecha de referencia.
 *
 *   npm run demo                               (Node + tsx)
 *   bun run demo.ts                            (Bun)
 *   FECHA_REFERENCIA=2026-09-03 npm run demo   (escenario del PRD)
 */
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { limpiarOut } from "./src/dominio/salida";
import { resolverFechaReferencia, type Entorno } from "./src/dominio/vigencia";
import { ejecutarHerramienta, leerResultado } from "./src/tools/runner";
import type { ContextoHerramienta, Resultado } from "./src/tools/tipos";
import { exito, mensajeDeError } from "./src/tools/tipos";

export interface ResumenCaso {
  caso: string;
  ok: boolean;
  error?: string;
  formato?: string;
  llenos?: number;
  faltantes?: number;
  por_confirmar?: number;
  soportes_vencidos?: string[];
  soportes_ausentes?: string[];
  listo_para_firma?: boolean;
  formulario?: string;
  aviso?: string;
  paquete?: string;
  envio_sin_confirmar?: string;
  envio?: string;
}

export interface ResumenDemo {
  fecha_referencia: string;
  origen_fecha: "FECHA_REFERENCIA" | "fecha del sistema";
  casos: ResumenCaso[];
}

export interface OpcionesDemo {
  /** Raíz del proyecto (contiene fixtures/ y out/). */
  directory: string;
  /** Casos a ejecutar; por defecto todos los de fixtures/reto-01/casos/ en orden alfabético. */
  casos?: readonly string[];
  /** Variables de entorno; `FECHA_REFERENCIA` se aplica a las herramientas durante la ejecución. */
  env?: Entorno;
}

type Datos = Record<string, unknown>;

/** Llama una herramienta por el runner y devuelve `data` o lanza el error para cortar el caso. */
async function llamar(nombre: string, args: Datos, ctx: ContextoHerramienta): Promise<Datos> {
  const resultado = leerResultado(await ejecutarHerramienta(nombre, args, ctx));
  if (!resultado.ok) throw new Error(`${nombre}: ${resultado.error}`);
  return resultado.data as Datos;
}

const lista = (valor: unknown): Datos[] => (Array.isArray(valor) ? (valor as Datos[]) : []);
const texto = (valor: unknown): string | undefined => (typeof valor === "string" ? valor : undefined);

function soportesCon(paquete: Datos, estado: string): string[] {
  const checklist = paquete["checklist"] as Datos | undefined;
  return lista(checklist?.["soportes"])
    .filter((s) => s["estado"] === estado)
    .map((s) => String(s["tipo"]));
}

/** Mapeo que envía el "agente": solo etiqueta y ruta de los campos con fuente. */
function mapeoDesde(mapeo: Datos): Datos[] {
  return [...lista(mapeo["llenos"]), ...lista(mapeo["requiere_confirmacion"])].map((c) => ({ etiqueta: c["etiqueta"], ruta: c["ruta"] }));
}

async function ejecutarCaso(caso: string, ctx: ContextoHerramienta): Promise<ResumenCaso> {
  const solicitud = await llamar("proveedor_leer_solicitud", { caso }, ctx);
  const mapeo = await llamar("proveedor_mapear_campos", { caso, campos: solicitud["campos"] }, ctx);
  const formulario = await llamar("proveedor_generar_formulario", { caso, mapeo: mapeoDesde(mapeo) }, ctx);
  const paquete = await llamar("proveedor_armar_paquete", { caso }, ctx);
  const sinConfirmar = leerResultado(await ejecutarHerramienta("proveedor_simular_envio", { caso, confirmado: false }, ctx));
  const envio = await llamar("proveedor_simular_envio", { caso, confirmado: true }, ctx);
  const resumen: ResumenCaso = {
    caso,
    ok: true,
    formato: texto(solicitud["formato"]),
    llenos: lista(mapeo["llenos"]).length,
    faltantes: lista(mapeo["faltantes"]).length,
    por_confirmar: lista(mapeo["requiere_confirmacion"]).length,
    soportes_vencidos: soportesCon(paquete, "vencido"),
    soportes_ausentes: soportesCon(paquete, "ausente"),
    listo_para_firma: paquete["listo_para_firma"] === true,
    formulario: texto(formulario["ruta"]),
    paquete: texto(paquete["ruta"]),
    envio_sin_confirmar: sinConfirmar.ok ? "aceptado (inesperado)" : `rechazado (${sinConfirmar.error})`,
    envio: texto(envio["ruta"]),
  };
  const aviso = texto(formulario["aviso"]);
  return aviso === undefined ? resumen : { ...resumen, aviso };
}

async function casosDisponibles(directory: string): Promise<string[]> {
  const entradas = await readdir(resolve(directory, "fixtures", "reto-01", "casos"), { withFileTypes: true });
  return entradas.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/** Aplica `FECHA_REFERENCIA` del entorno dado a las herramientas mientras dura `trabajo`. */
async function conFechaReferencia<T>(env: Entorno, trabajo: () => Promise<T>): Promise<T> {
  const anterior = process.env["FECHA_REFERENCIA"];
  const valor = env["FECHA_REFERENCIA"];
  if (valor === undefined) delete process.env["FECHA_REFERENCIA"];
  else process.env["FECHA_REFERENCIA"] = valor;
  try {
    return await trabajo();
  } finally {
    if (anterior === undefined) delete process.env["FECHA_REFERENCIA"];
    else process.env["FECHA_REFERENCIA"] = anterior;
  }
}

/** Ejecuta la demo completa; un caso que falla no detiene los siguientes (FR8.3). */
export async function ejecutarDemo(opciones: OpcionesDemo): Promise<Resultado<ResumenDemo>> {
  const env = opciones.env ?? process.env;
  const fecha = resolverFechaReferencia(env, new Date());
  if (!fecha.ok) return fecha;
  const ctx: ContextoHerramienta = { directory: opciones.directory, sessionId: "demo" };
  await limpiarOut(ctx);
  const casos = opciones.casos ?? (await casosDisponibles(opciones.directory));
  const resumenes = await conFechaReferencia(env, async () => {
    const acumulados: ResumenCaso[] = [];
    for (const caso of casos) {
      acumulados.push(await ejecutarCaso(caso, ctx).catch((error: unknown) => ({ caso, ok: false, error: mensajeDeError(error) })));
    }
    return acumulados;
  });
  const origen = env["FECHA_REFERENCIA"]?.trim() ? "FECHA_REFERENCIA" : "fecha del sistema";
  return exito({ fecha_referencia: fecha.data, origen_fecha: origen, casos: resumenes });
}

const ningunoSi = (items: readonly string[] | undefined): string => (items && items.length > 0 ? items.join(", ") : "ninguno");

function formatearCaso(r: ResumenCaso): string[] {
  if (!r.ok) return [`== ${r.caso} ==`, `  ERROR: ${r.error ?? "desconocido"}`, ""];
  return [
    `== ${r.caso} (${r.formato ?? "?"}) ==`,
    `  Campos: ${r.llenos} llenos, ${r.faltantes} faltantes, ${r.por_confirmar} por confirmar`,
    `  Soportes vencidos: ${ningunoSi(r.soportes_vencidos)} | ausentes: ${ningunoSi(r.soportes_ausentes)}`,
    `  Listo para firma: ${r.listo_para_firma ? "sí" : "no"}`,
    `  Formulario: ${r.formulario ?? "-"}${r.aviso ? ` (${r.aviso})` : ""}`,
    `  Paquete: ${r.paquete ?? "-"}`,
    `  Envío sin confirmar: ${r.envio_sin_confirmar ?? "-"}`,
    `  Envío confirmado: ${r.envio ?? "-"}`,
    "",
  ];
}

/** Texto del resumen que imprime la demo. */
export function formatearResumen(resumen: ResumenDemo): string {
  const fallidos = resumen.casos.filter((c) => !c.ok).length;
  return [
    "Demo — Agente Registro como Proveedor (sin modelo)",
    `Fecha de referencia: ${resumen.fecha_referencia} (${resumen.origen_fecha})`,
    `Casos: ${resumen.casos.length} (${resumen.casos.length - fallidos} correctos, ${fallidos} con error)`,
    "",
    ...resumen.casos.flatMap(formatearCaso),
  ].join("\n");
}

async function principal(): Promise<void> {
  const raiz = resolve(fileURLToPath(new URL(".", import.meta.url)));
  const resultado = await ejecutarDemo({ directory: raiz });
  if (!resultado.ok) {
    console.error(`No se pudo ejecutar la demo: ${resultado.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(formatearResumen(resultado.data));
  if (resultado.data.casos.some((c) => !c.ok)) process.exitCode = 1;
}

const esPrincipal = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  principal().catch((error: unknown) => {
    console.error(`La demo terminó con un error inesperado: ${mensajeDeError(error)}`);
    process.exitCode = 1;
  });
}

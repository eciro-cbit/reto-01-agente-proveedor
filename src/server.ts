/**
 * API HTTP del agente (§6.4 del PRD, FR10). Solo traduce HTTP ↔ `ejecutarTurno`; no contiene reglas de negocio.
 *
 * Contrato:
 * - `POST /api/chat`   cuerpo `{ sessionId: string (^[A-Za-z0-9_-]{1,64}$), message: string (1–8000) }`
 *                      → 200 `{ reply, toolCalls: [{ nombre, argumentos, resumen, ok }], needsConfirmation }`.
 *                      Un error del proveedor LLM también responde 200 con un `reply` claro (la sesión sigue viva).
 *                      Cuerpo inválido → 400 `{ error: { code, message } }`.
 * - `GET /api/sessions/:id` → 200 `{ id, creada, historial, confirmacionPendiente, tokensUsados }`;
 *                      404 si no existe; 400 si el id es inválido.
 * - `GET /api/health`  → 200 `{ ok: true, provider, model, requiereClave }`. Nunca expone ninguna clave. Público.
 * Código de acceso (despliegue): si `CLAVE_ACCESO` está definida, `/api/chat` y `/api/sessions/*` exigen el header
 * `x-clave-acceso`; sin él o con otro valor → 401 `{ error: { code: "CLAVE_REQUERIDA" | "CLAVE_INVALIDA", message } }`.
 * Límite por IP: `POST /api/chat` admite `LIMITE_PETICIONES_MINUTO` por minuto; luego 429 con `Retry-After` y
 * `{ error: { code: "DEMASIADAS_SOLICITUDES", message, esperaSegundos } }`. El límite va antes del código de acceso
 * para frenar también los intentos de adivinarlo.
 * Errores no previstos → 500 `{ error: { code: "ERROR_INTERNO", message } }` sin traza.
 * CORS solo para el front en desarrollo (`http://localhost:5173`).
 * Front (NFR6): si existe el build `web/dist` (`npm run build`), el mismo servidor lo sirve en las rutas que no son
 * `/api/*`, con `index.html` como respaldo; sin build, todo lo que no es API responde el 404 JSON de siempre.
 *
 * Arranque local: `npm run dev:api` (recarga), `npm run start:api` o `npm start`; puerto `PORT` (3000 por defecto).
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { ejecutarTurno } from "./agente/ciclo";
import { cargarSistema } from "./agente/prompt";
import { AlmacenSesiones, PATRON_SESION, validarSessionId } from "./agente/sesiones";
import type { Sesion } from "./agente/tipos";
import type { Config } from "./config";
import { leerConfig, LIMITE_PETICIONES_POR_DEFECTO } from "./config";
import { describirErrorZod } from "./dominio/esquemas";
import type { AdaptadorLLM } from "./llm/adapter";
import { crearAdaptador } from "./llm/index";
import { exigirClave, HEADER_CLAVE_ACCESO } from "./seguridad/acceso";
import { crearLimitador, limitarPeticiones, VENTANA_MINUTO_MS } from "./seguridad/limite";
import { mensajeDeError } from "./tools/tipos";

export const ORIGEN_FRONT_DESARROLLO = "http://localhost:5173";
const LARGO_MAXIMO_MENSAJE = 8000;

const esquemaChat = z.object({
  sessionId: z.string().regex(PATRON_SESION, "use de 1 a 64 letras, números, '-' o '_'"),
  message: z.string().trim().min(1, "el mensaje no puede estar vacío").max(LARGO_MAXIMO_MENSAJE),
});

export interface DependenciasApp {
  adaptador: AdaptadorLLM;
  /** Sin `claveAcceso` no se exige código; sin `limitePeticionesMinuto` se usa el valor por defecto (20). */
  config: Pick<Config, "maxIteraciones" | "maxTokensSesion"> & Partial<Pick<Config, "claveAcceso" | "limitePeticionesMinuto">>;
  /** Reloj del límite por IP (las pruebas lo inyectan). */
  ahora?: () => number;
  /** Raíz del proyecto (contiene fixtures/ y out/). */
  directory: string;
  /** System prompt ya cargado de `agent/prompt.md` + conocimiento. */
  sistema: string;
  almacen?: AlmacenSesiones;
  /** Carpeta del build del front (`web/dist`). Si falta o no tiene `index.html`, no se sirven estáticos. */
  dirFront?: string;
}

type Codigo = "CUERPO_INVALIDO" | "SESION_INVALIDA" | "SESION_NO_EXISTE" | "NO_ENCONTRADO" | "ERROR_INTERNO";

function responderError(c: Context, estado: 400 | 404 | 500, code: Codigo, message: string): Response {
  return c.json({ error: { code, message } }, estado);
}

/** Ejecuta los turnos de una misma sesión uno detrás de otro para no mezclar historiales. */
function crearColaPorSesion(): <T>(id: string, trabajo: () => Promise<T>) => Promise<T> {
  const colas = new Map<string, Promise<unknown>>();
  return (id, trabajo) => {
    const actual = (colas.get(id) ?? Promise.resolve()).then(trabajo, trabajo);
    const marcador = actual.catch(() => undefined);
    colas.set(id, marcador);
    void marcador.then(() => {
      if (colas.get(id) === marcador) colas.delete(id);
    });
    return actual;
  };
}

function vistaSesion(sesion: Sesion) {
  const { id, creada, historial, confirmacionPendiente, tokensUsados } = sesion;
  return { id, creada, historial, confirmacionPendiente: confirmacionPendiente ?? null, tokensUsados };
}

async function leerCuerpo(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const esRutaApi = (ruta: string): boolean => ruta === "/api" || ruta.startsWith("/api/");

/** Aplica el middleware solo fuera de `/api/*`, para que la API conserve su 404 JSON. */
function fueraDeApi(middleware: MiddlewareHandler): MiddlewareHandler {
  return (c, next) => (esRutaApi(c.req.path) ? next() : middleware(c, next));
}

/** Sirve el build del front: archivos tal cual y, para cualquier otra ruta, `index.html`. */
function registrarFront(app: Hono, dirFront: string | undefined): boolean {
  if (dirFront === undefined || !existsSync(join(dirFront, "index.html"))) return false;
  app.get("*", fueraDeApi(serveStatic({ root: dirFront })));
  app.get("*", fueraDeApi(serveStatic({ root: dirFront, path: "index.html" })));
  return true;
}

/** Crea la app Hono con dependencias inyectables (las pruebas usan `app.request()` sin abrir puertos). */
export function crearApp(deps: DependenciasApp): Hono {
  const app = new Hono();
  const almacen = deps.almacen ?? new AlmacenSesiones(deps.directory);
  const enCola = crearColaPorSesion();

  const { maxIteraciones, maxTokensSesion, claveAcceso } = deps.config;
  const limitador = crearLimitador({
    maximo: deps.config.limitePeticionesMinuto ?? LIMITE_PETICIONES_POR_DEFECTO,
    ventanaMs: VENTANA_MINUTO_MS,
    ahora: deps.ahora,
  });

  app.use("/api/*", cors({ origin: ORIGEN_FRONT_DESARROLLO, allowHeaders: ["Content-Type", HEADER_CLAVE_ACCESO], exposeHeaders: ["Retry-After"] }));

  app.get("/api/health", (c) =>
    c.json({ ok: true, provider: deps.adaptador.proveedor, model: deps.adaptador.modelo, requiereClave: claveAcceso !== undefined }),
  );

  app.post("/api/chat", limitarPeticiones(limitador));
  app.use("/api/chat", exigirClave({ claveAcceso }));
  app.use("/api/sessions/*", exigirClave({ claveAcceso }));

  app.post("/api/chat", async (c) => {
    const cuerpo = await leerCuerpo(c);
    if (cuerpo === undefined) return responderError(c, 400, "CUERPO_INVALIDO", "El cuerpo debe ser JSON con { sessionId, message }");
    const datos = esquemaChat.safeParse(cuerpo);
    if (!datos.success) return responderError(c, 400, "CUERPO_INVALIDO", `Cuerpo inválido: ${describirErrorZod(datos.error)}`);
    const { sessionId, message } = datos.data;
    return enCola(sessionId, async () => {
      const sesion = await almacen.obtenerOCrear(sessionId);
      if (!sesion.ok) return responderError(c, 500, "ERROR_INTERNO", sesion.error);
      // Campos explícitos: las claves de la configuración nunca viajan hacia el ciclo del agente.
      const turno = await ejecutarTurno(sesion.data, message, { adaptador: deps.adaptador, directory: deps.directory, sistema: deps.sistema, maxIteraciones, maxTokensSesion });
      const guardada = await almacen.guardar(sesion.data);
      if (!guardada.ok) console.error(guardada.error);
      return c.json(turno);
    });
  });

  app.get("/api/sessions/:id", async (c) => {
    const id = c.req.param("id");
    const valido = validarSessionId(id);
    if (!valido.ok) return responderError(c, 400, "SESION_INVALIDA", valido.error);
    const sesion = await almacen.obtener(id);
    if (!sesion.ok) return responderError(c, 500, "ERROR_INTERNO", sesion.error);
    if (sesion.data === undefined) return responderError(c, 404, "SESION_NO_EXISTE", `La sesión '${id}' no existe`);
    return c.json(vistaSesion(sesion.data));
  });

  registrarFront(app, deps.dirFront);
  app.notFound((c) => responderError(c, 404, "NO_ENCONTRADO", "Ruta no encontrada"));
  app.onError((error, c) => {
    console.error(`Error no controlado en ${c.req.method} ${c.req.path}: ${error.name}`);
    return responderError(c, 500, "ERROR_INTERNO", "Error interno del servidor. Intenta de nuevo.");
  });
  return app;
}

/** Arranque: valida la configuración, carga el prompt y escucha en `PORT`. La clave nunca se imprime. */
async function iniciar(): Promise<void> {
  const config = leerConfig(process.env);
  if (!config.ok) throw new Error(config.error);
  const raiz = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const sistema = await cargarSistema(raiz);
  if (!sistema.ok) throw new Error(sistema.error);
  const adaptador = crearAdaptador(config.data);
  const dirFront = join(raiz, "web", "dist");
  const app = crearApp({ adaptador, config: config.data, directory: raiz, sistema: sistema.data, dirFront });
  const aviso = config.data.claveApi === undefined ? " — ATENCIÓN: falta ANTHROPIC_API_KEY, el chat responderá con un error claro" : "";
  const front = existsSync(join(dirFront, "index.html")) ? "; chat web en la misma URL" : "; sin build del front (npm run build)";
  const acceso = config.data.claveAcceso === undefined ? "sin código de acceso" : "con código de acceso";
  serve({ fetch: app.fetch, port: config.data.puerto }, (info) => {
    console.log(`API del agente en http://localhost:${info.port} (modelo ${adaptador.modelo}; ${acceso})${front}${aviso}`);
  });
}

const esPrincipal = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  iniciar().catch((error: unknown) => {
    console.error(`No se pudo arrancar el API: ${mensajeDeError(error)}`);
    process.exitCode = 1;
  });
}

/**
 * Límite de peticiones por IP (NFR3: costo). Ventana deslizante en memoria: cada IP guarda las marcas de tiempo
 * de sus peticiones del último minuto; al llegar a `maximo`, las siguientes reciben 429 con `Retry-After`.
 *
 * Memoria acotada: cada IP guarda como mucho `maximo` marcas; una vez por ventana se borran las IPs sin
 * peticiones recientes, y si aun así hay más de `maxClaves` IPs se descartan las más antiguas.
 * Sin temporizadores: la limpieza ocurre al registrar una petición, así el proceso y las pruebas no quedan
 * con intervalos vivos. El reloj es inyectable para probar la ventana sin esperar.
 *
 * Al ser memoria del proceso, el límite se reinicia con cada despliegue o reinicio (aceptable: una sola instancia).
 */
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";

export const VENTANA_MINUTO_MS = 60_000;
export const MAX_CLAVES_POR_DEFECTO = 10_000;
export const IP_DESCONOCIDA = "desconocida";
/** Largo máximo de la clave guardada: un `x-forwarded-for` enorme no debe inflar la memoria. */
const LARGO_MAXIMO_IP = 64;

export interface OpcionesLimitador {
  /** Peticiones permitidas por clave dentro de la ventana. */
  maximo: number;
  ventanaMs: number;
  /** Reloj en milisegundos (por defecto `Date.now`). */
  ahora?: () => number;
  /** Tope de claves (IPs) guardadas a la vez. */
  maxClaves?: number;
}

export type Decision = { permitido: true } | { permitido: false; esperaSegundos: number };

export interface Limitador {
  /** Registra una petición de `clave` y dice si se permite; si no, cuántos segundos esperar. */
  registrar(clave: string): Decision;
  /** Cantidad de claves guardadas (para verificar que la memoria no crece sin límite). */
  readonly tamano: number;
}

export function crearLimitador(opciones: OpcionesLimitador): Limitador {
  const { maximo, ventanaMs } = opciones;
  if (!Number.isInteger(maximo) || maximo < 1) throw new Error(`El límite de peticiones debe ser un entero mayor que 0 (recibido ${maximo})`);
  if (!(ventanaMs > 0)) throw new Error(`La ventana del límite debe ser mayor que 0 ms (recibido ${ventanaMs})`);
  const ahora = opciones.ahora ?? Date.now;
  const maxClaves = opciones.maxClaves ?? MAX_CLAVES_POR_DEFECTO;
  const marcas = new Map<string, number[]>();
  let ultimaLimpieza = ahora();

  const recientes = (lista: number[], t: number): number[] => lista.filter((marca) => marca > t - ventanaMs);

  function limpiar(t: number): void {
    for (const [clave, lista] of marcas) {
      const vigentes = recientes(lista, t);
      if (vigentes.length === 0) marcas.delete(clave);
      else marcas.set(clave, vigentes);
    }
    ultimaLimpieza = t;
  }

  /** Antes de guardar una clave nueva, garantiza espacio descartando las más antiguas (orden de inserción del Map). */
  function hacerEspacio(t: number): void {
    if (marcas.size < maxClaves) return;
    limpiar(t);
    for (const clave of marcas.keys()) {
      if (marcas.size < maxClaves) break;
      marcas.delete(clave);
    }
  }

  return {
    registrar(clave) {
      const t = ahora();
      if (t - ultimaLimpieza >= ventanaMs) limpiar(t);
      const previas = marcas.get(clave);
      if (previas === undefined) hacerEspacio(t);
      const vigentes = recientes(previas ?? [], t);
      const masAntigua = vigentes[0];
      if (vigentes.length >= maximo && masAntigua !== undefined) {
        marcas.set(clave, vigentes);
        return { permitido: false, esperaSegundos: Math.max(1, Math.ceil((masAntigua + ventanaMs - t) / 1000)) };
      }
      vigentes.push(t);
      marcas.set(clave, vigentes);
      return { permitido: true };
    },
    get tamano() {
      return marcas.size;
    },
  };
}

/** IP del socket solo cuando la petición llegó por `@hono/node-server` (en `app.request()` de las pruebas no hay socket). */
function ipDelSocket(c: Context): string | undefined {
  const env: unknown = c.env;
  if (typeof env !== "object" || env === null || !("incoming" in env)) return undefined;
  return getConnInfo(c).remote.address;
}

/**
 * IP del cliente. Render (y casi cualquier PaaS) pone un proxy delante: el socket siempre muestra la IP del proxy,
 * así que se usa el primer valor de `x-forwarded-for`, que es el cliente original. Sin ese header, la IP del socket.
 */
export function ipCliente(c: Context): string {
  const reenviada = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = reenviada !== undefined && reenviada !== "" ? reenviada : ipDelSocket(c);
  return (ip ?? IP_DESCONOCIDA).slice(0, LARGO_MAXIMO_IP);
}

/** Middleware: 429 con `Retry-After` y un mensaje claro en español cuando la IP supera el límite. */
export function limitarPeticiones(limitador: Limitador): MiddlewareHandler {
  return async (c, next) => {
    const decision = limitador.registrar(ipCliente(c));
    if (decision.permitido) return next();
    const { esperaSegundos } = decision;
    c.header("Retry-After", String(esperaSegundos));
    const message = `Demasiadas solicitudes seguidas. Espera ${esperaSegundos} s e intenta de nuevo.`;
    return c.json({ error: { code: "DEMASIADAS_SOLICITUDES", message, esperaSegundos } }, 429);
  };
}

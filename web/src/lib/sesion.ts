/**
 * Identificador de la conversación del navegador. Se guarda en `localStorage` para recuperar el historial al recargar.
 * Si `localStorage` no está disponible (modo privado, almacenamiento bloqueado), el id vive solo en memoria:
 * el chat funciona igual pero la conversación no sobrevive a una recarga.
 */
export const CLAVE_SESION = "agente-proveedor.sessionId";
/** Mismo patrón que valida el backend (`PATRON_SESION`). */
const PATRON_SESION = /^[A-Za-z0-9_-]{1,64}$/;

let idEnMemoria: string | undefined;

function nuevoId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // `randomUUID` solo existe en contextos seguros (https o localhost); fuera de ellos se usa hex aleatorio.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function leerGuardado(): string | undefined {
  try {
    const valor = localStorage.getItem(CLAVE_SESION);
    return valor !== null && PATRON_SESION.test(valor) ? valor : undefined;
  } catch (error) {
    console.warn("localStorage no disponible; la conversación no se recordará al recargar.", error);
    return undefined;
  }
}

function guardar(id: string): void {
  try {
    localStorage.setItem(CLAVE_SESION, id);
  } catch (error) {
    console.warn("No se pudo guardar la sesión en localStorage; se usa solo en memoria.", error);
  }
}

/** Devuelve el id de la sesión actual; lo crea y guarda la primera vez. */
export function obtenerSessionId(): string {
  if (idEnMemoria !== undefined) return idEnMemoria;
  const guardado = leerGuardado();
  if (guardado !== undefined) {
    idEnMemoria = guardado;
    return guardado;
  }
  return reiniciarSessionId();
}

/** Empieza una conversación nueva: genera otro id y lo guarda. */
export function reiniciarSessionId(): string {
  const id = nuevoId();
  idEnMemoria = id;
  guardar(id);
  return id;
}

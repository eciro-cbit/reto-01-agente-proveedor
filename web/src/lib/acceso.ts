/**
 * Código de acceso del despliegue, guardado en `sessionStorage`: se pide una vez por pestaña y se olvida al cerrarla.
 * Si `sessionStorage` no está disponible (modo privado, almacenamiento bloqueado), vive solo en memoria.
 * El código no es un secreto del proveedor: solo abre el chat público (la clave del modelo nunca llega al front).
 */
export const CLAVE_ALMACEN_ACCESO = "agente-proveedor.claveAcceso";

/** Respaldo en memoria, usado solo cuando `sessionStorage` falla. */
let respaldo: string | undefined;

export function leerClaveAcceso(): string | undefined {
  try {
    const valor = sessionStorage.getItem(CLAVE_ALMACEN_ACCESO);
    return valor === null || valor === "" ? undefined : valor;
  } catch (error) {
    console.warn("sessionStorage no disponible; el código de acceso se recuerda solo en memoria.", error);
    return respaldo;
  }
}

export function guardarClaveAcceso(codigo: string): void {
  respaldo = codigo;
  try {
    sessionStorage.setItem(CLAVE_ALMACEN_ACCESO, codigo);
  } catch (error) {
    console.warn("No se pudo guardar el código de acceso en sessionStorage; se usa solo en memoria.", error);
  }
}

export function borrarClaveAcceso(): void {
  respaldo = undefined;
  try {
    sessionStorage.removeItem(CLAVE_ALMACEN_ACCESO);
  } catch (error) {
    console.warn("No se pudo borrar el código de acceso de sessionStorage.", error);
  }
}

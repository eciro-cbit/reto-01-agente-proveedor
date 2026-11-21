import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.svelte";
import { CLAVE_ALMACEN_ACCESO } from "../lib/acceso";
import { instalarFetch, respuestaEnvio, respuestaJson } from "../pruebas/datos";
import PantallaAcceso from "./PantallaAcceso.svelte";

const CODIGO = "prueba-local-123";
const NO_AUTORIZADO = () => respuestaJson({ error: { code: "CLAVE_INVALIDA", message: "El código de acceso no es válido. Revísalo e intenta de nuevo." } }, 401);

/** Cabecera `x-clave-acceso` enviada en la llamada `n` a `/api/chat`. */
function claveEnviada(simulado: ReturnType<typeof instalarFetch>, n: number): string | undefined {
  const init = simulado.mock.calls.filter(([entrada]) => entrada === "/api/chat")[n]?.[1];
  const cabeceras = init?.headers;
  return cabeceras !== undefined && !Array.isArray(cabeceras) && !(cabeceras instanceof Headers) ? cabeceras["x-clave-acceso"] : undefined;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PantallaAcceso (componente)", () => {
  it("envía el código escrito y vacía el campo", async () => {
    const onEnviar = vi.fn();
    render(PantallaAcceso, { onEnviar });
    const campo = screen.getByTestId("acceso-input") as HTMLInputElement;
    expect(campo.type).toBe("password");
    await userEvent.type(campo, `${CODIGO}{Enter}`);
    expect(onEnviar).toHaveBeenCalledWith(CODIGO);
    expect(campo.value).toBe("");
  });

  it("sin texto el botón queda deshabilitado y no envía", async () => {
    const onEnviar = vi.fn();
    render(PantallaAcceso, { onEnviar });
    expect((screen.getByTestId("acceso-enviar") as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByTestId("acceso-input"), "   {Enter}");
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it("muestra el error como alerta solo cuando lo hay", () => {
    const { unmount } = render(PantallaAcceso, { onEnviar: vi.fn() });
    expect(screen.queryByTestId("acceso-error")).toBeNull();
    unmount();
    render(PantallaAcceso, { onEnviar: vi.fn(), error: "El código de acceso no es válido." });
    expect(screen.getByRole("alert").textContent).toBe("El código de acceso no es válido.");
  });
});

describe("App con código de acceso", () => {
  it("un 401 al cargar muestra la pantalla; con el código el chat aparece y envía el header", async () => {
    const simulado = instalarFetch([() => respuestaJson(respuestaEnvio())], {
      sesion: (_url, init) => {
        const cabeceras = init?.headers as Record<string, string> | undefined;
        return cabeceras?.["x-clave-acceso"] === CODIGO ? respuestaJson({ error: { code: "SESION_NO_EXISTE", message: "no existe" } }, 404) : NO_AUTORIZADO();
      },
    });
    const usuario = userEvent.setup();
    render(App);
    expect(await screen.findByTestId("acceso-pantalla")).toBeTruthy();
    expect(screen.queryByTestId("acceso-error")).toBeNull(); // primera visita: sin código previo, sin error
    expect(screen.queryByTestId("chat-input")).toBeNull();

    await usuario.type(screen.getByTestId("acceso-input"), `${CODIGO}{Enter}`);
    await waitFor(() => expect(screen.getByTestId("chat-input")).toBeTruthy());
    expect(sessionStorage.getItem(CLAVE_ALMACEN_ACCESO)).toBe(CODIGO);

    await usuario.type(screen.getByTestId("chat-input"), "hola{Enter}");
    await waitFor(() => expect(screen.getAllByTestId("tool-card")).toHaveLength(1));
    expect(claveEnviada(simulado, 0)).toBe(CODIGO);
  });

  it("un código guardado que el servidor rechaza muestra el error y lo borra", async () => {
    sessionStorage.setItem(CLAVE_ALMACEN_ACCESO, "codigo-viejo-1");
    instalarFetch([], { sesion: NO_AUTORIZADO });
    render(App);
    expect((await screen.findByTestId("acceso-error")).textContent).toMatch(/no es válido/);
    expect(sessionStorage.getItem(CLAVE_ALMACEN_ACCESO)).toBeNull();
  });
});

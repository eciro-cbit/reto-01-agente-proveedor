import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.svelte";
import { TEXTO_CONFIRMAR } from "./lib/chat.svelte";
import { PROMPT_EJEMPLO } from "./lib/formato";
import type { RespuestaTurno } from "./lib/tipos";
import { cuerpoEnviado, instalarFetch, PROMPT_ECUADOR, respuestaEcuador, respuestaEnvio, respuestaJson, vistaSesion } from "./pruebas/datos";

/** Respuesta de `/api/chat` que espera a que la prueba la libere (para ver el estado "pensando"). */
function respuestaDiferida(cuerpo: RespuestaTurno) {
  let liberar: () => void = () => undefined;
  const lista = new Promise<void>((r) => (liberar = r));
  return { manejador: async () => (await lista, respuestaJson(cuerpo)), liberar };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App: recorrido del chat", () => {
  it("ec-corp-andina: pensando → 5 tarjetas y barra; 'Sí, enviar' → segundo turno sin barra", async () => {
    const primero = respuestaDiferida(respuestaEcuador());
    const simulado = instalarFetch([primero.manejador, () => respuestaJson(respuestaEnvio())]);
    const usuario = userEvent.setup();
    render(App);
    await waitFor(() => expect(screen.getByTestId("encabezado-modelo").textContent).toBe("Modelo: claude-sonnet-5-5"));

    await usuario.type(screen.getByTestId("chat-input"), PROMPT_ECUADOR);
    await usuario.click(screen.getByTestId("chat-enviar"));
    expect(await screen.findByTestId("chat-pensando")).toBeTruthy();
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled).toBe(true);

    primero.liberar();
    await waitFor(() => expect(screen.getAllByTestId("tool-card")).toHaveLength(5));
    expect(screen.queryByTestId("chat-pensando")).toBeNull();
    expect(screen.getByTestId("confirmacion-barra")).toBeTruthy();
    expect(screen.getByTestId("chat-mensaje-pide-confirmacion")).toBeTruthy();
    expect(screen.getByTestId("chat-lista").getAttribute("aria-live")).toBe("polite");

    await usuario.click(screen.getByTestId("confirmacion-si"));
    await waitFor(() => expect(screen.getAllByTestId("tool-card")).toHaveLength(6));
    expect(cuerpoEnviado(simulado, 1)).toMatchObject({ message: TEXTO_CONFIRMAR });
    expect(screen.queryByTestId("confirmacion-barra")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("chat-input"));
  });

  it("un error del backend se muestra claro y la entrada sigue habilitada", async () => {
    instalarFetch([() => respuestaJson({ error: { code: "ERROR_INTERNO", message: "x" } }, 500)]);
    const usuario = userEvent.setup();
    render(App);
    await usuario.type(screen.getByTestId("chat-input"), "hola{Enter}");
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/servidor del agente tuvo un error \(500\)/);
    const entrada = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    expect(entrada.disabled).toBe(false);
    await usuario.type(entrada, "otra vez");
    expect((screen.getByTestId("chat-enviar") as HTMLButtonElement).disabled).toBe(false);
  });

  it("la API caída al cargar: encabezado sin conexión y la bienvenida sigue usable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const caido = () => Promise.reject(new TypeError("Failed to fetch"));
    instalarFetch([], { salud: caido, sesion: caido });
    render(App);
    await waitFor(() => expect(screen.getByTestId("encabezado-modelo").textContent).toBe("API sin conexión"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/No se pudo recuperar la conversación anterior/);
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("la sugerencia de bienvenida envía el prompt de ejemplo del PRD", async () => {
    const simulado = instalarFetch([() => respuestaJson(respuestaEcuador())]);
    render(App);
    await userEvent.click(screen.getByTestId("chat-sugerencia"));
    await waitFor(() => expect(screen.getAllByTestId("tool-card")).toHaveLength(5));
    expect(cuerpoEnviado(simulado, 0)).toMatchObject({ message: PROMPT_EJEMPLO });
  });

  it("recupera el historial guardado y 'Nueva conversación' lo limpia", async () => {
    const vista = vistaSesion({ historial: [{ rol: "usuario", texto: "mensaje anterior", ts: "t1" }] });
    instalarFetch([], { sesion: () => respuestaJson(vista) });
    render(App);
    expect((await screen.findByTestId("chat-mensaje")).textContent).toContain("mensaje anterior");
    await userEvent.click(screen.getByTestId("encabezado-nueva-conversacion"));
    expect(screen.queryByTestId("chat-mensaje")).toBeNull();
    expect(screen.getByTestId("chat-bienvenida")).toBeTruthy();
  });
});

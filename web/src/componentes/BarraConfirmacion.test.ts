import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TEXTO_CONFIRMAR, TEXTO_RECHAZAR } from "../lib/chat.svelte";
import BarraConfirmacion from "./BarraConfirmacion.svelte";

describe("BarraConfirmacion", () => {
  it("no se muestra sin needsConfirmation", () => {
    render(BarraConfirmacion, { visible: false, onResponder: vi.fn() });
    expect(screen.queryByTestId("confirmacion-barra")).toBeNull();
  });

  it("con needsConfirmation es una región destacada con ambos botones", () => {
    render(BarraConfirmacion, { visible: true, onResponder: vi.fn() });
    const barra = screen.getByRole("region", { name: "Confirmación pendiente" });
    expect(barra.textContent).toMatch(/necesita tu confirmación/);
    expect(screen.getByRole("button", { name: "Sí, enviar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, todavía no" })).toBeTruthy();
  });

  it("'Sí, enviar' envía el texto de confirmación y 'No, todavía no' el de rechazo", async () => {
    const onResponder = vi.fn();
    render(BarraConfirmacion, { visible: true, onResponder });
    await userEvent.click(screen.getByTestId("confirmacion-si"));
    await userEvent.click(screen.getByTestId("confirmacion-no"));
    expect(onResponder.mock.calls).toEqual([[TEXTO_CONFIRMAR], [TEXTO_RECHAZAR]]);
  });

  it("deshabilitada no dispara respuestas", async () => {
    const onResponder = vi.fn();
    render(BarraConfirmacion, { visible: true, deshabilitado: true, onResponder });
    await userEvent.click(screen.getByTestId("confirmacion-si"));
    expect(onResponder).not.toHaveBeenCalled();
  });
});

import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { toolCall } from "../pruebas/datos";
import TarjetaHerramienta from "./TarjetaHerramienta.svelte";

describe("TarjetaHerramienta", () => {
  it("muestra el nombre legible, el estado ok, el resumen y los argumentos en JSON", () => {
    render(TarjetaHerramienta, { llamada: toolCall("proveedor_armar_paquete", { argumentos: { caso: "ec-corp-andina" }, resumen: "Paquete listo_para_firma" }) });
    const tarjeta = screen.getByTestId("tool-card");
    expect(within(tarjeta).getByTestId("tool-card-nombre").textContent).toBe("armar paquete");
    expect(within(tarjeta).getByTestId("tool-card-estado").textContent).toBe("ok");
    expect(within(tarjeta).getByTestId("tool-card-resumen").textContent).toBe("Paquete listo_para_firma");
    expect(within(tarjeta).getByTestId("tool-card-argumentos").textContent).toContain('"caso": "ec-corp-andina"');
    expect(tarjeta.dataset.estado).toBe("ok");
  });

  it("una herramienta con error lleva estilo y etiqueta de error", () => {
    render(TarjetaHerramienta, { llamada: toolCall("proveedor_leer_solicitud", { ok: false, resumen: "El caso 'x' no existe" }) });
    const tarjeta = screen.getByTestId("tool-card");
    expect(tarjeta.classList.contains("error")).toBe(true);
    expect(tarjeta.dataset.estado).toBe("error");
    expect(screen.getByTestId("tool-card-estado").textContent).toBe("error");
    expect(tarjeta.getAttribute("aria-label")).toMatch(/con error/);
  });

  it("la herramienta de confirmación se muestra como variante destacada", () => {
    render(TarjetaHerramienta, { llamada: toolCall("agente_solicitar_confirmacion") });
    const tarjeta = screen.getByTestId("tool-card");
    expect(tarjeta.classList.contains("confirmacion")).toBe(true);
    expect(screen.getByTestId("tool-card-nombre").textContent).toBe("solicitar confirmacion");
  });

  it("un resumen con HTML se pinta como texto, sin interpretarlo", () => {
    render(TarjetaHerramienta, { llamada: toolCall("proveedor_leer_solicitud", { resumen: "<img src=x onerror=alert(1)>" }) });
    const resumen = screen.getByTestId("tool-card-resumen");
    expect(resumen.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(resumen.querySelector("img")).toBeNull();
  });
});

<!--
  Tarjeta de una llamada a herramienta (CA4, FR11.2): nombre legible, estado ok/error, argumentos plegables
  y resultado resumido. La herramienta de confirmación se muestra como aviso destacado (CA3).
-->
<script lang="ts">
  import { argumentosComoTexto, HERRAMIENTA_CONFIRMACION, nombreLegible } from "../lib/formato";
  import type { ToolCallVisible } from "../lib/tipos";

  let { llamada }: { llamada: ToolCallVisible } = $props();

  const esConfirmacion = $derived(llamada.nombre === HERRAMIENTA_CONFIRMACION);
  const estado = $derived(llamada.ok ? "ok" : "error");
</script>

<article
  class="tarjeta"
  class:error={!llamada.ok}
  class:confirmacion={esConfirmacion}
  data-testid="tool-card"
  data-tool={llamada.nombre}
  data-estado={estado}
  aria-label={`Herramienta ${nombreLegible(llamada.nombre)}: ${llamada.ok ? "correcta" : "con error"}`}
>
  <header>
    <span class="icono" aria-hidden="true">{esConfirmacion ? "!" : "⚙"}</span>
    <span class="nombre" data-testid="tool-card-nombre" title={llamada.nombre}>{nombreLegible(llamada.nombre)}</span>
    <span class="insignia" data-testid="tool-card-estado">{llamada.ok ? "ok" : "error"}</span>
  </header>
  <p class="resumen" data-testid="tool-card-resumen">{llamada.resumen}</p>
  <details data-testid="tool-card-argumentos">
    <summary>Argumentos</summary>
    <pre>{argumentosComoTexto(llamada.argumentos)}</pre>
  </details>
</article>

<style>
  .tarjeta {
    border: 1px solid var(--borde);
    border-left: 4px solid var(--acento);
    border-radius: var(--radio);
    background: var(--superficie-2);
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    min-width: 0;
  }
  .tarjeta.error {
    border-left-color: var(--peligro);
  }
  .tarjeta.confirmacion {
    border-left-color: var(--alerta);
    background: var(--alerta-fondo);
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .icono {
    font-weight: 700;
    width: 1.25rem;
    text-align: center;
  }
  .nombre {
    font-weight: 600;
    flex: 1;
    overflow-wrap: anywhere;
  }
  .insignia {
    font-size: 0.75rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    background: var(--exito-fondo);
    color: var(--exito);
  }
  .error .insignia {
    background: var(--peligro-fondo);
    color: var(--peligro);
  }
  .resumen {
    margin: 0.25rem 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  summary {
    cursor: pointer;
    color: var(--texto-suave);
  }
  pre {
    margin: 0.25rem 0 0;
    padding: 0.5rem;
    background: var(--superficie);
    border-radius: calc(var(--radio) / 2);
    overflow-x: auto;
    font-size: 0.8rem;
  }
</style>

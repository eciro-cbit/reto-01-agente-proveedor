<!--
  Barra de confirmación (CA3): visible solo cuando el último turno del agente pidió confirmación.
  Los botones envían un mensaje explícito; el usuario también puede escribir su respuesta.
-->
<script lang="ts">
  import { TEXTO_CONFIRMAR, TEXTO_RECHAZAR } from "../lib/chat.svelte";

  let {
    visible,
    deshabilitado = false,
    onResponder,
  }: { visible: boolean; deshabilitado?: boolean; onResponder: (texto: string) => void } = $props();
</script>

{#if visible}
  <div class="barra" role="region" aria-label="Confirmación pendiente" data-testid="confirmacion-barra">
    <p>
      <span class="icono" aria-hidden="true">!</span>
      El agente necesita tu confirmación antes de simular el envío.
    </p>
    <div class="acciones">
      <button type="button" class="si" disabled={deshabilitado} onclick={() => onResponder(TEXTO_CONFIRMAR)} data-testid="confirmacion-si">
        Sí, enviar
      </button>
      <button type="button" class="no" disabled={deshabilitado} onclick={() => onResponder(TEXTO_RECHAZAR)} data-testid="confirmacion-no">
        No, todavía no
      </button>
    </div>
  </div>
{/if}

<style>
  .barra {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.6rem 0.85rem;
    border: 2px solid var(--alerta);
    border-radius: var(--radio);
    background: var(--alerta-fondo);
  }
  p {
    margin: 0;
    font-weight: 600;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .icono {
    display: inline-grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--alerta);
    color: var(--superficie);
    font-weight: 800;
    flex: none;
  }
  .acciones {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  button {
    font: inherit;
    font-weight: 600;
    padding: 0.45rem 0.9rem;
    border-radius: var(--radio);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .si {
    background: var(--alerta);
    color: var(--superficie);
    border: 2px solid var(--alerta);
  }
  .no {
    background: transparent;
    color: var(--texto);
    border: 2px solid var(--borde);
  }
</style>

<!--
  Un mensaje del chat: usuario, agente o error. El texto del agente es texto plano (sin {@html}, sin Markdown):
  los saltos de línea se respetan con `white-space: pre-wrap`.
-->
<script lang="ts">
  import type { MensajeVisible } from "../lib/tipos";
  import TarjetaHerramienta from "./TarjetaHerramienta.svelte";

  let { mensaje }: { mensaje: MensajeVisible } = $props();

  const AUTORES = { usuario: "Tú", asistente: "Agente", error: "Error" } as const;
</script>

<li
  class={["mensaje", mensaje.rol, { confirmacion: mensaje.needsConfirmation }]}
  data-testid="chat-mensaje"
  data-rol={mensaje.rol}
>
  <span class="autor">{AUTORES[mensaje.rol]}</span>
  {#if mensaje.toolCalls.length > 0}
    <ul class="herramientas" aria-label="Herramientas usadas">
      {#each mensaje.toolCalls as llamada, i (i)}
        <li><TarjetaHerramienta {llamada} /></li>
      {/each}
    </ul>
  {/if}
  <div class="burbuja" role={mensaje.rol === "error" ? "alert" : undefined}>
    {#if mensaje.needsConfirmation}
      <p class="aviso" data-testid="chat-mensaje-pide-confirmacion">
        <span aria-hidden="true">!</span> El agente espera tu confirmación
      </p>
    {/if}
    <p class="texto">{mensaje.texto}</p>
  </div>
</li>

<style>
  .mensaje {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-width: min(46rem, 100%);
    min-width: 0;
  }
  .usuario {
    align-self: flex-end;
    align-items: flex-end;
  }
  .autor {
    font-size: 0.75rem;
    color: var(--texto-suave);
  }
  .burbuja {
    border-radius: var(--radio);
    padding: 0.6rem 0.85rem;
    background: var(--superficie-2);
    border: 1px solid var(--borde);
    max-width: 100%;
  }
  .usuario .burbuja {
    background: var(--acento);
    color: var(--acento-texto);
    border-color: transparent;
  }
  .error .burbuja {
    background: var(--peligro-fondo);
    color: var(--peligro);
    border-color: var(--peligro);
  }
  .confirmacion .burbuja {
    border: 2px solid var(--alerta);
    background: var(--alerta-fondo);
  }
  .texto {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .aviso {
    margin: 0 0 0.35rem;
    font-weight: 700;
    color: var(--alerta);
  }
  .herramientas {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }
</style>

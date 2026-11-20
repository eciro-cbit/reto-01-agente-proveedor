<!--
  Historial del chat. `role="log"` + `aria-live="polite"`: los lectores de pantalla anuncian cada mensaje nuevo.
  Sin mensajes muestra la bienvenida con el prompt de ejemplo del PRD §11 como sugerencia clicable.
-->
<script lang="ts">
  import { PROMPT_EJEMPLO } from "../lib/formato";
  import type { MensajeVisible } from "../lib/tipos";
  import Mensaje from "./Mensaje.svelte";
  import Pensando from "./Pensando.svelte";

  let {
    mensajes,
    pensando,
    onSugerencia,
  }: { mensajes: MensajeVisible[]; pensando: boolean; onSugerencia: (texto: string) => void } = $props();

  let contenedor: HTMLElement | undefined = $state();

  // Autoscroll: se repite cada vez que cambia la cantidad de mensajes o el indicador "pensando".
  $effect(() => {
    void mensajes.length;
    void pensando;
    if (contenedor) contenedor.scrollTop = contenedor.scrollHeight;
  });
</script>

<section class="lista" bind:this={contenedor} role="log" aria-live="polite" aria-label="Conversación" data-testid="chat-lista">
  {#if mensajes.length === 0 && !pensando}
    <div class="bienvenida" data-testid="chat-bienvenida">
      <h2>Hola, soy el agente de registro de proveedores</h2>
      <p>Leo la solicitud de un cliente, lleno su formulario, reviso los soportes y armo el paquete para firma. Nada se envía sin tu confirmación.</p>
      <p>Prueba con este mensaje:</p>
      <button type="button" class="sugerencia" data-testid="chat-sugerencia" onclick={() => onSugerencia(PROMPT_EJEMPLO)}>
        {PROMPT_EJEMPLO}
      </button>
    </div>
  {:else}
    <ol class="mensajes">
      {#each mensajes as mensaje (mensaje.id)}
        <Mensaje {mensaje} />
      {/each}
    </ol>
  {/if}
  {#if pensando}
    <Pensando />
  {/if}
</section>

<style>
  .lista {
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }
  .mensajes {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0;
    padding: 0;
  }
  .bienvenida {
    margin: auto 0;
    max-width: 40rem;
    align-self: center;
    text-align: center;
  }
  .bienvenida h2 {
    font-size: 1.25rem;
    margin: 0 0 0.5rem;
  }
  .sugerencia {
    font: inherit;
    text-align: left;
    color: var(--texto);
    background: var(--superficie-2);
    border: 1px dashed var(--acento);
    border-radius: var(--radio);
    padding: 0.75rem 1rem;
    cursor: pointer;
    width: 100%;
  }
  .sugerencia:hover {
    border-style: solid;
  }
</style>

<!--
  Layout del chat (FR11.1–FR11.3): encabezado, historial, barra de confirmación y entrada.
  `chat` es inyectable para pruebas; por defecto usa la API real y la sesión de `localStorage`.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import BarraConfirmacion from "./componentes/BarraConfirmacion.svelte";
  import Encabezado from "./componentes/Encabezado.svelte";
  import EntradaMensaje from "./componentes/EntradaMensaje.svelte";
  import ListaMensajes from "./componentes/ListaMensajes.svelte";
  import { ChatEstado } from "./lib/chat.svelte";

  let { chat = new ChatEstado() }: { chat?: ChatEstado } = $props();

  let entrada: EntradaMensaje | undefined = $state();

  onMount(() => {
    void chat.cargarHistorial();
  });

  function enviar(texto: string): void {
    void chat.enviar(texto);
  }

  function nuevaConversacion(): void {
    chat.nuevaConversacion();
    entrada?.enfocar();
  }
</script>

<div class="app">
  <Encabezado deshabilitado={chat.pensando} onNuevaConversacion={nuevaConversacion} />
  <main class="contenido">
    <ListaMensajes mensajes={chat.mensajes} pensando={chat.pensando} onSugerencia={enviar} />
    <footer class="pie">
      <BarraConfirmacion visible={chat.needsConfirmation && !chat.pensando} deshabilitado={chat.pensando} onResponder={enviar} />
      <EntradaMensaje bind:this={entrada} deshabilitado={!chat.puedeEnviar} onEnviar={enviar} />
    </footer>
  </main>
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100dvh;
    background: var(--fondo);
  }
  .contenido {
    display: grid;
    grid-template-rows: 1fr auto;
    min-height: 0;
    width: 100%;
    max-width: 56rem;
    margin: 0 auto;
  }
  .pie {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem 1rem 1rem;
    border-top: 1px solid var(--borde);
    background: var(--fondo);
  }
</style>

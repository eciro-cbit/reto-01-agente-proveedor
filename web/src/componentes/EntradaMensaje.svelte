<!--
  Caja de texto del chat. Enter envía, Shift+Enter hace salto de línea. Mientras el agente piensa queda
  deshabilitada; al terminar recupera el foco para seguir escribiendo.
-->
<script lang="ts">
  import { LARGO_MAXIMO_MENSAJE } from "../lib/chat.svelte";

  let { deshabilitado, onEnviar }: { deshabilitado: boolean; onEnviar: (texto: string) => void } = $props();

  let texto = $state("");
  let campo: HTMLTextAreaElement | undefined = $state();
  const vacio = $derived(texto.trim() === "");

  /** Para que el padre devuelva el foco aquí (p. ej. tras responder la barra de confirmación). */
  export function enfocar(): void {
    campo?.focus();
  }

  // Cuando el agente termina (deshabilitado pasa a false) el foco vuelve a la entrada.
  let estabaDeshabilitado = false;
  $effect(() => {
    if (estabaDeshabilitado && !deshabilitado) campo?.focus();
    estabaDeshabilitado = deshabilitado;
  });

  function enviar(evento?: SubmitEvent): void {
    evento?.preventDefault();
    if (deshabilitado || vacio) return;
    const mensaje = texto;
    texto = "";
    onEnviar(mensaje);
  }

  function alPresionarTecla(evento: KeyboardEvent): void {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) {
      evento.preventDefault();
      enviar();
    }
  }
</script>

<form class="entrada" onsubmit={enviar} data-testid="chat-form">
  <label for="chat-entrada" class="solo-lectores">Mensaje para el agente</label>
  <textarea
    id="chat-entrada"
    bind:this={campo}
    bind:value={texto}
    onkeydown={alPresionarTecla}
    disabled={deshabilitado}
    maxlength={LARGO_MAXIMO_MENSAJE}
    rows="2"
    placeholder={deshabilitado ? "Esperando la respuesta del agente…" : "Escribe tu mensaje (Enter envía, Shift+Enter salto de línea)"}
    data-testid="chat-input"
  ></textarea>
  <button type="submit" disabled={deshabilitado || vacio} data-testid="chat-enviar">Enviar</button>
</form>

<style>
  .entrada {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }
  textarea {
    flex: 1;
    min-width: 0;
    resize: vertical;
    min-height: 2.75rem;
    max-height: 12rem;
    font: inherit;
    color: var(--texto);
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    padding: 0.6rem 0.75rem;
  }
  textarea:disabled {
    opacity: 0.7;
  }
  button {
    font: inherit;
    font-weight: 600;
    padding: 0.65rem 1.1rem;
    border: none;
    border-radius: var(--radio);
    background: var(--acento);
    color: var(--acento-texto);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

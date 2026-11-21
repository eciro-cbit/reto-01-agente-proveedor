<!--
  Pantalla de acceso (FR11.1, despliegue): el servidor exige un código compartido para abrir el chat.
  Se muestra cuando una llamada responde 401; el código se guarda en sessionStorage (una vez por pestaña).
  `error` explica por qué se rechazó el código anterior; en la primera visita es null.
-->
<script lang="ts">
  let {
    error = null,
    deshabilitado = false,
    onEnviar,
  }: { error?: string | null; deshabilitado?: boolean; onEnviar: (codigo: string) => void } = $props();

  let codigo = $state("");
  const vacio = $derived(codigo.trim() === "");

  function enviar(evento: SubmitEvent): void {
    evento.preventDefault();
    if (deshabilitado || vacio) return;
    const valor = codigo;
    codigo = "";
    onEnviar(valor);
  }
</script>

<section class="acceso" aria-labelledby="acceso-titulo" data-testid="acceso-pantalla">
  <form onsubmit={enviar} data-testid="acceso-form">
    <h2 id="acceso-titulo">Código de acceso</h2>
    <p class="ayuda">Este agente es una demo protegida. Ingresa el código que te compartieron para usar el chat.</p>
    <label for="acceso-codigo">Código</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      id="acceso-codigo"
      type="password"
      autocomplete="off"
      autofocus
      bind:value={codigo}
      disabled={deshabilitado}
      aria-invalid={error !== null}
      aria-describedby={error !== null ? "acceso-error" : undefined}
      data-testid="acceso-input"
    />
    {#if error !== null}
      <p id="acceso-error" class="error" role="alert" data-testid="acceso-error">{error}</p>
    {/if}
    <button type="submit" disabled={deshabilitado || vacio} data-testid="acceso-enviar">Entrar</button>
  </form>
</section>

<style>
  .acceso {
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
    min-height: 0;
    overflow-y: auto;
  }
  form {
    display: grid;
    gap: 0.6rem;
    width: 100%;
    max-width: 24rem;
    padding: 1.25rem;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    background: var(--superficie);
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .ayuda {
    margin: 0;
    font-size: 0.9rem;
    color: var(--texto-suave);
  }
  label {
    font-weight: 600;
    font-size: 0.9rem;
  }
  input {
    font: inherit;
    color: var(--texto);
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    padding: 0.6rem 0.75rem;
  }
  .error {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--alerta);
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

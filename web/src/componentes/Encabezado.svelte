<!-- Encabezado: título, modelo activo (de `/api/health`) y botón "Nueva conversación". -->
<script lang="ts">
  import { onMount } from "svelte";
  import { obtenerSalud } from "../lib/api";
  import type { ResultadoApi, Salud } from "../lib/tipos";

  let {
    deshabilitado = false,
    onNuevaConversacion,
    cargarSalud = () => obtenerSalud(),
  }: {
    deshabilitado?: boolean;
    onNuevaConversacion: () => void;
    cargarSalud?: () => Promise<ResultadoApi<Salud>>;
  } = $props();

  let estadoModelo = $state("Conectando…");

  onMount(() => {
    cargarSalud()
      .then((salud) => {
        estadoModelo = salud.ok ? `Modelo: ${salud.datos.model}` : "API sin conexión";
      })
      .catch((error: unknown) => {
        console.warn("No se pudo consultar /api/health:", error);
        estadoModelo = "API sin conexión";
      });
  });
</script>

<header class="encabezado">
  <div class="titulo">
    <h1>Registro de proveedores</h1>
    <span class="modelo" data-testid="encabezado-modelo">{estadoModelo}</span>
  </div>
  <button type="button" onclick={onNuevaConversacion} disabled={deshabilitado} data-testid="encabezado-nueva-conversacion">
    Nueva conversación
  </button>
</header>

<style>
  .encabezado {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--borde);
    background: var(--superficie);
  }
  .titulo {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }
  .modelo {
    font-size: 0.75rem;
    color: var(--texto-suave);
    overflow-wrap: anywhere;
  }
  button {
    font: inherit;
    font-size: 0.875rem;
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    background: var(--superficie-2);
    color: var(--texto);
    cursor: pointer;
    flex: none;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

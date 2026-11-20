<!-- Indicador "pensando" mientras el agente trabaja (PRD §6.1). -->
<p class="pensando" data-testid="chat-pensando">
  <span class="puntos" aria-hidden="true"><span></span><span></span><span></span></span>
  El agente está pensando…
</p>

<style>
  .pensando {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    color: var(--texto-suave);
    font-style: italic;
  }
  .puntos {
    display: inline-flex;
    gap: 0.2rem;
  }
  .puntos span {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: currentColor;
    animation: latido 1.2s infinite ease-in-out;
  }
  .puntos span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .puntos span:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes latido {
    0%,
    80%,
    100% {
      opacity: 0.25;
    }
    40% {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .puntos span {
      animation: none;
    }
  }
</style>

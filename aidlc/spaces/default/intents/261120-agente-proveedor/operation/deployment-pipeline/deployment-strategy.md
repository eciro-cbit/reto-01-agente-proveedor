# Estrategia de despliegue

## Estrategia: recreate gestionado por Render (zero-downtime de Render)

Render construye la nueva versión, arranca la instancia nueva, espera a que `/api/health` responda 200 y solo entonces corta el tráfico a la anterior. Si el health check falla, la versión anterior sigue sirviendo y el deploy queda marcado como fallido. Una sola instancia (plan gratuito): no hay canary ni blue/green.

Alternativas descartadas:
- Canary / blue-green: requieren varias instancias o balanceador propio; desproporcionado para una demo con un usuario a la vez.
- Despliegue manual: más riesgo de olvidar el CI; elegido auto-deploy con `checksPass` (Q3).

## Gates

1. CI verde en el commit de `main` (typecheck, lint, 189 pruebas, build, demo determinista).
2. Health check de Render en `/api/health` (timeout de arranque de Render).
3. Humo manual post-deploy (abajo).

## Humo post-despliegue

| # | Comprobación | Esperado |
|---|---|---|
| 1 | `curl https://<app>.onrender.com/api/health` | `{"ok":true,"provider":"anthropic","model":"claude-sonnet-5-5"}` sin clave |
| 2 | `curl -X POST .../api/chat` sin header `x-clave-acceso` | 401 con mensaje claro |
| 3 | Abrir la URL en el navegador | Pide el código de acceso; con el código, aparece el chat |
| 4 | Prompt del PRD §11 (`ec-corp-andina`) | Tool calls visibles, resumen, barra de confirmación (consume tokens: una vez) |
| 5 | Responder "envía" | Tarjeta `simular envio` con `out/ec-corp-andina/ENVIO-SIMULADO.md` |

## Observabilidad mínima

- Métrica de salud: health check de Render sobre `/api/health` (estado del servicio en el panel).
- Métrica de error: logs de Render (`out/log.jsonl` también queda en disco efímero) y respuestas 5xx/429 visibles en el panel de logs.
- Sin SLO formal: entregable de demo; disponibilidad objetivo "activo durante la defensa" (PRD §9.3). Riesgo conocido: el plan gratuito duerme tras ~15 min sin tráfico; abrir el link 1–2 min antes de la defensa.

## Ventana

Desplegar antes de la defensa, no durante. Congelar `main` la hora previa.

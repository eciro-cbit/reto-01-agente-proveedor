# Runbook de rollback

Responsable: dueño del repo y del servicio en Render (único operador). Escalamiento: no hay segundo nivel; si Render está caído, se usa el plan B (local).

## Disparadores

- Health check falla tras un deploy (Render ya mantiene la versión anterior; confirmar en el panel).
- Humo post-despliegue falla en los pasos 2–5.
- Errores 5xx repetidos en los logs de Render.
- Consumo anómalo de tokens (revisar uso en la consola de Anthropic).

## Pasos

1. **Rollback inmediato (Render)**: panel del servicio → *Events* → deploy anterior en verde → *Rollback*. Render reconstruye esa versión; esperar el health check verde. Esto desactiva el auto-deploy hasta reactivarlo: anotarlo.
2. **Corregir en git**: `git revert <sha>` en una rama, PR a `main`, esperar CI verde, merge. Reactivar el auto-deploy en Render; el commit revertido se despliega solo cuando CI pasa.
3. **Verificar**: repetir el humo post-despliegue de `deployment-strategy.md`.

## Contención de gasto

- Rotar `CLAVE_ACCESO` en Render (*Environment* → editar → guarda y redepliega): corta a quien tenga el código anterior.
- Si hay riesgo sobre la clave del modelo: revocar `ANTHROPIC_API_KEY` en la consola de Anthropic, crear una nueva y actualizarla en Render.
- Suspender el servicio en Render (*Suspend*) detiene todo el tráfico.

## Plan B (Render no disponible)

`npm ci && npm run build && npm start` en local con `.env` propio; el PRD acepta la defensa en local con penalización (−10). Mantener `main` siempre desplegable para este caso.

## Datos

No hay base de datos ni migraciones; `out/` es regenerable. Rollback no requiere pasos de datos.

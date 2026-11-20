# Deployment Pipeline — Preguntas

Contexto: el PRD (§9.3) pide un link público activo durante la defensa (sin link: −10). La app ya corre en un solo proceso Node (`npm run build && npm start`, Hono sirve chat + API). No existe Dockerfile ni IaC. El backend escribe en `out/` (regenerable) y necesita `ANTHROPIC_API_KEY` como secreto.

## Q1. [Ingeniero de releases] Plataforma para el link público

A. Render (Web Service Node nativo, plan gratuito, `render.yaml` versionado, secreto en el panel; se duerme tras ~15 min sin uso y el primer request tarda ~30–60 s) (recomendada)
B. Railway (Node nativo, sin dormir, crédito de prueba limitado)
C. Fly.io (requiere Dockerfile; máquina siempre encendida con costo bajo)
D. Azure App Service (Node; más configuración, posible afinidad con Periferia)
X. Other (please specify)

[Answer]:

## Q2. [Ingeniero de releases] Protección del link (tu clave de Anthropic paga cada turno)

El PRD permite link público; si se protege, la clave de acceso va en el README. Hoy ya hay topes por sesión (25 iteraciones, 200000 tokens), pero no hay límite de sesiones ni de peticiones por IP.

A. Código de acceso compartido (variable `CLAVE_ACCESO` en el servidor, el front lo pide una vez y lo envía en un header; se documenta en el README) + límite de peticiones por IP (recomendada)
B. Público, solo con límite de peticiones por IP y tope global de tokens por día
C. Público sin más protección que los topes actuales
X. Other (please specify)

[Answer]:

## Q3. [Ingeniero de releases] Cómo se dispara un despliegue

El repo está en la rama `master` (la rama principal configurada es `main`) y no hay CI todavía.

A. Auto-deploy de la plataforma al hacer push a la rama principal, con un workflow de GitHub Actions que corre typecheck + lint + pruebas y debe pasar antes (recomendada)
B. Auto-deploy de la plataforma al hacer push, sin CI
C. Despliegue manual desde el panel de la plataforma
X. Other (please specify)

[Answer]:

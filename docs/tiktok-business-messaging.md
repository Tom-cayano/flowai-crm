# TikTok Business Messaging — Estado y plan de integración

_Analizado: 2026-07-07_

## Conclusión ejecutiva

⚠️ **Bloqueo regional**: la Business Messaging API de TikTok **no está disponible
para cuentas de empresa registradas en el EEE (incluida España), Suiza o Reino
Unido**. Love Fitness Murcia opera desde España, por lo que hoy TikTok no
permite conectar mensajería de negocio vía API para esta cuenta. Este bloqueo
es de TikTok, no de FlowAI — no hay implementación posible que lo evite.

Si TikTok abre la API al EEE (o la cuenta de negocio se registra fuera del
EEE), todo lo demás está identificado y el patrón de canal de FlowAI permite
integrarlo sin cambiar la arquitectura.

## Qué exige TikTok (API oficial, v1.3)

1. **App de desarrollador** en `business-api.tiktok.com/portal/apps`
   → genera `App ID` + `App Secret`. Requiere marca, términos y política de
   privacidad de la empresa.
2. **Solicitud de acceso al producto "Business Messaging API"** con caso de
   uso, tratamiento de datos y datos de la organización. Revisión manual
   (días). TikTok también opera un programa de **Messaging Partners**.
3. **OAuth 2.0**: access token (~24 h, auto-refresh) + refresh token
   (~30 días desde el último uso). Redirect URL registrada en el portal.
4. **Webhooks**: configuración vía la API "Create a Business Messaging
   Webhook configuration" + suscripción a eventos de mensajes; entrega HTTPS
   POST JSON al callback registrado.
5. **Límites de producto**: ventana de respuesta de **48 h** desde la última
   interacción del usuario; mensajes de texto o una imagen por mensaje.

## Qué ya tiene FlowAI listo (patrón de canal existente)

Cada canal (Instagram, Messenger, WhatsApp Cloud) sigue el mismo molde, que
se replicaría para TikTok:

| Pieza | Equivalente existente a copiar |
|---|---|
| Tabla `tiktok_accounts` (tokens cifrados, estado) | `instagram_accounts` + `token-store` |
| Ruta OAuth start/callback | `app/api/instagram/oauth/*` |
| Webhook receptor | `app/api/webhook/meta` (verificación + enqueue) |
| Colas BullMQ `ttk-message` / `ttk-outbound` | `IGM_MESSAGE` / `IGM_OUTBOUND` |
| Processors worker | `instagram-message.processor.ts` / `instagram-outbound.processor.ts` |
| Refresh de tokens programado | `lib/meta/token-refresh.ts` (tick del worker) |
| Motor de automatizaciones multicanal | trigger `message_received` + `channel` |

Cambios menores adicionales: añadir `"tiktok"` al enum `channel` de
`conversations` y al `TriggerConfig.channel`.

## Pasos exactos que faltan (cuando el bloqueo regional lo permita)

1. Crear la app en el portal de TikTok for Business y solicitar el producto
   Business Messaging (acción del propietario; aprobación externa).
2. Guardar `TIKTOK_APP_ID` / `TIKTOK_APP_SECRET` en Vercel + worker.
3. Implementar las piezas de la tabla anterior (~1 jornada siguiendo el molde
   de Instagram).
4. Registrar el webhook en el portal apuntando a
   `https://www.flowaicrm.com/api/webhook/tiktok` y añadir el prefijo al
   bypass del middleware.

## Alternativa disponible hoy

Los **TikTok Lead Ads / formularios** sí pueden conectarse ya mediante el
webhook universal de FlowAI (`POST /api/webhooks/leads`) usando Zapier/Make o
el Lead Sync de TikTok Ads → cada lead de TikTok crea contacto y dispara las
automatizaciones, igual que Transforma Fit Coach.

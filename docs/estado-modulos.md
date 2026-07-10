# Estado de módulos — FlowAI CRM

_Actualizado: 2026-07-10 · Política vigente: **no se desarrolla un módulo nuevo
hasta que el anterior esté operativo, validado E2E en producción y documentado.**_

Leyenda: ✅ validado en producción · 🟡 construido, pendiente de validación E2E
real · 🔒 bloqueado por acción externa del propietario.

| # | Módulo | Estado | Qué falta para cerrarlo |
|---|--------|--------|------------------------|
| 1 | WhatsApp (Evolution, instancia `flowai`) | ✅ | — |
| 2 | Webhooks universales + panel Integraciones | ✅ | — |
| 3 | Dashboard con métricas reales | ✅ | — |
| 4 | /ops (salud, colas, DLQ) | ✅ | — |
| 5 | Asistente comercial (funnels online/directo, reservas, anti doble-reserva, recuperación de leads) | ✅ | **Operativo vía puente Vercel** (`/api/sales/run`, commit `8b68e93`). E2E probado con nº real 556291259429 → menú entregado (external_id `3EB0DF53…`). El worker de Railway está congelado en una imagen 4-8 jul; el puente ejecuta el asistente con código actual. Al reconstruir el worker, volver a la acción nativa `sales_assistant`. |
| 6 | Recordatorios de cita 24h/1h + no-show + re-engagement | 🟡🔒 | Redeploy del worker (el cron vive en el worker) |
| 7 | Email nativo (Resend) | 🟡🔒 | API key real de Resend + dominio verificado en Ajustes → Email; después: envío real, webhook de estados y métricas con datos |
| 8 | Google Calendar / Meet | 🟡🔒 | Credenciales de service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_CALENDAR_ID`) y compartir el calendario de Carola; mientras, rige la agenda interna del CRM |
| 9 | IA conversacional (fallback y composer de emails) | 🔒 | Recargar crédito en OpenAI (`insufficient_quota`) |
| 10 | Instagram / Messenger | 🔒 | Re-autorizar OAuth en Ajustes (tokens invalidados por cambio de contraseña de Facebook) |
| 11 | TikTok Business Messaging | 🔒 | Bloqueo regional de TikTok (EEE) — ver docs/tiktok-business-messaging.md |

## Orden de cierre recomendado

1. **Redeploy del worker (Railway)** — desbloquea de golpe los módulos 5 y 6 y
   la cola de email. Es la única pieza donde el código nuevo no está corriendo.
   Validación: enviar "quiero información" desde un móvil real → menú de 6
   opciones → reservar clase de prueba → cita en CRM + confirmación.
2. **Resend** — crear cuenta/key, verificar dominio, pegar en Ajustes → Email,
   activar el canal y usar "Enviar prueba". Validación: email recibido +
   webhook marcando `delivered`/`opened` en Ajustes → Email y métricas en el
   dashboard.
3. **Google Calendar** — crear service account, compartir el calendario de
   Carola con permiso de edición, añadir las 3 variables a Vercel **y** al
   worker. Validación: reservar y ver el evento + Meet en el calendario.
4. **OpenAI** — recargar crédito. Validación: responder al asistente con una
   pregunta fuera de guion y recibir respuesta personalizada.
5. **Instagram/Messenger** — re-conectar OAuth desde Ajustes.

## Checklists de validación E2E por módulo

### Asistente comercial (tras redeploy del worker)
- [ ] Lead webhook de Transforma Fit Coach → saludo con nombre + 1️⃣/2️⃣
- [ ] Respuesta "1" → huecos libres reales → reserva → confirmación WhatsApp
- [ ] WhatsApp directo "cuánto cuesta" → menú 6 opciones → plan → clase de prueba
- [ ] "Ahora no puedo" → mañana/semana → nudge automático al día siguiente
- [ ] Dos leads no pueden reservar el mismo hueco
- [ ] Tag `cliente` → el asistente no responde
- [ ] Seguimientos 24h/3d/7d se detienen al responder

### Email (tras configurar Resend)
- [ ] Envío de prueba desde Ajustes → Email llega a la bandeja
- [ ] Webhook Resend marca delivered/opened/clicked en los logs
- [ ] Confirmación de reserva llega por email además de WhatsApp
- [ ] Recordatorios 24h/1h llegan por ambos canales
- [ ] Métricas de email visibles en el dashboard

### Google Calendar (tras credenciales)
- [ ] Hueco ocupado en el calendario de Carola NO se ofrece
- [ ] Reserva crea evento con invitación al cliente
- [ ] Videollamada crea enlace de Google Meet en la confirmación

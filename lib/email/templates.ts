// Plantillas de email: layout HTML responsive, variables {{...}} y las 9
// plantillas iniciales. El body de cada plantilla es el contenido interior;
// renderEmail() lo envuelve en el layout con estilos inline (compatibles con
// Gmail/Outlook/Apple Mail).

export interface EmailVars {
  [key: string]: string | number | null | undefined;
}

/** Sustituye {{variable}} — las desconocidas quedan vacías. */
export function interpolateVars(template: string, vars: EmailVars): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const v = vars[key.trim()];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** Envuelve el contenido en un layout responsive con branding del negocio. */
export function renderEmailLayout(opts: {
  bodyHtml:     string;
  businessName: string;
  preheader?:   string;
}): string {
  const { bodyHtml, businessName, preheader } = opts;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${businessName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#10b981;padding:20px 32px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;">${businessName}</span>
      </td></tr>
      <tr><td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
${bodyHtml}
      </td></tr>
      <tr><td style="padding:20px 32px;background:#f9fafb;color:#9ca3af;font-size:12px;">
        ${businessName} · Enviado con FlowAI CRM
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Botón CTA con estilos inline. */
export const CTA = (text: string, url: string): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:8px;background:#10b981;">
  <a href="${url}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:600;text-decoration:none;font-size:15px;">${text}</a>
  </td></tr></table>`;

// ─── Plantillas iniciales ─────────────────────────────────────────────────────

export const SEED_TEMPLATES: Array<{ slug: string; name: string; subject: string; body_html: string }> = [
  {
    slug: "bienvenida", name: "Bienvenida",
    subject: "¡Bienvenido/a a {{negocio}}, {{nombre}}! 💪",
    body_html: `<h2 style="margin:0 0 16px;">¡Hola {{nombre}}! 😊</h2>
<p>Gracias por contactar con <strong>{{negocio}}</strong>. Hemos recibido tu registro con el objetivo: <strong>{{objetivo}}</strong>.</p>
<p>Ofrecemos una <strong>valoración totalmente gratuita</strong> de 10-15 minutos para conocerte y explicarte cómo podemos ayudarte.</p>
<p>Respóndenos por WhatsApp y reservamos tu hueco en un minuto.</p>`,
  },
  {
    slug: "reserva", name: "Confirmación de reserva",
    subject: "✅ Reserva confirmada: {{tipo_cita}} el {{fecha}}",
    body_html: `<h2 style="margin:0 0 16px;">¡Reserva confirmada, {{nombre}}!</h2>
<p>Tu <strong>{{tipo_cita}}</strong> queda confirmada para el <strong>{{fecha}}</strong>.</p>
<p>{{detalle}}</p>
<p>Te enviaremos un recordatorio 24 horas y 1 hora antes. Si necesitas cambiarla, responde a este email o escríbenos por WhatsApp.</p>`,
  },
  {
    slug: "recordatorio", name: "Recordatorio de cita",
    subject: "⏰ Recordatorio: {{tipo_cita}} {{cuando}}",
    body_html: `<h2 style="margin:0 0 16px;">¡Te esperamos, {{nombre}}!</h2>
<p>Recuerda que tienes <strong>{{tipo_cita}}</strong> el <strong>{{fecha}}</strong>.</p>
<p>{{detalle}}</p>
<p>Si no puedes asistir, avísanos respondiendo a este email.</p>`,
  },
  {
    slug: "no-respondio", name: "Seguimiento sin respuesta",
    subject: "{{nombre}}, ¿seguimos con tu plan? 💪",
    body_html: `<p>¡Hola {{nombre}}!</p>
<p>Te escribimos porque empezaste el proceso para tu objetivo (<strong>{{objetivo}}</strong>) y no queremos que lo dejes a medias.</p>
<p>La valoración es gratuita y solo son 10-15 minutos. Respóndenos por WhatsApp y te reservamos hueco esta misma semana.</p>`,
  },
  {
    slug: "caso-exito", name: "Caso de éxito",
    subject: "Cómo {{cliente_ejemplo}} consiguió su objetivo en {{negocio}}",
    body_html: `<p>Hola {{nombre}},</p>
<p>Queremos compartir contigo una historia real de {{negocio}}: <strong>{{cliente_ejemplo}}</strong> llegó con tu mismo objetivo y hoy lo ha conseguido.</p>
<p>{{historia}}</p>
<p>Tú puedes ser el siguiente. ¿Reservamos tu valoración gratuita?</p>`,
  },
  {
    slug: "oferta", name: "Oferta",
    subject: "🎁 {{oferta_titulo}} — solo esta semana",
    body_html: `<h2 style="margin:0 0 16px;">{{oferta_titulo}}</h2>
<p>Hola {{nombre}},</p>
<p>{{oferta_detalle}}</p>
<p>Plazas limitadas. Responde por WhatsApp y te lo reservamos.</p>`,
  },
  {
    slug: "pago-recibido", name: "Pago recibido",
    subject: "✅ Pago recibido — {{concepto}}",
    body_html: `<p>Hola {{nombre}},</p>
<p>Hemos recibido correctamente tu pago de <strong>{{importe}}</strong> por <strong>{{concepto}}</strong>.</p>
<p>¡Gracias por confiar en {{negocio}}! Cualquier duda, respóndenos a este email.</p>`,
  },
  {
    slug: "renovacion", name: "Renovación",
    subject: "{{nombre}}, tu plan {{plan}} se renueva pronto",
    body_html: `<p>Hola {{nombre}},</p>
<p>Tu plan <strong>{{plan}}</strong> se renueva el <strong>{{fecha}}</strong>.</p>
<p>Si quieres cambiar de modalidad o tienes cualquier duda, escríbenos y lo vemos juntos.</p>
<p>¡Gracias por seguir entrenando con {{negocio}}! 💪</p>`,
  },
  {
    slug: "newsletter", name: "Newsletter",
    subject: "{{titulo}} — novedades de {{negocio}}",
    body_html: `<h2 style="margin:0 0 16px;">{{titulo}}</h2>
<p>Hola {{nombre}},</p>
{{contenido}}
<p>Nos vemos en el box 💪</p>`,
  },
];

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Eliminación de Datos — FlowAI CRM",
  description: "Solicita la eliminación de tus datos personales de FlowAI CRM. Cumplimos con el RGPD, LGPD y los requisitos de la plataforma de Meta.",
};

// This page is REQUIRED by Meta for Facebook Login / Instagram OAuth apps.
// Meta requires a data deletion callback URL in app settings.
// URL: https://www.flowaicrm.com/data-deletion

export default function DataDeletionPage() {
  return (
    <div className="landing-dark min-h-screen" style={{ background: "var(--ld-bg)", color: "#e4e4e7" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--ld-border-1)", background: "var(--ld-surface-1)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #10b981, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span style={{ fontWeight: "700", fontSize: "18px", color: "#fafafa" }}>FlowAI CRM</span>
          </Link>
          <nav style={{ display: "flex", gap: "24px" }}>
            <Link href="/privacy" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px" }}>Privacidad</Link>
            <Link href="/terms" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px" }}>Términos</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.06) 0%, transparent 60%)", borderBottom: "1px solid var(--ld-border-0)", padding: "64px 24px 48px" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "100px", padding: "6px 16px", marginBottom: "24px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span style={{ fontSize: "13px", color: "#ef4444", fontWeight: "500" }}>Derecho al Olvido — RGPD / LGPD</span>
          </div>
          <h1 style={{ fontSize: "42px", fontWeight: "800", color: "#fafafa", margin: "0 0 16px", lineHeight: "1.1" }}>
            Eliminación de Datos
          </h1>
          <p style={{ fontSize: "18px", color: "#a1a1aa", maxWidth: "560px", margin: "0 auto", lineHeight: "1.7" }}>
            Tienes el derecho a solicitar la eliminación de todos tus datos personales de FlowAI CRM. Esta página explica cómo hacerlo.
          </p>
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>

          {/* Process cards */}
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#fafafa", marginBottom: "24px" }}>Cómo solicitar la eliminación de tus datos</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[
                {
                  step: "1",
                  title: "Desde la aplicación",
                  desc: "Accede a tu cuenta → Configuración → Cuenta → \"Eliminar mi cuenta y datos\". La eliminación se procesará en un plazo de 30 días.",
                  color: "#10b981",
                },
                {
                  step: "2",
                  title: "Por correo electrónico",
                  desc: "Envía un correo a privacy@flowaicrm.com con el asunto \"Solicitud de eliminación de datos\" desde el correo asociado a tu cuenta. Responderemos en un plazo de 72 horas.",
                  color: "#06b6d4",
                },
                {
                  step: "3",
                  title: "Usuarios de Meta (Facebook/Instagram)",
                  desc: "Si conectaste FlowAI CRM a través de Facebook o Instagram, puedes también solicitar la eliminación de datos directamente desde la configuración de tu cuenta de Facebook → Aplicaciones y sitios web → Eliminar FlowAI CRM.",
                  color: "#8b5cf6",
                },
              ].map((item) => (
                <div key={item.step} style={{ display: "flex", gap: "20px", padding: "24px", background: "var(--ld-surface-1)", borderRadius: "12px", border: "1px solid var(--ld-border-1)" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: `${item.color}20`, border: `1px solid ${item.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0" as const }}>
                    <span style={{ fontSize: "15px", fontWeight: "700", color: item.color }}>{item.step}</span>
                  </div>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#fafafa", margin: "0 0 8px" }}>{item.title}</h3>
                    <p style={{ fontSize: "14px", color: "#a1a1aa", margin: "0", lineHeight: "1.7" }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What gets deleted */}
          <div style={{ padding: "28px", background: "var(--ld-surface-1)", borderRadius: "12px", border: "1px solid var(--ld-border-1)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#fafafa", marginBottom: "20px" }}>
              ¿Qué datos se eliminan?
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                { label: "Datos de perfil y cuenta", included: true },
                { label: "Conversaciones y mensajes", included: true },
                { label: "Contactos del CRM", included: true },
                { label: "Automatizaciones y flujos", included: true },
                { label: "Tokens de acceso de Meta", included: true },
                { label: "Historial de pagos (Stripe)", included: false, note: "Conservados por obligación legal" },
                { label: "Registros de auditoría legal", included: false, note: "Conservados por obligación legal" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: item.included ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0" as const, marginTop: "2px" }}>
                    {item.included ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: "14px", color: item.included ? "#e4e4e7" : "#71717a" }}>{item.label}</span>
                    {item.note && <p style={{ fontSize: "12px", color: "#52525b", margin: "2px 0 0" }}>{item.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timelines */}
          <div style={{ padding: "28px", background: "var(--ld-surface-1)", borderRadius: "12px", border: "1px solid var(--ld-border-1)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#fafafa", marginBottom: "20px" }}>
              Plazos de eliminación
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { type: "Datos de cuenta y perfil", days: "30 días" },
                { type: "Conversaciones y mensajes", days: "30 días" },
                { type: "Tokens de acceso de Meta", days: "Inmediato (al desconectar)" },
                { type: "Copias de seguridad cifradas", days: "90 días" },
                { type: "Registros financieros (Stripe)", days: "7 años (obligación legal)" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "12px", borderBottom: i < 4 ? "1px solid var(--ld-border-0)" : "none" }}>
                  <span style={{ fontSize: "14px", color: "#a1a1aa" }}>{item.type}</span>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "3px 10px", borderRadius: "100px" }}>{item.days}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Confirmation */}
          <div style={{ padding: "28px", background: "rgba(16,185,129,0.05)", borderRadius: "12px", border: "1px solid rgba(16,185,129,0.15)" }}>
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0" as const }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#fafafa", margin: "0 0 8px" }}>Confirmación de eliminación</h3>
                <p style={{ fontSize: "14px", color: "#a1a1aa", margin: "0", lineHeight: "1.7" }}>
                  Tras procesar tu solicitud, recibirás un correo de confirmación con el detalle de los datos eliminados. Si en 30 días no recibes confirmación, contacta con nosotros en <a href="mailto:privacy@flowaicrm.com" style={{ color: "#10b981" }}>privacy@flowaicrm.com</a>.
                </p>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div style={{ padding: "28px", background: "var(--ld-surface-1)", borderRadius: "12px", border: "1px solid var(--ld-border-1)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#fafafa", marginBottom: "16px" }}>Contacto</h2>
            <p style={{ fontSize: "14px", color: "#a1a1aa", margin: "0 0 16px", lineHeight: "1.7" }}>
              Para cualquier consulta sobre la eliminación de datos o el ejercicio de tus derechos:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <a href="mailto:privacy@flowaicrm.com" style={{ display: "flex", alignItems: "center", gap: "10px", color: "#10b981", textDecoration: "none", fontSize: "14px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                privacy@flowaicrm.com
              </a>
              <a href="https://www.flowaicrm.com" style={{ display: "flex", alignItems: "center", gap: "10px", color: "#10b981", textDecoration: "none", fontSize: "14px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                www.flowaicrm.com
              </a>
            </div>
          </div>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: "64px", paddingTop: "32px", borderTop: "1px solid var(--ld-border-1)", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <Link href="/privacy" style={{ color: "#10b981", textDecoration: "none", fontSize: "14px" }}>Política de Privacidad</Link>
          <Link href="/terms" style={{ color: "#10b981", textDecoration: "none", fontSize: "14px" }}>Términos de Servicio</Link>
          <Link href="/" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px" }}>← Volver al inicio</Link>
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad — FlowAI CRM",
  description: "Política de privacidad de FlowAI CRM. Cómo recopilamos, usamos y protegemos tus datos personales.",
};

export default function PrivacyPage() {
  const lastUpdated = "9 de junio de 2026";

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
            <Link href="/terms" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px" }}>Términos</Link>
            <Link href="/data-deletion" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px" }}>Eliminación de datos</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.08) 0%, transparent 60%)", borderBottom: "1px solid var(--ld-border-0)", padding: "64px 24px 48px" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "100px", padding: "6px 16px", marginBottom: "24px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
            <span style={{ fontSize: "13px", color: "#10b981", fontWeight: "500" }}>Actualizado el {lastUpdated}</span>
          </div>
          <h1 style={{ fontSize: "42px", fontWeight: "800", color: "#fafafa", margin: "0 0 16px", lineHeight: "1.1" }}>
            Política de Privacidad
          </h1>
          <p style={{ fontSize: "18px", color: "#a1a1aa", maxWidth: "560px", margin: "0 auto", lineHeight: "1.7" }}>
            Tu privacidad es fundamental para nosotros. Esta política explica cómo FlowAI CRM recopila, usa y protege tu información.
          </p>
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>

          <Section title="1. Información que Recopilamos" icon="📋">
            <p>Recopilamos información que tú nos proporcionas directamente, información que se genera automáticamente al usar nuestros servicios, y datos de terceros con los que te conectas.</p>
            <ul>
              <li><strong>Datos de cuenta:</strong> nombre, correo electrónico, contraseña (encriptada), foto de perfil.</li>
              <li><strong>Datos de mensajería:</strong> mensajes, conversaciones y archivos adjuntos gestionados a través de la plataforma (WhatsApp, Instagram, Facebook Messenger).</li>
              <li><strong>Datos de uso:</strong> registros de acceso, páginas visitadas, funciones utilizadas, dirección IP y tipo de navegador.</li>
              <li><strong>Datos de integración:</strong> tokens de acceso de Meta (Facebook/Instagram) necesarios para operar las integraciones de mensajería.</li>
              <li><strong>Datos de facturación:</strong> procesados de forma segura por Stripe. No almacenamos números de tarjeta de crédito.</li>
            </ul>
          </Section>

          <Section title="2. Cómo Usamos tu Información" icon="⚙️">
            <p>Usamos la información recopilada para los siguientes fines:</p>
            <ul>
              <li>Proveer, mantener y mejorar los servicios de FlowAI CRM.</li>
              <li>Gestionar tu cuenta y autenticar tu identidad.</li>
              <li>Enviar comunicaciones de servicio (actualizaciones, alertas de seguridad, soporte técnico).</li>
              <li>Procesar pagos y gestionar suscripciones.</li>
              <li>Analizar el uso de la plataforma para mejorar la experiencia de usuario.</li>
              <li>Cumplir con obligaciones legales y prevenir fraudes.</li>
            </ul>
            <p><strong>No vendemos ni alquilamos tus datos personales a terceros.</strong></p>
          </Section>

          <Section title="3. Integraciones con Meta (Facebook e Instagram)" icon="🔗">
            <p>Cuando conectas tu cuenta de Instagram o Facebook a FlowAI CRM:</p>
            <ul>
              <li>Recibimos y almacenamos tokens de acceso de Meta, encriptados con AES-256-GCM, necesarios para gestionar mensajes en tu nombre.</li>
              <li>Accedemos a mensajes directos, comentarios y datos de tu cuenta de Instagram Business a través de las APIs oficiales de Meta.</li>
              <li>Los datos de conversaciones de Meta se almacenan en nuestros servidores únicamente para mostrártelos en el CRM.</li>
              <li>Puedes revocar el acceso en cualquier momento desconectando tu cuenta desde Configuración → Instagram.</li>
            </ul>
            <p>Cumplimos con la Política de Datos de Meta y la Política de Plataforma de Meta. Los datos obtenidos de las APIs de Meta solo se usan para los fines autorizados.</p>
          </Section>

          <Section title="4. Compartición de Datos" icon="🤝">
            <p>Solo compartimos tus datos en los siguientes casos:</p>
            <ul>
              <li><strong>Proveedores de servicios:</strong> Supabase (base de datos), Vercel (hosting), Upstash/Redis (procesamiento de colas), Stripe (pagos). Todos bajo acuerdos de confidencialidad.</li>
              <li><strong>APIs de Meta:</strong> cuando enviamos o recibimos mensajes en tu nombre a través de las integraciones de WhatsApp, Instagram y Messenger.</li>
              <li><strong>Requisitos legales:</strong> si la ley lo exige o para proteger los derechos y seguridad de FlowAI CRM y sus usuarios.</li>
            </ul>
          </Section>

          <Section title="5. Seguridad de los Datos" icon="🔒">
            <p>Implementamos medidas de seguridad técnicas y organizativas para proteger tu información:</p>
            <ul>
              <li>Todos los tokens de acceso de terceros (Meta, etc.) se encriptan con AES-256-GCM antes de almacenarse.</li>
              <li>Las comunicaciones se realizan exclusivamente por HTTPS/TLS.</li>
              <li>El acceso a la base de datos está protegido por políticas de seguridad a nivel de fila (RLS).</li>
              <li>Las contraseñas se almacenan usando bcrypt con sal.</li>
              <li>Realizamos revisiones de seguridad periódicas.</li>
            </ul>
          </Section>

          <Section title="6. Retención de Datos" icon="🗂️">
            <p>Conservamos tus datos mientras tu cuenta esté activa o según sea necesario para prestarte servicios. Cuando cancelas tu cuenta:</p>
            <ul>
              <li>Los datos de tu cuenta se eliminan dentro de los 30 días siguientes a la solicitud.</li>
              <li>Los datos de mensajería se eliminan dentro de los 90 días.</li>
              <li>Podemos conservar ciertos datos por períodos más largos si lo exige la ley.</li>
            </ul>
          </Section>

          <Section title="7. Tus Derechos (RGPD y LGPD)" icon="✅">
            <p>Dependiendo de tu ubicación, tienes los siguientes derechos:</p>
            <ul>
              <li><strong>Acceso:</strong> solicitar una copia de tus datos personales.</li>
              <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
              <li><strong>Eliminación:</strong> solicitar la eliminación de tus datos (ver también nuestra página de <Link href="/data-deletion" style={{ color: "#10b981" }}>Eliminación de Datos</Link>).</li>
              <li><strong>Portabilidad:</strong> recibir tus datos en formato estructurado.</li>
              <li><strong>Oposición:</strong> oponerte al procesamiento de tus datos en determinadas circunstancias.</li>
            </ul>
            <p>Para ejercer estos derechos, contacta con nosotros en: <a href="mailto:privacy@flowaicrm.com" style={{ color: "#10b981" }}>privacy@flowaicrm.com</a></p>
          </Section>

          <Section title="8. Cookies" icon="🍪">
            <p>Usamos cookies esenciales para el funcionamiento de la plataforma (autenticación de sesión) y cookies analíticas para mejorar la experiencia. No usamos cookies publicitarias de terceros.</p>
          </Section>

          <Section title="9. Cambios a esta Política" icon="📝">
            <p>Podemos actualizar esta política periódicamente. Te notificaremos sobre cambios significativos por correo electrónico o mediante un aviso prominente en la plataforma. El uso continuado de FlowAI CRM después de los cambios constituye aceptación de la nueva política.</p>
          </Section>

          <Section title="10. Contacto" icon="📧">
            <p>Si tienes preguntas sobre esta política de privacidad o el tratamiento de tus datos, contáctanos:</p>
            <div style={{ marginTop: "16px", padding: "20px 24px", background: "var(--ld-surface-2)", borderRadius: "12px", border: "1px solid var(--ld-border-1)" }}>
              <p style={{ margin: "0 0 8px" }}><strong>FlowAI CRM</strong></p>
              <p style={{ margin: "0 0 4px" }}>Email: <a href="mailto:privacy@flowaicrm.com" style={{ color: "#10b981" }}>privacy@flowaicrm.com</a></p>
              <p style={{ margin: "0" }}>Web: <a href="https://www.flowaicrm.com" style={{ color: "#10b981" }}>www.flowaicrm.com</a></p>
            </div>
          </Section>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: "64px", paddingTop: "32px", borderTop: "1px solid var(--ld-border-1)", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <Link href="/terms" style={{ color: "#10b981", textDecoration: "none", fontSize: "14px" }}>Términos de Servicio</Link>
          <Link href="/data-deletion" style={{ color: "#10b981", textDecoration: "none", fontSize: "14px" }}>Eliminación de Datos</Link>
          <Link href="/" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px" }}>← Volver al inicio</Link>
        </div>
      </main>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <span style={{ fontSize: "22px" }}>{icon}</span>
        <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#fafafa", margin: "0" }}>{title}</h2>
      </div>
      <div style={{
        fontSize: "15px",
        lineHeight: "1.8",
        color: "#a1a1aa",
        padding: "24px",
        background: "var(--ld-surface-1)",
        borderRadius: "12px",
        border: "1px solid var(--ld-border-1)",
      }}>
        <style>{`
          .legal-content p { margin: 0 0 12px; }
          .legal-content ul { margin: 8px 0 12px 0; padding-left: 20px; }
          .legal-content li { margin-bottom: 8px; }
          .legal-content strong { color: #e4e4e7; }
          .legal-content a { color: #10b981; }
          .legal-content p:last-child { margin-bottom: 0; }
        `}</style>
        <div className="legal-content">{children}</div>
      </div>
    </section>
  );
}

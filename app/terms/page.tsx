import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos de Servicio — FlowAI CRM",
  description: "Términos y condiciones de uso de FlowAI CRM. Conoce tus derechos y obligaciones al usar nuestra plataforma.",
};

export default function TermsPage() {
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
            <Link href="/privacy" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px" }}>Privacidad</Link>
            <Link href="/data-deletion" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "14px" }}>Eliminación de datos</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.07) 0%, transparent 60%)", borderBottom: "1px solid var(--ld-border-0)", padding: "64px 24px 48px" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: "100px", padding: "6px 16px", marginBottom: "24px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#06b6d4" }} />
            <span style={{ fontSize: "13px", color: "#06b6d4", fontWeight: "500" }}>Actualizado el {lastUpdated}</span>
          </div>
          <h1 style={{ fontSize: "42px", fontWeight: "800", color: "#fafafa", margin: "0 0 16px", lineHeight: "1.1" }}>
            Términos de Servicio
          </h1>
          <p style={{ fontSize: "18px", color: "#a1a1aa", maxWidth: "560px", margin: "0 auto", lineHeight: "1.7" }}>
            Al usar FlowAI CRM, aceptas estos términos. Por favor, léelos detenidamente antes de usar la plataforma.
          </p>
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>

          <Section title="1. Aceptación de los Términos" icon="✍️">
            <p>Al acceder o usar FlowAI CRM (&quot;el Servicio&quot;, &quot;la Plataforma&quot;), aceptas quedar vinculado por estos Términos de Servicio y nuestra <Link href="/privacy" style={{ color: "#10b981" }}>Política de Privacidad</Link>. Si no estás de acuerdo con alguna parte de estos términos, no debes usar el Servicio.</p>
            <p>Estos términos se aplican a todos los usuarios, incluyendo visitantes, clientes y cualquier persona que acceda o use el Servicio.</p>
          </Section>

          <Section title="2. Descripción del Servicio" icon="🚀">
            <p>FlowAI CRM es una plataforma de gestión de relaciones con clientes (CRM) que integra canales de mensajería (WhatsApp, Instagram, Facebook Messenger) con herramientas de inteligencia artificial para automatizar conversaciones y gestionar contactos.</p>
            <p>El Servicio incluye:</p>
            <ul>
              <li>Bandeja unificada de mensajes de WhatsApp, Instagram y Facebook Messenger.</li>
              <li>Automatizaciones y flujos de conversación con IA.</li>
              <li>Gestión de contactos y conversaciones.</li>
              <li>Herramientas de análisis y reportes.</li>
              <li>Integraciones con plataformas de terceros (Meta, OpenAI, etc.).</li>
            </ul>
          </Section>

          <Section title="3. Registro y Cuentas" icon="👤">
            <p>Para usar FlowAI CRM debes crear una cuenta. Al hacerlo, te comprometes a:</p>
            <ul>
              <li>Proporcionar información precisa, actual y completa durante el registro.</li>
              <li>Mantener la seguridad de tu contraseña y notificarnos de inmediato cualquier uso no autorizado.</li>
              <li>Ser responsable de todas las actividades que ocurran bajo tu cuenta.</li>
              <li>No crear cuentas mediante medios automatizados o bajo pretextos falsos.</li>
            </ul>
            <p>Nos reservamos el derecho de suspender o terminar cuentas que violen estos términos.</p>
          </Section>

          <Section title="4. Uso Aceptable" icon="✅">
            <p>Al usar FlowAI CRM, te comprometes a NO:</p>
            <ul>
              <li>Enviar spam, mensajes no solicitados o comunicaciones masivas sin consentimiento de los destinatarios.</li>
              <li>Violar las Políticas de Uso de Meta (Facebook, Instagram, WhatsApp Business).</li>
              <li>Usar el Servicio para actividades ilegales, fraudulentas o dañinas.</li>
              <li>Intentar acceder a cuentas de otros usuarios sin autorización.</li>
              <li>Hacer ingeniería inversa, descompilar o desensamblar el Servicio.</li>
              <li>Interferir con el funcionamiento del Servicio o sus servidores.</li>
              <li>Revender o sublicenciar el acceso al Servicio sin autorización escrita.</li>
            </ul>
          </Section>

          <Section title="5. Integraciones con Terceros (Meta)" icon="🔗">
            <p>FlowAI CRM integra las APIs de Meta (Facebook, Instagram, WhatsApp). Al usar estas integraciones:</p>
            <ul>
              <li>Aceptas los Términos de Servicio y Políticas de Meta, incluyendo las Políticas de la Plataforma de Meta.</li>
              <li>Eres responsable de usar las integraciones de forma conforme a las políticas de Meta.</li>
              <li>Entiendes que Meta puede modificar o revocar el acceso a sus APIs en cualquier momento.</li>
              <li>FlowAI CRM no se responsabiliza por interrupciones del servicio causadas por cambios en las APIs de Meta.</li>
            </ul>
          </Section>

          <Section title="6. Planes y Facturación" icon="💳">
            <p>FlowAI CRM ofrece diferentes planes de suscripción. Al suscribirte a un plan de pago:</p>
            <ul>
              <li>Los pagos se procesan de forma segura a través de Stripe.</li>
              <li>Las suscripciones se renuevan automáticamente al final de cada período de facturación.</li>
              <li>Puedes cancelar tu suscripción en cualquier momento desde Configuración → Facturación.</li>
              <li>No se emiten reembolsos por períodos parciales, salvo requerimiento legal.</li>
              <li>Nos reservamos el derecho de cambiar los precios con un preaviso de 30 días.</li>
            </ul>
          </Section>

          <Section title="7. Propiedad Intelectual" icon="©️">
            <p>FlowAI CRM y todo su contenido, características y funcionalidades son propiedad de FlowAI CRM y están protegidos por leyes de propiedad intelectual. No puedes:</p>
            <ul>
              <li>Reproducir, distribuir o crear obras derivadas sin autorización escrita.</li>
              <li>Usar nuestras marcas, logotipos o nombres comerciales sin permiso previo.</li>
            </ul>
            <p>Los datos que tú introduces en la plataforma (conversaciones, contactos, etc.) siguen siendo de tu propiedad. Nos otorgas una licencia limitada para procesarlos con el fin de prestarte el Servicio.</p>
          </Section>

          <Section title="8. Limitación de Responsabilidad" icon="⚖️">
            <p>En la máxima medida permitida por la ley:</p>
            <ul>
              <li>FlowAI CRM se proporciona &quot;tal como está&quot; sin garantías de ningún tipo.</li>
              <li>No garantizamos que el Servicio sea ininterrumpido, libre de errores o completamente seguro.</li>
              <li>No somos responsables de pérdidas de datos, lucro cesante o daños indirectos.</li>
              <li>Nuestra responsabilidad total no excederá el importe pagado por el Servicio en los últimos 12 meses.</li>
            </ul>
          </Section>

          <Section title="9. Terminación" icon="🚪">
            <p>Puedes terminar tu cuenta en cualquier momento. Podemos suspender o terminar tu acceso si:</p>
            <ul>
              <li>Violas estos Términos de Servicio.</li>
              <li>Tu uso pone en riesgo la seguridad del Servicio o de otros usuarios.</li>
              <li>Hay falta de pago de tu suscripción.</li>
            </ul>
            <p>Tras la terminación, tu derecho a usar el Servicio cesa inmediatamente. Los datos se conservarán según lo indicado en nuestra <Link href="/privacy" style={{ color: "#10b981" }}>Política de Privacidad</Link>.</p>
          </Section>

          <Section title="10. Ley Aplicable y Resolución de Disputas" icon="🏛️">
            <p>Estos términos se rigen por la legislación española y de la Unión Europea. Para usuarios de Brasil, se aplica también el Código de Defensa del Consumidor y la LGPD donde corresponda.</p>
            <p>Cualquier disputa que no pueda resolverse de mutuo acuerdo se someterá a la jurisdicción de los tribunales competentes.</p>
          </Section>

          <Section title="11. Cambios a los Términos" icon="📝">
            <p>Podemos actualizar estos términos en cualquier momento. Te notificaremos sobre cambios materiales con al menos 30 días de antelación por correo electrónico. El uso continuado del Servicio tras la fecha de entrada en vigor de los nuevos términos constituye tu aceptación.</p>
          </Section>

          <Section title="12. Contacto" icon="📧">
            <p>Para preguntas sobre estos Términos de Servicio:</p>
            <div style={{ marginTop: "16px", padding: "20px 24px", background: "var(--ld-surface-2)", borderRadius: "12px", border: "1px solid var(--ld-border-1)" }}>
              <p style={{ margin: "0 0 8px" }}><strong>FlowAI CRM</strong></p>
              <p style={{ margin: "0 0 4px" }}>Email: <a href="mailto:legal@flowaicrm.com" style={{ color: "#10b981" }}>legal@flowaicrm.com</a></p>
              <p style={{ margin: "0" }}>Web: <a href="https://www.flowaicrm.com" style={{ color: "#10b981" }}>www.flowaicrm.com</a></p>
            </div>
          </Section>

        </div>

        {/* Footer nav */}
        <div style={{ marginTop: "64px", paddingTop: "32px", borderTop: "1px solid var(--ld-border-1)", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <Link href="/privacy" style={{ color: "#10b981", textDecoration: "none", fontSize: "14px" }}>Política de Privacidad</Link>
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

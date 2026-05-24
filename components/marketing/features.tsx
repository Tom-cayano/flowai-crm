import { MessageSquare, Zap, BarChart3, Users, Bot, ShieldCheck } from "lucide-react";
import { FadeUp, StaggerGrid, StaggerItem } from "./motion-section";

const features = [
  {
    icon: MessageSquare,
    title: "Bandeja omnicanal unificada",
    description:
      "Todos tus chats de WhatsApp en una sola bandeja compartida. Asigna agentes, añade etiquetas, prioriza conversaciones y nunca pierdas un lead.",
    color: "#10b981",
  },
  {
    icon: Bot,
    title: "Automatizaciones con IA generativa",
    description:
      "Flujos de trabajo que responden, califican y escalan automáticamente. La IA aprende de tus conversaciones y mejora con cada interacción.",
    color: "#06b6d4",
  },
  {
    icon: Zap,
    title: "Campañas de difusión masiva",
    description:
      "Envía campañas segmentadas con plantillas aprobadas por Meta. Analiza apertura, clics y conversiones en tiempo real desde el dashboard.",
    color: "#8b5cf6",
  },
  {
    icon: Users,
    title: "CRM de contactos avanzado",
    description:
      "Perfiles ricos con historial completo, campos personalizados, segmentación avanzada y sincronización automática desde cada conversación.",
    color: "#f59e0b",
  },
  {
    icon: BarChart3,
    title: "Analítica en tiempo real",
    description:
      "Dashboards con métricas de equipo, tiempo de respuesta, CSAT, evolución de leads y rendimiento de campañas. Exporta con un clic.",
    color: "#ec4899",
  },
  {
    icon: ShieldCheck,
    title: "Seguridad y cumplimiento RGPD",
    description:
      "Cifrado extremo a extremo, control de acceso por roles, auditoría completa de acciones y cumplimiento total del RGPD europeo.",
    color: "#10b981",
  },
];

export function Features() {
  return (
    <section id="features" className="py-28 relative bg-[#09090b]">
      {/* Top gradient divider */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section label */}
        <FadeUp className="text-center mb-16">
          <p className="text-[13px] font-medium text-[#10b981] uppercase tracking-[0.12em] mb-3">
            Funcionalidades
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight mb-5">
            Todo lo que necesitas,
            <br />
            <span className="bg-gradient-to-r from-[#10b981] to-[#06b6d4] bg-clip-text text-transparent">
              nada que no necesitas.
            </span>
          </h2>
          <p className="max-w-xl mx-auto text-zinc-400 text-lg leading-relaxed">
            FlowAI combina mensajería, CRM e inteligencia artificial en una plataforma
            tan poderosa como fácil de usar.
          </p>
        </FadeUp>

        {/* Feature grid */}
        <StaggerGrid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <StaggerItem key={f.title}>
              <div className="group relative h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04] hover:-translate-y-0.5 cursor-default">
                {/* Icon */}
                <div
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl mb-5"
                  style={{
                    background: `${f.color}14`,
                    border: `1px solid ${f.color}25`,
                  }}
                >
                  <f.icon className="h-4 w-4" style={{ color: f.color }} />
                </div>

                <h3 className="text-[15px] font-semibold text-white mb-2.5">
                  {f.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {f.description}
                </p>

                {/* Hover glow */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse 60% 40% at 30% 0%, ${f.color}06, transparent)`,
                  }}
                />
              </div>
            </StaggerItem>
          ))}
        </StaggerGrid>
      </div>
    </section>
  );
}

import { FadeUp, StaggerGrid, StaggerItem } from "./motion-section";

const testimonials = [
  {
    quote:
      "FlowAI transformó por completo cómo nuestro equipo gestiona WhatsApp. Pasamos de perder leads a cerrar un 40% más de ventas en el primer trimestre. La IA que sugiere respuestas es un cambio de juego.",
    name: "Carlos Mendoza",
    role: "Director de Ventas",
    company: "Grupo Innova",
    initials: "CM",
    color: "#10b981",
  },
  {
    quote:
      "Probamos 3 herramientas antes de FlowAI. Ninguna se integraba tan bien con WhatsApp Business. En 2 semanas multiplicamos por 3 la velocidad de respuesta de nuestro equipo de soporte.",
    name: "Ana García Ruiz",
    role: "CEO & Cofundadora",
    company: "Boutique Digital SL",
    initials: "AG",
    color: "#06b6d4",
  },
  {
    quote:
      "La automatización con IA nos permite manejar 10 veces más conversaciones sin contratar más agentes. El ROI fue visible desde el primer mes. Imprescindible para cualquier equipo B2B.",
    name: "Luis Paredes",
    role: "Head of Customer Success",
    company: "Mercado Latam",
    initials: "LP",
    color: "#8b5cf6",
  },
];

const stars = Array.from({ length: 5 });

export function Testimonials() {
  return (
    <section id="testimonials" className="py-28 relative bg-[#09090b]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-16">
          <p className="text-[13px] font-medium text-[#10b981] uppercase tracking-[0.12em] mb-3">
            Clientes
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight mb-5">
            Lo que dicen
            <br />
            <span className="bg-gradient-to-r from-[#10b981] to-[#06b6d4] bg-clip-text text-transparent">
              nuestros clientes.
            </span>
          </h2>
          <p className="max-w-xl mx-auto text-zinc-400 text-lg">
            Más de 3.200 equipos en Europa y Latam confían en FlowAI para sus ventas por WhatsApp.
          </p>
        </FadeUp>

        <StaggerGrid className="grid md:grid-cols-3 gap-4">
          {testimonials.map((t) => (
            <StaggerItem key={t.name}>
              <div className="group relative h-full flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7 transition-all duration-300 hover:border-white/[0.11] hover:bg-white/[0.04]">
                {/* Stars */}
                <div className="flex gap-1 mb-5">
                  {stars.map((_, i) => (
                    <svg key={i} className="h-4 w-4 text-[#10b981]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>

                {/* Quote */}
                <blockquote className="flex-1 text-[15px] text-zinc-300 leading-relaxed mb-6">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{
                      background: `${t.color}20`,
                      border: `1px solid ${t.color}30`,
                      color: t.color,
                    }}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white leading-tight">{t.name}</p>
                    <p className="text-xs text-zinc-500 leading-tight mt-0.5">
                      {t.role} · {t.company}
                    </p>
                  </div>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerGrid>
      </div>
    </section>
  );
}

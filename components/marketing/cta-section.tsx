import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeUp } from "./motion-section";

export function CtaSection() {
  return (
    <section className="py-28 relative overflow-hidden bg-[#09090b]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      {/* Center glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(16,185,129,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <FadeUp>
          <h2 className="text-3xl sm:text-[52px] font-bold text-white tracking-tight leading-[1.08] mb-6">
            Empieza a vender más
            <br />
            <span className="bg-gradient-to-r from-[#10b981] via-[#34d399] to-[#06b6d4] bg-clip-text text-transparent">
              desde hoy mismo.
            </span>
          </h2>
          <p className="text-lg text-zinc-400 mb-10 max-w-xl mx-auto leading-relaxed">
            Únete a más de 3.200 empresas que usan FlowAI CRM para convertir conversaciones
            de WhatsApp en ingresos reales. Sin configuración complicada.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Button
              size="lg"
              asChild
              className="h-12 px-8 bg-[#10b981] text-[#030712] hover:bg-[#0ea572] font-bold text-[15px] shadow-lg shadow-[#10b981]/15 hover:shadow-[#10b981]/25 transition-all duration-200 hover:scale-[1.02]"
            >
              <Link href="/signup">
                Crear cuenta gratis
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 px-8 border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/[0.04] hover:text-white font-medium text-[15px] transition-all duration-200"
            >
              <Link href="/login">Ya tengo cuenta</Link>
            </Button>
          </div>

          <p className="text-sm text-zinc-600">
            14 días gratis · Sin tarjeta de crédito · Cancela cuando quieras
          </p>
        </FadeUp>
      </div>
    </section>
  );
}

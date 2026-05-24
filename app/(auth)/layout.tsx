import type { Metadata } from "next";
import { LogoFull } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Iniciar sesión — FlowAI CRM",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left — branding panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-border relative overflow-hidden"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 30% 40%, rgba(16,185,129,0.10), transparent), radial-gradient(ellipse 60% 50% at 70% 70%, rgba(6,182,212,0.07), transparent), #09090b",
        }}
      >
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative">
          <LogoFull />
        </div>

        <div className="relative space-y-6">
          <div className="flex gap-1 mb-4">
            {[1,2,3,4,5].map((i) => (
              <svg key={i} className="h-4 w-4 text-[#10b981]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
            ))}
          </div>
          <blockquote className="text-xl font-semibold text-foreground leading-relaxed">
            &ldquo;FlowAI CRM transformó la forma en que nuestro equipo se comunica con los clientes.
            Los tiempos de respuesta cayeron un 60% en el primer mes.&rdquo;
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10b981] to-[#06b6d4] flex items-center justify-center text-sm font-bold text-[#030712]">
              LT
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Lisa Tanaka</p>
              <p className="text-xs text-muted-foreground">Directora de Éxito del Cliente, NexTech Japan</p>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © {new Date().getFullYear()} FlowAI CRM. Todos los derechos reservados.
        </p>
      </div>

      {/* Right — auth form */}
      <div className="flex flex-1 items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <LogoFull />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

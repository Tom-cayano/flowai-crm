import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { Hero } from "@/components/marketing/hero";
import { Features } from "@/components/marketing/features";
import { Testimonials } from "@/components/marketing/testimonials";
import { Pricing } from "@/components/marketing/pricing";
import { CtaSection } from "@/components/marketing/cta-section";
import { Footer } from "@/components/marketing/footer";

export const metadata: Metadata = {
  title: "FlowAI CRM — El CRM con IA para WhatsApp",
  description:
    "Gestiona conversaciones de WhatsApp, automatiza respuestas con IA y convierte leads en clientes. La plataforma que usan +3.200 equipos de ventas.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-foreground">
      <MarketingNavbar />
      <main>
        <Hero />
        <Features />
        <Testimonials />
        <Pricing />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}

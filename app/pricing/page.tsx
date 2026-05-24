import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { Pricing } from "@/components/marketing/pricing";
import { Footer } from "@/components/marketing/footer";

export const metadata: Metadata = {
  title:       "Precios — FlowAI CRM",
  description: "Elige el plan que mejor se adapta a tu equipo. Empieza gratis, sin tarjeta de crédito.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-foreground">
      <MarketingNavbar />
      <main className="pt-16">
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}

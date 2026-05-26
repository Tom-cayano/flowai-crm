import type { Metadata } from "next";

import { MarketingNavbar } from "@/components/marketing/navbar";
import { Hero } from "@/components/marketing/hero";
import { ChannelsSection } from "@/components/marketing/channels-section";
import { AISection } from "@/components/marketing/ai-section";
import { FeaturesV2 } from "@/components/marketing/features-v2";
import { CtaSection } from "@/components/marketing/cta-section";
import { Footer } from "@/components/marketing/footer";

export const metadata: Metadata = {
  title: "FlowAI CRM — CRM con IA para WhatsApp, Instagram y Messenger",
  description:
    "Gestiona todos tus canales desde una bandeja unificada con IA. WhatsApp, Instagram, Messenger y TikTok en un solo sistema. Automatiza respuestas, cierra más ventas.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#07070a] text-foreground">
      <MarketingNavbar />
      <main>
        <Hero />
        <ChannelsSection />
        <AISection />
        <FeaturesV2 />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}

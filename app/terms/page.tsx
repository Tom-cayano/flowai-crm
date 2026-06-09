import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | FlowAI CRM",
  description: "Terms of Service for FlowAI CRM.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#07070a] text-foreground">
      <MarketingNavbar />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-24 w-full">
        <div className="prose prose-invert prose-lg max-w-none">
          <h1 className="text-4xl font-bold mb-8 text-white">Terms of Service</h1>
          
          <p className="text-gray-400 mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <p>
            Welcome to FlowAI CRM. By accessing or using our website and services, you agree to be bound by these Terms of Service.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">1. Acceptance of Terms</h2>
          <p>
            By creating an account or otherwise using FlowAI CRM, you agree to these Terms. If you do not agree, you must not use our services.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">2. Description of Service</h2>
          <p>
            FlowAI CRM provides a platform for managing customer conversations across WhatsApp, Instagram, and Facebook Messenger. We connect to these third-party APIs (such as Meta's Graph API) on your behalf, strictly based on the permissions you grant.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">3. User Responsibilities</h2>
          <p>
            You are responsible for:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-6">
            <li>Maintaining the confidentiality of your account login information.</li>
            <li>Complying with all applicable laws, as well as the terms of service of third-party platforms (like Meta's Platform Terms).</li>
            <li>Ensuring that the content you send through our platform does not violate anti-spam laws or platform policies.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">4. Meta Integration</h2>
          <p>
            Our service interacts with Meta's APIs. By using FlowAI CRM, you also agree to adhere to Meta's Commercial Terms and Platform Terms. We are not responsible for any restrictions or bans placed on your Meta accounts due to your misuse of the platform.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">5. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your access to the service at any time if we determine that you have violated these Terms or any applicable laws.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">6. Changes to Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the service after changes implies your acceptance of the new terms.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">7. Contact Information</h2>
          <p>
            For any questions or concerns regarding these terms, please contact support@flowaicrm.com or view our <Link href="/privacy" className="text-blue-400 hover:underline">Privacy Policy</Link>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

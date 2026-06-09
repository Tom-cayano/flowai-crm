import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | FlowAI CRM",
  description: "Privacy Policy for FlowAI CRM.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#07070a] text-foreground">
      <MarketingNavbar />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-24 w-full">
        <div className="prose prose-invert prose-lg max-w-none">
          <h1 className="text-4xl font-bold mb-8 text-white">Privacy Policy</h1>
          
          <p className="text-gray-400 mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <p>
            FlowAI CRM ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how your personal information is collected, used, and disclosed by FlowAI CRM.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">1. Information We Collect</h2>
          <p>
            When you connect your Facebook or Instagram account to FlowAI CRM, we receive access to certain information from your Meta profile based on the permissions you grant us. This includes:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-6">
            <li>Basic profile information (name, profile picture)</li>
            <li>Information about your connected Facebook Pages and Instagram Business Accounts</li>
            <li>Messages, comments, and interactions from your audience to allow our CRM to process them</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">2. How We Use Your Information</h2>
          <p>
            We use the information we collect to:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-6">
            <li>Provide, operate, and maintain our CRM services</li>
            <li>Process and display your conversations and messages within the platform</li>
            <li>Improve, personalize, and expand our services</li>
            <li>Send you administrative messages and customer support responses</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">3. Third-Party Access</h2>
          <p>
            We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties. Your data is strictly used to provide you with the CRM capabilities you requested.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">4. Data Deletion</h2>
          <p>
            You have the right to request the deletion of your data at any time. For detailed instructions on how to remove our app's access and request full data erasure, please visit our <Link href="/data-deletion" className="text-blue-400 hover:underline">Data Deletion Instructions</Link> page.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">5. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at support@flowaicrm.com.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

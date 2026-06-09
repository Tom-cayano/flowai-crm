import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | FlowAI CRM",
  description: "Instructions on how to request the deletion of your data from FlowAI CRM.",
};

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#07070a] text-foreground">
      <MarketingNavbar />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-24 w-full">
        <div className="prose prose-invert prose-lg max-w-none">
          <h1 className="text-4xl font-bold mb-8 text-white">Data Deletion Instructions</h1>
          
          <p className="text-gray-400 mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <p>
            FlowAI CRM is a platform that integrates with Facebook and Instagram to manage your conversations. 
            According to Meta's Platform Rules, we provide these instructions to allow you to request the deletion of your data from our systems.
          </p>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">How to Remove the App from Your Facebook/Instagram Account</h2>
          <ol className="list-decimal pl-6 space-y-4 mb-8">
            <li>Go to your Facebook account's <strong>Settings & Privacy</strong> menu and select <strong>Settings</strong>.</li>
            <li>Look for <strong>Business Integrations</strong> (or <strong>Apps and Websites</strong>).</li>
            <li>Search for "FlowAI CRM" in the list of active integrations.</li>
            <li>Click <strong>Remove</strong> next to our app's name.</li>
            <li>Confirm the removal. This will revoke our access to your Meta account.</li>
          </ol>

          <h2 className="text-2xl font-semibold mt-10 mb-4 text-white">How to Request Full Data Deletion from FlowAI CRM</h2>
          <p>
            Removing the app from Facebook revokes our access, but does not automatically delete your historical data from our databases (such as past conversations or account settings). 
            To request a complete erasure of all your data from FlowAI CRM, please follow these steps:
          </p>
          <ol className="list-decimal pl-6 space-y-4 mb-8">
            <li>Send an email to <strong>support@flowaicrm.com</strong> from the email address associated with your FlowAI account.</li>
            <li>Use the subject line: <strong>"Data Deletion Request"</strong>.</li>
            <li>Include your Facebook Page ID or Instagram Account ID if known.</li>
            <li>We will process your request within 7 business days and reply with a confirmation once all your data has been permanently deleted.</li>
          </ol>

          <p className="mt-12 text-sm text-gray-500">
            If you have any questions regarding this process, please contact our support team.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

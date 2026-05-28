import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./update-form";

export const metadata: Metadata = {
  title: "Nueva contraseña — FlowAI CRM",
};

export default async function UpdatePasswordPage() {
  // This page is only valid when there's a recovery session.
  // Supabase sets a temporary session after /auth/confirm?type=recovery
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // No recovery session — redirect to forgot-password
    redirect("/forgot-password?error=expired");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Nueva contraseña
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige una contraseña segura para tu cuenta.
        </p>
      </div>
      <UpdatePasswordForm />
    </div>
  );
}

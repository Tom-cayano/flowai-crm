"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { error?: string; success?: boolean } | undefined;

export async function sendResetEmail(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email   = formData.get("email") as string;
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!email?.trim()) return { error: "El correo electrónico es obligatorio." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${appUrl}/auth/confirm?type=recovery&next=/update-password`,
  });

  if (error) {
    // Don't reveal whether an account exists — generic message for security
    console.error("[forgot-password] resetPasswordForEmail error:", error.message);
  }

  // Always show success to prevent email enumeration
  redirect("/forgot-password?sent=1");
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = { error: string } | undefined;

export async function signInWithPassword(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Normalise Supabase error messages to user-friendly text.
    if (error.message.includes("Invalid login credentials")) {
      return { error: "Incorrect email or password. Please try again." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { error: "Please confirm your email before signing in." };
    }
    return { error: error.message };
  }

  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
  redirect(safeRedirect);
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithOAuth("google");
}

export async function signInWithGitHub(): Promise<void> {
  await signInWithOAuth("github");
}

async function signInWithOAuth(provider: "google" | "github"): Promise<void> {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${appUrl}/auth/callback` },
  });

  if (error || !data.url) {
    redirect(
      `/login?error=${encodeURIComponent(error?.message ?? `${provider} sign-in failed.`)}`
    );
  }

  redirect(data.url);
}

export async function signInWithMagicLink(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  if (!email) return { error: "Email is required." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl}/auth/callback` },
  });

  if (error) return { error: error.message };

  redirect(`/login?message=Enlace mágico enviado — revisa tu bandeja de entrada`);
}

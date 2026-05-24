"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignupActionState = { error: string } | undefined;

export async function signUp(
  _prev: SignupActionState,
  formData: FormData
): Promise<SignupActionState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!email || !password || !fullName) {
    return { error: "Todos los campos son obligatorios." };
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // full_name is read by the handle_new_user trigger via raw_user_meta_data
      data: { full_name: fullName },
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "Ya existe una cuenta con este correo electrónico." };
    }
    return { error: error.message };
  }

  // Belt-and-suspenders: upsert the profile directly in case the DB trigger
  // predates the extended version (i.e., was installed before full_name was
  // added to the INSERT).  This is a no-op when the trigger already handled it.
  if (data.user) {
    await supabase
      .from("profiles")
      .upsert(
        { id: data.user.id, email, full_name: fullName },
        { onConflict: "id", ignoreDuplicates: false }
      );
  }

  redirect("/login?message=Revisa tu correo para confirmar tu cuenta");
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UpdatePasswordState = { error?: string } | undefined;

export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const password = formData.get("password") as string;
  const confirm  = formData.get("confirm")  as string;

  if (!password || password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirm) {
    return { error: "Las contraseñas no coinciden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.message.includes("session")) {
      return { error: "El enlace de recuperación ha caducado. Solicita uno nuevo." };
    }
    return { error: error.message };
  }

  redirect("/dashboard");
}

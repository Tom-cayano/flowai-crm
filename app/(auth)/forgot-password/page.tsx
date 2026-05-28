import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña — FlowAI CRM",
};

interface ForgotPasswordPageProps {
  searchParams: Promise<{ sent?: string }>;
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const { sent } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {sent ? "Correo enviado" : "¿Olvidaste tu contraseña?"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {sent
            ? "Te hemos enviado instrucciones para recuperar tu acceso."
            : "Introduce tu correo y te enviaremos un enlace para restablecerla."}
        </p>
      </div>
      <ForgotPasswordForm sent={!!sent} />
    </div>
  );
}

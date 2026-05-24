import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión — FlowAI CRM" };

interface LoginPageProps {
  searchParams: Promise<{
    redirectTo?: string;
    message?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectTo, message } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Bienvenido de nuevo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inicia sesión en tu cuenta de FlowAI CRM
        </p>
      </div>

      <LoginForm redirectTo={redirectTo} initialMessage={message} />
    </div>
  );
}

import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Crear cuenta — FlowAI CRM" };

interface SignupPageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { message } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Crea tu cuenta
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Empieza tu prueba gratuita — sin tarjeta de crédito
        </p>
      </div>

      <SignupForm initialMessage={message} />
    </div>
  );
}

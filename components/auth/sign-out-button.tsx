"use client";

import { useFormStatus } from "react-dom";
import { LogOut, Loader2 } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

function SignOutContent() {
  const { pending } = useFormStatus();
  return (
    <>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      <span>{pending ? "Cerrando sesión…" : "Cerrar sesión"}</span>
    </>
  );
}

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  return (
    <form action={signOut} className="w-full">
      <button
        type="submit"
        className={cn(
          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
          "text-destructive-foreground hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive",
          "disabled:pointer-events-none disabled:opacity-50",
          className
        )}
      >
        <SignOutContent />
      </button>
    </form>
  );
}

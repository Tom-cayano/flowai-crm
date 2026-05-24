"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronRight, X, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OnboardingProgress } from "@/types/workspace";
import { buildChecklist, getCompletionPct } from "@/lib/onboarding/checklist";

interface OnboardingChecklistProps {
  workspaceId: string;
}

export function OnboardingChecklist({ workspaceId }: OnboardingChecklistProps) {
  const [progress, setProgress]     = useState<OnboardingProgress | null>(null);
  const [dismissed, setDismissed]   = useState(false);
  const [expanded, setExpanded]     = useState(true);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    fetch(`/api/onboarding?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: { progress: OnboardingProgress }) => {
        setProgress(d.progress);
        if (d.progress.wizardDismissed || d.progress.wizardCompleted) {
          setDismissed(true);
        }
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleDismiss = async () => {
    setDismissed(true);
    await fetch("/api/onboarding", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ workspaceId, action: "dismiss" }),
    });
  };

  if (loading || dismissed || !progress) return null;

  const checklist  = buildChecklist(progress);
  const completion = getCompletionPct(progress);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="rounded-2xl border border-[#10b981]/20 bg-[#10b981]/5 overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-[#10b981]/15 border border-[#10b981]/30 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-[#10b981]" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Primeros pasos</p>
              <p className="text-xs text-muted-foreground">{completion}% completado</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress ring */}
            <svg className="h-7 w-7" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="2.5" fill="none" className="text-[#10b981]/20" />
              <circle
                cx="14" cy="14" r="11"
                stroke="#10b981" strokeWidth="2.5" fill="none"
                strokeDasharray={`${2 * Math.PI * 11}`}
                strokeDashoffset={`${2 * Math.PI * 11 * (1 - completion / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 14 14)"
                className="transition-all duration-700"
              />
            </svg>
            <button
              onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
              className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Checklist */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="border-t border-[#10b981]/10 px-4 py-3 space-y-1">
                {checklist.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-2 py-2 rounded-lg transition-colors group",
                      item.completed
                        ? "opacity-50 cursor-default pointer-events-none"
                        : "hover:bg-[#10b981]/5"
                    )}
                  >
                    {item.completed
                      ? <CheckCircle2 className="h-4 w-4 text-[#10b981] shrink-0" />
                      : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-medium", item.completed ? "line-through text-muted-foreground" : "text-foreground")}>
                        {item.label}
                      </p>
                      {!item.completed && (
                        <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
                      )}
                    </div>
                    {!item.completed && (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    )}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

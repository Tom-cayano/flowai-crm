"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, Building2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/workspace";

interface WorkspaceSwitcherProps {
  workspaces:       Workspace[];
  activeWorkspace:  Workspace;
  onSwitch:         (workspace: Workspace) => void;
  onCreateNew?:     () => void;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  onSwitch,
  onCreateNew,
}: WorkspaceSwitcherProps) {
  const [open, setOpen]       = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const handleSwitch = async (ws: Workspace) => {
    if (ws.id === activeWorkspace.id) { setOpen(false); return; }
    setSwitching(ws.id);
    setOpen(false);
    onSwitch(ws);
    setSwitching(null);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors w-full"
      >
        <div
          className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ backgroundColor: activeWorkspace.primaryColor ?? "#10b981" }}
        >
          {activeWorkspace.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-sm font-medium text-foreground flex-1 text-left truncate max-w-[120px]">
          {activeWorkspace.name}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full left-0 mt-1 w-56 z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
            >
              <div className="p-1.5">
                <p className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                  Workspaces
                </p>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSwitch(ws)}
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent transition-colors w-full text-left"
                  >
                    <div
                      className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: ws.primaryColor ?? "#10b981" }}
                    >
                      {ws.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{ws.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{ws.planId}</p>
                    </div>
                    {ws.id === activeWorkspace.id && (
                      switching === ws.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#10b981]" />
                        : <Check className="h-3.5 w-3.5 text-[#10b981]" />
                    )}
                  </button>
                ))}
              </div>

              {onCreateNew && (
                <div className="border-t border-border p-1.5">
                  <button
                    onClick={() => { setOpen(false); onCreateNew(); }}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-accent transition-colors w-full text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Crear nuevo workspace
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

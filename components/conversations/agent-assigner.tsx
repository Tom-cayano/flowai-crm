"use client";

import { useState, useEffect } from "react";
import { UserCheck, ChevronDown, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { assignConversation } from "@/lib/actions/conversations";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types";

interface AgentAssignerProps {
  conversationId: string;
  assignedTo?: string;
  onAssigned?: (agentId: string | null) => void;
}

export function AgentAssigner({
  conversationId,
  assignedTo,
  onAssigned,
}: AgentAssignerProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Fetch agent roster on mount
  useEffect(() => {
    const supabase = createClient();
    setIsLoading(true);

    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["admin", "agent", "supervisor"])
      .then(({ data }) => {
        if (data) {
          setAgents(
            data.map((p) => ({
              id: p.id as string,
              name: (p.full_name as string) || (p.email as string),
              email: p.email as string,
              role: p.role as Agent["role"],
              status: "offline",
            }))
          );
        }
        setIsLoading(false);
      });
  }, []);

  async function handleAssign(agentId: string | null) {
    setAssigning(true);
    const result = await assignConversation(conversationId, agentId);
    if (!result.error) onAssigned?.(agentId);
    setAssigning(false);
  }

  const assignedAgent = agents.find((a) => a.id === assignedTo);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          disabled={assigning}
        >
          {assigning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserCheck className="h-3.5 w-3.5" />
          )}
          <span className="max-w-[80px] truncate">
            {assignedAgent?.name ?? "Asignar"}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">Asignar agente</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Sin agentes disponibles
          </p>
        ) : (
          agents.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              className={cn("text-xs gap-2", agent.id === assignedTo && "text-[#10b981]")}
              onClick={() => handleAssign(agent.id)}
            >
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                {agent.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="flex-1 truncate">{agent.name}</span>
              {agent.id === assignedTo && <Check className="h-3 w-3 shrink-0" />}
            </DropdownMenuItem>
          ))
        )}

        {assignedTo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs text-muted-foreground"
              onClick={() => handleAssign(null)}
            >
              Sin asignar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

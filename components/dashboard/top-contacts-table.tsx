import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials, formatTime } from "@/lib/utils";
import type { ContactStatus } from "@/types";
import type { TopContact } from "@/lib/dashboard/stats";

// Top 5 contactos reales por volumen de mensajes — datos de dashboard_stats().

const statusCfg: Record<ContactStatus, { variant: "success" | "warning" | "destructive"; label: string }> = {
  active: { variant: "success", label: "Activo" },
  inactive: { variant: "warning", label: "Inactivo" },
  blocked: { variant: "destructive", label: "Bloqueado" },
};

const avatarColors = [
  "from-[#10b981]/20 to-[#06b6d4]/20 text-[#10b981]",
  "from-violet-500/20 to-purple-500/20 text-violet-400",
  "from-amber-500/20 to-orange-500/20 text-amber-400",
  "from-blue-500/20 to-cyan-500/20 text-blue-400",
  "from-pink-500/20 to-rose-500/20 text-pink-400",
];

export function TopContactsTable({ contacts }: { contacts: TopContact[] }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Contactos principales</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Por volumen de mensajes</p>
        </div>
        <a
          href="/contacts"
          className="text-[12px] text-[#10b981] hover:text-[#34d399] transition-colors font-medium"
        >
          Ver todos →
        </a>
      </div>

      {contacts.length === 0 ? (
        <p className="px-5 py-6 text-xs text-muted-foreground">
          Aún no hay conversaciones con mensajes.
        </p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] px-5 pb-2.5 pt-3">
                Contacto
              </th>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] pb-2.5 pt-3 hidden sm:table-cell">
                Empresa
              </th>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] pb-2.5 pt-3">
                Estado
              </th>
              <th className="text-right text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] pb-2.5 pt-3 pr-5">
                Mensajes
              </th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact, i) => {
              const cfg = statusCfg[contact.status] ?? statusCfg.active;
              return (
                <tr
                  key={contact.id}
                  className="border-b border-border/40 last:border-0 hover:bg-accent/30 transition-colors duration-100 cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 ring-1 ring-border">
                        <AvatarFallback
                          className={`text-[10px] font-semibold bg-gradient-to-br ${avatarColors[i % avatarColors.length]}`}
                        >
                          {getInitials(contact.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate">{contact.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {contact.last_message_at ? formatTime(contact.last_message_at) : "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 hidden sm:table-cell">
                    <span className="text-[12px] text-muted-foreground">{contact.company ?? "—"}</span>
                  </td>
                  <td className="py-3">
                    <Badge variant={cfg.variant} className="text-[10px] px-2 py-0.5">
                      {cfg.label}
                    </Badge>
                  </td>
                  <td className="py-3 pr-5 text-right">
                    <span className="text-[13px] font-semibold text-foreground tabular-nums">
                      {contact.messages.toLocaleString("es-ES")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

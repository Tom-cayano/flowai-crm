"use client";

import { useState } from "react";
import {
  User,
  Bell,
  Shield,
  Palette,
  Webhook,
  CreditCard,
  ChevronRight,
  Globe,
  Clock,
  MessageSquare,
  Volume2,
  Bot,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { currentAgent } from "@/data/mock-data";
import { getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";

const settingsSections = [
  { id: "profile", label: "Perfil", icon: User },
  { id: "notifications", label: "Notificaciones", icon: Bell },
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "workspace", label: "Espacio de trabajo", icon: Globe },
  { id: "security", label: "Seguridad", icon: Shield },
  { id: "integrations", label: "Integraciones", icon: Webhook },
  { id: "ai", label: "Motor IA (Auto Reply)", icon: Bot },
  { id: "billing", label: "Facturación", icon: CreditCard },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile");
  const [notifSettings, setNotifSettings] = useState({
    newMessage: true,
    newContact: true,
    campaignComplete: true,
    automationError: true,
    sounds: false,
    desktop: true,
  });

  const toggleNotif = (key: keyof typeof notifSettings) => {
    setNotifSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Settings nav */}
      <div className="w-56 shrink-0 border-r border-border bg-card">
        <div className="p-3 space-y-0.5">
          {settingsSections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                activeSection === s.id
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <s.icon className="h-4 w-4 shrink-0" />
              {s.label}
              {activeSection === s.id && <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>

      {/* Settings content */}
      <ScrollArea className="flex-1">
        <div className="p-8 max-w-2xl space-y-8">

          {/* Profile */}
          {activeSection === "profile" && (
            <>
              <div>
                <h2 className="text-base font-semibold mb-0.5">Perfil</h2>
                <p className="text-xs text-muted-foreground">Gestiona tu información personal</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-xl">{getInitials(currentAgent.name)}</AvatarFallback>
                  </Avatar>
                  <div className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-card" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{currentAgent.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{currentAgent.role} · En línea</p>
                  <Button variant="outline" size="sm" className="mt-2 h-7 text-xs">Cambiar foto</Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nombre</Label>
                    <Input defaultValue="Alex" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Apellido</Label>
                    <Input defaultValue="Johnson" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input defaultValue={currentAgent.email} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Teléfono</Label>
                  <Input defaultValue="+34 600 000 000" className="h-8 text-sm" />
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" className="text-xs h-8">Guardar cambios</Button>
                <Button variant="outline" size="sm" className="text-xs h-8">Cancelar</Button>
              </div>
            </>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <>
              <div>
                <h2 className="text-base font-semibold mb-0.5">Notificaciones</h2>
                <p className="text-xs text-muted-foreground">Configura cuándo y cómo recibes alertas</p>
              </div>

              <div className="space-y-4">
                {[
                  { key: "newMessage" as const, icon: MessageSquare, label: "Nuevos mensajes", desc: "Recibe una alerta cuando un contacto envía un mensaje" },
                  { key: "newContact" as const, icon: User, label: "Nuevos contactos", desc: "Alerta cuando se añade un nuevo contacto" },
                  { key: "campaignComplete" as const, icon: Globe, label: "Campaña completada", desc: "Cuando una difusión termina de enviarse" },
                  { key: "automationError" as const, icon: Shield, label: "Errores de automatización", desc: "Si una automatización falla al ejecutarse" },
                ].map((n) => (
                  <div key={n.key} className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted mt-0.5">
                        <n.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{n.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
                      </div>
                    </div>
                    <Switch
                      checked={notifSettings[n.key]}
                      onCheckedChange={() => toggleNotif(n.key)}
                    />
                  </div>
                ))}

                <Separator />

                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted">
                      <Volume2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Notificaciones de sonido</p>
                      <p className="text-xs text-muted-foreground">Reproducir sonido para las alertas</p>
                    </div>
                  </div>
                  <Switch checked={notifSettings.sounds} onCheckedChange={() => toggleNotif("sounds")} />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Notificaciones de escritorio</p>
                      <p className="text-xs text-muted-foreground">Mostrar notificaciones push del navegador</p>
                    </div>
                  </div>
                  <Switch checked={notifSettings.desktop} onCheckedChange={() => toggleNotif("desktop")} />
                </div>
              </div>
            </>
          )}

          {/* Workspace */}
          {activeSection === "workspace" && (
            <>
              <div>
                <h2 className="text-base font-semibold mb-0.5">Espacio de trabajo</h2>
                <p className="text-xs text-muted-foreground">Gestiona las preferencias de tu espacio de trabajo</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nombre del espacio</Label>
                  <Input defaultValue="Mi empresa" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Idioma predeterminado</Label>
                  <Input defaultValue="Español (España)" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Zona horaria</Label>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Input defaultValue="UTC+1 (Europa/Madrid)" className="h-8 text-sm" />
                  </div>
                </div>
              </div>
              <Button size="sm" className="text-xs h-8">Guardar</Button>
            </>
          )}

          {/* Appearance */}
          {activeSection === "appearance" && (
            <>
              <div>
                <h2 className="text-base font-semibold mb-0.5">Apariencia</h2>
                <p className="text-xs text-muted-foreground">Personaliza el aspecto visual</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs mb-3 block">Tema de color</Label>
                  <div className="flex gap-3">
                    {[
                      { name: "Oscuro", bg: "#09090b", active: true },
                      { name: "Claro", bg: "#ffffff", active: false },
                      { name: "Sistema", bg: "linear-gradient(90deg, #09090b 50%, #ffffff 50%)", active: false },
                    ].map((t) => (
                      <button
                        key={t.name}
                        className={cn(
                          "flex flex-col items-center gap-2 p-2 rounded-lg border-2 transition-colors",
                          t.active ? "border-primary" : "border-border hover:border-border/80"
                        )}
                      >
                        <div
                          className="w-16 h-10 rounded-md border border-border"
                          style={{ background: t.bg }}
                        />
                        <span className="text-[11px] text-muted-foreground">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-xs mb-3 block">Color de acento</Label>
                  <div className="flex gap-2">
                    {[
                      { color: "#10b981", label: "Verde (predeterminado)" },
                      { color: "#3b82f6", label: "Azul" },
                      { color: "#8b5cf6", label: "Morado" },
                      { color: "#f59e0b", label: "Ámbar" },
                    ].map((c) => (
                      <button
                        key={c.color}
                        title={c.label}
                        className={cn(
                          "w-7 h-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
                          c.color === "#10b981" ? "ring-primary" : "ring-transparent hover:ring-border"
                        )}
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Security */}
          {activeSection === "security" && (
            <>
              <div>
                <h2 className="text-base font-semibold mb-0.5">Seguridad</h2>
                <p className="text-xs text-muted-foreground">Mantén tu cuenta segura</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Contraseña actual</Label>
                  <Input type="password" placeholder="••••••••" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nueva contraseña</Label>
                  <Input type="password" placeholder="••••••••" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Confirmar nueva contraseña</Label>
                  <Input type="password" placeholder="••••••••" className="h-8 text-sm" />
                </div>
              </div>

              <Button size="sm" className="text-xs h-8">Actualizar contraseña</Button>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Autenticación de dos factores</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Añade una capa extra de seguridad</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="text-[10px]">No habilitada</Badge>
                  <Button variant="outline" size="sm" className="text-xs h-7">Activar 2FA</Button>
                </div>
              </div>
            </>
          )}

          {/* Integrations */}
          {activeSection === "integrations" && (
            <>
              <div>
                <h2 className="text-base font-semibold mb-0.5">Integraciones</h2>
                <p className="text-xs text-muted-foreground">Conecta servicios de terceros</p>
              </div>

              <div className="space-y-3">
                {[
                  { name: "WhatsApp Business API", desc: "Tu canal de mensajería principal", status: "connected" },
                  { name: "Zapier", desc: "Automatiza con más de 5.000 apps", status: "connected" },
                  { name: "Slack", desc: "Envía alertas a tu espacio de Slack", status: "disconnected" },
                  { name: "HubSpot", desc: "Sincroniza contactos y oportunidades", status: "disconnected" },
                  { name: "Webhook", desc: "Envía eventos a tu endpoint personalizado", status: "disconnected" },
                ].map((int) => (
                  <div key={int.name} className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">{int.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{int.desc}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={int.status === "connected" ? "success" : "muted"} className="text-[10px]">
                        {int.status === "connected" ? "Conectado" : "Desconectado"}
                      </Badge>
                      <Button
                        variant={int.status === "connected" ? "outline" : "default"}
                        size="sm"
                        className="text-xs h-7"
                      >
                        {int.status === "connected" ? "Gestionar" : "Conectar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* AI Settings */}
          {activeSection === "ai" && (
            <>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Bot className="h-5 w-5 text-emerald-500" />
                  <h2 className="text-base font-semibold">Motor IA (Auto Reply)</h2>
                </div>
                <p className="text-xs text-muted-foreground">Configura el comportamiento del copiloto y auto-respuestas</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      Activar Motor de Auto Respuesta
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      Permite que la IA genere borradores automáticos para los mensajes entrantes. 
                      En "Modo Aprobación", los agentes deben revisar antes de enviar.
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div>
                    <Label className="text-xs mb-1.5 block">Nivel de Autonomía</Label>
                    <div className="flex bg-muted rounded-lg p-1">
                      <button className="flex-1 text-xs py-1.5 rounded-md bg-background shadow-sm font-medium">Borrador (Sugerencias)</button>
                      <button className="flex-1 text-xs py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">Aprobación (Revisión)</button>
                      <button className="flex-1 text-xs py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">Totalmente Automático</button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Umbral de Confianza (Confidence Score)</Label>
                    <div className="flex items-center gap-4">
                      <input type="range" min="50" max="100" defaultValue="85" className="flex-1 accent-emerald-500" />
                      <span className="text-xs font-mono bg-muted px-2 py-1 rounded-md">85%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Solo se sugerirán respuestas cuya confianza sea mayor a este valor.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Tiempo de Cooldown</Label>
                    <select className="w-full h-8 text-sm bg-background border border-border rounded-md px-2 focus:ring-1 focus:ring-emerald-500 outline-none">
                      <option value="60">1 minuto (Recomendado)</option>
                      <option value="300">5 minutos</option>
                      <option value="900">15 minutos</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground">Tiempo de espera entre respuestas automáticas a un mismo contacto.</p>
                  </div>

                  <div className="flex items-center justify-between py-2 border-t border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">Escalado a Humano (Human Handoff)</p>
                      <p className="text-[10px] text-muted-foreground max-w-sm mt-0.5">
                        Si la IA es rechazada 3 veces consecutivas, desactiva el auto-reply para esa conversación.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white">Guardar configuración</Button>
                <Button variant="outline" size="sm" className="text-xs h-8">Restaurar valores por defecto</Button>
              </div>
            </>
          )}

          {/* Billing */}
          {activeSection === "billing" && (
            <>
              <div>
                <h2 className="text-base font-semibold mb-0.5">Facturación</h2>
                <p className="text-xs text-muted-foreground">Gestiona tu suscripción y pagos</p>
              </div>

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">Plan Pro</h3>
                      <Badge variant="success" className="text-[10px]">Activo</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Hasta 10 agentes · 50.000 mensajes/mes · Todas las funciones</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">79€<span className="text-xs font-normal text-muted-foreground">/mes</span></p>
                    <p className="text-[10px] text-muted-foreground">Próxima facturación: 1 ago. 2024</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs h-7">Actualizar a Enterprise</Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground">Cancelar plan</Button>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-semibold mb-3">Método de pago</p>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-medium">Visa terminada en 4242</p>
                    <p className="text-[10px] text-muted-foreground">Caduca 12/2026</p>
                  </div>
                  <Button variant="ghost" size="sm" className="ml-auto text-xs h-7">Actualizar</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

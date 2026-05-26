import Link from "next/link";
import { LogoFull } from "@/components/ui/logo";

const links = {
  Producto: [
    { label: "Funcionalidades", href: "#features"  },
    { label: "Precios",         href: "#pricing"   },
    { label: "Integraciones",   href: "#"          },
    { label: "API Docs",        href: "#"          },
    { label: "Novedades",       href: "#"          },
  ],
  Empresa: [
    { label: "Sobre nosotros",  href: "#" },
    { label: "Blog",            href: "#" },
    { label: "Empleo",          href: "#" },
    { label: "Prensa",          href: "#" },
  ],
  Soporte: [
    { label: "Centro de ayuda", href: "#" },
    { label: "Documentación",   href: "#" },
    { label: "Estado del sistema", href: "#" },
    { label: "Contacto",        href: "#" },
  ],
  Legal: [
    { label: "Privacidad",      href: "#" },
    { label: "Términos de uso", href: "#" },
    { label: "Cookies",         href: "#" },
    { label: "RGPD",            href: "#" },
  ],
};

const social = [
  {
    label: "X / Twitter",
    href: "#",
    icon: (
      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "#",
    icon: (
      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    label: "GitHub",
    href: "#",
    icon: (
      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
  },
];

export function Footer() {
  return (
    <footer className="relative bg-[#07070a]">
      {/* Ambient top fade from CTA/landing sections */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div
        className="absolute top-0 inset-x-0 h-24 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(16,185,129,0.03) 0%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 mb-14">

          {/* Brand column */}
          <div className="col-span-2">
            <LogoFull className="mb-5" />
            <p className="text-sm text-zinc-500 leading-relaxed max-w-xs mb-6">
              CRM con inteligencia artificial para equipos de ventas y soporte que usan
              WhatsApp, Instagram, Messenger y TikTok como canales principales.
            </p>

            {/* System status */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
              style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.14)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                style={{ animation: "ld-pulse-glow 2s ease-in-out infinite" }}
              />
              <span className="text-[11px] font-medium text-emerald-400">
                Todos los sistemas operativos
              </span>
            </div>

            {/* Social */}
            <div className="flex items-center gap-2">
              {social.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-white/[0.07] text-zinc-600 hover:text-zinc-400 hover:border-white/[0.14] hover:bg-white/[0.04] transition-all duration-200"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.12em] mb-4">
                {category}
              </h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-[13px] text-zinc-600 hover:text-zinc-300 transition-colors duration-150"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-8" />

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-700">
            © {new Date().getFullYear()} FlowAI CRM. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4">
            <Link href="#" className="text-[11px] text-zinc-700 hover:text-zinc-500 transition-colors">
              Privacidad
            </Link>
            <Link href="#" className="text-[11px] text-zinc-700 hover:text-zinc-500 transition-colors">
              Términos
            </Link>
            <Link href="#" className="text-[11px] text-zinc-700 hover:text-zinc-500 transition-colors">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

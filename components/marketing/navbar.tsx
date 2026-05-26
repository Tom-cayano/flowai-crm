"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { LogoFull } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Nav links ──────────────────────────────────────────────────────────────

const navLinks = [
  { href: "#features",     label: "Funcionalidades" },
  { href: "#pricing",      label: "Precios"          },
  { href: "#testimonials", label: "Clientes"         },
];

const SECTION_IDS = navLinks.map((l) => l.href.replace("#", ""));

// ── Active section hook ────────────────────────────────────────────────────
// IntersectionObserver with a -20%/-55% root margin so the section
// triggers "active" when its top portion crosses ~20% of the viewport.

function useActiveSection() {
  const [active, setActive] = useState("");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(id);
        },
        { rootMargin: "-20% 0px -55% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return active;
}

// ── Component ──────────────────────────────────────────────────────────────

export function MarketingNavbar() {
  const [open, setOpen]       = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const activeSection           = useActiveSection();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Close menu on resize to desktop
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) setOpen(false); };
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.21, 1.02, 0.73, 0.98] }}
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-[background,border-color,box-shadow] duration-300",
        scrolled
          ? "bg-[#07070a]/85 backdrop-blur-2xl border-b border-white/[0.06]"
          : "bg-transparent"
      )}
    >
      {/* Subtle bottom glow line when scrolled */}
      {scrolled && (
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#10b981]/20 to-transparent" />
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded-lg">
            <LogoFull />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => {
              const id       = link.href.replace("#", "");
              const isActive = activeSection === id;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative text-sm pb-px leading-none transition-colors duration-150",
                    isActive
                      ? "text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100"
                  )}
                >
                  {link.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute -bottom-px inset-x-0 h-px rounded-full"
                      style={{ background: "rgba(16,185,129,0.65)" }}
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                </a>
              );
            })}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-sm text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors duration-150 h-8"
            >
              <Link href="/login">Iniciar sesión</Link>
            </Button>

            {/* Subtle divider */}
            <span className="h-4 w-px bg-white/[0.10]" aria-hidden />

            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-sm font-semibold bg-[#10b981] text-[#030712] transition-all duration-200 hover:bg-[#0ea572]"
                style={{
                  boxShadow: "0 0 0 1px rgba(16,185,129,0.3), 0 1px 2px rgba(0,0,0,0.4)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 0 0 1px rgba(16,185,129,0.5), 0 0 18px -2px rgba(16,185,129,0.35), 0 4px 12px rgba(0,0,0,0.4)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 0 0 1px rgba(16,185,129,0.3), 0 1px 2px rgba(0,0,0,0.4)";
                }}
              >
                Empezar gratis
              </Link>
            </motion.div>
          </div>

          {/* Mobile toggle */}
          <motion.button
            className="md:hidden p-2 -mr-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-white/[0.05] transition-colors"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            whileTap={{ scale: 0.94 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {open ? (
                <motion.span
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0,   opacity: 1 }}
                  exit={{   rotate:  90,  opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <X className="h-5 w-5" />
                </motion.span>
              ) : (
                <motion.span
                  key="menu"
                  initial={{ rotate: 90,  opacity: 0 }}
                  animate={{ rotate: 0,   opacity: 1 }}
                  exit={{   rotate: -90,  opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Menu className="h-5 w-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0  }}
            exit={{   opacity: 0, y: -4  }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="md:hidden border-t border-white/[0.06]"
            style={{ background: "rgba(7,7,10,0.96)", backdropFilter: "blur(24px)" }}
          >
            <nav className="px-4 py-3 space-y-0.5">
              {navLinks.map((link) => {
                const id       = link.href.replace("#", "");
                const isActive = activeSection === id;
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors",
                      isActive
                        ? "text-zinc-100 bg-white/[0.06]"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
                    )}
                  >
                    {isActive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                    )}
                    {link.label}
                  </a>
                );
              })}
            </nav>

            <div
              className="px-4 pb-4 pt-1 flex flex-col gap-2"
              style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
            >
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center h-10 rounded-xl text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition-colors font-medium"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center h-10 rounded-xl text-sm font-bold bg-[#10b981] text-[#030712] hover:bg-[#0ea572] transition-colors"
                style={{ boxShadow: "0 0 0 1px rgba(16,185,129,0.3)" }}
              >
                Empezar gratis
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

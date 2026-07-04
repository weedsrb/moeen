"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

const navItems = [
  {
    id: "product",
    num: "01",
    label: "Product",
    href: "#demo",
    sub: [
      { label: "Live demo", href: "#demo", desc: "Watch a message become an order" },
      { label: "Dashboard tour", href: "#tour", desc: "See the merchant view" },
      { label: "Who it's for", href: "#features", desc: "Chat-based merchants" },
    ],
  },
  {
    id: "why",
    num: "02",
    label: "Why Mo'een",
    href: "#problem",
    sub: [
      { label: "The problem", href: "#problem", desc: "Sound familiar?" },
      { label: "How it works", href: "#how", desc: "Three steps, two minutes" },
      { label: "Built for MENA", href: "#mena", desc: "Local, Arabic-first" },
    ],
  },
  { id: "faq", num: "03", label: "FAQ", href: "#faq" },
  { id: "access", num: "04", label: "Early access", href: "#cta" },
];

function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, color: "var(--color-fg)" }}>
      <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.01em" }}>
        Mo<span style={{ color: "var(--color-ai)" }}>&apos;</span>een
      </span>
      <span className={styles.arabic} style={{ color: "var(--color-fg-muted)", fontSize: size - 2, fontWeight: 500 }}>
        معين
      </span>
    </span>
  );
}

export function Navbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [hoverItem, setHoverItem] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleAnchorClick(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    closeMobile = false
  ) {
    if (!href.startsWith("#")) {
      if (closeMobile) setMobileOpen(false);
      return;
    }

    const target = document.querySelector<HTMLElement>(href);
    if (!target) return;

    event.preventDefault();
    if (closeMobile) setMobileOpen(false);

    window.history.pushState(null, "", href);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <header
      className={cn(styles.navHeader, scrolled && styles.navScrolled)}
      onMouseLeave={() => setHoverItem(null)}
    >
      <div className={styles.navInner}>
        <a
          href="#top"
          onClick={(event) => handleAnchorClick(event, "#top")}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          <Wordmark />
        </a>

        <nav className={cn(styles.navCenter, styles.desktopOnly)} aria-label="Landing navigation">
          {navItems.map((item) => (
            <div
              className={styles.navItem}
              key={item.id}
              onMouseEnter={() => setHoverItem(item.id)}
            >
              <a
                className={cn(styles.navLink, hoverItem === item.id && styles.navLinkActive)}
                href={item.href}
                onClick={(event) => handleAnchorClick(event, item.href)}
              >
                <span className={styles.navNum}>{item.num}</span>
                {item.label}
              </a>

              {item.sub && (
                <div
                  aria-hidden={hoverItem !== item.id}
                  className={cn(styles.miniMenu, hoverItem === item.id && styles.miniMenuOpen)}
                >
                  <div className={cn(styles.glass, styles.miniMenuPanel)}>
                    {item.sub.map((sub) => (
                      <a
                        className={styles.miniMenuLink}
                        href={sub.href}
                        key={sub.href}
                        onClick={(event) => handleAnchorClick(event, sub.href)}
                        tabIndex={hoverItem === item.id ? 0 : -1}
                      >
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{sub.label}</span>
                        <span style={{ color: "var(--color-fg-muted)", fontSize: 12 }}>{sub.desc}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            className={cn(styles.btn, styles.btnOutline)}
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            style={{ width: 36, height: 36, padding: 0 }}
            type="button"
          >
            {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <a
            className={cn(styles.btn, styles.btnPrimary, styles.btnMd, styles.desktopOnly)}
            href="#cta"
            onClick={(event) => handleAnchorClick(event, "#cta")}
            style={{ height: 36 }}
          >
            Request early access
          </a>
          <button
            aria-label="Menu"
            className={cn(styles.btn, styles.btnOutline, styles.mobileMenuButton)}
            onClick={() => setMobileOpen((value) => !value)}
            style={{ width: 36, height: 36, padding: 0 }}
            type="button"
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className={styles.mobileDrawer}>
          {navItems.map((item) => (
            <a
              href={item.href}
              key={item.id}
              onClick={(event) => handleAnchorClick(event, item.href, true)}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "14px 4px",
                borderBottom: "1px solid var(--color-border-subtle)",
                color: "var(--color-fg)",
                fontSize: 15,
                textDecoration: "none",
              }}
            >
              <span className={styles.navNum}>{item.num}</span>
              {item.label}
            </a>
          ))}
          <a
            className={cn(styles.btn, styles.btnPrimary, styles.btnMd)}
            href="#cta"
            onClick={(event) => handleAnchorClick(event, "#cta", true)}
            style={{ marginTop: 14 }}
          >
            Request early access
          </a>
        </div>
      )}
    </header>
  );
}

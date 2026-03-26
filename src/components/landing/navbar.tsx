"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToFooter = () => {
    document.getElementById("footer-cta")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <motion.nav
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-border bg-background/80 backdrop-blur-md"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-foreground">Mo&apos;een</span>
          <span className="text-sm font-arabic text-muted-foreground">معين</span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button size="sm" onClick={scrollToFooter}>
            Request Early Access
          </Button>
        </div>
      </div>
    </motion.nav>
  );
}

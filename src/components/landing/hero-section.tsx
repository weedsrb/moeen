"use client";

import { useRef, useEffect } from "react";
import type { gsap } from "gsap";
import { loadGsap } from "@/lib/animations/gsap";
import { Button } from "@/components/ui/button";
import { MessageCard } from "./message-card";
import { OrderCard } from "./order-card";
import { chaosMessages, organizedOrders } from "@/lib/landing-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Deterministic pseudo-random for consistent SSR/client values.
 * Returns a value between min and max based on seed.
 */
function seededRandom(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  const r = x - Math.floor(x); // 0..1
  return min + r * (max - min);
}

/** Generate a random off-screen starting position for a message card */
function getEntryPosition(index: number) {
  // Pick an edge: 0=left, 1=right, 2=top, 3=bottom
  const edge = Math.floor(seededRandom(index * 3, 0, 4));
  let x: number, y: number;

  switch (edge) {
    case 0: // from left
      x = seededRandom(index * 7, -700, -400);
      y = seededRandom(index * 11, -200, 200);
      break;
    case 1: // from right
      x = seededRandom(index * 7, 400, 700);
      y = seededRandom(index * 11, -200, 200);
      break;
    case 2: // from top
      x = seededRandom(index * 7, -300, 300);
      y = seededRandom(index * 11, -500, -300);
      break;
    default: // from bottom
      x = seededRandom(index * 7, -300, 300);
      y = seededRandom(index * 11, 300, 500);
      break;
  }

  return { x, y, rotation: seededRandom(index * 13, -20, 20) };
}

/** Generate a scattered landing position within the center area */
function getLandingPosition(index: number) {
  return {
    x: seededRandom(index * 17 + 5, -250, 250),
    y: seededRandom(index * 23 + 7, -150, 150),
    rotation: seededRandom(index * 31 + 3, -8, 8),
  };
}

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const scrollToFooter = () => {
    document.getElementById("footer-cta")?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const section = sectionRef.current;
    const textEl = textRef.current;
    const messagesEl = messagesRef.current;
    const dashboardEl = dashboardRef.current;
    if (!section || !textEl || !messagesEl || !dashboardEl) return;

    let cancelled = false;
    let ctx: gsap.Context | undefined;

    loadGsap().then(({ gsap }) => {
      if (cancelled) return;

      if (prefersReducedMotion) {
        gsap.set(textEl, { opacity: 0 });
        gsap.set(messagesEl, { display: "none" });
        gsap.set(dashboardEl, { opacity: 1 });
        return;
      }

      const messageCards = Array.from(
        messagesEl.querySelectorAll("[data-message-card]")
      );
      const orderCards = dashboardEl.querySelectorAll("[data-order-card]");
      const total = messageCards.length;

      ctx = gsap.context(() => {
        // ── Initial state ──
        // Messages: invisible, positioned at their off-screen entry points
        messageCards.forEach((card, i) => {
          const entry = getEntryPosition(i);
          gsap.set(card, {
            opacity: 0,
            scale: 0.7,
            x: entry.x,
            y: entry.y,
            rotation: entry.rotation,
          });
        });
        gsap.set(dashboardEl, { opacity: 0, y: 40, scale: 0.95 });
        gsap.set(orderCards, { opacity: 0, scale: 0.8, y: 20 });

        // ── Main scroll-driven timeline ──
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "bottom bottom",
            scrub: 1,
            pin: stickyRef.current,
          },
        });

        // Phase A: Text holds (0–10), then fades out (10–25)
        tl.to(textEl, {
          opacity: 0,
          y: -80,
          scale: 0.95,
          duration: 15,
          ease: "power2.in",
        }, 10);

        // Phase B: Messages fly in one-by-one to scattered center positions (15–65)
        const flyInDuration = 50;
        messageCards.forEach((card, i) => {
          const landing = getLandingPosition(i);
          const startTime = 15 + (i / total) * (flyInDuration - 5);

          tl.to(card, {
            opacity: 1,
            scale: 1,
            x: landing.x,
            y: landing.y,
            rotation: landing.rotation,
            duration: 6,
            ease: "power3.out",
          }, startTime);
        });

        // Phase C: Messages converge, shrink, and cross-fade with dashboard (65–82)
        tl.to(messageCards, {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 0.3,
          opacity: 0,
          duration: 17,
          stagger: 0.3,
          ease: "power3.inOut",
        }, 65);

        // Dashboard fades in overlapping the convergence (72–85)
        tl.to(dashboardEl, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 13,
          ease: "power2.out",
        }, 72);

        // Phase D: Order cards stagger in (83–100)
        tl.to(orderCards, {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 7,
          stagger: 3,
          ease: "back.out(1.2)",
        }, 83);
      }, section);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [prefersReducedMotion]);

  return (
    <section ref={sectionRef} className="relative h-[400vh]">
      <div
        ref={stickyRef}
        className="relative flex h-screen items-center justify-center overflow-hidden px-4 sm:px-6"
      >
        {/* Hero text — centered, fades out on scroll */}
        <div
          ref={textRef}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 sm:px-6"
        >
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-[64px] lg:leading-[1.1]">
              You wake up to 50 messages.{" "}
              <span className="text-muted-foreground">
                Half are orders. Which half?
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
              Mo&apos;een reads your Telegram messages, extracts orders, and
              organizes everything — so you start your morning in control.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={scrollToFooter}
                className="h-11 px-6 text-base"
              >
                Request Early Access
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={scrollToFooter}
                className="h-11 px-6 font-arabic text-base"
              >
                ابدأ هلق
              </Button>
            </div>
          </div>
        </div>

        {/* Messages — all centered, GSAP moves them from off-screen edges */}
        <div ref={messagesRef} className="absolute inset-0">
          {chaosMessages.map((msg, i) => (
            <div
              key={i}
              data-message-card
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <MessageCard message={msg} className="w-56 sm:w-64" />
            </div>
          ))}
        </div>

        {/* Dashboard — centered, fades in after messages converge */}
        <div
          ref={dashboardRef}
          className="absolute inset-0 z-20 flex items-center justify-center px-4 opacity-0 sm:px-6"
        >
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card/80 p-4 shadow-lg backdrop-blur-sm sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-status-confirmed" />
              <span className="text-sm font-medium text-foreground">
                Mo&apos;een Dashboard
              </span>
              <span className="ms-auto font-mono text-xs text-muted-foreground">
                3 orders today
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {organizedOrders.map((order) => (
                <div key={order.id} data-order-card className="flex-1">
                  <OrderCard order={order} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

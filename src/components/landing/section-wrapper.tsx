"use client";

import { useRef, useEffect } from "react";
import type { gsap } from "gsap";
import { loadGsap } from "@/lib/animations/gsap";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

interface SectionWrapperProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  delay?: number;
}

export function SectionWrapper({
  children,
  className,
  id,
  delay = 0,
}: SectionWrapperProps) {
  const ref = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !ref.current) return;

    let cancelled = false;
    let ctx: gsap.Context | undefined;

    loadGsap().then(({ gsap }) => {
      if (cancelled || !ref.current) return;
      ctx = gsap.context(() => {
        gsap.from(ref.current, {
          y: 40,
          opacity: 0,
          duration: 0.6,
          delay,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ref.current,
            start: "top 85%",
            once: true,
          },
        });
      }, ref);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [prefersReducedMotion, delay]);

  return (
    <section
      ref={ref}
      id={id}
      className={cn(
        "mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24",
        className
      )}
    >
      {children}
    </section>
  );
}

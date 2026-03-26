"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { problems } from "@/lib/landing-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { SectionWrapper } from "./section-wrapper";

gsap.registerPlugin(ScrollTrigger);

export function ProblemSection() {
  const cardsRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !cardsRef.current) return;

    const cards = cardsRef.current.querySelectorAll("[data-problem-card]");

    const ctx = gsap.context(() => {
      gsap.from(cards, {
        y: 40,
        opacity: 0,
        duration: 0.5,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: cardsRef.current,
          start: "top 85%",
          once: true,
        },
      });
    }, cardsRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <SectionWrapper id="problems" className="py-16 md:py-24">
      <div className="mb-10 text-center">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          Sound familiar?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Every merchant with a Telegram business knows these moments.
        </p>
      </div>

      <div
        ref={cardsRef}
        className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4"
      >
        {problems.map((problem) => {
          const Icon = problem.icon;
          return (
            <div
              key={problem.title}
              data-problem-card
              className="min-w-[260px] snap-center rounded-lg border border-border bg-card p-5 sm:min-w-0"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                <Icon className="size-5 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {problem.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {problem.description}
              </p>
              <p
                className="mt-3 rounded-md bg-secondary px-3 py-2 font-arabic text-sm text-muted-foreground"
                dir="rtl"
              >
                &ldquo;{problem.arabicExample}&rdquo;
              </p>
            </div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}

"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";
import { solutions } from "@/lib/landing-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { SectionWrapper } from "./section-wrapper";

gsap.registerPlugin(ScrollTrigger);

export function SolutionSection() {
  const pairsRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !pairsRef.current) return;

    const pairs = pairsRef.current.querySelectorAll("[data-solution-pair]");

    const ctx = gsap.context(() => {
      pairs.forEach((pair) => {
        const left = pair.querySelector("[data-problem-side]");
        const right = pair.querySelector("[data-solution-side]");

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: pair,
            start: "top 85%",
            once: true,
          },
        });

        if (left) {
          tl.from(left, {
            x: -30,
            opacity: 0,
            duration: 0.5,
            ease: "power2.out",
          });
        }
        if (right) {
          tl.from(
            right,
            {
              x: 30,
              opacity: 0,
              duration: 0.5,
              ease: "power2.out",
            },
            "-=0.3"
          );
        }
      });
    }, pairsRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <SectionWrapper id="solutions">
      <div className="mb-10 text-center">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          Mo&apos;een fixes all of this
        </h2>
        <p className="mt-3 text-muted-foreground">
          Every chaos scenario has a built-in solution.
        </p>
      </div>

      <div ref={pairsRef} className="flex flex-col gap-8">
        {solutions.map((pair) => (
          <div
            key={pair.problem}
            data-solution-pair
            className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card/50 p-5 sm:flex-row sm:gap-6 sm:p-6"
          >
            {/* Problem side */}
            <div
              data-problem-side
              className="flex-1 rounded-lg border border-destructive/20 bg-destructive/5 p-4"
            >
              <span className="text-xs font-medium uppercase tracking-wider text-destructive">
                The problem
              </span>
              <p className="mt-2 text-sm font-medium text-foreground">
                {pair.problem}
              </p>
            </div>

            {/* Arrow */}
            <div className="flex shrink-0 items-center justify-center">
              <ArrowRight className="size-5 rotate-90 text-muted-foreground sm:rotate-0" />
            </div>

            {/* Solution side */}
            <div
              data-solution-side
              className="flex-1 rounded-lg border border-status-confirmed/20 bg-status-confirmed/5 p-4"
            >
              <span className="text-xs font-medium uppercase tracking-wider text-status-confirmed">
                Mo&apos;een&apos;s answer
              </span>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {pair.solution}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pair.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}

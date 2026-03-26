"use client";

import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { steps } from "@/lib/landing-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { SectionWrapper } from "./section-wrapper";

gsap.registerPlugin(ScrollTrigger);

export function HowItWorksSection() {
  const stepsRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !stepsRef.current) return;

    const stepEls = stepsRef.current.querySelectorAll("[data-step]");
    const connectors = stepsRef.current.querySelectorAll("[data-connector]");

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stepsRef.current,
          start: "top 85%",
          once: true,
        },
      });

      stepEls.forEach((step, i) => {
        tl.from(
          step,
          {
            y: 30,
            opacity: 0,
            duration: 0.4,
            ease: "power2.out",
          },
          i === 0 ? "+=0" : "-=0.15"
        );

        if (connectors[i]) {
          tl.from(
            connectors[i],
            {
              scaleX: 0,
              opacity: 0,
              duration: 0.3,
              ease: "power2.out",
            },
            "-=0.2"
          );
        }
      });
    }, stepsRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <SectionWrapper id="how-it-works">
      <div className="mb-10 text-center">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          How it works
        </h2>
        <p className="mt-3 text-muted-foreground">
          Three steps. Two minutes to set up. Zero lost orders.
        </p>
      </div>

      <div
        ref={stepsRef}
        className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center sm:gap-0"
      >
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="flex items-center sm:flex-col">
              {/* Step */}
              <div data-step className="flex flex-col items-center text-center sm:w-48">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-2 ${
                    step.useAiColor
                      ? "border-ai/30 bg-ai/10"
                      : "border-border bg-secondary"
                  }`}
                >
                  <Icon
                    className={`size-6 ${
                      step.useAiColor
                        ? "text-ai"
                        : "text-foreground"
                    }`}
                  />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>

              {/* Connector line (not after last step) */}
              {i < steps.length - 1 && (
                <div
                  data-connector
                  className="mx-4 hidden h-px w-16 origin-left bg-border sm:block lg:w-24"
                  style={{ marginTop: "1.75rem" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}

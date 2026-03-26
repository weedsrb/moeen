"use client";

import { Play } from "lucide-react";
import { SectionWrapper } from "./section-wrapper";

export function TrustSection() {
  return (
    <SectionWrapper id="trust">
      {/* Video placeholder */}
      <div className="mx-auto max-w-2xl">
        <div className="relative flex aspect-video items-center justify-center rounded-xl border border-border bg-card">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary">
              <Play className="size-6 ms-0.5" />
            </div>
            <span className="text-sm">Demo coming soon</span>
          </div>
        </div>
      </div>

      {/* Mission text */}
      <div className="mt-12 text-center">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          Built in Palestine, for Palestine
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Mo&apos;een is built for the merchants who run their business from a
          phone screen — taking orders over Telegram, tracking inventory in
          their head, and doing it all in a mix of Arabic, English, and
          everything in between. We get it, because we live it.
        </p>
      </div>
    </SectionWrapper>
  );
}

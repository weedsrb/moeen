import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";

const ProblemSection = dynamic(() =>
  import("@/components/landing/problem-section").then((m) => ({
    default: m.ProblemSection,
  })),
);
const SolutionSection = dynamic(() =>
  import("@/components/landing/solution-section").then((m) => ({
    default: m.SolutionSection,
  })),
);
const HowItWorksSection = dynamic(() =>
  import("@/components/landing/how-it-works-section").then((m) => ({
    default: m.HowItWorksSection,
  })),
);
const TrustSection = dynamic(() =>
  import("@/components/landing/trust-section").then((m) => ({
    default: m.TrustSection,
  })),
);
const FooterCtaSection = dynamic(() =>
  import("@/components/landing/footer-cta-section").then((m) => ({
    default: m.FooterCtaSection,
  })),
);

export const metadata: Metadata = {
  title: "Mo'een — Turn Telegram Messages into Organized Orders",
  description:
    "AI-powered order management for Palestinian and MENA small businesses. Mo'een reads your Telegram messages, extracts orders, and organizes everything automatically.",
  keywords: [
    "order management",
    "telegram",
    "palestine",
    "MENA",
    "small business",
    "AI",
  ],
  openGraph: {
    title: "Mo'een — Order Management for MENA Businesses",
    description: "Turn messy Telegram messages into organized orders.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mo'een — Turn Telegram Messages into Organized Orders",
    description:
      "AI-powered order management for Palestinian and MENA small businesses.",
  },
  robots: { index: true, follow: true },
};

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main className="flex min-h-screen flex-col">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <TrustSection />
        <FooterCtaSection />
      </main>
    </>
  );
}

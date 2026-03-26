import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { SolutionSection } from "@/components/landing/solution-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { TrustSection } from "@/components/landing/trust-section";
import { FooterCtaSection } from "@/components/landing/footer-cta-section";

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

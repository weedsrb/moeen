import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Mo'een — The one who helps you run the day",
  description:
    "Mo'een reads Telegram messages, extracts orders from natural Arabic, and organizes the day for Palestinian and MENA merchants.",
  keywords: [
    "order management",
    "telegram",
    "palestine",
    "MENA",
    "small business",
    "AI",
    "Arabic",
  ],
  openGraph: {
    title: "Mo'een — The one who helps you run the day",
    description:
      "Turn natural Arabic Telegram messages into structured orders and a clear merchant dashboard.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mo'een — The one who helps you run the day",
    description:
      "AI-powered order extraction and dashboard workflows for Palestinian and MENA merchants.",
  },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <LandingPage />;
}

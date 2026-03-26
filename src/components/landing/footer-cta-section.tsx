"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2 } from "lucide-react";

export function FooterCtaSection() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Something went wrong");
      setLoading(false);
      return;
    }

    setLoading(false);
    setSubmitted(true);
  }

  return (
    <section
      id="footer-cta"
      className="border-t border-border bg-secondary/50 px-4 py-20 sm:px-6 md:py-28"
    >
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          Be the first to try Mo&apos;een
        </h2>
        <p className="mt-2 font-arabic text-lg text-muted-foreground">
          كن أول من يجرب معين
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          We&apos;re launching with a small group of Palestinian businesses.
          Get early access.
        </p>

        {/* Waitlist form */}
        {submitted ? (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-green-500">
            <CheckCircle2 className="h-5 w-5" />
            <span>You&apos;re on the list! We&apos;ll be in touch.</span>
          </div>
        ) : (
          <form
            onSubmit={handleWaitlist}
            className="mt-8 flex gap-2 max-w-sm mx-auto"
          >
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Join"
              )}
            </Button>
          </form>
        )}
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}

        <div className="mt-6">
          <Link
            href="/signup"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "h-11 px-8 text-base",
            })}
          >
            Request Early Access
          </Link>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Mo&apos;een. Built with purpose.
        </p>
      </div>
    </section>
  );
}

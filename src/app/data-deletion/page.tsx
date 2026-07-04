import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion — Mo'een",
};

export default function DataDeletionPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold mb-2">Data Deletion</h1>
      <p className="text-muted-foreground mb-8">Last updated: July 4, 2026</p>

      <div className="space-y-6">
        <section>
          <p>
            If you have messaged a business on Instagram that uses
            Mo&apos;een, or you are a merchant using Mo&apos;een, you can
            request deletion of your data at any time.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-base mb-2">How to request deletion</h2>
          <p>
            Send an email to{" "}
            <a href="mailto:waleedsrb@gmail.com" className="underline">
              waleedsrb@gmail.com
            </a>{" "}
            with the subject line &quot;Data Deletion Request&quot;, including:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>
              Your Instagram username (if requesting deletion of message/
              order data associated with your account), or
            </li>
            <li>
              Your business account email (if you are a merchant requesting
              deletion of your Mo&apos;een account and its data).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-medium text-base mb-2">What gets deleted</h2>
          <p>
            We will permanently delete the messages, derived order records,
            and profile information (name, Instagram ID, username) tied to
            your request from our database within 30 days, except where we
            are required to retain records for legal or accounting
            purposes.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-base mb-2">Confirmation</h2>
          <p>
            We will reply to confirm once your data has been deleted.
          </p>
        </section>
      </div>
    </div>
  );
}

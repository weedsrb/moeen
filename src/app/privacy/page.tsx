import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Mo'een",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground mb-8">Last updated: July 4, 2026</p>

      <div className="space-y-6">
        <section>
          <h2 className="font-medium text-base mb-2">Who we are</h2>
          <p>
            Mo&apos;een (&quot;we&quot;, &quot;our&quot;) is an order management platform
            used by small businesses to receive customer messages and turn
            them into structured orders. This policy explains what data we
            collect through connected messaging channels (currently
            Instagram) and how it is used.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-base mb-2">Data we collect</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              The content of direct messages sent to a connected business
              account, and the sender&apos;s Instagram-scoped ID and
              username.
            </li>
            <li>
              Order details extracted from those messages by our AI
              (e.g. product, quantity, customer name, phone number,
              delivery address), when the customer provides them.
            </li>
            <li>
              Basic account information for the merchant using Mo&apos;een
              (business name, login email).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-medium text-base mb-2">How we use it</h2>
          <p>
            Message content is processed to detect and extract order
            information so the connected merchant can fulfill it. We do not
            sell customer data or use it for advertising. Data is only
            visible to the merchant whose business account received the
            message.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-base mb-2">Data retention</h2>
          <p>
            Messages and orders are retained for as long as the merchant
            account is active, so order history remains available. You can
            request deletion at any time — see our{" "}
            <a href="/data-deletion" className="underline">
              Data Deletion
            </a>{" "}
            page.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-base mb-2">Third parties</h2>
          <p>
            We use Meta&apos;s Instagram Messaging API to send and receive
            messages, and Google Gemini to extract order information from
            message text. These providers process data solely to perform
            those functions on our behalf.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-base mb-2">Contact</h2>
          <p>
            Questions about this policy or your data can be sent to{" "}
            <a href="mailto:waleedsrb@gmail.com" className="underline">
              waleedsrb@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}

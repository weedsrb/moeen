import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { PageTransition } from "@/components/layout/page-transition";
import { requireMerchant } from "@/lib/auth/require-merchant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsNav } from "@/components/settings/settings-nav";
import { BusinessProfileForm } from "@/components/settings/business-profile-form";

const InstagramConnection = dynamic(() =>
  import("@/components/settings/instagram-connection").then((m) => ({
    default: m.InstagramConnection,
  })),
);
const AIBehaviorSettings = dynamic(() =>
  import("@/components/settings/ai-behavior-settings").then((m) => ({
    default: m.AIBehaviorSettings,
  })),
);
const AIPersonaSettings = dynamic(() =>
  import("@/components/settings/ai-persona-settings").then((m) => ({
    default: m.AIPersonaSettings,
  })),
);
const AIFAQSettings = dynamic(() =>
  import("@/components/settings/ai-faq-settings").then((m) => ({
    default: m.AIFAQSettings,
  })),
);

export default async function SettingsPage() {
  const { merchant } = await requireMerchant();
  const supabase = await createClient();

  const [settingsResult, faqResult] = await Promise.all([
    supabase
      .from("merchant_settings")
      .select("instagram_connected, instagram_username, ai_handoff_message, ai_persona_name, ai_tone, ai_greeting, ai_business_context, ai_custom_instructions, ai_response_language, ai_acknowledge_template, ai_require_customer_name, ai_require_customer_phone, ai_acknowledgement_mode, ai_ack_delay_seconds")
      .eq("merchant_id", merchant.id)
      .single(),

    supabase
      .from("merchant_faq")
      .select("id, question, answer, display_order")
      .eq("merchant_id", merchant.id)
      .order("display_order"),
  ]);

  const s = settingsResult.data;

  return (
    <PageTransition>
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <SettingsNav />

        {/* Business Profile */}
        <Card id="business-profile">
          <CardHeader>
            <CardTitle className="text-lg">Business Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <BusinessProfileForm
              businessName={merchant.business_name}
              businessType={merchant.business_type}
              city={merchant.city}
              phone={merchant.phone}
            />
          </CardContent>
        </Card>

        {/* Instagram (primary channel) */}
        <div id="instagram">
          <InstagramConnection
            initialConnected={s?.instagram_connected ?? false}
            initialUsername={s?.instagram_username ?? null}
          />
        </div>

        {/* AI Behavior */}
        <div id="ai-behavior">
          <AIBehaviorSettings
            initialHandoffMessage={s?.ai_handoff_message ?? "A team member will assist you shortly."}
            initialRequireCustomerName={s?.ai_require_customer_name ?? false}
            initialRequireCustomerPhone={s?.ai_require_customer_phone ?? false}
            initialAcknowledgementMode={
              s?.ai_acknowledgement_mode === "delayed" ? "delayed" : "off"
            }
            initialAcknowledgementDelaySeconds={s?.ai_ack_delay_seconds ?? 12}
            initialAcknowledgeTemplate={s?.ai_acknowledge_template ?? null}
          />
        </div>

        {/* AI Persona */}
        <div id="ai-persona">
          <AIPersonaSettings
            initialPersonaName={s?.ai_persona_name ?? null}
            initialTone={s?.ai_tone ?? "friendly"}
            initialGreeting={s?.ai_greeting ?? null}
            initialResponseLanguage={s?.ai_response_language ?? "auto"}
            initialBusinessContext={s?.ai_business_context ?? null}
            initialCustomInstructions={s?.ai_custom_instructions ?? null}
          />
        </div>

        {/* Knowledge Base */}
        <div id="faq">
          <AIFAQSettings initialFaq={faqResult.data ?? []} />
        </div>
      </div>
    </PageTransition>
  );
}

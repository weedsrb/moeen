import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { PageTransition } from "@/components/layout/page-transition";
import { requireMerchant } from "@/lib/auth/require-merchant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/settings/sign-out-button";

const WhatsAppConnection = dynamic(() =>
  import("@/components/settings/whatsapp-connection").then((m) => ({
    default: m.WhatsAppConnection,
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
      .select("whatsapp_connected, whatsapp_display_phone, ai_confidence_threshold, ai_auto_clarify, ai_handoff_message, ai_persona_name, ai_tone, ai_greeting, ai_business_context, ai_custom_instructions, ai_response_language, ai_auto_acknowledge, ai_acknowledge_template")
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

        {/* Business Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Business Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm font-medium">{merchant.business_name}</span>
            </div>
            {merchant.business_type && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Type</span>
                <span className="text-sm font-medium capitalize">
                  {merchant.business_type}
                </span>
              </div>
            )}
            {merchant.city && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">City</span>
                <span className="text-sm font-medium">{merchant.city}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* WhatsApp */}
        <WhatsAppConnection
          initialConnected={s?.whatsapp_connected ?? false}
          initialPhoneNumberId={s?.whatsapp_display_phone ?? null}
        />

        {/* AI Behavior */}
        <AIBehaviorSettings
          initialConfidenceThreshold={s?.ai_confidence_threshold ?? 0.7}
          initialAutoClarity={s?.ai_auto_clarify ?? true}
          initialHandoffMessage={s?.ai_handoff_message ?? "A team member will assist you shortly."}
          initialAutoAcknowledge={s?.ai_auto_acknowledge ?? false}
          initialAcknowledgeTemplate={s?.ai_acknowledge_template ?? null}
        />

        {/* AI Persona */}
        <AIPersonaSettings
          initialPersonaName={s?.ai_persona_name ?? null}
          initialTone={s?.ai_tone ?? "friendly"}
          initialGreeting={s?.ai_greeting ?? null}
          initialResponseLanguage={s?.ai_response_language ?? "auto"}
          initialBusinessContext={s?.ai_business_context ?? null}
          initialCustomInstructions={s?.ai_custom_instructions ?? null}
        />

        {/* Knowledge Base */}
        <AIFAQSettings initialFaq={faqResult.data ?? []} />

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <SignOutButton />
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

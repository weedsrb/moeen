import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTransition } from "@/components/layout/page-transition";
import { ConversationsContent } from "@/components/conversations/conversations-content";
import type { ConversationWithCustomer } from "@/components/conversations/conversation-list";

export default async function ConversationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!merchant) redirect("/onboarding");

  // Fetch conversations with customer names
  const { data: conversations } = await supabase
    .from("conversations")
    .select("*, customers(name, platform_user_id)")
    .eq("merchant_id", merchant.id)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  return (
    <PageTransition>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <ConversationsContent
          initialConversations={
            (conversations as ConversationWithCustomer[]) ?? []
          }
          merchantId={merchant.id}
        />
      </div>
    </PageTransition>
  );
}

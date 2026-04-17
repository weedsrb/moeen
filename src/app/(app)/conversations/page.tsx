import { createClient } from "@/lib/supabase/server";
import { PageTransition } from "@/components/layout/page-transition";
import { ConversationsContent } from "@/components/conversations/conversations-content";
import type { ConversationWithCustomer } from "@/components/conversations/conversation-list";
import { CONVERSATION_WITH_CUSTOMER_COLUMNS } from "@/lib/db/columns";
import { requireMerchant } from "@/lib/auth/require-merchant";

export default async function ConversationsPage() {
  const { merchant } = await requireMerchant();
  const supabase = await createClient();

  // Fetch conversations with customer names
  const { data: conversations } = await supabase
    .from("conversations")
    .select(CONVERSATION_WITH_CUSTOMER_COLUMNS)
    .eq("merchant_id", merchant.id)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  return (
    <PageTransition className="flex flex-col overflow-y-hidden overflow-x-visible">
      <div className="flex flex-col flex-1 min-h-0 gap-4">
        <h1 className="text-2xl font-semibold shrink-0">Messages</h1>
        <ConversationsContent
          initialConversations={
            (conversations as unknown as ConversationWithCustomer[]) ?? []
          }
          merchantId={merchant.id}
        />
      </div>
    </PageTransition>
  );
}

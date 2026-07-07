import { createClient } from "@/lib/supabase/server";
import { PageTransition } from "@/components/layout/page-transition";
import { ConversationsContent } from "@/components/conversations/conversations-content";
import { SyncHistoryButton } from "@/components/conversations/sync-history-button";
import type { ConversationWithCustomer } from "@/components/conversations/conversation-list";
import { CONVERSATION_LIST_COLUMNS } from "@/lib/db/columns";
import { requireMerchant } from "@/lib/auth/require-merchant";

export default async function ConversationsPage() {
  const { merchant } = await requireMerchant();
  const supabase = await createClient();

  // Fetch conversations with customer + their orders' statuses (for filtering).
  // Exclude "manual" conversations — manual orders no longer create them, and
  // any legacy ones aren't real chat channels.
  const { data: conversations } = await supabase
    .from("conversations")
    .select(CONVERSATION_LIST_COLUMNS)
    .eq("merchant_id", merchant.id)
    .neq("platform", "manual")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  return (
    <PageTransition className="flex flex-col overflow-y-hidden overflow-x-visible">
      <div className="flex flex-col flex-1 min-h-0 gap-4">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Messages</h1>
          <SyncHistoryButton />
        </div>
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

import { requireMerchant } from "@/lib/auth/require-merchant";
import { getUnreadTotal } from "@/lib/db/unread";
import { getOpenFlagsSummary } from "@/lib/db/flags";
import { MerchantProvider } from "@/components/layout/merchant-provider";
import { UnreadCountProvider } from "@/components/layout/unread-count-provider";
import { LazyUnreadCountSubscriber } from "@/components/layout/lazy-unread-count-subscriber";
import { OrdersCountProvider } from "@/components/layout/orders-count-provider";
import { OrdersCountSubscriber } from "@/components/layout/orders-count-subscriber";
import { FlagsCountProvider } from "@/components/layout/flags-count-provider";
import { LazyFlagsCountSubscriber } from "@/components/layout/lazy-flags-count-subscriber";
import { AudioUnlock } from "@/components/layout/audio-unlock";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, merchant } = await requireMerchant();
  const [unreadTotal, flagsSummary] = await Promise.all([
    getUnreadTotal(merchant.id),
    getOpenFlagsSummary(merchant.id),
  ]);

  const merchantData = {
    id: merchant.id,
    businessName: merchant.business_name,
    businessType: merchant.business_type,
    city: merchant.city,
    email: user.email ?? null,
  };

  return (
    <MerchantProvider merchant={merchantData}>
      <UnreadCountProvider initialCount={unreadTotal}>
        <OrdersCountProvider>
          <FlagsCountProvider
            initialCount={flagsSummary.count}
            initialPriority={flagsSummary.highestPriority}
          >
            <AudioUnlock />
            <LazyUnreadCountSubscriber
              merchantId={merchant.id}
              initialCount={unreadTotal}
            />
            <OrdersCountSubscriber merchantId={merchant.id} />
            <LazyFlagsCountSubscriber
              merchantId={merchant.id}
              initialCount={flagsSummary.count}
            />
            <div className="flex h-screen">
              <Sidebar />
              <div className="flex flex-1 flex-col min-w-0">
                <TopBar />
                <main className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6 pb-20 sm:pb-6">
                  {children}
                </main>
              </div>
              <MobileNav />
            </div>
          </FlagsCountProvider>
        </OrdersCountProvider>
      </UnreadCountProvider>
    </MerchantProvider>
  );
}

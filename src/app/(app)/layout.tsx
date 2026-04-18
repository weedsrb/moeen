import { requireMerchant } from "@/lib/auth/require-merchant";
import { getUnreadTotal } from "@/lib/db/unread";
import { MerchantProvider } from "@/components/layout/merchant-provider";
import { UnreadCountProvider } from "@/components/layout/unread-count-provider";
import { LazyUnreadCountSubscriber } from "@/components/layout/lazy-unread-count-subscriber";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, merchant } = await requireMerchant();
  const unreadTotal = await getUnreadTotal(merchant.id);

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
        <LazyUnreadCountSubscriber merchantId={merchant.id} />
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
      </UnreadCountProvider>
    </MerchantProvider>
  );
}

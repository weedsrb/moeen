import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MerchantProvider } from "@/components/layout/merchant-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  const isOnboarding = pathname === "/onboarding";

  // Fetch user and merchant data
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let merchantData = null;

  if (user) {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("id, business_name, business_type, city")
      .eq("user_id", user.id)
      .single();

    if (merchant) {
      merchantData = {
        id: merchant.id,
        businessName: merchant.business_name,
        businessType: merchant.business_type,
        city: merchant.city,
        email: user.email ?? null,
      };
    }
  }

  // Onboarding: render without app shell
  if (isOnboarding || !merchantData) {
    return <>{children}</>;
  }

  return (
    <MerchantProvider merchant={merchantData}>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <TopBar />
          <main className="flex-1 overflow-auto p-4 sm:p-6 pb-20 sm:pb-6">
            {children}
          </main>
        </div>
        <MobileNav />
      </div>
    </MerchantProvider>
  );
}

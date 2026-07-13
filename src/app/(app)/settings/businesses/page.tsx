import Link from "next/link";
import { PageTransition } from "@/components/layout/page-transition";
import { requireMerchant } from "@/lib/auth/require-merchant";
import { listOwnedMerchants } from "@/lib/db/merchants";
import { switchActiveMerchant } from "@/lib/auth/switch-merchant";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PlusCircle } from "lucide-react";

export default async function BusinessesSettingsPage() {
  const { user, merchant } = await requireMerchant();
  const owned = await listOwnedMerchants(user.id);

  return (
    <PageTransition>
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <SettingsNav />

        <div className="space-y-3">
          {owned.map((business) => {
            const isActive = business.id === merchant.id;
            return (
              <Card key={business.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{business.business_name}</span>
                      {isActive && <Badge variant="outline">Active</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[business.business_type, business.city]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {!isActive && (
                    <form action={switchActiveMerchant.bind(null, business.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Switch
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/onboarding/new" />}
        >
          <PlusCircle className="me-2 h-4 w-4" />
          Add another business
        </Button>
      </div>
    </PageTransition>
  );
}

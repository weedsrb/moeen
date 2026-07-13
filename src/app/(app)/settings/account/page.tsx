import { PageTransition } from "@/components/layout/page-transition";
import { requireMerchant } from "@/lib/auth/require-merchant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SignOutButton } from "@/components/settings/sign-out-button";

export default async function AccountSettingsPage() {
  const { user } = await requireMerchant();

  return (
    <PageTransition>
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <SettingsNav />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{user.email}</span>
            </div>
            <SignOutButton />
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

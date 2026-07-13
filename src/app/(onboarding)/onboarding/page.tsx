import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BusinessBasicsForm } from "@/components/onboarding/business-basics-form";
import { getMerchantCached, requireUser } from "@/lib/auth/require-merchant";

export default async function OnboardingPage() {
  const { user } = await requireUser();
  const merchant = await getMerchantCached(user.id);
  if (merchant?.onboarding_completed) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Welcome to Mo&apos;een
          </CardTitle>
          <CardDescription className="font-arabic text-base">
            مرحبا بك في معين
          </CardDescription>
          <p className="text-sm text-muted-foreground mt-2">
            Let&apos;s set up your business
          </p>
        </CardHeader>
        <CardContent>
          <BusinessBasicsForm />
          <p className="text-xs text-muted-foreground text-center mt-4">
            Step 1 of 1
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

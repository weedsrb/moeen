import { redirect } from "next/navigation";
import { getMerchantCached, requireUser } from "@/lib/auth/require-merchant";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  const merchant = await getMerchantCached(user.id);
  if (merchant?.onboarding_completed) redirect("/dashboard");
  return <>{children}</>;
}

import { requireUser } from "@/lib/auth/require-merchant";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}

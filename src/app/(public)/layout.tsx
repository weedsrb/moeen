import { requireNoAuth } from "@/lib/auth/require-merchant";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNoAuth();
  return <>{children}</>;
}

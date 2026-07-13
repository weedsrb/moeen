"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/sign-out";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={handleSignOut}>
      <LogOut className="me-2 h-4 w-4" />
      Sign Out
    </Button>
  );
}

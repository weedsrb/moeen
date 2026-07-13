"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useMerchant, useOwnedMerchants } from "./merchant-provider";
import { switchActiveMerchant } from "@/lib/auth/switch-merchant";
import { signOut } from "@/lib/auth/sign-out";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  setSoundMuted,
  subscribeMuted,
  getMutedSnapshot,
  getMutedServerSnapshot,
} from "@/lib/utils/notification-sound";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, LogOut, PlusCircle, Search, Volume2, VolumeX } from "lucide-react";
import { useCommandPalette } from "./command-palette-provider";

export function TopBar() {
  const merchant = useMerchant();
  const ownedMerchants = useOwnedMerchants();
  const router = useRouter();
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const muted = useSyncExternalStore(
    subscribeMuted,
    getMutedSnapshot,
    getMutedServerSnapshot
  );

  function toggleMuted() {
    setSoundMuted(!muted);
  }

  const initials = merchant.businessName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const otherMerchants = ownedMerchants.filter((m) => m.id !== merchant.id);

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card shrink-0">
      {/* Mobile logo */}
      <span className="text-lg font-bold sm:hidden">Mo&apos;een</span>

      {/* Business name */}
      <span className="text-sm font-medium hidden sm:block">
        {merchant.businessName}
      </span>

      <div className="flex items-center gap-2">
        {/* Global search / command palette trigger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCommandPaletteOpen(true)}
          title="Search (⌘K)"
          aria-label="Open search"
        >
          <Search className="h-5 w-5" />
        </Button>

        {/* Notification sound toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMuted}
          title={muted ? "Notification sounds off" : "Notification sounds on"}
          aria-label={
            muted ? "Unmute notification sounds" : "Mute notification sounds"
          }
        >
          {muted ? (
            <VolumeX className="h-5 w-5" />
          ) : (
            <Volume2 className="h-5 w-5" />
          )}
        </Button>

        {/* Notification bell (static for Phase 1) */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
        </Button>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full p-1 hover:bg-accent transition-colors">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{merchant.businessName}</p>
              {merchant.email && (
                <p className="text-xs text-muted-foreground">{merchant.email}</p>
              )}
            </div>
            {otherMerchants.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {otherMerchants.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => switchActiveMerchant(m.id)}
                    >
                      {m.businessName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/onboarding/new")}>
              <PlusCircle className="me-2 h-4 w-4" />
              Add another business
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-sm">Theme</span>
              <ThemeToggle />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="me-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

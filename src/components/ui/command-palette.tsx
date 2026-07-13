"use client";

import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { searchRegistry, type SearchItem } from "@/lib/search/registry";
import { useTheme } from "@/components/theme-provider";
import { setSoundMuted, getMutedSnapshot } from "@/lib/utils/notification-sound";
import { signOut } from "@/lib/auth/sign-out";
import { Search } from "lucide-react";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  function runAction(item: SearchItem) {
    onOpenChange(false);

    if (item.href) {
      router.push(item.href);
      return;
    }

    switch (item.action) {
      case "toggle-theme":
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
        break;
      case "toggle-sound":
        setSoundMuted(!getMutedSnapshot());
        break;
      case "sign-out":
        signOut().then(() => {
          router.push("/login");
          router.refresh();
        });
        break;
    }
  }

  const categories: SearchItem["category"][] = ["Pages", "Settings", "Actions"];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-lg duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Search
          </DialogPrimitive.Title>
          <Command
            className="flex flex-col overflow-hidden rounded-xl"
            filter={(value, search, keywords) => {
              const haystack = `${value} ${keywords?.join(" ") ?? ""}`.toLowerCase();
              return haystack.includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Search pages, settings, actions..."
                className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </Command.Empty>
              {categories.map((category) => {
                const items = searchRegistry.filter(
                  (item) => item.category === category
                );
                if (items.length === 0) return null;
                return (
                  <Command.Group
                    key={category}
                    heading={category}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Command.Item
                          key={item.id}
                          value={item.label}
                          keywords={item.keywords}
                          onSelect={() => runAction(item)}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-default select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                        >
                          {Icon && <Icon className="h-4 w-4 shrink-0" />}
                          {item.label}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                );
              })}
            </Command.List>
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

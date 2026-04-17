"use client";

import dynamic from "next/dynamic";

export const LazyUnreadCountSubscriber = dynamic(
  () => import("./unread-count-subscriber"),
  { ssr: false }
);

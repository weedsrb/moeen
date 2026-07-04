"use client";

import dynamic from "next/dynamic";

export const LazyFlagsCountSubscriber = dynamic(
  () => import("./flags-count-subscriber"),
  { ssr: false }
);

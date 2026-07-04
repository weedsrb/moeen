"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { FlagPriority } from "@/types/flag";

export interface FlagsSummary {
  count: number;
  highestPriority: FlagPriority | null;
}

type FlagsCountContextValue = {
  count: number;
  highestPriority: FlagPriority | null;
  setSummary: (s: FlagsSummary) => void;
};

const FlagsCountContext = createContext<FlagsCountContextValue>({
  count: 0,
  highestPriority: null,
  setSummary: () => {},
});

export function FlagsCountProvider({
  children,
  initialCount,
  initialPriority,
}: {
  children: React.ReactNode;
  initialCount: number;
  initialPriority: FlagPriority | null;
}) {
  const [summary, setSummaryState] = useState<FlagsSummary>({
    count: initialCount,
    highestPriority: initialPriority,
  });
  const setSummary = useCallback((s: FlagsSummary) => setSummaryState(s), []);

  return (
    <FlagsCountContext.Provider
      value={{
        count: summary.count,
        highestPriority: summary.highestPriority,
        setSummary,
      }}
    >
      {children}
    </FlagsCountContext.Provider>
  );
}

export function useFlagsCount(): number {
  return useContext(FlagsCountContext).count;
}

export function useHighestFlagPriority(): FlagPriority | null {
  return useContext(FlagsCountContext).highestPriority;
}

export function useFlagsSummarySetter(): (s: FlagsSummary) => void {
  return useContext(FlagsCountContext).setSummary;
}

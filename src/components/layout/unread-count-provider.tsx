"use client";

import { createContext, useContext, useState, useCallback } from "react";

type UnreadCountContextValue = {
  count: number;
  setCount: (n: number) => void;
};

const UnreadCountContext = createContext<UnreadCountContextValue>({
  count: 0,
  setCount: () => {},
});

export function UnreadCountProvider({
  children,
  initialCount,
}: {
  children: React.ReactNode;
  initialCount: number;
}) {
  const [count, setCountState] = useState(initialCount);
  const setCount = useCallback((n: number) => setCountState(n), []);
  return (
    <UnreadCountContext.Provider value={{ count, setCount }}>
      {children}
    </UnreadCountContext.Provider>
  );
}

export function useUnreadCount(): number {
  return useContext(UnreadCountContext).count;
}

export function useUnreadCountSetter(): (n: number) => void {
  return useContext(UnreadCountContext).setCount;
}

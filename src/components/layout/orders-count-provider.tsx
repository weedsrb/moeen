"use client";

import { createContext, useCallback, useContext, useState } from "react";

type OrdersCountContextValue = {
  count: number;
  setCount: (n: number) => void;
};

const OrdersCountContext = createContext<OrdersCountContextValue>({
  count: 0,
  setCount: () => {},
});

export function OrdersCountProvider({
  children,
  initialCount = 0,
}: {
  children: React.ReactNode;
  initialCount?: number;
}) {
  const [count, setCountState] = useState(initialCount);
  const setCount = useCallback((n: number) => setCountState(n), []);

  return (
    <OrdersCountContext.Provider value={{ count, setCount }}>
      {children}
    </OrdersCountContext.Provider>
  );
}

export function useOrdersCount(): number {
  return useContext(OrdersCountContext).count;
}

export function useOrdersCountSetter(): (n: number) => void {
  return useContext(OrdersCountContext).setCount;
}

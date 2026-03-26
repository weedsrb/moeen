"use client";

import { createContext, useContext } from "react";

export type MerchantData = {
  id: string;
  businessName: string;
  businessType: string | null;
  city: string | null;
  email: string | null;
};

const MerchantContext = createContext<MerchantData | null>(null);

export function MerchantProvider({
  merchant,
  children,
}: {
  merchant: MerchantData;
  children: React.ReactNode;
}) {
  return (
    <MerchantContext.Provider value={merchant}>
      {children}
    </MerchantContext.Provider>
  );
}

export function useMerchant() {
  const context = useContext(MerchantContext);
  if (!context) {
    throw new Error("useMerchant must be used within a MerchantProvider");
  }
  return context;
}

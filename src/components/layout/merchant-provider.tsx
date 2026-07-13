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

export type OwnedMerchantSummary = {
  id: string;
  businessName: string;
  businessType: string | null;
};

const OwnedMerchantsContext = createContext<OwnedMerchantSummary[] | null>(
  null
);

export function OwnedMerchantsProvider({
  merchants,
  children,
}: {
  merchants: OwnedMerchantSummary[];
  children: React.ReactNode;
}) {
  return (
    <OwnedMerchantsContext.Provider value={merchants}>
      {children}
    </OwnedMerchantsContext.Provider>
  );
}

export function useOwnedMerchants() {
  const context = useContext(OwnedMerchantsContext);
  if (!context) {
    throw new Error(
      "useOwnedMerchants must be used within an OwnedMerchantsProvider"
    );
  }
  return context;
}

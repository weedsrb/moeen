"use client";

import { useActionState } from "react";
import { createMerchantProfile, type OnboardingState } from "@/app/(onboarding)/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const businessTypes = [
  { value: "food", label: "Food & Beverages" },
  { value: "clothing", label: "Clothing & Fashion" },
  { value: "handmade", label: "Handmade & Crafts" },
  { value: "home", label: "Home & Living" },
  { value: "other", label: "Other" },
];

export function BusinessBasicsForm({
  submitLabel = "Get Started",
}: {
  submitLabel?: string;
} = {}) {
  const [state, formAction, isPending] = useActionState<OnboardingState, FormData>(
    createMerchantProfile,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="businessName">Business Name *</Label>
        <Input
          id="businessName"
          name="businessName"
          placeholder="Your business name"
          required
          minLength={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessType">Business Type *</Label>
        <Select name="businessType" required>
          <SelectTrigger>
            <SelectValue placeholder="Select your business type" />
          </SelectTrigger>
          <SelectContent>
            {businessTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="city">City / Location</Label>
        <Input
          id="city"
          name="city"
          placeholder="e.g. Ramallah, Gaza, Nablus"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Business Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="+970 5XX XXX XXX"
        />
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

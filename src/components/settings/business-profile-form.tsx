"use client";

import { useActionState } from "react";
import {
  updateBusinessProfile,
  type BusinessProfileState,
} from "@/app/(app)/settings/actions";
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

export function BusinessProfileForm({
  businessName,
  businessType,
  city,
  phone,
}: {
  businessName: string;
  businessType: string | null;
  city: string | null;
  phone: string | null;
}) {
  const [state, formAction, isPending] = useActionState<
    BusinessProfileState,
    FormData
  >(updateBusinessProfile, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="businessName">Business Name *</Label>
        <Input
          id="businessName"
          name="businessName"
          defaultValue={businessName}
          required
          minLength={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessType">Business Type *</Label>
        <Select name="businessType" defaultValue={businessType ?? undefined} required>
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
          defaultValue={city ?? ""}
          placeholder="e.g. Ramallah, Gaza, Nablus"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Business Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          placeholder="+970 5XX XXX XXX"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-status-confirmed">Saved.</p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
        Save Changes
      </Button>
    </form>
  );
}

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BusinessBasicsForm } from "@/components/onboarding/business-basics-form";

export default function AddBusinessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Add another business
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Set up a new, independent business under your account
          </p>
        </CardHeader>
        <CardContent>
          <BusinessBasicsForm submitLabel="Create Business" />
          <p className="text-xs text-muted-foreground text-center mt-4">
            <Link href="/settings/businesses" className="underline">
              Cancel
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

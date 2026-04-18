import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BusinessBasicsForm } from "@/components/onboarding/business-basics-form";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Welcome to Mo&apos;een
          </CardTitle>
          <CardDescription className="font-arabic text-base">
            مرحبا بك في معين
          </CardDescription>
          <p className="text-sm text-muted-foreground mt-2">
            Let&apos;s set up your business
          </p>
        </CardHeader>
        <CardContent>
          <BusinessBasicsForm />
          <p className="text-xs text-muted-foreground text-center mt-4">
            Step 1 of 1
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

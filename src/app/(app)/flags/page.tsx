import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  { title: "Critical", color: "text-red-500" },
  { title: "Medium", color: "text-amber-500" },
  { title: "Low", color: "text-muted-foreground" },
];

export default function FlagsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Flags &amp; Escalations</h1>
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className={`text-lg ${section.color}`}>
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No {section.title.toLowerCase()} flags
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageTransition>
  );
}

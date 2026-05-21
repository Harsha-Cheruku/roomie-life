import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This module is scaffolded and ready to be wired to real data.
        </CardContent>
      </Card>
    </div>
  );
}

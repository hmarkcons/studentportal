import { Card } from "@/components/ui/Card";

// A placeholder for the Social Media sections built in later phases, so the nav
// links resolve from Phase A onward.
export function ComingSoon({ title, phase, detail }: { title: string; phase: string; detail: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <Card>
        <p className="text-sm text-ink">Coming in {phase}.</p>
        <p className="mt-1 text-sm text-muted">{detail}</p>
      </Card>
    </div>
  );
}

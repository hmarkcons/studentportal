import { Card } from "@/components/ui/Card";

const VIDEOS = [
  { title: "Welcome to your HMARK Student Portal", url: "https://www.youtube.com/embed/dQw4w9WgXcQ" },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Guide</h2>
      <div className="flex flex-col gap-6">
        {VIDEOS.map((v) => (
          <Card key={v.url}>
            <p className="mb-3 text-sm font-medium text-ink">{v.title}</p>
            <div className="aspect-video overflow-hidden rounded-md">
              <iframe src={v.url} className="h-full w-full" allowFullScreen title={v.title} />
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">More tutorials will be added here as HMARK produces them.</p>
    </div>
  );
}

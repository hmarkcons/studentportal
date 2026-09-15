import { Badge } from "@/components/ui/Badge";
import { audienceLabel, type VisaPageSection } from "@/lib/visaPage";

/**
 * The blocks the office added in the visa page builder.
 *
 * The staff side is told which ones the student can also see, because a
 * counselor reading a section aloud should know whether they are repeating
 * something already on the student's own screen.
 */
export function VisaPageSections({
  sections,
  showAudience = false,
}: {
  sections: VisaPageSection[];
  showAudience?: boolean;
}) {
  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {sections.map((s) => (
        <div key={s.id} className="rounded-md border border-border p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium text-ink">{s.title}</h4>
            {/* Only where it tells the reader something: "student and staff"
                on a staff page is noise, "staff only" is not. */}
            {showAudience && s.audience !== "both" && <Badge tone="warning">{audienceLabel(s.audience)}</Badge>}
          </div>
          {/* whitespace-pre-line: these are written as lists of lines, and
              collapsing them runs the steps together. */}
          {s.body && <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{s.body}</p>}
          {s.linkUrl && s.linkLabel && (
            <a
              href={s.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
            >
              {s.linkLabel} &rarr;
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

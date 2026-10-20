import { Badge } from "@/components/ui/Badge";
import { linkHref } from "@/lib/catalogueText";
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
      {sections.map((s) => {
        // A builder section's link is free text (0304): only a real http(s)
        // address becomes a link, never a stored javascript:/data: URL that
        // would run in the student's or a counsellor's browser on click.
        const href = linkHref(s.linkUrl);
        return (
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
            {s.linkLabel && href ? (
              <a href={href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                {s.linkLabel} &rarr;
              </a>
            ) : s.linkLabel && s.linkUrl ? (
              <p className="mt-2 text-sm text-ink">
                {s.linkLabel}: {s.linkUrl}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

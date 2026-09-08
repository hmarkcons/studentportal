import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDateOnly } from "@/lib/formatDate";
import {
  profileChecklist,
  countMissing,
  passportStatus,
  PROFILE_GROUP_LABELS,
  PASSPORT_MIN_MONTHS,
  type ProfileGroup,
  type ProfileInput,
} from "@/lib/profileCompleteness";

const LONG_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const GROUPS: ProfileGroup[] = ["personal", "passport", "sponsor"];

// Grouped rather than one flat list of eleven ticks: a student who has filled
// in their own details but not their sponsor's should be able to see that at a
// glance instead of scanning for the crosses.
export function ProfileCompleteness({ input }: { input: ProfileInput }) {
  const checks = profileChecklist(input);
  const missing = countMissing(checks);
  const passport = passportStatus(input.passport_expiry);

  return (
    <Card className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">
          {missing === 0 ? "Your profile is complete" : "Finish your profile"}
        </h3>
        <Badge tone={missing === 0 ? "success" : "warning"}>
          {missing === 0 ? "Nothing missing" : `${missing} to add`}
        </Badge>
      </div>

      <p className="mb-3 text-xs text-muted">
        {missing === 0
          ? "Everything your visa application needs from this page is here."
          : "These are the details your visa application needs. Your counsellor will ask for them anyway — filling them in now saves a round trip."}
      </p>

      {/* A passport that has expired, or runs out mid-application, stops an
          application dead — so it is called out rather than left as one tick
          among eleven. */}
      {passport.state === "expired" && (
        <p className="mb-3 rounded-md bg-warning-bg p-3 text-sm text-warning">
          Your passport expired on {formatDateOnly(passport.expiry!, LONG_DATE)}. You will need to renew it before a visa
          application can be filed — tell your counsellor once you have the new one.
        </p>
      )}
      {passport.state === "expiring" && (
        <p className="mb-3 rounded-md bg-warning-bg p-3 text-sm text-warning">
          Your passport expires on {formatDateOnly(passport.expiry!, LONG_DATE)}, in {passport.daysLeft} days. Most
          student visas need at least {PASSPORT_MIN_MONTHS} months&rsquo; validity, so it is worth starting a renewal now.
        </p>
      )}

      {missing > 0 && (
        <div className="flex flex-col gap-3">
          {GROUPS.map((group) => {
            const groupChecks = checks.filter((c) => c.group === group);
            const groupMissing = groupChecks.filter((c) => !c.met);
            if (groupMissing.length === 0) return null;
            return (
              <div key={group}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {PROFILE_GROUP_LABELS[group]}
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {groupMissing.map((c) => (
                    <li key={c.label} className="text-sm text-ink">
                      &middot; {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// University admission interviews: the fields, and how a time is displayed.
//
// The timezone is the part that matters most. A university quotes "14:00" in
// its own time; the student reads it in Karachi. Storing only an instant leaves
// nobody able to say which clock the number came from, and staff converting by
// hand makes a silent mistake possible on the one date a student cannot afford
// to get wrong. So the quoted zone is stored alongside the instant, and both
// times are always shown together.

export const INTERVIEW_PLATFORMS = [
  "zoom",
  "microsoft_teams",
  "google_meet",
  "skype",
  "whatsapp",
  "phone",
  "in_person",
  "other",
] as const;

export type InterviewPlatform = (typeof INTERVIEW_PLATFORMS)[number];

export const INTERVIEW_PLATFORM_LABELS: Record<InterviewPlatform, string> = {
  zoom: "Zoom",
  microsoft_teams: "Microsoft Teams",
  google_meet: "Google Meet",
  skype: "Skype",
  whatsapp: "WhatsApp",
  phone: "Phone call",
  in_person: "In person",
  other: "Other",
};

/** Only "other" needs the name typing in. */
export function platformNeedsName(platform: string): boolean {
  return platform === "other";
}

export function platformLabel(platform: string | null, otherName?: string | null): string {
  if (!platform) return "Platform not set";
  if (platformNeedsName(platform)) return (otherName ?? "").trim() || "Other";
  return INTERVIEW_PLATFORM_LABELS[platform as InterviewPlatform] ?? platform;
}

export const INTERVIEW_STATUSES = [
  "scheduled",
  "completed",
  "passed",
  "failed",
  "rescheduled",
  "cancelled",
] as const;

export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed — awaiting result",
  passed: "Passed",
  failed: "Not successful",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
};

export const INTERVIEW_STATUS_TONE: Record<InterviewStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  scheduled: "info",
  completed: "warning",
  passed: "success",
  failed: "danger",
  rescheduled: "warning",
  cancelled: "neutral",
};

export function interviewStatusLabel(status: string | null): string {
  if (!status) return "Scheduled";
  return (INTERVIEW_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

/** A status that means the interview is still ahead of the student. */
export function isUpcomingStatus(status: string | null): boolean {
  return status === "scheduled" || status === "rescheduled";
}

/** Where the student is, and therefore what "your time" means to them. */
export const STUDENT_TIMEZONE = "Asia/Karachi";

/**
 * The zones worth offering: Pakistan, every destination HMARK sends students
 * to, and UTC. A free-text IANA name would be mistyped; a full list of six
 * hundred would be unusable.
 */
export const INTERVIEW_TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "Europe/Rome", label: "Italy (Rome)" },
  { value: "Europe/Berlin", label: "Germany (Berlin)" },
  { value: "Europe/Vienna", label: "Austria (Vienna)" },
  { value: "Europe/Paris", label: "France (Paris)" },
  { value: "Europe/Helsinki", label: "Finland (Helsinki)" },
  { value: "Europe/Luxembourg", label: "Luxembourg" },
  { value: "Europe/Budapest", label: "Hungary (Budapest)" },
  { value: "Europe/Bucharest", label: "Romania (Bucharest)" },
  { value: "Europe/Stockholm", label: "Sweden (Stockholm)" },
  { value: "Europe/Amsterdam", label: "Netherlands (Amsterdam)" },
  { value: "Europe/Athens", label: "Greece (Athens)" },
  { value: "Europe/London", label: "United Kingdom (London)" },
  { value: "Europe/Dublin", label: "Ireland (Dublin)" },
  { value: "Europe/Istanbul", label: "Türkiye (Istanbul)" },
  { value: "Asia/Nicosia", label: "Northern Cyprus (Nicosia)" },
  { value: "America/New_York", label: "US East (New York)" },
  { value: "America/Chicago", label: "US Central (Chicago)" },
  { value: "America/Los_Angeles", label: "US West (Los Angeles)" },
  { value: "America/Toronto", label: "Canada East (Toronto)" },
  { value: "America/Vancouver", label: "Canada West (Vancouver)" },
  { value: "Australia/Sydney", label: "Australia (Sydney)" },
  { value: "Pacific/Auckland", label: "New Zealand (Auckland)" },
  { value: "UTC", label: "UTC" },
];

export function isInterviewTimezone(value: string): boolean {
  return INTERVIEW_TIMEZONES.some((z) => z.value === value);
}

export function timezoneLabel(value: string | null): string {
  if (!value) return "";
  return INTERVIEW_TIMEZONES.find((z) => z.value === value)?.label ?? value;
}

/**
 * Turns a stored instant into the two readings that matter: the student's own
 * time, and the time as the university quoted it.
 *
 * Both are formatted with a pinned locale as well as a pinned zone. These
 * render on the server and hydrate on the client, and the two disagree about
 * locale — Vercel is en-US, the browser is whatever the reader has set — which
 * React reports as a hydration mismatch and recovers from by throwing away the
 * server HTML.
 */
export type InterviewTimes = {
  /** e.g. "Sat, Nov 28, 2026, 18:00" */
  studentTime: string;
  /** The same instant where the university is: "14:00", or "Nov 28, 21:00"
   *  when that falls on a different day from the student's reading. */
  universityTime: string;
  universityZoneLabel: string;
  /** True when the university is in the student's own zone, so one line is enough. */
  sameZone: boolean;
  /** True when the two readings fall on different calendar days. */
  differentDay: boolean;
};

const DATE_PART: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
};
// 24-hour, and two digits. A student reading "7:00" for an interview that is
// actually at 07:00 has no way to know it is not the evening, and am/pm is one
// more thing to get wrong on the one appointment that cannot be rescheduled.
const TIME_PART: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };

const dayKey = (at: Date, zone: string) => at.toLocaleDateString("en-CA", { timeZone: zone });

export function interviewTimes(iso: string | null, timezone: string | null): InterviewTimes | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const zone = timezone && isInterviewTimezone(timezone) ? timezone : STUDENT_TIMEZONE;
  // A 21:00 interview in New York is 07:00 the NEXT morning in Karachi. Showing
  // the university's time as a bare "21:00" next to the student's "29 Nov" then
  // reads as a contradiction, so the university's date comes along whenever the
  // two fall on different days.
  const differentDay = dayKey(at, STUDENT_TIMEZONE) !== dayKey(at, zone);

  return {
    studentTime: at.toLocaleString("en-US", { ...DATE_PART, ...TIME_PART, timeZone: STUDENT_TIMEZONE }),
    universityTime: at.toLocaleString("en-US", {
      ...(differentDay ? { day: "numeric", month: "short" } : {}),
      ...TIME_PART,
      timeZone: zone,
    }),
    universityZoneLabel: timezoneLabel(zone),
    sameZone: zone === STUDENT_TIMEZONE,
    differentDay,
  };
}

/**
 * The instant a wall-clock time in a given zone refers to.
 *
 * Staff type "28 Nov 14:00" meaning 14:00 where the university is, so the
 * offset for that zone on that date has to be worked out — and it is the date
 * that matters, since Rome is +1 in November and +2 in July. Done by asking
 * Intl what the candidate instant looks like in the zone and correcting by the
 * difference, which handles both directions without a timezone library.
 */
export function localWallTimeToInstant(localDateTime: string, timezone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(localDateTime)) return null;
  const zone = isInterviewTimezone(timezone) ? timezone : STUDENT_TIMEZONE;

  // Treat the typed value as if it were UTC, then measure how far off that is
  // when read in the target zone, and shift by exactly that much.
  const asUtc = new Date(`${localDateTime.slice(0, 16)}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;

  const readBackInZone = new Date(
    asUtc.toLocaleString("en-US", { timeZone: zone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(
      /(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/,
      "$3-$1-$2T$4:$5:$6Z"
    )
  );
  if (Number.isNaN(readBackInZone.getTime())) return null;

  const offset = readBackInZone.getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offset).toISOString();
}

/** The reverse, for filling the edit form back in. */
export function instantToLocalWallTime(iso: string | null, timezone: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const zone = timezone && isInterviewTimezone(timezone) ? timezone : STUDENT_TIMEZONE;
  const parts = at
    .toLocaleString("en-US", { timeZone: zone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+)/, "$3-$1-$2T$4:$5");
  return parts;
}

export type InterviewInput = {
  roundLabel: string;
  localDateTime: string;
  timezone: string;
  platform: string;
  platformOther: string;
  status: string;
  link: string;
};

export function interviewFieldsError(input: InterviewInput): string | null {
  if (!input.roundLabel.trim()) return "Name the round — \"Technical\", \"Panel\", whatever the university calls it.";
  if (!input.localDateTime) return "Give the interview a date and time.";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.localDateTime)) return "That date and time is not a valid one.";
  if (!isInterviewTimezone(input.timezone)) {
    return "Choose the timezone the university quoted the time in — without it nobody can tell whose clock it is.";
  }
  if (!(INTERVIEW_PLATFORMS as readonly string[]).includes(input.platform)) return "Choose how the interview is held.";
  if (platformNeedsName(input.platform) && !input.platformOther.trim()) {
    return "Name the platform, or the student is told the interview is on \"Other\".";
  }
  if (!(INTERVIEW_STATUSES as readonly string[]).includes(input.status)) return "Choose a status.";
  if (input.link.trim() && !/^https?:\/\//i.test(input.link.trim())) {
    return "The link needs to start with http:// or https://.";
  }
  return null;
}

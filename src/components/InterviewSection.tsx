"use client";

import { useActionState, useState } from "react";
import { addInterview, updateInterview, deleteInterview } from "@/lib/actions/interviews";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  INTERVIEW_PLATFORMS,
  INTERVIEW_PLATFORM_LABELS,
  INTERVIEW_STATUSES,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_STATUS_TONE,
  INTERVIEW_TIMEZONES,
  STUDENT_TIMEZONE,
  instantToLocalWallTime,
  interviewStatusLabel,
  interviewTimes,
  platformLabel,
  platformNeedsName,
  type InterviewStatus,
} from "@/lib/interviews";

export type InterviewCredentials = {
  login_username: string | null;
  login_password: string | null;
  login_instructions: string | null;
  share_with_student: boolean;
} | null;

export type InterviewRow = {
  id: string;
  round_label: string;
  confirmed_datetime: string | null;
  timezone: string | null;
  platform: string | null;
  platform_other: string | null;
  status: string;
  interview_details: string | null;
  interview_link: string | null;
  preparation_notes: string | null;
  credentials: InterviewCredentials;
};

function TimeReadings({ interview }: { interview: InterviewRow }) {
  const times = interviewTimes(interview.confirmed_datetime, interview.timezone);
  if (!times) return <span className="text-xs text-muted">No date set</span>;
  return (
    <span className="text-xs text-muted">
      {times.studentTime} <span className="text-ink">Pakistan time</span>
      {!times.sameZone && ` · ${times.universityTime} ${times.universityZoneLabel}`}
    </span>
  );
}

// One form for both adding and editing: the fields are identical and keeping
// two copies is how the two drift apart on what is required.
function InterviewForm({
  applicationId,
  revalidateTo,
  existing,
  onDone,
}: {
  applicationId: string;
  revalidateTo: string;
  existing?: InterviewRow;
  onDone: () => void;
}) {
  const action = existing
    ? updateInterview.bind(null, existing.id, revalidateTo)
    : addInterview.bind(null, applicationId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [platform, setPlatform] = useState(existing?.platform ?? "zoom");
  const [shareCredentials, setShareCredentials] = useState(existing?.credentials?.share_with_student ?? false);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Round
          <Input
            name="round_label"
            defaultValue={existing?.round_label ?? ""}
            placeholder="e.g. Technical, Panel, Departmental"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <Select name="status" defaultValue={existing?.status ?? "scheduled"}>
            {INTERVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INTERVIEW_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Date &amp; time, as the university gave it
          <Input
            name="local_datetime"
            type="datetime-local"
            defaultValue={instantToLocalWallTime(existing?.confirmed_datetime ?? null, existing?.timezone ?? null)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          In which timezone
          <Select name="timezone" defaultValue={existing?.timezone ?? STUDENT_TIMEZONE}>
            {INTERVIEW_TIMEZONES.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {/* The one field most likely to make a student miss an interview. Enter
          the university's own clock and this converts it; nobody has to do the
          arithmetic, and a mistake in it cannot go unnoticed. */}
      <p className="-mt-1 text-xs text-muted">
        Enter the time exactly as the university quoted it and pick their timezone. The student is shown their own
        local time with the university&rsquo;s alongside.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Held on
          <Select name="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {INTERVIEW_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {INTERVIEW_PLATFORM_LABELS[p]}
              </option>
            ))}
          </Select>
        </label>
        {platformNeedsName(platform) ? (
          <label className="flex flex-col gap-1 text-xs text-muted">
            Which platform
            <Input
              name="platform_other"
              defaultValue={existing?.platform_other ?? ""}
              placeholder="e.g. the university's own portal"
              required
            />
          </label>
        ) : (
          <input type="hidden" name="platform_other" value="" />
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Joining link, or a page with the details
        <Input
          name="interview_link"
          type="url"
          defaultValue={existing?.interview_link ?? ""}
          placeholder="https://…"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Interview details (the student sees this)
        <Textarea
          name="interview_details"
          defaultValue={existing?.interview_details ?? ""}
          rows={2}
          placeholder="Who is interviewing, how long, what it covers…"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        How to prepare (the student sees this)
        <Textarea
          name="preparation_notes"
          defaultValue={existing?.preparation_notes ?? ""}
          rows={2}
          placeholder="What to bring, what to revise, dress code…"
        />
      </label>

      {/* Credentials are stored apart from the rest of the interview and are
          not readable by the student unless the box below is ticked — enforced
          by row-level security, not by leaving them out of a query. */}
      <fieldset className="flex flex-col gap-2 rounded-md border border-border p-2">
        <legend className="px-1 text-xs font-medium text-ink">Login credentials, if the university issued any</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Username / meeting ID
            <Input name="login_username" defaultValue={existing?.credentials?.login_username ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Password / passcode
            <Input name="login_password" defaultValue={existing?.credentials?.login_password ?? ""} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Anything else about signing in
          <Input name="login_instructions" defaultValue={existing?.credentials?.login_instructions ?? ""} />
        </label>
        <label className="flex items-start gap-2 text-xs text-ink">
          <input
            type="checkbox"
            name="share_with_student"
            checked={shareCredentials}
            onChange={(e) => setShareCredentials(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Show these to the student
            <span className="block text-muted">
              Off by default. While it is off the student cannot read them at all, not just on screen.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          {existing ? "Save interview" : "Add interview"}
        </Button>
        <button type="button" onClick={onDone} className="text-xs text-muted hover:underline">
          Cancel
        </button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </div>
    </form>
  );
}

function InterviewCard({
  interview,
  revalidateTo,
  canManage,
}: {
  interview: InterviewRow;
  revalidateTo: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applicationId = ""; // not needed when editing

  async function remove() {
    if (!confirm(`Delete the ${interview.round_label} interview?`)) return;
    setError(null);
    const result = await deleteInterview(interview.id, revalidateTo);
    if (result?.error) setError(result.error);
  }

  if (editing) {
    return (
      <InterviewForm
        applicationId={applicationId}
        revalidateTo={revalidateTo}
        existing={interview}
        onDone={() => setEditing(false)}
      />
    );
  }

  const credentials = interview.credentials;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {interview.round_label}
            <span className="ml-2 font-normal text-muted">{platformLabel(interview.platform, interview.platform_other)}</span>
          </p>
          <TimeReadings interview={interview} />
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone={INTERVIEW_STATUS_TONE[interview.status as InterviewStatus] ?? "neutral"}>
            {interviewStatusLabel(interview.status)}
          </Badge>
          {canManage && (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary" title="Edit">
                ✏️
              </button>
              <button onClick={remove} className="text-xs text-muted hover:text-danger" title="Delete">
                🗑️
              </button>
            </>
          )}
        </span>
      </div>

      {interview.interview_link && (
        <a
          href={interview.interview_link}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex text-xs font-medium text-primary hover:underline"
        >
          Joining link / details &rarr;
        </a>
      )}
      {interview.interview_details && <p className="mt-1 text-xs text-muted">{interview.interview_details}</p>}
      {interview.preparation_notes && (
        <p className="mt-1 text-xs text-muted">
          <span className="text-ink">To prepare:</span> {interview.preparation_notes}
        </p>
      )}

      {credentials && (
        <p className="mt-2 text-xs">
          <span className="text-ink">Credentials on file</span>
          {credentials.share_with_student ? (
            <Badge tone="warning">Shown to the student</Badge>
          ) : (
            <span className="ml-2 text-muted">not shared with the student</span>
          )}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function InterviewSection({
  applicationId,
  revalidateTo,
  interviews,
  canManage = false,
}: {
  applicationId: string;
  revalidateTo: string;
  interviews: InterviewRow[];
  /** interviews.manage — Super Admin and Processing by default. */
  canManage?: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {interviews.length === 0 && !adding && (
        <EmptyState>
          No interview required for this application yet. Add one if the university asks for it.
        </EmptyState>
      )}

      {interviews.map((i) => (
        <InterviewCard key={i.id} interview={i} revalidateTo={revalidateTo} canManage={canManage} />
      ))}

      {canManage &&
        (adding ? (
          <InterviewForm applicationId={applicationId} revalidateTo={revalidateTo} onDone={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="self-start text-xs font-medium text-primary hover:underline"
          >
            + Add interview
          </button>
        ))}
    </div>
  );
}

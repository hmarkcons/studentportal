"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPost, type CreatePostTarget } from "@/lib/actions/socialPosts";
import { validateForPlatform, type DraftMedia } from "@/lib/social/validate";
import { PLATFORM_LABELS, type SocialPlatform } from "@/lib/social/types";
import { PLATFORM_LIMITS, INSTAGRAM_POST_TYPES, TIKTOK_PRIVACY_LEVELS, SNAPCHAT_DESTINATIONS } from "@/lib/social/limits";
import { karachiLocalToUtcIso } from "@/lib/social/time";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

type Account = { id: string; platform: SocialPlatform; displayName: string; username: string | null; status: string };
type Media = { id: string; publicUrl: string; kind: "image" | "video"; sizeBytes: number | null };

const effectiveCaption = (base: string, override: string, hashtags: string) =>
  `${(override.trim() || base).trim()}${hashtags.trim() ? `\n\n${hashtags.trim()}` : ""}`;

const textareaClass = "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none";

export function ComposerForm({ accounts, media, campaigns, countries }: {
  accounts: Account[];
  media: Media[];
  campaigns: { id: string; name: string }[];
  countries: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [link, setLink] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, Record<string, string>>>({});
  const [country, setCountry] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [intake, setIntake] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const selectedMedia: DraftMedia[] = useMemo(
    () => media.filter((m) => mediaIds.includes(m.id)).map((m) => ({ kind: m.kind, sizeBytes: m.sizeBytes })),
    [media, mediaIds],
  );

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  // Per selected account: its effective caption, counter and validation errors.
  const perAccount = useMemo(
    () =>
      targetIds.map((id) => {
        const acc = accounts.find((a) => a.id === id)!;
        const cap = effectiveCaption(caption, overrides[id] ?? "", hashtags);
        const errs = validateForPlatform(acc.platform, { caption: cap, link: link || null, media: selectedMedia, options: options[id] ?? {} });
        return { acc, cap, errs, max: PLATFORM_LIMITS[acc.platform].captionMax };
      }),
    [targetIds, accounts, caption, overrides, hashtags, link, selectedMedia, options],
  );

  const anyErrors = perAccount.some((p) => p.errs.length > 0);

  const submit = (mode: "draft" | "schedule") => {
    setError(null);
    if (targetIds.length === 0) return setError("Choose at least one account to post to.");
    if (mode === "schedule" && !scheduledAt) return setError("Pick a date and time to schedule.");
    const targets: CreatePostTarget[] = targetIds.map((id) => ({
      accountId: id,
      captionOverride: overrides[id]?.trim() || null,
      options: options[id] ?? {},
    }));
    start(async () => {
      const r = await createPost({
        caption,
        hashtags,
        link,
        mediaAssetIds: mediaIds,
        destinationCountry: country,
        campaignId: campaignId || null,
        intake,
        targets,
        mode,
        scheduledAt: mode === "schedule" ? karachiLocalToUtcIso(scheduledAt) : null,
      });
      if (r?.error) setError(r.error);
      else router.push("/social/posts");
    });
  };

  const setOption = (accId: string, key: string, value: string) =>
    setOptions((o) => ({ ...o, [accId]: { ...o[accId], [key]: value } }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
      {/* ---- left: the post ---- */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Caption</label>
          <textarea className={textareaClass} rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write your post…" data-caption />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Hashtags
            <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#studyabroad #hmark" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Link (optional)
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Media</label>
          {media.length === 0 ? (
            <p className="text-xs text-muted">No media yet — add some in the Media Library.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" data-media-picker>
              {media.map((m) => {
                const on = mediaIds.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    data-media-option={m.id}
                    onClick={() => toggle(mediaIds, setMediaIds, m.id)}
                    className={`relative aspect-square overflow-hidden rounded-md border-2 ${on ? "border-primary" : "border-border"}`}
                  >
                    {m.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
                      <img src={m.publicUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video src={m.publicUrl} className="h-full w-full object-cover" muted preload="metadata" />
                    )}
                    {on && <span className="absolute right-0.5 top-0.5 rounded-full bg-primary px-1 text-[10px] text-primary-ink">{mediaIds.indexOf(m.id) + 1}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Destination country
            <Input list="social-countries" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Germany" />
            <datalist id="social-countries">{countries.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Campaign
            <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">None</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Intake
            <Input value={intake} onChange={(e) => setIntake(e.target.value)} placeholder="e.g. April 2027" />
          </label>
        </div>
      </div>

      {/* ---- right: targets, previews, validation, actions ---- */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-xs font-medium text-muted">Post to</p>
          <div className="flex flex-col gap-1" data-targets>
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={targetIds.includes(a.id)} onChange={() => toggle(targetIds, setTargetIds, a.id)} data-target={a.id} />
                <span className="font-medium">{PLATFORM_LABELS[a.platform]}</span>
                <span className="truncate text-xs text-muted">{a.displayName}</span>
              </label>
            ))}
          </div>
        </div>

        {perAccount.map(({ acc, cap, errs, max }) => (
          <div key={acc.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3" data-preview={acc.id}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">{PLATFORM_LABELS[acc.platform]}</span>
              <span className={`text-[11px] ${max != null && cap.length > max ? "text-danger" : "text-muted"}`}>
                {cap.length}{max != null ? ` / ${max}` : ""}
              </span>
            </div>

            {acc.platform === "instagram" && (
              <Select value={options[acc.id]?.igType ?? ""} onChange={(e) => setOption(acc.id, "igType", e.target.value)} className="text-sm">
                <option value="">Post type…</option>
                {INSTAGRAM_POST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
            {acc.platform === "tiktok" && (
              <Select value={options[acc.id]?.privacy ?? ""} onChange={(e) => setOption(acc.id, "privacy", e.target.value)} className="text-sm">
                <option value="">Privacy level…</option>
                {TIKTOK_PRIVACY_LEVELS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            )}
            {acc.platform === "snapchat" && (
              <Select value={options[acc.id]?.destination ?? ""} onChange={(e) => setOption(acc.id, "destination", e.target.value)} className="text-sm">
                <option value="">Destination…</option>
                {SNAPCHAT_DESTINATIONS.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </Select>
            )}

            <textarea
              className={textareaClass}
              rows={2}
              value={overrides[acc.id] ?? ""}
              onChange={(e) => setOverrides((o) => ({ ...o, [acc.id]: e.target.value }))}
              placeholder="Override caption for this platform (optional)"
              data-override={acc.id}
            />

            {errs.length > 0 && (
              <ul className="flex flex-col gap-0.5" data-errors={acc.id}>
                {errs.map((e, i) => <li key={i} className="text-xs text-danger">• {e}</li>)}
              </ul>
            )}
          </div>
        ))}

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Schedule (Asia/Karachi)
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} data-schedule />
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" pending={pending} disabled={pending || anyErrors} onClick={() => submit("draft")}>
              Save draft
            </Button>
            <Button type="button" variant="primary" size="sm" pending={pending} disabled={pending || anyErrors || !scheduledAt} onClick={() => submit("schedule")}>
              Schedule
            </Button>
          </div>
          {anyErrors && <p className="text-xs text-muted">Fix the platform issues above to continue.</p>}
          {error && <p className="text-xs text-danger" data-submit-error>{error}</p>}
        </div>
      </div>
    </div>
  );
}

// Turns a link staff paste into an embed URL we build ourselves.
//
// Two reasons not to put a pasted URL straight into an iframe src. It usually
// is not an embeddable one — a YouTube watch link renders a refused frame, not
// a video — and an <iframe> pointing at an arbitrary address is a hole: whoever
// can edit the guide could frame anything at all inside the portal.
//
// So the host is checked against a short list, the video id is extracted, and
// the src is composed from a fixed template. Anything unrecognised is refused
// at save time rather than rendering a blank box for students.

export type VideoEmbed = { provider: "youtube" | "vimeo"; videoId: string; embedUrl: string };

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"];
const VIMEO_HOSTS = ["vimeo.com", "www.vimeo.com", "player.vimeo.com"];

/** Ids are the only part of the URL we keep, so they are matched strictly. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;

export function parseVideoUrl(raw: string): VideoEmbed | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // http would embed insecurely and browsers block it on an https page anyway.
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.includes(host)) {
    // youtu.be/ID, /watch?v=ID, /embed/ID, /shorts/ID, /live/ID
    const fromPath = url.pathname.split("/").filter(Boolean);
    const candidate =
      url.searchParams.get("v") ??
      (host.endsWith("youtu.be") ? fromPath[0] : null) ??
      (["embed", "shorts", "live", "v"].includes(fromPath[0]) ? fromPath[1] : null);

    if (!candidate || !YOUTUBE_ID.test(candidate)) return null;
    // youtube-nocookie: the portal embeds these for students, and there is no
    // reason for a tutorial to drop advertising cookies on them.
    return { provider: "youtube", videoId: candidate, embedUrl: `https://www.youtube-nocookie.com/embed/${candidate}` };
  }

  if (VIMEO_HOSTS.includes(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const candidate = segments.find((s) => VIMEO_ID.test(s));
    if (!candidate) return null;
    return { provider: "vimeo", videoId: candidate, embedUrl: `https://player.vimeo.com/video/${candidate}` };
  }

  return null;
}

/** Where to send someone who wants to watch it outside the portal. */
export function watchUrl(embed: Pick<VideoEmbed, "provider" | "videoId">): string {
  return embed.provider === "youtube"
    ? `https://www.youtube.com/watch?v=${embed.videoId}`
    : `https://vimeo.com/${embed.videoId}`;
}

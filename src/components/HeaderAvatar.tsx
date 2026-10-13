import { avatarUrlMap } from "@/lib/storageUrls";
import { AvatarInitials, HEADER_AVATAR_CLASS } from "@/components/AvatarInitials";

/**
 * The person's own photo in the top bar, beside their name — or their
 * initials when they have none.
 *
 * A server component handed to AppShell in a Suspense slot, so no page waits
 * for it: the initials show first and the photo replaces them once its URL is
 * signed. The URL comes from avatarUrls, signed once and reused, so it is the
 * same on every page and the browser keeps the photo it already has.
 */
export async function HeaderAvatar({ name, photoPath }: { name: string; photoPath: string | null | undefined }) {
  const url = photoPath ? (await avatarUrlMap([photoPath])).get(photoPath) : undefined;
  if (!url) return <AvatarInitials name={name} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, sized here; next/image would proxy it through the server for no gain
    <img
      src={url}
      alt=""
      width={48}
      height={48}
      decoding="async"
      data-header-avatar="photo"
      className={`border border-border object-cover ring-2 ring-[var(--brand-soft)] ${HEADER_AVATAR_CLASS}`}
    />
  );
}

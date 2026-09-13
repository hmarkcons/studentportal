"use client";

/** What a student already has against one country. */
export type DestinationWork = {
  destinationId: string;
  name: string;
  applications: number;
  agreements: number;
  signedAgreements: number;
};

/**
 * What changing a student's countries would leave behind.
 *
 * Removing a backup country is an ordinary thing to do — a student drops
 * Germany and carries on with Italy — but it is not a small one. The country
 * disappears from the registration while its applications, its agreement and
 * its documents all stay exactly where they were, now belonging to a country
 * the student is no longer registered for. Nothing said so.
 *
 * Demoting a country from primary to backup matters for a different reason: a
 * backup agreement is administrative fee only, with no consultancy fee, so the
 * same student's money is described differently afterwards.
 *
 * None of it is blocked. Staff asked to be able to drop a country, and they
 * can — this only makes sure nobody finds out afterwards.
 */
export function DestinationChangeWarning({
  work,
  originalPrimaryId,
  originalBackupIds,
  primaryId,
  backupIds,
}: {
  work: DestinationWork[];
  originalPrimaryId: string | null;
  originalBackupIds: string[];
  primaryId: string;
  backupIds: string[];
}) {
  const byId = new Map(work.map((w) => [w.destinationId, w]));
  const originally = [originalPrimaryId, ...originalBackupIds].filter((id): id is string => Boolean(id));
  const now = new Set([primaryId, ...backupIds].filter(Boolean));

  const dropped = originally.filter((id) => !now.has(id)).map((id) => byId.get(id)).filter((w): w is DestinationWork => Boolean(w));
  const withWork = dropped.filter((w) => w.applications > 0 || w.agreements > 0);

  // A country that was primary and is now a backup, or the other way round.
  const demoted =
    originalPrimaryId && originalPrimaryId !== primaryId && backupIds.includes(originalPrimaryId)
      ? byId.get(originalPrimaryId)
      : null;
  const promoted = primaryId && originalBackupIds.includes(primaryId) ? byId.get(primaryId) : null;

  if (withWork.length === 0 && !demoted && !promoted) return null;

  return (
    <div className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
      {withWork.length > 0 && (
        <p className="mb-1">
          <span className="font-semibold">
            Removing {withWork.map((w) => w.name).join(" and ")} will not remove{" "}
            {withWork.length === 1 ? "its" : "their"} work.
          </span>{" "}
          {withWork.map((w) => describe(w)).join("; ")} — {withWork.length === 1 ? "it stays" : "they stay"} on file and
          the country keeps its own tab under Applications. Delete{" "}
          {withWork.length === 1 ? "the application" : "those applications"} first if that is what you mean to do.
        </p>
      )}
      {demoted && (
        <p className="mb-1">
          <span className="font-semibold">{demoted.name} becomes a backup.</span> A backup country&rsquo;s agreement
          carries the administrative fee only, with no consultancy fee
          {demoted.signedAgreements > 0 ? " — and this one already has a signed agreement." : "."}
        </p>
      )}
      {promoted && (
        <p>
          <span className="font-semibold">{promoted.name} becomes the primary country.</span> Its agreement is priced
          with the full consultancy fee rather than the administrative fee alone
          {promoted.signedAgreements > 0 ? " — and this one already has a signed agreement." : "."}
        </p>
      )}
    </div>
  );
}

function describe(w: DestinationWork): string {
  const parts: string[] = [];
  if (w.applications > 0) parts.push(`${w.applications} application${w.applications === 1 ? "" : "s"}`);
  if (w.signedAgreements > 0) {
    parts.push(`${w.signedAgreements} signed agreement${w.signedAgreements === 1 ? "" : "s"}`);
  } else if (w.agreements > 0) {
    parts.push(`${w.agreements} agreement${w.agreements === 1 ? "" : "s"}`);
  }
  return `${w.name} has ${parts.join(" and ")}`;
}

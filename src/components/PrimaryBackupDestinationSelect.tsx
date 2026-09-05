"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Input";

const MAX_BACKUPS = 3;

// Replaces the old unlimited checkbox multi-select for the registration
// screens: staff pick exactly one primary destination, then optionally add
// up to 3 backup destinations from a dropdown that only ever offers
// countries not already picked (primary or backup). The primary posts as a
// single `destination_id`/`destination_name` pair; backups post as repeated
// `backup_destination_ids`/`backup_destination_names` hidden inputs, mirroring
// the repeated-hidden-input convention DestinationMultiSelect already used.
export function PrimaryBackupDestinationSelect({
  destinations,
  defaultPrimaryId = null,
  defaultBackupIds = [],
}: {
  destinations: { id: string; display_name: string }[];
  defaultPrimaryId?: string | null;
  defaultBackupIds?: string[];
}) {
  const [primaryId, setPrimaryId] = useState(defaultPrimaryId ?? "");
  const [backupIds, setBackupIds] = useState<string[]>(
    defaultBackupIds.filter((id) => id !== defaultPrimaryId).slice(0, MAX_BACKUPS)
  );

  const nameById = new Map(destinations.map((d) => [d.id, d.display_name]));

  function setPrimary(id: string) {
    setPrimaryId(id);
    setBackupIds((prev) => prev.filter((b) => b !== id));
  }

  function addBackup(id: string) {
    if (!id || id === primaryId || backupIds.includes(id) || backupIds.length >= MAX_BACKUPS) return;
    setBackupIds((prev) => [...prev, id]);
  }

  function removeBackup(id: string) {
    setBackupIds((prev) => prev.filter((b) => b !== id));
  }

  const availableForBackup = destinations.filter((d) => d.id !== primaryId && !backupIds.includes(d.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Select value={primaryId} onChange={(e) => setPrimary(e.target.value)}>
          <option value="">— Select country —</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </Select>
        {primaryId && <input type="hidden" name="destination_id" value={primaryId} />}
        {primaryId && <input type="hidden" name="destination_name" value={nameById.get(primaryId) ?? ""} />}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">Backup countries (up to {MAX_BACKUPS})</label>
        {backupIds.length > 0 && (
          <ul className="flex flex-col gap-1">
            {backupIds.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-sm text-ink">
                <span>{nameById.get(id) ?? id}</span>
                <button type="button" onClick={() => removeBackup(id)} className="text-xs text-danger hover:underline">
                  Remove
                </button>
                <input type="hidden" name="backup_destination_ids" value={id} />
                <input type="hidden" name="backup_destination_names" value={nameById.get(id) ?? ""} />
              </li>
            ))}
          </ul>
        )}
        {backupIds.length < MAX_BACKUPS ? (
          <Select value="" onChange={(e) => addBackup(e.target.value)} disabled={availableForBackup.length === 0}>
            <option value="">+ Add backup country…</option>
            {availableForBackup.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-xs text-muted">Maximum of {MAX_BACKUPS} backup countries reached.</p>
        )}
      </div>
    </div>
  );
}

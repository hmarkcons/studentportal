// Field definitions now live in the `tracker_definitions` table (see
// supabase/migrations/0051_tracker_definitions.sql) and are editable by a
// super_admin under Setup > Document trackers — this file only carries the
// shared TypeScript shape used by the tracker action/component/pages.

export type TrackerFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "multi_text"
  | "boolean"
  | "credential"
  | "multi_university_status";

export const TRACKER_FIELD_TYPES: TrackerFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "multi_select",
  "multi_text",
  "boolean",
  "credential",
  "multi_university_status",
];

export type TrackerFieldDef = {
  id?: string;
  key: string;
  label: string;
  type: TrackerFieldType;
  options?: string[];
  credentialType?: string; // for type: 'credential'
  // Only rendered once the referenced sibling field currently holds `equals`.
  // `equals: "*"` means "any non-empty value" (used to gate a field on
  // another field simply having been filled in, not a specific choice).
  showWhen?: { key: string; equals: string };
  // For type: 'multi_university_status' — which status value reveals a
  // per-row date input (e.g. "Booked" for a credibility interview).
  dateWhenStatus?: string;
  sortOrder?: number;
};

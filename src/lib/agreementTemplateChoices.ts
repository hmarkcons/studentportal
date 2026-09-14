// Which agreement templates a given student may have one generated from.
//
// The dropdown used to offer every template in the system — twenty-six of
// them, including other countries and every test template anybody had ever
// made — so an agreement for the wrong country was one mis-click away, and
// twenty-one of the thirty-seven agreements on file are for a country their
// student is not registered for.
//
// A student's countries are their primary plus up to three backups, and both
// count: a backup country gets an administrative-fee-only agreement, which is
// a deliberate part of the registration flow. Anything else is not theirs.

export type TemplateLike = {
  id: string;
  name: string;
  destination: { id: string; display_name: string } | { id: string; display_name: string }[] | null;
};

export type RegisteredDestination = { id: string; display_name: string; isBackup: boolean };

/** PostgREST hands an embedded row back as an object or a single-element array. */
export function templateDestination(d: TemplateLike["destination"]) {
  return (Array.isArray(d) ? d[0] : d) ?? null;
}

export type TemplateChoices<T extends TemplateLike = TemplateLike> = {
  /** The templates this student may use, primary country first. */
  available: T[];
  /** Countries they are registered for that nobody has written a template for. */
  missingTemplateFor: string[];
  /** False when the student has no country on their registration at all. */
  hasCountry: boolean;
};

/**
 * Narrows the template list to this student's own countries.
 *
 * Ordered primary first, then backups, because that is the order the agreement
 * is normally raised in and the order the registration card shows them.
 *
 * Says separately when a country they ARE registered for has no template
 * written: an empty dropdown and a dropdown missing one country are different
 * problems with different fixes, and neither is the staff member's fault.
 */
// Generic so a caller's richer template row — with its signatory name and
// whatever else that screen needs — comes back out intact rather than
// narrowed to the shape this file happens to care about.
export function agreementTemplateChoices<T extends TemplateLike>(
  templates: T[],
  registered: RegisteredDestination[]
): TemplateChoices<T> {
  const ordered = [...registered.filter((r) => !r.isBackup), ...registered.filter((r) => r.isBackup)];

  // Built by walking the student's countries rather than filtering the
  // templates, so the result comes out in their order — primary first — and a
  // template with no destination at all is simply never matched.
  const available = ordered.flatMap((dest) =>
    templates.filter((t) => templateDestination(t.destination)?.id === dest.id)
  );

  const withTemplate = new Set(
    templates.map((t) => templateDestination(t.destination)?.id).filter((id): id is string => Boolean(id))
  );
  const missingTemplateFor = ordered.filter((r) => !withTemplate.has(r.id)).map((r) => r.display_name);

  return { available, missingTemplateFor, hasCountry: ordered.length > 0 };
}

/**
 * Why this template cannot be used for this student, or null.
 *
 * The same rule, applied on the server. Filtering the dropdown is a courtesy —
 * the form can always be resubmitted with another template's id, and an
 * agreement naming the wrong country is a signed legal document naming the
 * wrong country.
 */
export function templateNotForStudentError(
  templateDestinationId: string | null | undefined,
  registeredDestinationIds: string[]
): string | null {
  if (!templateDestinationId) {
    return "That template has no country set, so it cannot be used for a student. Set its destination in Setup › Agreement templates.";
  }
  if (registeredDestinationIds.length === 0) {
    return "This student has no country on their registration yet. Add one in the Registration card before generating an agreement.";
  }
  if (!registeredDestinationIds.includes(templateDestinationId)) {
    return "That template is for a country this student is not registered for. Add the country to their registration first, or pick one of their own.";
  }
  return null;
}

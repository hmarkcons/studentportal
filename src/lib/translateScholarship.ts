import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { RESEARCH_MODEL } from "@/lib/scholarshipResearch";
import { needsTranslation, translatablePayload, applyTranslation } from "@/lib/translatable";

const SYSTEM = `You translate scholarship information into English for a Pakistani education consultancy.

You are given a JSON object of fields taken from one scholarship body's record. Some may be in Italian, Spanish, French, German, Hungarian, Romanian, Swedish or Finnish. Some are already English.

Return a JSON object with EXACTLY the same keys and the same structure. For each value:

- If it is already English, return it unchanged, character for character.
- If it is not English, translate it into clear British English.
- Keep proper nouns as they are: the names of bodies, universities, cities and regions are not translated. "DSU Toscana" stays "DSU Toscana". "Universitat de Barcelona" stays as it is.
- Keep every number, date, currency amount, percentage and URL exactly as given. Do not convert currencies, reformat dates, or round figures.
- Keep line breaks where they are. These are read as lists.
- guide_sections is an array of {title, body}. Return the same number of entries in the same order.

Never add information, never explain, never summarise, never shorten. If you are unsure whether something is a name, leave it alone.

Return only the JSON object.`;

/**
 * Puts a scholarship record into English, leaving anything already English
 * exactly as it was.
 *
 * Called on every write to a scholarship body, so it has two jobs beyond
 * translating: cost nothing when there is nothing to do, and never make
 * things worse. It asks the model only when the text actually looks
 * non-English, and every value it gets back is checked before it replaces
 * anything — a translation step that can drop a deadline because the model
 * answered oddly is worse than no translation at all.
 *
 * Returns the original values on any failure. A save must never fail because
 * a translation did.
 */
export async function translateScholarshipValues(values: Record<string, unknown>): Promise<{
  values: Record<string, unknown>;
  changed: string[];
  /** What it looked like before, worth keeping so nothing is lost. */
  original: Record<string, unknown> | null;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { values, changed: [], original: null };
  if (!needsTranslation(values)) return { values, changed: [], original: null };

  const payload = translatablePayload(values);
  if (Object.keys(payload).length === 0) return { values, changed: [], original: null };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    // The model is asked for bare JSON but sometimes fences it.
    const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(json) as Record<string, unknown>;

    const { values: merged, changed } = applyTranslation(values, parsed);
    if (changed.length === 0) return { values, changed: [], original: null };

    // Only the fields that actually moved, so the record of what it said
    // before is small and readable rather than a copy of the whole row.
    const original: Record<string, unknown> = {};
    for (const field of changed) original[field] = values[field];

    return { values: merged, changed, original };
  } catch {
    // A bad key, no credit, a malformed answer, the API being down. None of
    // those is a reason to refuse somebody's edit.
    return { values, changed: [], original: null };
  }
}

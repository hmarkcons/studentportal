// The colours an item can be drawn in. Each is spelled out in full so Tailwind
// finds every class in the source; composing them ("bg-" + key) would build
// class names no stylesheet contains.
//
// `brand` is the portal's own green, from the theme tokens, so it follows the
// light and dark themes; the rest are fixed hues that read on both.

export type EventColor = {
  key: string;
  label: string;
  /** A filled block or bar, with text that reads on it. */
  solid: string;
  /** The small dot of a timed chip in the month grid. */
  dot: string;
  /** The tick of a My calendars checkbox. */
  accent: string;
  /** A swatch in the colour picker. */
  swatch: string;
};

export const EVENT_COLORS: readonly EventColor[] = [
  { key: "brand", label: "HMARK green", solid: "bg-primary text-primary-ink", dot: "bg-primary", accent: "accent-primary", swatch: "bg-primary" },
  { key: "red", label: "Tomato", solid: "bg-red-500 text-white", dot: "bg-red-500", accent: "accent-red-500", swatch: "bg-red-500" },
  { key: "orange", label: "Tangerine", solid: "bg-orange-500 text-white", dot: "bg-orange-500", accent: "accent-orange-500", swatch: "bg-orange-500" },
  { key: "yellow", label: "Banana", solid: "bg-amber-400 text-amber-950", dot: "bg-amber-400", accent: "accent-amber-400", swatch: "bg-amber-400" },
  { key: "green", label: "Basil", solid: "bg-green-600 text-white", dot: "bg-green-600", accent: "accent-green-600", swatch: "bg-green-600" },
  { key: "teal", label: "Peacock", solid: "bg-teal-600 text-white", dot: "bg-teal-600", accent: "accent-teal-600", swatch: "bg-teal-600" },
  { key: "blue", label: "Blueberry", solid: "bg-blue-600 text-white", dot: "bg-blue-600", accent: "accent-blue-600", swatch: "bg-blue-600" },
  { key: "purple", label: "Grape", solid: "bg-violet-600 text-white", dot: "bg-violet-600", accent: "accent-violet-600", swatch: "bg-violet-600" },
  { key: "pink", label: "Flamingo", solid: "bg-pink-500 text-white", dot: "bg-pink-500", accent: "accent-pink-500", swatch: "bg-pink-500" },
  { key: "gray", label: "Graphite", solid: "bg-slate-500 text-white", dot: "bg-slate-500", accent: "accent-slate-500", swatch: "bg-slate-500" },
];

const BY_KEY = new Map(EVENT_COLORS.map((c) => [c.key, c]));

export function eventColor(key: string | null | undefined, fallback = "gray"): EventColor {
  return BY_KEY.get(key ?? "") ?? BY_KEY.get(fallback) ?? EVENT_COLORS[0];
}

/** The colours offered to choose from; the brand green is a kind's default, not a choice. */
export const PICKABLE_COLORS = EVENT_COLORS.filter((c) => c.key !== "brand");

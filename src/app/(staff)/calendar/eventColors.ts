export const EVENT_COLORS = [
  { key: "red", label: "Red", dot: "bg-red-500", swatch: "bg-red-500" },
  { key: "orange", label: "Orange", dot: "bg-orange-500", swatch: "bg-orange-500" },
  { key: "yellow", label: "Yellow", dot: "bg-yellow-400", swatch: "bg-yellow-400" },
  { key: "green", label: "Green", dot: "bg-green-500", swatch: "bg-green-500" },
  { key: "teal", label: "Teal", dot: "bg-teal-500", swatch: "bg-teal-500" },
  { key: "blue", label: "Blue", dot: "bg-blue-500", swatch: "bg-blue-500" },
  { key: "purple", label: "Purple", dot: "bg-purple-500", swatch: "bg-purple-500" },
  { key: "pink", label: "Pink", dot: "bg-pink-500", swatch: "bg-pink-500" },
  { key: "gray", label: "Gray", dot: "bg-gray-400", swatch: "bg-gray-400" },
] as const;

export type EventColorKey = (typeof EVENT_COLORS)[number]["key"];

export function colorDotClass(color: string | null | undefined): string | null {
  return EVENT_COLORS.find((c) => c.key === color)?.dot ?? null;
}

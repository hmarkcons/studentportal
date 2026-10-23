import { test } from "node:test";
import assert from "node:assert/strict";
import { karachiParts, karachiYmd, karachiLocalToUtcIso, moveToKarachiDay } from "../src/lib/social/time.ts";

test("UTC maps to the Karachi wall-clock (UTC+5)", () => {
  // 20:00 UTC is 01:00 the next day in Karachi.
  assert.deepEqual(karachiParts("2026-01-01T20:00:00.000Z"), { y: 2026, m: 0, d: 2, hh: 1, mm: 0 });
  assert.equal(karachiYmd("2026-01-01T20:00:00.000Z"), "2026-01-02");
  assert.equal(karachiYmd("2026-01-01T18:59:00.000Z"), "2026-01-01");
});

test("a datetime-local (Karachi) converts to the right UTC instant", () => {
  assert.equal(karachiLocalToUtcIso("2026-01-02T01:00"), "2026-01-01T20:00:00.000Z");
  assert.equal(karachiLocalToUtcIso("2026-06-15T09:30"), "2026-06-15T04:30:00.000Z");
  assert.equal(karachiLocalToUtcIso(""), null);
});

test("moving to another Karachi day keeps the time-of-day", () => {
  // 2026-01-01T20:00Z = Karachi 2026-01-02 01:00. Move to Karachi 2026-02-10,
  // keep 01:00 → UTC 2026-02-09T20:00Z.
  const moved = moveToKarachiDay("2026-01-01T20:00:00.000Z", "2026-02-10");
  assert.equal(moved, "2026-02-09T20:00:00.000Z");
  assert.equal(karachiYmd(moved), "2026-02-10");
});

test("round-trips", () => {
  const iso = "2026-03-20T11:45:00.000Z";
  const p = karachiParts(iso);
  assert.equal(karachiToUtcIsoCheck(p, iso), true);
});

function karachiToUtcIsoCheck(p, iso) {
  return karachiLocalToUtcIso(`${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}T${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`) === iso;
}

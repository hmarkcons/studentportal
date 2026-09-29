// The daily calendar email's recipients and times (src/lib/calendarReminders.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReminderRecipients, reminderTime } from "../src/lib/calendarReminders.ts";

test("the email gives a time, and the end too once an item has one (0295)", () => {
  assert.equal(reminderTime(false, "18:00:00"), "18:00");
  assert.equal(reminderTime(false, "18:00:00", "19:30:00"), "18:00–19:30");
  assert.equal(reminderTime(false, "18:00:00", "17:00:00"), "18:00", "an end before the start is not printed");
  assert.equal(reminderTime(true, "18:00:00", "19:00:00"), null);
  assert.equal(reminderTime(false, null, "19:00"), null);
});

test("a personal item reaches its owner and guests with its time range", () => {
  const recipients = buildReminderRecipients(
    [],
    [
      {
        id: "p1",
        title: "Mock interview",
        description: null,
        due_date: "2026-09-22",
        due_time: "18:00:00",
        end_time: "19:00:00",
        all_day: false,
        priority: "medium",
        color: null,
        guest_emails: ["guest@example.com"],
        owner_id: "s1",
      },
    ],
    new Map([["s1", "Abdul"]]),
    new Map([["s1", "Abdul@Example.com"]]),
    "2026-09-22"
  );
  assert.deepEqual([...recipients.keys()].sort(), ["abdul@example.com", "guest@example.com"]);
  assert.equal(recipients.get("abdul@example.com").items[0].time, "18:00–19:00");
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCalendarSourceSchedule,
  isScheduledCalendarSourceDue,
  type ScheduledCalendarSourceRow,
} from "./scheduled-sync";

function createSource(overrides: Partial<ScheduledCalendarSourceRow> = {}): ScheduledCalendarSourceRow {
  return {
    id: "source-row-id",
    household_id: "household-id",
    external_key: "sportsengine-calendar",
    label: "SportsEngine",
    url: "https://calendar.example.com/feed.ics",
    enabled: true,
    sync_mode: "scheduled",
    last_synced_at: null,
    last_applied_at: null,
    last_sync_status: null,
    last_sync_message: null,
    metadata: {
      defaultMemberIds: ["mason"],
      scheduledSync: {
        time: "05:00",
      },
    },
    households: {
      timezone: "America/Chicago",
    },
    ...overrides,
  };
}

describe("scheduled calendar sync", () => {
  it("reads valid schedule metadata", () => {
    assert.deepEqual(
      getCalendarSourceSchedule({
        lastAttemptedOn: "2026-06-03",
        time: "05:30",
      }),
      {
        lastAttemptedOn: "2026-06-03",
        time: "05:30",
      },
    );
  });

  it("ignores invalid schedule metadata", () => {
    assert.equal(
      getCalendarSourceSchedule({
        time: "5:30",
      }),
      undefined,
    );
  });

  it("runs when the scheduled time has passed in the household timezone", () => {
    const source = createSource();

    assert.equal(isScheduledCalendarSourceDue(source, new Date("2026-06-03T11:15:00Z")), true);
  });

  it("waits until the scheduled time in the household timezone", () => {
    const source = createSource();

    assert.equal(isScheduledCalendarSourceDue(source, new Date("2026-06-03T09:15:00Z")), false);
  });

  it("does not rerun automatically after already attempting today", () => {
    const source = createSource({
      metadata: {
        defaultMemberIds: ["mason"],
        scheduledSync: {
          lastAttemptedOn: "2026-06-03",
          time: "05:00",
        },
      },
    });

    assert.equal(isScheduledCalendarSourceDue(source, new Date("2026-06-03T15:15:00Z")), false);
  });
});

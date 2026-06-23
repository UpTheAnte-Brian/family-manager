import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMinutesToTime,
  formatDurationMinutes,
  getDurationMinutes,
  resolveMemberWakeUpTime,
  resolveRoutineTiming,
} from "@/lib/routines/schedule";

describe("routine schedule helpers", () => {
  it("resolves weekday and weekend wake-up times independently", () => {
    assert.equal(
      resolveMemberWakeUpTime(
        {
          weekdayWakeUpTime: "07:15",
          weekendWakeUpTime: "08:00",
        },
        "MO",
      ),
      "07:15",
    );
    assert.equal(
      resolveMemberWakeUpTime(
        {
          weekdayWakeUpTime: "07:15",
          weekendWakeUpTime: "08:00",
        },
        "SU",
      ),
      "08:00",
    );
  });

  it("derives routine times from wake-up plus offset", () => {
    assert.deepEqual(
      resolveRoutineTiming({
        dayOfWeek: "TU",
        member: {
          weekdayWakeUpTime: "07:30",
          weekendWakeUpTime: "08:30",
        },
        schedule: {
          durationMinutes: 20,
          offsetMinutes: 15,
        },
      }),
      {
        durationMinutes: 20,
        endTime: "08:05",
        isWakeUpDerived: true,
        offsetMinutes: 15,
        startTime: "07:45",
      },
    );
  });

  it("falls back to stored clock ranges when present", () => {
    assert.deepEqual(
      resolveRoutineTiming({
        dayOfWeek: "SA",
        member: {
          weekdayWakeUpTime: "07:30",
          weekendWakeUpTime: "08:30",
        },
        schedule: {
          endTime: "19:40",
          startTime: "19:30",
        },
      }),
      {
        durationMinutes: 10,
        endTime: "19:40",
        isWakeUpDerived: false,
        offsetMinutes: null,
        startTime: "19:30",
      },
    );
  });

  it("keeps duration metadata even when no wake-up time is configured", () => {
    assert.deepEqual(
      resolveRoutineTiming({
        dayOfWeek: "WE",
        schedule: {
          durationMinutes: 5,
          offsetMinutes: 0,
        },
      }),
      {
        durationMinutes: 5,
        endTime: "",
        isWakeUpDerived: false,
        offsetMinutes: 0,
        startTime: "",
      },
    );
  });

  it("formats and computes routine durations", () => {
    assert.equal(getDurationMinutes("07:30", "07:45"), 15);
    assert.equal(addMinutesToTime("07:30", 15), "07:45");
    assert.equal(formatDurationMinutes(15), "15 min");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCalendarEventTeamKey,
  getCalendarTeamAssignment,
  inferSportsTeamLabel,
} from "./team-tags";

describe("calendar team tags", () => {
  it("collapses U9 Boys Select team-id and title inference into one team", () => {
    assert.equal(
      inferSportsTeamLabel({
        sourceId: "sportsengine-calendar",
        teamId: "11f0c4a9-5d31-45bc-9423-6ad70687d3d4",
        title: "Practice",
      }),
      "U9 Boys Select",
    );
    assert.equal(
      inferSportsTeamLabel({
        sourceId: "sportsengine-calendar",
        title: "U9 Boys Select 2 Practice",
      }),
      "U9 Boys Select",
    );
    assert.equal(
      getCalendarEventTeamKey({
        category: "sports",
        date: "2026-06-01",
        endTime: "18:00",
        sourceId: "sportsengine-calendar",
        startTime: "17:00",
        teamId: "11f0c4a9-5d31-45bc-9423-6ad70687d3d4",
        teamLabel: "U9 Boys Select",
        title: "Practice",
      }),
      "label:u9-boys-select",
    );
  });

  it("keeps old local U9 assignment keys working", () => {
    assert.deepEqual(
      getCalendarTeamAssignment(
        [
          {
            teamKey: "sportsengine:11f0c4a9-5d31-45bc-9423-6ad70687d3d4",
            teamLabel: "U9 Boys Select 2",
            assignedMemberIds: ["mason"],
          },
        ],
        "label:u9-boys-select",
      )?.assignedMemberIds,
      ["mason"],
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getEffectiveRemoteRoutineLoadState,
  getRemoteRoutineLoadContextKey,
} from "@/lib/routines/remote-load-state";

describe("getEffectiveRemoteRoutineLoadState", () => {
  it("keeps the loaded routine data when it matches the selected date", () => {
    assert.deepEqual(
      getEffectiveRemoteRoutineLoadState({
        completions: {
          "2026-06-24:mason:routine-1": true,
        },
        householdId: "household-1",
        isRemoteHouseholdReady: true,
        loadedContextKey: getRemoteRoutineLoadContextKey("household-1", "2026-06-24"),
        routines: [{ id: "mason:routine-1" }],
        selectedDate: "2026-06-24",
      }),
      {
        completions: {
          "2026-06-24:mason:routine-1": true,
        },
        isAuthoritative: true,
        routines: [{ id: "mason:routine-1" }],
      },
    );
  });

  it("drops stale routine data while a different selected date is loading", () => {
    assert.deepEqual(
      getEffectiveRemoteRoutineLoadState({
        completions: {
          "2026-06-24:mason:routine-1": true,
        },
        householdId: "household-1",
        isRemoteHouseholdReady: true,
        loadedContextKey: getRemoteRoutineLoadContextKey("household-1", "2026-06-24"),
        routines: [{ id: "mason:routine-1" }],
        selectedDate: "2026-06-25",
      }),
      {
        completions: {},
        isAuthoritative: false,
        routines: [],
      },
    );
  });

  it("drops remote data when the household connection is not ready", () => {
    assert.deepEqual(
      getEffectiveRemoteRoutineLoadState({
        completions: {
          "2026-06-24:mason:routine-1": true,
        },
        householdId: "household-1",
        isRemoteHouseholdReady: false,
        loadedContextKey: getRemoteRoutineLoadContextKey("household-1", "2026-06-24"),
        routines: [{ id: "mason:routine-1" }],
        selectedDate: "2026-06-24",
      }),
      {
        completions: {},
        isAuthoritative: false,
        routines: [],
      },
    );
  });
});

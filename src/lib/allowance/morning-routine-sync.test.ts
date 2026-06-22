import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planMorningRoutineSync } from "@/lib/allowance/morning-routine-sync";

describe("planMorningRoutineSync", () => {
  it("reconciles allowance on a new day without replaying the celebration", () => {
    assert.deepEqual(
      planMorningRoutineSync({
        contextKey: "2026-06-16:mason",
        isComplete: true,
        previousProgress: {
          contextKey: "2026-06-15:mason",
          isComplete: false,
        },
      }),
      {
        nextProgress: {
          contextKey: "2026-06-16:mason",
          isComplete: true,
        },
        shouldCelebrate: false,
        shouldCollapseCategory: true,
        shouldSyncAllowance: true,
        shouldAwardAllowance: true,
      },
    );
  });

  it("does not resync when the current day state has not changed", () => {
    assert.deepEqual(
      planMorningRoutineSync({
        contextKey: "2026-06-16:mason",
        isComplete: false,
        previousProgress: {
          contextKey: "2026-06-16:mason",
          isComplete: false,
        },
      }),
      {
        nextProgress: {
          contextKey: "2026-06-16:mason",
          isComplete: false,
        },
        shouldCelebrate: false,
        shouldCollapseCategory: false,
        shouldSyncAllowance: false,
        shouldAwardAllowance: false,
      },
    );
  });

  it("does not keep recollapsing an already-complete routine", () => {
    assert.deepEqual(
      planMorningRoutineSync({
        contextKey: "2026-06-16:mason",
        isComplete: true,
        previousProgress: {
          contextKey: "2026-06-16:mason",
          isComplete: true,
        },
      }),
      {
        nextProgress: {
          contextKey: "2026-06-16:mason",
          isComplete: true,
        },
        shouldCelebrate: false,
        shouldCollapseCategory: false,
        shouldSyncAllowance: false,
        shouldAwardAllowance: true,
      },
    );
  });

  it("celebrates only when the current day flips to complete", () => {
    assert.deepEqual(
      planMorningRoutineSync({
        contextKey: "2026-06-16:mason",
        isComplete: true,
        previousProgress: {
          contextKey: "2026-06-16:mason",
          isComplete: false,
        },
      }),
      {
        nextProgress: {
          contextKey: "2026-06-16:mason",
          isComplete: true,
        },
        shouldCelebrate: true,
        shouldCollapseCategory: true,
        shouldSyncAllowance: true,
        shouldAwardAllowance: true,
      },
    );
  });

  it("removes allowance when the current day becomes incomplete", () => {
    assert.deepEqual(
      planMorningRoutineSync({
        contextKey: "2026-06-16:mason",
        isComplete: false,
        previousProgress: {
          contextKey: "2026-06-16:mason",
          isComplete: true,
        },
      }),
      {
        nextProgress: {
          contextKey: "2026-06-16:mason",
          isComplete: false,
        },
        shouldCelebrate: false,
        shouldCollapseCategory: false,
        shouldSyncAllowance: true,
        shouldAwardAllowance: false,
      },
    );
  });
});

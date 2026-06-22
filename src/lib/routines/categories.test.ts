import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRoutineTemplateCategory } from "@/lib/routines/categories";

describe("resolveRoutineTemplateCategory", () => {
  it("keeps explicit night routines in the night bucket", () => {
    assert.equal(
      resolveRoutineTemplateCategory({
        category: "night-routine",
        templateName: "Morning routine",
      }),
      "night-routine",
    );
  });

  it("moves legacy templates with night naming into the night bucket", () => {
    assert.equal(
      resolveRoutineTemplateCategory({
        category: "morning-routine",
        templateName: "Night Time routine",
      }),
      "night-routine",
    );
  });

  it("treats evening times as night routines", () => {
    assert.equal(
      resolveRoutineTemplateCategory({
        startTime: "20:30",
        templateName: "Routine",
      }),
      "night-routine",
    );
  });

  it("defaults ordinary routines to the morning bucket", () => {
    assert.equal(
      resolveRoutineTemplateCategory({
        category: "morning-routine",
        startTime: "08:30",
        templateName: "School routine",
      }),
      "morning-routine",
    );
  });
});

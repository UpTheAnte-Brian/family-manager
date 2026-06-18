import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAllowanceEntryDraft, canRenameAllowanceEntry } from "@/lib/allowance/entries";
import type { AllowanceEntry } from "@/lib/planner/types";

describe("allowance entry helpers", () => {
  it("renames manual adjustment entries when edited", () => {
    const entry: AllowanceEntry = {
      amount: 1,
      childId: "mason",
      choreTitle: "Tutoring",
      id: "entry-1",
      label: "Tutoring",
      occurredAt: "2026-06-18T10:00:00",
      source: "manual-adjustment",
    };

    assert.equal(canRenameAllowanceEntry(entry), true);
    assert.deepEqual(applyAllowanceEntryDraft(entry, { amount: "2.50", note: "Updated", title: "Math help" }), {
      ...entry,
      amount: 2.5,
      choreTitle: "Math help",
      label: "Math help",
      note: "Updated",
    });
  });

  it("keeps the original title for chore credits", () => {
    const entry: AllowanceEntry = {
      amount: 0.5,
      childId: "mason",
      choreTitle: "Empty the Dishwasher",
      id: "entry-2",
      occurredAt: "2026-06-16T18:00:00",
      source: "chore-completion",
    };

    assert.equal(canRenameAllowanceEntry(entry), false);
    assert.deepEqual(applyAllowanceEntryDraft(entry, { amount: 0.75, note: "Bonus", title: "Ignored" }), {
      ...entry,
      amount: 0.75,
      note: "Bonus",
    });
  });
});

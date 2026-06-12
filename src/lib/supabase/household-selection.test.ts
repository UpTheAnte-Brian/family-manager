import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveActiveHouseholdId } from "@/lib/supabase/household-selection";

const households = [
  { householdId: "household-a" },
  { householdId: "household-b" },
];

describe("resolveActiveHouseholdId", () => {
  it("prefers a stored household selection when it is still valid", () => {
    const householdId = resolveActiveHouseholdId({
      households,
      preferredHouseholdId: "household-b",
      previousHouseholdId: "household-a",
    });

    assert.equal(householdId, "household-b");
  });

  it("falls back to the previous active household when the stored selection is invalid", () => {
    const householdId = resolveActiveHouseholdId({
      households,
      preferredHouseholdId: "missing-household",
      previousHouseholdId: "household-a",
    });

    assert.equal(householdId, "household-a");
  });

  it("falls back to the first accessible household when no prior selection is usable", () => {
    const householdId = resolveActiveHouseholdId({
      households,
      preferredHouseholdId: "missing-household",
      previousHouseholdId: "missing-household",
    });

    assert.equal(householdId, "household-a");
  });
});

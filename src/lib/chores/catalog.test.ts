import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChoreCatalogMatches,
  filterChoreCatalogMatches,
  getChoreCatalogAgeLabel,
  type ChoreCatalogEntry,
} from "@/lib/chores/catalog";
import type { WeeklyChore } from "@/lib/planner/types";

const catalogEntries: ChoreCatalogEntry[] = [
  {
    ageMin: 5,
    ageMax: 8,
    category: "house-reset",
    estimatedMinutes: 10,
    id: "organize-bedroom",
    title: "Organize bedroom",
  },
  {
    category: "kitchen",
    description: "Pantry and fridge items go into the correct places.",
    estimatedMinutes: 10,
    id: "put-away-groceries",
    title: "Put away groceries",
  },
  {
    category: "yard",
    estimatedMinutes: 15,
    id: "water-flowers",
    title: "Water plants or flowers",
  },
];

const householdChores: WeeklyChore[] = [
  {
    catalogChoreId: "organize-bedroom",
    category: "house-reset",
    eligibleAssigneeIds: ["mason", "reagan"],
    estimatedMinutes: 10,
    id: "remote-organize-bedroom",
    sourceKind: "catalog",
    title: "Organize bedroom",
  },
  {
    category: "yard",
    eligibleAssigneeIds: ["mason"],
    estimatedMinutes: 15,
    externalKey: "water-flowers",
    id: "remote-water-flowers",
    title: "Water plants or flowers",
  },
];

test("buildChoreCatalogMatches distinguishes imported, matched, and available items", () => {
  const result = buildChoreCatalogMatches(catalogEntries, householdChores);

  assert.deepEqual(
    result.map((entry) => ({
      householdChoreId: entry.householdChoreId,
      id: entry.catalog.id,
      importState: entry.importState,
    })),
    [
      {
        householdChoreId: "remote-organize-bedroom",
        id: "organize-bedroom",
        importState: "imported",
      },
      {
        householdChoreId: undefined,
        id: "put-away-groceries",
        importState: "available",
      },
      {
        householdChoreId: "remote-water-flowers",
        id: "water-flowers",
        importState: "matched",
      },
    ],
  );
});

test("filterChoreCatalogMatches filters by category and text query", () => {
  const result = filterChoreCatalogMatches(
    buildChoreCatalogMatches(catalogEntries, householdChores),
    {
      category: "kitchen",
      query: "pantry fridge",
    },
  );

  assert.deepEqual(result.map((entry) => entry.catalog.id), ["put-away-groceries"]);
});

test("getChoreCatalogAgeLabel renders age ranges clearly", () => {
  assert.equal(getChoreCatalogAgeLabel(5, 8), "Ages 5-8");
  assert.equal(getChoreCatalogAgeLabel(9), "Ages 9+");
  assert.equal(getChoreCatalogAgeLabel(undefined, 6), "Up to age 6");
  assert.equal(getChoreCatalogAgeLabel(), "");
});

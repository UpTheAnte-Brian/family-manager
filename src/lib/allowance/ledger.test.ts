import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAllowanceLedgerPage } from "@/lib/allowance/ledger";
import type { AllowanceEntry } from "@/lib/planner/types";

function createEntry(id: string): AllowanceEntry {
  return {
    amount: 0.25,
    childId: "mason",
    id,
    occurredAt: `2026-06-${id.padStart(2, "0")}T09:00:00`,
    source: "morning-routine-completion",
  };
}

describe("getAllowanceLedgerPage", () => {
  it("returns the first page with the configured page size", () => {
    const entries = Array.from({ length: 10 }, (_, index) => createEntry(String(index + 1)));

    assert.deepEqual(getAllowanceLedgerPage(entries, 1), {
      endIndex: 8,
      entries: entries.slice(0, 8),
      page: 1,
      startIndex: 0,
      totalPages: 2,
    });
  });

  it("clamps an out-of-range page to the last available page", () => {
    const entries = Array.from({ length: 10 }, (_, index) => createEntry(String(index + 1)));

    assert.deepEqual(getAllowanceLedgerPage(entries, 99), {
      endIndex: 10,
      entries: entries.slice(8, 10),
      page: 2,
      startIndex: 8,
      totalPages: 2,
    });
  });

  it("returns a stable empty page shape when no entries exist", () => {
    assert.deepEqual(getAllowanceLedgerPage([], 4), {
      endIndex: 0,
      entries: [],
      page: 1,
      startIndex: 0,
      totalPages: 1,
    });
  });
});

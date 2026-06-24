import type { AllowanceEntry } from "@/lib/planner/types";

export const allowanceLedgerPageSize = 8;

export function getAllowanceLedgerPage(
  entries: AllowanceEntry[],
  page: number,
  pageSize = allowanceLedgerPageSize,
) {
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const normalizedPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (normalizedPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, entries.length);

  return {
    endIndex,
    entries: entries.slice(startIndex, endIndex),
    page: normalizedPage,
    startIndex,
    totalPages,
  };
}

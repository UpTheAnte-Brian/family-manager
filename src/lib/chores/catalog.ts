import type { ChoreCategoryId } from "@/lib/chores/categories";
import type { WeeklyChore } from "@/lib/planner/types";

export type ChoreCatalogEntry = {
  id: string;
  title: string;
  category: ChoreCategoryId;
  estimatedMinutes: number;
  allowanceAmount?: number;
  definitionOfDone?: string;
  description?: string;
  moneyTalk?: string;
  requiresAdultCheck?: boolean;
  ageMin?: number;
  ageMax?: number;
};

export type ChoreCatalogMatch = {
  catalog: ChoreCatalogEntry;
  householdChoreId?: string;
  importState: "available" | "matched" | "imported";
};

export function buildChoreCatalogMatches(
  catalogEntries: ChoreCatalogEntry[],
  householdChores: WeeklyChore[],
) {
  const choresByCatalogId = new Map(
    householdChores
      .filter((chore) => Boolean(chore.catalogChoreId))
      .map((chore) => [chore.catalogChoreId!, chore.id]),
  );
  const choresByExternalKey = new Map(
    householdChores
      .filter((chore) => Boolean(chore.externalKey))
      .map((chore) => [chore.externalKey!, chore.id]),
  );

  return catalogEntries.map((catalog) => {
    const importedChoreId = choresByCatalogId.get(catalog.id);

    if (importedChoreId) {
      return {
        catalog,
        householdChoreId: importedChoreId,
        importState: "imported" as const,
      };
    }

    const matchedChoreId = choresByExternalKey.get(catalog.id);

    if (matchedChoreId) {
      return {
        catalog,
        householdChoreId: matchedChoreId,
        importState: "matched" as const,
      };
    }

    return {
      catalog,
      importState: "available" as const,
    };
  });
}

export function filterChoreCatalogMatches(
  matches: ChoreCatalogMatch[],
  {
    category,
    query,
  }: {
    category: ChoreCategoryId | "all";
    query: string;
  },
) {
  const normalizedQuery = normalizeCatalogQuery(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  return matches.filter((match) => {
    if (category !== "all" && match.catalog.category !== category) {
      return false;
    }

    if (queryTokens.length === 0) {
      return true;
    }

    const haystack = [
      match.catalog.title,
      match.catalog.description,
      match.catalog.definitionOfDone,
      match.catalog.moneyTalk,
      getChoreCatalogAgeLabel(match.catalog.ageMin, match.catalog.ageMax),
    ]
      .filter(Boolean)
      .map((value) => normalizeCatalogQuery(value!))
      .join(" ");

    return queryTokens.every((token) => haystack.includes(token));
  });
}

export function getChoreCatalogAgeLabel(ageMin?: number, ageMax?: number) {
  if (Number.isInteger(ageMin) && Number.isInteger(ageMax)) {
    return ageMin === ageMax ? `Age ${ageMin}` : `Ages ${ageMin}-${ageMax}`;
  }

  if (Number.isInteger(ageMin)) {
    return `Ages ${ageMin}+`;
  }

  if (Number.isInteger(ageMax)) {
    return `Up to age ${ageMax}`;
  }

  return "";
}

function normalizeCatalogQuery(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

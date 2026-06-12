"use client";

const householdSelectionEventName = "family-manager:household-selection";
const householdSelectionStorageKeyPrefix = "family-manager:selected-household:v1:";

type HouseholdLike = {
  householdId: string;
};

type ResolveActiveHouseholdIdInput<T extends HouseholdLike> = {
  households: T[];
  preferredHouseholdId?: string;
  previousHouseholdId?: string;
};

export function readStoredHouseholdSelection(authUserId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(getHouseholdSelectionStorageKey(authUserId)) ?? "";
}

export function writeStoredHouseholdSelection(authUserId: string, householdId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getHouseholdSelectionStorageKey(authUserId);
  const normalizedHouseholdId = householdId.trim();

  if (normalizedHouseholdId) {
    window.localStorage.setItem(storageKey, normalizedHouseholdId);
  } else {
    window.localStorage.removeItem(storageKey);
  }

  window.dispatchEvent(new Event(householdSelectionEventName));
}

export function clearStoredHouseholdSelection(authUserId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getHouseholdSelectionStorageKey(authUserId));
  window.dispatchEvent(new Event(householdSelectionEventName));
}

export function subscribeToHouseholdSelection(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(householdSelectionEventName, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(householdSelectionEventName, callback);
  };
}

export function resolveActiveHouseholdId<T extends HouseholdLike>({
  households,
  preferredHouseholdId,
  previousHouseholdId,
}: ResolveActiveHouseholdIdInput<T>) {
  if (households.length === 0) {
    return "";
  }

  if (preferredHouseholdId && households.some((household) => household.householdId === preferredHouseholdId)) {
    return preferredHouseholdId;
  }

  if (previousHouseholdId && households.some((household) => household.householdId === previousHouseholdId)) {
    return previousHouseholdId;
  }

  return households[0]?.householdId ?? "";
}

function getHouseholdSelectionStorageKey(authUserId: string) {
  return `${householdSelectionStorageKeyPrefix}${authUserId}`;
}

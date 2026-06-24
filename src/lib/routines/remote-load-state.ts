type RemoteRoutineLoadState<TItem> = {
  completions: Record<string, boolean>;
  isAuthoritative: boolean;
  routines: TItem[];
};

export function getRemoteRoutineLoadContextKey(householdId: string, date: string) {
  return `${householdId}:${date}`;
}

export function getEffectiveRemoteRoutineLoadState<TItem>({
  completions,
  householdId,
  isRemoteHouseholdReady,
  loadedContextKey,
  routines,
  selectedDate,
}: {
  completions: Record<string, boolean>;
  householdId?: string;
  isRemoteHouseholdReady: boolean;
  loadedContextKey: string;
  routines: TItem[];
  selectedDate: string;
}): RemoteRoutineLoadState<TItem> {
  if (!isRemoteHouseholdReady || !householdId) {
    return {
      completions: {},
      isAuthoritative: false,
      routines: [],
    };
  }

  const isAuthoritative =
    loadedContextKey === getRemoteRoutineLoadContextKey(householdId, selectedDate);

  return {
    completions: isAuthoritative ? completions : {},
    isAuthoritative,
    routines: isAuthoritative ? routines : [],
  };
}

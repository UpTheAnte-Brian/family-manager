export type MorningRoutineProgressState = {
  contextKey: string;
  isComplete: boolean;
};

export function planMorningRoutineSync({
  contextKey,
  isComplete,
  previousProgress,
}: {
  contextKey: string;
  isComplete: boolean;
  previousProgress: MorningRoutineProgressState;
}) {
  const contextChanged = previousProgress.contextKey !== contextKey;

  if (contextChanged) {
    return {
      nextProgress: {
        contextKey,
        isComplete,
      },
      shouldCelebrate: false,
      shouldCollapseCategory: isComplete,
      shouldSyncAllowance: true,
      shouldAwardAllowance: isComplete,
    };
  }

  if (previousProgress.isComplete === isComplete) {
    return {
      nextProgress: previousProgress,
      shouldCelebrate: false,
      shouldCollapseCategory: isComplete,
      shouldSyncAllowance: false,
      shouldAwardAllowance: isComplete,
    };
  }

  return {
    nextProgress: {
      contextKey,
      isComplete,
    },
    shouldCelebrate: isComplete,
    shouldCollapseCategory: isComplete,
    shouldSyncAllowance: true,
    shouldAwardAllowance: isComplete,
  };
}

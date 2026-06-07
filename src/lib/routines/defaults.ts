export type RoutineTemplateStepDefault = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
};

export const starterMorningRoutineTemplate = {
  name: "Morning routine",
  steps: [
    { id: "make-bed", title: "Make bed", startTime: "08:30", endTime: "08:40" },
    { id: "brush-teeth", title: "Brush teeth", startTime: "08:40", endTime: "08:45" },
    {
      id: "dirty-clothes",
      title: "Put dirty clothes in hamper",
      startTime: "08:45",
      endTime: "08:50",
    },
    {
      id: "breakfast-dishes",
      title: "Clear breakfast dishes",
      startTime: "08:50",
      endTime: "09:00",
    },
  ] satisfies RoutineTemplateStepDefault[],
};

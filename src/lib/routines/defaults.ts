export type RoutineTemplateStepDefault = {
  id: string;
  title: string;
  durationMinutes: number;
};

export const starterMorningRoutineTemplate = {
  name: "Morning routine",
  steps: [
    { id: "make-bed", title: "Make bed", durationMinutes: 10 },
    { id: "brush-teeth", title: "Brush teeth", durationMinutes: 5 },
    {
      id: "dirty-clothes",
      title: "Put dirty clothes in hamper",
      durationMinutes: 5,
    },
    {
      id: "breakfast-dishes",
      title: "Clear breakfast dishes",
      durationMinutes: 10,
    },
  ] satisfies RoutineTemplateStepDefault[],
};

export const choreCategories = [
  { id: "yard", label: "Yard", sortOrder: 10 },
  { id: "pets", label: "Pets", sortOrder: 20 },
  { id: "kitchen", label: "Kitchen", sortOrder: 30 },
  { id: "house-reset", label: "House reset", sortOrder: 40 },
  { id: "laundry", label: "Laundry", sortOrder: 50 },
  { id: "personal-hygiene", label: "Personal hygiene", sortOrder: 60 },
] as const;

export type ChoreCategoryId = (typeof choreCategories)[number]["id"];

export function getChoreCategoryLabel(categoryId: string) {
  return choreCategories.find((category) => category.id === categoryId)?.label ?? categoryId;
}

export function normalizeChoreCategory(categoryId: string | undefined): ChoreCategoryId {
  return choreCategories.some((category) => category.id === categoryId)
    ? (categoryId as ChoreCategoryId)
    : "house-reset";
}

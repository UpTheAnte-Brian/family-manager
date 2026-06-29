import type { TripPackingItemDraft } from "@/lib/trip-packing/types";

export function buildParkRapidsPackingList(dayCount: number): TripPackingItemDraft[] {
  const normalizedDayCount = normalizeTripDayCount(dayCount);

  return [
    createStarterItem("Socks", normalizedDayCount),
    createStarterItem("Underwear", normalizedDayCount),
    createStarterItem("Pajamas", normalizedDayCount),
    createStarterItem("Swimsuits", normalizedDayCount),
    createStarterItem("Day outfits", normalizedDayCount),
    createStarterItem("Sweatshirts", Math.max(2, Math.ceil(normalizedDayCount / 3))),
    createStarterItem("Pants", Math.max(1, Math.ceil(normalizedDayCount / 5))),
    createStarterItem("Rain jacket", 1),
    createStarterItem("Sneakers", 1),
    createStarterItem("Water shoes", 1),
    createStarterItem("Toiletry kit", 1),
    createStarterItem("Favorite stuffed animal", 1),
  ];
}

export function normalizeTripDayCount(dayCount: number) {
  if (!Number.isFinite(dayCount)) {
    return 1;
  }

  return Math.max(1, Math.floor(dayCount));
}

function createStarterItem(title: string, quantity: number): TripPackingItemDraft {
  return {
    id: createTripPackingDraftId(title),
    quantity,
    title,
  };
}

function createTripPackingDraftId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

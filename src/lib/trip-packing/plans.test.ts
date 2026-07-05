import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildParkRapidsPackingList } from "@/lib/trip-packing/defaults";
import {
  getTripDurationDays,
  getTripPackingProgress,
  getVisibleTripPackingPlans,
  groupTripPackingItems,
  mergeTripPackingItems,
} from "@/lib/trip-packing/plans";

describe("trip packing helpers", () => {
  it("builds the Park Rapids starter list from the trip length", () => {
    const items = buildParkRapidsPackingList(5);

    assert.deepEqual(
      items.slice(0, 7).map((item) => [item.title, item.quantity]),
      [
        ["Socks", 5],
        ["Underwear", 5],
        ["Pajamas", 5],
        ["Swimsuits", 5],
        ["Day outfits", 5],
        ["Sweatshirts", 2],
        ["Pants", 1],
      ],
    );
  });

  it("merges base items with member-specific items by title", () => {
    const merged = mergeTripPackingItems(
      [
        { id: "socks", quantity: 5, title: "Socks" },
        { id: "hoodie", quantity: 2, title: "Sweatshirts" },
      ],
      [
        { id: "extra-socks", quantity: 1, title: " socks " },
        { id: "baseball-hat", quantity: 1, title: "Baseball hat" },
      ],
    );

    assert.deepEqual(
      merged.map((item) => [item.title, item.quantity]),
      [
        ["Baseball hat", 1],
        ["Socks", 6],
        ["Sweatshirts", 2],
      ],
    );
  });

  it("groups stored action items back into plans and member views", () => {
    const plans = groupTripPackingItems([
      {
        actionItemId: "1",
        assigneeId: "mason",
        checklistStartsOn: "2026-07-01",
        createdAt: "2026-06-29T10:00:00.000Z",
        quantity: 5,
        showOnDashboard: true,
        sourceItemId: "socks",
        sourceKind: "base",
        title: "Socks",
        tripEndsOn: "2026-07-05",
        tripPlanId: "cabin-trip",
        tripStartsOn: "2026-07-01",
        tripName: "Cabin trip",
      },
      {
        actionItemId: "2",
        assigneeId: "nora",
        checklistStartsOn: "2026-07-01",
        createdAt: "2026-06-29T10:00:00.000Z",
        quantity: 5,
        showOnDashboard: true,
        sourceItemId: "socks",
        sourceKind: "base",
        title: "Socks",
        tripEndsOn: "2026-07-05",
        tripPlanId: "cabin-trip",
        tripStartsOn: "2026-07-01",
        tripName: "Cabin trip",
      },
      {
        actionItemId: "3",
        assigneeId: "mason",
        checklistStartsOn: "2026-07-01",
        completedAt: "2026-06-30T17:00:00.000Z",
        createdAt: "2026-06-29T10:00:00.000Z",
        quantity: 1,
        showOnDashboard: true,
        sourceItemId: "soccer-cleats",
        sourceKind: "member",
        title: "Soccer cleats",
        tripEndsOn: "2026-07-05",
        tripPlanId: "cabin-trip",
        tripStartsOn: "2026-07-01",
        tripName: "Cabin trip",
      },
    ]);

    assert.equal(plans.length, 1);
    assert.deepEqual(plans[0].memberIds, ["mason", "nora"]);
    assert.deepEqual(plans[0].baseItems.map((item) => item.title), ["Socks"]);
    assert.deepEqual(plans[0].memberItems.mason.map((item) => item.title), ["Soccer cleats"]);
    assert.equal(plans[0].showOnDashboard, true);

    assert.deepEqual(
      getTripPackingProgress(plans[0], "mason"),
      {
        completedCount: 1,
        totalCount: 2,
      },
    );

    assert.deepEqual(
      getVisibleTripPackingPlans(plans, "mason", "2026-07-02").map((plan) => plan.id),
      ["cabin-trip"],
    );
  });

  it("hides plans from the dashboard when the visibility flag is off", () => {
    const plans = groupTripPackingItems([
      {
        actionItemId: "1",
        assigneeId: "mason",
        checklistStartsOn: "2026-07-01",
        createdAt: "2026-06-29T10:00:00.000Z",
        quantity: 5,
        showOnDashboard: false,
        sourceItemId: "socks",
        sourceKind: "base",
        title: "Socks",
        tripEndsOn: "2026-07-05",
        tripPlanId: "cabin-trip",
        tripStartsOn: "2026-07-01",
        tripName: "Cabin trip",
      },
    ]);

    assert.deepEqual(getVisibleTripPackingPlans(plans, "mason", "2026-07-02"), []);
  });

  it("counts trip duration inclusively", () => {
    assert.equal(getTripDurationDays("2026-07-01", "2026-07-05"), 5);
    assert.equal(getTripDurationDays("2026-07-05", "2026-07-01"), 0);
  });
});

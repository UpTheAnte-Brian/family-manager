"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { buildParkRapidsPackingList } from "@/lib/trip-packing/defaults";
import {
  normalizeTripPackingQuantity,
  normalizeTripPackingTitle,
  getTripDurationDays,
  getTripPackingProgress,
} from "@/lib/trip-packing/plans";
import {
  deleteRemoteTripPackingPlan,
  loadRemoteTripPackingPlans,
  saveRemoteTripPackingPlan,
} from "@/lib/trip-packing/remote";
import type { TripPackingItemDraft, TripPackingPlan, TripPackingPlanInput } from "@/lib/trip-packing/types";
import type { HouseholdMember } from "@/lib/planner/types";
import { useCurrentHousehold } from "@/lib/supabase/household";

type AdminTripPackingProps = {
  members: HouseholdMember[];
};

type TripPackingEditorState = Omit<TripPackingPlanInput, "id">;

const defaultTripName = "Park Rapids cabin";

export function AdminTripPacking({ members }: AdminTripPackingProps) {
  const { household, status: householdStatus } = useCurrentHousehold();
  const [plans, setPlans] = useState<TripPackingPlan[]>([]);
  const [remoteMemberIdsByExternalKey, setRemoteMemberIdsByExternalKey] = useState<Record<string, string>>({});
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const childMembers = useMemo(() => members.filter((member) => member.role === "child"), [members]);
  const starterEditorState = useMemo(
    () => createStarterEditorState(childMembers),
    [childMembers],
  );
  const [editorState, setEditorState] = useState<TripPackingEditorState>(starterEditorState);
  const householdId = household?.householdId;
  const editingPlan = editingPlanId ? plans.find((plan) => plan.id === editingPlanId) : undefined;

  useEffect(() => {
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadTripPackingPlans() {
      try {
        const state = await loadRemoteTripPackingPlans(currentHouseholdId);

        if (!isActive) {
          return;
        }

        setPlans(state.plans);
        setRemoteMemberIdsByExternalKey(state.memberIdsByExternalKey);
        setErrorMessage("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Could not load trip packing plans.",
        );
      }
    }

    void loadTripPackingPlans();

    return () => {
      isActive = false;
    };
  }, [householdId, householdStatus, refreshVersion]);

  function createPlan() {
    setEditorMode("create");
    setEditingPlanId(null);
    setEditorState(createStarterEditorState(childMembers));
    setStatusMessage("");
    setErrorMessage("");
  }

  function editPlan(plan: TripPackingPlan) {
    setEditorMode("edit");
    setEditingPlanId(plan.id);
    setEditorState({
      baseItems: plan.baseItems.map(cloneTripPackingItem),
      checklistStartsOn: plan.checklistStartsOn,
      memberIds: [...plan.memberIds],
      memberItems: Object.fromEntries(
        Object.entries(plan.memberItems).map(([memberId, items]) => [
          memberId,
          items.map(cloneTripPackingItem),
        ]),
      ),
      showOnDashboard: plan.showOnDashboard,
      tripEndsOn: plan.tripEndsOn,
      tripName: plan.tripName,
      tripStartsOn: plan.tripStartsOn,
    });
    setStatusMessage("");
    setErrorMessage("");
  }

  function closeEditor() {
    setEditorMode(null);
    setEditingPlanId(null);
    setEditorState(createStarterEditorState(childMembers));
    setErrorMessage("");
  }

  function toggleMember(memberId: string) {
    setEditorState((current) => {
      const isSelected = current.memberIds.includes(memberId);
      const nextMemberIds = isSelected
        ? current.memberIds.filter((candidate) => candidate !== memberId)
        : [...current.memberIds, memberId];

      return {
        ...current,
        memberIds: nextMemberIds,
        memberItems: isSelected
          ? Object.fromEntries(
              Object.entries(current.memberItems).filter(([candidateId]) => candidateId !== memberId),
            )
          : current.memberItems,
      };
    });
  }

  function updateBaseItem(itemId: string, patch: Partial<TripPackingItemDraft>) {
    setEditorState((current) => ({
      ...current,
      baseItems: current.baseItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    }));
  }

  function removeBaseItem(itemId: string) {
    setEditorState((current) => ({
      ...current,
      baseItems: current.baseItems.filter((item) => item.id !== itemId),
    }));
  }

  function addBaseItem() {
    setEditorState((current) => ({
      ...current,
      baseItems: [...current.baseItems, createBlankTripPackingItem()],
    }));
  }

  function updateMemberItem(memberId: string, itemId: string, patch: Partial<TripPackingItemDraft>) {
    setEditorState((current) => ({
      ...current,
      memberItems: {
        ...current.memberItems,
        [memberId]: (current.memberItems[memberId] ?? []).map((item) =>
          item.id === itemId
            ? {
                ...item,
                ...patch,
              }
            : item,
        ),
      },
    }));
  }

  function removeMemberItem(memberId: string, itemId: string) {
    setEditorState((current) => ({
      ...current,
      memberItems: {
        ...current.memberItems,
        [memberId]: (current.memberItems[memberId] ?? []).filter((item) => item.id !== itemId),
      },
    }));
  }

  function addMemberItem(memberId: string) {
    setEditorState((current) => ({
      ...current,
      memberItems: {
        ...current.memberItems,
        [memberId]: [...(current.memberItems[memberId] ?? []), createBlankTripPackingItem()],
      },
    }));
  }

  function applyParkRapidsStarter() {
    const dayCount = getTripDurationDays(editorState.tripStartsOn, editorState.tripEndsOn) || 5;

    setEditorState((current) => ({
      ...current,
      baseItems: buildParkRapidsPackingList(dayCount),
    }));
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!householdId) {
      setErrorMessage("Create or select a household before saving a packing plan.");
      return;
    }

    const cleanedPlan = cleanEditorState(editorState);

    if (!cleanedPlan.tripName) {
      setErrorMessage("Add a trip name.");
      return;
    }

    if (!cleanedPlan.checklistStartsOn || !cleanedPlan.tripStartsOn || !cleanedPlan.tripEndsOn) {
      setErrorMessage("Choose when the checklist starts and when the trip runs.");
      return;
    }

    if (cleanedPlan.tripEndsOn < cleanedPlan.tripStartsOn) {
      setErrorMessage("Trip end must be on or after the trip start.");
      return;
    }

    if (cleanedPlan.memberIds.length === 0) {
      setErrorMessage("Choose at least one family member.");
      return;
    }

    if (cleanedPlan.baseItems.length === 0 && Object.values(cleanedPlan.memberItems).every((items) => items.length === 0)) {
      setErrorMessage("Add at least one packing item.");
      return;
    }

    const missingRemoteMember = cleanedPlan.memberIds.find(
      (memberId) => !remoteMemberIdsByExternalKey[memberId],
    );

    if (missingRemoteMember) {
      setErrorMessage("Save household members in setup before assigning trip packing lists.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      if (editingPlan) {
        await deleteRemoteTripPackingPlan({
          actionItemIds: editingPlan.actionItemIds,
          householdId,
        });
      }

      await saveRemoteTripPackingPlan({
        householdId,
        memberIdsByExternalKey: remoteMemberIdsByExternalKey,
        plan: {
          ...cleanedPlan,
          id: editingPlan?.id ?? createTripPackingPlanId(cleanedPlan.tripName, cleanedPlan.tripStartsOn),
        },
      });

      setStatusMessage(editingPlan ? `Updated ${cleanedPlan.tripName}.` : "Trip packing plan saved.");
      setEditorMode(null);
      setEditingPlanId(null);
      setEditorState(createStarterEditorState(childMembers));
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save the trip packing plan.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removePlan(plan: TripPackingPlan) {
    if (!householdId) {
      return;
    }

    setErrorMessage("");
    setStatusMessage("");

    try {
      await deleteRemoteTripPackingPlan({
        actionItemIds: plan.actionItemIds,
        householdId,
      });
      if (editingPlanId === plan.id) {
        closeEditor();
      }
      setStatusMessage(`Deleted ${plan.tripName}.`);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete the trip packing plan.",
      );
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#17202a]">Trip packing plans</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#4c5965]">
            Build one shared base list, add kid-specific extras, and let the checklist show up on each child&apos;s dashboard.
          </p>
        </div>
        <button
          className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white"
          onClick={createPlan}
          type="button"
        >
          Create trip plan
        </button>
      </div>

      {statusMessage ? (
        <p className="border border-[#b7d8c3] bg-[#f1faf3] px-3 py-2 text-sm text-[#2f6f73]">
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
        <section className="grid gap-3">
          {plans.length > 0 ? (
            plans.map((plan) => {
              const totalProgress = plan.memberIds.reduce(
                (summary, memberId) => {
                  const progress = getTripPackingProgress(plan, memberId);

                  return {
                    completedCount: summary.completedCount + progress.completedCount,
                    totalCount: summary.totalCount + progress.totalCount,
                  };
                },
                { completedCount: 0, totalCount: 0 },
              );

              return (
                <article
                  className="border border-[#d7e0e7] bg-[#f8fafc] px-4 py-4"
                  key={plan.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-[#17202a]">{plan.tripName}</h4>
                      <p className="mt-1 text-sm text-[#4c5965]">
                        Checklist starts {formatShortDate(plan.checklistStartsOn)} · Trip {formatShortDate(plan.tripStartsOn)}-{formatShortDate(plan.tripEndsOn)}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[#657381]">
                        {plan.memberIds.length} family member{plan.memberIds.length === 1 ? "" : "s"} · {totalProgress.completedCount}/{totalProgress.totalCount} packed
                      </p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                        {plan.showOnDashboard ? "Showing on dashboard" : "Hidden from dashboard"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="border border-[#d7e0e7] bg-white px-3 py-2 text-xs font-semibold text-[#1f6f8b]"
                        onClick={() => editPlan(plan)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="border border-[#d7e0e7] bg-white px-3 py-2 text-xs font-semibold text-[#8a2f2f]"
                        onClick={() => void removePlan(plan)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="border border-dashed border-[#cbd5df] bg-[#f8fafc] px-3 py-4 text-sm text-[#4c5965]">
              No trip packing plan saved yet.
            </p>
          )}
        </section>

        {editorMode ? (
          <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-[#17202a]">
                  {editorMode === "edit" ? "Edit trip plan" : "Create trip plan"}
                </h4>
                <p className="mt-1 text-sm text-[#4c5965]">
                  Keep the parent setup quick: save a shared base list, then add any child-specific items underneath.
                </p>
              </div>
              <button
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold"
                onClick={closeEditor}
                type="button"
              >
                Close
              </button>
            </div>

            <form className="grid gap-4" onSubmit={savePlan}>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_170px]">
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Trip name</span>
                  <input
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    onChange={(event) =>
                      setEditorState((current) => ({
                        ...current,
                        tripName: event.target.value,
                      }))
                    }
                    placeholder="Park Rapids cabin"
                    value={editorState.tripName}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Trip starts</span>
                  <input
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    onChange={(event) =>
                      setEditorState((current) => ({
                        ...current,
                        tripStartsOn: event.target.value,
                      }))
                    }
                    type="date"
                    value={editorState.tripStartsOn}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Trip ends</span>
                  <input
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    onChange={(event) =>
                      setEditorState((current) => ({
                        ...current,
                        tripEndsOn: event.target.value,
                      }))
                    }
                    type="date"
                    value={editorState.tripEndsOn}
                  />
                </label>
              </div>

              <div className="grid gap-3 lg:grid-cols-[170px_minmax(0,1fr)]">
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Show checklist on</span>
                  <input
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    onChange={(event) =>
                      setEditorState((current) => ({
                        ...current,
                        checklistStartsOn: event.target.value,
                      }))
                    }
                    type="date"
                    value={editorState.checklistStartsOn}
                  />
                </label>
                <div className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm text-[#4c5965]">
                  {getTripDurationDays(editorState.tripStartsOn, editorState.tripEndsOn) > 0 ? (
                    <>
                      {getTripDurationDays(editorState.tripStartsOn, editorState.tripEndsOn)} day trip. Use the starter to prefill counts like socks, jammies, swimsuits, and day clothes from the trip length.
                    </>
                  ) : (
                    <>Choose a valid trip window to size the starter list.</>
                  )}
                </div>
              </div>

              <label className="flex items-start gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm">
                <input
                  checked={editorState.showOnDashboard}
                  className="mt-1 h-4 w-4"
                  onChange={(event) =>
                    setEditorState((current) => ({
                      ...current,
                      showOnDashboard: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block font-semibold text-[#17202a]">Show on dashboard</span>
                  <span className="block text-[#4c5965]">
                    Turn this off once the trip is underway or finished so the packing card disappears from each child&apos;s dashboard.
                  </span>
                </span>
              </label>

              <fieldset className="grid gap-2 text-sm">
                <legend className="font-semibold">Who is packing?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {childMembers.map((member) => (
                    <label
                      className="flex items-center gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3"
                      key={member.id}
                    >
                      <input
                        checked={editorState.memberIds.includes(member.id)}
                        onChange={() => toggleMember(member.id)}
                        type="checkbox"
                      />
                      <span className="font-semibold text-[#17202a]">{member.preferredName}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <section className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h5 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                      Base list
                    </h5>
                    <p className="mt-1 text-sm text-[#4c5965]">
                      These items are copied to every selected child.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-xs font-semibold text-[#1f6f8b]"
                      onClick={applyParkRapidsStarter}
                      type="button"
                    >
                      Load Park Rapids starter
                    </button>
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-xs font-semibold text-[#1f6f8b]"
                      onClick={addBaseItem}
                      type="button"
                    >
                      Add base item
                    </button>
                  </div>
                </div>

                <div className="grid gap-2">
                  {editorState.baseItems.map((item) => (
                    <TripPackingItemRow
                      item={item}
                      key={item.id}
                      onRemove={() => removeBaseItem(item.id)}
                      onUpdate={(patch) => updateBaseItem(item.id, patch)}
                    />
                  ))}
                </div>
              </section>

              <section className="grid gap-3">
                <div>
                  <h5 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                    Personal add-ons
                  </h5>
                  <p className="mt-1 text-sm text-[#4c5965]">
                    Add anything only one child needs, like a special swimsuit, cleats, or a favorite stuffie.
                  </p>
                </div>

                <div className="grid gap-3">
                  {editorState.memberIds.map((memberId) => {
                    const member = members.find((candidate) => candidate.id === memberId);
                    const memberItems = editorState.memberItems[memberId] ?? [];

                    return (
                      <article
                        className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3"
                        key={memberId}
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <h6 className="text-sm font-semibold text-[#17202a]">
                            {member?.preferredName ?? "Family member"}
                          </h6>
                          <button
                            className="border border-[#d7e0e7] bg-white px-3 py-2 text-xs font-semibold text-[#1f6f8b]"
                            onClick={() => addMemberItem(memberId)}
                            type="button"
                          >
                            Add personal item
                          </button>
                        </div>

                        <div className="grid gap-2">
                          {memberItems.length > 0 ? (
                            memberItems.map((item) => (
                              <TripPackingItemRow
                                item={item}
                                key={item.id}
                                onRemove={() => removeMemberItem(memberId, item.id)}
                                onUpdate={(patch) => updateMemberItem(memberId, item.id, patch)}
                              />
                            ))
                          ) : (
                            <p className="border border-dashed border-[#cbd5df] bg-white px-3 py-3 text-sm text-[#657381]">
                              No personal items yet.
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  className="border border-[#d7e0e7] bg-white px-4 py-2 text-sm font-semibold"
                  onClick={closeEditor}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? "Saving..." : editorMode === "edit" ? "Save plan" : "Create plan"}
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function TripPackingItemRow({
  item,
  onRemove,
  onUpdate,
}: {
  item: TripPackingItemDraft;
  onRemove: () => void;
  onUpdate: (patch: Partial<TripPackingItemDraft>) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[96px_minmax(0,1fr)_auto]">
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Qty</span>
        <input
          className="border border-[#d7e0e7] bg-white px-3 py-2"
          min={1}
          onChange={(event) => onUpdate({ quantity: Number(event.target.value) })}
          type="number"
          value={item.quantity}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Item</span>
        <input
          className="border border-[#d7e0e7] bg-white px-3 py-2"
          onChange={(event) => onUpdate({ title: event.target.value })}
          placeholder="Socks, pajamas, swim shirts..."
          value={item.title}
        />
      </label>
      <button
        className="self-end border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#8a2f2f]"
        onClick={onRemove}
        type="button"
      >
        Remove
      </button>
    </div>
  );
}

function createStarterEditorState(childMembers: HouseholdMember[]): TripPackingEditorState {
  const today = new Date();
  const tripStartsOn = toDateInputValue(today);
  const tripEndsOn = toDateInputValue(new Date(today.getTime() + 4 * 86_400_000));
  const checklistStartsOn = toDateInputValue(new Date(today.getTime() - 86_400_000));
  const memberIds = childMembers.map((member) => member.id);

  return {
    baseItems: buildParkRapidsPackingList(5),
    checklistStartsOn,
    memberIds,
    memberItems: Object.fromEntries(memberIds.map((memberId) => [memberId, []])),
    showOnDashboard: true,
    tripEndsOn,
    tripName: defaultTripName,
    tripStartsOn,
  };
}

function cleanEditorState(state: TripPackingEditorState): TripPackingEditorState {
  const cleanedBaseItems = dedupeTripPackingItems(state.baseItems);
  const cleanedMemberItems = Object.fromEntries(
    Object.entries(state.memberItems)
      .filter(([memberId]) => state.memberIds.includes(memberId))
      .map(([memberId, items]) => [memberId, dedupeTripPackingItems(items)]),
  );

  return {
    ...state,
    baseItems: cleanedBaseItems,
    checklistStartsOn: state.checklistStartsOn,
    memberIds: [...new Set(state.memberIds)],
    memberItems: cleanedMemberItems,
    showOnDashboard: state.showOnDashboard,
    tripEndsOn: state.tripEndsOn,
    tripName: state.tripName.trim(),
    tripStartsOn: state.tripStartsOn,
  };
}

function dedupeTripPackingItems(items: TripPackingItemDraft[]) {
  const mergedItems = new Map<string, TripPackingItemDraft>();

  for (const item of items) {
    const title = item.title.trim();

    if (!title) {
      continue;
    }

    const key = normalizeTripPackingTitle(title);
    const existingItem = mergedItems.get(key);

    if (!existingItem) {
      mergedItems.set(key, {
        id: item.id || createTripPackingDraftId(title),
        quantity: normalizeTripPackingQuantity(item.quantity),
        title,
      });
      continue;
    }

    mergedItems.set(key, {
      ...existingItem,
      quantity:
        normalizeTripPackingQuantity(existingItem.quantity) +
        normalizeTripPackingQuantity(item.quantity),
    });
  }

  return [...mergedItems.values()];
}

function createBlankTripPackingItem(): TripPackingItemDraft {
  return {
    id: createTripPackingDraftId(`packing-item-${crypto.randomUUID()}`),
    quantity: 1,
    title: "",
  };
}

function cloneTripPackingItem(item: TripPackingItemDraft): TripPackingItemDraft {
  return {
    id: item.id,
    quantity: item.quantity,
    title: item.title,
  };
}

function createTripPackingPlanId(tripName: string, tripStartsOn: string) {
  return createTripPackingDraftId(`${tripName}-${tripStartsOn}-${crypto.randomUUID()}`);
}

function createTripPackingDraftId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

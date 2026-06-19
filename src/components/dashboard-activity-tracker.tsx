"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { formatCurrency } from "@/lib/allowance/storage";
import { defaultActivitySuggestions } from "@/lib/activities/defaults";
import { buildActivitySummaries, normalizeActivityTitleKey } from "@/lib/activities/summary";
import type { ActivityDefinition, ActivityEntry } from "@/lib/activities/types";

type DashboardActivityTrackerProps = {
  activities: ActivityDefinition[];
  entries: ActivityEntry[];
  errorMessage: string;
  isTodaySelected: boolean;
  isRemoteReady: boolean;
  onSaveActivityCount: (input: {
    activityId?: string;
    quantity: number;
    title: string;
    unitLabel: string;
  }) => Promise<void>;
  selectedDate: string;
  selectedDateLabel: string;
};

export function DashboardActivityTracker({
  activities,
  entries,
  errorMessage,
  isTodaySelected,
  isRemoteReady,
  onSaveActivityCount,
  selectedDate,
  selectedDateLabel,
}: DashboardActivityTrackerProps) {
  const [activitySelection, setActivitySelection] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customUnitLabel, setCustomUnitLabel] = useState("count");
  const [newQuantity, setNewQuantity] = useState("");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [savingActivityId, setSavingActivityId] = useState("");
  const [localError, setLocalError] = useState("");
  const summaries = useMemo(
    () =>
      buildActivitySummaries({
        activities,
        entries,
        referenceDate: selectedDate,
      }),
    [activities, entries, selectedDate],
  );
  const activeActivities = useMemo(
    () => activities.filter((activity) => activity.status === "active").sort((first, second) => first.title.localeCompare(second.title)),
    [activities],
  );
  const availableSuggestions = useMemo(
    () =>
      defaultActivitySuggestions.filter(
        (suggestion) =>
          !activeActivities.some(
            (activity) => activity.titleKey === normalizeActivityTitleKey(suggestion.title),
          ),
      ),
    [activeActivities],
  );
  const sponsoredSummaries = summaries.filter((summary) => summary.isSponsored);

  const fallbackSelection =
    availableSuggestions.length > 0
      ? getSuggestionOptionValue(availableSuggestions[0].title)
      : activeActivities.length > 0
        ? getExistingActivityOptionValue(activeActivities[0].id)
        : "custom";
  const validSelections = new Set([
    ...activeActivities.map((activity) => getExistingActivityOptionValue(activity.id)),
    ...availableSuggestions.map((suggestion) => getSuggestionOptionValue(suggestion.title)),
    "custom",
  ]);
  const effectiveActivitySelection = validSelections.has(activitySelection)
    ? activitySelection
    : fallbackSelection;
  const selectedExistingActivity = effectiveActivitySelection.startsWith("activity:")
    ? activeActivities.find((activity) => activity.id === effectiveActivitySelection.slice("activity:".length))
    : undefined;
  const selectedSuggestion = effectiveActivitySelection.startsWith("suggestion:")
    ? availableSuggestions.find(
        (suggestion) =>
          normalizeActivityTitleKey(suggestion.title) ===
          effectiveActivitySelection.slice("suggestion:".length),
      )
    : undefined;
  const isCustomSelection = effectiveActivitySelection === "custom";

  async function submitNewActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isRemoteReady) {
      return;
    }

    const quantity = Number(newQuantity);
    const resolvedTitle = selectedExistingActivity?.title ?? selectedSuggestion?.title ?? customTitle;
    const resolvedUnitLabel =
      selectedExistingActivity?.unitLabel ?? selectedSuggestion?.unitLabel ?? customUnitLabel;

    if (!resolvedTitle.trim()) {
      setLocalError("Enter an activity name before saving.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setLocalError("Enter a count greater than zero.");
      return;
    }

    setIsCreating(true);
    setLocalError("");

    try {
      await onSaveActivityCount({
        activityId: selectedExistingActivity?.id,
        quantity,
        title: resolvedTitle,
        unitLabel: resolvedUnitLabel,
      });
      setNewQuantity("");

      if (isCustomSelection) {
        setCustomTitle("");
        setCustomUnitLabel("count");
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not save activity count.");
    } finally {
      setIsCreating(false);
    }
  }

  async function saveExistingActivity(activity: ActivityDefinition) {
    const quantity = Number(quantityDrafts[activity.id] ?? "");

    if (!Number.isFinite(quantity) || quantity < 0) {
      setLocalError("Counts must be zero or higher.");
      return;
    }

    setSavingActivityId(activity.id);
    setLocalError("");

    try {
      await onSaveActivityCount({
        activityId: activity.id,
        quantity,
        title: activity.title,
        unitLabel: activity.unitLabel,
      });
      setQuantityDrafts((current) => {
        const nextDrafts = { ...current };

        delete nextDrafts[activity.id];

        return nextDrafts;
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not save activity count.");
    } finally {
      setSavingActivityId("");
    }
  }

  return (
    <div className="mt-5 border-t border-[#e2e8f0] pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
            Activity Tracker
          </h3>
          <p className="mt-1 text-sm text-[#4c5965]">
            Log daily counts for workouts, shots, reading, hydration, or any custom activity.
          </p>
        </div>
      </div>

      {sponsoredSummaries.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {sponsoredSummaries.map((summary) => (
            <article
              className="border border-[#d7d49d] bg-[#fffef2] px-4 py-4 shadow-sm"
              key={`sponsored-${summary.activity.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a6a12]">
                    Sponsored
                  </p>
                  <h4 className="mt-1 text-lg font-semibold">{summary.activity.title}</h4>
                </div>
                <span className="border border-[#d7d49d] bg-white px-2 py-1 text-xs font-semibold text-[#8a6a12]">
                  {formatCurrency(summary.activity.sponsorAmount ?? 0)} / {summary.activity.unitLabel}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="border border-[#ece6b0] bg-white px-3 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                    {isTodaySelected ? "Today" : "Selected day"}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-[#17202a]">
                    {formatActivityQuantity(summary.selectedDateQuantity, summary.activity.unitLabel)}
                  </dd>
                </div>
                <div className="border border-[#ece6b0] bg-white px-3 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                    This week value
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-[#2f6f73]">
                    {formatCurrency(summary.currentWeekSponsoredAmount ?? 0)}
                  </dd>
                </div>
                <div className="border border-[#ece6b0] bg-white px-3 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                    This week
                  </dt>
                  <dd className="mt-1 font-semibold text-[#17202a]">
                    {formatActivityQuantity(summary.currentWeekTotal, summary.activity.unitLabel)}
                  </dd>
                </div>
                <div className="border border-[#ece6b0] bg-white px-3 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                    Last week
                  </dt>
                  <dd className="mt-1 font-semibold text-[#17202a]">
                    {formatActivityQuantity(summary.previousWeekTotal, summary.activity.unitLabel)}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}

      <form className="mt-4 grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] p-4" onSubmit={submitNewActivity}>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Activity</span>
              <select
                className="border border-[#d7e0e7] bg-white px-3 py-2"
                onChange={(event) => setActivitySelection(event.target.value)}
                value={effectiveActivitySelection}
              >
                {activeActivities.length > 0 ? (
                  <optgroup label="Existing">
                    {activeActivities.map((activity) => (
                      <option key={activity.id} value={getExistingActivityOptionValue(activity.id)}>
                        {activity.title}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {availableSuggestions.length > 0 ? (
                  <optgroup label="Suggested">
                    {availableSuggestions.map((suggestion) => (
                      <option
                        key={suggestion.title}
                        value={getSuggestionOptionValue(suggestion.title)}
                      >
                        {suggestion.title}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <option value="custom">Custom activity</option>
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              {isCustomSelection ? (
                <>
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold">Name</span>
                    <input
                      className="border border-[#d7e0e7] bg-white px-3 py-2"
                      onChange={(event) => setCustomTitle(event.target.value)}
                      placeholder="Stickhandling"
                      value={customTitle}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold">Unit</span>
                    <input
                      className="border border-[#d7e0e7] bg-white px-3 py-2"
                      onChange={(event) => setCustomUnitLabel(event.target.value)}
                      placeholder="minutes"
                      value={customUnitLabel}
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                      Unit
                    </p>
                    <p className="mt-1 font-semibold text-[#17202a]">
                      {selectedExistingActivity?.unitLabel ?? selectedSuggestion?.unitLabel}
                    </p>
                  </div>
                  <div className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                      Log for
                    </p>
                    <p className="mt-1 font-semibold text-[#17202a]">{selectedDateLabel}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[140px_auto] sm:items-end">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Count</span>
              <input
                className="border border-[#d7e0e7] bg-white px-3 py-2"
                min="0"
                onChange={(event) => setNewQuantity(event.target.value)}
                step="1"
                type="number"
                value={newQuantity}
              />
            </label>
            <button
              className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:justify-self-start"
              disabled={!isRemoteReady || isCreating}
              type="submit"
            >
              {isCreating ? "Saving..." : "Save count"}
            </button>
          </div>
        </div>
      </form>

      {summaries.length > 0 ? (
        <ol className="mt-4 grid gap-2">
          {summaries.map((summary) => {
            const rowPending = savingActivityId === summary.activity.id;
            const draftValue =
              quantityDrafts[summary.activity.id] ?? String(summary.selectedDateQuantity || "");
            const draftQuantity = Number(draftValue);
            const isUnchanged =
              draftValue === String(summary.selectedDateQuantity || "") ||
              (draftValue === "" && summary.selectedDateQuantity === 0);

            return (
              <li
                className={`grid gap-3 border px-3 py-3 ${
                  summary.isSponsored
                    ? "border-[#d7d49d] bg-[#fffef2]"
                    : "border-[#d7e0e7] bg-[#f8fafc]"
                }`}
                key={summary.activity.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[#17202a]">{summary.activity.title}</p>
                      {summary.isSponsored ? (
                        <span className="border border-[#d7d49d] bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a6a12]">
                          Sponsored
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[#657381]">
                      {formatActivityQuantity(summary.currentWeekTotal, summary.activity.unitLabel)} this
                      week
                      {" · "}
                      {formatActivityQuantity(summary.previousWeekTotal, summary.activity.unitLabel)} last
                      week
                      {summary.isSponsored
                        ? ` · ${formatCurrency(summary.currentWeekSponsoredAmount ?? 0)} this week`
                        : ""}
                    </p>
                  </div>
                  <form
                    className="grid gap-2 sm:grid-cols-[130px_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveExistingActivity(summary.activity);
                    }}
                  >
                    <label className="grid gap-1 text-sm">
                      <span className="font-semibold">
                        {isTodaySelected ? "Today" : "Selected day"}
                      </span>
                      <input
                        className="border border-[#d7e0e7] bg-white px-3 py-2"
                        min="0"
                        onChange={(event) =>
                          setQuantityDrafts((current) => ({
                            ...current,
                            [summary.activity.id]: event.target.value,
                          }))
                        }
                        step="1"
                        type="number"
                        value={draftValue}
                      />
                    </label>
                    <button
                      className="self-end border border-[#d7e0e7] bg-white px-4 py-2 text-sm font-semibold text-[#1f6f8b] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={rowPending || isUnchanged || !Number.isFinite(draftQuantity) || draftQuantity < 0}
                      type="submit"
                    >
                      {rowPending ? "Saving..." : "Save"}
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-4 border border-dashed border-[#cbd5df] bg-[#f8fafc] px-3 py-4 text-sm text-[#4c5965]">
          No activities have been tracked yet. Use the form above to add the first one.
        </p>
      )}

      {errorMessage || localError ? (
        <p className="mt-3 border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
          {localError || errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function getExistingActivityOptionValue(activityId: string) {
  return `activity:${activityId}`;
}

function getSuggestionOptionValue(title: string) {
  return `suggestion:${normalizeActivityTitleKey(title)}`;
}

function formatActivityQuantity(quantity: number, unitLabel: string) {
  return `${quantity} ${formatActivityUnitLabel(quantity, unitLabel)}`;
}

function formatActivityUnitLabel(quantity: number, unitLabel: string) {
  if (quantity === 1 && unitLabel.endsWith("s")) {
    return unitLabel.slice(0, -1);
  }

  return unitLabel;
}

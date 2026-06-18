"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { defaultActivitySuggestions } from "@/lib/activities/defaults";
import {
  loadRemoteActivityDefinitions,
  mergeActivityDefinition,
  upsertRemoteActivityDefinition,
  updateRemoteActivityDefinition,
} from "@/lib/activities/remote";
import { normalizeActivityTitleKey, normalizeActivityUnitLabel, normalizeActivitySponsorAmount } from "@/lib/activities/summary";
import type { ActivityDefinition } from "@/lib/activities/types";

type AdminActivitySponsorshipsProps = {
  householdId: string;
  isHouseholdAdmin: boolean;
};

export function AdminActivitySponsorships({
  householdId,
  isHouseholdAdmin,
}: AdminActivitySponsorshipsProps) {
  const [activities, setActivities] = useState<ActivityDefinition[]>([]);
  const [activitySelection, setActivitySelection] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customUnitLabel, setCustomUnitLabel] = useState("count");
  const [sponsorAmount, setSponsorAmount] = useState("");
  const [sponsorDrafts, setSponsorDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "saving">("idle");
  const [message, setMessage] = useState("");
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

  useEffect(() => {
    let isActive = true;

    async function loadActivities() {
      setStatus("loading");
      setMessage("");

      try {
        const remoteActivities = await loadRemoteActivityDefinitions(householdId);

        if (!isActive) {
          return;
        }

        setActivities(remoteActivities);
        setStatus("idle");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setStatus("idle");
        setMessage(error instanceof Error ? error.message : "Could not load activity sponsorships.");
      }
    }

    void loadActivities();

    return () => {
      isActive = false;
    };
  }, [householdId]);

  const fallbackSelection =
    availableSuggestions.length > 0
      ? getSuggestionOptionValue(availableSuggestions[0].title)
      : "custom";
  const validSelections = new Set([
    ...availableSuggestions.map((suggestion) => getSuggestionOptionValue(suggestion.title)),
    "custom",
  ]);
  const effectiveActivitySelection = validSelections.has(activitySelection)
    ? activitySelection
    : fallbackSelection;
  const selectedSuggestion = effectiveActivitySelection.startsWith("suggestion:")
    ? availableSuggestions.find(
        (suggestion) =>
          normalizeActivityTitleKey(suggestion.title) ===
          effectiveActivitySelection.slice("suggestion:".length),
      )
    : undefined;
  const isCustomSelection = effectiveActivitySelection === "custom";

  async function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const resolvedTitle = selectedSuggestion?.title ?? customTitle;
    const resolvedUnitLabel = selectedSuggestion?.unitLabel ?? customUnitLabel;

    if (!resolvedTitle.trim()) {
      setMessage("Enter an activity name before saving.");
      return;
    }

    setStatus("saving");
    setMessage("");

    try {
      const savedActivity = await upsertRemoteActivityDefinition({
        householdId,
        sponsorAmount: normalizeActivitySponsorAmount(sponsorAmount),
        title: resolvedTitle,
        unitLabel: normalizeActivityUnitLabel(resolvedUnitLabel),
      });

      setActivities((current) => mergeActivityDefinition(current, savedActivity));
      setSponsorAmount("");

      if (isCustomSelection) {
        setCustomTitle("");
        setCustomUnitLabel("count");
      }

      setMessage(`${savedActivity.title} is ready for tracking.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save activity.");
    } finally {
      setStatus("idle");
    }
  }

  async function saveSponsor(activity: ActivityDefinition) {
    setStatus("saving");
    setMessage("");

    try {
      const savedActivity = await updateRemoteActivityDefinition({
        activityId: activity.id,
        householdId,
        sponsorAmount: normalizeActivitySponsorAmount(sponsorDrafts[activity.id]),
      });

      setActivities((current) => mergeActivityDefinition(current, savedActivity));
      setSponsorDrafts((current) => {
        const nextDrafts = { ...current };

        delete nextDrafts[activity.id];

        return nextDrafts;
      });
      setMessage(`${activity.title} sponsorship saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save sponsorship.");
    } finally {
      setStatus("idle");
    }
  }

  async function archiveActivity(activity: ActivityDefinition) {
    setStatus("saving");
    setMessage("");

    try {
      const archivedActivity = await updateRemoteActivityDefinition({
        activityId: activity.id,
        householdId,
        status: "archived",
      });

      setActivities((current) => current.filter((candidate) => candidate.id !== archivedActivity.id));
      setMessage(`${activity.title} archived.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not archive activity.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#657381]">
            Optional
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Activity sponsorships</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#4c5965]">
            Quietly configure per-unit challenge amounts for tracked activities like shots, reading,
            exercise, or water.
          </p>
        </div>
        {!isHouseholdAdmin ? (
          <span className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#657381]">
            Parent or owner access required
          </span>
        ) : null}
      </div>

      {isHouseholdAdmin ? (
        <>
          <form className="mt-4 grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] p-4" onSubmit={addActivity}>
            <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr_150px_auto]">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Activity</span>
                <select
                  className="border border-[#d7e0e7] bg-white px-3 py-2"
                  onChange={(event) => setActivitySelection(event.target.value)}
                  value={effectiveActivitySelection}
                >
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
                <div className="grid gap-3 lg:col-span-2 lg:grid-cols-[1fr_160px]">
                  <div className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm">
                    <p className="font-semibold text-[#17202a]">{selectedSuggestion?.title}</p>
                    <p className="mt-1 text-xs text-[#657381]">
                      Unit: {selectedSuggestion?.unitLabel}
                    </p>
                  </div>
                  <div className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                      Sponsorship
                    </p>
                    <p className="mt-1 text-xs text-[#4c5965]">
                      Leave blank to track without a dollar amount.
                    </p>
                  </div>
                </div>
              )}
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Per-unit $</span>
                <input
                  className="border border-[#d7e0e7] bg-white px-3 py-2"
                  min="0"
                  onChange={(event) => setSponsorAmount(event.target.value)}
                  placeholder="0.10"
                  step="0.01"
                  type="number"
                  value={sponsorAmount}
                />
              </label>
              <button
                className="self-end border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={status === "saving"}
                type="submit"
              >
                {status === "saving" ? "Saving..." : "Add activity"}
              </button>
            </div>
          </form>

          <div className="mt-4 grid gap-3">
            {activeActivities.length > 0 ? (
              activeActivities.map((activity) => {
                const draftValue =
                  sponsorDrafts[activity.id] ?? (activity.sponsorAmount ? String(activity.sponsorAmount) : "");
                const isUnchanged =
                  draftValue === (activity.sponsorAmount ? String(activity.sponsorAmount) : "");

                return (
                  <article
                    className={`grid gap-3 border px-4 py-4 md:grid-cols-[1fr_180px_auto_auto] md:items-end ${
                      activity.sponsorAmount
                        ? "border-[#d7d49d] bg-[#fffef2]"
                        : "border-[#d7e0e7] bg-[#f8fafc]"
                    }`}
                    key={activity.id}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[#17202a]">{activity.title}</h3>
                        {activity.sponsorAmount ? (
                          <span className="border border-[#d7d49d] bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a6a12]">
                            Sponsored
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-[#657381]">Unit: {activity.unitLabel}</p>
                    </div>
                    <label className="grid gap-1 text-sm">
                      <span className="font-semibold">Per-unit $</span>
                      <input
                        className="border border-[#d7e0e7] bg-white px-3 py-2"
                        min="0"
                        onChange={(event) =>
                          setSponsorDrafts((current) => ({
                            ...current,
                            [activity.id]: event.target.value,
                          }))
                        }
                        placeholder="None"
                        step="0.01"
                        type="number"
                        value={draftValue}
                      />
                    </label>
                    <button
                      className="border border-[#d7e0e7] bg-white px-4 py-2 text-sm font-semibold text-[#1f6f8b] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={status === "saving" || isUnchanged}
                      onClick={() => {
                        void saveSponsor(activity);
                      }}
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      className="border border-[#d7e0e7] bg-white px-4 py-2 text-sm font-semibold text-[#8a2f2f] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={status === "saving"}
                      onClick={() => {
                        void archiveActivity(activity);
                      }}
                      type="button"
                    >
                      Archive
                    </button>
                  </article>
                );
              })
            ) : (
              <p className="border border-dashed border-[#cbd5df] bg-[#f8fafc] px-3 py-4 text-sm text-[#4c5965]">
                No activities exist yet. Add one here or from the dashboard tracker.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-4 text-sm text-[#4c5965]">
          Ask a household owner or parent to configure sponsorship amounts for tracked activities.
        </p>
      )}

      {message ? (
        <p
          className={`mt-4 border px-3 py-2 text-sm ${
            message.toLowerCase().includes("could not") || message.toLowerCase().includes("enter ")
              ? "border-[#f2b8a0] bg-[#fff7ed] text-[#8a3b12]"
              : "border-[#c9d8df] bg-[#eef7f7] text-[#2f6f73]"
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

function getSuggestionOptionValue(title: string) {
  return `suggestion:${normalizeActivityTitleKey(title)}`;
}

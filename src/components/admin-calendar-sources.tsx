"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useCalendarFeed } from "@/lib/calendar/supabase-calendar";
import type {
  AppliedCalendarEvent,
  CalendarPreviewResult,
  CalendarSource,
  CalendarSourceKind,
} from "@/lib/calendar/types";
import type { HouseholdMember } from "@/lib/planner/types";

type AdminCalendarSourcesProps = {
  members: HouseholdMember[];
};

type CalendarFormState = {
  label: string;
  kind: CalendarSourceKind;
  url: string;
  syncMode: "manual" | "scheduled";
  syncTime: string;
  defaultMemberIds: string[];
  notes: string;
};

const defaultFormState: CalendarFormState = {
  label: "",
  kind: "ics-url",
  url: "",
  syncMode: "manual",
  syncTime: "05:00",
  defaultMemberIds: [],
  notes: "",
};
const previewDisplayLimit = 20;
const calendarSourceGuides: Record<CalendarSourceKind, string> = {
  "apple-calendar":
    "Use an iCloud Public Calendar link from Calendar sharing. Exported .ics files are one-time snapshots and will not stay updated.",
  "ics-url":
    "Use any public subscription feed, including a Google Calendar Secret address in iCal format or a webcal:// link.",
  "manual-upload": "Manual app events are created from the dashboard, not added here.",
  "school-calendar":
    "Use the school's public iCal, ICS, or webcal subscription link so schedule changes can be re-applied later.",
  sportsengine:
    "Use the Subscribe to iCal link from the team or tournament page. webcal:// links are accepted here.",
};

export function AdminCalendarSources({ members }: AdminCalendarSourcesProps) {
  const {
    appliedEvents,
    applySourceEvents,
    errorMessage,
    removeSource: removePersistedSource,
    saveSource,
    setAppliedEvents,
    setSources,
    sources,
    status,
    timeZone,
    usesSupabase,
  } = useCalendarFeed();
  const [form, setForm] = useState(defaultFormState);
  const [previewBySource, setPreviewBySource] = useState<Record<string, CalendarPreviewResult>>({});
  const [applyingSourceId, setApplyingSourceId] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);

  useEffect(() => {
    setSources((current) =>
      current.some((source) => source.lastSyncMessage === "Unexpected end of JSON input")
        ? current.map((source) =>
            source.lastSyncMessage === "Unexpected end of JSON input"
              ? {
                  ...source,
                  lastSyncStatus: "never",
                  lastSyncMessage: "Preview again to refresh this source with the updated calendar importer.",
                }
              : source,
          )
        : current,
    );
  }, [setSources]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.label.trim() || !form.url.trim()) {
      return;
    }

    const source: CalendarSource = {
      id: createId(form.label),
      label: form.label.trim(),
      kind: form.kind,
      url: form.url.trim(),
      enabled: true,
      syncMode: form.syncMode,
      defaultVisibility: form.defaultMemberIds.length > 0 ? "assigned-members" : "family",
      defaultMemberIds: form.defaultMemberIds,
      lastSyncStatus: "never",
      notes: form.notes.trim() || undefined,
      schedule:
        form.syncMode === "scheduled"
          ? {
              time: form.syncTime,
            }
          : undefined,
    };

    setSources((current) => {
      const exists = current.some((candidate) => candidate.id === source.id);

      return exists
        ? current.map((candidate) => (candidate.id === source.id ? source : candidate))
        : [...current, source];
    });
    setForm(defaultFormState);
    void saveCalendarSource(source);
  }

  function toggleEnabled(sourceId: string) {
    let nextSource: CalendarSource | undefined;

    setSources((current) =>
      current.map((source) =>
        source.id === sourceId
          ? (nextSource = {
              ...source,
              enabled: !source.enabled,
            })
          : source,
      ),
    );

    if (nextSource) {
      void saveCalendarSource(nextSource);
    }
  }

  function removeSource(sourceId: string) {
    void runCalendarAction(async () => {
      await removePersistedSource(sourceId);
    });
    setPreviewBySource((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });
  }

  function updateSourceSchedule(sourceId: string, updates: Partial<Pick<CalendarSource, "syncMode" | "schedule">>) {
    let nextSource: CalendarSource | undefined;

    setSources((current) =>
      current.map((source) => {
        if (source.id !== sourceId) {
          return source;
        }

        const syncMode = updates.syncMode ?? source.syncMode;
        const schedule =
          syncMode === "scheduled"
            ? {
                lastAttemptedOn:
                  updates.schedule?.lastAttemptedOn ??
                  source.schedule?.lastAttemptedOn,
                time: updates.schedule?.time ?? source.schedule?.time ?? "05:00",
              }
            : undefined;

        nextSource = {
          ...source,
          schedule,
          syncMode,
        };

        return nextSource;
      }),
    );

    if (nextSource) {
      void saveCalendarSource(nextSource);
    }
  }

  async function applyPreview(source: CalendarSource) {
    const preview = previewBySource[source.id];

    if (!preview) {
      return;
    }

    const appliedAt = new Date().toISOString();
    const nextEvents = preview.events.map((event) => ({
      ...event,
      sourceLabel: source.label,
      assignedMemberIds: source.defaultMemberIds ?? [],
      appliedAt,
    }));
    const nextSource = {
      ...source,
      lastAppliedAt: appliedAt,
      lastSyncStatus: "success" as const,
      lastSyncMessage: `Applied ${nextEvents.length} event${nextEvents.length === 1 ? "" : "s"} to the ${usesSupabase ? "Supabase" : "local"} dashboard feed.`,
    };

    setApplyingSourceId(source.id);

    try {
      await applySourceEvents(nextSource, nextEvents);
      setAppliedEvents((current) => [
        ...current.filter((event) => event.sourceId !== source.id),
        ...nextEvents,
      ]);
      setSources((current) =>
        current.map((candidate) =>
          candidate.id === source.id ? nextSource : candidate,
        ),
      );
    } catch (error) {
      const lastSyncedAt = new Date().toISOString();
      const lastSyncMessage = getErrorMessage(error, "Calendar apply failed.");
      const errorSource = {
        ...source,
        lastSyncedAt,
        lastSyncStatus: "error" as const,
        lastSyncMessage,
      };

      setSources((current) =>
        current.map((candidate) =>
          candidate.id === source.id ? errorSource : candidate,
        ),
      );
      void saveCalendarSource(errorSource);
    } finally {
      setApplyingSourceId(null);
    }
  }

  function toggleSourceMember(sourceId: string, memberId: string) {
    let nextMemberIds: string[] = [];
    let nextSource: CalendarSource | undefined;
    let nextAppliedEvents: AppliedCalendarEvent[] = [];

    setSources((current) =>
      current.map((source) => {
        if (source.id !== sourceId) {
          return source;
        }

        const currentMemberIds = source.defaultMemberIds ?? [];

        nextMemberIds = currentMemberIds.includes(memberId)
          ? currentMemberIds.filter((id) => id !== memberId)
          : [...currentMemberIds, memberId];

        nextSource = {
          ...source,
          defaultMemberIds: nextMemberIds,
          defaultVisibility: nextMemberIds.length > 0 ? "assigned-members" : "family",
        };

        return nextSource;
      }),
    );
    setAppliedEvents((current) =>
      (nextAppliedEvents = current.map((event) =>
        event.sourceId === sourceId
          ? {
              ...event,
              assignedMemberIds: nextMemberIds,
            }
          : event,
      )),
    );

    if (nextSource) {
      const source = nextSource;
      void runCalendarAction(async () => {
        await saveSource(source);
        await applySourceEvents(
          source,
          nextAppliedEvents.filter((event) => event.sourceId === sourceId),
        );
      });
    }
  }

  async function previewSource(source: CalendarSource) {
    if (!source.url) {
      return;
    }

    setIsPreviewing(source.id);
    setSources((current) =>
      current.map((candidate) =>
        candidate.id === source.id
          ? {
              ...candidate,
              lastSyncStatus: undefined,
              lastSyncMessage: undefined,
            }
          : candidate,
      ),
    );

    try {
      const response = await fetch("/api/calendar/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId: source.id,
          timeZone,
          url: source.url,
        }),
      });
      const data = await readCalendarPreviewResponse(response);

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Preview failed");
      }

      setPreviewBySource((current) => ({
        ...current,
        [source.id]: data as CalendarPreviewResult,
      }));
      const lastSyncedAt = new Date().toISOString();
      const lastSyncMessage = getPreviewMessage(data as CalendarPreviewResult);
      setSources((current) =>
        current.map((candidate) =>
          candidate.id === source.id
            ? {
                ...candidate,
                lastSyncedAt,
                lastSyncStatus: "success",
                lastSyncMessage,
              }
            : candidate,
        ),
      );
      void saveCalendarSource({
        ...source,
        lastSyncedAt,
        lastSyncStatus: "success",
        lastSyncMessage,
      });
    } catch (error) {
      const lastSyncedAt = new Date().toISOString();
      const lastSyncMessage = error instanceof Error ? error.message : "Preview failed";
      setSources((current) =>
        current.map((candidate) =>
          candidate.id === source.id
            ? {
                ...candidate,
                lastSyncedAt,
                lastSyncStatus: "error",
                lastSyncMessage,
              }
            : candidate,
        ),
      );
      void saveCalendarSource({
        ...source,
        lastSyncedAt,
        lastSyncStatus: "error",
        lastSyncMessage,
      });
    } finally {
      setIsPreviewing(null);
    }
  }

  function toggleDefaultMember(memberId: string) {
    setForm((current) => ({
      ...current,
      defaultMemberIds: current.defaultMemberIds.includes(memberId)
        ? current.defaultMemberIds.filter((id) => id !== memberId)
        : [...current.defaultMemberIds, memberId],
    }));
  }

  async function saveCalendarSource(source: CalendarSource) {
    await runCalendarAction(async () => {
      await saveSource(source);
    });
  }

  async function runCalendarAction(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setSources((current) =>
        current.map((source) => ({
          ...source,
          lastSyncStatus: source.lastSyncStatus ?? "error",
          lastSyncMessage:
            source.lastSyncMessage ??
            getErrorMessage(error, "Calendar persistence failed."),
        })),
      );
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">Calendar Sources</h2>
        <form className="mt-4 grid gap-4" onSubmit={submit}>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Label</span>
            <input
              className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="School calendar, SportsEngine, Family Apple Calendar"
              value={form.label}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Source Type</span>
            <select
              className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  kind: event.target.value as CalendarSourceKind,
                }))
              }
              value={form.kind}
            >
              <option value="ics-url">ICS URL</option>
              <option value="apple-calendar">Apple shared calendar</option>
              <option value="sportsengine">SportsEngine</option>
              <option value="school-calendar">School calendar</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Shared URL</span>
            <input
              className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://... or webcal://..."
              value={form.url}
            />
            <span className="text-xs leading-5 text-[#657381]">{calendarSourceGuides[form.kind]}</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Refresh Mode</span>
              <select
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    syncMode: event.target.value as CalendarSource["syncMode"],
                  }))
                }
                value={form.syncMode}
              >
                <option value="manual">Manual preview + apply</option>
                <option value="scheduled">Daily scheduled refresh</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Daily Time</span>
              <input
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 disabled:opacity-50"
                disabled={form.syncMode !== "scheduled"}
                onChange={(event) => setForm((current) => ({ ...current, syncTime: event.target.value }))}
                step={60}
                type="time"
                value={form.syncTime}
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-[#657381]">
            Scheduled sources can keep refreshing from the deployed app once a server cron is enabled. Preview and
            apply still remain available for spot checks.
          </p>

          <fieldset className="grid gap-2 text-sm">
            <legend className="font-semibold">Default members</legend>
            <div className="grid grid-cols-2 gap-2">
              {members.map((member) => (
                <label className="flex items-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2" key={member.id}>
                  <input
                    checked={form.defaultMemberIds.includes(member.id)}
                    onChange={() => toggleDefaultMember(member.id)}
                    type="checkbox"
                  />
                  {member.preferredName}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Notes</span>
            <textarea
              className="min-h-20 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="What this source usually means, e.g. no-school events affect all kids."
              value={form.notes}
            />
          </label>

          <button className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white" type="submit">
            Save Source
          </button>
        </form>
      </section>

      <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Saved Sources</h2>
            <p className="text-sm text-[#4c5965]">
              {usesSupabase
                ? "Stored in Supabase for this household."
                : "Stored in this browser until you sign in and create a household."}
            </p>
          </div>
          <span className="text-sm font-semibold text-[#2f6f73]">
            {sources.length} source{sources.length === 1 ? "" : "s"} · {appliedEvents.length} applied event
            {appliedEvents.length === 1 ? "" : "s"}
          </span>
        </div>
        {status === "error" || errorMessage ? (
          <p className="mt-3 border border-[#d7a7a7] bg-[#fff7f7] px-3 py-2 text-sm text-[#8a2f2f]">
            {errorMessage || "Calendar data could not be loaded from Supabase."}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3">
          {sources.length === 0 ? (
            <p className="border border-dashed border-[#cbd5df] bg-[#f8fafc] px-3 py-4 text-sm text-[#4c5965]">
              No calendar sources yet. Add a shared ICS or webcal URL to preview events.
            </p>
          ) : (
            sources.map((source) => (
              <article className="border border-[#d7e0e7] bg-[#f8fafc] p-3" key={source.id}>
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">{source.label}</h3>
                    <p className="mt-1 break-all text-sm text-[#4c5965]">{source.url}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                      {source.kind} · {source.enabled ? "imports shown" : "imports hidden"} · {source.lastSyncStatus ?? "never"}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold text-[#17202a]">Refresh mode</span>
                        <select
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) =>
                            updateSourceSchedule(source.id, {
                              syncMode: event.target.value as CalendarSource["syncMode"],
                            })
                          }
                          value={source.syncMode}
                        >
                          <option value="manual">Manual</option>
                          <option value="scheduled">Scheduled daily</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold text-[#17202a]">Daily time</span>
                        <input
                          className="border border-[#d7e0e7] bg-white px-3 py-2 disabled:opacity-50"
                          disabled={source.syncMode !== "scheduled"}
                          onChange={(event) =>
                            updateSourceSchedule(source.id, {
                              schedule: {
                                lastAttemptedOn: source.schedule?.lastAttemptedOn,
                                time: event.target.value,
                              },
                            })
                          }
                          step={60}
                          type="time"
                          value={source.schedule?.time ?? "05:00"}
                        />
                      </label>
                    </div>
                    <p className="mt-2 text-sm text-[#4c5965]">{getScheduleSummary(source, timeZone)}</p>
                    <fieldset className="mt-3 grid gap-2 text-sm">
                      <legend className="font-semibold text-[#17202a]">Show on dashboards for</legend>
                      <div className="flex flex-wrap gap-2">
                        {members.map((member) => (
                          <label
                            className="flex items-center gap-2 border border-[#d7e0e7] bg-white px-2 py-1 text-xs font-semibold"
                            key={member.id}
                          >
                            <input
                              checked={(source.defaultMemberIds ?? []).includes(member.id)}
                              onChange={() => toggleSourceMember(source.id, member.id)}
                              type="checkbox"
                            />
                            {member.preferredName}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {source.lastSyncMessage ? <p className="mt-2 text-sm text-[#4c5965]">{source.lastSyncMessage}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="border border-[#1f6f8b] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b]"
                      disabled={isPreviewing === source.id}
                      onClick={() => previewSource(source)}
                      type="button"
                    >
                      {isPreviewing === source.id ? "Previewing..." : "Preview"}
                    </button>
                    <button
                      className="border border-[#1f6f8b] bg-[#1f6f8b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={!previewBySource[source.id] || applyingSourceId === source.id}
                      onClick={() => {
                        void applyPreview(source);
                      }}
                      type="button"
                    >
                      {applyingSourceId === source.id ? "Applying..." : "Apply"}
                    </button>
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#33414f]"
                      onClick={() => toggleEnabled(source.id)}
                      type="button"
                    >
                      {source.enabled ? "Hide" : "Show"}
                    </button>
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#8a2f2f]"
                      onClick={() => removeSource(source.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </header>

                {previewBySource[source.id] ? (
                  <ol className="mt-3 grid gap-2">
                    {previewBySource[source.id].events.slice(0, previewDisplayLimit).map((event) => (
                      <li className="grid gap-1 border border-[#d7e0e7] bg-white px-3 py-2 text-sm" key={`${event.sourceId}-${event.sourceUid}-${event.date}-${event.startTime}-${event.title}`}>
                        <span className="font-semibold">{event.title}</span>
                        <span className="text-[#4c5965]">
                          {event.date} · {event.startTime}-{event.endTime} · {event.category}
                        </span>
                        {event.teamLabel ? (
                          <span className="text-xs font-semibold text-[#2f6f73]">{event.teamLabel}</span>
                        ) : null}
                        {event.location ? <span className="text-xs text-[#657381]">{event.location}</span> : null}
                      </li>
                    ))}
                    {previewBySource[source.id].events.length > previewDisplayLimit ? (
                      <li className="border border-dashed border-[#cbd5df] bg-white px-3 py-3 text-sm text-[#4c5965]">
                        Showing first {previewDisplayLimit} of {previewBySource[source.id].eventCount} events. Apply imports all {previewBySource[source.id].eventCount}.
                      </li>
                    ) : null}
                  </ol>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function createId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function getPreviewMessage(preview: CalendarPreviewResult) {
  const shownCount = Math.min(previewDisplayLimit, preview.events.length);
  const eventLabel = preview.eventCount === 1 ? "event" : "events";

  if (preview.eventCount > shownCount) {
    return `Found ${preview.eventCount} ${eventLabel}. Showing first ${shownCount}; Apply will import all ${preview.eventCount}.`;
  }

  return `Found ${preview.eventCount} ${eventLabel}. Apply will import ${preview.eventCount}.`;
}

function getScheduleSummary(source: CalendarSource, timeZone: string) {
  if (source.syncMode !== "scheduled") {
    return "Runs only when a parent previews and applies this source.";
  }

  const attemptedLabel = source.schedule?.lastAttemptedOn
    ? ` Last scheduled attempt: ${source.schedule.lastAttemptedOn} (${timeZone}).`
    : "";

  return `Scheduled to refresh daily around ${source.schedule?.time ?? "05:00"} in ${timeZone}.${attemptedLabel}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
}

async function readCalendarPreviewResponse(
  response: Response,
): Promise<CalendarPreviewResult | { error: string }> {
  const text = await response.text();

  if (!text.trim()) {
    return {
      error: `Preview returned an empty ${response.status} response.`,
    };
  }

  try {
    return JSON.parse(text) as CalendarPreviewResult | { error: string };
  } catch {
    return {
      error: text.slice(0, 240),
    };
  }
}

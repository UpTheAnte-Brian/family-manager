"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { appliedCalendarEventsStorageKey, calendarSourcesStorageKey } from "@/lib/calendar/storage";
import type {
  AppliedCalendarEvent,
  CalendarPreviewResult,
  CalendarSource,
  CalendarSourceKind,
} from "@/lib/calendar/types";
import type { HouseholdMember } from "@/lib/planner/types";
import { useLocalStorageState } from "@/lib/storage/local";

type AdminCalendarSourcesProps = {
  members: HouseholdMember[];
};

type CalendarFormState = {
  label: string;
  kind: CalendarSourceKind;
  url: string;
  defaultMemberIds: string[];
  notes: string;
};

const defaultFormState: CalendarFormState = {
  label: "",
  kind: "ics-url",
  url: "",
  defaultMemberIds: [],
  notes: "",
};

export function AdminCalendarSources({ members }: AdminCalendarSourcesProps) {
  const [sources, setSources] = useLocalStorageState<CalendarSource[]>(calendarSourcesStorageKey, []);
  const [appliedEvents, setAppliedEvents] = useLocalStorageState<AppliedCalendarEvent[]>(
    appliedCalendarEventsStorageKey,
    [],
  );
  const [form, setForm] = useState(defaultFormState);
  const [previewBySource, setPreviewBySource] = useState<Record<string, CalendarPreviewResult>>({});
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);

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
      syncMode: "manual",
      defaultVisibility: form.defaultMemberIds.length > 0 ? "assigned-members" : "family",
      defaultMemberIds: form.defaultMemberIds,
      lastSyncStatus: "never",
      notes: form.notes.trim() || undefined,
    };

    setSources((current) => {
      const exists = current.some((candidate) => candidate.id === source.id);

      return exists
        ? current.map((candidate) => (candidate.id === source.id ? source : candidate))
        : [...current, source];
    });
    setForm(defaultFormState);
  }

  function toggleEnabled(sourceId: string) {
    setSources((current) =>
      current.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              enabled: !source.enabled,
            }
          : source,
      ),
    );
  }

  function removeSource(sourceId: string) {
    setSources((current) => current.filter((source) => source.id !== sourceId));
    setAppliedEvents((current) => current.filter((event) => event.sourceId !== sourceId));
    setPreviewBySource((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });
  }

  function applyPreview(source: CalendarSource) {
    const preview = previewBySource[source.id];

    if (!preview) {
      return;
    }

    const appliedAt = new Date().toISOString();
    const nextEvents = preview.events.map((event) => ({
      ...event,
      sourceLabel: source.label,
      assignedMemberIds: source.defaultMemberIds,
      appliedAt,
    }));

    setAppliedEvents((current) => [
      ...current.filter((event) => event.sourceId !== source.id),
      ...nextEvents,
    ]);
    setSources((current) =>
      current.map((candidate) =>
        candidate.id === source.id
          ? {
              ...candidate,
              lastAppliedAt: appliedAt,
              lastSyncStatus: "success",
              lastSyncMessage: `Applied ${nextEvents.length} event${nextEvents.length === 1 ? "" : "s"} to the local dashboard feed.`,
            }
          : candidate,
      ),
    );
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
          url: source.url,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Preview failed");
      }

      setPreviewBySource((current) => ({
        ...current,
        [source.id]: data as CalendarPreviewResult,
      }));
      setSources((current) =>
        current.map((candidate) =>
          candidate.id === source.id
            ? {
                ...candidate,
                lastSyncedAt: new Date().toISOString(),
                lastSyncStatus: "success",
                lastSyncMessage: `Previewed ${(data as CalendarPreviewResult).eventCount} event${(data as CalendarPreviewResult).eventCount === 1 ? "" : "s"}.`,
              }
            : candidate,
        ),
      );
    } catch (error) {
      setSources((current) =>
        current.map((candidate) =>
          candidate.id === source.id
            ? {
                ...candidate,
                lastSyncedAt: new Date().toISOString(),
                lastSyncStatus: "error",
                lastSyncMessage: error instanceof Error ? error.message : "Preview failed",
              }
            : candidate,
        ),
      );
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
          </label>

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
            <p className="text-sm text-[#4c5965]">Stored locally until Supabase persistence is added.</p>
          </div>
          <span className="text-sm font-semibold text-[#2f6f73]">
            {sources.length} source{sources.length === 1 ? "" : "s"} · {appliedEvents.length} applied event
            {appliedEvents.length === 1 ? "" : "s"}
          </span>
        </div>

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
                      {source.kind} · {source.enabled ? "enabled" : "disabled"} · {source.lastSyncStatus ?? "never"}
                    </p>
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
                      disabled={!previewBySource[source.id]}
                      onClick={() => applyPreview(source)}
                      type="button"
                    >
                      Apply
                    </button>
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#33414f]"
                      onClick={() => toggleEnabled(source.id)}
                      type="button"
                    >
                      {source.enabled ? "Disable" : "Enable"}
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
                    {previewBySource[source.id].events.map((event) => (
                      <li className="grid gap-1 border border-[#d7e0e7] bg-white px-3 py-2 text-sm" key={`${event.sourceId}-${event.sourceUid}-${event.date}-${event.startTime}-${event.title}`}>
                        <span className="font-semibold">{event.title}</span>
                        <span className="text-[#4c5965]">
                          {event.date} · {event.startTime}-{event.endTime} · {event.category}
                        </span>
                        {event.location ? <span className="text-xs text-[#657381]">{event.location}</span> : null}
                      </li>
                    ))}
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

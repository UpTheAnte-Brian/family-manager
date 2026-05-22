import fs from "node:fs";
import path from "node:path";
import ical from "node-ical";

const plannerPath = path.resolve("data/summer-2026-planner.json");
const defaultInputPath = path.resolve("imports/family-calendar.ics");
const args = parseArgs(process.argv.slice(2));
loadDotEnv(".env.local");
loadDotEnv("env.local");

const input = args.input ?? readEnvInput(args.env) ?? defaultInputPath;
const inputLabel = isUrl(input) ? input : path.resolve(input);
const source = args.source ?? inferSource(input);
const replaceSource = args.replaceSource ?? isUrl(input);

const planner = JSON.parse(fs.readFileSync(plannerPath, "utf8"));
const seasonStart = parseDateOnly(planner.season.startsOn);
const seasonEnd = endOfDay(parseDateOnly(planner.season.endsOn));
const calendarText = await readCalendarText(inputLabel);
const calendar = ical.sync.parseICS(calendarText);

const importedEvents = Object.values(calendar)
  .filter((entry) => entry.type === "VEVENT")
  .flatMap((event) => expandEvent(event, seasonStart, seasonEnd))
  .map((event) => toFixedEvent(event, source))
  .filter(Boolean);

const existingEvents = replaceSource
  ? planner.fixedEvents.filter(
      (event) =>
        event.source !== source ||
        !isWithinImportedWindow(event.date, planner.season.startsOn, planner.season.endsOn),
    )
  : planner.fixedEvents;
const existingById = new Map(existingEvents.map((event) => [event.id, event]));

for (const event of importedEvents) {
  existingById.set(event.id, event);
}

planner.fixedEvents = [...existingById.values()].sort(compareFixedEvents);
planner.calendarSources = planner.calendarSources.map((calendarSource) =>
  calendarSource.id === source
    ? {
        ...calendarSource,
        status: "active",
        notes: `Imported from ${sourceDescription(inputLabel)}.`,
      }
    : calendarSource,
);

if (!planner.calendarSources.some((calendarSource) => calendarSource.id === source)) {
  planner.calendarSources.push({
    id: source,
    label: toTitle(source),
    status: "active",
    notes: `Imported from ${sourceDescription(inputLabel)}.`,
  });
}

fs.writeFileSync(plannerPath, `${JSON.stringify(planner, null, 2)}\n`);

console.log(`Imported ${importedEvents.length} fixed events from ${sourceDescription(inputLabel)}`);
console.log(`Source: ${source}${replaceSource ? " (replaced existing source events)" : ""}`);
console.log(`Updated ${plannerPath}`);

async function readCalendarText(inputValue) {
  if (isUrl(inputValue)) {
    const response = await fetch(toFetchUrl(inputValue));

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar URL: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  if (!fs.existsSync(inputValue)) {
    console.error(`Missing ICS file: ${inputValue}`);
    console.error("Export a calendar from Apple Calendar and save it there, or pass a file path.");
    process.exit(1);
  }

  return fs.readFileSync(inputValue, "utf8");
}

function expandEvent(event, startsOn, endsOn) {
  const durationMs = event.end && event.start ? event.end.getTime() - event.start.getTime() : 0;

  if (!event.rrule) {
    return overlapsWindow(event.start, event.end, startsOn, endsOn) ? [event] : [];
  }

  const recurrenceDates = event.rrule.between(startsOn, endsOn, true);

  return recurrenceDates.map((start) => ({
    ...event,
    start,
    end: new Date(start.getTime() + durationMs),
    recurrenceid: start,
  }));
}

function toFixedEvent(event, source) {
  if (!event.start || !event.summary) {
    return null;
  }

  const start = event.start;
  const end = event.end ?? event.start;
  const allDay = isAllDay(event);
  const date = formatDate(start);
  const title = String(event.summary).trim();

  return {
    id: makeId(source, event.uid, date, formatTime(start), title),
    source,
    sourceUid: event.uid,
    date,
    startTime: allDay ? "00:00" : formatTime(start),
    endTime: allDay ? "23:59" : formatTime(end),
    title,
    category: inferCategory(title),
    calendarBehavior: "fixed",
    ...(event.location ? { locationNote: String(event.location) } : {}),
  };
}

function overlapsWindow(start, end, windowStart, windowEnd) {
  if (!start) {
    return false;
  }

  const effectiveEnd = end ?? start;
  return start <= windowEnd && effectiveEnd >= windowStart;
}

function isAllDay(event) {
  if (event.datetype === "date") {
    return true;
  }

  const start = event.start;
  const end = event.end;

  return (
    start instanceof Date &&
    end instanceof Date &&
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getTime() - start.getTime() >= 24 * 60 * 60 * 1000
  );
}

function inferCategory(title) {
  const normalized = title.toLowerCase();

  if (normalized.includes("birthday")) return "birthday";
  if (normalized.includes("doctor") || normalized.includes("dentist")) return "appointment";
  if (normalized.includes("soccer") || normalized.includes("select") || normalized.includes("u9")) return "sports";
  if (normalized.includes("school") || normalized.includes("camp")) return "school-camp";
  if (normalized.includes("bill")) return "admin";

  return "family-calendar";
}

function inferSource(inputValue) {
  if (isUrl(inputValue)) {
    return "sportsengine-calendar";
  }

  const filename = path.basename(inputValue, path.extname(inputValue)).toLowerCase();

  if (filename.includes("family")) {
    return "family-calendar";
  }

  return `${slugify(filename)}-calendar`;
}

function makeId(source, uid, date, time, title) {
  return slugify([source, uid ?? title, date, time].join("-"));
}

function compareFixedEvents(a, b) {
  return `${a.date} ${a.startTime} ${a.title}`.localeCompare(`${b.date} ${b.startTime} ${b.title}`);
}

function isWithinImportedWindow(date, startsOn, endsOn) {
  return date >= startsOn && date <= endsOn;
}

function parseArgs(values) {
  const parsed = {
    input: undefined,
    source: undefined,
    env: undefined,
    replaceSource: undefined,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--source") {
      parsed.source = values[index + 1];
      index += 1;
    } else if (value === "--env") {
      parsed.env = values[index + 1];
      index += 1;
    } else if (value === "--replace-source") {
      parsed.replaceSource = true;
    } else if (value === "--merge-source") {
      parsed.replaceSource = false;
    } else if (!parsed.input) {
      parsed.input = value;
    }
  }

  return parsed;
}

function readEnvInput(envKey) {
  if (!envKey) {
    return undefined;
  }

  if (!process.env[envKey]) {
    console.error(`Missing ${envKey}. Add it to .env.local or pass an ICS URL/file path.`);
    process.exit(1);
  }

  return process.env[envKey];
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function isUrl(value) {
  return /^https?:\/\//i.test(value) || /^webcal:\/\//i.test(value);
}

function toFetchUrl(value) {
  return value.replace(/^webcal:\/\//i, "https://");
}

function sourceDescription(value) {
  if (isUrl(value)) {
    return "subscription URL";
  }

  return path.basename(value);
}

function parseDateOnly(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function toTitle(value) {
  if (value === "sportsengine-calendar") {
    return "SportsEngine Calendar";
  }

  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

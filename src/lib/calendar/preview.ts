import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type AddressResolver = (hostname: string) => Promise<string[]>;

const maxCalendarBytes = 5 * 1024 * 1024;
const maxRedirects = 2;

export function getCalendarImportStartsOn(seasonStartsOn: string) {
  const [year, month] = seasonStartsOn.split("-").map(Number);
  const startsOn = new Date(year, month - 2, 1);

  return `${startsOn.getFullYear()}-${String(startsOn.getMonth() + 1).padStart(2, "0")}-01`;
}

export function compactIcsCalendarForImport(
  calendarText: string,
  window: { startsOn: string; endsOn: string },
) {
  const lines = unfoldIcsLines(calendarText);
  const outputLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.toUpperCase() !== "BEGIN:VEVENT") {
      outputLines.push(line);
      continue;
    }

    const eventLines = [line];

    while (index + 1 < lines.length) {
      index += 1;
      eventLines.push(lines[index]);

      if (lines[index].toUpperCase() === "END:VEVENT") {
        break;
      }
    }

    if (shouldKeepEventForImport(eventLines, window)) {
      outputLines.push(...eventLines);
    }
  }

  return outputLines.join("\r\n");
}

export function looksLikeIcsCalendar(calendarText: string) {
  return /BEGIN:VCALENDAR/i.test(calendarText) && /END:VCALENDAR/i.test(calendarText);
}

export async function fetchCalendarText(initialUrl: string) {
  let fetchUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(fetchUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });

    if (isRedirect(response.status)) {
      if (redirectCount === maxRedirects) {
        throw new Error("Calendar fetch redirected too many times.");
      }

      const location = response.headers.get("location");
      const redirectedUrl = location ? await getAllowedCalendarFetchUrl(location, fetchUrl) : null;

      if (!redirectedUrl) {
        throw new Error("Calendar fetch redirected to an unsupported URL.");
      }

      fetchUrl = redirectedUrl;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Calendar fetch failed: ${response.status} ${response.statusText}`);
    }

    return readBoundedResponseText(response, maxCalendarBytes);
  }

  throw new Error("Calendar fetch redirected too many times.");
}

export async function getAllowedCalendarFetchUrl(
  value: string | undefined,
  baseUrl?: string,
  resolveAddresses: AddressResolver = resolveHostname,
) {
  if (!value) {
    return null;
  }

  try {
    const normalized = value.replace(/^webcal:\/\//i, "https://");
    const parsed = baseUrl ? new URL(normalized, baseUrl) : new URL(normalized);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    if (parsed.username || parsed.password) {
      return null;
    }

    if (await isPrivateCalendarHost(parsed.hostname, resolveAddresses)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function unfoldIcsLines(calendarText: string) {
  const rawLines = calendarText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    if (/^[ \t]/.test(rawLine) && lines.length > 0) {
      lines[lines.length - 1] += rawLine.slice(1);
      continue;
    }

    lines.push(rawLine);
  }

  return lines;
}

function shouldKeepEventForImport(
  eventLines: string[],
  window: { startsOn: string; endsOn: string },
) {
  if (eventLines.some((line) => /^RRULE[:;]/i.test(line) || /^RDATE[:;]/i.test(line))) {
    return true;
  }

  const startDate = getIcsPropertyDate(eventLines, "DTSTART");

  if (!startDate) {
    return true;
  }

  const endDate = getIcsPropertyDate(eventLines, "DTEND") ?? startDate;

  return startDate <= window.endsOn && endDate >= window.startsOn;
}

function getIcsPropertyDate(eventLines: string[], propertyName: string) {
  const line = eventLines.find((candidate) => {
    const upperCandidate = candidate.toUpperCase();

    return upperCandidate.startsWith(`${propertyName}:`) || upperCandidate.startsWith(`${propertyName};`);
  });

  if (!line) {
    return null;
  }

  const value = line.split(":").slice(1).join(":");
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

async function readBoundedResponseText(response: Response, maxBytes: number) {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    bytesRead += value.byteLength;

    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new Error(
        "Calendar response is too large. Use a smaller dedicated shared calendar, or remove old history from this calendar feed.",
      );
    }

    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());

  return chunks.join("");
}

function isRedirect(status: number) {
  return status >= 300 && status < 400;
}

async function isPrivateCalendarHost(hostname: string, resolveAddresses: AddressResolver) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host === "::1"
  ) {
    return true;
  }

  if (isIP(host)) {
    return isBlockedIpAddress(host);
  }

  const addresses = await resolveAddresses(host);

  return addresses.some(isBlockedIpAddress);
}

async function resolveHostname(hostname: string) {
  const addresses = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  return addresses.map((address) => address.address);
}

function isBlockedIpAddress(address: string) {
  if (isIPv4MappedAddress(address)) {
    return isBlockedIpAddress(address.split(":").at(-1) ?? "");
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();

    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  const octets = address.split(".").map(Number);

  const [first, second] = octets;

  return (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255) ||
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0) ||
    first >= 224
  );
}

function isIPv4MappedAddress(address: string) {
  return address.toLowerCase().startsWith("::ffff:");
}

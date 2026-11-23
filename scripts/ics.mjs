const encoder = new TextEncoder();

export const COLUMNS = [
  "id",
  "title",
  "date",
  "start_time",
  "end_time",
  "venue",
  "district",
  "category",
  "is_free",
  "indoor_outdoor",
  "image_url",
  "description",
  "programme",
];

export const DISTRICTS = [
  "Kaštel Novi",
  "Kaštel Stari",
  "Kaštel Lukšić",
  "Kaštel Kambelovac",
  "Kaštel Gomilica",
  "Kaštel Sućurac",
];

export const CATEGORIES = [
  "Glazba",
  "Djeca",
  "Predstava",
  "Gastro",
  "Kultura",
  "Sport i rekreacija",
  "Tradicionalno",
];

export const INDOOR = ["Vanjski prostor", "Natkriveno", "Kombinirano"];

const ID_RE = /^[a-z0-9][a-z0-9-]{2,80}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseCsv(text) {
  const source = String(text).replace(/^\uFEFF/, "");
  const comma = parseDelimited(source, ",");
  if (headerLooksRight(comma[0])) return comma;
  const semi = parseDelimited(source, ";");
  if (headerLooksRight(semi[0])) return semi;
  return comma;
}

function headerLooksRight(header) {
  return Array.isArray(header) && header[0] === "id" && header.includes("title") && header.includes("date");
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (inQuotes) {
    row.push(field);
    rows.push(row);
  } else if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells, index) => cells.some((cell) => cell.trim() !== "") || index === 0);
}

export function addDays(date, days) {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Neispravan datum: ${date}`);
  const stamp = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  stamp.setUTCDate(stamp.getUTCDate() + days);
  const month = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  const day = String(stamp.getUTCDate()).padStart(2, "0");
  return `${stamp.getUTCFullYear()}-${month}-${day}`;
}

export function isRealDate(value) {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const stamp = new Date(Date.UTC(year, month - 1, day));
  return stamp.getUTCFullYear() === year && stamp.getUTCMonth() === month - 1 && stamp.getUTCDate() === day;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function resolveSpan(date, start, end) {
  const [startHour, startMinute] = start.split(":").map(Number);
  if (!end) {
    const total = startHour * 60 + startMinute + 120;
    const extraDays = Math.floor(total / 1440);
    const minutes = total % 1440;
    return {
      end_time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
      end_date: extraDays ? addDays(date, extraDays) : date,
      end_inferred: true,
    };
  }
  const [endHour, endMinute] = end.split(":").map(Number);
  const overflows = endHour * 60 + endMinute < startHour * 60 + startMinute;
  return {
    end_time: end,
    end_date: overflows ? addDays(date, 1) : date,
    end_inferred: false,
  };
}

export function validateEvents(rows) {
  const errors = [];
  const events = [];
  const seen = new Set();

  if (!rows.length) {
    return { events, errors: ["CSV je prazan."] };
  }

  const header = rows[0].map((cell) => cell.trim());
  if (header.length !== COLUMNS.length || header.some((cell, index) => cell !== COLUMNS[index])) {
    errors.push(`Zaglavlje mora biti točno: ${COLUMNS.join(",")}`);
  }

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    if (cells.length !== COLUMNS.length) {
      errors.push(`Red ${line}: očekujem ${COLUMNS.length} stupaca, a ima ${cells.length}.`);
      return;
    }
    const raw = Object.fromEntries(COLUMNS.map((key, column) => [key, cells[column].trim()]));
    const problems = [];

    if (!ID_RE.test(raw.id)) problems.push("id mora biti malim slovima, brojkama i crticama (npr. kastela-2026-001)");
    if (seen.has(raw.id)) problems.push(`id ${raw.id} već postoji`);
    seen.add(raw.id);
    if (!raw.title) problems.push("nedostaje title");
    if (!isRealDate(raw.date)) problems.push("date mora biti stvarni datum YYYY-MM-DD");
    if (!TIME_RE.test(raw.start_time)) problems.push("start_time mora biti HH:MM");
    if (raw.end_time && !TIME_RE.test(raw.end_time)) problems.push("end_time mora biti HH:MM ili prazan");
    if (raw.end_time && raw.end_time === raw.start_time) problems.push("end_time ne može biti isti kao start_time");
    if (!raw.venue) problems.push("nedostaje venue");
    if (!DISTRICTS.includes(raw.district)) problems.push(`district mora biti jedno od: ${DISTRICTS.join(", ")}`);
    if (!CATEGORIES.includes(raw.category)) problems.push(`category mora biti jedno od: ${CATEGORIES.join(", ")}`);
    if (raw.is_free !== "true" && raw.is_free !== "false") problems.push("is_free mora biti true ili false");
    if (!INDOOR.includes(raw.indoor_outdoor)) problems.push(`indoor_outdoor mora biti: ${INDOOR.join(", ")}`);
    if (raw.image_url && (/\s/.test(raw.image_url) || /[<>]/.test(raw.image_url))) {
      problems.push("image_url nije valjan");
    }
    if (!raw.description) problems.push("nedostaje description");
    if (raw.programme.length > 80 || /[\u0000-\u001f]/.test(raw.programme)) {
      problems.push("programme može imati najviše 80 znakova");
    }

    if (problems.length) {
      problems.forEach((problem) => errors.push(`Red ${line}: ${problem}.`));
      return;
    }

    const span = resolveSpan(raw.date, raw.start_time, raw.end_time);
    events.push({
      ...raw,
      is_free: raw.is_free === "true",
      end_time: span.end_time,
      end_date: span.end_date,
      end_inferred: span.end_inferred,
      line,
    });
  });

  return { events, errors };
}

function escapeText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function fold(line) {
  const parts = [];
  let current = "";
  let currentBytes = 0;
  let first = true;

  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = first ? 75 : 74;
    if (current && currentBytes + size > limit) {
      parts.push(first ? current : ` ${current}`);
      first = false;
      current = char;
      currentBytes = size;
    } else {
      current += char;
      currentBytes += size;
    }
  }
  if (current) parts.push(first ? current : ` ${current}`);
  return parts.join("\r\n");
}

function stampUtc(date) {
  const padUtc = (value) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${padUtc(date.getUTCMonth() + 1)}${padUtc(date.getUTCDate())}` +
    `T${padUtc(date.getUTCHours())}${padUtc(date.getUTCMinutes())}${padUtc(date.getUTCSeconds())}Z`
  );
}

function icsStamp(date, time) {
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

function eventDescription(event) {
  return [
    event.description,
    `Kategorija: ${event.category}`,
    event.is_free ? "Ulaz slobodan" : "Ulaz se naplaćuje",
    event.indoor_outdoor,
    `${event.venue}, ${event.district}`,
  ].join("\n");
}

export function eventsToIcs(events, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//kastela.live//Dogadanja//HR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.calName || "Događanja u Kaštelima")}`,
    "X-WR-TIMEZONE:Europe/Zagreb",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Zagreb",
    "X-LIC-LOCATION:Europe/Zagreb",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  const ordered = [...events].sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`) || a.id.localeCompare(b.id));
  for (const event of ordered) {
    const pageUrl = options.pageUrl ? new URL(`#${event.id}`, options.pageUrl).href : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@kastela.live`,
      `DTSTAMP:${stampUtc(now)}`,
      `DTSTART;TZID=Europe/Zagreb:${icsStamp(event.date, event.start_time)}`,
      `DTEND;TZID=Europe/Zagreb:${icsStamp(event.end_date, event.end_time)}`,
      `SUMMARY:${escapeText(event.title)}`,
      `LOCATION:${escapeText(`${event.venue}, ${event.district}`)}`,
      `DESCRIPTION:${escapeText(eventDescription(event))}`,
    );
    if (pageUrl) lines.push(`URL:${escapeText(pageUrl)}`);
    lines.push(
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`Podsjetnik: ${event.title}`)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

const HOUR = 60 * 60 * 1000;

export function zagrebLocalToUtc(dateStr, timeStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wanted;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zagreb",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const shown = Date.UTC(Number(bag.year), Number(bag.month) - 1, Number(bag.day), Number(bag.hour), Number(bag.minute));
    const delta = wanted - shown;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

export function eventStartUtc(event) {
  return zagrebLocalToUtc(event.date, event.start_time);
}

export function reminderInstant(event) {
  return new Date(eventStartUtc(event).getTime() - 8 * HOUR);
}

export function scheduleDecision(event, now = new Date()) {
  const start = eventStartUtc(event);
  const when = new Date(start.getTime() - 8 * HOUR);
  if (start.getTime() <= now.getTime()) {
    return { ok: false, code: "past", message: "Događaj je već prošao." };
  }
  if (when.getTime() < now.getTime()) {
    return {
      ok: false,
      code: "late",
      message: "Za ovaj događaj više nije moguće aktivirati podsjetnik. Ostalo je manje od 8 sati.",
    };
  }
  return { ok: true, scheduled_at: when.toISOString(), start: start.toISOString() };
}

export function formatZagreb(iso) {
  return new Intl.DateTimeFormat("hr-HR", {
    timeZone: "Europe/Zagreb",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

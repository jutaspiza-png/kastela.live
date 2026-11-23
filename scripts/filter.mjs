import { addDays } from "./ics.mjs";

export function zagrebNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${bag.year}-${bag.month}-${bag.day}`, time: `${bag.hour}:${bag.minute}` };
}

export function foldText(value) {
  return String(value)
    .toLocaleLowerCase("hr")
    .replaceAll("đ", "d")
    .replaceAll("dj", "d")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function isoWeekday(date) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function weekendDates(today) {
  const weekday = isoWeekday(today);
  const saturday = addDays(today, 6 - weekday);
  return [saturday, addDays(saturday, 1)];
}

function stamp(date, time) {
  return `${date.replaceAll("-", "")}${time.replace(":", "")}`;
}

export function isPast(event, now) {
  return stamp(event.end_date, event.end_time) <= stamp(now.date, now.time);
}

export function filterEvents(events, criteria, now) {
  const query = foldText(criteria.query || "").trim();
  const weekend = weekendDates(now.date);
  return events.filter((event) => {
    if (!criteria.showPast && isPast(event, now)) return false;
    if (criteria.district && criteria.district !== "all" && event.district !== criteria.district) return false;
    if (criteria.category && criteria.category !== "all" && event.category !== criteria.category) return false;
    if (criteria.freeOnly && !event.is_free) return false;
    if (criteria.period === "today" && event.date !== now.date) return false;
    if (criteria.period === "tomorrow" && event.date !== addDays(now.date, 1)) return false;
    if (criteria.period === "weekend" && !weekend.includes(event.date)) return false;
    if (criteria.eveningOnly && (event.date !== now.date || event.start_time < "17:00")) return false;
    if (!query) return true;
    const haystack = foldText([event.title, event.venue, event.district, event.category, event.description].join(" "));
    return haystack.includes(query);
  });
}

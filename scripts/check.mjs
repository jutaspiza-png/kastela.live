import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORIES, DISTRICTS, eventsToIcs, parseCsv, resolveSpan, validateEvents } from "./ics.mjs";
import { filterEvents, foldText, weekendDates } from "./filter.mjs";

const csv = readFileSync(new URL("../data/events.csv", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const { events, errors } = validateEvents(parseCsv(csv));

assert.equal(errors.length, 0, errors.join("\n"));
assert.equal(events.length, 30);

for (const district of DISTRICTS) assert.ok(html.includes(district), `index.html nema ${district}`);
for (const category of CATEGORIES) assert.ok(html.includes(category), `index.html nema ${category}`);
for (const event of events) {
  assert.ok(DISTRICTS.includes(event.district), event.district);
  assert.ok(CATEGORIES.includes(event.category), event.category);
}

const stela = events.find((event) => event.id === "kastela-2026-001");
assert.equal(stela.title, "Stela Rade");
assert.equal(stela.date, "2026-12-05");
assert.equal(stela.end_inferred, true);
assert.equal(stela.end_time, "23:00");
assert.equal(stela.venue, "Novi park");
assert.equal(stela.district, "Kaštel Lukšić");

const candle = events.find((event) => event.id === "kastela-2026-002");
assert.equal(candle.title, "Paljenje 2. adventske svijeće");
assert.equal(candle.venue, "Đardin");
assert.equal(candle.district, "Kaštel Novi");
assert.equal(candle.end_time, "20:00");

const vuco = events.find((event) => event.id === "kastela-2026-029");
assert.equal(vuco.end_inferred, true);
assert.equal(vuco.end_time, "00:00");
assert.equal(vuco.end_date, "2027-01-01");
assert.deepEqual(resolveSpan("2026-12-31", "23:30", ""), { end_time: "01:30", end_date: "2027-01-01", end_inferred: true });

const adventSaturday = { date: "2026-12-05", time: "12:00" };
assert.deepEqual(weekendDates("2026-11-23"), ["2026-11-28", "2026-11-29"]);
assert.deepEqual(weekendDates(adventSaturday.date), ["2026-12-05", "2026-12-06"]);

const today = filterEvents(events, { period: "today" }, adventSaturday).map((event) => event.id);
assert.deepEqual(today.sort(), ["kastela-2026-001", "kastela-2026-002"]);

const evening = filterEvents(events, { eveningOnly: true }, adventSaturday).map((event) => event.id);
assert.deepEqual(evening.sort(), ["kastela-2026-001", "kastela-2026-002"]);

const tomorrow = filterEvents(events, { period: "tomorrow" }, adventSaturday).map((event) => event.id);
assert.deepEqual(tomorrow, ["kastela-2026-003"]);

const weekend = filterEvents(events, { period: "weekend" }, adventSaturday);
assert.ok(weekend.every((event) => event.date === "2026-12-05" || event.date === "2026-12-06"));
assert.equal(weekend.length, 3);

const kids = filterEvents(events, { category: "Djeca" }, adventSaturday);
assert.ok(kids.every((event) => event.category === "Djeca"));
assert.ok(kids.some((event) => event.id === "kastela-2026-004"));

const freeNovi = filterEvents(events, { district: "Kaštel Novi", freeOnly: true }, adventSaturday);
assert.deepEqual(freeNovi.map((event) => event.id), ["kastela-2026-002", "kastela-2026-010", "kastela-2026-022"]);

const search = filterEvents(events, { query: "djardin" }, adventSaturday);
assert.ok(search.every((event) => event.venue === "Đardin"));
assert.equal(search.length, 3);
assert.equal(foldText("Đardin"), "dardin");

const beforeSeason = filterEvents(events, {}, { date: "2026-11-23", time: "13:30" });
assert.equal(beforeSeason.length, 30);

const afterSeason = filterEvents(events, {}, { date: "2027-01-03", time: "10:00" });
assert.equal(afterSeason.length, 0);
const withPast = filterEvents(events, { showPast: true }, { date: "2027-01-03", time: "10:00" });
assert.equal(withPast.length, 30);

const late = filterEvents(events, { period: "today" }, { date: "2026-12-05", time: "23:00" });
assert.deepEqual(late, []);

const ics = eventsToIcs(events, { now: new Date("2026-11-23T12:00:00Z") });
assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
assert.equal(ics.replaceAll("\r\n", "").includes("\n"), false);
assert.equal(ics.replaceAll("\r\n", "").includes("\r"), false);
for (const line of ics.split("\r\n").filter(Boolean)) {
  assert.ok(Buffer.byteLength(line) <= 75, `predugačak red (${Buffer.byteLength(line)}): ${line.slice(0, 40)}`);
}
assert.equal(ics.includes("TZID:Europe/Zagreb"), true);
assert.equal((ics.match(/^BEGIN:VEVENT/gm) || []).length, events.length);
assert.equal((ics.match(/^BEGIN:VALARM/gm) || []).length, events.length);
assert.equal(ics.includes("DTSTART;TZID=Europe/Zagreb:20261205T210000"), true);
assert.equal(ics.includes("DTEND;TZID=Europe/Zagreb:20261205T230000"), true);
assert.equal(ics.includes("DTSTART;TZID=Europe/Zagreb:20261205T180000"), true);
assert.equal(ics.includes("DTEND;TZID=Europe/Zagreb:20261205T200000"), true);
assert.equal(ics.includes("DTSTART;TZID=Europe/Zagreb:20261231T220000"), true);
assert.equal(ics.includes("DTEND;TZID=Europe/Zagreb:20270101T000000"), true);
assert.equal(ics.includes("UID:kastela-2026-001@kastela.live"), true);
assert.equal(ics.includes("SUMMARY:Stela Rade"), true);
assert.equal(ics.includes("LOCATION:Đardin\\, Kaštel Novi"), true);
const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);
assert.equal(new Set(uids).size, uids.length);

const semi = validateEvents(parseCsv("id;title;date;start_time;end_time;venue;district;category;is_free;indoor_outdoor;image_url;description\nkastela-2026-900;Proba;2026-12-01;18:00;;Riva;Kaštel Novi;Glazba;true;Vanjski prostor;;Kratko.\n"));
assert.equal(semi.errors.length, 0);
assert.equal(semi.events[0].end_time, "20:00");

const broken = validateEvents(parseCsv(`${csv.trim()}\nkastela-2026-002,Duplikat,2026-12-01,18:00,19:00,Riva,Kaštel,Glazba,maybe,Vani,,\n`));
assert.ok(broken.errors.some((error) => error.includes("već postoji")));
assert.ok(broken.errors.some((error) => error.includes("district")));
assert.ok(broken.errors.some((error) => error.includes("is_free")));

const badHeader = validateEvents(parseCsv("id,title\n"));
assert.ok(badHeader.errors.length > 0);

console.log(`check: ${events.length} događanja, ICS ${Buffer.byteLength(ics)} bajtova`);

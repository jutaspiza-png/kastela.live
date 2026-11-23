import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { foldText } from "./filter.mjs";
import { loadEvents, writeCalendar } from "./generate-ics.mjs";
import { eventsToIcs } from "./ics.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = resolve(root, "_site");

const events = loadEvents(resolve(root, "data/events.csv"));
writeCalendar(events, resolve(root, "calendar.ics"));

rmSync(site, { recursive: true, force: true });
mkdirSync(resolve(site, "scripts"), { recursive: true });
mkdirSync(resolve(site, "data"), { recursive: true });

for (const file of ["index.html", "styles.css", "app.js", "calendar.ics", "manifest.webmanifest", "sw.js"]) {
  cpSync(resolve(root, file), resolve(site, file));
}
cpSync(resolve(root, "data/events.csv"), resolve(site, "data/events.csv"));
cpSync(resolve(root, "scripts/ics.mjs"), resolve(site, "scripts/ics.mjs"));
cpSync(resolve(root, "scripts/filter.mjs"), resolve(site, "scripts/filter.mjs"));
for (const directory of ["assets", "fonts", "vendor"]) {
  cpSync(resolve(root, directory), resolve(site, directory), { recursive: true });
}

const eventDir = resolve(site, "events");
const programmeDir = resolve(site, "programmes");
mkdirSync(eventDir, { recursive: true });
mkdirSync(programmeDir, { recursive: true });
const programmes = new Map();
for (const event of events) {
  writeFileSync(resolve(eventDir, `${event.id}.ics`), eventsToIcs([event], { calName: event.title }));
  if (!event.programme) continue;
  const list = programmes.get(event.programme) || [];
  list.push(event);
  programmes.set(event.programme, list);
}
for (const [name, list] of programmes) {
  const slug = foldText(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kalendar";
  writeFileSync(resolve(programmeDir, `${slug}.ics`), eventsToIcs(list, { calName: name }));
}

console.log(`_site: ${events.length} događanja`);

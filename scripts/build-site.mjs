import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEvents, writeCalendar } from "./generate-ics.mjs";

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

console.log(`_site: ${events.length} događanja`);

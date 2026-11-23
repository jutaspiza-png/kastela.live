import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { eventsToIcs, parseCsv, validateEvents } from "./ics.mjs";

export function loadEvents(csvPath = resolve("data/events.csv")) {
  const text = readFileSync(csvPath, "utf8");
  const { events, errors } = validateEvents(parseCsv(text));
  if (errors.length) {
    const error = new Error(errors.join("\n"));
    error.errors = errors;
    throw error;
  }
  return events;
}

export function writeCalendar(events, destination = resolve("calendar.ics"), options = {}) {
  const ics = eventsToIcs(events, options);
  writeFileSync(destination, ics);
  return ics;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    const events = loadEvents();
    writeCalendar(events);
    console.log(`calendar.ics: ${events.length} događanja`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

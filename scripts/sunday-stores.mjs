// Ponedjeljkom: otvori data/sunday-stores.json, upiši weekOf (ponedjeljak),
// sunday (nedjelja tog tjedna), lastUpdated i satnice s Tommy/Ribola stranica.
// Pokreni: node scripts/sunday-stores.mjs
import { readFileSync } from "node:fs";
import { addDays } from "./ics.mjs";
import { isoWeekday, zagrebNow } from "./filter.mjs";

const CITIES = ["Kaštela", "Split", "Solin", "Trogir"];
const CHAINS = ["Tommy", "Ribola"];
const HOURS = /^([01]\d|2[0-3]):[0-5]\d–([01]\d|2[0-3]):[0-5]\d$/;

export function mondayOf(date) {
  return addDays(date, 1 - isoWeekday(date));
}

export function sundayOf(date) {
  return addDays(mondayOf(date), 6);
}

export function validateSundayStores(data) {
  const errors = [];
  if (mondayOf(data.weekOf) !== data.weekOf) errors.push("weekOf mora biti ponedjeljak");
  if (data.sunday !== addDays(data.weekOf, 6)) errors.push("sunday mora biti nedjelja tog tjedna");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.lastUpdated || "")) errors.push("lastUpdated nije datum");
  if (!Array.isArray(data.stores) || !data.stores.length) errors.push("nema poslovnica");
  const ids = new Set();
  for (const store of data.stores || []) {
    if (ids.has(store.id)) errors.push(`dupli id ${store.id}`);
    ids.add(store.id);
    if (!CHAINS.includes(store.chain)) errors.push(`${store.id}: lanac`);
    if (!CITIES.includes(store.city)) errors.push(`${store.id}: grad`);
    if (!store.address) errors.push(`${store.id}: adresa`);
    if (store.city === "Kaštela" && !String(store.district || "").startsWith("Kaštel")) errors.push(`${store.id}: naselje`);
    if (store.open) {
      if (!HOURS.test(store.hours || "")) errors.push(`${store.id}: radno vrijeme`);
    } else if (store.hours != null) {
      errors.push(`${store.id}: zatvorena poslovnica nema satnicu`);
    }
  }
  return errors;
}

if (process.argv[1]?.endsWith("sunday-stores.mjs")) {
  const file = new URL("../data/sunday-stores.json", import.meta.url);
  const data = JSON.parse(readFileSync(file, "utf8"));
  const errors = validateSundayStores(data);
  const today = zagrebNow().date;
  const monday = mondayOf(today);
  const sunday = sundayOf(today);
  const open = data.stores.filter((store) => store.open).length;
  console.log(`Datoteka: tjedan ${data.weekOf}, nedjelja ${data.sunday}, ažurirano ${data.lastUpdated}.`);
  console.log(`Poslovnice: ${data.stores.length}, otvorene ove nedjelje: ${open}.`);
  console.log(`Danas ${today}. Ponedjeljni update je za nedjelju ${sunday} (tjedan od ${monday}).`);
  if (data.weekOf !== monday) console.log("Datoteka nije za tekući tjedan. Uredi data/sunday-stores.json.");
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
}

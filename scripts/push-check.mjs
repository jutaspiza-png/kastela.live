import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatZagreb, reminderInstant, scheduleDecision, zagrebLocalToUtc } from "./push-time.mjs";
import {
  activateReminder,
  claimDue,
  deactivateReminder,
  emptyStore,
  markFailed,
  markSent,
  saveStore,
  loadStore,
  syncWithEvents,
  reminderPayload,
  upsertSubscription,
  withStore,
} from "./push-store.mjs";
import { dispatchAllowed, siteOrigin } from "./push-api.mjs";

const winter = zagrebLocalToUtc("2026-12-05", "20:00");
assert.equal(winter.toISOString(), "2026-12-05T19:00:00.000Z");
assert.equal(formatZagreb(reminderInstant({ date: "2026-12-05", start_time: "20:00" }).toISOString()), formatZagreb("2026-12-05T11:00:00.000Z"));
assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(reminderInstant({ date: "2026-12-05", start_time: "20:00" })), "12:00");

const summer = zagrebLocalToUtc("2026-07-04", "20:00");
assert.equal(summer.toISOString(), "2026-07-04T18:00:00.000Z");
assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(reminderInstant({ date: "2026-07-04", start_time: "20:00" })), "12:00");

const early = { id: "e1", title: "Proba", date: "2026-12-05", start_time: "06:00", venue: "Riva", district: "Kaštel Novi" };
assert.equal(reminderInstant(early).toISOString(), "2026-12-04T21:00:00.000Z");

const event = { id: "e1", title: "Stela Rade", date: "2026-12-05", start_time: "21:00", venue: "Novi park", district: "Kaštel Lukšić", image_url: "" };
const noon = new Date("2026-12-01T10:00:00.000Z");
assert.equal(scheduleDecision(event, noon).ok, true);
assert.equal(scheduleDecision(event, new Date("2026-12-05T13:00:00.000Z")).code, "late");
assert.equal(scheduleDecision(event, new Date("2026-12-05T21:00:00.000Z")).code, "past");

const store = emptyStore();
const sub = upsertSubscription(store, { endpoint: "https://fcm.googleapis.com/fcm/send/device", p256dh: "key", auth: "secret" }, noon);
assert.equal(sub.ok, true);
const first = activateReminder(store, { endpoint: sub.subscription.endpoint, auth: "secret", event, now: noon });
const second = activateReminder(store, { endpoint: sub.subscription.endpoint, auth: "secret", event, now: noon });
assert.equal(first.ok, true);
assert.equal(second.already, true);
assert.equal(store.reminders.filter((item) => item.status === "pending").length, 1);
const other = activateReminder(store, { endpoint: sub.subscription.endpoint, auth: "secret", event: { ...event, id: "e2", title: "Drugi" }, now: noon });
assert.equal(other.ok, true);
assert.equal(store.reminders.filter((item) => item.status === "pending").length, 2);

const moved = { ...event, start_time: "18:00" };
syncWithEvents(store, [moved, { ...event, id: "e2", title: "Drugi" }], noon);
assert.equal(store.reminders.find((item) => item.event_id === "e1").scheduled_at, reminderInstant(moved).toISOString());

syncWithEvents(store, [{ ...event, id: "e2", title: "Drugi" }], noon);
const cancelled = store.reminders.find((item) => item.event_id === "e1");
assert.equal(cancelled.status, "cancelled");

const dueNow = new Date(reminderInstant({ ...event, id: "e2" }).getTime() + 1000);
const due = claimDue(store, [{ ...event, id: "e2", title: "Drugi" }], dueNow);
assert.equal(due.length, 1);
assert.equal(due[0].reminder.status, "sending");
const again = claimDue(store, [{ ...event, id: "e2", title: "Drugi" }], dueNow);
assert.equal(again.length, 0);
markSent(store, due[0].reminder.id, dueNow);
assert.equal(store.reminders.find((item) => item.event_id === "e2").status, "sent");

const failing = activateReminder(store, { endpoint: sub.subscription.endpoint, auth: "secret", event: { ...event, id: "e3" }, now: noon });
markFailed(store, failing.reminder.id, { statusCode: 410, message: "gone" }, noon);
assert.equal(store.subscriptions[0].status, "gone");
assert.equal(activateReminder(store, { endpoint: sub.subscription.endpoint, auth: "secret", event, now: noon }).status, 401);

upsertSubscription(store, { endpoint: "https://fcm.googleapis.com/fcm/send/device", p256dh: "key", auth: "secret" }, noon);
activateReminder(store, { endpoint: "https://fcm.googleapis.com/fcm/send/device", auth: "secret", event, now: noon });
assert.equal(deactivateReminder(store, { endpoint: "https://fcm.googleapis.com/fcm/send/device", auth: "secret", eventId: "e1", now: noon }).changed, true);
assert.equal(store.reminders.find((item) => item.event_id === "e1" && item.status === "pending"), undefined);

const dueStore = emptyStore();
upsertSubscription(dueStore, { endpoint: "https://fcm.googleapis.com/fcm/send/due", p256dh: "p", auth: "d" }, noon);
activateReminder(dueStore, { endpoint: "https://fcm.googleapis.com/fcm/send/due", auth: "d", event, now: noon });
const atDue = new Date(reminderInstant(event).getTime() + 1000);
syncWithEvents(dueStore, [event], atDue);
assert.equal(dueStore.reminders[0].status, "pending");
assert.equal(claimDue(dueStore, [event], atDue).length, 1);

const directory = mkdtempSync(join(tmpdir(), "kastela-push-"));
const file = join(directory, "store.json");
saveStore(file, emptyStore());
await withStore(file, (saved) => {
  upsertSubscription(saved, { endpoint: "https://fcm.googleapis.com/fcm/send/a", p256dh: "p", auth: "a" }, noon);
});
const loaded = loadStore(file);
assert.equal(loaded.subscriptions.length, 1);
rmSync(directory, { recursive: true, force: true });

assert.equal(upsertSubscription(emptyStore(), { endpoint: "https://evil.example/hook", p256dh: "p", auth: "a" }, noon).status, 400);
const owned = emptyStore();
upsertSubscription(owned, { endpoint: "https://fcm.googleapis.com/fcm/send/owned", p256dh: "old", auth: "secret" }, noon);
assert.equal(upsertSubscription(owned, { endpoint: "https://fcm.googleapis.com/fcm/send/owned", p256dh: "new", auth: "other" }, noon).ok, true);
assert.equal(owned.subscriptions[0].auth, "other");
activateReminder(owned, { endpoint: "https://fcm.googleapis.com/fcm/send/owned", auth: "other", event, now: noon });
assert.equal(upsertSubscription(owned, { endpoint: "https://fcm.googleapis.com/fcm/send/owned", p256dh: "stolen", auth: "intruder" }, noon).status, 401);
assert.equal(owned.subscriptions[0].p256dh, "new");
assert.equal(upsertSubscription(owned, { endpoint: "https://fcm.googleapis.com/fcm/send/owned", p256dh: "kept", auth: "other" }, noon).ok, true);
assert.equal(owned.subscriptions[0].p256dh, "kept");
assert.equal(reminderPayload(event, "https://attacker.example").url.startsWith("https://www.kastela.live/#"), true);
assert.equal(siteOrigin({ headers: { origin: "https://attacker.example" }, socket: {} }), "https://www.kastela.live");
assert.equal(siteOrigin({ headers: { origin: "https://www.kastela.live" }, socket: {} }), "https://www.kastela.live");
assert.equal(dispatchAllowed({ headers: {}, socket: { remoteAddress: "203.0.113.8" } }), false);
assert.equal(dispatchAllowed({ headers: {}, socket: { remoteAddress: "127.0.0.1" } }), true);
assert.equal(dispatchAllowed({ headers: { "x-forwarded-for": "203.0.113.9" }, socket: { remoteAddress: "127.0.0.1" } }), false);
const crowd = emptyStore();
for (let index = 0; index < 400; index += 1) {
  assert.equal(upsertSubscription(crowd, { endpoint: `https://fcm.googleapis.com/fcm/send/n${index}`, p256dh: "p", auth: "a" }, noon).ok, true);
}
assert.equal(upsertSubscription(crowd, { endpoint: "https://fcm.googleapis.com/fcm/send/extra", p256dh: "p", auth: "a" }, noon).ok, true);
assert.equal(crowd.subscriptions.filter((item) => item.status === "active").length, 400);

console.log("push-check: raspored, duplikati, izmjena, otkaz i slanje");

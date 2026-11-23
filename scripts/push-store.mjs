import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { eventStartUtc, reminderInstant, scheduleDecision } from "./push-time.mjs";

const chains = new Map();

export function emptyStore() {
  return { subscriptions: [], reminders: [], logs: [] };
}

export function loadStore(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return {
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
      reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    return emptyStore();
  }
}

export function saveStore(file, store) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(temporary, file);
}

export function withStore(file, fn) {
  const previous = chains.get(file) || Promise.resolve();
  const run = previous.then(async () => {
    const store = loadStore(file);
    const result = await fn(store);
    saveStore(file, store);
    return result;
  });
  chains.set(file, run.then(() => {}, () => {}));
  return run;
}

function nowIso(now) {
  return now.toISOString();
}

function findSubscription(store, endpoint, auth) {
  return store.subscriptions.find((item) => item.endpoint === endpoint && item.auth === auth && item.status === "active") || null;
}

function touch(item, now) {
  item.updated_at = nowIso(now);
}

export function upsertSubscription(store, input, now = new Date()) {
  const endpoint = String(input.endpoint || "");
  const p256dh = String(input.p256dh || input.keys?.p256dh || "");
  const auth = String(input.auth || input.keys?.auth || "");
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return { ok: false, status: 400, message: "Pretplata nije potpuna." };
  }
  let subscription = store.subscriptions.find((item) => item.endpoint === endpoint);
  if (!subscription) {
    subscription = {
      id: randomUUID(),
      endpoint,
      p256dh,
      auth,
      created_at: nowIso(now),
      last_used_at: nowIso(now),
      status: "active",
    };
    store.subscriptions.push(subscription);
  } else {
    subscription.p256dh = p256dh;
    subscription.auth = auth;
    subscription.status = "active";
    subscription.last_used_at = nowIso(now);
    touch(subscription, now);
  }
  return { ok: true, subscription };
}

export function deleteSubscription(store, endpoint, auth, now = new Date()) {
  const subscription = findSubscription(store, endpoint, auth);
  if (!subscription) return { ok: false, status: 404, message: "Pretplata nije pronađena." };
  subscription.status = "gone";
  touch(subscription, now);
  for (const reminder of store.reminders) {
    if (reminder.subscription_id === subscription.id && reminder.status === "pending") {
      reminder.status = "cancelled";
      touch(reminder, now);
    }
  }
  return { ok: true };
}

function snapshotEvent(reminder, event) {
  reminder.event_title = event.title;
  reminder.event_date = event.date;
  reminder.event_start = event.start_time;
  reminder.event_venue = event.venue;
  reminder.event_district = event.district;
}

export function activateReminder(store, { endpoint, auth, event, now = new Date() }) {
  const subscription = findSubscription(store, endpoint, auth);
  if (!subscription) return { ok: false, status: 401, message: "Najprije uključi obavijesti na ovom uređaju." };
  const decision = scheduleDecision(event, now);
  if (!decision.ok) return { ok: false, status: 409, ...decision };
  const existing = store.reminders.find((item) => item.subscription_id === subscription.id && item.event_id === event.id && item.status === "pending");
  if (existing) {
    existing.scheduled_at = decision.scheduled_at;
    snapshotEvent(existing, event);
    touch(existing, now);
    subscription.last_used_at = nowIso(now);
    return { ok: true, reminder: existing, already: true };
  }
  const reminder = {
    id: randomUUID(),
    event_id: event.id,
    subscription_id: subscription.id,
    scheduled_at: decision.scheduled_at,
    sent_at: null,
    status: "pending",
    created_at: nowIso(now),
    updated_at: nowIso(now),
  };
  snapshotEvent(reminder, event);
  store.reminders.push(reminder);
  subscription.last_used_at = nowIso(now);
  return { ok: true, reminder, already: false };
}

export function deactivateReminder(store, { endpoint, auth, eventId, now = new Date() }) {
  const subscription = findSubscription(store, endpoint, auth);
  if (!subscription) return { ok: false, status: 401, message: "Pretplata nije pronađena." };
  const reminder = store.reminders.find((item) => item.subscription_id === subscription.id && item.event_id === eventId && item.status === "pending");
  if (!reminder) return { ok: true, changed: false };
  reminder.status = "cancelled";
  touch(reminder, now);
  subscription.last_used_at = nowIso(now);
  return { ok: true, changed: true, reminder };
}

export function reminderViews(store, endpoint, auth, events) {
  const subscription = findSubscription(store, endpoint, auth);
  if (!subscription) return { ok: false, status: 401, message: "Pretplata nije pronađena." };
  const byId = new Map(events.map((event) => [event.id, event]));
  const reminders = store.reminders
    .filter((item) => item.subscription_id === subscription.id && item.status === "pending")
    .map((item) => {
      const event = byId.get(item.event_id);
      return {
        id: item.id,
        event_id: item.event_id,
        status: item.status,
        scheduled_at: item.scheduled_at,
        title: event?.title || item.event_title,
        date: event?.date || item.event_date,
        start_time: event?.start_time || item.event_start,
        venue: event?.venue || item.event_venue || "",
        district: event?.district || item.event_district || "",
      };
    });
  return { ok: true, reminders };
}

export function recoverSending(store, now = new Date()) {
  for (const reminder of store.reminders) {
    if (reminder.status !== "sending") continue;
    const updated = new Date(reminder.updated_at || reminder.created_at).getTime();
    if (now.getTime() - updated > 2 * 60 * 1000) {
      reminder.status = "pending";
      touch(reminder, now);
    }
  }
}

export function syncWithEvents(store, events, now = new Date()) {
  const byId = new Map(events.map((event) => [event.id, event]));
  const cancellations = [];
  for (const reminder of store.reminders) {
    if (reminder.status !== "pending") continue;
    const event = byId.get(reminder.event_id);
    const subscription = store.subscriptions.find((item) => item.id === reminder.subscription_id && item.status === "active");
    if (!event) {
      reminder.status = "cancelled";
      touch(reminder, now);
      if (subscription) cancellations.push({ reminder, subscription, title: reminder.event_title });
      continue;
    }
    snapshotEvent(reminder, event);
    const start = eventStartUtc(event);
    if (start.getTime() <= now.getTime()) {
      reminder.status = "cancelled";
      touch(reminder, now);
      continue;
    }
    const when = reminderInstant(event);
    const stored = new Date(reminder.scheduled_at).getTime();
    if (when.getTime() !== stored && when.getTime() < now.getTime()) {
      reminder.status = "cancelled";
      touch(reminder, now);
      continue;
    }
    if (when.getTime() !== stored) {
      reminder.scheduled_at = when.toISOString();
      touch(reminder, now);
    }
  }
  return cancellations;
}

export function claimDue(store, events, now = new Date()) {
  recoverSending(store, now);
  syncWithEvents(store, events, now);
  const byId = new Map(events.map((event) => [event.id, event]));
  const due = [];
  for (const reminder of store.reminders) {
    if (reminder.status !== "pending") continue;
    if (new Date(reminder.scheduled_at).getTime() > now.getTime()) continue;
    const event = byId.get(reminder.event_id);
    const subscription = store.subscriptions.find((item) => item.id === reminder.subscription_id && item.status === "active");
    if (!event || !subscription) {
      reminder.status = "cancelled";
      touch(reminder, now);
      continue;
    }
    if (eventStartUtc(event).getTime() <= now.getTime()) {
      reminder.status = "cancelled";
      touch(reminder, now);
      continue;
    }
    reminder.status = "sending";
    touch(reminder, now);
    due.push({ reminder, event, subscription });
  }
  return due;
}

function pushLog(store, entry) {
  store.logs.push(entry);
  if (store.logs.length > 200) store.logs.splice(0, store.logs.length - 200);
}

export function markSent(store, reminderId, now = new Date()) {
  const reminder = store.reminders.find((item) => item.id === reminderId);
  if (!reminder) return;
  reminder.status = "sent";
  reminder.sent_at = nowIso(now);
  touch(reminder, now);
  const subscription = store.subscriptions.find((item) => item.id === reminder.subscription_id);
  if (subscription) subscription.last_used_at = nowIso(now);
  pushLog(store, { at: nowIso(now), reminder_id: reminderId, ok: true });
}

export function markFailed(store, reminderId, error, now = new Date()) {
  const reminder = store.reminders.find((item) => item.id === reminderId);
  if (!reminder) return;
  const statusCode = Number(error?.statusCode || 0);
  const subscription = store.subscriptions.find((item) => item.id === reminder.subscription_id);
  if (statusCode === 404 || statusCode === 410) {
    reminder.status = "cancelled";
    if (subscription) {
      subscription.status = "gone";
      touch(subscription, now);
    }
  } else {
    reminder.status = "failed";
  }
  touch(reminder, now);
  pushLog(store, {
    at: nowIso(now),
    reminder_id: reminderId,
    ok: false,
    status_code: statusCode || null,
    error: String(error?.message || error || "slanje nije uspjelo").slice(0, 180),
  });
}

export function stats(store) {
  const pending = store.reminders.filter((item) => item.status === "pending");
  return {
    subscriptions: store.subscriptions.filter((item) => item.status === "active").length,
    reminders: pending.length,
    sent: store.reminders.filter((item) => item.status === "sent").length,
    failed: store.reminders.filter((item) => item.status === "failed").length,
    upcoming: pending
      .map((item) => ({
        id: item.id,
        event_id: item.event_id,
        title: item.event_title,
        scheduled_at: item.scheduled_at,
        status: item.status,
      }))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    logs: store.logs.slice(-30).reverse(),
  };
}

export function reminderPayload(event, origin) {
  const place = [event.venue, event.district].filter(Boolean).join(", ");
  const image = /^https?:\/\//i.test(event.image_url || "") ? event.image_url : undefined;
  return {
    title: "Kaštela.live – Podsjetnik",
    body: `${event.title} počinje za 8 sati! Vidimo se u ${place}.`,
    url: `${origin.replace(/\/$/, "")}/#${event.id}`,
    image,
  };
}

export function cancellationPayload(title, origin) {
  return {
    title: "Kaštela.live – Otkazano",
    body: title ? `${title} je uklonjen iz kalendara.` : "Događaj je uklonjen iz kalendara.",
    url: `${origin.replace(/\/$/, "")}/`,
  };
}

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadEvents } from "./generate-ics.mjs";
import {
  activateReminder,
  cancellationPayload,
  claimDue,
  deactivateReminder,
  deleteSubscription,
  markFailed,
  markSent,
  reminderPayload,
  reminderViews,
  stats,
  syncWithEvents,
  upsertSubscription,
  withStore,
} from "./push-store.mjs";
import { scheduleDecision } from "./push-time.mjs";

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function loadVapid(root) {
  const fromEnv = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
        subject: process.env.VAPID_SUBJECT || "mailto:podsjetnik@kastela.live",
        adminToken: process.env.PUSH_ADMIN_TOKEN || "",
      }
    : null;
  if (fromEnv) return fromEnv;
  const file = join(root, "data", "vapid.json");
  const existing = readJson(file);
  if (existing?.publicKey && existing?.privateKey) return existing;
  return null;
}

export async function ensureVapid(root) {
  const current = loadVapid(root);
  if (current) return current;
  const webpush = await import("web-push");
  const keys = webpush.generateVAPIDKeys();
  const record = {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: "mailto:podsjetnik@kastela.live",
    adminToken: "",
  };
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(join(root, "data", "vapid.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function events(root) {
  return loadEvents(join(root, "data", "events.csv"));
}

function storeFile(root) {
  return join(root, "data", "push-store.json");
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function isLocal(request) {
  const address = request.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address.endsWith(":127.0.0.1");
}

function allowedAdmin(request, vapid) {
  if (isLocal(request)) return true;
  const token = request.headers["x-admin-token"];
  return Boolean(vapid.adminToken) && token === vapid.adminToken;
}

export function startPushScheduler(root, originOf) {
  const tick = async () => {
    try {
      await dispatchPushFixed(root, originOf());
    } catch (error) {
      console.error(`Push raspored: ${error.message}`);
    }
  };
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  return timer;
}

async function dispatchPushFixed(root, origin) {
  const vapid = await ensureVapid(root);
  const webpush = await import("web-push");
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const file = storeFile(root);
  const list = events(root);
  const cancellations = await withStore(file, (store) => syncWithEvents(store, list, new Date()));
  for (const item of cancellations) {
    try {
      await webpush.sendNotification(
        { endpoint: item.subscription.endpoint, keys: { p256dh: item.subscription.p256dh, auth: item.subscription.auth } },
        JSON.stringify(cancellationPayload(item.title, origin)),
      );
    } catch (error) {
      await withStore(file, (store) => markFailed(store, item.reminder.id, error));
    }
  }
  const due = await withStore(file, (store) => claimDue(store, list, new Date()));
  for (const item of due) {
    try {
      await webpush.sendNotification(
        { endpoint: item.subscription.endpoint, keys: { p256dh: item.subscription.p256dh, auth: item.subscription.auth } },
        JSON.stringify(reminderPayload(item.event, origin)),
      );
      await withStore(file, (store) => markSent(store, item.reminder.id));
    } catch (error) {
      await withStore(file, (store) => markFailed(store, item.reminder.id, error));
    }
  }
  return { due: due.length, cancelled: cancellations.length };
}

export async function handlePushApi(request, response, url, root) {
  const vapid = await ensureVapid(root);
  const route = url.pathname;
  const file = storeFile(root);
  const method = request.method || "GET";

  if (route === "/api/push/config" && method === "GET") {
    sendJson(response, 200, { publicKey: vapid.publicKey });
    return;
  }

  if (route === "/api/push/plan" && method === "POST") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const event = events(root).find((item) => item.id === body.eventId);
    if (!event) return sendJson(response, 404, { ok: false, message: "Događaj nije pronađen." });
    sendJson(response, 200, scheduleDecision(event, new Date()));
    return;
  }

  if (route === "/api/push/subscriptions" && method === "POST") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const result = await withStore(file, (store) => upsertSubscription(store, body, new Date()));
    sendJson(response, result.ok ? 200 : result.status, { ok: result.ok, message: result.message || "" });
    return;
  }

  if (route === "/api/push/subscriptions" && method === "DELETE") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const result = await withStore(file, (store) => deleteSubscription(store, body.endpoint, body.keys?.auth || body.auth, new Date()));
    sendJson(response, result.ok ? 200 : result.status, result);
    return;
  }

  if (route === "/api/push/reminders" && method === "POST") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const event = events(root).find((item) => item.id === body.eventId);
    if (!event) return sendJson(response, 404, { ok: false, message: "Događaj nije pronađen." });
    const result = await withStore(file, (store) => activateReminder(store, {
      endpoint: body.endpoint,
      auth: body.keys?.auth || body.auth,
      event,
      now: new Date(),
    }));
    sendJson(response, result.ok ? 200 : result.status, {
      ok: result.ok,
      message: result.message || (result.already ? "Podsjetnik je već uključen." : "Podsjetnik aktiviran."),
      scheduled_at: result.reminder?.scheduled_at || null,
    });
    return;
  }

  if (route === "/api/push/reminders" && method === "DELETE") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const result = await withStore(file, (store) => deactivateReminder(store, {
      endpoint: body.endpoint,
      auth: body.keys?.auth || body.auth,
      eventId: body.eventId,
      now: new Date(),
    }));
    sendJson(response, result.ok ? 200 : result.status, { ok: result.ok, message: result.changed ? "Obavijest je isključena." : "Podsjetnik nije bio uključen." });
    return;
  }

  if (route === "/api/push/reminders/list" && method === "POST") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const result = await withStore(file, (store) => reminderViews(store, body.endpoint, body.keys?.auth || body.auth, events(root)));
    sendJson(response, result.ok ? 200 : result.status, result);
    return;
  }

  if (route === "/api/push/stats" && method === "GET") {
    if (!allowedAdmin(request, vapid)) return sendJson(response, 401, { ok: false, message: "Nema pristupa." });
    const result = await withStore(file, (store) => stats(store));
    sendJson(response, 200, result);
    return;
  }

  if (route === "/api/push/dispatch" && method === "POST") {
    if (!allowedAdmin(request, vapid)) return sendJson(response, 401, { ok: false, message: "Nema pristupa." });
    const origin = request.headers.origin || `http://127.0.0.1:${process.env.PORT || 3000}`;
    const result = await dispatchPushFixed(root, origin);
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { ok: false, message: "Nepoznata adresa." });
}

export { dispatchPushFixed };

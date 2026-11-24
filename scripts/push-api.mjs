import { timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
  trustedSiteOrigin,
  upsertSubscription,
} from "./push-store.mjs";
import { withPushStore } from "./push-persist.mjs";
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
  if (process.env.VERCEL) {
    const error = new Error("Obavijesti još nisu postavljene na poslužitelju.");
    error.status = 503;
    throw error;
  }
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

function events() {
  const candidates = [
    fileURLToPath(new URL("../data/events.csv", import.meta.url)),
    join(process.cwd(), "data", "events.csv"),
  ];
  let last;
  for (const path of candidates) {
    try {
      return loadEvents(path);
    } catch (error) {
      last = error;
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw last;
}

function storeFile(root) {
  return join(root, "data", "push-store.json");
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const MAX_BODY = 4096;
const writes = new Map();

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parsedWithinLimit(value) {
  if (value == null) return value;
  try {
    if (JSON.stringify(value).length > MAX_BODY) return null;
  } catch {
    return null;
  }
  return value;
}

async function readBody(request) {
  const declared = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) return null;
  const existing = request.body;
  if (Buffer.isBuffer(existing)) {
    if (existing.length > MAX_BODY) return null;
    return existing.length ? parseJson(existing.toString("utf8")) : {};
  }
  if (typeof existing === "string") {
    if (existing.length > MAX_BODY) return null;
    return existing ? parseJson(existing) : {};
  }
  if (existing && typeof existing === "object") return parsedWithinLimit(existing);
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BODY) return null;
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    return parseJson(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function withinRate(request) {
  const now = Date.now();
  const ip = String(request.headers?.["x-forwarded-for"] || request.socket?.remoteAddress || "local").split(",")[0].trim();
  for (const [key, limit] of [[ip, 30], ["all", 120]]) {
    const recent = (writes.get(key) || []).filter((time) => now - time < 60_000);
    if (recent.length >= limit) {
      writes.set(key, recent);
      return false;
    }
    recent.push(now);
    writes.set(key, recent);
  }
  return true;
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
  const bearer = String(request.headers.authorization || "");
  const admin = vapid?.adminToken || "";
  const cron = process.env.CRON_SECRET || "";
  if (admin && (sameSecret(token, admin) || sameSecret(bearer, `Bearer ${admin}`))) return true;
  return Boolean(cron) && sameSecret(bearer, `Bearer ${cron}`);
}

export function dispatchAllowed(request) {
  return allowedAdmin(request, loadVapid(process.cwd()) || {});
}

export function siteOrigin(request) {
  const local = isLocal(request);
  const host = String(request?.headers?.["x-forwarded-host"] || request?.headers?.host || "").split(",")[0].trim();
  return trustedSiteOrigin(request?.headers?.origin, { local })
    || trustedSiteOrigin(host ? `https://${host}` : "", { local })
    || "https://www.kastela.live";
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
  const list = events();
  const cancellations = await withPushStore(file, (store) => syncWithEvents(store, list, new Date()));
  for (const item of cancellations) {
    try {
      await webpush.sendNotification(
        { endpoint: item.subscription.endpoint, keys: { p256dh: item.subscription.p256dh, auth: item.subscription.auth } },
        JSON.stringify(cancellationPayload(item.title, origin)),
      );
    } catch (error) {
      await withPushStore(file, (store) => markFailed(store, item.reminder.id, error));
    }
  }
  const due = await withPushStore(file, (store) => claimDue(store, list, new Date()));
  for (const item of due) {
    try {
      await webpush.sendNotification(
        { endpoint: item.subscription.endpoint, keys: { p256dh: item.subscription.p256dh, auth: item.subscription.auth } },
        JSON.stringify(reminderPayload(item.event, origin)),
      );
      await withPushStore(file, (store) => markSent(store, item.reminder.id));
    } catch (error) {
      await withPushStore(file, (store) => markFailed(store, item.reminder.id, error));
    }
  }
  return { due: due.length, cancelled: cancellations.length };
}

export async function handlePushApi(request, response, url, root) {
  let vapid;
  try {
    vapid = await ensureVapid(root);
  } catch (error) {
    sendJson(response, error.status || 500, { ok: false, message: error.message });
    return;
  }
  const route = {
    "/api/push-config": "/api/push/config",
    "/api/push-plan": "/api/push/plan",
    "/api/push-subscriptions": "/api/push/subscriptions",
    "/api/push-reminders": "/api/push/reminders",
    "/api/push-reminders-list": "/api/push/reminders/list",
    "/api/push-stats": "/api/push/stats",
    "/api/push-dispatch": "/api/push/dispatch",
  }[url.pathname] || url.pathname;
  const file = storeFile(root);
  const method = request.method || "GET";
  if (method !== "GET" && !withinRate(request)) {
    sendJson(response, 429, { ok: false, message: "Previše zahtjeva. Pokušaj ponovno za minutu." });
    return;
  }

  if (route === "/api/push/config" && method === "GET") {
    sendJson(response, 200, { publicKey: vapid.publicKey });
    return;
  }

  if (route === "/api/push/plan" && method === "POST") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const event = events().find((item) => item.id === body.eventId);
    if (!event) return sendJson(response, 404, { ok: false, message: "Događaj nije pronađen." });
    sendJson(response, 200, scheduleDecision(event, new Date()));
    return;
  }

  if (route === "/api/push/subscriptions" && method === "POST") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const result = await withPushStore(file, (store) => upsertSubscription(store, body, new Date()));
    sendJson(response, result.ok ? 200 : result.status, { ok: result.ok, message: result.message || "" });
    return;
  }

  if (route === "/api/push/subscriptions" && method === "DELETE") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const result = await withPushStore(file, (store) => deleteSubscription(store, body.endpoint, body.keys?.auth || body.auth, new Date()));
    sendJson(response, result.ok ? 200 : result.status, result);
    return;
  }

  if (route === "/api/push/reminders" && method === "POST") {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, message: "Zahtjev nije čitljiv." });
    const event = events().find((item) => item.id === body.eventId);
    if (!event) return sendJson(response, 404, { ok: false, message: "Događaj nije pronađen." });
    const result = await withPushStore(file, (store) => activateReminder(store, {
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
    const result = await withPushStore(file, (store) => deactivateReminder(store, {
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
    const result = await withPushStore(file, (store) => reminderViews(store, body.endpoint, body.keys?.auth || body.auth, events()));
    sendJson(response, result.ok ? 200 : result.status, result);
    return;
  }

  if (route === "/api/push/stats" && method === "GET") {
    if (!allowedAdmin(request, vapid)) return sendJson(response, 401, { ok: false, message: "Nema pristupa." });
    const result = await withPushStore(file, (store) => stats(store));
    sendJson(response, 200, result);
    return;
  }

  if (route === "/api/push/dispatch" && method === "POST") {
    if (!allowedAdmin(request, vapid)) return sendJson(response, 401, { ok: false, message: "Nema pristupa." });
    const origin = siteOrigin(request);
    const result = await dispatchPushFixed(root, origin);
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { ok: false, message: "Nepoznata adresa." });
}

export { dispatchPushFixed };

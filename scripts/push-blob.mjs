import { get, put } from "@vercel/blob";
import { emptyStore } from "./push-store.mjs";

const PATHNAME = "push/store.json";
let chain = Promise.resolve();

function normalize(parsed) {
  return {
    subscriptions: Array.isArray(parsed?.subscriptions) ? parsed.subscriptions : [],
    reminders: Array.isArray(parsed?.reminders) ? parsed.reminders : [],
    logs: Array.isArray(parsed?.logs) ? parsed.logs : [],
  };
}

async function loadBlob() {
  try {
    const result = await get(PATHNAME, { access: "private", useCache: false });
    if (!result || result.statusCode === 404) return { store: emptyStore(), etag: "" };
    const text = await new Response(result.stream).text();
    return { store: normalize(JSON.parse(text)), etag: result.etag || "" };
  } catch (error) {
    const missing = error?.statusCode === 404 || /not found|does not exist/i.test(String(error?.message || ""));
    if (missing) return { store: emptyStore(), etag: "" };
    throw error;
  }
}

async function saveBlob(store, etag) {
  await put(PATHNAME, JSON.stringify(store), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    ...(etag ? { ifMatch: etag } : {}),
  });
}

function conflicted(error) {
  return error?.statusCode === 412 || /precondition|etag|if-match|ifmatch/i.test(String(error?.message || ""));
}

export function withBlobStore(fn) {
  const run = chain.then(async () => {
    let last;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { store, etag } = await loadBlob();
      const result = await fn(store);
      try {
        await saveBlob(store, etag);
        return result;
      } catch (error) {
        last = error;
        if (!conflicted(error)) throw error;
      }
    }
    throw last;
  });
  chain = run.then(() => {}, () => {});
  return run;
}

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
    if (!result || result.statusCode === 404) return emptyStore();
    const text = await new Response(result.stream).text();
    return normalize(JSON.parse(text));
  } catch (error) {
    const missing = error?.statusCode === 404 || /not found|does not exist/i.test(String(error?.message || ""));
    if (missing) return emptyStore();
    throw error;
  }
}

async function saveBlob(store) {
  await put(PATHNAME, JSON.stringify(store), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export function withBlobStore(fn) {
  const run = chain.then(async () => {
    const store = await loadBlob();
    const result = await fn(store);
    await saveBlob(store);
    return result;
  });
  chain = run.then(() => {}, () => {});
  return run;
}

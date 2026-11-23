import { handlePushApi } from "./push-api.mjs";

function header(request, name) {
  const headers = request.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  return headers[name] || "";
}

export function createPushHandler(pathname) {
  return async function handler(request, response) {
    try {
      const host = header(request, "x-forwarded-host") || header(request, "host") || "www.kastela.live";
      const url = new URL(request.url || "/", `https://${host}`);
      if (pathname) url.pathname = pathname;
      await handlePushApi(request, response, url, process.cwd());
    } catch (error) {
      if (response.headersSent || response.writableEnded) return;
      response.writeHead(error.status || 500, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify({ ok: false, message: error.message || "Poslužitelj nije odradio zahtjev." }));
    }
  };
}

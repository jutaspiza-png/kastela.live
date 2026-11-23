import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "web-push";
import { createPushHandler } from "../scripts/push-http.mjs";

readFileSync(fileURLToPath(new URL("../data/events.csv", import.meta.url)));

function header(request, name) {
  const headers = request.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  return headers[name] || "";
}

function pathnameFrom(request) {
  const host = header(request, "x-forwarded-host") || header(request, "host") || "www.kastela.live";
  const url = new URL(request.url || "/", `https://${host}`);
  if (url.pathname.startsWith("/api/push")) return url.pathname;
  const query = request.query?.path ?? url.searchParams.get("...path") ?? url.searchParams.get("path");
  const parts = Array.isArray(query) ? query.join("/") : query || "";
  if (!parts) return url.pathname;
  return `/api/${parts}`.replaceAll(/\/+/g, "/");
}

export default async function api(request, response) {
  const pathname = pathnameFrom(request);
  if (!pathname.startsWith("/api/push")) {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: false, message: "Nepoznata adresa." }));
    return;
  }
  return createPushHandler(pathname)(request, response);
}

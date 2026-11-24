import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handlePushApi, startPushScheduler } from "./push-api.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/push")) {
      await handlePushApi(request, response, url, root);
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    pathname = pathname.replace(/^\/+/, "");
    const parts = pathname.split("/");
    const base = parts.at(-1) || "";
    if (!pathname || parts.includes("..") || parts.some((part) => part.startsWith(".")) || base === "vapid.json" || base === "push-store.json") {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Zabranjeno");
      return;
    }
    const path = normalize(join(root, pathname));
    if (path !== root && !path.startsWith(root.endsWith(sep) ? root : root + sep)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Zabranjeno");
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(body);
  } catch (error) {
    if (String(request.url || "").startsWith("/api/")) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, message: "Poslužitelj nije odradio zahtjev." }));
      console.error(error);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Nema datoteke");
  }
});

startPushScheduler(root, () => `http://127.0.0.1:${port}`);

const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`Kaštela događanja: http://${host}:${port}`);
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "web-push";
import { dispatchAllowed, dispatchPushFixed, siteOrigin } from "../scripts/push-api.mjs";

readFileSync(fileURLToPath(new URL("../data/events.csv", import.meta.url)));

export default async function handler(request, response) {
  try {
    if (!dispatchAllowed(request)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ ok: false, message: "Nema pristupa." }));
      return;
    }
    const result = await dispatchPushFixed(process.cwd(), siteOrigin(request));
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(error.status || 500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, message: error.message || "Slanje nije uspjelo." }));
  }
}

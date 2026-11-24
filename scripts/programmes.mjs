import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { foldText, isoWeekday } from "./filter.mjs";
import { eventStartUtc } from "./push-time.mjs";

const ORIGIN = "https://www.kastela.live";

const WEEKDAYS = ["", "ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota", "nedjelja"];
const MONTHS = ["", "siječnja", "veljače", "ožujka", "travnja", "svibnja", "lipnja", "srpnja", "kolovoza", "rujna", "listopada", "studenoga", "prosinca"];

// A new group, including Kulturno ljeto, is another entry here.
export const PROGRAMMES = [
  { season: "advent", label: "Advent", city: "kastela", programme: "Advent u Kaštelima", path: "/advent/kastela/" },
  { season: "advent", label: "Advent", city: "trogir", programme: "Zimska Adventura Trogir 2026", path: "/advent/trogir/" },
  { season: "advent", label: "Advent", city: "solin", programme: "Solinski Adventorium 2026", path: "/advent/solin/" },
  { season: "advent", label: "Advent", city: "split", programme: "Advent Grada Splita 2026", path: "/advent/split/" },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function catClass(category) {
  return `cat-${foldText(category).replace(/\s+/g, "-")}`;
}

function formatDay(date) {
  const [, month, day] = date.split("-");
  return `${WEEKDAYS[isoWeekday(date)]}, ${Number(day)}. ${MONTHS[Number(month)]}`;
}

function formatShort(date) {
  const [, month, day] = date.split("-");
  return `${Number(day)}. ${MONTHS[Number(month)]}`;
}

function eventWord(count) {
  return count % 10 === 1 && count % 100 !== 11 ? "događanje" : "događanja";
}

function clock(event) {
  if (!event.start_time) return "—";
  return event.end_time ? `${event.start_time}–${event.end_time}` : event.start_time;
}

function prefixFor(path) {
  const depth = path.split("/").filter(Boolean).length;
  return "../".repeat(depth);
}

function sorted(events) {
  return [...events].sort(
    (a, b) => `${a.date}T${a.start_time || "99:99"}`.localeCompare(`${b.date}T${b.start_time || "99:99"}`) || a.id.localeCompare(b.id),
  );
}

function summary(events) {
  const list = sorted(events);
  const first = list[0].date;
  const last = list[list.length - 1].date;
  const span = first === last ? formatShort(first) : `od ${formatShort(first)} do ${formatShort(last)}`;
  return `${list.length} ${eventWord(list.length)}, ${span}.`;
}

function days(events) {
  const groups = new Map();
  for (const event of sorted(events)) {
    if (!groups.has(event.date)) groups.set(event.date, []);
    groups.get(event.date).push(event);
  }
  return [...groups].map(([date, items]) => `
    <section class="day">
      <h2>${escapeHtml(formatDay(date))}</h2>
      <ul>
        ${items.map((event) => `<li>
          <time datetime="${escapeHtml(event.date)}${event.start_time ? `T${escapeHtml(event.start_time)}` : ""}">${escapeHtml(clock(event))}</time>
          <div>
            <strong>${escapeHtml(event.title)}</strong>
            <p>${escapeHtml(event.venue)} · ${escapeHtml(event.district)}</p>
            <p>${escapeHtml(event.description)}</p>
          </div>
          <span class="day-badge ${catClass(event.category)}">${escapeHtml(event.category)}</span>
        </li>`).join("")}
      </ul>
    </section>`).join("");
}

function jsonLd(programme, events) {
  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: programme.programme,
    itemListElement: sorted(events).map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Event",
        name: event.title,
        startDate: event.start_time ? eventStartUtc(event).toISOString() : event.date,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: event.venue, address: event.district },
        description: event.description,
        ...(event.is_free ? { offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" } } : {}),
      },
    })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function renderProgrammePage(programme, events, season = PROGRAMMES.filter((item) => item.season === programme.season)) {
  const prefix = prefixFor(programme.path);
  const description = `${programme.programme}. ${summary(events)}`;
  const links = season.map((item) => {
    const current = item.path === programme.path ? ' aria-current="page"' : "";
    return `<a href="${escapeHtml(item.path)}"${current}>${escapeHtml(item.programme)}</a>`;
  }).join("");
  return `<!DOCTYPE html>
<html lang="hr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#e6f5ff" />
    <title>${escapeHtml(programme.programme)} — kastela.live</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${ORIGIN}${programme.path}" />
    <link rel="stylesheet" href="${prefix}styles.css" />
    <script type="application/ld+json">${jsonLd(programme, events)}</script>
  </head>
  <body>
    <header class="top">
      <div class="wrap top-bar">
        <a class="logo" href="${prefix}" aria-label="kastela.live, početna">
          <img src="${prefix}assets/logo-mark.png" alt="" width="40" height="40" />
          <span class="wordmark">kastela<span class="live">.live</span></span>
        </a>
      </div>
    </header>
    <main>
      <section class="hero">
        <div class="wrap hero-copy">
          <p class="eyebrow">${escapeHtml(programme.label)}</p>
          <h1>${escapeHtml(programme.programme)}</h1>
          <p class="lede">${escapeHtml(summary(events))}</p>
          <nav class="season-links" aria-label="${escapeHtml(programme.label)}">${links}</nav>
        </div>
      </section>
      <div class="wrap programme-list">${days(events)}</div>
    </main>
  </body>
</html>
`;
}

export function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
}

export function sitemapXml() {
  const urls = ["/", ...PROGRAMMES.map((item) => item.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${ORIGIN}${path}</loc></url>`).join("\n")}
</urlset>
`;
}

export function canonicalPath(pathname) {
  const path = String(pathname || "/").split("?")[0];
  if (path === "/robots.txt" || path === "/sitemap.xml") return path;
  let page = path;
  if (page.endsWith("/index.html")) page = page.slice(0, -"/index.html".length);
  if (!page.startsWith("/")) page = `/${page}`;
  if (!page.endsWith("/")) page += "/";
  return page;
}

export function isPublicPath(pathname) {
  const path = canonicalPath(pathname);
  return path === "/robots.txt" || path === "/sitemap.xml" || PROGRAMMES.some((item) => item.path === path);
}

export function publicBody(pathname, events) {
  const path = canonicalPath(pathname);
  if (path === "/robots.txt") return { type: "text/plain; charset=utf-8", body: robotsTxt() };
  if (path === "/sitemap.xml") return { type: "application/xml; charset=utf-8", body: sitemapXml() };
  const programme = PROGRAMMES.find((item) => item.path === path);
  if (!programme) return null;
  const list = events.filter((event) => event.programme === programme.programme);
  if (!list.length) return null;
  return { type: "text/html; charset=utf-8", body: renderProgrammePage(programme, list) };
}

export function writePublicPages(site, events) {
  const known = new Set(PROGRAMMES.map((item) => item.programme));
  for (const event of events) {
    if (event.programme && !known.has(event.programme)) {
      throw new Error(`Program „${event.programme}” nema javnu stranicu. Dodaj ga u scripts/programmes.mjs.`);
    }
  }
  writeFileSync(resolve(site, "robots.txt"), robotsTxt());
  writeFileSync(resolve(site, "sitemap.xml"), sitemapXml());
  for (const programme of PROGRAMMES) {
    const list = events.filter((event) => event.programme === programme.programme);
    if (!list.length) throw new Error(`Program „${programme.programme}” nema događanja.`);
    const dir = resolve(site, programme.path.replace(/^\/|\/$/g, ""));
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "index.html"), renderProgrammePage(programme, list));
  }
}

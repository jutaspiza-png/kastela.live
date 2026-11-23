import { eventsToIcs, parseCsv, validateEvents } from "./scripts/ics.mjs";
import { filterEvents, foldText, isoWeekday, zagrebNow } from "./scripts/filter.mjs";

const WEEKDAYS = ["", "pon", "uto", "sri", "čet", "pet", "sub", "ned"];
const WEEKDAYS_LONG = ["", "ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota", "nedjelja"];
const MONTHS = ["", "sij", "velj", "ožu", "tra", "svi", "lip", "srp", "kol", "ruj", "lis", "stu", "pro"];
const MONTHS_LONG = ["", "siječnja", "veljače", "ožujka", "travnja", "svibnja", "lipnja", "srpnja", "kolovoza", "rujna", "listopada", "studenoga", "prosinca"];

const state = {
  events: [],
  query: "",
  district: "all",
  period: "all",
  category: "all",
  eveningOnly: false,
  freeOnly: false,
  showPast: false,
  view: "list",
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function catClass(category) {
  return `cat-${foldText(category).replace(/\s+/g, "-")}`;
}

function safeImage(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^\.\//.test(url) && !url.includes("..")) return url;
  return "";
}

function formatWhen(event) {
  const [, month, day] = event.date.split("-");
  const weekday = WEEKDAYS[isoWeekday(event.date)];
  return `${weekday}, ${Number(day)}. ${MONTHS[Number(month)]} · ${event.start_time}–${event.end_time}`;
}

function formatDay(date) {
  const [, month, day] = date.split("-");
  return `${WEEKDAYS_LONG[isoWeekday(date)]}, ${Number(day)}. ${MONTHS_LONG[Number(month)]}`;
}

function motif(category) {
  const paths = {
    Glazba: '<path d="M18 6v22l10-3V9L18 6zm2 4.2 6 1.6V23l-6 1.8V10.2zM40 18a8 8 0 1 0 0 16h2V18h-2z" fill="currentColor"/>',
    Djeca: '<circle cx="28" cy="24" r="14" fill="currentColor"/><circle cx="22" cy="22" r="2" fill="#343434"/><circle cx="34" cy="22" r="2" fill="#343434"/><path d="M22 30c2 3 10 3 12 0" fill="none" stroke="#343434" stroke-width="2" stroke-linecap="round"/>',
    Predstava: '<path d="M8 14c6 8 10 8 16 0-6 10-10 10-16 0zm24 0c6 8 10 8 16 0-6 10-10 10-16 0z" fill="currentColor"/>',
    Gastro: '<path d="M16 14h24v6a12 12 0 0 1-24 0v-6zm-4 22h32" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    Kultura: '<path d="M10 38V20h6v18h-6zm14 0V16h6v22h-6zm14 0V22h6v16h-6zM6 18 28 8l22 10v4H6v-4z" fill="currentColor"/>',
    "Sport i rekreacija": '<circle cx="28" cy="28" r="14" fill="none" stroke="currentColor" stroke-width="4"/><path d="M16 40c8-10 16-10 24 0" fill="none" stroke="currentColor" stroke-width="3"/>',
    Tradicionalno: '<path d="M28 8c8 10 14 14 14 22a14 14 0 0 1-28 0c0-8 6-12 14-22z" fill="currentColor"/>',
  };
  return `<svg viewBox="0 0 56 56" aria-hidden="true">${paths[category] || paths.Glazba}</svg>`;
}

function calendarIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 3v4M16 3v4M4 10h16M12 13v5M9.5 15.5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
}

function card(event, list) {
  const image = safeImage(event.image_url);
  const photo = image ? `<img data-photo alt="" src="${escapeHtml(image)}" />` : "";
  const free = event.is_free ? '<span class="free-badge">Besplatno</span>' : "";
  const buttonClass = list ? "cal list-cal" : "cal";
  const label = list ? "Dodaj u kalendar" : "";
  return `<article class="card" id="${escapeHtml(event.id)}">
    <div class="media ${catClass(event.category)}">
      <div class="motif">${motif(event.category)}</div>
      ${photo}
      <span class="badge">${escapeHtml(event.category)}</span>
      ${free}
      <button class="${buttonClass}" type="button" data-action="ics" data-id="${escapeHtml(event.id)}" aria-label="Dodaj ${escapeHtml(event.title)} u kalendar">${calendarIcon()}${label}</button>
    </div>
    <h3>${escapeHtml(event.title)}</h3>
    <p class="when">${escapeHtml(formatWhen(event))}</p>
    <p class="where">${escapeHtml(event.venue)} · ${escapeHtml(event.district)}</p>
    <p class="sr-only">${escapeHtml(event.description)}</p>
  </article>`;
}

function criteria() {
  return {
    query: state.query,
    district: state.district,
    period: state.period,
    category: state.category,
    eveningOnly: state.eveningOnly,
    freeOnly: state.freeOnly,
    showPast: state.showPast,
  };
}

function selected() {
  const now = zagrebNow();
  return filterEvents(state.events, criteria(), now).sort(
    (a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`) || a.id.localeCompare(b.id),
  );
}

function render() {
  const now = zagrebNow();
  const upcoming = filterEvents(state.events, {}, now);
  $("#hero-count").textContent = upcoming.length
    ? `${upcoming.length} nadolazećih događanja u Božićnom gradu i Fritulici.`
    : "Kalendar Božićnog grada i Fritulice.";

  const events = selected();
  const featured = events.slice(0, 6);
  const rest = events.slice(featured.length);
  const featuredSection = $("#featured-section");
  featuredSection.hidden = featured.length === 0;
  $("#featured").innerHTML = featured.map((event) => card(event, false)).join("");

  const results = $("#results");
  const title = $("#upcoming-title");
  const upcomingSection = results.closest(".block");
  if (!events.length) {
    upcomingSection.hidden = false;
    title.textContent = "Uskoro";
    results.innerHTML = '<div class="empty"><p>Nema događanja za ovaj odabir.</p><button class="btn btn-dark" type="button" data-action="reset">Očisti filtere</button></div>';
  } else if (state.view === "list") {
    upcomingSection.hidden = false;
    title.textContent = `Uskoro · ${events.length}`;
    const groups = new Map();
    for (const event of events) {
      if (!groups.has(event.date)) groups.set(event.date, []);
      groups.get(event.date).push(event);
    }
    results.innerHTML = [...groups].map(([date, items]) => `
      <section class="day">
        <h3>${escapeHtml(formatDay(date))}</h3>
        <ul>
          ${items.map((event) => `<li>
            <time datetime="${escapeHtml(event.date)}T${escapeHtml(event.start_time)}">${escapeHtml(event.start_time)}</time>
            <div>
              <strong>${escapeHtml(event.title)}</strong>
              <p>${escapeHtml(event.venue)} · ${escapeHtml(event.district)}</p>
              <p>${escapeHtml(event.description)}</p>
              <span class="day-badge">${escapeHtml(event.category)}</span>
              <button class="list-cal" type="button" data-action="ics" data-id="${escapeHtml(event.id)}">Dodaj u kalendar</button>
            </div>
          </li>`).join("")}
        </ul>
      </section>`).join("");
  } else if (!rest.length) {
    upcomingSection.hidden = true;
    results.innerHTML = "";
  } else {
    upcomingSection.hidden = false;
    title.textContent = `Uskoro · ${rest.length}`;
    results.innerHTML = `<div class="grid">${rest.map((event) => card(event, false)).join("")}</div>`;
  }

  $("#status").hidden = true;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
  });
  document.querySelectorAll("[data-intent]").forEach((button) => {
    const on =
      (button.dataset.intent === "today" && state.period === "today" && !state.eveningOnly) ||
      (button.dataset.intent === "evening" && state.eveningOnly) ||
      (button.dataset.intent === "weekend" && state.period === "weekend") ||
      (button.dataset.intent === "free" && state.freeOnly) ||
      (button.dataset.intent === "kids" && state.category === "Djeca");
    button.setAttribute("aria-pressed", String(on));
  });
  bindPhotos();
  const target = location.hash.replace("#", "");
  if (target) document.getElementById(target)?.classList.add("is-target");
}

function bindPhotos() {
  document.querySelectorAll("img[data-photo]").forEach((img) => {
    img.addEventListener("error", () => img.remove(), { once: true });
  });
}

function subscriptionUrl() {
  return new URL("calendar.ics", document.baseURI).href;
}

function openSubscribe() {
  const dialog = $("#subscribe");
  const url = subscriptionUrl();
  const webcal = url.replace(/^https?:/, "webcal:");
  $("#sub-url").value = url;
  $("#sub-apple").href = webcal;
  $("#sub-google").href = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  $("#sub-outlook").href = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent("Događanja u Kaštelima")}`;
  const host = $("#qr");
  const factory = globalThis.qrcode;
  if (!factory) {
    host.textContent = "QR kod nije dostupan.";
  } else {
    factory.stringToBytes = factory.stringToBytesFuncs["UTF-8"];
    const qr = factory(0, "M");
    qr.addData(url, "Byte");
    qr.make();
    host.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: { text: "QR kod pretplate na kalendar" } });
  }
  if ($("#menu").open) $("#menu").close();
  if (!dialog.open) dialog.showModal();
}

function downloadIcs(filename, events) {
  const ics = eventsToIcs(events, { pageUrl: document.baseURI });
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resetFilters() {
  state.query = "";
  state.district = "all";
  state.period = "all";
  state.category = "all";
  state.eveningOnly = false;
  state.freeOnly = false;
  $("#q").value = "";
  $("#district").value = "all";
  $("#period").value = "all";
  $("#category").value = "all";
}

function bind() {
  $("#search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = $("#q").value;
    render();
    $("#dogadanja").scrollIntoView({ block: "start" });
  });
  $("#q").addEventListener("input", () => {
    state.query = $("#q").value;
    render();
  });
  $("#district").addEventListener("change", () => {
    state.district = $("#district").value;
    render();
  });
  $("#period").addEventListener("change", () => {
    state.period = $("#period").value;
    if (state.period !== "today") state.eveningOnly = false;
    render();
  });
  $("#category").addEventListener("change", () => {
    state.category = $("#category").value;
    render();
  });
  $("#show-past").addEventListener("change", () => {
    state.showPast = $("#show-past").checked;
    render();
  });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button, a");
    if (!button) return;
    if (button.dataset.action === "subscribe") {
      event.preventDefault();
      openSubscribe();
    }
    if (button.dataset.action === "menu") $("#menu").showModal();
    if (button.dataset.action === "scroll-featured") {
      $("#featured").scrollBy({ left: 240, behavior: "smooth" });
    }
    if (button.dataset.action === "ics") {
      const item = state.events.find((entry) => entry.id === button.dataset.id);
      if (item) downloadIcs(`${item.id}.ics`, [item]);
    }
    if (button.dataset.action === "filtered-ics") downloadIcs("kastela-odabir.ics", selected());
    if (button.dataset.action === "reset") {
      resetFilters();
      render();
    }
    if (button.dataset.view) {
      state.view = button.dataset.view;
      try { localStorage.setItem("kastela-view", state.view); } catch { /* private mode */ }
      render();
    }
    if (button.dataset.intent) {
      const intent = button.dataset.intent;
      const was = button.getAttribute("aria-pressed") === "true";
      if (intent === "today") {
        state.period = was ? "all" : "today";
        state.eveningOnly = false;
      } else if (intent === "evening") {
        state.period = was ? "all" : "today";
        state.eveningOnly = !was;
      } else if (intent === "weekend") {
        state.period = was ? "all" : "weekend";
        state.eveningOnly = false;
      } else if (intent === "free") {
        state.freeOnly = !was;
      } else if (intent === "kids") {
        state.category = was ? "all" : "Djeca";
      }
      $("#period").value = state.period;
      $("#category").value = state.category;
      render();
      $("#dogadanja").scrollIntoView({ block: "start" });
    }
    if (button.dataset.district) {
      state.district = button.dataset.district;
      $("#district").value = state.district;
      $("#menu").close();
      render();
    }
  });
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
  $("#sub-copy").addEventListener("click", async () => {
    const url = $("#sub-url").value;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      $("#sub-url").select();
      document.execCommand("copy");
    }
    $("#sub-copy").textContent = "Poveznica je kopirana";
    setTimeout(() => { $("#sub-copy").textContent = "Kopiraj poveznicu"; }, 1800);
  });
}

async function init() {
  try {
    state.view = localStorage.getItem("kastela-view") === "grid" ? "grid" : "list";
  } catch { /* ignore */ }
  bind();
  try {
    const response = await fetch(new URL("data/events.csv", document.baseURI));
    if (!response.ok) throw new Error(`CSV nije dostupan (${response.status}).`);
    const { events, errors } = validateEvents(parseCsv(await response.text()));
    if (errors.length) throw new Error(errors[0]);
    state.events = events;
    render();
    const target = location.hash.replace("#", "");
    document.getElementById(target)?.scrollIntoView({ block: "center" });
  } catch (error) {
    $("#status").hidden = false;
    $("#status").textContent = error.message || "Događanja se nisu učitala.";
  }
}

init();

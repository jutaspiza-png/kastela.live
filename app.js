import { eventsToIcs, googleTemplateUrl, parseCsv, validateEvents } from "./scripts/ics.mjs";
import { filterEvents, foldText, isoWeekday, zagrebNow } from "./scripts/filter.mjs";
import { scheduleDecision } from "./scripts/push-time.mjs";
import { cityFromHost } from "./scripts/cities.mjs";

const WEEKDAYS = ["", "pon", "uto", "sri", "čet", "pet", "sub", "ned"];
const WEEKDAYS_LONG = ["", "ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota", "nedjelja"];
const MONTHS = ["", "sij", "velj", "ožu", "tra", "svi", "lip", "srp", "kol", "ruj", "lis", "stu", "pro"];
const MONTHS_LONG = ["", "siječnja", "veljače", "ožujka", "travnja", "svibnja", "lipnja", "srpnja", "kolovoza", "rujna", "listopada", "studenoga", "prosinca"];

const CITIES = [
  { id: "all", name: "Sve", inPlace: "Kaštelima i okolici" },
  { id: "kastela", name: "Kaštela", inPlace: "Kaštelima" },
  { id: "trogir", name: "Trogir", inPlace: "Trogiru" },
  { id: "solin", name: "Solin", inPlace: "Solinu" },
  { id: "split", name: "Split", inPlace: "Splitu" },
];

const state = {
  events: [],
  city: cityFromHost(globalThis.location?.hostname),
  query: "",
  district: "all",
  period: "all",
  category: "all",
  eveningOnly: false,
  freeOnly: false,
  showPast: false,
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
  const clock = event.start_time ? `${event.start_time}–${event.end_time}` : "sat nije objavljen";
  return `${weekday}, ${Number(day)}. ${MONTHS[Number(month)]} · ${clock}`;
}

function formatDay(date) {
  const [, month, day] = date.split("-");
  return `${WEEKDAYS_LONG[isoWeekday(date)]}, ${Number(day)}. ${MONTHS_LONG[Number(month)]}`;
}

function motif(category) {
  const paths = {
    Glazba: '<path d="M249.66,46.34l-40-40a8,8,0,0,0-11.31,11.32L200.69,20,140.52,80.16C117.73,68.3,92.21,69.29,76.75,84.74a42.27,42.27,0,0,0-9.39,14.37A8.24,8.24,0,0,1,59.81,104c-14.59.49-27.26,5.72-36.65,15.11C11.08,131.22,6,148.6,8.74,168.07,11.4,186.7,21.07,205.15,36,220s33.34,24.56,52,27.22A71.13,71.13,0,0,0,98.1,248c15.32,0,28.83-5.23,38.76-15.16,9.39-9.39,14.62-22.06,15.11-36.65a8.24,8.24,0,0,1,4.92-7.55,42.12,42.12,0,0,0,14.37-9.39c15.45-15.46,16.44-41,4.58-63.77L236,55.31l2.34,2.34a8,8,0,1,0,11.32-11.31ZM160,167.93a26.12,26.12,0,0,1-8.95,5.83,24.24,24.24,0,0,0-15,21.89c-.36,10.46-4,19.41-10.43,25.88-8.44,8.43-21,11.95-35.36,9.89C75,229.25,59.73,221.19,47.27,208.73S26.75,181,24.58,165.81c-2-14.37,1.46-26.92,9.89-35.36C40.94,124,49.89,120.37,60.35,120h0a24.22,24.22,0,0,0,21.89-15,26.12,26.12,0,0,1,5.83-9c5.49-5.49,13-8.13,21.38-8.13a49.38,49.38,0,0,1,19.13,4.19L108.5,112.19a32,32,0,1,0,35.31,35.31l20.08-20.08C170.41,142.71,169.47,158.41,160,167.93Zm-10.4-61.48a72.9,72.9,0,0,1,5.93,6.75l-15.42,15.42a32.22,32.22,0,0,0-12.68-12.68l15.42-15.43A73,73,0,0,1,149.55,106.45ZM112,128a16,16,0,0,1,16,16h0a16,16,0,1,1-16-16Zm48.85-32.85a86.94,86.94,0,0,0-6.68-6L176,67.31,188.69,80l-21.83,21.82A86.94,86.94,0,0,0,160.86,95.14ZM200,68.68,187.32,56,212,31.31,224.69,44ZM93.66,194.33a8,8,0,0,1-11.31,11.32l-32-32a8,8,0,0,1,11.32-11.31Z"/>',
    Djeca: '<path d="M217,34.8a15.94,15.94,0,0,0-14.82-1.71C188.15,38.55,159.82,47.71,128,47.71S67.84,38.55,53.79,33.09A16,16,0,0,0,32,48v55.77c0,35.84,9.65,69.65,27.18,95.18,18.16,26.46,42.6,41,68.82,41s50.66-14.57,68.82-41C214.35,173.44,224,139.63,224,103.79V48A16,16,0,0,0,217,34.8Zm-9,69c0,32.64-8.66,63.23-24.37,86.13C168.54,211.9,148.79,224,128,224s-40.54-12.1-55.63-34.08C56.66,167,48,136.43,48,103.79V48c15.11,5.87,45.58,15.71,80,15.71S192.9,53.87,208,48v55.81Zm-18,18.87A8,8,0,1,1,178,133.33c-2.68-3-8.85-5.33-14-5.33s-11.36,2.34-14,5.33A8,8,0,1,1,138,122.66c5.71-6.38,16.14-10.66,26-10.66S184.25,116.28,190,122.66ZM92,128c-5.19,0-11.36,2.34-14,5.33A8,8,0,1,1,66,122.66C71.75,116.28,82.18,112,92,112s20.25,4.28,26,10.66A8,8,0,1,1,106,133.33C103.36,130.34,97.19,128,92,128Zm76.45,45.19a52.9,52.9,0,0,1-80.9,0A8,8,0,1,1,99.72,162.8a36.89,36.89,0,0,0,56.56,0,8,8,0,0,1,12.17,10.39Z"/>',
    Predstava: '<path d="M229.52,74.21a8,8,0,0,0-7.13-2A44,44,0,0,0,168,41.67a44,44,0,0,0-80,0,44,44,0,0,0-54.4,30.51,8,8,0,0,0-9.4,9.65L54.76,211.67A16,16,0,0,0,70.34,224H185.66a16,16,0,0,0,15.58-12.33L231.79,81.83A8,8,0,0,0,229.52,74.21ZM76,56a27.68,27.68,0,0,1,13.11,3.26,8,8,0,0,0,11.56-5.34,28,28,0,0,1,54.66,0,8,8,0,0,0,11.56,5.34A28,28,0,0,1,207,76.54l-38.56,11-34.49-13.8a16,16,0,0,0-11.88,0L87.57,87.56,49,76.54A28,28,0,0,1,76,56ZM70.34,208,42.91,91.44l37.85,10.81L94.86,208ZM145,208H111L96.75,101.12,128,88.62l31.25,12.5Zm40.66,0H161.14l14.1-105.75,37.85-10.81Z"/>',
    Gastro: '<path d="M205.33,103.67,183.56,29.74A8,8,0,0,0,175.89,24H80.11a8,8,0,0,0-7.67,5.74L50.67,103.67a63.46,63.46,0,0,0,17.42,64.67A87.39,87.39,0,0,0,120,191.63V232H88a8,8,0,1,0,0,16h80a8,8,0,1,0,0-16H136V191.63a87.41,87.41,0,0,0,51.91-23.29A63.46,63.46,0,0,0,205.33,103.67ZM86.09,40h83.82L190,108.19c.09.3.17.6.25.9-21.42,7.68-45.54-1.6-58.63-8.23C106.43,88.11,86.43,86.49,71.68,88.93ZM177,156.65a71.69,71.69,0,0,1-98,0,47.55,47.55,0,0,1-13-48.46l.45-1.52c12-4.06,31.07-5.14,57.93,8.47,11.15,5.65,29.16,12.85,48.43,12.85a68.64,68.64,0,0,0,19.05-2.6A47.2,47.2,0,0,1,177,156.65Z"/>',
    Kultura: '<path d="M208,56a87.53,87.53,0,0,0-31.85,6c-14.32-29.7-43.25-44.46-44.57-45.12a8,8,0,0,0-7.16,0c-1.33.66-30.25,15.42-44.57,45.12A87.53,87.53,0,0,0,48,56a8,8,0,0,0-8,8v80a88,88,0,0,0,176,0V64A8,8,0,0,0,208,56ZM120,215.56A72.1,72.1,0,0,1,56,144V128.44A72.1,72.1,0,0,1,120,200Zm0-66.1a88,88,0,0,0-64-37.09V72.44A72.1,72.1,0,0,1,120,144ZM94.15,69.11c9.22-19.21,26.41-31.33,33.85-35.9,7.44,4.58,24.63,16.7,33.84,35.9A88.61,88.61,0,0,0,128,107.36,88.57,88.57,0,0,0,94.15,69.11ZM200,144a72.1,72.1,0,0,1-64,71.56V200a72.1,72.1,0,0,1,64-71.56Zm0-31.63a88,88,0,0,0-64,37.09V144a72.1,72.1,0,0,1,64-71.56Z"/>',
    "Sport i rekreacija": '<path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm76.52,147.42H170.9l-9.26-12.76,12.63-36.78,15-4.89,26.24,20.13A87.38,87.38,0,0,1,204.52,171.42Zm-164-34.3L66.71,117l15,4.89,12.63,36.78L85.1,171.42H51.48A87.38,87.38,0,0,1,40.47,137.12Zm10-50.64,5.51,18.6L40.71,116.77A87.33,87.33,0,0,1,50.43,86.48ZM109,152,97.54,118.65,128,97.71l30.46,20.94L147,152Zm91.07-46.92,5.51-18.6a87.33,87.33,0,0,1,9.72,30.29Zm-6.2-35.38-9.51,32.08-15.07,4.89L136,83.79V68.21l29.09-20A88.58,88.58,0,0,1,193.86,69.7ZM146.07,41.87,128,54.29,109.93,41.87a88.24,88.24,0,0,1,36.14,0ZM90.91,48.21l29.09,20V83.79L86.72,106.67l-15.07-4.89L62.14,69.7A88.58,88.58,0,0,1,90.91,48.21ZM63.15,187.42H83.52l7.17,20.27A88.4,88.4,0,0,1,63.15,187.42ZM110,214.13,98.12,180.71,107.35,168h41.3l9.23,12.71-11.83,33.42a88,88,0,0,1-36.1,0Zm55.36-6.44,7.17-20.27h20.37A88.4,88.4,0,0,1,165.31,207.69Z"/>',
    Tradicionalno: '<path d="M235.32,180l-36.24-36.25L162.62,23.46A21.76,21.76,0,0,0,128,12.93,21.76,21.76,0,0,0,93.38,23.46L56.92,143.76,20.68,180a16,16,0,0,0,0,22.62l32.69,32.69a16,16,0,0,0,22.63,0L124.28,187a40.68,40.68,0,0,0,3.72-4.29,40.68,40.68,0,0,0,3.72,4.29L180,235.32a16,16,0,0,0,22.63,0l32.69-32.69A16,16,0,0,0,235.32,180ZM64.68,224,32,191.32l12.69-12.69,32.69,32.69ZM120,158.75a23.85,23.85,0,0,1-7,17L88.68,200,56,167.32l13.65-13.66a8,8,0,0,0,2-3.34l37-122.22A5.78,5.78,0,0,1,120,29.78Zm23,17a23.85,23.85,0,0,1-7-17v-129a5.78,5.78,0,0,1,11.31-1.68l37,122.22a8,8,0,0,0,2,3.34l14.49,14.49-33.4,32ZM191.32,224l-12.56-12.57,33.39-32L224,191.32Z"/>',
  };
  return `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${paths[category] || paths.Glazba}</svg>`;
}

function calendarIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 3v4M16 3v4M4 10h16M12 13v5M9.5 15.5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
}

function cityMark(event) {
  const city = CITIES.find((item) => item.id === event.city);
  if (!city || city.id === "all") return "";
  return `<span class="city-mark" aria-hidden="true">${escapeHtml(city.name)}</span>`;
}

function calendarButton(event, variant) {
  const list = variant === "list";
  const label = list ? "Dodaj u kalendar" : "";
  return `<button class="${list ? "list-cal" : "cal"}" type="button" data-action="ics" data-id="${escapeHtml(event.id)}" aria-label="Dodaj ${escapeHtml(event.title)} u kalendar" aria-haspopup="dialog">${list ? "" : calendarIcon()}${label}</button>`;
}

function card(event) {
  const image = safeImage(event.image_url);
  const photo = image ? `<img data-photo alt="" src="${escapeHtml(image)}" />` : "";
  const free = event.is_free ? '<span class="free-badge">Besplatno</span>' : "";
  return `<article class="card" id="${escapeHtml(event.id)}">
    <div class="media ${catClass(event.category)}">
      <div class="motif">${motif(event.category)}</div>
      ${photo}
      <span class="badge">${escapeHtml(event.category)}</span>
      ${free}
      ${calendarButton(event, "card")}
    </div>
    <h3>${escapeHtml(event.title)}</h3>
    <p class="when">${escapeHtml(formatWhen(event))}</p>
    <p class="where">${escapeHtml(event.venue)} · ${escapeHtml(event.district)}</p>
    <p class="sr-only">${escapeHtml(event.description)}</p>
  </article>`;
}

function currentCity() {
  return CITIES.find((city) => city.id === state.city) || CITIES[0];
}

function eventWord(count) {
  return count % 10 === 1 && count % 100 !== 11 ? "događanje" : "događanja";
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

function placeFeatured(featuredSection) {
  const days = [...$("#results").querySelectorAll(":scope > .day")];
  if (!days.length || featuredSection.hidden) {
    $("#results").before(featuredSection);
    return;
  }
  const minimum = 4;
  let seen = 0;
  for (const day of days) {
    const items = [...day.querySelectorAll(":scope > ul > li")];
    const remain = minimum - seen;
    if (items.length > remain) {
      const ul = day.querySelector("ul");
      ul.replaceChildren(...items.slice(0, remain));
      day.after(featuredSection);
      const rest = day.cloneNode(true);
      rest.querySelector("ul").replaceChildren(...items.slice(remain));
      featuredSection.after(rest);
      return;
    }
    seen += items.length;
    if (seen >= minimum) {
      day.after(featuredSection);
      return;
    }
  }
  days.at(-1).after(featuredSection);
}

function placeSeason(section) {
  const nodes = [...$("#results").children];
  const featured = nodes.find((node) => node.id === "featured-section");
  const days = nodes.filter((node) => node.classList.contains("day"));
  if (!days.length) {
    (featured || $("#results")).after(section);
    return;
  }
  const seen = new Set();
  let anchor = null;
  let passed = !featured;
  for (const node of nodes) {
    if (node === featured) {
      passed = true;
      continue;
    }
    if (!passed || !node.classList.contains("day")) continue;
    seen.add(node.querySelector("h3")?.textContent || "");
    anchor = node;
    if (seen.size >= 2) break;
  }
  (anchor || days.at(-1)).after(section);
}

function setupFeaturedLoop() {
  const scroller = $("#featured");
  scroller.onscroll = null;
  const count = scroller.children.length;
  if (count < 2) return;
  const originals = [...scroller.children];
  const clones = () => originals.map((node) => {
    const copy = node.cloneNode(true);
    copy.removeAttribute("id");
    copy.setAttribute("aria-hidden", "true");
    copy.querySelectorAll("button, a").forEach((el) => el.setAttribute("tabindex", "-1"));
    return copy;
  });
  scroller.prepend(...clones());
  scroller.append(...clones());
  const metrics = () => {
    const gap = parseFloat(getComputedStyle(scroller).columnGap) || 0;
    const setWidth = (originals[0].offsetWidth + gap) * count;
    return setWidth;
  };
  const place = () => {
    const setWidth = metrics();
    if (!setWidth) return false;
    scroller.scrollLeft = setWidth;
    return true;
  };
  if (!place()) requestAnimationFrame(place);
  let lock = false;
  scroller.onscroll = () => {
    if (lock) return;
    const setWidth = metrics();
    if (!setWidth) return;
    const left = scroller.scrollLeft;
    let next = left;
    if (left < setWidth) next = left + setWidth;
    else if (left >= setWidth * 2) next = left - setWidth;
    if (next === left) return;
    lock = true;
    scroller.scrollLeft = next;
    lock = false;
  };
}

function inCity(event) {
  if (state.city === "all") return true;
  return (event.city || "kastela") === state.city;
}

function selected() {
  const now = zagrebNow();
  const events = state.events.filter(inCity);
  return filterEvents(events, criteria(), now).sort(
    (a, b) => `${a.date}T${a.start_time || "99:99"}`.localeCompare(`${b.date}T${b.start_time || "99:99"}`) || a.id.localeCompare(b.id),
  );
}

function render() {
  if ($("#event")?.open) $("#event").close();
  const city = currentCity();
  const now = zagrebNow();
  const cityEvents = state.events.filter(inCity);
  const upcoming = filterEvents(cityEvents, {}, now);
  $("#hero-title").innerHTML = `Što se događa<br />u ${escapeHtml(city.inPlace)}`;
  document.title = `${city.id === "all" ? "Kaštela" : city.name} — što se događa`;
  $("#hero-count").textContent = upcoming.length
    ? `${upcoming.length} nadolazećih ${eventWord(upcoming.length)}.`
    : `Kalendar događanja u ${city.inPlace}.`;
  document.querySelectorAll("[data-city]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.city === city.id));
  });
  const kastela = city.id === "kastela";
  $("#district").closest("label").hidden = !kastela;

  const events = selected();
  const featured = events.slice(0, 6);
  const featuredSection = $("#featured-section");
  featuredSection.hidden = featured.length === 0;
  $("#featured-nav").hidden = featured.length < 2;
  $("#featured").innerHTML = featured.map((event) => card(event)).join("");
  if (featured.length >= 2) setupFeaturedLoop();
  featuredSection.remove();
  const seasonSection = $("#season-section");
  seasonSection.remove();

  const results = $("#results");
  const title = $("#upcoming-title");
  const upcomingSection = results.closest(".block");
  if (!events.length) {
    upcomingSection.hidden = false;
    title.textContent = "Uskoro";
    const bare = !state.query && state.district === "all" && state.period === "all" && state.category === "all" && !state.eveningOnly && !state.freeOnly;
    const waiting = bare && !["all", "kastela", "trogir", "solin", "split"].includes(city.id);
    const message = waiting ? `Kalendar za ${city.name} još nema događanja.` : "Nema događanja za ovaj odabir.";
    results.innerHTML = `<div class="empty"><p>${escapeHtml(message)}</p>${waiting ? "" : '<button class="btn btn-dark" type="button" data-action="reset">Očisti filtere</button>'}</div>`;
    results.before(featuredSection);
    placeSeason(seasonSection);
  } else {
    upcomingSection.hidden = false;
    title.innerHTML = `Uskoro · <span class="count">${events.length}</span> ${eventWord(events.length)}`;
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
            ${cityMark(event)}
            <time datetime="${escapeHtml(event.date)}${event.start_time ? `T${escapeHtml(event.start_time)}` : ""}">${escapeHtml(event.start_time || "—")}</time>
            <div class="event-copy">
              <strong>${escapeHtml(event.title)}</strong>
              <p>${escapeHtml(event.venue)} · ${escapeHtml(event.district)}</p>
              <p>${escapeHtml(event.description)}</p>
            </div>
            <div class="event-side">
              <span class="day-badge ${catClass(event.category)}">${escapeHtml(event.category)}</span>
              ${calendarButton(event, "list")}
            </div>
          </li>`).join("")}
        </ul>
      </section>`).join("");
    placeFeatured(featuredSection);
    placeSeason(seasonSection);
  }

  $("#status").hidden = true;
  document.querySelectorAll("[data-intent]").forEach((button) => {
    const on =
      (button.dataset.intent === "weekend" && state.period === "weekend") ||
      (button.dataset.intent === "kids" && state.category === "Djeca") ||
      (button.dataset.intent === "concerts" && state.category === "Glazba");
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

function eventClock(event) {
  const day = formatDay(event.date);
  if (!event.start_time) return `${day} · sat nije objavljen`;
  const end = event.end_time ? `–${event.end_time}` : "";
  return `${day} · ${event.start_time}${end}`;
}

function openEvent(item) {
  const decision = scheduleDecision(item, new Date());
  const on = reminderOn(item.id);
  $("#event-kicker").textContent = item.category;
  $("#event-kicker").className = `event-kicker day-badge ${catClass(item.category)}`;
  $("#event-title").textContent = item.title;
  $("#event-when").textContent = eventClock(item);
  $("#event-where").textContent = `${item.venue} · ${item.district}`;
  $("#event-copy").textContent = item.description;
  $("#event-cal").dataset.id = item.id;
  const notify = $("#event-notify");
  notify.dataset.id = item.id;
  notify.textContent = on ? "Isključi obavijest" : "Dodaj samo obavijest";
  notify.disabled = !on && !decision.ok;
  $("#event-note").textContent = on
    ? "Obavijest je uključena. Stiže 8 sati prije početka."
    : (decision.ok ? "Obavijest stiže 8 sati prije početka." : decision.message);
  if ($("#menu")?.open) $("#menu").close();
  if (!$("#event").open) $("#event").showModal();
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function openCalendar(url) {
  window.location.assign(url);
}

function addOne(event) {
  if (isAppleMobile()) {
    openCalendar(new URL(`events/${event.id}.ics`, document.baseURI).href);
    return;
  }
  openCalendar(googleTemplateUrl(event));
}

const activeReminders = new Set();

function reminderOn(eventId) {
  return activeReminders.has(eventId);
}

function showPushStatus(title, message) {
  $("#push-status-title").textContent = title;
  $("#push-status-copy").textContent = message;
  if (!$("#push-status").open) $("#push-status").showModal();
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

let installPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  const button = $("#install-app");
  if (button) button.hidden = true;
});

function openInstallHelp() {
  const ios = isIos();
  $("#install-title").textContent = ios ? "Dodaj na početni zaslon" : "Instaliraj aplikaciju";
  $("#install-copy").innerHTML = ios
    ? `<p>Na iPhoneu preglednik sam ne može dodati ikonu. U Safariju:</p>
       <ol>
         <li>Dodirni Dijeli.</li>
         <li>Odaberi Dodaj na početni zaslon.</li>
         <li>Potvrdi Dodaj. Ikona Kaštela ostaje na zaslonu.</li>
       </ol>`
    : `<p>U izborniku Chromea odaberi Instaliraj aplikaciju. Nakon potvrde ikona se doda na radnu površinu ili početni zaslon.</p>`;
  if (!$("#install").open) $("#install").showModal();
}

async function installApp() {
  if ($("#menu")?.open) $("#menu").close();
  if (isStandalone()) {
    $("#install-app").hidden = true;
    return;
  }
  if (installPrompt) {
    try {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      if (choice.outcome === "accepted") $("#install-app").hidden = true;
      return;
    } catch {
      installPrompt = null;
    }
  }
  openInstallHelp();
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

async function deviceSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const json = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: json.keys };
}

async function readApi(response) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Obavijest se nije uključila. Poslužitelj nije vratio odgovor.");
  }
  if (!response.ok) throw new Error(data.message || "Obavijest se nije uključila.");
  return data;
}

async function refreshReminders() {
  activeReminders.clear();
  const subscription = await deviceSubscription();
  if (!subscription) return;
  try {
    const response = await fetch(new URL("api/push-reminders-list", document.baseURI), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    if (!response.ok) return;
    const data = await response.json();
    for (const item of data.reminders || []) activeReminders.add(item.event_id);
  } catch {
    activeReminders.clear();
  }
}

async function rememberSubscription(subscription) {
  const response = await fetch(new URL("api/push-subscriptions", document.baseURI), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });
  await readApi(response);
}

async function toggleReminder(event) {
  const decision = scheduleDecision(event, new Date());
  if (!reminderOn(event.id) && !decision.ok) {
    showPushStatus("Podsjetnik", decision.message);
    return;
  }
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    showPushStatus("Obavijesti", "Ovaj preglednik ne zna primiti obavijesti.");
    return;
  }
  if (isIos() && !isStandalone()) {
    if (!$("#push-ios").open) $("#push-ios").showModal();
    return;
  }
  if (Notification.permission === "denied") {
    showPushStatus("Obavijesti", "Obavijesti su isključene za ovu stranicu. U postavkama preglednika dopusti obavijesti, pa pokušaj opet.");
    return;
  }
  try {
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    showPushStatus("Obavijesti", "Bez dopuštenja ne možemo poslati obavijest.");
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await deviceSubscription();
  if (!subscription) {
    const config = await readApi(await fetch(new URL("api/push-config", document.baseURI)));
    if (!config.publicKey) throw new Error("Poslužitelj nema ključ za obavijesti.");
    const created = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
    subscription = { endpoint: created.endpoint, keys: created.toJSON().keys };
  }
  await rememberSubscription(subscription);
  const turningOff = reminderOn(event.id);
  const response = await fetch(new URL("api/push-reminders", document.baseURI), {
    method: turningOff ? "DELETE" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...subscription, eventId: event.id }),
  });
  const data = await readApi(response);
  await refreshReminders();
  if ($("#reminders").open) openReminderList();
  showPushStatus(turningOff ? "Obavijest" : "Podsjetnik", data.message || (response.ok ? "Spremljeno." : "Podsjetnik nije spremljen."));
  } catch (error) {
    showPushStatus("Obavijest", error.message || "Obavijest se nije uključila.");
  }
}

async function openReminderList() {
  const host = $("#reminder-list");
  const subscription = await deviceSubscription();
  if (!subscription) {
    host.innerHTML = "<p>Na ovom uređaju još nema uključenih obavijesti.</p>";
  } else {
    const response = await fetch(new URL("api/push-reminders-list", document.baseURI), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    const data = await readApi(response);
    const items = data.reminders || [];
    host.innerHTML = items.length
      ? items.map((item) => `<article class="reminder-row">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.date)} · ${escapeHtml(item.start_time)} · ${escapeHtml(item.venue)} ${escapeHtml(item.district)}</p>
          <p>Podsjetnik je uključen. Obavijest stiže 8 sati prije.</p>
          <button class="btn btn-line" type="button" data-action="reminder-off" data-id="${escapeHtml(item.event_id)}">Isključi</button>
        </article>`).join("")
      : "<p>Nema uključenih podsjetnika.</p>";
  }
  if ($("#menu").open) $("#menu").close();
  if (!$("#reminders").open) $("#reminders").showModal();
}

function downloadIcs(filename, events, calName) {
  const ics = eventsToIcs(events, { pageUrl: document.baseURI, calName });
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
  $("#category").addEventListener("change", () => {
    state.category = $("#category").value;
    render();
  });
  $("#show-past")?.addEventListener("change", () => {
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
    if (button.dataset.action === "install") installApp();
    if (button.dataset.action === "guide") {
      if ($("#menu").open) $("#menu").close();
      $("#guide").showModal();
    }
    if (button.dataset.action === "scroll-featured") {
      const scroller = $("#featured");
      const card = scroller.querySelector(".card");
      const gap = parseFloat(getComputedStyle(scroller).columnGap) || 0;
      const step = (card?.offsetWidth || 180) + gap;
      const dir = Number(button.dataset.dir || 1);
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      scroller.scrollBy({ left: step * dir, behavior });
    }
    if (button.dataset.action === "ics") {
      const item = state.events.find((entry) => entry.id === button.dataset.id);
      if (!item) return;
      openEvent(item);
      return;
    }
    if (button.dataset.action === "ics-private" || button.dataset.action === "ics-notify" || button.dataset.action === "reminder-off") {
      event.preventDefault();
      const item = state.events.find((entry) => entry.id === button.dataset.id);
      if ($("#event")?.open) $("#event").close();
      if (!item) return;
      if (button.dataset.action === "ics-private") addOne(item);
      else toggleReminder(item);
    }
    if (button.dataset.action === "reminders") {
      event.preventDefault();
      openReminderList();
    }
    if (button.dataset.action === "filtered-ics") downloadIcs("kastela-odabir.ics", selected());
    if (button.dataset.action === "reset") {
      resetFilters();
      render();
    }
    if (button.dataset.intent) {
      const intent = button.dataset.intent;
      const was = button.getAttribute("aria-pressed") === "true";
      if (intent === "weekend") {
        state.period = was ? "all" : "weekend";
        state.eveningOnly = false;
      } else if (intent === "kids") {
        state.category = was ? "all" : "Djeca";
      } else if (intent === "concerts") {
        state.category = was ? "all" : "Glazba";
      }
      $("#category").value = state.category;
      render();
      $("#dogadanja").scrollIntoView({ block: "start" });
    }
    if (button.dataset.city) {
      state.city = button.dataset.city;
      state.district = "all";
      $("#district").value = "all";
      if ($("#menu").open) $("#menu").close();
      render();
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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("sw.js", document.baseURI)).catch(() => {});
  }
  if (isStandalone()) $("#install-app").hidden = true;
  bind();
  try {
    const response = await fetch(new URL("data/events.csv", document.baseURI));
    if (!response.ok) throw new Error(`CSV nije dostupan (${response.status}).`);
    const { events, errors } = validateEvents(parseCsv(await response.text()));
    if (errors.length) throw new Error(errors[0]);
    state.events = events;
    await refreshReminders();
    render();
    const target = location.hash.replace("#", "");
    document.getElementById(target)?.scrollIntoView({ block: "center" });
  } catch (error) {
    $("#status").hidden = false;
    $("#status").textContent = error.message || "Događanja se nisu učitala.";
  }
}

init();

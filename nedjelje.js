import { foldText } from "./scripts/filter.mjs";

const MONTHS = ["", "siječnja", "veljače", "ožujka", "travnja", "svibnja", "lipnja", "srpnja", "kolovoza", "rujna", "listopada", "studenoga", "prosinca"];

const state = { city: "all", district: "all", chain: "all", query: "" };
let data = null;

const $ = (selector) => document.querySelector(selector);

function longDate(iso) {
  const [year, month, day] = iso.split("-");
  return `${Number(day)}. ${MONTHS[Number(month)]} ${year}.`;
}

function districtsFor(city) {
  const names = new Set();
  for (const store of data.stores) {
    if (city !== "all" && store.city !== city) continue;
    if (store.district) names.add(store.district);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "hr"));
}

function matches(store) {
  if (state.city !== "all" && store.city !== state.city) return false;
  if (state.district !== "all" && store.district !== state.district) return false;
  if (state.chain !== "all" && store.chain !== state.chain) return false;
  const query = foldText(state.query).trim();
  if (!query) return true;
  const haystack = foldText([store.chain, store.name, store.city, store.district, store.address].join(" "));
  return haystack.includes(query);
}

function renderFilters() {
  const district = $("#district");
  const names = state.city === "Kaštela" ? districtsFor("Kaštela") : districtsFor(state.city);
  const showPlaces = state.city === "Kaštela" || (state.city !== "all" && names.length > 0);
  district.closest("label").hidden = !showPlaces;
  const current = names.includes(state.district) ? state.district : "all";
  state.district = current;
  district.innerHTML = `<option value="all">${state.city === "Kaštela" ? "Sva naselja" : "Sva mjesta"}</option>${names.map((name) => `<option>${name}</option>`).join("")}`;
  district.value = current;
  document.querySelectorAll("[data-city]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.city === state.city));
  });
  document.querySelectorAll("[data-chain]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.chain === state.chain));
  });
}

function render() {
  renderFilters();
  const rows = data.stores.filter(matches).sort((a, b) => Number(b.open) - Number(a.open) || a.city.localeCompare(b.city, "hr") || a.address.localeCompare(b.address, "hr"));
  const open = rows.filter((store) => store.open).length;
  $("#store-count").textContent = rows.length ? `${open} otvoreno · ${rows.length - open} ne radi` : "Nema poslovnica za ovaj odabir.";
  $("#stores").innerHTML = rows.map((store) => {
    const place = [store.district, store.city].filter(Boolean).join(", ");
    const hours = store.open ? store.hours : "Ne radi";
    return `<article class="store${store.open ? "" : " is-closed"}">
      <div>
        <p class="store-chain">${store.chain}</p>
        <h2>${store.name}</h2>
        <p>${store.address}</p>
        <p>${place}</p>
      </div>
      <p class="store-hours">${hours}</p>
    </article>`;
  }).join("");
}

function bind() {
  $("#search-form").addEventListener("submit", (event) => event.preventDefault());
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.city) {
      state.city = button.dataset.city;
      state.district = "all";
      render();
    }
    if (button.dataset.chain) {
      state.chain = button.dataset.chain;
      render();
    }
  });
  $("#district").addEventListener("change", () => {
    state.district = $("#district").value;
    render();
  });
  $("#q").addEventListener("input", () => {
    state.query = $("#q").value;
    render();
  });
}

async function init() {
  bind();
  const response = await fetch(new URL("data/sunday-stores.json", document.baseURI));
  data = await response.json();
  $("#sunday-date").textContent = longDate(data.sunday);
  $("#updated").textContent = `Ažurirano ${longDate(data.lastUpdated)}. ${data.note}`;
  render();
}

init();

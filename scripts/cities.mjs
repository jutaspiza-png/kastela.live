const HOST_CITIES = ["kastela", "trogir", "solin", "split"];

export function cityFromHost(hostname, fallback = "kastela") {
  const host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "").split(":")[0];
  const name = host.startsWith("www.") ? host.slice(4) : host;
  const label = name.endsWith(".live") ? name.slice(0, -5) : "";
  return HOST_CITIES.includes(label) ? label : fallback;
}

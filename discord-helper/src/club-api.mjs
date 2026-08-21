const DEFAULT_API = "https://windsage.nimrod.bio";

export function apiBase(cfg) {
  return String(cfg?.apiUrl || DEFAULT_API).replace(/\/+$/, "");
}

async function getJson(url, timeoutMs = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchClubWind(cfg, query) {
  const q = encodeURIComponent(String(query || "").trim());
  return getJson(`${apiBase(cfg)}/v1/club/wind?q=${q}`);
}

export async function fetchClubGlance(cfg) {
  return getJson(`${apiBase(cfg)}/v1/club/glance`);
}

export async function fetchHealth(cfg) {
  return getJson(`${apiBase(cfg)}/health`);
}

export function formatWindLine(row) {
  const wind = row?.windAvg == null ? "—" : `${row.windAvg} קשר`;
  const dir = row?.windDirectionHe ? ` ${row.windDirectionHe}` : "";
  const gust = row?.windMax == null ? "" : ` (משב ${row.windMax})`;
  const st = row?.statusHe || "";
  const name = row?.labelHe || row?.id || "ספוט";
  return `${name} · ${st} · ${wind}${dir}${gust}`.replace(/\s+/g, " ").trim();
}

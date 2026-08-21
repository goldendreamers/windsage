import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchProviderCurrent } from './providers/index.mjs';

const SPOTS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'clubSpots.json'), 'utf8'),
);

const COMPASS_HE = [
  'צפון',
  'צפון-מזרח',
  'מזרח',
  'דרום-מזרח',
  'דרום',
  'דרום-מערב',
  'מערב',
  'צפון-מערב',
];

export const CLUB_DEFAULT_RULE = {
  metric: 'wind_avg',
  threshold: 15,
  comparison: 'gte',
  sustainedMinutes: 20,
};

export function listClubSpots() {
  return SPOTS.map((s) => ({
    id: s.id,
    labelHe: s.labelHe,
    names: s.names,
    provider: s.provider,
    stationId: s.stationId,
    kind: s.kind,
    windguruUrl: s.windguruUrl || null,
  }));
}

export function normalizeClubQuery(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[׳'"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchClubSpot(query) {
  const q = normalizeClubQuery(query);
  if (!q) return null;
  for (const spot of SPOTS) {
    if (spot.id === q || String(spot.stationId) === q) return spot;
    for (const name of spot.names || []) {
      const n = normalizeClubQuery(name);
      if (!n) continue;
      if (q === n || n.includes(q) || q.includes(n)) return spot;
    }
  }
  return null;
}

export function windDirectionNameHe(deg) {
  if (deg == null || !Number.isFinite(Number(deg))) return null;
  const d = ((Number(deg) % 360) + 360) % 360;
  return COMPASS_HE[Math.round(d / 45) % 8];
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function clubStatusHe(windAvg) {
  const v = num(windAvg);
  if (v == null) return 'מחכה';
  if (v >= CLUB_DEFAULT_RULE.threshold) return 'מחזיק';
  if (v >= CLUB_DEFAULT_RULE.threshold - 3) return 'עולה';
  return 'מת';
}

export function publicClubReading(spot, reading) {
  const windAvg = num(reading?.wind_avg);
  const windMax = num(reading?.wind_max);
  const dir = num(reading?.wind_direction);
  return {
    id: spot.id,
    labelHe: spot.labelHe,
    stationId: spot.stationId,
    provider: spot.provider,
    windguruUrl: spot.windguruUrl || null,
    windAvg,
    windMax,
    windDirection: dir,
    windDirectionHe: windDirectionNameHe(dir),
    statusHe: clubStatusHe(windAvg),
    thresholdKt: CLUB_DEFAULT_RULE.threshold,
    holdMinutes: CLUB_DEFAULT_RULE.sustainedMinutes,
  };
}

function followStub(spot) {
  return {
    id: `club:${spot.id}`,
    provider: spot.provider || 'windguru',
    stationId: String(spot.stationId),
    kind: spot.kind === 'spot' ? 'spot' : 'station',
    nickname: spot.labelHe,
    enabled: true,
    rule: { ...CLUB_DEFAULT_RULE },
  };
}

export async function readClubSpot(spot) {
  const reading = await fetchProviderCurrent(followStub(spot));
  return publicClubReading(spot, reading);
}

export async function readClubWind(query) {
  const spot = matchClubSpot(query);
  if (!spot) return null;
  return readClubSpot(spot);
}

export async function readClubGlance() {
  const rows = [];
  for (const spot of SPOTS) {
    try {
      rows.push(await readClubSpot(spot));
    } catch (err) {
      rows.push({
        id: spot.id,
        labelHe: spot.labelHe,
        stationId: spot.stationId,
        provider: spot.provider,
        windguruUrl: spot.windguruUrl || null,
        windAvg: null,
        windMax: null,
        windDirection: null,
        windDirectionHe: null,
        statusHe: 'מחכה',
        error: err?.message || 'fetch failed',
        thresholdKt: CLUB_DEFAULT_RULE.threshold,
        holdMinutes: CLUB_DEFAULT_RULE.sustainedMinutes,
      });
    }
  }
  const rank = { מחזיק: 0, עולה: 1, מת: 2, מחכה: 3 };
  rows.sort((a, b) => (rank[a.statusHe] ?? 9) - (rank[b.statusHe] ?? 9));
  return rows;
}

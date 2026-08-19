/**
 * Names-only dumps of Windguru live stations (station_list, not forecast spots).
 * One-name-per-line of every named live station is ~100 KB.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAME_FILES = {
  all: 'windguru-live-station-names.txt',
  unique: 'windguru-live-station-names.unique.txt',
  uniqueJson: 'windguru-live-station-names.json',
  compact: 'windguru-live-stations.json',
  meta: 'windguru-live-station-names.meta.json',
};

export function defaultDataDir() {
  if (process.env.WINDSAGE_DATA) return process.env.WINDSAGE_DATA;
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
}

/** Keep first-seen order. */
export function uniqueInOrder(values) {
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function namedListFromCatalog(rows) {
  const names = [];
  for (const row of rows || []) {
    const name = String(row?.sourceName ?? row?.name ?? row?.spotname ?? '').trim();
    if (name) names.push(name);
  }
  return names;
}

export function compactStationsFromCatalog(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    const stationId = String(row?.stationId ?? row?.id_station ?? '').trim();
    if (!stationId || seen.has(stationId)) continue;
    seen.add(stationId);
    const sourceName = String(row?.sourceName ?? row?.name ?? row?.spotname ?? '').trim();
    out.push({
      provider: 'windguru',
      stationId,
      kind: 'station',
      sourceName: sourceName || `Station ${stationId}`,
      liveStationId: stationId,
      linkedLiveStation: null,
      liveLinkWarning: null,
    });
  }
  return out;
}

export function buildWindguruNameFiles(rows) {
  const named = namedListFromCatalog(rows);
  const unique = uniqueInOrder(named);
  const allLines = named.length ? `${named.join('\n')}\n` : '';
  const uniqueLines = unique.length ? `${unique.join('\n')}\n` : '';
  const uniqueJson = `${JSON.stringify(unique)}\n`;
  const compact = compactStationsFromCatalog(rows);
  const compactJson = `${JSON.stringify(compact)}\n`;
  const meta = {
    source: 'Windguru public station_list (https://www.windguru.cz/int/iapi.php?q=station_list)',
    scope: 'live sensor stations only — not forecast spots',
    writtenAt: new Date().toISOString(),
    liveStations: compact.length,
    named: named.length,
    uniqueNames: unique.length,
    files: {
      oneNamePerLine: { bytes: Buffer.byteLength(allLines), name: NAME_FILES.all },
      uniqueNamesOnePerLine: { bytes: Buffer.byteLength(uniqueLines), name: NAME_FILES.unique },
      uniqueNamesJsonArray: { bytes: Buffer.byteLength(uniqueJson), name: NAME_FILES.uniqueJson },
    },
  };
  return { named, unique, allLines, uniqueLines, uniqueJson, compact, compactJson, meta };
}

export async function writeWindguruNameFiles(dir, built) {
  if (!dir) return;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, NAME_FILES.all), built.allLines, 'utf8');
  await fs.writeFile(path.join(dir, NAME_FILES.unique), built.uniqueLines, 'utf8');
  await fs.writeFile(path.join(dir, NAME_FILES.uniqueJson), built.uniqueJson, 'utf8');
  await fs.writeFile(path.join(dir, NAME_FILES.compact), built.compactJson, 'utf8');
  await fs.writeFile(path.join(dir, NAME_FILES.meta), `${JSON.stringify(built.meta, null, 2)}\n`, 'utf8');
  return built.meta;
}

export async function readCompactCatalog(dir = defaultDataDir()) {
  try {
    const raw = await fs.readFile(path.join(dir, NAME_FILES.compact), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? compactStationsFromCatalog(parsed) : [];
  } catch {
    return [];
  }
}

export async function persistWindguruNameFiles(rows, extraDirs = []) {
  const built = buildWindguruNameFiles(rows);
  const dirs = [defaultDataDir(), ...extraDirs.filter(Boolean)];
  const seen = new Set();
  for (const dir of dirs) {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    await writeWindguruNameFiles(resolved, built);
  }
  return built.meta;
}

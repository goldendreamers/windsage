/**
 * Timed monitoring (pause / keep-on). Keep in sync with code/shared/defaults.ts.
 */

export function applyMonitoringSchedule(station, nowMs = Date.now()) {
  if (!station || typeof station !== 'object') return station;
  const raw = station.monitoringUntilMs;
  if (raw == null) return station;
  const untilMs = Number(raw);
  if (!Number.isFinite(untilMs) || untilMs > nowMs) return station;
  const currentlyOn = station.enabled !== false;
  return {
    ...station,
    enabled: !currentlyOn,
    monitoringUntilMs: null,
  };
}

export function applyMonitoringSchedules(stations, nowMs = Date.now()) {
  const list = Array.isArray(stations) ? stations : [];
  let changed = false;
  const next = list.map((station) => {
    const applied = applyMonitoringSchedule(station, nowMs);
    if (applied !== station) changed = true;
    return applied;
  });
  return { stations: next, changed };
}

export function applyBagMonitoringSchedules(bag, nowMs = Date.now()) {
  if (!bag || !Array.isArray(bag.stations) || !bag.stations.length) return false;
  const { stations, changed } = applyMonitoringSchedules(bag.stations, nowMs);
  if (!changed) return false;
  bag.stations = stations;
  return true;
}

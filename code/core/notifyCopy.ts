import { displayName } from '../shared/defaults';
import type { CheckResult, FollowedStation, MetricKey } from '../shared/types';

function metricPhrase(metric: MetricKey): { name: string; unitLong: string; unitShort: string } {
  switch (metric) {
    case 'wind_avg':
      return { name: 'average wind speed', unitLong: 'knots', unitShort: 'kt' };
    case 'wind_max':
      return { name: 'wind gust speed', unitLong: 'knots', unitShort: 'kt' };
    case 'temperature':
      return { name: 'temperature', unitLong: 'degrees Celsius', unitShort: '°C' };
    case 'wave_height':
      return { name: 'wave height', unitLong: 'meters', unitShort: 'm' };
  }
}

function comparisonPhrase(comparison: FollowedStation['rule']['comparison']): string {
  return comparison === 'lte' ? 'at or below' : 'at or above';
}

function formatNumber(value: number | null | undefined, digits = 1): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value).toFixed(digits);
}

function nearestLiveSentence(station: FollowedStation): string {
  const linked = station.linkedLiveStation;
  if (!linked?.id) return '';
  const name = (linked.name || linked.spotname || 'a nearby station').trim();
  const km =
    linked.distanceKm != null && Number.isFinite(Number(linked.distanceKm))
      ? ` about ${Number(linked.distanceKm).toFixed(1)} km away`
      : '';
  return ` This forecast spot has no live sensor of its own, so the reading comes from the nearest live station “${name}” (Windguru #${linked.id})${km}.`;
}

/** Plain-language push copy for threshold alerts. */
export function formatAlertNotificationCopy(
  station: FollowedStation,
  result: CheckResult,
): { title: string; body: string } {
  const place = displayName(station);
  const metric = metricPhrase(station.rule.metric);
  const cmp = comparisonPhrase(station.rule.comparison);
  const threshold = formatNumber(station.rule.threshold) ?? String(station.rule.threshold);
  const minutes = Math.max(1, Number(station.rule.sustainedMinutes) || 1);
  const current = formatNumber(result.metricValue);
  const currentText =
    current == null
      ? 'unavailable right now'
      : `${current} ${metric.unitLong || metric.unitShort}`.trim();

  const title = `Windsage alert at ${place}`;
  const body =
    `Your conditions were met at ${place}. ` +
    `The ${metric.name} is ${currentText}, and it has stayed ${cmp} your limit of ${threshold} ${metric.unitLong || metric.unitShort} ` +
    `for ${minutes} minutes or longer.` +
    nearestLiveSentence(station);

  return { title, body };
}

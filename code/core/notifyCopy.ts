import { displayName } from '../shared/defaults';
import type { CheckResult, FollowedStation, MetricKey } from '../shared/types';

function metricPhrase(metric: MetricKey): { name: string; unitLong: string; unitShort: string } {
  switch (metric) {
    case 'wind_avg':
      return { name: 'רוח ממוצעת', unitLong: 'קשר', unitShort: 'kt' };
    case 'wind_max':
      return { name: 'משב', unitLong: 'קשר', unitShort: 'kt' };
    case 'temperature':
      return { name: 'טמפרטורה', unitLong: 'מעלות', unitShort: '°C' };
    case 'wave_height':
      return { name: 'גלים', unitLong: 'מטר', unitShort: 'm' };
  }
}

function comparisonPhrase(comparison: FollowedStation['rule']['comparison']): string {
  return comparison === 'lte' ? 'מתחת או שווה ל' : 'מעל או שווה ל';
}

function formatNumber(value: number | null | undefined, digits = 1): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value).toFixed(digits);
}

function forecastAlertSentence(station: FollowedStation): string {
  const isForecastOnly =
    station.kind === 'spot' && !!(station.linkedLiveStation || station.liveLinkWarning);
  if (!isForecastOnly) return '';
  const linked = station.linkedLiveStation;
  const modelNote =
    ' לספוט הזה אין חיישן חי, אז ההתראה לפי שעת המודל.';
  if (!linked?.id) return modelNote;
  const name = (linked.name || linked.spotname || 'תחנה קרובה').trim();
  const km =
    linked.distanceKm != null && Number.isFinite(Number(linked.distanceKm))
      ? ` כ־${Number(linked.distanceKm).toFixed(1)} ק״מ`
      : '';
  return `${modelNote} התחנה החיה הקרובה «${name}» (Windguru #${linked.id})${km} לצפייה בלבד.`;
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
      ? 'לא זמין עכשיו'
      : `${current} ${metric.unitLong || metric.unitShort}`.trim();

  const title = `Windsage · ${place} מחזיק`;
  const body =
    `התנאים שלך הוחזקו ב-${place}. ` +
    `${metric.name} עכשיו ${currentText}, ${cmp} סף ${threshold} ${metric.unitLong || metric.unitShort} ` +
    `כבר ${minutes} דקות.` +
    forecastAlertSentence(station);

  return { title, body };
}

/**
 * Human-readable push notification copy (cloud).
 * Prefer full sentences over symbols / shorthand.
 */

function displayName(station) {
  const nick = (station?.nickname || '').trim();
  if (nick) return nick;
  const source = (station?.sourceName || '').trim();
  if (source) return source;
  const linked =
    (station?.linkedLiveStation?.spotname || '').trim() ||
    (station?.linkedLiveStation?.name || '').trim();
  if (linked) return linked;
  return station?.kind === 'spot'
    ? `spot ${station.stationId}`
    : `station ${station.stationId}`;
}

function metricPhrase(metric) {
  switch (metric) {
    case 'wind_avg':
      return { name: 'average wind speed', unitLong: 'knots', unitShort: 'kt' };
    case 'wind_max':
      return { name: 'wind gust speed', unitLong: 'knots', unitShort: 'kt' };
    case 'temperature':
      return { name: 'temperature', unitLong: 'degrees Celsius', unitShort: '°C' };
    case 'wave_height':
      return { name: 'wave height', unitLong: 'meters', unitShort: 'm' };
    default:
      return { name: String(metric || 'condition'), unitLong: '', unitShort: '' };
  }
}

function comparisonPhrase(comparison) {
  return comparison === 'lte' ? 'at or below' : 'at or above';
}

function formatNumber(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value).toFixed(digits);
}

function forecastAlertSentence(station) {
  const isForecastOnly =
    station?.kind === 'spot' && !!(station.linkedLiveStation || station.liveLinkWarning);
  if (!isForecastOnly) return '';
  const linked = station?.linkedLiveStation;
  const modelNote =
    ' This spot has no live Windguru sensor, so the alert uses the model forecast hour for this pin.';
  if (!linked?.id) return modelNote;
  const name = (linked.name || linked.spotname || 'a nearby station').trim();
  const km =
    linked.distanceKm != null && Number.isFinite(Number(linked.distanceKm))
      ? ` about ${Number(linked.distanceKm).toFixed(1)} km away`
      : '';
  return `${modelNote} The nearest live station “${name}” (Windguru #${linked.id})${km} is shown for reference only.`;
}

/**
 * @returns {{ title: string, body: string }}
 */
export function formatAlertNotificationCopy(station, result) {
  const place = displayName(station);
  const metric = metricPhrase(station?.rule?.metric);
  const cmp = comparisonPhrase(station?.rule?.comparison);
  const threshold = formatNumber(station?.rule?.threshold) ?? String(station?.rule?.threshold ?? '');
  const minutes = Math.max(1, Number(station?.rule?.sustainedMinutes) || 1);
  const current = formatNumber(result?.metricValue);
  const currentText =
    current == null
      ? 'unavailable right now'
      : `${current} ${metric.unitLong || metric.unitShort}`.trim();

  const title = `Windsage alert at ${place}`;
  const body =
    `Your conditions were met at ${place}. ` +
    `The ${metric.name} is ${currentText}, and it has stayed ${cmp} your limit of ${threshold} ${metric.unitLong || metric.unitShort} ` +
    `for ${minutes} minutes or longer.` +
    forecastAlertSentence(station);

  return { title, body };
}

export function formatTestNotificationCopy(customMessage) {
  if (typeof customMessage === 'string' && customMessage.trim()) {
    return {
      title: 'Windsage test notification',
      body: customMessage.trim(),
    };
  }
  return {
    title: 'Windsage test notification',
    body:
      'This is a test alert from Windsage. If you can see this on your lock screen or notification shade, phone alerts are working. ' +
      'When wind (or the metric you chose) stays above or below your limit long enough, you will get a similar message automatically.',
  };
}

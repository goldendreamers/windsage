/**
 * Human-readable push notification copy (cloud). Hebrew for the club.
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
      return { name: 'רוח ממוצעת', unitLong: 'קשר', unitShort: 'kt' };
    case 'wind_max':
      return { name: 'משב', unitLong: 'קשר', unitShort: 'kt' };
    case 'temperature':
      return { name: 'טמפרטורה', unitLong: 'מעלות', unitShort: '°C' };
    case 'wave_height':
      return { name: 'גלים', unitLong: 'מטר', unitShort: 'm' };
    default:
      return { name: String(metric || 'תנאי'), unitLong: '', unitShort: '' };
  }
}

function comparisonPhrase(comparison) {
  return comparison === 'lte' ? 'מתחת או שווה ל' : 'מעל או שווה ל';
}

function formatNumber(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value).toFixed(1);
}

function forecastAlertSentence(station) {
  const isForecastOnly =
    station?.kind === 'spot' && !!(station.linkedLiveStation || station.liveLinkWarning);
  if (!isForecastOnly) return '';
  const linked = station?.linkedLiveStation;
  const modelNote = ' לספוט הזה אין חיישן חי, אז ההתראה לפי שעת המודל.';
  if (!linked?.id) return modelNote;
  const name = (linked.name || linked.spotname || 'תחנה קרובה').trim();
  const km =
    linked.distanceKm != null && Number.isFinite(Number(linked.distanceKm))
      ? ` כ־${Number(linked.distanceKm).toFixed(1)} ק״מ`
      : '';
  return `${modelNote} התחנה החיה הקרובה «${name}» (Windguru #${linked.id})${km} לצפייה בלבד.`;
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
    current == null ? 'לא זמין עכשיו' : `${current} ${metric.unitLong || metric.unitShort}`.trim();

  const title = `Windsage · ${place} מחזיק`;
  const body =
    `התנאים שלך הוחזקו ב-${place}. ` +
    `${metric.name} עכשיו ${currentText}, ${cmp} סף ${threshold} ${metric.unitLong || metric.unitShort} ` +
    `כבר ${minutes} דקות.` +
    forecastAlertSentence(station);

  return { title, body };
}

export function formatTestNotificationCopy(customMessage) {
  if (typeof customMessage === 'string' && customMessage.trim()) {
    return {
      title: 'Windsage · טסט',
      body: customMessage.trim(),
    };
  }
  return {
    title: 'Windsage · טסט',
    body:
      'זו התראת בדיקה. אם אתה רואה אותה במסך נעול — הפעמון עובד. ' +
      'כשהרוח תחזיק מעל הסף שלך מספיק זמן תגיע הודעה דומה.',
  };
}

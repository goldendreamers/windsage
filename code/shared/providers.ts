/** Weather data sources Windsage can follow. */
export type StationProvider =
  | 'windguru'
  | 'ndbc'
  | 'openmeteo'
  | 'location'
  | 'synoptic'
  | 'tempest'
  | 'windfinder';

/** Sources shown in Add Station. Tempest / Windfinder stay in the type for old saves. */
export const STATION_PROVIDERS: StationProvider[] = [
  'windguru',
  'location',
  'ndbc',
  'openmeteo',
  'synoptic',
];

const KNOWN_PROVIDERS: StationProvider[] = [
  ...STATION_PROVIDERS,
  'tempest',
  'windfinder',
];

export const PROVIDER_META: Record<
  StationProvider,
  {
    label: string;
    short: string;
    /** Shown in Add Station. */
    hint: string;
    placeholder: string;
    /** Needs a server-side API token to poll. */
    needsToken: boolean;
  }
> = {
  windguru: {
    label: 'Windguru',
    short: 'WG',
    hint: 'Paste a Windguru spot or live station URL / number.',
    placeholder: 'https://www.windguru.cz/station/2259 or 2259',
    needsToken: false,
  },
  location: {
    label: 'Map / Address',
    short: 'MAP',
    hint: 'Pick an address or drop a pin — blends the closest accurate live sensors (distance, coast vs inland, elevation).',
    placeholder: 'Herzliya Marina or tap the map',
    needsToken: false,
  },
  ndbc: {
    label: 'NDBC / NOAA',
    short: 'NDBC',
    hint: 'US buoy / CMAN station ID (wind + waves when available).',
    placeholder: '41009 or ndbc.noaa.gov/station_page.php?station=41009',
    needsToken: false,
  },
  openmeteo: {
    label: 'Open-Meteo',
    short: 'OM',
    hint: 'Any lat,lon or place name (model “now”, not a physical anemometer).',
    placeholder: '32.16,34.80 or Herzliya',
    needsToken: false,
  },
  synoptic: {
    label: 'Synoptic / MesoWest',
    short: 'SYN',
    hint: 'Airport ICAO or mesonet id. Example: LLBG or KSLC.',
    placeholder: 'LLBG or KSLC',
    needsToken: false,
  },
  tempest: {
    label: 'Tempest / WeatherFlow',
    short: 'TMP',
    hint: 'Removed from Add Station (no account).',
    placeholder: '',
    needsToken: true,
  },
  windfinder: {
    label: 'Windfinder',
    short: 'WF',
    hint: 'Removed from Add Station (paid API).',
    placeholder: '',
    needsToken: true,
  },
};

export function normalizeProvider(value: unknown): StationProvider {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if ((KNOWN_PROVIDERS as string[]).includes(v)) return v as StationProvider;
  return 'windguru';
}

export function providerLabel(provider: StationProvider | string | null | undefined): string {
  return PROVIDER_META[normalizeProvider(provider)].label;
}

/** Only Windguru distinguishes forecast spots vs live stations. */
export function providerHasSpotStationKinds(
  provider: StationProvider | string | null | undefined,
): boolean {
  return normalizeProvider(provider) === 'windguru';
}

/** Map pins are lat/lon blends — not a pasteable station ID/URL. */
export function providerAllowsSourceIdEdit(
  provider: StationProvider | string | null | undefined,
): boolean {
  return normalizeProvider(provider) !== 'location';
}

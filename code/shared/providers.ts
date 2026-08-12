/** Weather data sources Windsage can follow. */
export type StationProvider =
  | 'windguru'
  | 'ndbc'
  | 'openmeteo'
  | 'location'
  | 'synoptic'
  | 'tempest'
  | 'windfinder';

export const STATION_PROVIDERS: StationProvider[] = [
  'windguru',
  'location',
  'ndbc',
  'openmeteo',
  'synoptic',
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
    hint: 'Pick an address or drop a pin — blends nearby stations by distance, accuracy & rating.',
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
    hint: 'Mesonet station ID (needs SYNOPTIC_TOKEN on the server).',
    placeholder: 'KSLC or stid from synopticdata.com',
    needsToken: true,
  },
  tempest: {
    label: 'Tempest / WeatherFlow',
    short: 'TMP',
    hint: 'Tempest station id (needs TEMPEST_TOKEN; usually your own stations).',
    placeholder: '12345 or tempestwx.com/station/12345',
    needsToken: true,
  },
  windfinder: {
    label: 'Windfinder',
    short: 'WF',
    hint: 'Business API only — needs WINDFINDER_API_KEY on the server.',
    placeholder: 'report/tarifa or windfinder.com/report/tarifa',
    needsToken: true,
  },
};

export function normalizeProvider(value: unknown): StationProvider {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if ((STATION_PROVIDERS as string[]).includes(v)) return v as StationProvider;
  return 'windguru';
}

export function providerLabel(provider: StationProvider | string | null | undefined): string {
  return PROVIDER_META[normalizeProvider(provider)].label;
}

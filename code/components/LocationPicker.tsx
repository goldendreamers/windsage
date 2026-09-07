import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getCloudBaseUrl } from '../core/cloud';
import { colors } from '../shared/theme';
import type { UiMode } from '../shared/types';
import { normalizeUiMode } from '../shared/defaults';

type Suggestion = {
  description: string;
  placeId?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export type LocationPick = {
  lat: number;
  lon: number;
  address: string;
};

type MapPreview = {
  address?: string;
  wind?: {
    wind_avg?: number | null;
    wind_max?: number | null;
    wind_direction?: number | null;
    temperature?: number | null;
  } | null;
  nearby?: NearbyMark[];
};

type NearbyMark = {
  provider: string;
  stationId: string;
  name: string;
  distanceKm: number;
  lat: number;
  lon: number;
  wind_avg?: number | null;
  wind_max?: number | null;
  wind_direction?: number | null;
};

type Props = {
  onPicked: (pick: LocationPick) => void;
  initial?: LocationPick | null;
  uiMode?: UiMode;
};

function friendlyGeoError(raw: unknown, fallback: string): string {
  const msg =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
        ? raw
        : fallback;
  const lower = msg.toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('load failed')
  ) {
    return 'Couldn’t reach the map server. Check your connection and try again.';
  }
  if (lower.includes('could not load map') || lower.includes('map library')) {
    return 'Map couldn’t load. You can still search a place above.';
  }
  if (lower.includes('no coordinates')) {
    return 'Couldn’t find that place. Try a fuller name or tap the map.';
  }
  if (lower.includes('geocode') || lower.includes('search failed')) {
    return 'Place search didn’t work. Try a different name or tap the map.';
  }
  if (lower.includes('permission') || lower.includes('denied')) {
    return 'Location permission is off. Enable it, or tap the map instead.';
  }
  return msg.trim() || fallback;
}

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function degToCardinal(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(Number(deg))) return '';
  const d = ((Number(deg) % 360) + 360) % 360;
  return CARDINALS[Math.round(d / 22.5) % 16];
}

export function formatKnots(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
}

function windChipColor(knots: number | null | undefined): string {
  if (knots == null || !Number.isFinite(Number(knots))) return '#8BA8B2';
  const n = Number(knots);
  if (n >= 25) return '#E86A6A';
  if (n >= 15) return '#F0A05A';
  if (n >= 8) return '#2EC4A8';
  return '#6B9AA6';
}

/**
 * Windguru-style map: OSM tiles, GPS, tap/drag pin, nearby wind chips.
 * Simple mode searches Photon/OSM. Advanced also uses Google Maps search.
 */
export function LocationPicker({ onPicked, initial, uiMode }: Props) {
  const mode = normalizeUiMode(uiMode);
  const advanced = mode === 'advanced';
  const [query, setQuery] = useState(initial?.address || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<LocationPick | null>(initial || null);
  const [preview, setPreview] = useState<MapPreview | null>(null);
  const [myLocation, setMyLocation] = useState<{
    lat: number;
    lon: number;
    accuracy?: number;
  } | null>(null);
  const mapHostRef = useRef<View>(null);
  const leafletRef = useRef<{
    map: any;
    marker: any;
    you: any;
    accuracy: any;
    nearby: any;
    L: any;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPickedRef = useRef(onPicked);
  onPickedRef.current = onPicked;
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const applyPin = (lat: number, lon: number, address?: string, opts?: { skipView?: boolean }) => {
    const next = {
      lat,
      lon,
      address: address || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    };
    setPin(next);
    setQuery(next.address);
    onPickedRef.current(next);
    const leaf = leafletRef.current;
    if (leaf) {
      if (!leaf.marker) {
        const marker = leaf.L.marker([lat, lon], { draggable: true, zIndexOffset: 600 }).addTo(leaf.map);
        marker.on('dragend', () => {
          const ll = marker.getLatLng();
          applyPin(ll.lat, ll.lng, undefined, { skipView: true });
        });
        leaf.marker = marker;
      } else {
        leaf.marker.setLatLng([lat, lon]);
      }
      if (!opts?.skipView) {
        leaf.map.setView([lat, lon], Math.max(leaf.map.getZoom(), 11));
      }
    }
    schedulePreview(lat, lon);
    void fillAddress(lat, lon, next);
  };

  const fillAddress = async (lat: number, lon: number, current: LocationPick) => {
    try {
      const res = await fetch(
        `${getCloudBaseUrl()}/v1/geo/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&via=osm`,
      );
      const data = (await res.json()) as { address?: string };
      if (!res.ok || !data.address) return;
      if (pinRef.current?.lat !== lat || pinRef.current?.lon !== lon) return;
      const next = { ...current, address: data.address };
      setPin(next);
      setQuery(next.address);
      onPickedRef.current(next);
    } catch {
      // keep coordinate label
    }
  };

  const schedulePreview = (lat: number, lon: number) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `${getCloudBaseUrl()}/v1/geo/map-preview?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
          );
          const data = (await res.json()) as MapPreview & { error?: string; address?: string };
          if (!res.ok) throw new Error(data.error || 'preview failed');
          if (pinRef.current && (Math.abs(pinRef.current.lat - lat) > 0.002 || Math.abs(pinRef.current.lon - lon) > 0.002)) {
            return;
          }
          setPreview(data);
          if (data.address && pinRef.current) {
            const next = { ...pinRef.current, address: data.address };
            setPin(next);
            setQuery(next.address);
            onPickedRef.current(next);
          }
          drawNearby(data.nearby || []);
        } catch {
          setPreview((prev) => prev);
          // Keep the pin; wind chips are optional.
        }
      })();
    }, 420);
  };

  const drawNearby = (marks: NearbyMark[]) => {
    const leaf = leafletRef.current;
    if (!leaf) return;
    leaf.nearby.clearLayers();
    for (const m of marks) {
      if (!Number.isFinite(m.lat) || !Number.isFinite(m.lon)) continue;
      const kt = m.wind_avg;
      const color = windChipColor(kt);
      const label = kt == null ? '·' : formatKnots(kt);
      const icon = leaf.L.divIcon({
        className: 'ws-wind-mark',
        html: `<div class="ws-chip" style="background:${color}">${label}</div>`,
        iconSize: [32, 22],
        iconAnchor: [16, 11],
      });
      const km = Number.isFinite(m.distanceKm) ? `${m.distanceKm.toFixed(1)} km` : '';
      const popup = `${m.name}${km ? ` · ${km}` : ''}${kt != null ? ` · ${formatKnots(kt)} kt` : ''}`;
      const mark = leaf.L.marker([m.lat, m.lon], { icon, zIndexOffset: 200 }).bindPopup(popup);
      mark.on('click', () => {
        applyPin(m.lat, m.lon, m.name);
      });
      mark.addTo(leaf.nearby);
    }
  };

  const drawYou = (lat: number, lon: number, accuracy?: number) => {
    const leaf = leafletRef.current;
    if (!leaf) return;
    if (leaf.you) leaf.map.removeLayer(leaf.you);
    if (leaf.accuracy) leaf.map.removeLayer(leaf.accuracy);
    if (accuracy && accuracy > 8 && accuracy < 8000) {
      leaf.accuracy = leaf.L.circle([lat, lon], {
        radius: accuracy,
        color: '#4EA3F0',
        weight: 1,
        fillColor: '#4EA3F0',
        fillOpacity: 0.12,
      }).addTo(leaf.map);
    }
    leaf.you = leaf.L.circleMarker([lat, lon], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: '#3B82F6',
      fillOpacity: 1,
    }).addTo(leaf.map);
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    void (async () => {
      try {
        await ensureLeaflet();
        if (cancelled) return;
        const host = document.getElementById('windsage-location-map');
        if (!host || leafletRef.current) return;
        const L = (window as any).L;
        const start = pinRef.current
          ? [pinRef.current.lat, pinRef.current.lon]
          : [32.16, 34.8];
        const map = L.map(host, { zoomControl: true }).setView(start, 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 18,
        }).addTo(map);
        const nearby = L.layerGroup().addTo(map);
        let marker: any = null;
        if (pinRef.current) {
          marker = L.marker(start, { draggable: true, zIndexOffset: 600 }).addTo(map);
          marker.on('dragend', () => {
            const ll = marker.getLatLng();
            applyPin(ll.lat, ll.lng, undefined, { skipView: true });
          });
        }
        map.on('click', (e: any) => {
          applyPin(e.latlng.lat, e.latlng.lng, undefined, { skipView: true });
        });
        leafletRef.current = { map, marker, you: null, accuracy: null, nearby, L };
        try {
          L.DomEvent.disableScrollPropagation(host);
        } catch {
          // older leaflet
        }
        setTimeout(() => map.invalidateSize(), 80);
        if (pinRef.current) schedulePreview(pinRef.current.lat, pinRef.current.lon);
        else tryGrantedLocation();
      } catch (e) {
        setError(friendlyGeoError(e, 'Map couldn’t load. You can still search a place above.'));
      }
    })();
    return () => {
      cancelled = true;
      if (previewTimer.current) clearTimeout(previewTimer.current);
      if (leafletRef.current?.map) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const leaf = leafletRef.current;
    if (!leaf || !pin) return;
    if (leaf.marker) {
      leaf.marker.setLatLng([pin.lat, pin.lon]);
    }
  }, [pin?.lat, pin?.lon]);

  const tryGrantedLocation = () => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : null;
    const perms = typeof navigator !== 'undefined' ? navigator.permissions : null;
    if (!geo) return;
    const go = () => locateMe({ silent: true });
    if (!perms?.query) return;
    void perms
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (status.state === 'granted') go();
      })
      .catch(() => undefined);
  };

  const locateMe = (opts?: { silent?: boolean }) => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : null;
    if (!geo) {
      if (!opts?.silent) setError('This browser can’t share GPS. Tap the map instead.');
      return;
    }
    if (!opts?.silent) {
      setLocating(true);
      setError(null);
    }
    geo.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setMyLocation({ lat, lon, accuracy: pos.coords.accuracy });
        drawYou(lat, lon, pos.coords.accuracy);
        applyPin(lat, lon);
      },
      (err) => {
        setLocating(false);
        if (opts?.silent) return;
        setError(friendlyGeoError(err.message || 'Location failed', 'Couldn’t read GPS. Tap the map instead.'));
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  };

  const searchVia = advanced ? '' : 'osm';

  const search = (text: string) => {
    setQuery(text);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const via = searchVia ? `&via=${encodeURIComponent(searchVia)}` : '';
          const res = await fetch(
            `${getCloudBaseUrl()}/v1/geo/autocomplete?q=${encodeURIComponent(text.trim())}${via}`,
          );
          const data = (await res.json()) as { suggestions?: Suggestion[]; error?: string };
          if (!res.ok) throw new Error(data.error || 'Search failed');
          setSuggestions(data.suggestions || []);
        } catch (e) {
          setSuggestions([]);
          setError(friendlyGeoError(e, 'Place search didn’t work. Try again in a moment.'));
        }
      })();
    }, 280);
  };

  const pickSuggestion = async (s: Suggestion) => {
    setBusy(true);
    setError(null);
    setSuggestions([]);
    try {
      if (!advanced && s.lat != null && s.lon != null) {
        applyPin(s.lat, s.lon, s.description);
        return;
      }
      if (s.placeId) {
        const res = await fetch(`${getCloudBaseUrl()}/v1/geo/geocode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ placeId: s.placeId }),
        });
        const data = (await res.json()) as {
          lat?: number;
          lon?: number;
          address?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Geocode failed');
        if (data.lat == null || data.lon == null) throw new Error('No coordinates for that place');
        applyPin(data.lat, data.lon, data.address || s.description);
        return;
      }
      if (s.lat != null && s.lon != null) {
        applyPin(s.lat, s.lon, s.description);
        return;
      }
      await geocodeTyped(s.description);
    } catch (e) {
      setError(friendlyGeoError(e, 'Couldn’t place that address. Try another search or tap the map.'));
    } finally {
      setBusy(false);
    }
  };

  const geocodeTyped = async (forced?: string) => {
    const q = (forced || query).trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${getCloudBaseUrl()}/v1/geo/geocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: q, via: searchVia || undefined }),
      });
      const data = (await res.json()) as {
        lat?: number;
        lon?: number;
        address?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Geocode failed');
      if (data.lat == null || data.lon == null) throw new Error('No coordinates');
      applyPin(data.lat, data.lon, data.address || q);
      setSuggestions([]);
    } catch (e) {
      setError(friendlyGeoError(e, 'Couldn’t find that place. Try a fuller name or tap the map.'));
    } finally {
      setBusy(false);
    }
  };

  const wind = preview?.wind;
  const avg = formatKnots(wind?.wind_avg);
  const gust = formatKnots(wind?.wind_max);
  const dir = degToCardinal(wind?.wind_direction);
  const nearbyHint = (preview?.nearby || [])
    .slice(0, 3)
    .map((m) => {
      const kt = m.wind_avg != null ? `${formatKnots(m.wind_avg)} kt` : '';
      return [m.name, kt].filter(Boolean).join(' ');
    })
    .join(' · ');

  return (
    <View style={styles.wrap}>
      <Text style={styles.meta}>
        {advanced
          ? 'Tap the map, use GPS, or search Google Maps / paste a Maps link. Pin blends nearby stations.'
          : 'Tap the map or use your location — wind at the pin and nearby spots show on the map. No Google Maps needed.'}
      </Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={search}
          placeholder={
            advanced
              ? 'Place, Maps link, or 32.16, 34.80'
              : 'Place name, or tap the map'
          }
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => void geocodeTyped()}
          returnKeyType="search"
        />
        <Pressable style={styles.go} onPress={() => void geocodeTyped()} disabled={busy}>
          {busy ? <ActivityIndicator color="#042018" /> : <Text style={styles.goText}>Go</Text>}
        </Pressable>
      </View>
      <Pressable
        style={styles.gps}
        onPress={() => locateMe()}
        disabled={locating}
        accessibilityRole="button"
        accessibilityLabel="Use my location"
      >
        {locating ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.gpsText}>
            {myLocation ? 'Recenter on me' : 'Use my location'}
          </Text>
        )}
      </Pressable>
      {suggestions.length > 0 ? (
        <View style={styles.suggestBox}>
          {suggestions.map((s) => (
            <Pressable
              key={`${s.placeId || s.description}`}
              style={styles.suggestRow}
              onPress={() => void pickSuggestion(s)}
            >
              <Text style={styles.suggestText}>{s.description}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {Platform.OS === 'web' ? (
        <View
          nativeID="windsage-location-map"
          ref={mapHostRef}
          style={styles.map}
          id="windsage-location-map"
        />
      ) : (
        <Text style={styles.nativeHint}>
          On native, search a place or use GPS above. Full map pin is in the browser / PWA.
        </Text>
      )}
      {pin ? (
        <View style={styles.windCard}>
          <Text style={styles.windTitle}>
            {wind?.wind_avg != null
              ? `${avg} kt${gust !== '—' && gust !== avg ? ` gust ${gust}` : ''}${dir ? ` ${dir}` : ''}`
              : 'Wind at pin'}
          </Text>
          <Text style={styles.pinMeta}>
            {pin.address} · {pin.lat.toFixed(4)}, {pin.lon.toFixed(4)}
          </Text>
          {nearbyHint ? <Text style={styles.nearby}>{nearbyHint}</Text> : null}
          {wind?.wind_avg == null ? (
            <Text style={styles.previewMuted}>Wind chips load after the pin settles.</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.previewMuted}>Tap the map or use your location to drop a pin.</Text>
      )}
      {!advanced ? (
        <Text style={styles.advancedHint}>
          Google Maps paste/search is in Account → Advanced mode.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

async function ensureLeaflet() {
  if (typeof document === 'undefined') return;
  if (!(document.getElementById('windsage-leaflet-marks'))) {
    const style = document.createElement('style');
    style.id = 'windsage-leaflet-marks';
    style.textContent = `
      .ws-wind-mark { background: none !important; border: none !important; }
      .ws-wind-mark .ws-chip {
        min-width: 28px;
        padding: 3px 6px;
        border-radius: 8px;
        font: 700 11px/1.1 system-ui, sans-serif;
        color: #042018;
        text-align: center;
        box-shadow: 0 1px 4px rgba(0,0,0,.4);
      }
    `;
    document.head.appendChild(style);
  }
  if ((window as any).L) return;
  await new Promise<void>((resolve, reject) => {
    const cssId = 'leaflet-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const existing = document.getElementById('leaflet-js');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      if ((window as any).L) resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'leaflet-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load map library'));
    document.head.appendChild(script);
  });
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.input,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  go: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  goText: { color: '#042018', fontWeight: '800' },
  gps: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gpsText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  suggestBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.input,
    overflow: 'hidden',
  },
  suggestRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  suggestText: { color: colors.text, fontSize: 14 },
  map: {
    height: 360,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.input,
  },
  windCard: {
    backgroundColor: colors.input,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  windTitle: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  pinMeta: { color: colors.text, fontSize: 12, fontWeight: '600' },
  nearby: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  previewMuted: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  advancedHint: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  nativeHint: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  error: { color: colors.danger, fontSize: 12 },
});

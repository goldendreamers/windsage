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
import { looksLikeLatLon, looksLikeMapQuery } from '../shared/mapLinks';
import { colors } from '../shared/theme';

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

type Props = {
  onPicked: (pick: LocationPick) => void;
  initial?: LocationPick | null;
  /** Pasted Maps URL / address from the Add Station field when switching to Map. */
  seedQuery?: string | null;
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
    return 'Map couldn’t load. You can still search an address above.';
  }
  if (lower.includes('no coordinates')) {
    return 'Couldn’t find that place. Try a fuller address or tap the map.';
  }
  if (lower.includes('geocode') || lower.includes('search failed') || lower.includes('unreachable')) {
    return 'Place search didn’t work. Paste a Google Maps link, or try a different address.';
  }
  return msg.trim() || fallback;
}

/**
 * Address search + map pin.
 * Uses Google Geocoding/Places when the server has a key; otherwise Open-Meteo.
 * Map: Leaflet/OSM on web (no key). Native falls back to address-only.
 */
export function LocationPicker({ onPicked, initial, seedQuery }: Props) {
  const [query, setQuery] = useState(initial?.address || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<LocationPick | null>(initial || null);
  const [geocodeProvider, setGeocodeProvider] = useState<string>('open-meteo');
  const mapHostRef = useRef<View>(null);
  const leafletRef = useRef<{
    map: any;
    marker: any;
    L: any;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seededRef = useRef<string>('');

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${getCloudBaseUrl()}/v1/maps/config`);
        const data = (await res.json()) as { geocodeProvider?: string };
        if (data.geocodeProvider) setGeocodeProvider(data.geocodeProvider);
      } catch {
        // ignore
      }
    })();
  }, []);

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
        const center = pin
          ? [pin.lat, pin.lon]
          : [32.16, 34.8];
        const map = L.map(host, { zoomControl: true }).setView(center, 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 18,
        }).addTo(map);
        const marker = L.marker(center, { draggable: true }).addTo(map);
        const apply = (lat: number, lon: number, address?: string) => {
          const next = {
            lat,
            lon,
            address: address || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          };
          setPin(next);
          setQuery(next.address);
          onPicked(next);
        };
        marker.on('dragend', () => {
          const ll = marker.getLatLng();
          apply(ll.lat, ll.lng);
        });
        map.on('click', (e: any) => {
          marker.setLatLng(e.latlng);
          apply(e.latlng.lat, e.latlng.lng);
        });
        leafletRef.current = { map, marker, L };
        setTimeout(() => map.invalidateSize(), 80);
      } catch (e) {
        setError(friendlyGeoError(e, 'Map couldn’t load. You can still search an address above.'));
      }
    })();
    return () => {
      cancelled = true;
      if (leafletRef.current?.map) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!leafletRef.current || !pin) return;
    const { map, marker } = leafletRef.current;
    marker.setLatLng([pin.lat, pin.lon]);
    map.setView([pin.lat, pin.lon], Math.max(map.getZoom(), 14));
  }, [pin?.lat, pin?.lon]);

  const geocodeTyped = async (raw?: string) => {
    const text = (raw ?? query).trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${getCloudBaseUrl()}/v1/geo/geocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      const data = (await res.json()) as {
        lat?: number;
        lon?: number;
        address?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Geocode failed');
      if (data.lat == null || data.lon == null) throw new Error('No coordinates');
      const next = { lat: data.lat, lon: data.lon, address: data.address || text };
      setPin(next);
      setQuery(next.address);
      onPicked(next);
      setSuggestions([]);
    } catch (e) {
      setError(friendlyGeoError(e, 'Couldn’t find that place. Try a fuller address or paste a Google Maps link.'));
    } finally {
      setBusy(false);
    }
  };

  const search = (text: string) => {
    setQuery(text);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const instant = looksLikeMapQuery(trimmed) || looksLikeLatLon(trimmed);
    debounceRef.current = setTimeout(() => {
      if (instant) {
        setSuggestions([]);
        void geocodeTyped(trimmed);
        return;
      }
      void (async () => {
        try {
          const res = await fetch(
            `${getCloudBaseUrl()}/v1/geo/autocomplete?q=${encodeURIComponent(trimmed)}`,
          );
          const data = (await res.json()) as { suggestions?: Suggestion[]; error?: string };
          if (!res.ok) throw new Error(data.error || 'Search failed');
          setSuggestions(data.suggestions || []);
        } catch (e) {
          setSuggestions([]);
          setError(friendlyGeoError(e, 'Place search didn’t work. Try again in a moment.'));
        }
      })();
    }, instant ? 160 : 280);
  };

  useEffect(() => {
    const seed = String(seedQuery || '').trim();
    if (!seed || seed === seededRef.current) return;
    seededRef.current = seed;
    setQuery(seed);
    void geocodeTyped(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuery]);

  const pickSuggestion = async (s: Suggestion) => {
    setBusy(true);
    setError(null);
    setSuggestions([]);
    try {
      let lat = s.lat ?? null;
      let lon = s.lon ?? null;
      let address = s.description;
      if ((lat == null || lon == null) && s.placeId) {
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
        lat = data.lat ?? null;
        lon = data.lon ?? null;
        address = data.address || address;
      } else if (lat == null || lon == null) {
        const res = await fetch(`${getCloudBaseUrl()}/v1/geo/geocode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: s.description }),
        });
        const data = (await res.json()) as {
          lat?: number;
          lon?: number;
          address?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Geocode failed');
        lat = data.lat ?? null;
        lon = data.lon ?? null;
        address = data.address || address;
      }
      if (lat == null || lon == null) throw new Error('No coordinates for that place');
      const next = { lat, lon, address };
      setPin(next);
      setQuery(address);
      onPicked(next);
    } catch (e) {
      setError(friendlyGeoError(e, 'Couldn’t place that address. Try another search or tap the map.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.meta}>
        Paste a Google Maps link, search an address, or tap the map. Address via{' '}
        {geocodeProvider === 'google' ? 'Google Maps' : 'OpenStreetMap'} · pin blends nearby
        stations
      </Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={search}
          onSubmitEditing={() => void geocodeTyped()}
          returnKeyType="search"
          placeholder="Google Maps link, address, or place"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.go} onPress={() => void geocodeTyped()} disabled={busy}>
          {busy ? <ActivityIndicator color="#042018" /> : <Text style={styles.goText}>Go</Text>}
        </Pressable>
      </View>
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
          // @ts-expect-error web-only nativeID for Leaflet mount
          nativeID="windsage-location-map"
          ref={mapHostRef}
          style={styles.map}
          // @ts-expect-error RN web id
          id="windsage-location-map"
        />
      ) : (
        <Text style={styles.nativeHint}>
          On phone, paste a Google Maps link or search an address above. Map pin is in the
          browser / PWA.
        </Text>
      )}
      {pin ? (
        <Text style={styles.pinMeta}>
          Pin {pin.lat.toFixed(4)}, {pin.lon.toFixed(4)}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

async function ensureLeaflet() {
  if (typeof document === 'undefined') return;
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
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.input,
  },
  pinMeta: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  nativeHint: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  error: { color: colors.danger, fontSize: 12 },
});

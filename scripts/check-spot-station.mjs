#!/usr/bin/env node
/** Smoke-check Windguru spot + station resolve/readings via Wald. */
const BASE = process.env.WINDSAGE_PUBLIC_URL || 'https://windsage.nimrod.bio';

async function resolve(input) {
  const res = await fetch(`${BASE}/v1/windguru/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ input }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `resolve ${res.status}`);
  return data;
}

async function main() {
  const cases = [
    {
      label: 'forecast-only-url',
      input: 'https://www.windguru.cz/377929',
      expectKind: 'spot',
      expectWarning: true,
      expectNearest: '15077',
    },
    {
      label: 'forecast-only-id',
      input: '377929',
      expectKind: 'spot',
      expectWarning: true,
    },
    { label: 'spot', input: '910318', expectKind: 'spot', expectWarning: false },
    { label: 'station', input: '2259', expectKind: 'station', expectWarning: false },
    {
      label: 'spot-url',
      input: 'https://www.windguru.cz/910318',
      expectKind: 'spot',
      expectWarning: false,
    },
    {
      label: 'station-url',
      input: 'https://www.windguru.cz/station/2259',
      expectKind: 'station',
      expectWarning: false,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    try {
      const data = await resolve(c.input);
      const hasWarn = !!(data.warning || data.linkedLiveStation);
      const okKind = data.kind === c.expectKind && !!data.liveStationId;
      const okWarn =
        c.expectWarning === undefined ? true : c.expectWarning ? hasWarn : !data.warning;
      const okNearest =
        !c.expectNearest || data.liveStationId === c.expectNearest || data.linkedLiveStation?.id === c.expectNearest;
      const ok = okKind && okWarn && okNearest;
      console.log(
        ok ? 'OK' : 'FAIL',
        c.label,
        JSON.stringify({
          kind: data.kind,
          inputId: data.inputId,
          liveStationId: data.liveStationId,
          spotName: data.spotName,
          hasLiveStation: data.hasLiveStation,
          linked: data.linkedLiveStation,
          warning: data.warning,
        }),
      );
      if (!ok) failed += 1;
    } catch (e) {
      failed += 1;
      console.log('FAIL', c.label, e.message || e);
    }
  }
  if (failed) {
    console.error(`failed ${failed}/${cases.length}`);
    process.exit(1);
  }
  console.log(`all ${cases.length} spot/station resolve checks passed`);
}

main();

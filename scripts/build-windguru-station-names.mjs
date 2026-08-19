/**
 * Fetch Windguru live station_list and write the names-only files (~100 KB).
 *
 *   node scripts/build-windguru-station-names.mjs
 *   node scripts/build-windguru-station-names.mjs --out public
 *
 * Live sensor stations only — not forecast spots.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistWindguruNameFiles } from '../code/cloud/lib/windguruNames.mjs';
import { windguruCatalogStations } from '../code/cloud/lib/wind.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function outDirsFromArgs(argv) {
  const dirs = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) {
      dirs.push(path.resolve(ROOT, argv[i + 1]));
      i += 1;
    }
  }
  if (!dirs.length) dirs.push(path.join(ROOT, 'public'));
  return dirs;
}

const rows = await windguruCatalogStations();
const extra = outDirsFromArgs(process.argv.slice(2));
const meta = await persistWindguruNameFiles(rows, extra);
const allBytes = meta.files.oneNamePerLine.bytes;
console.log(
  JSON.stringify(
    {
      ok: true,
      liveStations: meta.liveStations,
      named: meta.named,
      uniqueNames: meta.uniqueNames,
      oneNamePerLineBytes: allBytes,
      kib: Math.round(allBytes / 1024),
      wrote: extra,
    },
    null,
    2,
  ),
);

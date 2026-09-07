/**
 * Wind-alert polling belongs on Wald (`windsage.service`), not a Mac laptop.
 *
 * WINDSAGE_POLL=1 → always poll (set on Wald systemd).
 * WINDSAGE_POLL=0 → never poll (Mac/dev cloud).
 * unset → poll only when data dir is the Wald path `/data/windsage/data`.
 */
import path from 'node:path';

export const WALD_DATA_DIR = '/data/windsage/data';

export function shouldPollAlerts(dataDir, env = process.env) {
  const flag = String(env.WINDSAGE_POLL || '')
    .trim()
    .toLowerCase();
  if (flag === '0' || flag === 'off' || flag === 'false' || flag === 'no') return false;
  if (flag === '1' || flag === 'on' || flag === 'true' || flag === 'yes') return true;
  try {
    return path.resolve(String(dataDir || '')) === WALD_DATA_DIR;
  } catch {
    return false;
  }
}

export function pollReason(dataDir, env = process.env) {
  const flag = String(env.WINDSAGE_POLL || '').trim();
  if (flag) return `WINDSAGE_POLL=${flag}`;
  return shouldPollAlerts(dataDir, env)
    ? `dataDir=${WALD_DATA_DIR}`
    : 'not Wald data dir (Mac/dev — poll off)';
}

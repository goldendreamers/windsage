/**
 * Install Windsage as a real app download (not a how-to page).
 *
 * Chromium: register the service worker, then show the OS install dialog
 * (Chrome downloads a WebAPK / desktop app).
 * iPhone/iPad: download a Home Screen profile (.mobileconfig).
 * Android if the install dialog is missing: download /app/windsage.apk when present,
 * otherwise bounce out of in-app browsers into Chrome so the dialog can appear.
 */
export const PWA_SW_VERSION = '9';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let listening = false;

export function initPwaInstallCapture(): void {
  if (listening) return;
  if (typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
  });
}

export type AppUpdateStatus = {
  available: boolean;
  waiting: boolean;
};

const updateListeners = new Set<(status: AppUpdateStatus) => void>();
let lastUpdateStatus: AppUpdateStatus = { available: false, waiting: false };

function emitAppUpdate(status: AppUpdateStatus) {
  lastUpdateStatus = status;
  for (const fn of updateListeners) fn(status);
}

export function subscribeAppUpdate(listener: (status: AppUpdateStatus) => void): () => void {
  updateListeners.add(listener);
  listener(lastUpdateStatus);
  return () => {
    updateListeners.delete(listener);
  };
}

function watchServiceWorker(reg: ServiceWorkerRegistration) {
  const emit = () => {
    const waiting = Boolean(reg.waiting);
    const installing = Boolean(reg.installing);
    const hasController =
      typeof navigator !== 'undefined' && !!navigator.serviceWorker.controller;
    emitAppUpdate({
      available: waiting || (installing && hasController),
      waiting,
    });
  };
  emit();
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (sw) sw.addEventListener('statechange', emit);
    emit();
  });
}

/** Register the PWA worker so Chromium treats the site as installable. */
export async function registerPwaServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register(`/sw.js?v=${PWA_SW_VERSION}`, { scope: '/' });
    watchServiceWorker(reg);
    await navigator.serviceWorker.ready;
    await reg.update().catch(() => undefined);
    watchServiceWorker(reg);
    return reg;
  } catch (error) {
    console.warn('[windsage] service worker register failed', error);
    return null;
  }
}

export async function checkForAppUpdate(): Promise<AppUpdateStatus> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { available: false, waiting: false };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { available: false, waiting: false };
    await reg.update().catch(() => undefined);
    const waiting = Boolean(reg.waiting);
    const status: AppUpdateStatus = {
      available: waiting || Boolean(reg.installing && navigator.serviceWorker.controller),
      waiting,
    };
    emitAppUpdate(status);
    return status;
  } catch {
    return lastUpdateStatus;
  }
}

/** Activate a waiting worker (or reload) so the installed PWA picks up new JS. */
export async function applyAppUpdate(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    window.location.reload();
    return true;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      const reload = () => window.location.reload();
      navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.setTimeout(reload, 1600);
      return true;
    }
    await checkForAppUpdate();
    const again = await navigator.serviceWorker.getRegistration();
    if (again?.waiting) {
      again.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch {
    // still reload — network-first JS on the next load
  }
  window.location.reload();
  return true;
}

export function isRunningAsInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !!(mq || iosStandalone);
}

export function getInstallPlatform(): 'ios' | 'android' | 'desktop' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux/i.test(ua)) return 'desktop';
  return 'other';
}

export function canPromptInstall(): boolean {
  return !!deferred;
}

export async function waitForInstallPrompt(timeoutMs = 2800): Promise<boolean> {
  if (deferred) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (deferred) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return !!deferred;
}

/** Show the browser/OS install dialog. Chrome then downloads the app. */
export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const event = deferred;
  deferred = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

export function appPackageUrl(): { url: string; filename: string; kind: 'profile' | 'apk' } {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://windsage.nimrod.bio';
  const platform = getInstallPlatform();
  if (platform === 'android') {
    return { url: `${origin}/app/windsage.apk`, filename: 'windsage.apk', kind: 'apk' };
  }
  return {
    url: `${origin}/app/windsage.mobileconfig`,
    filename: 'windsage.mobileconfig',
    kind: 'profile',
  };
}

function inAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|WhatsApp|Snapchat|wv\)/i.test(ua);
}

/** Start a real file download (profile or APK). */
export function downloadNativePackage(): { filename: string; kind: 'profile' | 'apk' } {
  const pack = appPackageUrl();
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return pack;
  }
  const platform = getInstallPlatform();
  if (platform === 'android' && inAppBrowser()) {
    const host = window.location.host || 'windsage.nimrod.bio';
    window.location.href = `intent://${host}/download#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(pack.url)};end`;
    return pack;
  }
  const a = document.createElement('a');
  a.href = pack.url;
  a.download = pack.filename;
  a.rel = 'noopener';
  a.target = '_self';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (pack.kind === 'profile') {
    window.location.assign(pack.url);
  }
  return pack;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'downloaded' | 'installed' | 'unavailable';

/**
 * Tap Install → actually install/download.
 * Never stops at a list of menu instructions.
 */
export async function installWindsage(): Promise<InstallOutcome> {
  if (isRunningAsInstalledApp()) return 'installed';
  initPwaInstallCapture();
  await registerPwaServiceWorker();
  await waitForInstallPrompt(2800);
  const prompted = await promptPwaInstall();
  if (prompted === 'accepted' || prompted === 'dismissed') return prompted;

  const platform = getInstallPlatform();
  if (platform === 'android') {
    const apk = appPackageUrl();
    const apkReady =
      apk.kind === 'apk' &&
      (await fetch(apk.url, { method: 'HEAD' })
        .then((r) => r.ok)
        .catch(() => false));
    if (apkReady || inAppBrowser()) {
      downloadNativePackage();
      return 'downloaded';
    }
    return 'unavailable';
  }

  downloadNativePackage();
  return 'downloaded';
}

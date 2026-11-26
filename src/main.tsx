import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const APP_VERSION_STORAGE_KEY = 'esports_app_version_v2';
const APP_VERSION_RELOAD_KEY = 'esports_app_version_reloaded_v2';
const SW_RELOAD_AT_KEY = 'esports_sw_controller_reload_at_v4';

async function purgeBrowserCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // Ignore cache API errors
  }
}

function getRunningAppVersion(): string {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector('meta[name="esports-app-version"]');
  return meta?.getAttribute('content')?.trim() || '';
}

function canTriggerVersionReload(targetVersion: string): boolean {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(APP_VERSION_RELOAD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { version?: string; at?: number };
      if (parsed?.version === targetVersion && typeof parsed.at === 'number' && now - parsed.at < 15000) {
        return false;
      }
    }
    sessionStorage.setItem(APP_VERSION_RELOAD_KEY, JSON.stringify({ version: targetVersion, at: now }));
  } catch {
    // Allow reload if sessionStorage is restricted
  }
  return true;
}

async function forceFreshReload(reasonVersion?: string): Promise<void> {
  await purgeBrowserCaches();
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map(async (r) => {
          try {
            await r.update();
            if (r.waiting) {
              r.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          } catch {
            // Ignore SW update failures
          }
        }),
      );
    } catch {
      // Ignore SW errors
    }
  }
  try {
    await fetch(window.location.href, { cache: 'reload', credentials: 'same-origin' });
  } catch {
    // Ignore cache revalidation network errors
  }
  if (reasonVersion) {
    try {
      localStorage.setItem(APP_VERSION_STORAGE_KEY, reasonVersion);
    } catch {
      // Ignore storage errors
    }
  }
  window.location.reload();
}

// Auto-recover once if Vite dynamic import encounters a stale hashed chunk after a deploy
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    const key = 'esports_preload_recover_v2';
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        void forceFreshReload();
      }
    } catch {
      window.location.reload();
    }
  });
}

// Manage Service Worker & cross-device fresh-version sync for standalone Desktop & Mobile PWA
if (typeof window !== 'undefined') {
  const isInIframe = window.self !== window.top;

  if ('serviceWorker' in navigator) {
    if (isInIframe) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister().catch(() => {}));
      }).catch(() => {});
    } else {
      const hadController = Boolean(navigator.serviceWorker.controller);
      let reloadingFromSw = false;

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloadingFromSw) return;
        const now = Date.now();
        try {
          const lastAt = Number(sessionStorage.getItem(SW_RELOAD_AT_KEY) || '0');
          if (now - lastAt < 5000) return;
          sessionStorage.setItem(SW_RELOAD_AT_KEY, String(now));
        } catch {}
        reloadingFromSw = true;
        void forceFreshReload();
      });

      const registerAndSyncSw = () => {
        navigator.serviceWorker
          .register('/sw.js', { updateViaCache: 'none' })
          .then((reg) => {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            reg.addEventListener('updatefound', () => {
              const installing = reg.installing;
              if (!installing) return;
              installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  installing.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            });
            reg.update().catch(() => {});

            const triggerSwUpdate = () => {
              if (document.visibilityState === 'visible') {
                reg.update().catch(() => {});
              }
            };
            document.addEventListener('visibilitychange', triggerSwUpdate);
            window.addEventListener('focus', () => reg.update().catch(() => {}));
            window.addEventListener('pageshow', () => reg.update().catch(() => {}));
          })
          .catch(() => {});
      };

      if (document.readyState === 'complete') {
        registerAndSyncSw();
      } else {
        window.addEventListener('load', registerAndSyncSw);
      }
    }
  }

  // Ensure standalone Desktop & Mobile PWA automatically pick up new server/UI versions on open, resume, or while open
  if (!isInIframe) {
    let lastCheckedAt = 0;
    let checkInFlight = false;

    const checkAppVersion = async (force = false) => {
      if (checkInFlight) return;
      const now = Date.now();
      if (!force && now - lastCheckedAt < 10000) return;
      lastCheckedAt = now;
      checkInFlight = true;

      try {
        const res = await fetch(`/api/app-version?t=${now}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const serverVer = data?.version ? String(data.version).trim() : '';
        if (!serverVer) return;

        const runningVer = getRunningAppVersion();
        const prevStoredVer = (() => {
          try {
            return localStorage.getItem(APP_VERSION_STORAGE_KEY) || '';
          } catch {
            return '';
          }
        })();

        // Primary check: embedded running HTML/bundle version differs from live server version
        // Legacy fallback: cached HTML predates <meta name="esports-app-version"> and needs initial refresh
        const isStaleRunningBundle = runningVer
          ? runningVer !== serverVer
          : prevStoredVer !== serverVer;

        try {
          localStorage.setItem(APP_VERSION_STORAGE_KEY, serverVer);
        } catch {}

        if (isStaleRunningBundle && canTriggerVersionReload(serverVer)) {
          await forceFreshReload(serverVer);
        }
      } catch {
        // Ignore offline / network errors gracefully
      } finally {
        checkInFlight = false;
      }
    };

    setTimeout(() => { void checkAppVersion(true); }, 250);
    window.addEventListener('load', () => {
      setTimeout(() => { void checkAppVersion(true); }, 400);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void checkAppVersion(true);
      }
    });
    window.addEventListener('focus', () => {
      void checkAppVersion(false);
    });
    window.addEventListener('pageshow', (event) => {
      void checkAppVersion(Boolean(event.persisted));
    });
    window.addEventListener('online', () => {
      void checkAppVersion(true);
    });
    window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkAppVersion(false);
      }
    }, 30000);
  }
}

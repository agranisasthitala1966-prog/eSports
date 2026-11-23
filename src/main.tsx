import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const APP_VERSION_STORAGE_KEY = 'esports_app_version_v1';
const APP_VERSION_RELOAD_KEY = 'esports_app_version_reloaded_v1';
const SW_RELOAD_KEY = 'esports_sw_controller_reloaded_v3';

async function purgeBrowserCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // Ignore cache API errors
  }
}

// Auto-recover once if Vite dynamic import encounters a stale hashed chunk after a deploy
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    const key = 'esports_preload_recover_v2';
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        purgeBrowserCaches().finally(() => window.location.reload());
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
        try {
          if (sessionStorage.getItem(SW_RELOAD_KEY)) return;
          sessionStorage.setItem(SW_RELOAD_KEY, '1');
        } catch {}
        reloadingFromSw = true;
        purgeBrowserCaches().finally(() => window.location.reload());
      });

      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js', { updateViaCache: 'none' })
          .then((reg) => {
            reg.update().catch(() => {});

            const triggerSwUpdate = () => {
              if (document.visibilityState === 'visible') {
                reg.update().catch(() => {});
              }
            };
            document.addEventListener('visibilitychange', triggerSwUpdate);
            window.addEventListener('focus', () => reg.update().catch(() => {}));
          })
          .catch(() => {});
      });
    }
  }

  // Ensure standalone Desktop & Mobile PWA automatically pick up new server/UI versions on open or resume
  if (!isInIframe) {
    let lastCheckedAt = 0;
    const checkAppVersion = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastCheckedAt < 15000) return;
      lastCheckedAt = now;

      try {
        const res = await fetch(`/api/app-version?t=${now}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const serverVer = data?.version ? String(data.version) : '';
        if (!serverVer) return;

        const prevVer = localStorage.getItem(APP_VERSION_STORAGE_KEY);
        if (!prevVer) {
          localStorage.setItem(APP_VERSION_STORAGE_KEY, serverVer);
          return;
        }

        if (prevVer !== serverVer) {
          localStorage.setItem(APP_VERSION_STORAGE_KEY, serverVer);
          if (sessionStorage.getItem(APP_VERSION_RELOAD_KEY) !== serverVer) {
            sessionStorage.setItem(APP_VERSION_RELOAD_KEY, serverVer);
            await purgeBrowserCaches();
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
              await Promise.all(regs.map((r) => r.update().catch(() => {})));
            }
            window.location.reload();
          }
        }
      } catch {
        // Ignore offline / network errors gracefully
      }
    };

    window.addEventListener('load', () => {
      setTimeout(() => { checkAppVersion(true); }, 800);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkAppVersion(false);
      }
    });
    window.addEventListener('focus', () => {
      checkAppVersion(false);
    });
  }
}

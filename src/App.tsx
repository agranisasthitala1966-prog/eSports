import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { 
  SportEvent, 
  Candidate, 
  Club, 
  EventHeat, 
  EventResult, 
  SportsMeetSettings, 
  HeatParticipant,
  ClientUpload
} from './types';
import { api, getDeviceId } from './services/api';
import { clientStorage } from './services/clientStorage';
import { firestoreSync, subscribeQuotaStatus, isFirestoreQuotaExhausted } from './services/firestoreSync';
import { 
  getCandidateRestrictionStatus, 
  getCandidateEditRestrictedMessage, 
  getCandidateQualifiedEvents 
} from './utils/qualificationRules';
import {
  isDirectEvent,
  getAdditionalEventsForCandidate,
  normalizeGender,
} from './utils/heightRules';
import { INITIAL_EVENTS, INITIAL_CLUBS, INITIAL_SETTINGS } from './constants/initialData';

// Immediate critical Client Portal views
import { Navbar } from './components/Navbar';
import { CandidateEnroll } from './components/CandidateEnroll';
import { Phone } from 'lucide-react';

// Lazy-loaded secondary tabs, server views, and modals for ultra-fast mobile first paint
const CandidateList = lazy(() => import('./components/CandidateList').then((m) => ({ default: m.CandidateList })));
const EventMaster = lazy(() => import('./components/EventMaster').then((m) => ({ default: m.EventMaster })));
const HitList = lazy(() => import('./components/HitList').then((m) => ({ default: m.HitList })));
const RankingList = lazy(() => import('./components/RankingList').then((m) => ({ default: m.RankingList })));
const Reports = lazy(() => import('./components/Reports').then((m) => ({ default: m.Reports })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel })));
const DbExplorer = lazy(() => import('./components/DbExplorer').then((m) => ({ default: m.DbExplorer })));
const ClubUploadsReview = lazy(() => import('./components/ClubUploadsReview').then((m) => ({ default: m.ClubUploadsReview })));
const PinLoginModal = lazy(() => import('./components/PinLoginModal').then((m) => ({ default: m.PinLoginModal })));
const ResetPinModal = lazy(() => import('./components/ResetPinModal').then((m) => ({ default: m.ResetPinModal })));
const ThermalPageSetupModal = lazy(() => import('./components/ThermalPageSetupModal').then((m) => ({ default: m.ThermalPageSetupModal })));

function sanitizeUniqueCandidates(list: Candidate[]): Candidate[] {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const seenChests = new Set<number>();
  const result: Candidate[] = [];

  list.forEach((c) => {
    if (!c) return;
    const cid = c.id ? String(c.id).trim() : '';
    const cname = (c.name || '').trim().toUpperCase();
    const isCancelled = c.isCancelled || c.status === 'cancelled';

    if (cid && seenIds.has(cid)) return;
    // Disallow duplicate records with the exact same candidate name
    if (!isCancelled && cname && seenNames.has(cname)) return;

    if (cid) seenIds.add(cid);
    if (!isCancelled && cname) seenNames.add(cname);

    const chest = Number(c.chestNo);
    if (chest && chest >= 101) {
      if (seenChests.has(chest)) {
        // Resolve collision by renumbering candidate instead of silently dropping
        let resolved = chest;
        while (seenChests.has(resolved)) {
          resolved++;
        }
        seenChests.add(resolved);
        result.push({ ...c, chestNo: resolved });
        return;
      }
      seenChests.add(chest);
    }
    result.push(c);
  });

  return result;
}

export default function App() {
  const [mode, setMode] = useState<'client' | 'server'>('client');
  const [activeTab, setActiveTab] = useState<string>('enroll');

  // Core Data - initialized from local storage cache for instant 0ms first paint on mobile
  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    try {
      const cached = clientStorage.getCandidates();
      return Array.isArray(cached) && cached.length > 0 ? sanitizeUniqueCandidates(cached) : [];
    } catch {
      return [];
    }
  });
  const [events, setEvents] = useState<SportEvent[]>(() => {
    const cached = clientStorage.getEventsCache();
    return cached && cached.length > 0 ? cached : INITIAL_EVENTS;
  });
  const [clubs, setClubs] = useState<Club[]>(() => {
    const cached = clientStorage.getClubsCache();
    return cached && cached.length > 0 ? cached : INITIAL_CLUBS;
  });
  const [heats, setHeats] = useState<EventHeat[]>([]);
  const [results, setResults] = useState<EventResult[]>([]);
  const [settings, setSettings] = useState<SportsMeetSettings>(() => {
    try {
      return clientStorage.getCachedSettings() || INITIAL_SETTINGS;
    } catch {
      return INITIAL_SETTINGS;
    }
  });
  const [uploads, setUploads] = useState<ClientUpload[]>([]);

  // Server Authentication & PIN states: by default server MUST be locked under any circumstances subject to pin login
  const [isServerAuthenticated, setIsServerAuthenticated] = useState<boolean>(false);
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [showResetPinModal, setShowResetPinModal] = useState<boolean>(false);
  const [showThermalSetup, setShowThermalSetup] = useState<boolean>(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isFirestoreQuotaExceeded, setIsFirestoreQuotaExceeded] = useState<boolean>(() => isFirestoreQuotaExhausted());
  const [dismissQuotaBanner, setDismissQuotaBanner] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeQuotaStatus((exceeded) => {
      setIsFirestoreQuotaExceeded(exceeded);
    });
    return () => unsub();
  }, []);

  // Edit Candidate State
  const [candidateToEdit, setCandidateToEdit] = useState<Candidate | null>(null);
  const [preselectedRankingEvt, setPreselectedRankingEvt] = useState<number | undefined>(undefined);

  // Number of unsynced candidates in client storage
  const unsyncedCount = useMemo(() => {
    return candidates.filter((c) => !c.synced || c.isDirty).length;
  }, [candidates]);

  // Number of pending athlete entries awaiting server review & approval
  const pendingUploadsCount = useMemo(() => {
    return uploads
      .filter((u) => u.status === 'pending')
      .reduce((sum, u) => {
        const unmerged = (u.candidates || []).filter((c: any) => !c.merged && c.status !== 'rejected').length;
        return sum + (unmerged > 0 ? unmerged : 1);
      }, 0);
  }, [uploads]);

  // References to track last known server state to avoid redundant fetches & polling storms
  const lastServerUpdatedRef = useRef<string>('');
  const lastServerCandidatesCountRef = useRef<number>(-1);
  const lastServerUploadsCountRef = useRef<number>(-1);
  const prevPendingCountRef = useRef<number>(-1);
  const isFetchingRef = useRef<boolean>(false);

  // Load data based on active mode using single consolidated bootstrap endpoint
  const loadData = useCallback(async (force = false, targetMode?: 'client' | 'server') => {
    if (isFetchingRef.current && !force) return;
    isFetchingRef.current = true;
    const effectiveMode = targetMode || mode;
    try {
      // 1. Fetch entire state in a single fast bootstrap API call (50-100ms)
      const bootstrap = await api.getBootstrap().catch(() => null);

      let srvEvents: SportEvent[];
      let srvClubs: Club[];
      let srvSettings: SportsMeetSettings;
      let srvHeats: EventHeat[] = [];
      let srvResults: EventResult[] = [];
      let srvUploads: ClientUpload[] = [];
      let srvCandidates: Candidate[] = [];
      let uploadsLoaded = false;

      if (bootstrap) {
        // Fast path: Live Cloud Firestore (or Express fallback) provided consolidated state
        srvEvents = Array.isArray(bootstrap.events) ? bootstrap.events : (clientStorage.getEventsCache() || INITIAL_EVENTS);
        srvClubs = Array.isArray(bootstrap.clubs) ? bootstrap.clubs : (clientStorage.getClubsCache() || INITIAL_CLUBS);
        srvSettings = bootstrap.settings || clientStorage.getCachedSettings() || INITIAL_SETTINGS;
        srvHeats = Array.isArray(bootstrap.heats) ? bootstrap.heats : [];
        srvResults = Array.isArray(bootstrap.results) ? bootstrap.results : [];
        srvUploads = Array.isArray(bootstrap.uploads) ? bootstrap.uploads : [];
        srvCandidates = Array.isArray(bootstrap.candidates) ? bootstrap.candidates : [];
        uploadsLoaded = Array.isArray(bootstrap.uploads);
      } else {
        // Fallback path if live bootstrap and server offline:
        srvEvents = clientStorage.getEventsCache() || INITIAL_EVENTS;
        srvClubs = clientStorage.getClubsCache() || INITIAL_CLUBS;
        srvSettings = clientStorage.getCachedSettings() || INITIAL_SETTINGS;
        // Parallel queries only when bootstrap failed:
        const [cloudUploads, cloudCandidates, cloudHeats, cloudResults] = await Promise.allSettled([
          api.getUploads().catch(() => null),
          api.getCandidates().catch(() => []),
          api.getHeats().catch(() => []),
          api.getResults().catch(() => []),
        ]);
        if (cloudUploads.status === 'fulfilled' && Array.isArray(cloudUploads.value)) {
          srvUploads = cloudUploads.value;
          uploadsLoaded = true;
        }
        if (cloudCandidates.status === 'fulfilled' && Array.isArray(cloudCandidates.value)) {
          srvCandidates = cloudCandidates.value;
        }
        if (cloudHeats.status === 'fulfilled' && Array.isArray(cloudHeats.value)) {
          srvHeats = cloudHeats.value;
        }
        if (cloudResults.status === 'fulfilled' && Array.isArray(cloudResults.value)) {
          srvResults = cloudResults.value;
        }
      }

      if (bootstrap?.source !== 'firestore' && bootstrap?.lastUpdated) {
        lastServerUpdatedRef.current = bootstrap.lastUpdated;
      }
      if (bootstrap?.candidates) {
        lastServerCandidatesCountRef.current = bootstrap.candidates.length;
      }
      if (bootstrap?.uploads) {
        lastServerUploadsCountRef.current = bootstrap.uploads.length;
      }

      setEvents(srvEvents);
      setClubs(srvClubs);
      setSettings(srvSettings);
      setHeats(srvHeats);
      setResults(srvResults);
      if (uploadsLoaded) {
        setUploads(srvUploads);
      }

      // Detect incoming approval requests for the server
      const currentPendingCount = srvUploads
        .filter((u: any) => u.status === 'pending')
        .reduce((sum: number, u: any) => {
          const unmerged = (u.candidates || []).filter((c: any) => !c.merged && c.status !== 'rejected').length;
          return sum + (unmerged > 0 ? unmerged : 1);
        }, 0);

      if (effectiveMode === 'server') {
        // Dynamic title notification for admin
        if (currentPendingCount > 0) {
          document.title = `(${currentPendingCount}) 🔔 Review Requests - ${srvSettings.ordinalTitle || 'eSports'}`;
        } else {
          document.title = `${srvSettings.ordinalTitle || '47th Annual Sports Meet 2027'} - Official Server Control`;
        }

        if (prevPendingCountRef.current === -1 && currentPendingCount > 0) {
          // Immediate banner on server mount/login if requests are pending
          setSyncNotice({
            type: 'success',
            message: `🔔 ${currentPendingCount} athlete approval request(s) awaiting review! Go to "Review & Approve" to allot chest numbers.`,
          });
        } else if (prevPendingCountRef.current !== -1 && currentPendingCount > prevPendingCountRef.current) {
          const diff = currentPendingCount - prevPendingCountRef.current;
          setSyncNotice({
            type: 'success',
            message: `🔔 New Approval Request: ${diff} new athlete(s) submitted from client portal! Go to "Review & Approve" to allot chest numbers.`,
          });
          // Web Audio chime notification
          try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContext) {
              const ctx = new AudioContext();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(587.33, ctx.currentTime);
              osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
              gain.gain.setValueAtTime(0.15, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
              osc.start();
              osc.stop(ctx.currentTime + 0.35);
            }
          } catch {
            // Audio playback requires user gesture on some browsers
          }
        }
      } else {
        document.title = `${srvSettings.ordinalTitle || '47th Annual Sports Meet 2027'} - Client Portal`;
      }
      prevPendingCountRef.current = currentPendingCount;

      // Cache events, clubs & settings to localStorage for instant offline client capability
      clientStorage.saveEventsCache(srvEvents);
      clientStorage.saveClubsCache(srvClubs);
      clientStorage.setCachedSettings(srvSettings);

      // 2. Candidates loading:
      if (effectiveMode === 'client') {
        const localCandidates = clientStorage.getCandidates();
        
        if (srvCandidates.length > 0) {
          const srvMap = new Map<string, any>(srvCandidates.map((c: any) => [c.id, c]));
          const srvNameMap = new Map<string, any>(srvCandidates.map((c: any) => [(c.name || '').trim().toUpperCase(), c]));
          let updated = false;
          const mergedList = localCandidates.map((local) => {
            const nameKey = (local.name || '').trim().toUpperCase();
            const matched = srvMap.get(local.id) || (nameKey ? srvNameMap.get(nameKey) : undefined);
            if (matched && matched.chestNo && Number(matched.chestNo) >= 101 && (
              matched.chestNo !== local.chestNo ||
              Boolean(matched.isCancelled) !== Boolean(local.isCancelled) ||
              matched.status !== local.status
            )) {
              updated = true;
              return {
                ...local,
                chestNo: matched.chestNo,
                isCancelled: matched.isCancelled,
                status: matched.status,
                synced: true,
                isDirty: false,
              };
            }
            return local;
          });

          const uniqueList = sanitizeUniqueCandidates(mergedList);

          if (updated) {
            clientStorage.saveCandidates(uniqueList);
          }
          setCandidates(uniqueList);
        } else {
          const uniqueList = sanitizeUniqueCandidates(localCandidates);
          setCandidates(uniqueList);
        }
      } else {
        // Mode is 'server': all official server candidates are canonical
        const uniqueList = sanitizeUniqueCandidates(srvCandidates || []);
        setCandidates(uniqueList);
      }
    } catch (err) {
      console.warn('Network sync paused:', err);
      if (effectiveMode === 'client') {
        const localCands = clientStorage.getCandidates();
        const uniqueList = sanitizeUniqueCandidates(localCands);
        setCandidates(uniqueList);
        setEvents(clientStorage.getEventsCache());
        setClubs(clientStorage.getClubsCache());
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [mode]);

  useEffect(() => {
    loadData();

    // 1. Instantaneous real-time push via Server-Sent Events (SSE) across desktop and mobile
    const unsubServerStream = api.subscribeServerStream((evt) => {
      if (evt?.type === 'db_updated') {
        loadData(true);
      }
    });

    // 2. High-frequency active fallback polling (5s) for local Express server notifications
    const interval = setInterval(async () => {
      try {
        const summary = await api.getSyncSummary().catch(() => null);
        if (summary) {
          if (!lastServerUpdatedRef.current && summary.lastUpdated) {
            lastServerUpdatedRef.current = summary.lastUpdated;
            return;
          }
          const hasChanged =
            (summary.lastUpdated && summary.lastUpdated !== lastServerUpdatedRef.current) ||
            (summary.pendingAthletesCount !== undefined && prevPendingCountRef.current !== -1 && summary.pendingAthletesCount !== prevPendingCountRef.current) ||
            (summary.uploadsCount !== undefined && lastServerUploadsCountRef.current !== -1 && summary.uploadsCount !== lastServerUploadsCountRef.current) ||
            (summary.candidatesCount !== undefined && lastServerCandidatesCountRef.current !== -1 && summary.candidatesCount !== lastServerCandidatesCountRef.current);

          if (hasChanged) {
            lastServerUpdatedRef.current = summary.lastUpdated || lastServerUpdatedRef.current;
            loadData(true);
          }
        }
      } catch {
        // Ignore background sync errors gracefully
      }
    }, 5000);

    const handleFocus = () => {
      loadData(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    };
    const handleOnline = () => {
      loadData(true);
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubServerStream();
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadData]);

  // Real-time Cloud Firestore synchronization across devices & containers
  // Deferred briefly on initial mount so Client Portal paints & becomes interactive immediately
  useEffect(() => {
    let cancelled = false;
    let unsubs: Array<() => void> = [];

    const timer = setTimeout(() => {
      if (cancelled) return;

      // 1. Uploads subscription: only needed in server mode
      if (mode === 'server') {
        unsubs.push(firestoreSync.subscribeUploads((cloudUploads) => {
          setUploads(cloudUploads);

          const currentPendingCount = cloudUploads
            .filter((u) => u.status === 'pending')
            .reduce((sum, u) => {
              const unmerged = (u.candidates || []).filter((c) => !c.merged && c.status !== 'rejected').length;
              return sum + (unmerged > 0 ? unmerged : 1);
            }, 0);

          if (currentPendingCount > 0) {
            document.title = `(${currentPendingCount}) 🔔 Review Requests - ${settings.ordinalTitle || 'eSports'}`;
          } else {
            document.title = `${settings.ordinalTitle || '47th Annual Sports Meet 2027'} - Official Server Control`;
          }

          if (prevPendingCountRef.current !== -1 && currentPendingCount > prevPendingCountRef.current) {
            const diff = currentPendingCount - prevPendingCountRef.current;
            setSyncNotice({
              type: 'success',
              message: `🔔 New Approval Request: ${diff} new athlete(s) submitted from client portal! Go to "Review & Approve" to allot chest numbers.`,
            });
            try {
              const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
              if (AudioContext) {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, ctx.currentTime);
                osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
              }
            } catch {}
          }
          prevPendingCountRef.current = currentPendingCount;
        }));
      }

      // 2. Official Candidates subscription
      unsubs.push(firestoreSync.subscribeCandidates((cloudCandidates) => {
        if (mode === 'server') {
          setCandidates(sanitizeUniqueCandidates(cloudCandidates));
        } else {
          const localCandidates = clientStorage.getCandidates();
          if (cloudCandidates.length > 0) {
            const srvMap = new Map<string, any>(cloudCandidates.map((c) => [c.id, c]));
            const srvNameMap = new Map<string, any>(cloudCandidates.map((c) => [(c.name || '').trim().toUpperCase(), c]));
            let updated = false;
            const mergedList = localCandidates.map((local) => {
              const nameKey = (local.name || '').trim().toUpperCase();
              const matched = srvMap.get(local.id) || (nameKey ? srvNameMap.get(nameKey) : undefined);
              if (matched && matched.chestNo && Number(matched.chestNo) >= 101 && matched.chestNo !== local.chestNo) {
                updated = true;
                return {
                  ...local,
                  chestNo: matched.chestNo,
                  synced: true,
                  isDirty: false,
                };
              }
              return local;
            });
            if (updated) {
              const sanitized = sanitizeUniqueCandidates(mergedList);
              clientStorage.saveCandidates(sanitized);
              setCandidates(sanitized);
            }
          }
        }
      }));

      // 3. Heats, Results, Settings, Events, Clubs subscriptions (always reflect live Firestore state, including empty tables)
      unsubs.push(firestoreSync.subscribeHeats((cloudHeats) => {
        setHeats(cloudHeats);
      }));

      unsubs.push(firestoreSync.subscribeResults((cloudResults) => {
        setResults(cloudResults);
      }));

      unsubs.push(firestoreSync.subscribeSettings((cloudSettings) => {
        setSettings(cloudSettings);
        clientStorage.setCachedSettings(cloudSettings);
      }));

      unsubs.push(firestoreSync.subscribeEvents((cloudEvents) => {
        setEvents(cloudEvents);
        clientStorage.saveEventsCache(cloudEvents);
      }));

      unsubs.push(firestoreSync.subscribeClubs((cloudClubs) => {
        setClubs(cloudClubs);
        clientStorage.saveClubsCache(cloudClubs);
      }));

      // 4. Server Session subscription
      unsubs.push(firestoreSync.subscribeServerSession((session) => {
        const myDeviceId = getDeviceId();
        if (session) {
          if (session.deviceId === myDeviceId) {
            setIsServerAuthenticated(true);
          } else {
            setIsServerAuthenticated(false);
            sessionStorage.removeItem('esports_server_auth');
            sessionStorage.removeItem('esports_server_session_id');
            localStorage.removeItem('esports_server_auth');
            if (mode === 'server') {
              setMode('client');
              setActiveTab('enroll');
              setSyncNotice({
                type: 'error',
                message: `Server session is active on ${session.deviceLabel || 'another device'}. Switched to Client mode.`,
              });
            }
          }
        }
      }));
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubs.forEach((unsub) => {
        try { unsub(); } catch {}
      });
    };
  }, [mode, settings.ordinalTitle]);

  // Single-device server session heartbeat & auto-lock if taken over
  useEffect(() => {
    if (!isServerAuthenticated) return;
    const sessionId = sessionStorage.getItem('esports_server_session_id');
    if (!sessionId) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.sendHeartbeat(sessionId);
        if (res && res.valid === false) {
          sessionStorage.removeItem('esports_server_auth');
          sessionStorage.removeItem('esports_server_session_id');
          setIsServerAuthenticated(false);
          setMode('client');
          setActiveTab('enroll');
          setSyncNotice({
            type: 'error',
            message: res.reason || 'Server session terminated because another device logged in.',
          });
        }
      } catch {
        // network blip ignored
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [isServerAuthenticated]);

  // Copyright protection: Restrict app logo and registered club logo from copy, download, share, drag, or opening in Chrome
  useEffect(() => {
    const isProtectedTarget = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      return !!(
        (target.tagName === 'IMG' && (
          target.classList.contains('protected-logo') ||
          target.getAttribute('data-protect-logo') === 'true' ||
          target.getAttribute('src')?.includes('icon.png') ||
          target.getAttribute('alt')?.toLowerCase().includes('logo') ||
          target.getAttribute('alt')?.toLowerCase().includes('esports')
        )) ||
        target.closest('.protected-logo-wrapper') ||
        target.closest('.protected-logo') ||
        target.closest('[data-protect-logo="true"]') ||
        target.classList.contains('protected-logo-overlay')
      );
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isProtectedTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const handleDragStart = (e: DragEvent) => {
      if (isProtectedTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    document.addEventListener('contextmenu', handleContextMenu, { capture: true });
    document.addEventListener('dragstart', handleDragStart, { capture: true });

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      document.removeEventListener('dragstart', handleDragStart, { capture: true });
    };
  }, []);

  // Helper to sync browser URL with current mode (client vs server) without polluting Back history stack
  const updateUrlMode = useCallback((targetMode: 'client' | 'server') => {
    if (typeof window !== 'undefined') {
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('mode') !== targetMode) {
          currentUrl.searchParams.set('mode', targetMode);
          window.history.replaceState(
            { ...(window.history.state || {}), mode: targetMode },
            '',
            currentUrl.toString()
          );
        }
      } catch {
        // ignore history state errors if sandboxed
      }
    }
  }, []);

  // Check URL parameters for explicit mode on initial mount
  useEffect(() => {
    // Clear persistent auth tokens so server remains strictly locked by default
    try {
      localStorage.removeItem('esports_server_auth');
    } catch {
      // ignore
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode');
      if (urlMode === 'server') {
        // By default server must be locked; under any circumstances subject to pin login
        setMode('client');
        setActiveTab('enroll');
        setShowPinModal(true);
      } else if (urlMode === 'client') {
        setMode('client');
        setActiveTab('enroll');
      }
    }
  }, []);

  // Double-tap mobile bottom back button to exit the app silently (no extra message/subtitle)
  const lastBackPressRef = useRef<number>(0);
  const isExitingAppRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const DOUBLE_TAP_EXIT_WINDOW_MS = 2000;

    try {
      const existingState = window.history.state || {};
      if (!existingState.__exitBase && !existingState.__exitGuard) {
        window.history.replaceState({ ...existingState, __exitBase: true }, '', window.location.href);
      }
    } catch {
      // ignore history errors if sandboxed
    }

    // Push guard inside real user activation so mobile browsers (Chrome/Android) intercept the first Back press
    const ensureActivatedGuard = () => {
      if (isExitingAppRef.current) return;
      try {
        const st = window.history.state || {};
        if (!st.__exitGuard) {
          window.history.pushState({ ...st, __exitGuard: true }, '', window.location.href);
        }
      } catch {
        // ignore history errors if sandboxed
      }
    };

    window.addEventListener('pointerdown', ensureActivatedGuard, { capture: true, passive: true });
    window.addEventListener('keydown', ensureActivatedGuard, { capture: true, passive: true });

    const handlePopState = () => {
      if (isExitingAppRef.current) return;

      const now = Date.now();
      const isDoubleTap = lastBackPressRef.current > 0 && now - lastBackPressRef.current <= DOUBLE_TAP_EXIT_WINDOW_MS;

      if (isDoubleTap) {
        isExitingAppRef.current = true;
        lastBackPressRef.current = 0;
        try {
          window.history.back();
        } catch {
          // ignore
        }
        window.setTimeout(() => {
          try {
            window.close();
          } catch {
            // ignore if browser disallows window.close()
          }
        }, 100);
        return;
      }

      // First tap: silently stay in app and arm double-tap window
      lastBackPressRef.current = now;
      try {
        window.history.pushState(
          { ...(window.history.state || {}), __exitGuard: true },
          '',
          window.location.href
        );
      } catch {
        // ignore history errors if sandboxed
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('pointerdown', ensureActivatedGuard, { capture: true });
      window.removeEventListener('keydown', ensureActivatedGuard, { capture: true });
    };
  }, []);

  // Suggested next chest or record number
  const suggestedChestNo = useMemo(() => {
    if (mode === 'client') {
      const clientClubName = localStorage.getItem('esports_client_club_name') || 'SASTHITALA AGRANI';
      const pool = candidates.filter(c => !clientClubName || (c.club || '').trim().toUpperCase() === clientClubName.trim().toUpperCase());
      const used = new Set<number>();
      pool.forEach(c => {
        const num = Number(c.localRecordNo || c.chestNo);
        if (num && num > 0 && num < 100) used.add(num);
      });
      let nextNum = 1;
      while (used.has(nextNum)) {
        nextNum++;
      }
      return nextNum;
    }
    const startingChest = settings.autoChestStart || 101;
    if (candidates.length === 0) return startingChest;
    const maxChest = Math.max(...candidates.map((c) => Number(c.chestNo) || 0));
    return maxChest >= startingChest ? maxChest + 1 : startingChest;
  }, [candidates, mode, settings.autoChestStart]);

  // Save Candidate Handler (Used by both Client and Server modes)
  const handleSaveCandidate = async (candidateData: any) => {
    const candidateName = (candidateData.name || '').trim().toUpperCase();

    // Prevent duplicate candidate name (case-insensitive) across the candidates list
    const existingDuplicate = candidates.find(c => {
      if (candidateData.id && c.id === candidateData.id) return false;
      if (candidateData.chestNo && Number(c.chestNo) === Number(candidateData.chestNo)) return false;
      return (c.name || '').trim().toUpperCase() === candidateName;
    });

    if (existingDuplicate) {
      throw new Error(`Candidate "${candidateName}" is already registered (Chest #${existingDuplicate.chestNo || existingDuplicate.localRecordNo || 'Assigned'}, ${existingDuplicate.club || 'Independent'})! Duplicate candidate names are not allowed.`);
    }

    if (mode === 'client') {
      // 1. Save locally to clientStorage (localStorage)
      // Note: mobile number is for club only, not saved into candidate record
      const { clubMobile, ...pureCandidateData } = candidateData;
      const savedCandidate = clientStorage.saveCandidate(pureCandidateData);
      const allLocal = clientStorage.getCandidates();
      setCandidates(sanitizeUniqueCandidates(allLocal));
      setCandidateToEdit(null);

      // Club name & mobile are held on the pending upload request until server approval.
      const effectiveClubMobile = (clubMobile || sessionStorage.getItem('esports_client_club_mobile') || '').trim();
      const clientClubName = (localStorage.getItem('esports_client_club_name') || sessionStorage.getItem('esports_client_club_name') || savedCandidate.club || 'SASTHITALA AGRANI').trim();

      // 2. Auto-submit immediately to Server Pending Queue
      // Ensures client's submitted data is instantly available in server's pending list!
      try {
        const unsynced = clientStorage.getUnsyncedCandidates();
        const batchToSubmit = unsynced.length > 0 ? unsynced : [savedCandidate];

        // Automatic retry (up to 2 attempts) to ensure transient network blips don't drop request
        let uploadSuccess = false;
        let lastErr: any = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await api.submitUpload({
              club: clientClubName,
              clubMobile: effectiveClubMobile,
              clientName: 'Client Portal',
              candidates: batchToSubmit,
              totalFees: batchToSubmit.reduce((sum, c) => sum + (c.totalFees || 0), 0),
              notes: `Live entry from Client Portal (${new Date().toLocaleTimeString()})`,
            });
            uploadSuccess = true;
            break;
          } catch (err) {
            lastErr = err;
            if (attempt === 1) {
              await new Promise(res => setTimeout(res, 500));
            }
          }
        }

        if (!uploadSuccess && lastErr) {
          throw lastErr;
        }

        clientStorage.markSynced(batchToSubmit.map(c => c.id), new Date().toISOString());
        setCandidates(sanitizeUniqueCandidates(clientStorage.getCandidates()));

        const updatedUploads = await api.getUploads().catch(() => []);
        setUploads(updatedUploads);

        setSyncNotice({
          type: 'success',
          message: `Approval request for "${savedCandidate.name}" sent to server review queue!`,
        });
        setTimeout(() => setSyncNotice(null), 4000);
      } catch (uploadErr: any) {
        console.warn('Auto-submit to server pending list deferred/offline:', uploadErr);
        setSyncNotice({
          type: 'error',
          message: `Saved locally. Server approval request failed: ${uploadErr.message || 'Offline'}. Tap "Send" to retry.`,
        });
        setTimeout(() => setSyncNotice(null), 5000);
      }
    } else {
      // Server direct entry: check restriction per Logic 1 before persisting
      // Exception: allow any candidate (even edit-locked) to enroll/toggle Direct Events (Height=ALL & Gender=ALL)
      // or Additional Events (higher heights under same gender), while personal details & feeStatus remain locked.
      const targetCandidate = (candidateData.id ? candidates.find(c => c.id === candidateData.id) : null) || candidateToEdit;
      let isQuickEventOnlyForLocked = false;
      if (targetCandidate) {
        const restrictionStatus = getCandidateRestrictionStatus(targetCandidate, events, heats, results, 'server');
        if (restrictionStatus.isRestricted) {
          const additionalEvtNos = new Set<number>(
            getAdditionalEventsForCandidate(targetCandidate, events).map((e) => Number(e.Evt_No))
          );

          const isAllowedQuickEvtNo = (evtNo: number): boolean => {
            const ev = events.find((e) => Number(e.Evt_No) === Number(evtNo));
            return isDirectEvent(ev) || additionalEvtNos.has(Number(evtNo));
          };

          const nonEventFieldsUnchanged =
            (targetCandidate.name || '').trim().toUpperCase() === (candidateData.name || '').trim().toUpperCase() &&
            (targetCandidate.club || 'SELF').trim().toUpperCase() === (candidateData.club || 'SELF').trim().toUpperCase() &&
            normalizeGender(targetCandidate.gender) === normalizeGender(candidateData.gender) &&
            (targetCandidate.height || 'ALL').trim().toUpperCase() === (candidateData.height || 'ALL').trim().toUpperCase() &&
            (targetCandidate.feeStatus || 'Due').trim().toUpperCase() === (candidateData.feeStatus || 'Due').trim().toUpperCase();

          const prevEvts = new Set<number>((targetCandidate.selectedEvents || []).map(Number));
          const nextEvts = new Set<number>(
            Array.isArray(candidateData.selectedEvents) ? candidateData.selectedEvents.map(Number) : []
          );
          const removedEvts = Array.from(prevEvts).filter((n) => !nextEvts.has(n));
          const addedEvts = Array.from(nextEvts).filter((n) => !prevEvts.has(n));
          const changedEvts: number[] = [...removedEvts, ...addedEvts];
          const removedRestrictedEvent = removedEvts.some((n) => restrictionStatus.restrictingEvents.includes(n));

          isQuickEventOnlyForLocked =
            nonEventFieldsUnchanged &&
            !removedRestrictedEvent &&
            changedEvts.length > 0 &&
            changedEvts.every((n) => isAllowedQuickEvtNo(n));

          if (!isQuickEventOnlyForLocked) {
            throw new Error(getCandidateEditRestrictedMessage(targetCandidate, restrictionStatus));
          }
        }
      }

      const effectiveClub = isQuickEventOnlyForLocked && targetCandidate
        ? ((targetCandidate.club || '').trim() || 'SELF')
        : ((candidateData.club || '').trim() || 'SELF');

      const nextSelectedEvts: number[] = Array.isArray(candidateData.selectedEvents)
        ? candidateData.selectedEvents.map(Number).filter((n: number) => !Number.isNaN(n))
        : [];
      const feeStatusToUse = isQuickEventOnlyForLocked && targetCandidate
        ? (targetCandidate.feeStatus || 'Due')
        : (candidateData.feeStatus || 'Due');
      const feeStUpper = feeStatusToUse.trim().toUpperCase();
      const isFeeFree = feeStUpper.includes('FREE') || feeStUpper.includes('EXEMPT');
      const computedCumulativeFees = isFeeFree
        ? 0
        : nextSelectedEvts.reduce((sum: number, no: number) => {
            const ev = events.find((e) => Number(e.Evt_No) === Number(no));
            return sum + (ev ? Number(ev.Fees) || 0 : 0);
          }, 0);

      const srvCandidate = {
        ...candidateData,
        ...(isQuickEventOnlyForLocked && targetCandidate
          ? {
              name: targetCandidate.name,
              club: effectiveClub,
              gender: targetCandidate.gender,
              height: targetCandidate.height,
              feeStatus: targetCandidate.feeStatus,
            }
          : { club: effectiveClub }),
        selectedEvents: nextSelectedEvts,
        totalFees: isQuickEventOnlyForLocked ? computedCumulativeFees : (candidateData.totalFees ?? computedCumulativeFees),
        synced: true,
        isDirty: false,
        updatedAt: new Date().toISOString(),
      };
      await api.saveCandidate(srvCandidate);
      await loadData(true);
      setCandidateToEdit(null);
    }
  };

  // Cancel Candidate Chest Handler (Deletion is prohibited for server records; cancellation deactivates chest from hit lists)
  const handleCancelCandidateChest = async (id: string) => {
    try {
      const res = await api.cancelCandidateChest(id);
      await loadData();
      setSyncNotice({ type: 'success', message: res.message });
      setTimeout(() => setSyncNotice(null), 5000);
    } catch (err: any) {
      alert(`Failed to cancel chest number: ${err.message || err}`);
    }
  };

  // Delete Candidate Handler
  const handleDeleteCandidate = async (id: string) => {
    if (mode === 'client') {
      clientStorage.deleteCandidate(id);
      setCandidates(sanitizeUniqueCandidates(clientStorage.getCandidates()));
      api.deleteUploadCandidateGlobally(id).then(async () => {
        const updatedUploads = await api.getUploads().catch(() => []);
        setUploads(updatedUploads);
      }).catch(() => {});
    } else {
      const target = candidates.find((c) => c.id === id);
      if (target && (Number(target.chestNo) >= 101 || target.chestNo || target.synced)) {
        alert(
          `Deletion Prohibited!\n\nCandidate "${target.name}" has a generated Chest #${target.chestNo}. Deletion of saved candidates is strictly not permitted under any circumstances.\n\nPlease use the "Cancel Chest No." option to deactivate this candidate's chest number.`
        );
        return;
      }
      try {
        await api.deleteCandidate(id);
        const updatedList = await api.getCandidates();
        setCandidates(sanitizeUniqueCandidates(updatedList));
      } catch (err: any) {
        alert(err.message || 'Failed to delete candidate');
      }
    }
  };

  // Trigger Client to Server Upload (Sends candidate entries into Server Staging for review)
  const handleSyncToServer = async () => {
    if (mode === 'client' && settings.clientResponseEnabled === false) {
      setSyncNotice({
        type: 'error',
        message: 'Client responses are currently paused by the server administrator. Uploads cannot be sent at this time.',
      });
      setTimeout(() => setSyncNotice(null), 5000);
      return;
    }

    setIsSyncing(true);
    setSyncNotice(null);
    try {
      const allLocal = clientStorage.getCandidates();
      const unsynced = clientStorage.getUnsyncedCandidates();
      const toUpload = unsynced.length > 0 ? unsynced : allLocal;

      if (toUpload.length === 0) {
        setSyncNotice({
          type: 'success',
          message: 'No candidates enrolled to upload. Enroll athletes first.',
        });
        setTimeout(() => setSyncNotice(null), 3500);
        return;
      }

      // Read club name and mobile from client storage (club is registered on server only upon approval)
      const clientClubName = localStorage.getItem('esports_client_club_name') || toUpload[0]?.club || 'SASTHITALA AGRANI';
      const clientClubMobile = (sessionStorage.getItem('esports_client_club_mobile') || (toUpload.find((c: any) => Boolean(c.clubMobile)) as any)?.clubMobile || '').trim();

      // Submit upload batch to server staging area
      const res = await api.submitUpload({
        club: clientClubName,
        clubMobile: clientClubMobile || undefined,
        clientName: 'Mobile Client',
        candidates: toUpload,
        totalFees: toUpload.reduce((sum, c) => sum + (c.totalFees || 0), 0),
        notes: `Uploaded via client portal (${toUpload.length} athletes)`,
      });

      // Mark locally as synced
      clientStorage.markSynced(toUpload.map(c => c.id), new Date().toISOString());
      setCandidates(sanitizeUniqueCandidates(clientStorage.getCandidates()));

      // Refresh uploads list
      const updatedUploads = await api.getUploads().catch(() => []);
      setUploads(updatedUploads);

      setSyncNotice({
        type: 'success',
        message: `Upload successful! ${toUpload.length} athlete(s) for "${clientClubName}" submitted to server. They are now accumulated in the Server Club Uploads Review queue!`,
      });
      setTimeout(() => setSyncNotice(null), 6000);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setSyncNotice({
        type: 'error',
        message: 'Upload failed: ' + (err.message || 'Server connection error'),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Force full re-upload of all client records to server
  const handleForceFullSync = async () => {
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      const allLocal = clientStorage.getCandidates();
      if (allLocal.length === 0) {
        setSyncNotice({
          type: 'success',
          message: 'No candidate records found to upload.',
        });
        setTimeout(() => setSyncNotice(null), 3000);
        return;
      }

      const clientClubName = localStorage.getItem('esports_client_club_name') || allLocal[0]?.club || 'SASTHITALA AGRANI';
      const clientClubMobile = (sessionStorage.getItem('esports_client_club_mobile') || (allLocal.find((c: any) => Boolean(c.clubMobile)) as any)?.clubMobile || '').trim();

      await api.submitUpload({
        club: clientClubName,
        clubMobile: clientClubMobile || undefined,
        clientName: 'Mobile Client (Full Upload)',
        candidates: allLocal,
        totalFees: allLocal.reduce((sum, c) => sum + (c.totalFees || 0), 0),
        notes: `Complete batch of ${allLocal.length} candidate(s)`,
      });

      clientStorage.markAllAsSynced();
      setCandidates(sanitizeUniqueCandidates(clientStorage.getCandidates()));

      const updatedUploads = await api.getUploads().catch(() => []);
      setUploads(updatedUploads);

      setSyncNotice({
        type: 'success',
        message: `Complete batch upload successful! ${allLocal.length} athlete(s) for "${clientClubName}" submitted to server review queue.`,
      });
      setTimeout(() => setSyncNotice(null), 6000);
    } catch (err: any) {
      setSyncNotice({
        type: 'error',
        message: 'Full upload failed: ' + (err.message || 'Server connection error'),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Edit Candidate Action from list
  const handleEditCandidate = (cand: Candidate) => {
    setCandidateToEdit(cand);
    setActiveTab('enroll');
  };

  // Event Handlers
  const handleSaveEvent = async (event: SportEvent) => {
    await api.saveEvent(event);
    const updated = await api.getEvents();
    setEvents(updated);
    clientStorage.saveEventsCache(updated);
  };

  const handleDeleteEvent = async (evtNo: number) => {
    await api.deleteEvent(evtNo);
    const updated = await api.getEvents();
    setEvents(updated);
    clientStorage.saveEventsCache(updated);
  };

  const handleResetEvents = async () => {
    await api.resetEvents();
    const updated = await api.getEvents();
    setEvents(updated);
    clientStorage.saveEventsCache(updated);
  };

  // Hit List / Heats Handlers
  const handleSaveHeat = async (heat: Partial<EventHeat>) => {
    await api.saveHeat(heat);
    await loadData(true);
  };

  const handleDeleteHeat = async (heatId: string) => {
    await api.deleteHeat(heatId);
    await loadData(true);
  };

  const handlePromoteToFinal = async (evtNo: number, qualified: HeatParticipant[]) => {
    const existing = results.find((r) => Number(r.eventNo) === Number(evtNo));
    const newFinalParticipants = qualified.map((q, idx) => ({
      chestNo: q.chestNo,
      candidateName: q.candidateName,
      club: q.club,
      lane: idx + 1,
    }));
    await api.saveResult({
      id: existing?.id || `res_evt_${evtNo}`,
      eventNo: evtNo,
      finalists: newFinalParticipants,
      completed: existing?.completed || false,
    });
    await loadData(true);
  };

  // Results & Finals Handlers
  const handleSaveResult = async (result: Partial<EventResult>) => {
    await api.saveResult(result);
    await loadData(true);
  };

  const handleNavigateToRanking = (evtNo?: number) => {
    if (evtNo !== undefined) {
      setPreselectedRankingEvt(evtNo);
    }
    setActiveTab('rankings');
  };

  // Admin & Settings Handlers
  const handleSaveSettings = async (newSettings: SportsMeetSettings) => {
    await api.saveSettings(newSettings);
    setSettings(newSettings);

    // Synchronize host club in clubs registry if registeredClubName, registeredClubLogo, or registeredClubPhone changed
    if (newSettings.registeredClubName || newSettings.registeredClubLogo || newSettings.registeredClubPhone) {
      const hostClub = clubs.find((c) => c.id === 'club_1') || clubs[0];
      if (hostClub) {
        const updatedClub: Club = {
          ...hostClub,
          name: newSettings.registeredClubName || hostClub.name,
          logoUrl: newSettings.registeredClubLogo || hostClub.logoUrl,
          phone: newSettings.registeredClubPhone || hostClub.phone,
        };
        await api.saveClub(updatedClub).catch(() => {});
        setClubs((prev) => prev.map((c) => (c.id === updatedClub.id ? updatedClub : c)));
      }
    }
  };

  const handleSaveClub = async (clubData: Partial<Club>) => {
    await api.saveClub(clubData);
    const updated = await api.getClubs();
    setClubs(updated);
    clientStorage.saveClubsCache(updated);
  };

  const handleDeleteClub = async (clubId: string) => {
    await api.deleteClub(clubId);
    const updated = await api.getClubs();
    setClubs(updated);
    clientStorage.saveClubsCache(updated);
  };

  const handleMarkClubsPaid = async (clubNames: string[]): Promise<{ updatedCount: number; totalMarkedAmount: number }> => {
    const selectedSet = new Set(clubNames.map((n) => n.trim().toUpperCase()).filter(Boolean));
    if (selectedSet.size === 0) {
      return { updatedCount: 0, totalMarkedAmount: 0 };
    }

    const targets = candidates.filter((c) => {
      if (c.isCancelled || c.status === 'cancelled') return false;
      const clubNorm = (c.club || '').trim().toUpperCase();
      if (!selectedSet.has(clubNorm)) return false;
      const st = (c.feeStatus || 'Due').trim().toUpperCase();
      const isFree = st.includes('FREE') || st.includes('EXEMPT');
      const isDue = !isFree && (st.includes('DUE') || st.includes('UNPAID') || !st.includes('PAID'));
      return isDue;
    });

    if (targets.length === 0) {
      return { updatedCount: 0, totalMarkedAmount: 0 };
    }

    const totalMarkedAmount = targets.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0);
    await api.markClubsPaid(Array.from(selectedSet), targets);
    await loadData(true);
    return { updatedCount: targets.length, totalMarkedAmount };
  };

  const handleDownloadBackup = async () => {
    try {
      const dump = await api.getDatabaseDump();
      const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dump, null, 2));
      const a = document.createElement('a');
      a.href = jsonStr;
      a.download = `eSports_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download backup', err);
    }
  };

  const handleDownloadExcel = useCallback(async () => {
    const { downloadSportsMeetExcel } = await import('./services/excelExport');
    downloadSportsMeetExcel({
      candidates,
      events,
      clubs,
      heats,
      results,
      settings,
    });
  }, [candidates, events, clubs, heats, results, settings]);

  const handleRestoreBackup = async (jsonData: any) => {
    await api.restoreDatabaseDump(jsonData);
    await loadData(true);
  };

  const handleResetAllData = async () => {
    await api.resetToDefaults();
    await loadData(true);
  };

  // Switch mode handler with PIN Protection for Server Mode
  const handleModeChange = (newMode: 'client' | 'server') => {
    if (newMode === 'server') {
      if (!isServerAuthenticated) {
        updateUrlMode('server');
        setShowPinModal(true);
        return;
      }
      setMode('server');
      setActiveTab('uploads');
      updateUrlMode('server');
    } else {
      setMode('client');
      setActiveTab('enroll');
      updateUrlMode('client');
    }
  };

  // On successful PIN verification
  const handlePinSuccess = async (sessionData?: any) => {
    setIsServerAuthenticated(true);
    setShowPinModal(false);
    setMode('server');
    setActiveTab('uploads');
    updateUrlMode('server');
    // Force immediate sync of all server records
    await loadData(true, 'server');
    setSyncNotice({
      type: 'success',
      message: sessionData?.message || 'Server Control Unlocked. Database synchronized with server.',
    });
    setTimeout(() => setSyncNotice(null), 4000);
  };

  // Lock server handler
  const handleLockServer = async () => {
    const sessId = sessionStorage.getItem('esports_server_session_id') || localStorage.getItem('esports_server_session_id') || undefined;
    sessionStorage.removeItem('esports_server_auth');
    sessionStorage.removeItem('esports_server_session_id');
    localStorage.removeItem('esports_server_auth');
    localStorage.removeItem('esports_server_session_id');
    setIsServerAuthenticated(false);
    setMode('client');
    setActiveTab('enroll');
    updateUrlMode('client');
    try {
      await api.logoutServer(sessId);
    } catch {
      // ignore
    }
    setSyncNotice({
      type: 'success',
      message: 'Server control locked and session released. Switched to Client Portal.',
    });
    setTimeout(() => setSyncNotice(null), 3500);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        currentMode={mode}
        setMode={handleModeChange}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        settings={settings}
        events={events}
        results={results}
        unsyncedCount={unsyncedCount}
        onSyncTrigger={handleSyncToServer}
        isSyncing={isSyncing}
        serverOnline={true}
        isServerAuthenticated={isServerAuthenticated}
        onPromptPin={() => {
          updateUrlMode('server');
          setShowPinModal(true);
        }}
        onOpenResetPin={() => setShowResetPinModal(true)}
        onLockServer={handleLockServer}
        pendingUploadsCount={pendingUploadsCount}
        onDownloadExcel={handleDownloadExcel}
        onOpenThermalSetup={() => setShowThermalSetup(true)}
        onRefreshLiveStatus={() => loadData(true)}
      />

      {/* Cloud Firestore Quota Exceeded Notice Banner */}
      {isFirestoreQuotaExceeded && !dismissQuotaBanner && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 w-full print:hidden">
          <div className="p-4 rounded-xl text-sm font-medium bg-amber-950/80 border border-amber-500/40 text-amber-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">⚠️</span>
              <div>
                <p className="font-bold text-amber-300 text-sm">
                  Firestore Free Daily Write Quota Limit Reached (Spark Plan: 20,000 writes/day)
                </p>
                <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                  The application is running smoothly using the local server database so all features, enrollments, reports, and downloads continue without data loss. Quotas automatically reset every 24 hours.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-auto text-xs font-semibold">
              <a
                href="https://console.firebase.google.com/project/gen-lang-client-0314503200/firestore/databases/ai-studio-esportssportsman-cdafea5a-b133-49a1-b322-b307dac88fe4/data?openUpgradeDialog=true"
                target="_blank"
                rel="noreferrer"
                className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1 shadow-xs"
              >
                <span>Upgrade / Console</span>
                <span className="text-[10px]">↗</span>
              </a>
              <a
                href="https://firebase.google.com/pricing#cloud-firestore"
                target="_blank"
                rel="noreferrer"
                className="bg-slate-800 hover:bg-slate-700 text-amber-300 px-3 py-1.5 rounded-lg border border-amber-500/30 transition-colors inline-flex items-center gap-1"
              >
                <span>Pricing Info</span>
                <span className="text-[10px]">↗</span>
              </a>
              <button
                onClick={() => setDismissQuotaBanner(true)}
                className="text-amber-400 hover:text-white hover:bg-white/10 px-2 py-1 rounded-md cursor-pointer transition-colors"
                title="Dismiss notice"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync / Action Notification Banner */}
      {syncNotice && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 w-full print:hidden">
          <div
            className={`p-4 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 shadow-xs ${
              syncNotice.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-rose-600 text-white'
            }`}
          >
            <span>{syncNotice.message}</span>
            <button
              onClick={() => setSyncNotice(null)}
              className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-4">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-600">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-xs font-semibold">Loading view...</span>
            </div>
          }
        >
        {/* TAB 0: Club Uploads Review (Server Staging Area) */}
        {activeTab === 'uploads' && mode === 'server' && (
          <ClubUploadsReview
            uploads={uploads}
            events={events}
            clubs={clubs}
            settings={settings}
            serverCandidates={candidates}
            onRefresh={() => loadData(true, 'server')}
            onNavigateToCandidates={() => setActiveTab('candidates')}
            onMergeSuccess={(msg) => {
              setSyncNotice({ type: 'success', message: msg });
              setTimeout(() => setSyncNotice(null), 6000);
            }}
            onSaveSettings={handleSaveSettings}
          />
        )}

        {/* TAB 1: Candidate Enrollment */}
        {activeTab === 'enroll' && (
          <CandidateEnroll
            events={events}
            clubs={clubs}
            settings={settings}
            mode={mode}
            onSaveCandidate={handleSaveCandidate}
            candidateToEdit={candidateToEdit}
            onCancelEdit={() => setCandidateToEdit(null)}
            suggestedChestNo={suggestedChestNo}
            candidates={candidates}
            heats={heats}
            results={results}
            onNavigateToCandidates={() => setActiveTab('candidates')}
            onSyncTrigger={handleSyncToServer}
            isSyncing={isSyncing}
            onEditCandidate={handleEditCandidate}
            onDeleteCandidate={handleDeleteCandidate}
            onCancelChest={handleCancelCandidateChest}
            onSaveClub={handleSaveClub}
          />
        )}

        {/* TAB 2: Candidate View / Edit List & Sync */}
        {activeTab === 'candidates' && (
          <CandidateList
            candidates={candidates}
            events={events}
            clubs={clubs}
            settings={settings}
            mode={mode}
            heats={heats}
            results={results}
            onEditCandidate={handleEditCandidate}
            onSaveCandidate={handleSaveCandidate}
            onDeleteCandidate={handleDeleteCandidate}
            onCancelChest={handleCancelCandidateChest}
            onSyncToServer={handleSyncToServer}
            onForceFullSync={handleForceFullSync}
            isSyncing={isSyncing}
            onClose={() => setActiveTab('enroll')}
          />
        )}

        {/* TAB 3: Event Master List (Server) */}
        {activeTab === 'events' && (
          <EventMaster
            events={events}
            settings={settings}
            onSaveEvent={handleSaveEvent}
            onDeleteEvent={handleDeleteEvent}
            onResetEvents={handleResetEvents}
          />
        )}

        {/* TAB 4: Hit / Final List (Server) */}
        {activeTab === 'heats' && (
          <HitList
            events={events}
            candidates={candidates}
            heats={heats}
            results={results}
            clubs={clubs}
            settings={settings}
            onSaveHeat={handleSaveHeat}
            onDeleteHeat={handleDeleteHeat}
            onPromoteToFinal={handlePromoteToFinal}
            onNavigateToRanking={handleNavigateToRanking}
            onSaveSettings={handleSaveSettings}
          />
        )}

        {/* TAB 5: Ranking List & Club Championship (Server) */}
        {activeTab === 'rankings' && (
          <RankingList
            events={events}
            candidates={candidates}
            results={results}
            clubs={clubs}
            settings={settings}
            onSaveResult={handleSaveResult}
            preselectedEvtNo={preselectedRankingEvt}
            onNavigateBackToHitList={() => setActiveTab('heats')}
          />
        )}

        {/* TAB 7: Reports (Printable Chest-wise, Club-wise, Hit, Final, Rankings, Championship - Server Only) */}
        {activeTab === 'reports' && mode === 'server' && (
          <Reports
            candidates={candidates}
            events={events}
            clubs={clubs}
            settings={settings}
            heats={heats}
            results={results}
            onSaveSettings={handleSaveSettings}
          />
        )}

        {/* TAB 8: Admin Panel & Settings */}
        {activeTab === 'admin' && (
          <AdminPanel
            settings={settings}
            clubs={clubs}
            events={events}
            candidates={candidates}
            heats={heats}
            results={results}
            onSaveSettings={handleSaveSettings}
            onSaveClub={handleSaveClub}
            onDeleteClub={handleDeleteClub}
            onMarkClubsPaid={handleMarkClubsPaid}
            onSaveEvent={handleSaveEvent}
            onDeleteEvent={handleDeleteEvent}
            onResetEvents={handleResetEvents}
            onDownloadBackup={handleDownloadBackup}
            onDownloadExcel={handleDownloadExcel}
            onRestoreBackup={handleRestoreBackup}
            onResetAllData={handleResetAllData}
            onPurgeExceptEvents={async () => {
              await api.purgeAllExceptEvents();
              await loadData(true);
            }}
            onOpenResetPin={() => setShowResetPinModal(true)}
          />
        )}

        {/* TAB 9: Database Explorer */}
        {activeTab === 'db' && (
          <DbExplorer
            data={{
              candidates,
              clientUploads: uploads,
              events,
              clubs,
              heats,
              results,
              settings,
            }}
            onRefresh={loadData}
            onDownloadBackup={handleDownloadBackup}
            onRestoreBackup={handleRestoreBackup}
            onResetAllData={handleResetAllData}
            onPurgeExceptEvents={async () => {
              await api.purgeAllExceptEvents();
              await loadData(true);
            }}
          />
        )}
        </Suspense>
      </main>

      {/* Footer with Minimal Height, Left-Aligned Club Details & Right-Aligned Direct-Call Mobile */}
      <footer className="bg-white border-t border-slate-200 py-1.5 px-3 sm:px-4 text-xs text-slate-500 print:hidden shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left Aligned: Registered Club Logo, Registered Club Name, and Meet Ordinal */}
          <div className="flex items-center gap-2.5 min-w-0 text-left">
            <div 
              className="relative shrink-0 protected-logo-wrapper select-none"
              onContextMenu={(e) => e.preventDefault()}
            >
              <img
                src={
                  settings.registeredClubLogo ||
                  clubs.find((c) => c.id === 'club_1')?.logoUrl ||
                  clubs[0]?.logoUrl ||
                  '/icon.png'
                }
                alt={
                  settings.registeredClubName ||
                  clubs.find((c) => c.id === 'club_1')?.name ||
                  clubs[0]?.name ||
                  settings.organizer ||
                  'Registered Club Logo'
                }
                data-protect-logo="true"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-contain p-0.5 border border-slate-200 shadow-2xs shrink-0 bg-white protected-logo select-none pointer-events-none"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/icon.png';
                }}
              />
              <div 
                className="protected-logo-overlay rounded-full" 
                aria-hidden="true" 
                onContextMenu={(e) => e.preventDefault()} 
              />
            </div>
            <div className="flex flex-col justify-center min-w-0 leading-tight">
              <span className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight truncate leading-tight">
                {settings.registeredClubName ||
                  clubs.find((c) => c.id === 'club_1')?.name ||
                  clubs[0]?.name ||
                  settings.organizer ||
                  'Agrani Sasthitala Sangha'}
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 truncate leading-tight">
                {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
              </span>
            </div>
          </div>

          {/* Right Most Side: Registered Club Mobile (only digits) with Direct Call on Tap */}
          {(() => {
            const rawPhone =
              settings.registeredClubPhone ||
              clubs.find((c) => c.id === 'club_1')?.phone ||
              clubs[0]?.phone ||
              '';
            const digitsOnly = String(rawPhone || '').replace(/\D/g, '');
            if (!digitsOnly) return null;
            return (
              <a
                href={`tel:${digitsOnly}`}
                title={`Call ${digitsOnly}`}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 border border-emerald-200 text-xs sm:text-sm font-mono font-bold transition-all active:scale-95 shadow-2xs"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0 animate-pulse" />
                <span className="tracking-wide">{digitsOnly}</span>
              </a>
            );
          })()}
        </div>
      </footer>

      {/* Lazy-Loaded Modals */}
      <Suspense fallback={null}>
        {showPinModal && (
          <PinLoginModal
            isOpen={showPinModal}
            onSuccess={handlePinSuccess}
            onCancel={() => {
              setShowPinModal(false);
              setMode('client');
              setActiveTab('enroll');
              if (!isServerAuthenticated) {
                updateUrlMode('client');
              }
            }}
          />
        )}

        {showResetPinModal && (
          <ResetPinModal
            isOpen={showResetPinModal}
            onClose={() => setShowResetPinModal(false)}
            onSuccessNotice={(msg) => {
              setSyncNotice({ type: 'success', message: msg });
              setTimeout(() => setSyncNotice(null), 5000);
            }}
          />
        )}

        {showThermalSetup && (
          <ThermalPageSetupModal
            isOpen={showThermalSetup}
            onClose={() => setShowThermalSetup(false)}
            settings={settings}
          />
        )}
      </Suspense>
    </div>
  );
}

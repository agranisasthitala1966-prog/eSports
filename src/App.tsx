import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { api } from './services/api';
import { clientStorage } from './services/clientStorage';
import { firestoreSync } from './services/firestoreSync';
import { 
  getCandidateRestrictionStatus, 
  getCandidateEditRestrictedMessage, 
  getCandidateQualifiedEvents 
} from './utils/qualificationRules';
import { INITIAL_EVENTS, INITIAL_CLUBS, INITIAL_SETTINGS } from './constants/initialData';

// Subcomponents
import { Navbar } from './components/Navbar';
import { CandidateEnroll } from './components/CandidateEnroll';
import { CandidateList } from './components/CandidateList';
import { EventMaster } from './components/EventMaster';
import { HitList } from './components/HitList';
import { RankingList } from './components/RankingList';
import { Reports } from './components/Reports';
import { AdminPanel } from './components/AdminPanel';
import { DbExplorer } from './components/DbExplorer';
import { ClubUploadsReview } from './components/ClubUploadsReview';
import { PinLoginModal } from './components/PinLoginModal';
import { ResetPinModal } from './components/ResetPinModal';
import { Phone } from 'lucide-react';

function sanitizeUniqueCandidates(list: Candidate[]): Candidate[] {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set<string>();
  const seenChests = new Set<number>();
  const result: Candidate[] = [];

  list.forEach((c) => {
    if (!c) return;
    const cid = c.id ? String(c.id).trim() : '';
    if (cid && seenIds.has(cid)) return;

    if (cid) seenIds.add(cid);

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

  // Core Data
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [events, setEvents] = useState<SportEvent[]>(INITIAL_EVENTS);
  const [clubs, setClubs] = useState<Club[]>(INITIAL_CLUBS);
  const [heats, setHeats] = useState<EventHeat[]>([]);
  const [results, setResults] = useState<EventResult[]>([]);
  const [settings, setSettings] = useState<SportsMeetSettings>(INITIAL_SETTINGS);
  const [uploads, setUploads] = useState<ClientUpload[]>([]);

  // Server Authentication & PIN states
  const [isServerAuthenticated, setIsServerAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('esports_server_auth') === 'true';
  });
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [showResetPinModal, setShowResetPinModal] = useState<boolean>(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

  // Reference to track last known server timestamp to avoid redundant fetches
  const lastUpdatedRef = useRef<string>('');
  const prevPendingCountRef = useRef<number>(-1);
  const prevUploadsCountRef = useRef<number>(-1);
  const prevCandidatesCountRef = useRef<number>(-1);
  const isFetchingRef = useRef<boolean>(false);

  // Load data based on active mode using single consolidated bootstrap endpoint
  const loadData = useCallback(async (force = false, targetMode?: 'client' | 'server') => {
    if (isFetchingRef.current && !force) return;
    isFetchingRef.current = true;
    const effectiveMode = targetMode || mode;
    try {
      // 1. Fetch entire state in a single lightweight API call
      const bootstrap = await api.getBootstrap().catch(() => null);

      const srvEvents = bootstrap?.events || (await api.getEvents().catch(() => INITIAL_EVENTS));
      const srvClubs = bootstrap?.clubs || (await api.getClubs().catch(() => INITIAL_CLUBS));
      const srvSettings = bootstrap?.settings || (await api.getSettings().catch(() => INITIAL_SETTINGS));
      
      let srvHeats: EventHeat[] = [];
      try {
        const cloudHeats = await api.getHeats();
        srvHeats = cloudHeats.length > 0 ? cloudHeats : (bootstrap?.heats || []);
      } catch {
        srvHeats = bootstrap?.heats || [];
      }

      let srvResults: EventResult[] = [];
      try {
        const cloudResults = await api.getResults();
        srvResults = cloudResults.length > 0 ? cloudResults : (bootstrap?.results || []);
      } catch {
        srvResults = bootstrap?.results || [];
      }

      // 2. Fetch and merge Cloud Firestore uploads so that any client submission
      // from any link/container (ais-pre, mobile, direct link) is NEVER lost or wiped out!
      let srvUploads: ClientUpload[] = [];
      try {
        const cloudUploads = await api.getUploads();
        if (cloudUploads.length > 0) {
          srvUploads = cloudUploads;
        } else {
          srvUploads = bootstrap?.uploads || [];
        }
      } catch (err) {
        console.warn('Could not fetch cloud uploads:', err);
        srvUploads = bootstrap?.uploads || [];
      }

      // 3. Fetch and merge Cloud Firestore candidates
      let srvCandidates: Candidate[] = [];
      try {
        const cloudCandidates = await api.getCandidates();
        if (cloudCandidates.length > 0) {
          srvCandidates = cloudCandidates;
        } else {
          srvCandidates = bootstrap?.candidates || [];
        }
      } catch (err) {
        console.warn('Could not fetch cloud candidates:', err);
        srvCandidates = bootstrap?.candidates || [];
      }

      if (bootstrap?.lastUpdated) {
        lastUpdatedRef.current = bootstrap.lastUpdated;
      }
      prevUploadsCountRef.current = srvUploads.length;
      prevCandidatesCountRef.current = srvCandidates.length;

      setEvents(srvEvents);
      setClubs(srvClubs);
      setSettings(srvSettings);
      setHeats(srvHeats);
      setResults(srvResults);
      setUploads((prev) => (srvUploads.length > 0 ? srvUploads : prev.length > 0 ? prev : []));

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

      // Cache events & clubs to localStorage for offline client capability
      clientStorage.saveEventsCache(srvEvents);
      clientStorage.saveClubsCache(srvClubs);

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
    // High-responsiveness sync interval: checks summary every 2.5s to instantly receive remote entries
    const interval = setInterval(async () => {
      try {
        const summary = await api.getSyncSummary().catch(() => null);
        if (summary) {
          const hasChanged =
            (summary.lastUpdated && summary.lastUpdated !== lastUpdatedRef.current) ||
            (summary.pendingAthletesCount !== undefined && summary.pendingAthletesCount !== prevPendingCountRef.current) ||
            (summary.uploadsCount !== undefined && prevUploadsCountRef.current !== -1 && summary.uploadsCount !== prevUploadsCountRef.current) ||
            (summary.candidatesCount !== undefined && prevCandidatesCountRef.current !== -1 && summary.candidatesCount !== prevCandidatesCountRef.current);

          if (hasChanged) {
            loadData(true);
          }
        }
      } catch {
        // Ignore background sync errors gracefully
      }
    }, 2500);

    const handleFocus = () => {
      loadData(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadData]);

  // Real-time Cloud Firestore synchronization across devices & containers
  useEffect(() => {
    // 1. Uploads subscription: Real-time approval requests from any remote device/portal
    const unsubUploads = firestoreSync.subscribeUploads((cloudUploads) => {
      setUploads(cloudUploads);

      const currentPendingCount = cloudUploads
        .filter((u) => u.status === 'pending')
        .reduce((sum, u) => {
          const unmerged = (u.candidates || []).filter((c) => !c.merged && c.status !== 'rejected').length;
          return sum + (unmerged > 0 ? unmerged : 1);
        }, 0);

      if (mode === 'server') {
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
          // Web Audio chime
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
      }
      prevPendingCountRef.current = currentPendingCount;
    });

    // 2. Official Candidates subscription
    const unsubCandidates = firestoreSync.subscribeCandidates((cloudCandidates) => {
      if (mode === 'server') {
        setCandidates(sanitizeUniqueCandidates(cloudCandidates));
      } else {
        // Mode is client: merge any newly allotted official server chest numbers
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
    });

    // 3. Heats, Results, Settings subscriptions
    const unsubHeats = firestoreSync.subscribeHeats((cloudHeats) => {
      if (cloudHeats.length > 0) setHeats(cloudHeats);
    });

    const unsubResults = firestoreSync.subscribeResults((cloudResults) => {
      if (cloudResults.length > 0) setResults(cloudResults);
    });

    const unsubSettings = firestoreSync.subscribeSettings((cloudSettings) => {
      setSettings(cloudSettings);
    });

    const unsubEvents = firestoreSync.subscribeEvents((cloudEvents) => {
      if (cloudEvents.length > 0) setEvents(cloudEvents);
    });

    const unsubClubs = firestoreSync.subscribeClubs((cloudClubs) => {
      if (cloudClubs.length > 0) setClubs(cloudClubs);
    });

    return () => {
      unsubUploads();
      unsubCandidates();
      unsubHeats();
      unsubResults();
      unsubSettings();
      unsubEvents();
      unsubClubs();
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

  // Check URL parameters for explicit mode on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get('mode');
      if (urlMode === 'server') {
        if (sessionStorage.getItem('esports_server_auth') === 'true') {
          setMode('server');
          setActiveTab('uploads');
        } else {
          setShowPinModal(true);
        }
      } else if (urlMode === 'client') {
        setMode('client');
        setActiveTab('enroll');
      }
    }
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
      const savedCandidate = clientStorage.saveCandidate(candidateData);
      const allLocal = clientStorage.getCandidates();
      setCandidates(sanitizeUniqueCandidates(allLocal));
      setCandidateToEdit(null);

      // 2. Auto-submit immediately to Server Pending Queue
      // Ensures client's submitted data is instantly available in server's pending list!
      try {
        const clientClubName = localStorage.getItem('esports_client_club_name') || savedCandidate.club || 'SASTHITALA AGRANI';
        const unsynced = clientStorage.getUnsyncedCandidates();
        const batchToSubmit = unsynced.length > 0 ? unsynced : [savedCandidate];

        // Automatic retry (up to 2 attempts) to ensure transient network blips don't drop request
        let uploadSuccess = false;
        let lastErr: any = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await api.submitUpload({
              club: clientClubName,
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
      const targetCandidate = (candidateData.id ? candidates.find(c => c.id === candidateData.id) : null) || candidateToEdit;
      if (targetCandidate) {
        const restrictionStatus = getCandidateRestrictionStatus(targetCandidate, events, heats, results, 'server');
        if (restrictionStatus.isRestricted) {
          throw new Error(getCandidateEditRestrictedMessage(targetCandidate, restrictionStatus));
        }
      }

      const srvCandidate = {
        ...candidateData,
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

      // Read club name from client local storage
      const clientClubName = localStorage.getItem('esports_client_club_name') || toUpload[0]?.club || 'SASTHITALA AGRANI';

      // Submit upload batch to server staging area
      const res = await api.submitUpload({
        club: clientClubName,
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

      await api.submitUpload({
        club: clientClubName,
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

  const handleRestoreBackup = async (jsonData: any) => {
    await api.restoreDatabaseDump(jsonData);
    await loadData();
  };

  const handleResetAllData = async () => {
    await api.resetToDefaults();
    await loadData();
  };

  // Switch mode handler with PIN Protection for Server Mode
  const handleModeChange = (newMode: 'client' | 'server') => {
    if (newMode === 'server') {
      if (!isServerAuthenticated) {
        setShowPinModal(true);
        return;
      }
      setMode('server');
      setActiveTab('uploads');
    } else {
      setMode('client');
      setActiveTab('enroll');
    }
  };

  // On successful PIN verification
  const handlePinSuccess = async (sessionData?: any) => {
    setIsServerAuthenticated(true);
    setShowPinModal(false);
    setMode('server');
    setActiveTab('uploads');
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
    const sessId = sessionStorage.getItem('esports_server_session_id') || undefined;
    sessionStorage.removeItem('esports_server_auth');
    sessionStorage.removeItem('esports_server_session_id');
    setIsServerAuthenticated(false);
    setMode('client');
    setActiveTab('enroll');
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
        unsyncedCount={unsyncedCount}
        onSyncTrigger={handleSyncToServer}
        isSyncing={isSyncing}
        serverOnline={true}
        isServerAuthenticated={isServerAuthenticated}
        onPromptPin={() => setShowPinModal(true)}
        onOpenResetPin={() => setShowResetPinModal(true)}
        onLockServer={handleLockServer}
        pendingUploadsCount={pendingUploadsCount}
      />

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
          />
        )}

        {/* TAB 8: Admin Panel & Settings */}
        {activeTab === 'admin' && (
          <AdminPanel
            settings={settings}
            clubs={clubs}
            events={events}
            onSaveSettings={handleSaveSettings}
            onSaveClub={handleSaveClub}
            onDeleteClub={handleDeleteClub}
            onSaveEvent={handleSaveEvent}
            onDeleteEvent={handleDeleteEvent}
            onResetEvents={handleResetEvents}
            onDownloadBackup={handleDownloadBackup}
            onRestoreBackup={handleRestoreBackup}
            onResetAllData={handleResetAllData}
            onPurgeExceptEvents={async () => {
              await api.purgeAllExceptEvents();
              await loadData();
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
              await loadData();
            }}
          />
        )}
      </main>

      {/* Footer with Minimal Height, Left-Aligned Club Details & Right-Aligned Direct-Call Mobile */}
      <footer className="bg-white border-t border-slate-200 py-1.5 px-3 sm:px-4 text-xs text-slate-500 print:hidden shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left Aligned: Registered Club Logo, Registered Club Name, and Meet Ordinal */}
          <div className="flex items-center gap-2.5 min-w-0 text-left">
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
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-contain p-0.5 border border-slate-200 shadow-2xs shrink-0 bg-white"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/icon.png';
              }}
            />
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

      {/* PIN Login Modal */}
      <PinLoginModal
        isOpen={showPinModal}
        onSuccess={handlePinSuccess}
        onCancel={() => {
          setShowPinModal(false);
          setMode('client');
          setActiveTab('enroll');
        }}
      />

      {/* Reset PIN Modal */}
      <ResetPinModal
        isOpen={showResetPinModal}
        onClose={() => setShowResetPinModal(false)}
        onSuccessNotice={(msg) => {
          setSyncNotice({ type: 'success', message: msg });
          setTimeout(() => setSyncNotice(null), 5000);
        }}
      />
    </div>
  );
}

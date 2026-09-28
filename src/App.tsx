import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { getCandidateQualifiedEvents } from './utils/qualificationRules';
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

  // Number of pending uploads awaiting server review
  const pendingUploadsCount = useMemo(() => {
    return uploads.filter((u) => u.status === 'pending').length;
  }, [uploads]);

  // Load data based on active mode
  const loadData = useCallback(async () => {
    try {
      // 1. Fetch server events, clubs, settings, heats, results, uploads
      const [srvEvents, srvClubs, srvSettings, srvHeats, srvResults, srvUploads] = await Promise.all([
        api.getEvents().catch(() => INITIAL_EVENTS),
        api.getClubs().catch(() => INITIAL_CLUBS),
        api.getSettings().catch(() => INITIAL_SETTINGS),
        api.getHeats().catch(() => []),
        api.getResults().catch(() => []),
        api.getUploads().catch(() => []),
      ]);

      setEvents(srvEvents);
      setClubs(srvClubs);
      setSettings(srvSettings);
      setHeats(srvHeats);
      setResults(srvResults);
      setUploads(srvUploads);

      // Cache events & clubs to localStorage for offline client capability
      clientStorage.saveEventsCache(srvEvents);
      clientStorage.saveClubsCache(srvClubs);

      // 2. Candidates loading:
      if (mode === 'client') {
        const localCandidates = clientStorage.getCandidates();
        
        // Fetch server candidate registry to reflect merged chest numbers back to client
        const srvCandidates = await api.getCandidates().catch(() => []);
        if (srvCandidates.length > 0) {
          const srvMap = new Map(srvCandidates.map(c => [c.id, c]));
          const srvNameMap = new Map(srvCandidates.map(c => [(c.name || '').trim().toUpperCase(), c]));
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

          // Deduplicate merged list by ID and normalized candidate name
          const seenIds = new Set<string>();
          const seenNames = new Set<string>();
          const uniqueList: Candidate[] = [];
          mergedList.forEach(c => {
            if (!c || !c.id) return;
            const nameKey = (c.name || '').trim().toUpperCase();
            if (seenIds.has(c.id) || (nameKey && seenNames.has(nameKey))) return;
            seenIds.add(c.id);
            if (nameKey) seenNames.add(nameKey);
            uniqueList.push(c);
          });

          if (updated) {
            clientStorage.saveCandidates(uniqueList);
          }
          setCandidates(uniqueList);
        } else {
          // Deduplicate local candidates by ID and candidate name
          const seenIds = new Set<string>();
          const seenNames = new Set<string>();
          const uniqueList: Candidate[] = [];
          localCandidates.forEach(c => {
            if (!c || !c.id) return;
            const nameKey = (c.name || '').trim().toUpperCase();
            if (seenIds.has(c.id) || (nameKey && seenNames.has(nameKey))) return;
            seenIds.add(c.id);
            if (nameKey) seenNames.add(nameKey);
            uniqueList.push(c);
          });
          setCandidates(uniqueList);
        }
      } else {
        const srvCandidates = await api.getCandidates().catch(() => []);
        // Deduplicate srvCandidates by ID and candidate name
        const seenIds = new Set<string>();
        const seenNames = new Set<string>();
        const uniqueList: Candidate[] = [];
        (srvCandidates || []).forEach(c => {
          if (!c || !c.id) return;
          const nameKey = (c.name || '').trim().toUpperCase();
          if (seenIds.has(c.id) || (nameKey && seenNames.has(nameKey))) return;
          seenIds.add(c.id);
          if (nameKey) seenNames.add(nameKey);
          uniqueList.push(c);
        });
        setCandidates(uniqueList);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      if (mode === 'client') {
        const localCands = clientStorage.getCandidates();
        const seenIds = new Set<string>();
        const seenNames = new Set<string>();
        const uniqueList: Candidate[] = [];
        localCands.forEach(c => {
          if (!c || !c.id) return;
          const nameKey = (c.name || '').trim().toUpperCase();
          if (seenIds.has(c.id) || (nameKey && seenNames.has(nameKey))) return;
          seenIds.add(c.id);
          if (nameKey) seenNames.add(nameKey);
          uniqueList.push(c);
        });
        setCandidates(uniqueList);
        setEvents(clientStorage.getEventsCache());
        setClubs(clientStorage.getClubsCache());
      }
    }
  }, [mode]);

  useEffect(() => {
    loadData();
    // Poll server periodically (every 4 seconds) to auto-detect and display mobile client uploads and changes on desktop
    const interval = setInterval(() => {
      loadData();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadData]);

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
    if (candidates.length === 0) return 101;
    const maxChest = Math.max(...candidates.map((c) => Number(c.chestNo) || 0));
    return maxChest >= 101 ? maxChest + 1 : 101;
  }, [candidates, mode]);

  // Save Candidate Handler (Used by both Client and Server modes)
  const handleSaveCandidate = async (candidateData: any) => {
    const candidateName = (candidateData.name || '').trim().toUpperCase();

    // Prevent duplicate candidate name (case-insensitive) across the candidates list
    const existingDuplicate = candidates.find(c => {
      if (candidateData.id && c.id === candidateData.id) return false;
      return (c.name || '').trim().toUpperCase() === candidateName;
    });

    if (existingDuplicate) {
      throw new Error(`Candidate "${candidateName}" is already registered (Chest #${existingDuplicate.chestNo || existingDuplicate.localRecordNo || 'Assigned'}, ${existingDuplicate.club || 'Independent'})! Duplicate candidate names are not allowed.`);
    }

    if (mode === 'client') {
      // 1. Save locally to clientStorage (localStorage)
      const savedCandidate = clientStorage.saveCandidate(candidateData);
      const allLocal = clientStorage.getCandidates();
      setCandidates(allLocal);
      setCandidateToEdit(null);

      // 2. Auto-submit immediately to Server Pending Queue
      // Ensures client's submitted data is instantly available in server's pending list!
      try {
        const clientClubName = localStorage.getItem('esports_client_club_name') || savedCandidate.club || 'SASTHITALA AGRANI';
        const unsynced = clientStorage.getUnsyncedCandidates();
        const batchToSubmit = unsynced.length > 0 ? unsynced : [savedCandidate];

        await api.submitUpload({
          club: clientClubName,
          clientName: 'Client Portal',
          candidates: batchToSubmit,
          totalFees: batchToSubmit.reduce((sum, c) => sum + (c.totalFees || 0), 0),
          notes: `Submitted from Client Entry Page`,
        });

        clientStorage.markSynced(batchToSubmit.map(c => c.id), new Date().toISOString());
        setCandidates(clientStorage.getCandidates());

        const updatedUploads = await api.getUploads().catch(() => []);
        setUploads(updatedUploads);
      } catch (uploadErr) {
        console.warn('Auto-submit to server pending list deferred/offline:', uploadErr);
      }
    } else {
      // Server direct entry: persist immediately to server DB
      if (candidateToEdit) {
        const qualifiedEvts = getCandidateQualifiedEvents(candidateToEdit, heats, results);
        if (qualifiedEvts.length > 0) {
          alert(
            `Editing Restricted!\n\nCandidate "${candidateToEdit.name}" (Chest #${candidateToEdit.chestNo}) has already qualified from hit to final in Event #${qualifiedEvts.join(', #')}.\n\nEditing candidate details is restricted once an athlete qualifies for finals in any event, even if other events are not completed yet.`
          );
          return;
        }
      }

      const srvCandidate = {
        ...candidateData,
        synced: true,
        isDirty: false,
        updatedAt: new Date().toISOString(),
      };
      await api.saveCandidate(srvCandidate);
      const updatedList = await api.getCandidates();
      setCandidates(updatedList);
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
      setCandidates(clientStorage.getCandidates());
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
        setCandidates(updatedList);
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
      setCandidates(clientStorage.getCandidates());

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
      setCandidates(clientStorage.getCandidates());

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
    const updated = await api.getHeats();
    setHeats(updated);
  };

  const handleDeleteHeat = async (heatId: string) => {
    await api.deleteHeat(heatId);
    const updated = await api.getHeats();
    setHeats(updated);
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
    const updatedResults = await api.getResults();
    setResults(updatedResults);
    // Stay on Hit List so user can immediately view/print the Final List
    // or navigate if desired
  };

  // Results & Finals Handlers
  const handleSaveResult = async (result: Partial<EventResult>) => {
    await api.saveResult(result);
    const updated = await api.getResults();
    setResults(updated);
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
  const handlePinSuccess = () => {
    setIsServerAuthenticated(true);
    setShowPinModal(false);
    setMode('server');
    setActiveTab('uploads');
    setSyncNotice({
      type: 'success',
      message: 'Server Control Unlocked. You now have full administrative access.',
    });
    setTimeout(() => setSyncNotice(null), 4000);
  };

  // Lock server handler
  const handleLockServer = () => {
    sessionStorage.removeItem('esports_server_auth');
    setIsServerAuthenticated(false);
    setMode('client');
    setActiveTab('enroll');
    setSyncNotice({
      type: 'success',
      message: 'Server control locked. Switched to Client Portal.',
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
            onRefresh={loadData}
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

        {/* TAB 7: Reports (Printable Chest-wise and Club-wise grouped) */}
        {activeTab === 'reports' && (
          <Reports
            candidates={candidates}
            events={events}
            clubs={clubs}
            settings={settings}
          />
        )}

        {/* TAB 8: Admin Panel & Settings */}
        {activeTab === 'admin' && (
          <AdminPanel
            settings={settings}
            clubs={clubs}
            onSaveSettings={handleSaveSettings}
            onSaveClub={handleSaveClub}
            onDeleteClub={handleDeleteClub}
            onDownloadBackup={handleDownloadBackup}
            onRestoreBackup={handleRestoreBackup}
            onResetAllData={handleResetAllData}
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
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-5 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            <strong>eSports</strong> • Sports Management System • {settings.ordinalTitle}
          </p>
          <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400">
            <span>Client/Server Staging &amp; Review Architecture</span>
            <span>•</span>
            <span>Multi-Device Accumulator</span>
            <span>•</span>
            <span>PIN Protected Server</span>
          </div>
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

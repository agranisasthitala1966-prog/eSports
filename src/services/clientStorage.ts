import { Candidate, SportEvent, Club, SportsMeetSettings } from '../types';
import { INITIAL_EVENTS, INITIAL_CLUBS, INITIAL_SETTINGS } from '../constants/initialData';

const CANDIDATES_KEY = 'esports_client_candidates';
const CACHED_EVENTS_KEY = 'esports_cached_events';
const CACHED_CLUBS_KEY = 'esports_cached_clubs';
const CACHED_SETTINGS_KEY = 'esports_cached_settings';

export const clientStorage = {
  // Candidate storage
  getCandidates(): Candidate[] {
    try {
      const data = localStorage.getItem(CANDIDATES_KEY);
      if (!data) return [];
      const parsed: Candidate[] = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      
      // Deduplicate by ID and normalized candidate name
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const unique: Candidate[] = [];

      parsed.forEach((c) => {
        if (!c || !c.id) return;
        const nameKey = (c.name || '').trim().toUpperCase();
        if (seenIds.has(c.id)) return;
        if (nameKey && seenNames.has(nameKey)) return;

        seenIds.add(c.id);
        if (nameKey) seenNames.add(nameKey);
        unique.push(c);
      });

      // Ensure that in client storage, chest numbers and record numbers are strictly unique and never duplicate
      const usedRecordNos = new Set<number>();
      const usedServerChests = new Set<number>();
      let needsResave = false;
      const deduplicated: Candidate[] = [];

      unique.forEach((c) => {
        const sChest = Number(c.chestNo);
        if (sChest >= 101 && usedServerChests.has(sChest)) {
          needsResave = true;
          return;
        }
        if (sChest >= 101) {
          usedServerChests.add(sChest);
        }
        deduplicated.push(c);
      });

      const sanitized = deduplicated.map((c, idx) => {
        // If official server chest number is assigned (>= 101), keep it
        const isServerChest = Number(c.chestNo) >= 101;
        let recNo = Number(c.localRecordNo);
        if (!recNo || recNo <= 0) {
          recNo = !isServerChest && Number(c.chestNo) > 0 && Number(c.chestNo) < 100 ? Number(c.chestNo) : idx + 1;
        }

        // If duplicate record number detected, reassign to next unused integer
        if (usedRecordNos.has(recNo)) {
          let nextUnused = 1;
          while (usedRecordNos.has(nextUnused)) {
            nextUnused++;
          }
          recNo = nextUnused;
          needsResave = true;
        }
        usedRecordNos.add(recNo);

        let finalChest = c.chestNo;
        if (!isServerChest) {
          finalChest = recNo;
          if (c.chestNo !== finalChest) needsResave = true;
        }
        if (c.localRecordNo !== recNo) needsResave = true;

        return {
          ...c,
          localRecordNo: recNo,
          chestNo: finalChest,
        };
      });

      if (needsResave) {
        localStorage.setItem(CANDIDATES_KEY, JSON.stringify(sanitized));
      }

      return sanitized;
    } catch (e) {
      console.error('Failed to read candidates from localStorage', e);
      return [];
    }
  },

  saveCandidates(candidates: Candidate[]): void {
    try {
      // Deduplicate by ID and normalized candidate name before saving
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const unique: Candidate[] = [];

      candidates.forEach((c) => {
        if (!c || !c.id) return;
        const nameKey = (c.name || '').trim().toUpperCase();
        if (seenIds.has(c.id)) return;
        if (nameKey && seenNames.has(nameKey)) return;

        seenIds.add(c.id);
        if (nameKey) seenNames.add(nameKey);
        unique.push(c);
      });

      localStorage.setItem(CANDIDATES_KEY, JSON.stringify(unique));
    } catch (e) {
      console.error('Failed to save candidates to localStorage', e);
    }
  },

  addCandidate(candidateData: Omit<Candidate, 'id' | 'createdAt' | 'updatedAt' | 'synced' | 'isDirty'> & { id?: string }): Candidate {
    const list = this.getCandidates();
    const candidateName = (candidateData.name || '').trim().toUpperCase();

    // Prevent duplicate candidate name
    const existing = list.find(c => (c.name || '').trim().toUpperCase() === candidateName);
    if (existing) {
      throw new Error(`Candidate "${candidateName}" is already registered! Duplicate candidate names are not allowed.`);
    }

    const now = new Date().toISOString();
    const id = candidateData.id || `cand_loc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    // In client side: provisional chest number is strictly allotted as the candidate's unique record number
    const usedRecordNos = new Set<number>();
    list.forEach(c => {
      const rec = Number(c.localRecordNo);
      if (rec && rec > 0) usedRecordNos.add(rec);
      const ch = Number(c.chestNo);
      if (ch && ch > 0 && ch < 100) usedRecordNos.add(ch);
    });

    let assignedRecordNo = Number(candidateData.localRecordNo) || Number(candidateData.chestNo);
    if (!assignedRecordNo || assignedRecordNo <= 0 || usedRecordNos.has(assignedRecordNo)) {
      let nextUnused = 1;
      while (usedRecordNos.has(nextUnused)) {
        nextUnused++;
      }
      assignedRecordNo = nextUnused;
    }

    const newCandidate: Candidate = {
      ...candidateData,
      id,
      localRecordNo: assignedRecordNo,
      chestNo: assignedRecordNo,
      createdAt: now,
      updatedAt: now,
      synced: false,
      isDirty: true,
      syncedAt: null,
    };

    list.push(newCandidate);
    this.saveCandidates(list);
    return newCandidate;
  },

  updateCandidate(id: string, updates: Partial<Candidate>): Candidate {
    const list = this.getCandidates();
    let index = list.findIndex(c => c.id === id);
    if (index === -1) {
      index = list.findIndex(c =>
        (updates.chestNo && Number(c.chestNo) === Number(updates.chestNo)) ||
        (updates.localRecordNo && Number(c.localRecordNo) === Number(updates.localRecordNo)) ||
        (c.name && updates.name && c.name.trim().toUpperCase() === updates.name.trim().toUpperCase())
      );
    }
    if (index === -1) {
      const now = new Date().toISOString();
      const rec = Number(updates.localRecordNo) || Number(updates.chestNo) || (list.length + 1);
      const newCand: Candidate = {
        name: updates.name || '',
        club: updates.club || '',
        gender: updates.gender || 'ALL',
        height: updates.height || 'ALL',
        feeStatus: updates.feeStatus || 'Due',
        selectedEvents: updates.selectedEvents || [],
        totalFees: updates.totalFees || 0,
        ...updates,
        id,
        localRecordNo: rec,
        chestNo: Number(updates.chestNo) || rec,
        createdAt: updates.createdAt || now,
        updatedAt: now,
        synced: false,
        isDirty: true,
      };
      list.push(newCand);
      this.saveCandidates(list);
      return newCand;
    }

    if (updates.name) {
      const updatedName = updates.name.trim().toUpperCase();
      const duplicate = list.find(c => c.id !== id && (!updates.chestNo || Number(c.chestNo) !== Number(updates.chestNo)) && (c.name || '').trim().toUpperCase() === updatedName);
      if (duplicate) {
        throw new Error(`Candidate "${updatedName}" is already registered! Duplicate candidate names are not allowed.`);
      }
    }

    const now = new Date().toISOString();
    const existing = list[index];
    const isServerChest = (Number(existing.chestNo) >= 101) || (Number(updates.chestNo) >= 101);
    const recNo = existing.localRecordNo || Number(updates.localRecordNo) || (index + 1);
    const chestNo = Number(updates.chestNo) >= 101 ? Number(updates.chestNo) : (isServerChest ? existing.chestNo : recNo);

    const updated: Candidate = {
      ...existing,
      ...updates,
      id,
      localRecordNo: recNo,
      chestNo,
      updatedAt: now,
      synced: false, // Mark un-synced so it gets pushed to server on next sync
      isDirty: true,
    };

    list[index] = updated;
    this.saveCandidates(list);
    return updated;
  },

  deleteCandidate(id: string): void {
    const list = this.getCandidates();
    const filtered = list.filter(c => c.id !== id);
    this.saveCandidates(filtered);
  },

  // Returns only candidates that have never been synced OR were modified since last sync
  // Fulfills: "must sure that only that new data should save to the server"
  getUnsyncedCandidates(): Candidate[] {
    const list = this.getCandidates();
    return list.filter(c => !c.synced || c.isDirty);
  },

  // Marks specific candidates as successfully synced with the server
  markSynced(syncedIds: string[], serverTimestamp: string): void {
    const list = this.getCandidates();
    const idSet = new Set(syncedIds);
    const updatedList = list.map(c => {
      if (idSet.has(c.id)) {
        return {
          ...c,
          synced: true,
          isDirty: false,
          syncedAt: serverTimestamp,
        };
      }
      return c;
    });
    this.saveCandidates(updatedList);
  },

  // Replace all with server data (e.g. after pulling or seeding)
  replaceFromRemote(remoteCandidates: Candidate[]): void {
    const localCandidates = this.getCandidates();
    const remoteIdMap = new Map(remoteCandidates.map(c => [c.id, c]));

    // Keep any local unsynced records that aren't on server yet
    const localUnsynced = localCandidates.filter(c => (!c.synced || c.isDirty) && !remoteIdMap.has(c.id));

    const merged = [
      ...remoteCandidates.map(c => ({ ...c, synced: true, isDirty: false })),
      ...localUnsynced,
    ];

    // Sort by chest number
    merged.sort((a, b) => (a.chestNo || 0) - (b.chestNo || 0));
    this.saveCandidates(merged);
  },

  saveCandidate(candidateData: any): Candidate {
    if (candidateData.id) {
      return this.updateCandidate(candidateData.id, candidateData);
    }
    return this.addCandidate(candidateData);
  },

  async syncWithServer(
    syncApiFn: (candidates: Candidate[]) => Promise<{ syncedCount: number; savedIds: string[]; updatedCandidates?: Candidate[]; serverTimestamp: string }>
  ): Promise<{ syncedCount: number; savedIds: string[]; updatedCandidates?: Candidate[] }> {
    const unsynced = this.getUnsyncedCandidates();
    if (unsynced.length === 0) {
      return { syncedCount: 0, savedIds: [] };
    }
    const res = await syncApiFn(unsynced);
    if (res.updatedCandidates && res.updatedCandidates.length > 0) {
      const currentList = this.getCandidates();
      const updatedMap = new Map(res.updatedCandidates.map(c => [c.id, c]));
      const nextList = currentList.map(item => {
        const fromServer = updatedMap.get(item.id);
        if (fromServer) {
          return {
            ...item,
            chestNo: fromServer.chestNo,
            synced: true,
            isDirty: false,
            syncedAt: res.serverTimestamp || new Date().toISOString(),
          };
        }
        return item;
      });
      this.saveCandidates(nextList);
    } else {
      this.markSynced(res.savedIds, res.serverTimestamp || new Date().toISOString());
    }
    return { syncedCount: res.syncedCount, savedIds: res.savedIds, updatedCandidates: res.updatedCandidates };
  },

  markAllAsSynced(): void {
    const list = this.getCandidates();
    const updated = list.map(c => ({
      ...c,
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    }));
    this.saveCandidates(updated);
  },

  // Offline caching for events, clubs, settings
  getCachedEvents(): SportEvent[] {
    try {
      const data = localStorage.getItem(CACHED_EVENTS_KEY);
      return data ? JSON.parse(data) : INITIAL_EVENTS;
    } catch {
      return INITIAL_EVENTS;
    }
  },

  setCachedEvents(events: SportEvent[]): void {
    try {
      localStorage.setItem(CACHED_EVENTS_KEY, JSON.stringify(events));
    } catch {}
  },

  saveEventsCache(events: SportEvent[]): void {
    this.setCachedEvents(events);
  },

  getEventsCache(): SportEvent[] {
    return this.getCachedEvents();
  },

  getCachedClubs(): Club[] {
    try {
      const data = localStorage.getItem(CACHED_CLUBS_KEY);
      return data ? JSON.parse(data) : INITIAL_CLUBS;
    } catch {
      return INITIAL_CLUBS;
    }
  },

  setCachedClubs(clubs: Club[]): void {
    try {
      localStorage.setItem(CACHED_CLUBS_KEY, JSON.stringify(clubs));
    } catch {}
  },

  saveClubsCache(clubs: Club[]): void {
    this.setCachedClubs(clubs);
  },

  getClubsCache(): Club[] {
    return this.getCachedClubs();
  },

  getCachedSettings(): SportsMeetSettings {
    try {
      const data = localStorage.getItem(CACHED_SETTINGS_KEY);
      return data ? JSON.parse(data) : INITIAL_SETTINGS;
    } catch {
      return INITIAL_SETTINGS;
    }
  },

  setCachedSettings(settings: SportsMeetSettings): void {
    try {
      localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  },

  clearCandidates(): void {
    try {
      localStorage.removeItem(CANDIDATES_KEY);
    } catch {}
  },
};

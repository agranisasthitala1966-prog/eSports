import { SportEvent, Candidate, Club, SportsMeetSettings, EventHeat, EventResult, DatabaseDump, ClientUpload } from '../types';
import { firestoreSync, sanitizeForFirestore, isFirestoreQuotaExhausted } from './firestoreSync';
import { clientStorage } from './clientStorage';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

// Dynamic API Base calculation: Always use same-origin '/api' (or origin + '/api').
// NEVER rewrite ais-pre to ais-dev; doing so causes cross-origin fetch failures and Google Auth redirects.
const getApiBase = (): string => {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/api`;
  }
  return '/api';
};

const API_BASE = getApiBase();

export const getDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server_node';
  let id = localStorage.getItem('esports_device_id');
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('esports_device_id', id);
  }
  return id;
};

export const getDeviceLabel = (): string => {
  if (typeof window === 'undefined') return 'Server System';
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const browser = /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : /Firefox/i.test(ua) ? 'Firefox' : 'Browser';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : 'Device';
  return `${isMobile ? 'Mobile' : 'Desktop'} (${os} ${browser})`;
};

export const api = {
  // Auth & PIN with Single Device Session Restriction (Stored in Cloud Firestore)
  async verifyPin(pin: string, forceTakeover = false): Promise<{
    success: boolean;
    sessionId?: string;
    deviceId?: string;
    deviceLabel?: string;
    message?: string;
    isAlreadyLoggedIn?: boolean;
    activeDevice?: { label: string; loggedInAt: string; lastActiveAt: string };
  }> {
    try {
      const res = await firestoreSync.verifyPin(pin, forceTakeover);
      fetch(`${API_BASE}/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, deviceId: getDeviceId(), deviceLabel: getDeviceLabel(), forceTakeover }),
      }).catch(() => {});
      return res;
    } catch (err: any) {
      if (err.isAlreadyLoggedIn) throw err;
      const res = await fetch(`${API_BASE}/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ pin, deviceId: getDeviceId(), deviceLabel: getDeviceLabel(), forceTakeover }),
      });
      const data = await res.json().catch(() => ({ error: err.message || 'Incorrect PIN' }));
      if (!res.ok) {
        const error: any = new Error(data.error || 'Incorrect PIN');
        error.isAlreadyLoggedIn = data.isAlreadyLoggedIn;
        error.activeDevice = data.activeDevice;
        throw error;
      }
      return data;
    }
  },

  async getSessionStatus(): Promise<{
    isServerLoggedIn: boolean;
    isCurrentDevice?: boolean;
    activeDevice?: { label: string; loggedInAt: string; lastActiveAt: string };
  }> {
    try {
      return await firestoreSync.getSessionStatus();
    } catch {
      const deviceId = getDeviceId();
      const res = await fetch(`${API_BASE}/auth/session-status?deviceId=${encodeURIComponent(deviceId)}&t=${Date.now()}`, {
        cache: 'no-store',
      }).catch(() => null);
      if (!res || !res.ok) return { isServerLoggedIn: false };
      return res.json();
    }
  },

  async sendHeartbeat(sessionId: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, deviceId: getDeviceId() }),
      }).then(r => r.json()).catch(() => null);
      if (res && res.valid !== undefined) {
        return res;
      }
      return await firestoreSync.sendHeartbeat(sessionId);
    } catch {
      return { valid: true };
    }
  },

  async logoutServer(sessionId?: string): Promise<{ success: boolean }> {
    try {
      await firestoreSync.logoutServer(sessionId);
    } catch {}
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, deviceId: getDeviceId() }),
    }).catch(() => {});
    return { success: true };
  },

  async resetPin(currentPin: string, newPin: string): Promise<{ success: boolean; message: string }> {
    try {
      await firestoreSync.saveSettings({ serverPin: newPin });
    } catch {}
    const res = await fetch(`${API_BASE}/auth/reset-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ currentPin, newPin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to reset PIN' }));
      throw new Error(err.error || 'Failed to reset PIN');
    }
    return res.json();
  },

  // Client Uploads & Staging (Direct Cloud Firestore sync ensures ais-pre and ais-dev share same queue)
  async getUploads(): Promise<ClientUpload[]> {
    try {
      const snap = await getDocs(collection(db, 'uploads'));
      const items: ClientUpload[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      items.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
      return items;
    } catch {
      const res = await fetch(`${API_BASE}/uploads?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch client uploads');
      return res.json();
    }
  },

  async submitUpload(data: {
    club: string;
    clientName?: string;
    candidates: Candidate[];
    totalFees?: number;
    notes?: string;
    clubMobile?: string;
  }): Promise<{ success: boolean; message: string; upload: ClientUpload }> {
    const cachedSettings = clientStorage.getCachedSettings();
    if (cachedSettings && cachedSettings.clientResponseEnabled === false) {
      throw new Error('Client response submission is paused by the server administrator.');
    }

    try {
      // 1. Write to Cloud Firestore so any device/container in the world sees it instantly
      const cloudRes = await firestoreSync.submitUpload(data);
      // 2. Also forward to local backend as background replicate
      fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(() => {});
      return cloudRes;
    } catch (firestoreErr) {
      console.warn('[Firestore] Falling back to REST API for upload:', firestoreErr);
      const res = await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload submission failed' }));
        throw new Error(err.error || 'Upload submission failed');
      }
      return res.json();
    }
  },

  async mergeUpload(id: string): Promise<{ success: boolean; message: string; mergedCandidates: Candidate[]; totalServerCandidates: number; upload: ClientUpload }> {
    try {
      const cloudRes = await firestoreSync.mergeUpload(id);
      fetch(`${API_BASE}/uploads/${id}/merge`, { method: 'POST' }).catch(() => {});
      return {
        ...cloudRes,
        mergedCandidates: cloudRes.upload.candidates,
        totalServerCandidates: cloudRes.upload.candidates.length,
      };
    } catch {
      const res = await fetch(`${API_BASE}/uploads/${id}/merge`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to merge upload' }));
        throw new Error(err.error || 'Failed to merge upload');
      }
      return res.json();
    }
  },

  async rejectUpload(id: string, reason?: string): Promise<{ success: boolean; message: string; upload: ClientUpload }> {
    try {
      const cloudRes = await firestoreSync.rejectUpload(id, reason);
      fetch(`${API_BASE}/uploads/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }).catch(() => {});
      return cloudRes;
    } catch {
      const res = await fetch(`${API_BASE}/uploads/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('Failed to reject upload');
      return res.json();
    }
  },

  async deleteUpload(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await firestoreSync.deleteUpload(id);
      fetch(`${API_BASE}/uploads/${id}`, { method: 'DELETE' }).catch(() => {});
      return { success: true, message: 'Upload batch removed' };
    } catch {
      const res = await fetch(`${API_BASE}/uploads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete upload');
      return res.json();
    }
  },

  async editUploadCandidate(id: string, candId: string, updates: Partial<Candidate>): Promise<{ success: boolean; candidate: Candidate }> {
    try {
      const cloudRes = await firestoreSync.editUploadCandidate(id, candId, updates);
      fetch(`${API_BASE}/uploads/${id}/candidate/${candId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(() => {});
      return cloudRes;
    } catch {
      const res = await fetch(`${API_BASE}/uploads/${id}/candidate/${candId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update candidate in upload');
      return res.json();
    }
  },

  async mergeSingleUploadCandidate(id: string, candId: string): Promise<{ success: boolean; message: string; candidate: Candidate }> {
    try {
      const cloudRes = await firestoreSync.mergeSingleUploadCandidate(id, candId);
      fetch(`${API_BASE}/uploads/${id}/merge-single/${candId}`, { method: 'POST' }).catch(() => {});
      return cloudRes;
    } catch {
      const res = await fetch(`${API_BASE}/uploads/${id}/merge-single/${candId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to merge candidate');
      return res.json();
    }
  },

  async rejectSingleUploadCandidate(id: string, candId: string, reason?: string): Promise<{ success: boolean; message: string; candidate: Candidate }> {
    try {
      const cloudRes = await firestoreSync.rejectSingleUploadCandidate(id, candId, reason);
      fetch(`${API_BASE}/uploads/${id}/reject-single/${candId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }).catch(() => {});
      return { ...cloudRes, message: 'Candidate rejected' };
    } catch {
      const res = await fetch(`${API_BASE}/uploads/${id}/reject-single/${candId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('Failed to reject candidate');
      return res.json();
    }
  },

  async deleteUploadCandidateGlobally(candId: string): Promise<{ success: boolean }> {
    try {
      fetch(`${API_BASE}/uploads/candidate/${candId}`, { method: 'DELETE' }).catch(() => {});
      return { success: true };
    } catch {
      return { success: false };
    }
  },
  // Health
  async getHealth() {
    const res = await fetch(`${API_BASE}/health?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to connect to server');
    return res.json();
  },

  // Single Consolidated Bootstrap
  async getBootstrap() {
    const res = await fetch(`${API_BASE}/bootstrap?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch app bootstrap state');
    return res.json();
  },

  // Lightweight Sync Summary
  async getSyncSummary() {
    const res = await fetch(`${API_BASE}/sync-summary?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch sync summary');
    return res.json();
  },

  // Events
  async getEvents(): Promise<SportEvent[]> {
    try {
      const snap = await getDocs(collection(db, 'events'));
      if (!snap.empty) {
        const items: SportEvent[] = [];
        snap.forEach((d) => items.push(d.data() as SportEvent));
        items.sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));
        return items;
      }
    } catch {}
    const res = await fetch(`${API_BASE}/events?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch events');
    return res.json();
  },

  async saveEvent(event: SportEvent): Promise<SportEvent> {
    try {
      await firestoreSync.saveEvent(event);
    } catch {}
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error('Failed to save event');
    const data = await res.json();
    return data.event;
  },

  async updateEvent(evtNo: number, event: Partial<SportEvent>): Promise<SportEvent> {
    try {
      await firestoreSync.saveEvent({ ...event, Evt_No: evtNo } as SportEvent);
    } catch {}
    const res = await fetch(`${API_BASE}/events/${evtNo}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error('Failed to update event');
    const data = await res.json();
    return data.event;
  },

  async deleteEvent(evtNo: number): Promise<void> {
    try {
      await firestoreSync.deleteEvent(evtNo);
    } catch {}
    const res = await fetch(`${API_BASE}/events/${evtNo}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete event');
  },

  async resetEvents(): Promise<SportEvent[]> {
    const res = await fetch(`${API_BASE}/events/reset`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset events');
    const data = await res.json();
    return data.events;
  },

  // Candidates
  async getCandidates(): Promise<Candidate[]> {
    try {
      const snap = await getDocs(collection(db, 'candidates'));
      if (!snap.empty) {
        const items: Candidate[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
        items.sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
        return items;
      }
    } catch {}
    const res = await fetch(`${API_BASE}/candidates?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch candidates from server');
    return res.json();
  },

  async saveCandidate(candidate: Partial<Candidate>): Promise<Candidate> {
    try {
      const saved = await firestoreSync.saveCandidate(candidate);
      fetch(`${API_BASE}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saved),
      }).catch(() => {});
      return saved;
    } catch {
      const res = await fetch(`${API_BASE}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save candidate to server');
      }
      const data = await res.json();
      return data.candidate;
    }
  },

  async updateCandidate(id: string, candidate: Partial<Candidate>): Promise<Candidate> {
    try {
      const saved = await firestoreSync.saveCandidate({ ...candidate, id });
      fetch(`${API_BASE}/candidates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      }).catch(() => {});
      return saved;
    } catch {
      const res = await fetch(`${API_BASE}/candidates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update candidate on server');
      }
      const data = await res.json();
      return data.candidate;
    }
  },

  async deleteCandidate(id: string): Promise<void> {
    try {
      await firestoreSync.deleteCandidate(id);
    } catch {}
    fetch(`${API_BASE}/candidates/${id}`, { method: 'DELETE' }).catch(() => {});
  },

  async cancelCandidateChest(id: string): Promise<{ success: boolean; message: string; candidate: Candidate }> {
    try {
      const cand = await firestoreSync.saveCandidate({ id, status: 'cancelled' as any, isCancelled: true });
      fetch(`${API_BASE}/candidates/${id}/cancel-chest`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
      return { success: true, message: 'Chest cancelled', candidate: cand };
    } catch {
      const res = await fetch(`${API_BASE}/candidates/${id}/cancel-chest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to cancel candidate chest number');
      return res.json();
    }
  },

  // Incremental Sync
  async syncCandidates(candidates: Candidate[]): Promise<{
    success: boolean;
    syncedCount: number;
    savedIds: string[];
    updatedCandidates?: Candidate[];
    serverTimestamp: string;
    totalServerCandidates: number;
  }> {
    for (const c of candidates) {
      await firestoreSync.saveCandidate(c).catch(() => {});
    }
    const res = await fetch(`${API_BASE}/candidates/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates }),
    });
    if (!res.ok) throw new Error('Failed to synchronize candidates');
    return res.json();
  },

  // Clubs
  async getClubs(): Promise<Club[]> {
    try {
      const snap = await getDocs(collection(db, 'clubs'));
      if (!snap.empty) {
        const items: Club[] = [];
        snap.forEach((d) => items.push(d.data() as Club));
        return items;
      }
    } catch {}
    const res = await fetch(`${API_BASE}/clubs`);
    if (!res.ok) throw new Error('Failed to fetch clubs');
    return res.json();
  },

  async saveClub(club: Partial<Club>): Promise<Club> {
    const clubId = club.id || `club_${Date.now()}`;
    const cleanClub = { ...club, id: clubId } as Club;
    try {
      await firestoreSync.saveClub(cleanClub);
    } catch {}
    const res = await fetch(`${API_BASE}/clubs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanClub),
    });
    if (!res.ok) throw new Error('Failed to save club');
    const data = await res.json();
    return data.club;
  },

  async updateClub(id: string, club: Partial<Club>): Promise<Club> {
    const cleanClub = { ...club, id } as Club;
    try {
      await firestoreSync.saveClub(cleanClub);
    } catch {}
    const res = await fetch(`${API_BASE}/clubs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(club),
    });
    if (!res.ok) throw new Error('Failed to update club');
    const data = await res.json();
    return data.club;
  },

  async deleteClub(id: string): Promise<void> {
    try {
      await firestoreSync.deleteClub(id);
    } catch {}
    const res = await fetch(`${API_BASE}/clubs/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete club');
  },

  // Settings
  async getSettings(): Promise<SportsMeetSettings> {
    try {
      return await firestoreSync.getSettings();
    } catch {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    }
  },

  async updateSettings(settings: Partial<SportsMeetSettings>): Promise<SportsMeetSettings> {
    try {
      const saved = await firestoreSync.saveSettings(settings);
      fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }).catch(() => {});
      return saved;
    } catch {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to update settings');
      const data = await res.json();
      return data.settings;
    }
  },

  // Heats
  async getHeats(): Promise<EventHeat[]> {
    try {
      const snap = await getDocs(collection(db, 'heats'));
      if (!snap.empty) {
        const items: EventHeat[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
        return items;
      }
    } catch {}
    const res = await fetch(`${API_BASE}/heats`);
    if (!res.ok) throw new Error('Failed to fetch heats');
    return res.json();
  },

  async saveHeat(heat: Partial<EventHeat>): Promise<EventHeat> {
    try {
      const saved = await firestoreSync.saveHeat(heat as EventHeat);
      fetch(`${API_BASE}/heats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(heat),
      }).catch(() => {});
      return saved;
    } catch {
      const res = await fetch(`${API_BASE}/heats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(heat),
      });
      if (!res.ok) throw new Error('Failed to save heat');
      const data = await res.json();
      return data.heat;
    }
  },

  async deleteHeat(id: string): Promise<void> {
    try {
      await firestoreSync.deleteHeat(id);
    } catch {}
    fetch(`${API_BASE}/heats/${id}`, { method: 'DELETE' }).catch(() => {});
  },

  // Results
  async getResults(): Promise<EventResult[]> {
    try {
      const snap = await getDocs(collection(db, 'results'));
      if (!snap.empty) {
        const items: EventResult[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
        return items;
      }
    } catch {}
    const res = await fetch(`${API_BASE}/results`);
    if (!res.ok) throw new Error('Failed to fetch results');
    return res.json();
  },

  async saveResult(result: Partial<EventResult>): Promise<EventResult> {
    try {
      const saved = await firestoreSync.saveResult(result as EventResult);
      fetch(`${API_BASE}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      }).catch(() => {});
      return saved;
    } catch {
      const res = await fetch(`${API_BASE}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error('Failed to save result');
      const data = await res.json();
      return data.result;
    }
  },

  // Database Ops
  async exportDatabase(): Promise<DatabaseDump> {
    const res = await fetch(`${API_BASE}/db/export`);
    if (!res.ok) throw new Error('Failed to export database');
    return res.json();
  },

  async exportExcel(): Promise<Blob> {
    const res = await fetch(`${API_BASE}/db/export-excel`);
    if (!res.ok) throw new Error('Failed to export Excel workbook');
    return res.blob();
  },

  async restoreDatabase(dump: any): Promise<{ success: boolean; message: string; stats: any }> {
    const res = await fetch(`${API_BASE}/db/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dump),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to restore database');
    }
    return res.json();
  },

  async seedSampleData(): Promise<{ success: boolean; message: string; count: number; candidates: Candidate[] }> {
    const res = await fetch(`${API_BASE}/db/sample-data`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to seed sample data');
    return res.json();
  },

  async clearDatabase(): Promise<void> {
    const res = await fetch(`${API_BASE}/db/clear`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to clear database');
  },

  async purgeAllExceptEvents(): Promise<{ success: boolean; message: string; deletedCounts?: any }> {
    // 1. Purge all records (candidates, uploads, heats, results) from Cloud Firestore
    let firestoreResult: any = null;
    try {
      firestoreResult = await firestoreSync.purgeAllExceptEvents();
    } catch (e) {
      console.warn('[Firestore] Purge error:', e);
    }

    // 2. Clear local browser client storage candidates
    clientStorage.clearCandidates();

    // 3. Purge from server backend (Memory + db.json)
    try {
      const res = await fetch(`${API_BASE}/db/purge-except-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        await fetch(`${API_BASE}/db/clear`, { method: 'POST' }).catch(() => {});
      }
    } catch (e) {
      console.warn('[Server] Purge endpoint fallback notice:', e);
    }

    return {
      success: true,
      message: 'All candidates, uploads, heats, and results deleted from database. Event list master data preserved.',
      deletedCounts: firestoreResult?.deletedCounts,
    };
  },

  // Direct Table Ops for DB Explorer
  async getRawTable(table: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/db/raw/${table}`);
    if (!res.ok) throw new Error(`Failed to load table ${table}`);
    return res.json();
  },

  async createRawRow(table: string, data: any): Promise<any> {
    try {
      if (table === 'candidates') {
        await firestoreSync.saveCandidate(data);
      } else if (table === 'heats') {
        await firestoreSync.saveHeat(data);
      } else if (table === 'results') {
        await firestoreSync.saveResult(data);
      } else if (table === 'settings') {
        await firestoreSync.saveSettings(data);
      } else if (table === 'events') {
        await firestoreSync.saveEvent(data);
      } else if (table === 'clubs') {
        await firestoreSync.saveClub(data);
      }
    } catch (err) {
      console.warn('[Firestore] Raw row create warning:', err);
    }

    if (table === 'candidates') {
      try {
        clientStorage.saveCandidate(data);
      } catch {}
    }

    const res = await fetch(`${API_BASE}/db/raw/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to create row in ${table}`);
    return res.json();
  },

  async updateRawRow(table: string, id: string, data: any): Promise<any> {
    // 1. Sync to Cloud Firestore first so live subscriptions & future fetches reflect the edit
    try {
      if (table === 'candidates') {
        await firestoreSync.saveCandidate({ ...data, id: data.id || id });
      } else if (table === 'heats') {
        await firestoreSync.saveHeat(data);
      } else if (table === 'results') {
        await firestoreSync.saveResult(data);
      } else if (table === 'settings') {
        await firestoreSync.saveSettings(data);
      } else if (table === 'events') {
        await firestoreSync.saveEvent({ ...data, Evt_No: data.Evt_No !== undefined ? data.Evt_No : id });
      } else if (table === 'clubs') {
        await firestoreSync.saveClub({ ...data, id: data.id || id });
      }
    } catch (err) {
      console.warn('[Firestore] Raw row update warning:', err);
    }

    // 2. Sync to clientStorage if candidates
    if (table === 'candidates') {
      try {
        const cands = clientStorage.getCandidates();
        const candId = data.id || id;
        const cIdx = cands.findIndex((c) => c.id === candId || (c.chestNo && String(c.chestNo) === String(data.chestNo || id)));
        if (cIdx >= 0) {
          cands[cIdx] = { ...cands[cIdx], ...data };
        } else {
          cands.push(data);
        }
        clientStorage.saveCandidates(cands);
      } catch {}
    }

    // 3. Update server endpoint
    const res = await fetch(`${API_BASE}/db/raw/${table}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update row in ${table}`);
    return res.json();
  },

  async deleteRawRow(table: string, id: string): Promise<any> {
    try {
      if (table === 'candidates') {
        await firestoreSync.deleteCandidate(id);
      } else if (table === 'heats') {
        await firestoreSync.deleteHeat(id);
      } else if (table === 'events') {
        await firestoreSync.deleteEvent(Number(id));
      } else if (table === 'clubs') {
        await firestoreSync.deleteClub(id);
      } else if (table === 'clientUploads') {
        await firestoreSync.deleteUpload(id);
      }
    } catch (err) {
      console.warn('[Firestore] Raw row delete warning:', err);
    }

    if (table === 'candidates') {
      try {
        clientStorage.deleteCandidate(id);
      } catch {}
    }

    const res = await fetch(`${API_BASE}/db/raw/${table}/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete row in ${table}`);
    return res.json();
  },

  async updateRawTable(table: string, data: any): Promise<any> {
    if (table === 'events' && Array.isArray(data)) {
      try {
        await firestoreSync.saveEventsBulk(data);
      } catch {}
    }
    const res = await fetch(`${API_BASE}/db/raw/${table}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update table ${table}`);
    return res.json();
  },

  // Real-time Server-Sent Events subscription for instantaneous push updates across devices
  subscribeServerStream(onUpdate: (data: any) => void): () => void {
    if (typeof window === 'undefined' || !window.EventSource) {
      return () => {};
    }
    let es: EventSource | null = null;
    let isClosed = false;

    const connect = () => {
      if (isClosed) return;
      try {
        es = new EventSource(`${API_BASE}/sync-stream`);
        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data && (data.type === 'db_updated' || data.type === 'connected')) {
              onUpdate(data);
            }
          } catch {}
        };
        es.onerror = () => {
          if (es) {
            es.close();
            es = null;
          }
          if (!isClosed) {
            setTimeout(connect, 3000);
          }
        };
      } catch {
        if (!isClosed) {
          setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      isClosed = true;
      if (es) {
        es.close();
        es = null;
      }
    };
  },

  // Aliases & Utilities
  async saveSettings(settings: SportsMeetSettings): Promise<SportsMeetSettings> {
    return this.updateSettings(settings);
  },

  async getDatabaseDump(): Promise<DatabaseDump> {
    return this.exportDatabase();
  },

  async restoreDatabaseDump(dump: any): Promise<{ success: boolean; message: string; stats: any }> {
    return this.restoreDatabase(dump);
  },

  async resetToDefaults(): Promise<any> {
    clientStorage.clearCandidates();
    try {
      const res = await fetch(`${API_BASE}/db/factory-reset`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset database');
      return res.json();
    } catch (e) {
      console.warn('[API] /api/db/factory-reset fallback to purgeAll:', e);
      return this.purgeAllExceptEvents();
    }
  },
};


import { SportEvent, Candidate, Club, SportsMeetSettings, EventHeat, EventResult, DatabaseDump, ClientUpload } from '../types';
import { firestoreSync, sanitizeForFirestore, isFirestoreQuotaExhausted } from './firestoreSync';
import { clientStorage } from './clientStorage';
import { collection, getDocs, getDocsFromServer, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { INITIAL_EVENTS } from '../constants/initialData';
import { clearFirstPrintWarned } from '../utils/qualificationRules';

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
      if (err.isAlreadyLoggedIn || err.isLockedOut || err.isPinRejected) throw err;
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
        error.isLockedOut = data.isLockedOut;
        error.lockedUntil = data.lockedUntil;
        error.remainingMs = data.remainingMs;
        error.failedAttempts = data.failedAttempts;
        error.isPinRejected = data.isPinRejected;
        error.remainingAttempts = data.remainingAttempts;
        throw error;
      }
      return data;
    }
  },

  async getPinLockoutStatus(): Promise<{
    isLocked: boolean;
    lockedUntil: number | null;
    remainingMs: number;
    failedAttempts: number;
  }> {
    try {
      const cloudStatus = await firestoreSync.getPinLockoutStatus();
      if (cloudStatus.isLocked || cloudStatus.failedAttempts > 0) {
        return cloudStatus;
      }
    } catch {}
    try {
      const deviceId = getDeviceId();
      const res = await fetch(`${API_BASE}/auth/session-status?deviceId=${encodeURIComponent(deviceId)}&t=${Date.now()}`, {
        cache: 'no-store',
      }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data?.lockout) {
          return data.lockout;
        }
      }
    } catch {}
    return { isLocked: false, lockedUntil: null, remainingMs: 0, failedAttempts: 0 };
  },

  subscribeToPinLockout(
    callback: (status: { isLocked: boolean; lockedUntil: number | null; remainingMs: number; failedAttempts: number }) => void
  ) {
    return firestoreSync.subscribeToPinLockout(callback);
  },

  async getSessionStatus(): Promise<{
    isServerLoggedIn: boolean;
    isCurrentDevice?: boolean;
    lockout?: { isLocked: boolean; lockedUntil: number | null; remainingMs: number; failedAttempts: number };
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
    if (!isFirestoreQuotaExhausted()) {
      try {
        const snap = await getDocs(collection(db, 'uploads'));
        const items: ClientUpload[] = [];
        snap.forEach((d) => items.push({ ...(d.data() as any), id: d.id }));
        items.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
        return items;
      } catch {}
    }
    const res = await fetch(`${API_BASE}/uploads?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch client uploads');
    return res.json();
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
      // 2. Forward to Express backend with the exact same upload ID
      await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, id: cloudRes.upload.id }),
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
    let cloudRes: any = null;
    try {
      cloudRes = await firestoreSync.mergeUpload(id);
    } catch {}

    const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(id)}/merge`, { method: 'POST' }).catch(() => null);
    if (cloudRes) {
      return {
        ...cloudRes,
        mergedCandidates: cloudRes.upload.candidates,
        totalServerCandidates: cloudRes.upload.candidates.length,
      };
    }
    if (!res || !res.ok) {
      const err = res ? await res.json().catch(() => ({ error: 'Failed to merge upload' })) : { error: 'Failed to merge upload' };
      throw new Error(err.error || 'Failed to merge upload');
    }
    return res.json();
  },

  async rejectUpload(id: string, reason?: string): Promise<{ success: boolean; message: string; upload: ClientUpload }> {
    let cloudRes: { success: boolean; message: string; upload: ClientUpload } | null = null;
    let cloudErr: any = null;
    try {
      cloudRes = await firestoreSync.rejectUpload(id, reason);
    } catch (err) {
      cloudErr = err;
    }

    let expressRes: any = null;
    let expressErr: any = null;
    try {
      const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        expressRes = await res.json();
      } else {
        const errData = await res.json().catch(() => ({}));
        expressErr = new Error(errData.error || 'Failed to reject upload');
      }
    } catch (err) {
      expressErr = err;
    }

    if (cloudRes) return cloudRes;
    if (expressRes) return expressRes;
    throw expressErr || cloudErr || new Error('Failed to reject upload');
  },

  async deleteUpload(id: string): Promise<{ success: boolean; message: string }> {
    let cloudOk = false;
    let cloudErr: any = null;
    try {
      await firestoreSync.deleteUpload(id);
      cloudOk = true;
    } catch (err) {
      cloudErr = err;
    }

    let expressOk = false;
    let expressErr: any = null;
    try {
      const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        expressOk = true;
      } else {
        const errData = await res.json().catch(() => ({}));
        expressErr = new Error(errData.error || 'Failed to delete upload');
      }
    } catch (err) {
      expressErr = err;
    }

    if (cloudOk || expressOk) {
      return { success: true, message: 'Upload batch removed' };
    }
    throw expressErr || cloudErr || new Error('Failed to delete upload');
  },

  async editUploadCandidate(id: string, candId: string, updates: Partial<Candidate>): Promise<{ success: boolean; candidate: Candidate }> {
    let cloudRes: any = null;
    try {
      cloudRes = await firestoreSync.editUploadCandidate(id, candId, updates);
    } catch {}

    const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(id)}/candidate/${encodeURIComponent(candId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => null);

    if (cloudRes) return cloudRes;
    if (!res || !res.ok) throw new Error('Failed to update candidate in upload');
    return res.json();
  },

  async mergeSingleUploadCandidate(id: string, candId: string): Promise<{ success: boolean; message: string; candidate: Candidate }> {
    let cloudRes: any = null;
    try {
      cloudRes = await firestoreSync.mergeSingleUploadCandidate(id, candId);
    } catch {}

    const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(id)}/merge-single/${encodeURIComponent(candId)}`, {
      method: 'POST',
    }).catch(() => null);

    if (cloudRes) return cloudRes;
    if (!res || !res.ok) throw new Error('Failed to merge candidate');
    return res.json();
  },

  async rejectSingleUploadCandidate(id: string, candId: string, reason?: string): Promise<{ success: boolean; message: string; candidate: Candidate }> {
    let cloudRes: any = null;
    try {
      cloudRes = await firestoreSync.rejectSingleUploadCandidate(id, candId, reason);
    } catch {}

    const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(id)}/reject-single/${encodeURIComponent(candId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }).catch(() => null);

    if (cloudRes) return { ...cloudRes, message: 'Candidate rejected' };
    if (!res || !res.ok) throw new Error('Failed to reject candidate');
    return res.json();
  },

  async deleteUploadCandidateGlobally(candId: string): Promise<{ success: boolean }> {
    try {
      await firestoreSync.deleteUploadCandidateGlobally(candId).catch(() => {});
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

  // Single Consolidated Bootstrap: Always load directly from Live Cloud Firestore first
  // so Google AI Studio preview, live app, desktop, and mobile always share identical live records.
  async getBootstrap() {
    try {
      const live = await firestoreSync.fetchLiveBootstrap();
      return {
        ...live,
        lastUpdated: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[Firestore] Live bootstrap fallback to server API:', err);
      const res = await fetch(`${API_BASE}/bootstrap?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch app bootstrap state');
      return res.json();
    }
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
      const snap = await getDocsFromServer(collection(db, 'events')).catch(() => getDocs(collection(db, 'events')));
      const itemsMap = new Map<number, SportEvent>();
      snap.forEach((d) => {
        const raw = d.data() as SportEvent;
        if (raw && raw.Evt_No !== undefined) {
          const evtNo = Number(raw.Evt_No);
          if (!itemsMap.has(evtNo) || d.id === `evt_${evtNo}`) {
            itemsMap.set(evtNo, {
              ...raw,
              Evt_No: evtNo,
              Fees: Number(raw.Fees ?? 0),
              requiredHit: raw.requiredHit !== undefined ? raw.requiredHit : (evtNo === 15 ? false : true),
              requiredFinal: raw.requiredFinal !== undefined ? raw.requiredFinal : true,
            });
          }
        }
      });
      return Array.from(itemsMap.values()).sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));
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
    try {
      await firestoreSync.replaceCollection('events', INITIAL_EVENTS);
    } catch {}
    const res = await fetch(`${API_BASE}/events/reset`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset events');
    const data = await res.json();
    return data.events;
  },

  // Candidates
  async getCandidates(): Promise<Candidate[]> {
    try {
      const snap = await getDocsFromServer(collection(db, 'candidates')).catch(() => getDocs(collection(db, 'candidates')));
      const items: Candidate[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      items.sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
      return items;
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
    const dedupeClubs = (list: Club[]): Club[] => {
      const map = new Map<string, Club>();
      list.forEach((raw) => {
        const regClub = String(raw.Reg_Club || raw.name || '').trim().toUpperCase();
        if (!regClub) return;
        const existing = map.get(regClub);
        const mob = String(raw.Mob || raw.mobile || raw.phone || '').trim();
        if (!existing) {
          map.set(regClub, {
            ...raw,
            Reg_Club: regClub,
            name: regClub,
            Mob: mob,
            mobile: mob,
          });
        } else {
          const existingMob = String(existing.Mob || existing.mobile || '').trim();
          map.set(regClub, {
            ...existing,
            ...raw,
            id: existing.id || raw.id,
            Reg_Club: regClub,
            name: regClub,
            Mob: mob || existingMob,
            mobile: mob || existingMob,
          });
        }
      });
      return Array.from(map.values()).map((c, idx) => ({ ...c, Sl: c.Sl || idx + 1 }));
    };

    try {
      const snap = await getDocsFromServer(collection(db, 'clubs')).catch(() => getDocs(collection(db, 'clubs')));
      const items: Club[] = [];
      snap.forEach((d) => {
        const raw = d.data() as any;
        const regClub = String(raw?.Reg_Club || raw?.name || '').trim().toUpperCase();
        if (!regClub || regClub === 'SELF') return;
        items.push({ ...(raw as Club), id: raw?.id || d.id });
      });
      return dedupeClubs(items);
    } catch {}
    const res = await fetch(`${API_BASE}/clubs`);
    if (!res.ok) throw new Error('Failed to fetch clubs');
    return dedupeClubs(await res.json());
  },

  async saveClub(club: Partial<Club>): Promise<Club> {
    const regClub = String(club.Reg_Club || club.name || '').trim().toUpperCase();
    const cleanClub = {
      ...club,
      ...(regClub ? { Reg_Club: regClub, name: regClub } : {}),
    } as Club;
    try {
      const saved = await firestoreSync.saveClub(cleanClub);
      cleanClub.id = saved.id;
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

  async markClubsPaid(
    clubNames: string[],
    candidatesToMark: Candidate[]
  ): Promise<{ success: boolean; updatedCount: number }> {
    const now = new Date().toISOString();
    for (const cand of candidatesToMark) {
      await firestoreSync
        .saveCandidate({
          ...cand,
          feeStatus: 'Paid',
          updatedAt: now,
          synced: true,
          isDirty: false,
        })
        .catch(() => {});
    }

    const res = await fetch(`${API_BASE}/clubs/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clubNames }),
    }).catch(() => null);

    if (res && !res.ok && candidatesToMark.length === 0) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to mark selected club payments as Paid');
    }

    return {
      success: true,
      updatedCount: candidatesToMark.length,
    };
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
      const snap = await getDocsFromServer(collection(db, 'heats')).catch(() => getDocs(collection(db, 'heats')));
      const items: EventHeat[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      return items;
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
      const snap = await getDocsFromServer(collection(db, 'results')).catch(() => getDocs(collection(db, 'results')));
      const items: EventResult[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      return items;
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
    try {
      const live = await firestoreSync.fetchLiveBootstrap();
      return {
        events: live.events,
        candidates: live.candidates,
        clubs: live.clubs,
        results: live.results,
        heats: live.heats,
        settings: live.settings,
        clientUploads: live.uploads,
        lastUpdated: new Date().toISOString(),
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        system: 'eSports Sports Management System',
      } as unknown as DatabaseDump;
    } catch {}
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
    try {
      if (Array.isArray(dump?.events)) await firestoreSync.replaceCollection('events', dump.events);
      if (Array.isArray(dump?.candidates)) await firestoreSync.replaceCollection('candidates', dump.candidates);
      if (Array.isArray(dump?.clubs)) await firestoreSync.replaceCollection('clubs', dump.clubs);
      if (Array.isArray(dump?.heats)) await firestoreSync.replaceCollection('heats', dump.heats);
      if (Array.isArray(dump?.results)) await firestoreSync.replaceCollection('results', dump.results);
      if (Array.isArray(dump?.clientUploads || dump?.uploads)) {
        await firestoreSync.replaceCollection('clientUploads', dump.clientUploads || dump.uploads);
      }
      if (dump?.settings) await firestoreSync.saveSettings(dump.settings);
    } catch (err) {
      console.warn('[Firestore] restoreDatabase sync warning:', err);
    }

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

  async restoreAthletesData(data: {
    candidates: Candidate[];
    heats: EventHeat[];
    results: EventResult[];
  }): Promise<{ success: boolean; message: string; stats: any }> {
    let canonicalCandidates = data.candidates;
    let rebuiltClubs: Club[] = [];
    let expressResult: any = null;

    const res = await fetch(`${API_BASE}/db/restore-athletes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => null);

    if (res && res.ok) {
      expressResult = await res.json();
      if (Array.isArray(expressResult.candidates)) {
        canonicalCandidates = expressResult.candidates;
      }
      if (Array.isArray(expressResult.clubs)) {
        rebuiltClubs = expressResult.clubs;
      }
    } else if (res && !res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to restore athletes' data");
    }

    // Build fallback clubs if Express was unreachable
    if (rebuiltClubs.length === 0 && canonicalCandidates.length > 0) {
      const clubNames = Array.from(
        new Set(canonicalCandidates.map((c) => (c.club || 'SELF').trim().toUpperCase()).filter(Boolean))
      );
      rebuiltClubs = clubNames.map((name, i) => ({
        id: `club_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        Sl: i + 1,
        Reg_Club: name,
        Mob: '',
        Count_1stPlace: 0,
        Count_2ndPlace: 0,
        Count_3rdPlace: 0,
        TotPoints: 0,
        name,
        mobile: '',
      }));
    }

    try {
      await firestoreSync.restoreAthletesData({
        candidates: canonicalCandidates,
        heats: data.heats,
        results: data.results,
        clubs: rebuiltClubs,
      });
    } catch (err) {
      console.warn("[Firestore] Athletes' data restore warning:", err);
      if (!expressResult) {
        throw err;
      }
    }

    return {
      success: true,
      message:
        expressResult?.message ||
        `Restored ${canonicalCandidates.length} athlete(s), ${data.heats.length} heat(s), and ${data.results.length} event result(s).`,
      stats: expressResult?.stats || {
        candidates: canonicalCandidates.length,
        heats: data.heats.length,
        results: data.results.length,
        clubs: rebuiltClubs.length,
      },
    };
  },

  async seedSampleData(): Promise<{ success: boolean; message: string; count: number; candidates: Candidate[] }> {
    const res = await fetch(`${API_BASE}/db/sample-data`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to seed sample data');
    const data = await res.json();
    if (Array.isArray(data?.candidates)) {
      await firestoreSync.replaceCollection('candidates', data.candidates).catch(() => {});
    }
    return data;
  },

  async clearDatabase(): Promise<void> {
    try {
      await firestoreSync.purgeAllExceptEvents();
    } catch {}
    clientStorage.clearCandidates();
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
    try {
      if (table === 'candidates') return await this.getCandidates();
      if (table === 'events') return await this.getEvents();
      if (table === 'clubs') return await this.getClubs();
      if (table === 'heats') return await this.getHeats();
      if (table === 'results') return await this.getResults();
      if (table === 'clientUploads') return await this.getUploads();
    } catch {}
    const res = await fetch(`${API_BASE}/db/raw/${table}?t=${Date.now()}`, { cache: 'no-store' });
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
      } else if (table === 'clientUploads') {
        const upId = String(data.id || `upload_${Date.now()}`);
        await setDoc(doc(db, 'uploads', upId), sanitizeForFirestore({ ...data, id: upId }), { merge: true });
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
        await firestoreSync.saveHeat({ ...data, id: data.id || id });
      } else if (table === 'results') {
        await firestoreSync.saveResult({ ...data, id: data.id || id });
      } else if (table === 'settings') {
        await firestoreSync.saveSettings(data);
      } else if (table === 'events') {
        await firestoreSync.saveEvent({ ...data, Evt_No: data.Evt_No !== undefined ? data.Evt_No : id });
      } else if (table === 'clubs') {
        await firestoreSync.saveClub({ ...data, id: data.id || id });
      } else if (table === 'clientUploads') {
        const upId = String(data.id || id);
        await setDoc(doc(db, 'uploads', upId), sanitizeForFirestore({ ...data, id: upId }), { merge: true });
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
      } else if (table === 'results') {
        await firestoreSync.deleteResult(id);
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

  async clearRawTable(table: 'candidates' | 'events' | 'clubs' | 'heats' | 'results' | 'clientUploads'): Promise<{ success: boolean; deletedCount?: number }> {
    let cloudDeleted = 0;
    try {
      cloudDeleted = await firestoreSync.clearCollection(table);
    } catch (err) {
      console.warn(`[Firestore] Clear table '${table}' warning:`, err);
    }

    if (table === 'candidates') {
      clientStorage.clearCandidates();
    } else if (table === 'events') {
      clientStorage.saveEventsCache([]);
    } else if (table === 'clubs') {
      clientStorage.saveClubsCache([]);
    }

    const res = await fetch(`${API_BASE}/db/raw/${table}`, {
      method: 'DELETE',
    }).catch(() => null);

    if (res && !res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to clear table ${table}`);
    }

    const serverJson = res ? await res.json().catch(() => ({})) : {};
    return {
      success: true,
      deletedCount: Math.max(cloudDeleted, Number(serverJson?.deletedCount || 0)),
    };
  },

  async updateRawTable(table: string, data: any): Promise<any> {
    if (Array.isArray(data) && ['events', 'candidates', 'clubs', 'heats', 'results', 'clientUploads'].includes(table)) {
      try {
        await firestoreSync.replaceCollection(table as any, data);
      } catch (err) {
        console.warn(`[Firestore] Replace table '${table}' warning:`, err);
      }
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
    clearFirstPrintWarned();
    try {
      await firestoreSync.resetToDefaults();
    } catch (err) {
      console.warn('[Firestore] resetToDefaults warning:', err);
    }
    try {
      const res = await fetch(`${API_BASE}/db/factory-reset`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset database');
      return res.json();
    } catch (e) {
      console.warn('[API] /api/db/factory-reset fallback notice:', e);
      return { success: true, message: 'Database reset to factory defaults.' };
    }
  },
};


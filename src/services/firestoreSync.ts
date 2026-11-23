import {
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  query,
  orderBy,
  Unsubscribe
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  Candidate,
  ClientUpload,
  SportEvent,
  Club,
  SportsMeetSettings,
  EventHeat,
  EventResult
} from '../types';
import { INITIAL_EVENTS, INITIAL_CLUBS, INITIAL_SETTINGS } from '../constants/initialData';
import { getDeviceId, getDeviceLabel } from './api';

// Collection references
const UPLOADS_COL = 'uploads';
const CANDIDATES_COL = 'candidates';
const HEATS_COL = 'heats';
const RESULTS_COL = 'results';
const EVENTS_COL = 'events';
const CLUBS_COL = 'clubs';
const SETTINGS_COL = 'settings';
const SETTINGS_DOC_ID = 'meet_settings';
const SESSION_COL = 'serverSession';
const PIN_LOCKOUT_DOC_ID = 'pinLockout';
const MAX_PIN_ATTEMPTS = 3;
const PIN_LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const LOCAL_LOCKOUT_KEY = 'esports_pin_lockout';

export interface PinLockoutStatus {
  isLocked: boolean;
  lockedUntil: number | null;
  remainingMs: number;
  failedAttempts: number;
}

function normalizePinLockoutData(data?: any): PinLockoutStatus {
  const rawLockedUntil = typeof data?.lockedUntil === 'number' ? data.lockedUntil : null;
  if (rawLockedUntil) {
    const remainingMs = rawLockedUntil - Date.now();
    if (remainingMs > 0) {
      return {
        isLocked: true,
        lockedUntil: rawLockedUntil,
        remainingMs,
        failedAttempts: MAX_PIN_ATTEMPTS,
      };
    }
    return {
      isLocked: false,
      lockedUntil: null,
      remainingMs: 0,
      failedAttempts: 0,
    };
  }
  return {
    isLocked: false,
    lockedUntil: null,
    remainingMs: 0,
    failedAttempts: Number(data?.failedAttempts || 0),
  };
}

function writeLocalLockoutMirror(data: { failedAttempts: number; lockedUntil: number | null }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_LOCKOUT_KEY, JSON.stringify(data));
  } catch {}
}

function readLocalLockoutMirror(): PinLockoutStatus {
  if (typeof window === 'undefined') {
    return { isLocked: false, lockedUntil: null, remainingMs: 0, failedAttempts: 0 };
  }
  try {
    const raw = localStorage.getItem(LOCAL_LOCKOUT_KEY);
    if (raw) {
      return normalizePinLockoutData(JSON.parse(raw));
    }
  } catch {}
  return { isLocked: false, lockedUntil: null, remainingMs: 0, failedAttempts: 0 };
}

// Sanitize candidate to strip any undefined values before writing to Firestore
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        clean[k] = sanitizeForFirestore(v);
      } else if (Array.isArray(v)) {
        clean[k] = v.map((item) => (item !== null && typeof item === 'object' ? sanitizeForFirestore(item) : item));
      } else {
        clean[k] = v;
      }
    }
  }
  return clean as T;
}

export function getEventDocId(evtNo: number | string): string {
  const clean = String(evtNo).replace(/^evt_/, '');
  return `evt_${clean}`;
}

export function getClubDocId(clubId: string): string {
  const clean = String(clubId).replace(/^club_/, '');
  return `club_${clean}`;
}

export function makeCanonicalClubDocId(clubName: string): string {
  const normalized = String(clubName || '').trim().toUpperCase();
  const asciiSlug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (asciiSlug && /[a-z0-9]/.test(asciiSlug) && /^[\x00-\x7F]*$/.test(normalized)) {
    return `club_${asciiSlug}`;
  }
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  const hex = (hash >>> 0).toString(16);
  return asciiSlug ? `club_${asciiSlug}_${hex}` : `club_u_${hex}`;
}

const QUOTA_STORAGE_KEY = 'firestore_quota_status_v1';

function getInitialQuotaStatus(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const recordedAt = new Date(parsed.timestamp || 0);
      const now = new Date();
      if (
        recordedAt.getUTCFullYear() === now.getUTCFullYear() &&
        recordedAt.getUTCMonth() === now.getUTCMonth() &&
        recordedAt.getUTCDate() === now.getUTCDate()
      ) {
        return !!parsed.exceeded;
      }
    }
  } catch {}
  return false;
}

// Quota state tracking for Firebase free tier limits
let isCloudQuotaExceeded = getInitialQuotaStatus();
type QuotaListener = (exceeded: boolean) => void;
const quotaListeners: Set<QuotaListener> = new Set();

export function isFirestoreQuotaExhausted(): boolean {
  return isCloudQuotaExceeded;
}

export function setFirestoreQuotaExceeded(exceeded = true) {
  if (isCloudQuotaExceeded !== exceeded) {
    isCloudQuotaExceeded = exceeded;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          QUOTA_STORAGE_KEY,
          JSON.stringify({ exceeded, timestamp: new Date().toISOString() })
        );
      }
    } catch {}
    quotaListeners.forEach((fn) => {
      try { fn(exceeded); } catch {}
    });
    if (typeof window !== 'undefined' && exceeded) {
      window.dispatchEvent(new CustomEvent('firestore_quota_exceeded'));
    }
  }
}

export function subscribeQuotaStatus(listener: QuotaListener): () => void {
  quotaListeners.add(listener);
  listener(isCloudQuotaExceeded);
  return () => quotaListeners.delete(listener);
}

export function checkAndHandleQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || '').toLowerCase();
  if (
    code === 'resource-exhausted' ||
    msg.includes('quota limit exceeded') ||
    msg.includes('resource-exhausted') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota exceeded') ||
    msg.includes('free daily write units')
  ) {
    setFirestoreQuotaExceeded(true);
    return true;
  }
  return false;
}

export function assertCloudWritable() {
  if (isCloudQuotaExceeded) {
    throw new Error('Firestore daily write quota reached (falling back to local server API)');
  }
}

// Auto-check quota status on client startup from local server
if (typeof window !== 'undefined') {
  fetch('/api/quota-status')
    .then((r) => r.json())
    .then((data) => {
      if (data?.isCloudQuotaExceeded) {
        setFirestoreQuotaExceeded(true);
      }
    })
    .catch(() => {});
}

export const firestoreSync = {
  // ----------------------------------------------------
  // REAL-TIME SUBSCRIPTIONS
  // ----------------------------------------------------

  subscribeUploads(callback: (uploads: ClientUpload[]) => void): Unsubscribe {
    const colRef = collection(db, UPLOADS_COL);
    return onSnapshot(colRef, (snapshot) => {
      const items: ClientUpload[] = [];
      snapshot.forEach((d) => {
        items.push({ ...(d.data() as any), id: d.id });
      });
      // Sort newest uploads first
      items.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
      callback(items);
    }, (err) => {
      if (!checkAndHandleQuotaError(err)) {
        console.warn('[Firestore] Error subscribing to uploads:', err);
      }
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.GET, UPLOADS_COL);
      }
    });
  },

  subscribeCandidates(callback: (candidates: Candidate[]) => void): Unsubscribe {
    const colRef = collection(db, CANDIDATES_COL);
    return onSnapshot(colRef, (snapshot) => {
      const items: Candidate[] = [];
      snapshot.forEach((d) => {
        items.push({ id: d.id, ...(d.data() as any) });
      });
      // Sort by official chest number
      items.sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
      callback(items);
    }, (err) => {
      if (!checkAndHandleQuotaError(err)) {
        console.warn('[Firestore] Error subscribing to candidates:', err);
      }
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.GET, CANDIDATES_COL);
      }
    });
  },

  subscribeHeats(callback: (heats: EventHeat[]) => void): Unsubscribe {
    const colRef = collection(db, HEATS_COL);
    return onSnapshot(colRef, (snapshot) => {
      const items: EventHeat[] = [];
      snapshot.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      callback(items);
    }, (err) => {
      if (!checkAndHandleQuotaError(err)) {
        console.warn('[Firestore] Error subscribing to heats:', err);
      }
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.GET, HEATS_COL);
      }
    });
  },

  subscribeResults(callback: (results: EventResult[]) => void): Unsubscribe {
    const colRef = collection(db, RESULTS_COL);
    return onSnapshot(colRef, (snapshot) => {
      const items: EventResult[] = [];
      snapshot.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      callback(items);
    }, (err) => {
      if (!checkAndHandleQuotaError(err)) {
        console.warn('[Firestore] Error subscribing to results:', err);
      }
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.GET, RESULTS_COL);
      }
    });
  },

  subscribeSettings(callback: (settings: SportsMeetSettings) => void): Unsubscribe {
    const docRef = doc(db, SETTINGS_COL, 'meet_settings');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        callback({ ...INITIAL_SETTINGS, ...(snapshot.data() as SportsMeetSettings) });
      } else {
        callback(INITIAL_SETTINGS);
      }
    }, (err) => {
      if (!checkAndHandleQuotaError(err)) {
        console.warn('[Firestore] Error subscribing to settings:', err);
      }
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.GET, SETTINGS_COL);
      }
    });
  },

  subscribeEvents(callback: (events: SportEvent[]) => void): Unsubscribe {
    const colRef = collection(db, EVENTS_COL);
    return onSnapshot(colRef, (snapshot) => {
      if (snapshot.empty) {
        callback([]);
        return;
      }
      const itemsMap = new Map<number, SportEvent>();
      snapshot.forEach((d) => {
        const raw = d.data() as SportEvent;
        if (raw && raw.Evt_No !== undefined) {
          const evtNo = Number(raw.Evt_No);
          const isCanonicalDoc = d.id === `evt_${evtNo}`;
          const existing = itemsMap.get(evtNo);
          // If we haven't seen this Evt_No or if this is the canonical 'evt_X' doc, accept it
          if (!existing || isCanonicalDoc) {
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
      const items = Array.from(itemsMap.values()).sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));
      callback(items);
    }, (err) => {
      if (!checkAndHandleQuotaError(err)) {
        console.warn('[Firestore] Error subscribing to events:', err);
      }
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.GET, EVENTS_COL);
      }
    });
  },

  subscribeClubs(callback: (clubs: Club[]) => void): Unsubscribe {
    const colRef = collection(db, CLUBS_COL);
    return onSnapshot(colRef, (snapshot) => {
      if (snapshot.empty) {
        callback(INITIAL_CLUBS);
        return;
      }
      const itemsMap = new Map<string, Club>();
      snapshot.forEach((d) => {
        const raw = d.data() as any;
        if (raw && (raw.id || raw.Reg_Club || raw.name)) {
          const regClub = String(raw.Reg_Club || raw.name || '').trim().toUpperCase();
          if (!regClub || regClub === 'SELF') return;
          const clubId = String(raw.id || d.id);
          const mob = (raw.Mob || raw.mobile || raw.phone || '').trim();
          const existing = itemsMap.get(regClub);
          if (!existing) {
            itemsMap.set(regClub, {
              id: clubId,
              Sl: raw.Sl,
              Reg_Club: regClub,
              Mob: mob,
              Count_1stPlace: Number(raw.Count_1stPlace) || 0,
              Count_2ndPlace: Number(raw.Count_2ndPlace) || 0,
              Count_3rdPlace: Number(raw.Count_3rdPlace) || 0,
              TotPoints: Number(raw.TotPoints) || 0,
              name: regClub,
              mobile: mob,
            });
          } else {
            const existingMob = (existing.Mob || existing.mobile || '').trim();
            const canonicalId = makeCanonicalClubDocId(regClub);
            itemsMap.set(regClub, {
              id: d.id === canonicalId ? canonicalId : existing.id,
              Sl: existing.Sl || raw.Sl,
              Reg_Club: regClub,
              Mob: mob || existingMob,
              Count_1stPlace: Math.max(Number(existing.Count_1stPlace) || 0, Number(raw.Count_1stPlace) || 0),
              Count_2ndPlace: Math.max(Number(existing.Count_2ndPlace) || 0, Number(raw.Count_2ndPlace) || 0),
              Count_3rdPlace: Math.max(Number(existing.Count_3rdPlace) || 0, Number(raw.Count_3rdPlace) || 0),
              TotPoints: Math.max(Number(existing.TotPoints) || 0, Number(raw.TotPoints) || 0),
              name: regClub,
              mobile: mob || existingMob,
            });
          }
        }
      });
      callback(Array.from(itemsMap.values()).map((c, idx) => ({ ...c, Sl: c.Sl || idx + 1 })));
    }, (err) => {
      if (!checkAndHandleQuotaError(err)) {
        console.warn('[Firestore] Error subscribing to clubs:', err);
      }
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.GET, CLUBS_COL);
      }
    });
  },

  subscribeServerSession(callback: (session: any) => void): Unsubscribe {
    const docRef = doc(db, SESSION_COL, 'active');
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      } else {
        callback(null);
      }
    }, (err) => {
      if (!checkAndHandleQuotaError(err)) {
        console.warn('[Firestore] Error subscribing to serverSession:', err);
      }
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.GET, SESSION_COL);
      }
    });
  },

  // ----------------------------------------------------
  // SEEDING HELPERS (Run once if collections are blank)
  // ----------------------------------------------------

  async seedInitialEvents() {
    if (isCloudQuotaExceeded) return;
    try {
      for (const evt of INITIAL_EVENTS) {
        if (isCloudQuotaExceeded) break;
        await setDoc(doc(db, EVENTS_COL, `evt_${evt.Evt_No}`), sanitizeForFirestore(evt));
      }
    } catch (e) {
      checkAndHandleQuotaError(e);
      console.warn('[Firestore] Seeding events notice:', e);
    }
  },

  async seedInitialClubs() {
    // Dynamic clubs master only from enrolled candidates; no hardcoded seed clubs
    return;
  },

  // ----------------------------------------------------
  // CLIENT UPLOADS (STAGING & APPROVAL QUEUE)
  // ----------------------------------------------------

  async submitUpload(data: {
    club: string;
    clientName?: string;
    candidates: Candidate[];
    totalFees?: number;
    notes?: string;
    clubMobile?: string;
  }): Promise<{ success: boolean; message: string; upload: ClientUpload }> {
    assertCloudWritable();
    const targetClub = (data.club || data.candidates[0]?.club || 'Independent / Unattached').trim();
    const now = new Date().toISOString();

    const processedCandidates = data.candidates.map((c: any, idx: number) => {
      const candId = c.id || `cand_up_${Date.now()}_${idx}`;
      const hasOfficialServerChest = Boolean(c.merged && Number(c.chestNo) >= 101);
      const recNo = Number(c.localRecordNo) > 0 ? Number(c.localRecordNo) : (!hasOfficialServerChest && Number(c.chestNo) > 0 ? Number(c.chestNo) : idx + 1);
      return {
        ...c,
        id: candId,
        club: targetClub,
        localRecordNo: recNo,
        chestNo: hasOfficialServerChest ? c.chestNo : null,
        merged: Boolean(hasOfficialServerChest),
        status: hasOfficialServerChest ? 'merged' : 'pending',
        uploadedAt: now,
      };
    });

    try {
      // Check if there is an existing pending upload for this club in Firestore
      const uploadsSnap = await getDocs(collection(db, UPLOADS_COL));
      let existingDoc: { id: string; data: ClientUpload } | null = null;
      uploadsSnap.forEach((d) => {
        const item = d.data() as ClientUpload;
        if (item.status === 'pending' && (item.club || '').trim().toUpperCase() === targetClub.toUpperCase()) {
          existingDoc = { id: d.id, data: item };
        }
      });

      if (existingDoc) {
        const existing = (existingDoc as any).data as ClientUpload;
        const updatedCandidates = [...(existing.candidates || [])];
        processedCandidates.forEach((newCand) => {
          const idx = updatedCandidates.findIndex(
            (ec) => ec.id === newCand.id || (ec.name && newCand.name && ec.name.trim().toUpperCase() === newCand.name.trim().toUpperCase())
          );
          if (idx >= 0) {
            updatedCandidates[idx] = {
              ...updatedCandidates[idx],
              ...newCand,
              status: updatedCandidates[idx].merged ? 'merged' : 'pending',
            };
          } else {
            updatedCandidates.push(newCand as any);
          }
        });

        const updatedBatch: ClientUpload = {
          ...existing,
          status: 'pending',
          uploadedAt: now,
          clubMobile: (data.clubMobile || existing.clubMobile || '').trim(),
          clientName: data.clientName || existing.clientName || '',
          notes: data.notes || existing.notes || '',
          candidates: updatedCandidates,
          totalFees: updatedCandidates.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0),
        };

        await setDoc(doc(db, UPLOADS_COL, (existingDoc as any).id), sanitizeForFirestore(updatedBatch));

        return {
          success: true,
          message: `Batch for "${targetClub}" updated with ${processedCandidates.length} athlete(s) in cloud review queue!`,
          upload: updatedBatch,
        };
      } else {
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newUpload: ClientUpload = {
          id: uploadId,
          club: targetClub,
          clubMobile: (data.clubMobile || '').trim(),
          clientName: data.clientName || '',
          uploadedAt: now,
          status: 'pending',
          candidates: processedCandidates as any,
          totalFees: Number(data.totalFees) || processedCandidates.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0),
          notes: data.notes || '',
        };

        await setDoc(doc(db, UPLOADS_COL, uploadId), sanitizeForFirestore(newUpload));

        return {
          success: true,
          message: `Batch of ${processedCandidates.length} candidate(s) for "${newUpload.club}" submitted to cloud review queue!`,
          upload: newUpload,
        };
      }
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async mergeUpload(uploadId: string): Promise<{ success: boolean; message: string; upload: ClientUpload }> {
    assertCloudWritable();
    try {
      const uploadRef = doc(db, UPLOADS_COL, uploadId);
      const snap = await getDoc(uploadRef);
      if (!snap.exists()) throw new Error('Upload batch not found');

      const upload = snap.data() as ClientUpload;
      const now = new Date().toISOString();

      // Fetch current official server candidates and settings to determine starting chest number
      const candSnap = await getDocs(collection(db, CANDIDATES_COL));
      const serverCandidates: Candidate[] = [];
      candSnap.forEach((d) => serverCandidates.push(d.data() as Candidate));

      const sDoc = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC_ID));
      const startChest = (sDoc.exists() && sDoc.data()?.autoChestStart) ? Number(sDoc.data().autoChestStart) : 101;

      let nextChest = startChest;
      if (serverCandidates.length > 0) {
        const maxChest = Math.max(...serverCandidates.map((c) => Number(c.chestNo) || 0));
        nextChest = maxChest >= startChest ? maxChest + 1 : startChest;
      }

      const updatedCandidates: Candidate[] = [];
      const approvedClubs = new Set<string>();

      for (const cand of (upload.candidates || [])) {
        if (cand.status === 'rejected') {
          updatedCandidates.push(cand);
          continue;
        }

        // Check if candidate already exists in official candidates
        const existingCand = serverCandidates.find(
          (c) => c.id === cand.id || (c.name && cand.name && (c.name || '').trim().toUpperCase() === (cand.name || '').trim().toUpperCase() && (c.club || '').trim().toUpperCase() === (upload.club || '').trim().toUpperCase())
        );

        let officialChest: number;
        if (existingCand && Number(existingCand.chestNo) >= 101) {
          officialChest = Number(existingCand.chestNo);
        } else {
          officialChest = nextChest++;
        }

        const mergedCand: Candidate = {
          ...cand,
          id: existingCand ? existingCand.id : cand.id,
          club: cand.club || upload.club,
          chestNo: officialChest,
          localRecordNo: cand.localRecordNo || cand.chestNo || 1,
          merged: true,
          status: 'merged',
          synced: true,
          isDirty: false,
          updatedAt: now,
        };

        // Persist to official candidates collection
        await setDoc(doc(db, CANDIDATES_COL, mergedCand.id), sanitizeForFirestore(mergedCand));
        updatedCandidates.push(mergedCand);
        const approvedClubName = String(mergedCand.club || upload.club || '').trim().toUpperCase();
        if (approvedClubName && !['SELF', 'INDEPENDENT', 'INDEPENDENT / UNATTACHED'].includes(approvedClubName)) {
          approvedClubs.add(approvedClubName);
        }
      }

      const mergedUpload: ClientUpload = {
        ...upload,
        status: approvedClubs.size > 0 ? 'merged' : 'rejected',
        mergedAt: now,
        reviewedAt: now,
        candidates: updatedCandidates,
      };

      await setDoc(uploadRef, sanitizeForFirestore(mergedUpload));

      // Register approved club(s) into the club master table only after successful approval
      for (const clubName of approvedClubs) {
        const mob = (upload.clubMobile || '').trim();
        await this.saveClub({
          id: makeCanonicalClubDocId(clubName),
          Reg_Club: clubName,
          name: clubName,
          ...(mob ? { Mob: mob, mobile: mob } : {}),
        } as Club, { preserveExistingMobileIfEmpty: true }).catch(() => {});
      }

      return {
        success: true,
        message: `Successfully reviewed and merged ${updatedCandidates.length} candidate(s) from "${upload.club}" into official cloud database!`,
        upload: mergedUpload,
      };
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async mergeSingleUploadCandidate(uploadId: string, candId: string): Promise<{ success: boolean; message: string; candidate: Candidate }> {
    assertCloudWritable();
    try {
      const uploadRef = doc(db, UPLOADS_COL, uploadId);
      const snap = await getDoc(uploadRef);
      if (!snap.exists()) throw new Error('Upload batch not found');

      const upload = snap.data() as ClientUpload;
      const cand = upload.candidates.find((c) => c.id === candId);
      if (!cand) throw new Error('Candidate not found in upload batch');

      const candSnap = await getDocs(collection(db, CANDIDATES_COL));
      const serverCandidates: Candidate[] = [];
      candSnap.forEach((d) => serverCandidates.push(d.data() as Candidate));

      let nextChest = 101;
      if (serverCandidates.length > 0) {
        const maxChest = Math.max(...serverCandidates.map((c) => Number(c.chestNo) || 0));
        nextChest = maxChest >= 101 ? maxChest + 1 : 101;
      }

      const existingCand = serverCandidates.find(
        (c) => c.id === cand.id || (c.name && cand.name && (c.name || '').trim().toUpperCase() === (cand.name || '').trim().toUpperCase() && (c.club || '').trim().toUpperCase() === (upload.club || '').trim().toUpperCase())
      );

      const officialChest = existingCand && Number(existingCand.chestNo) >= 101 ? Number(existingCand.chestNo) : nextChest;
      const now = new Date().toISOString();

      const mergedCand: Candidate = {
        ...cand,
        id: existingCand ? existingCand.id : cand.id,
        club: cand.club || upload.club,
        chestNo: officialChest,
        localRecordNo: cand.localRecordNo || cand.chestNo || 1,
        merged: true,
        status: 'merged',
        synced: true,
        isDirty: false,
        updatedAt: now,
      };

      // Save to official candidates
      await setDoc(doc(db, CANDIDATES_COL, mergedCand.id), sanitizeForFirestore(mergedCand));

      // Update inside upload batch
      const updatedCandidates = upload.candidates.map((c) => (c.id === candId ? mergedCand : c));
      const allProcessed = updatedCandidates.every((c) => c.merged || c.status === 'rejected');

      const updatedUpload: ClientUpload = {
        ...upload,
        candidates: updatedCandidates,
        status: allProcessed ? (updatedCandidates.some((c) => c.merged) ? 'merged' : 'rejected') : 'pending',
        reviewedAt: now,
        mergedAt: allProcessed ? now : upload.mergedAt,
      };

      await setDoc(uploadRef, sanitizeForFirestore(updatedUpload));

      // Register approved club into club master table only after successful approval
      const approvedClubName = String(mergedCand.club || upload.club || '').trim().toUpperCase();
      if (approvedClubName && !['SELF', 'INDEPENDENT', 'INDEPENDENT / UNATTACHED'].includes(approvedClubName)) {
        const mob = (upload.clubMobile || '').trim();
        await this.saveClub({
          id: makeCanonicalClubDocId(approvedClubName),
          Reg_Club: approvedClubName,
          name: approvedClubName,
          ...(mob ? { Mob: mob, mobile: mob } : {}),
        } as Club, { preserveExistingMobileIfEmpty: true }).catch(() => {});
      }

      return {
        success: true,
        message: `Candidate "${mergedCand.name}" officially merged with Chest #${officialChest}!`,
        candidate: mergedCand,
      };
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async rejectSingleUploadCandidate(uploadId: string, candId: string, reason?: string): Promise<{ success: boolean; candidate: Candidate }> {
    assertCloudWritable();
    try {
      const uploadRef = doc(db, UPLOADS_COL, uploadId);
      const snap = await getDoc(uploadRef);
      if (!snap.exists()) throw new Error('Upload batch not found');

      const upload = snap.data() as ClientUpload;
      const updatedCandidates = upload.candidates.map((c) => {
        if (c.id === candId) {
          return {
            ...c,
            status: 'rejected' as const,
            rejectionReason: reason || 'Rejected by server admin',
          };
        }
        return c;
      });

      const allProcessed = updatedCandidates.every((c) => c.merged || c.status === 'rejected');
      const updatedUpload: ClientUpload = {
        ...upload,
        candidates: updatedCandidates,
        status: allProcessed ? (updatedCandidates.some((c) => c.merged) ? 'merged' : 'rejected') : 'pending',
        reviewedAt: new Date().toISOString(),
      };

      await setDoc(uploadRef, sanitizeForFirestore(updatedUpload));
      const target = updatedCandidates.find((c) => c.id === candId)!;
      return { success: true, candidate: target };
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async editUploadCandidate(uploadId: string, candId: string, updates: Partial<Candidate>): Promise<{ success: boolean; candidate: Candidate }> {
    assertCloudWritable();
    try {
      const uploadRef = doc(db, UPLOADS_COL, uploadId);
      const snap = await getDoc(uploadRef);
      if (!snap.exists()) throw new Error('Upload batch not found');

      const upload = snap.data() as ClientUpload;
      const updatedCandidates = upload.candidates.map((c) => (c.id === candId ? { ...c, ...updates } : c));
      const totalFees = updatedCandidates.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0);

      const updatedUpload: ClientUpload = {
        ...upload,
        candidates: updatedCandidates,
        totalFees,
      };

      await setDoc(uploadRef, sanitizeForFirestore(updatedUpload));
      const target = updatedCandidates.find((c) => c.id === candId)!;
      return { success: true, candidate: target };
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async rejectUpload(uploadId: string, reason?: string): Promise<{ success: boolean; message: string; upload: ClientUpload }> {
    assertCloudWritable();
    try {
      let uploadRef = doc(db, UPLOADS_COL, uploadId);
      let snap = await getDoc(uploadRef);

      // Fallback: locate doc if stored `id` field differs from Firestore document ID
      if (!snap.exists()) {
        const allSnap = await getDocs(collection(db, UPLOADS_COL));
        const matchedDoc = allSnap.docs.find((d) => d.id === uploadId || d.data()?.id === uploadId);
        if (!matchedDoc) {
          throw new Error('Upload batch not found');
        }
        uploadRef = matchedDoc.ref;
        snap = matchedDoc as any;
      }

      const upload = snap.data() as ClientUpload;
      const rejected: ClientUpload = {
        ...upload,
        id: uploadRef.id,
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        notes: reason ? `${upload.notes ? upload.notes + ' | ' : ''}Rejected: ${reason}` : upload.notes,
      };

      await setDoc(uploadRef, sanitizeForFirestore(rejected));
      return {
        success: true,
        message: `Upload batch from "${upload.club}" rejected.`,
        upload: rejected,
      };
    } catch (err: any) {
      checkAndHandleQuotaError(err);
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.UPDATE, `${UPLOADS_COL}/${uploadId}`);
      }
      throw err;
    }
  },

  async deleteUpload(uploadId: string): Promise<{ success: boolean }> {
    assertCloudWritable();
    try {
      const directRef = doc(db, UPLOADS_COL, uploadId);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        await deleteDoc(directRef);
      } else {
        // Fallback: delete any upload doc matching either Firestore doc ID or stored `id` field
        const allSnap = await getDocs(collection(db, UPLOADS_COL));
        for (const d of allSnap.docs) {
          if (d.id === uploadId || d.data()?.id === uploadId) {
            await deleteDoc(d.ref);
          }
        }
      }
      return { success: true };
    } catch (err: any) {
      checkAndHandleQuotaError(err);
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.DELETE, `${UPLOADS_COL}/${uploadId}`);
      }
      throw err;
    }
  },

  // ----------------------------------------------------
  // OFFICIAL CANDIDATES (GLOBAL REGISTRATION)
  // ----------------------------------------------------

  async saveCandidate(candData: any): Promise<Candidate> {
    assertCloudWritable();
    const now = new Date().toISOString();
    const candName = (candData.name || '').trim().toUpperCase();
    
    // Read existing doc to prevent partial updates from deleting candidate name/club
    let candId = candData.id;
    let existingData: any = {};
    if (candId) {
      try {
        const snap = await getDoc(doc(db, CANDIDATES_COL, candId));
        if (snap.exists()) {
          existingData = snap.data();
        }
      } catch (e) {
        checkAndHandleQuotaError(e);
      }
    } else if (candName) {
      try {
        const snap = await getDocs(collection(db, CANDIDATES_COL));
        snap.forEach((d) => {
          const dData = d.data();
          if ((dData?.name || '').trim().toUpperCase() === candName && !dData.isCancelled && dData.status !== 'cancelled') {
            candId = d.id;
            existingData = dData;
          }
        });
      } catch (e) {
        checkAndHandleQuotaError(e);
      }
    }

    if (!candId) {
      candId = `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }

    const effectiveClub = (candData.club !== undefined && candData.club !== null && String(candData.club).trim() !== '')
      ? String(candData.club).trim().toUpperCase()
      : (existingData.club ? String(existingData.club).trim().toUpperCase() : 'SELF');

    const effectiveFeeStatus = candData.feeStatus !== undefined ? candData.feeStatus : existingData.feeStatus;
    const isFreeStatus = typeof effectiveFeeStatus === 'string' && /free|exempt/i.test(effectiveFeeStatus);

    const candidate: Candidate = {
      ...existingData,
      ...candData,
      ...(isFreeStatus ? { totalFees: 0 } : {}),
      club: effectiveClub,
      id: candId,
      updatedAt: now,
      createdAt: candData.createdAt || existingData.createdAt || now,
      synced: true,
      isDirty: false,
    };

    try {
      await setDoc(doc(db, CANDIDATES_COL, candId), sanitizeForFirestore(candidate), { merge: true });
      return candidate;
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async deleteCandidate(candId: string): Promise<{ success: boolean }> {
    assertCloudWritable();
    try {
      await deleteDoc(doc(db, CANDIDATES_COL, candId));
      return { success: true };
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  // ----------------------------------------------------
  // HEATS & RESULTS
  // ----------------------------------------------------

  async saveHeat(heat: EventHeat): Promise<EventHeat> {
    assertCloudWritable();
    try {
      const heatId = heat.id || `heat_${heat.eventNo}_${heat.heatNumber}_${Date.now()}`;
      const cleanHeat = { ...heat, id: heatId };
      await setDoc(doc(db, HEATS_COL, heatId), sanitizeForFirestore(cleanHeat));
      return cleanHeat;
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async deleteHeat(heatId: string): Promise<{ success: boolean }> {
    assertCloudWritable();
    try {
      await deleteDoc(doc(db, HEATS_COL, heatId));
      return { success: true };
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async saveResult(result: EventResult): Promise<EventResult> {
    assertCloudWritable();
    try {
      const resId = result.id || `res_${result.eventNo}_${Date.now()}`;
      const cleanRes = { ...result, id: resId };
      await setDoc(doc(db, RESULTS_COL, resId), sanitizeForFirestore(cleanRes));
      return cleanRes;
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async deleteResult(idOrEventNo: string): Promise<{ success: boolean }> {
    assertCloudWritable();
    try {
      await deleteDoc(doc(db, RESULTS_COL, idOrEventNo)).catch(() => {});
      await deleteDoc(doc(db, RESULTS_COL, `res_evt_${idOrEventNo}`)).catch(() => {});
      const snap = await getDocs(collection(db, RESULTS_COL));
      for (const d of snap.docs) {
        const dData = d.data() as any;
        if (d.id === idOrEventNo || dData?.id === idOrEventNo || String(dData?.eventNo) === String(idOrEventNo)) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }
      return { success: true };
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  // ----------------------------------------------------
  // EVENTS & CLUBS MANAGEMENT
  // ----------------------------------------------------

  async saveEvent(event: SportEvent): Promise<SportEvent> {
    assertCloudWritable();
    try {
      const docId = getEventDocId(event.Evt_No);
      const sanitized = sanitizeForFirestore({
        ...event,
        Evt_No: Number(event.Evt_No),
        Fees: Number(event.Fees ?? 0),
      });
      await setDoc(doc(db, EVENTS_COL, docId), sanitized, { merge: true });
      // Clean up any legacy non-prefixed document if it exists to eliminate duplicates
      const rawNo = String(event.Evt_No);
      if (docId !== rawNo) {
        deleteDoc(doc(db, EVENTS_COL, rawNo)).catch(() => {});
      }
      return sanitized as SportEvent;
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async saveEventsBulk(events: SportEvent[]): Promise<void> {
    assertCloudWritable();
    for (const evt of events) {
      await this.saveEvent(evt).catch(() => {});
    }
  },

  async deleteEvent(evtNo: number): Promise<void> {
    assertCloudWritable();
    try {
      const docId = getEventDocId(evtNo);
      await deleteDoc(doc(db, EVENTS_COL, docId));
      deleteDoc(doc(db, EVENTS_COL, String(evtNo))).catch(() => {});
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async saveClub(club: Club, options?: { preserveExistingMobileIfEmpty?: boolean }): Promise<Club> {
    assertCloudWritable();
    try {
      const regClub = (club.Reg_Club || club.name || '').trim().toUpperCase();
      if (!regClub) {
        throw new Error('Club name is required');
      }

      // Enforce strict uniqueness by normalized club name across Firestore clubs collection
      const snap = await getDocs(collection(db, CLUBS_COL));
      const matchingDocs: Array<{ id: string; data: any }> = [];
      let maxSl = 0;
      snap.forEach((d) => {
        const raw = d.data() as any;
        const slNum = Number(raw?.Sl) || 0;
        if (slNum > maxSl) maxSl = slNum;
        const dName = String(raw?.Reg_Club || raw?.name || '').trim().toUpperCase();
        if (dName === regClub) {
          matchingDocs.push({ id: d.id, data: raw });
        }
      });

      const canonicalDefaultId = makeCanonicalClubDocId(regClub);
      const preferredDoc =
        matchingDocs.find((m) => m.id === canonicalDefaultId) ||
        matchingDocs.find((m) => club.id && m.id === getClubDocId(club.id)) ||
        matchingDocs[0];

      const docId = preferredDoc?.id || canonicalDefaultId;
      const existingData = preferredDoc?.data || {};
      const existingMob = matchingDocs
        .map((m) => String(m.data?.Mob || m.data?.mobile || m.data?.phone || '').trim())
        .find((m) => m.length > 0) || '';
      const incomingMob = (club.Mob ?? club.mobile ?? '').toString().trim();
      const finalMob = options?.preserveExistingMobileIfEmpty
        ? (incomingMob || existingMob)
        : (club.Mob !== undefined || club.mobile !== undefined ? incomingMob : existingMob);

      const cleanData: Club = {
        id: docId,
        Sl: club.Sl || existingData.Sl || (maxSl + 1),
        Reg_Club: regClub,
        Mob: finalMob,
        Count_1stPlace: Number(club.Count_1stPlace ?? existingData.Count_1stPlace ?? 0) || 0,
        Count_2ndPlace: Number(club.Count_2ndPlace ?? existingData.Count_2ndPlace ?? 0) || 0,
        Count_3rdPlace: Number(club.Count_3rdPlace ?? existingData.Count_3rdPlace ?? 0) || 0,
        TotPoints: Number(club.TotPoints ?? existingData.TotPoints ?? 0) || 0,
        name: regClub,
        mobile: finalMob,
      };
      await setDoc(doc(db, CLUBS_COL, docId), sanitizeForFirestore(cleanData), { merge: true });

      // Remove any duplicate docs for the same club name
      for (const dup of matchingDocs) {
        if (dup.id !== docId) {
          await deleteDoc(doc(db, CLUBS_COL, dup.id)).catch(() => {});
        }
      }

      return cleanData;
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async deleteClub(id: string): Promise<void> {
    assertCloudWritable();
    try {
      const docId = getClubDocId(id);
      await deleteDoc(doc(db, CLUBS_COL, docId)).catch(() => {});
      await deleteDoc(doc(db, CLUBS_COL, String(id))).catch(() => {});
      try {
        const snap = await getDocs(collection(db, CLUBS_COL));
        snap.forEach((d) => {
          const data = d.data();
          const dName = (data.Reg_Club || data.name || '').trim().toUpperCase();
          const target = id.trim().toUpperCase();
          if (d.id === id || dName === target) {
            deleteDoc(doc(db, CLUBS_COL, d.id)).catch(() => {});
          }
        });
      } catch {}
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  // ----------------------------------------------------
  // SETTINGS & PIN MANAGEMENT
  // ----------------------------------------------------

  async saveSettings(settings: Partial<SportsMeetSettings>): Promise<SportsMeetSettings> {
    assertCloudWritable();
    try {
      const docRef = doc(db, SETTINGS_COL, 'meet_settings');
      const existing = await getDoc(docRef);
      const merged: SportsMeetSettings = {
        ...INITIAL_SETTINGS,
        ...(existing.exists() ? (existing.data() as SportsMeetSettings) : {}),
        ...settings,
      };
      await setDoc(docRef, sanitizeForFirestore(merged));
      return merged;
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async getSettings(): Promise<SportsMeetSettings> {
    try {
      const docRef = doc(db, SETTINGS_COL, 'meet_settings');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { ...INITIAL_SETTINGS, ...(snap.data() as SportsMeetSettings) };
      }
    } catch (err) {
      checkAndHandleQuotaError(err);
    }
    return INITIAL_SETTINGS;
  },

  // ----------------------------------------------------
  // MULTI-DEVICE SERVER SESSION LOCK (Cloud Firestore)
  // ----------------------------------------------------

  async getPinLockoutStatus(): Promise<PinLockoutStatus> {
    if (isCloudQuotaExceeded) {
      return readLocalLockoutMirror();
    }
    try {
      const lockoutRef = doc(db, SESSION_COL, PIN_LOCKOUT_DOC_ID);
      let snap;
      try {
        snap = await getDocFromServer(lockoutRef);
      } catch {
        snap = await getDoc(lockoutRef);
      }
      if (snap.exists()) {
        const normalized = normalizePinLockoutData(snap.data());
        writeLocalLockoutMirror({
          failedAttempts: normalized.failedAttempts,
          lockedUntil: normalized.lockedUntil,
        });
        return normalized;
      }
      return { isLocked: false, lockedUntil: null, remainingMs: 0, failedAttempts: 0 };
    } catch (err: any) {
      checkAndHandleQuotaError(err);
      if (err?.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.GET, `${SESSION_COL}/${PIN_LOCKOUT_DOC_ID}`);
      }
      return readLocalLockoutMirror();
    }
  },

  subscribeToPinLockout(callback: (status: PinLockoutStatus) => void): Unsubscribe {
    const lockoutRef = doc(db, SESSION_COL, PIN_LOCKOUT_DOC_ID);
    return onSnapshot(
      lockoutRef,
      (snap) => {
        if (snap.exists()) {
          const normalized = normalizePinLockoutData(snap.data());
          writeLocalLockoutMirror({
            failedAttempts: normalized.failedAttempts,
            lockedUntil: normalized.lockedUntil,
          });
          callback(normalized);
        } else {
          writeLocalLockoutMirror({ failedAttempts: 0, lockedUntil: null });
          callback({ isLocked: false, lockedUntil: null, remainingMs: 0, failedAttempts: 0 });
        }
      },
      (err) => {
        checkAndHandleQuotaError(err);
        if (err?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.GET, `${SESSION_COL}/${PIN_LOCKOUT_DOC_ID}`);
        }
      }
    );
  },

  async verifyPin(pin: string, forceTakeover = false): Promise<{
    success: boolean;
    sessionId?: string;
    deviceId?: string;
    deviceLabel?: string;
    message?: string;
    isAlreadyLoggedIn?: boolean;
    activeDevice?: { label: string; loggedInAt: string; lastActiveAt: string };
  }> {
    const settings = await this.getSettings();
    const correctPin = settings.serverPin || '1234';
    const deviceId = getDeviceId();
    const deviceLabel = getDeviceLabel();
    const lockoutRef = doc(db, SESSION_COL, PIN_LOCKOUT_DOC_ID);
    const isPinMatch = pin.trim() === correctPin.trim();

    // Enforce global 3-attempt -> 10-minute lockout across ALL devices using Firestore transaction
    if (!isCloudQuotaExceeded) {
      let txResult: {
        status: 'locked' | 'just_locked' | 'wrong_pin' | 'ok';
        lockedUntil: number | null;
        failedAttempts: number;
      } | null = null;

      try {
        txResult = await runTransaction(db, async (tx) => {
          const lockSnap = await tx.get(lockoutRef);
          const lockData = lockSnap.exists() ? (lockSnap.data() as any) : null;
          const nowMs = Date.now();
          const nowIso = new Date(nowMs).toISOString();

          const existingLockedUntil = typeof lockData?.lockedUntil === 'number' ? lockData.lockedUntil : null;
          if (existingLockedUntil && nowMs < existingLockedUntil) {
            return {
              status: 'locked',
              lockedUntil: existingLockedUntil,
              failedAttempts: MAX_PIN_ATTEMPTS,
            };
          }

          const currentAttempts = (existingLockedUntil && nowMs >= existingLockedUntil)
            ? 0
            : Number(lockData?.failedAttempts || 0);

          if (!isPinMatch) {
            const nextAttempts = currentAttempts + 1;
            if (nextAttempts >= MAX_PIN_ATTEMPTS) {
              const newLockedUntil = nowMs + PIN_LOCKOUT_DURATION_MS;
              tx.set(lockoutRef, {
                failedAttempts: MAX_PIN_ATTEMPTS,
                lockedUntil: newLockedUntil,
                lastAttemptAt: nowIso,
                lastDeviceLabel: deviceLabel,
              });
              return {
                status: 'just_locked',
                lockedUntil: newLockedUntil,
                failedAttempts: MAX_PIN_ATTEMPTS,
              };
            }
            tx.set(lockoutRef, {
              failedAttempts: nextAttempts,
              lockedUntil: null,
              lastAttemptAt: nowIso,
              lastDeviceLabel: deviceLabel,
            });
            return {
              status: 'wrong_pin',
              lockedUntil: null,
              failedAttempts: nextAttempts,
            };
          }

          // Valid PIN -> clear failed attempts & lockout
          if (currentAttempts > 0 || existingLockedUntil) {
            tx.set(lockoutRef, {
              failedAttempts: 0,
              lockedUntil: null,
              lastAttemptAt: nowIso,
              lastDeviceLabel: deviceLabel,
            });
          }

          return {
            status: 'ok',
            lockedUntil: null,
            failedAttempts: 0,
          };
        });
      } catch (txErr: any) {
        checkAndHandleQuotaError(txErr);
        if (txErr?.code === 'permission-denied') {
          handleFirestoreError(txErr, OperationType.WRITE, `${SESSION_COL}/${PIN_LOCKOUT_DOC_ID}`);
        }
      }

      if (txResult) {
        writeLocalLockoutMirror({
          failedAttempts: txResult.failedAttempts,
          lockedUntil: txResult.lockedUntil,
        });

        if (txResult.status === 'locked' || txResult.status === 'just_locked') {
          const remainingMs = Math.max(0, (txResult.lockedUntil || Date.now()) - Date.now());
          const mins = Math.max(1, Math.ceil(remainingMs / 60000));
          const err: any = new Error(
            txResult.status === 'just_locked'
              ? 'Too many failed attempts (3/3). Server login is locked for 10 minutes across all devices.'
              : `Server login is locked across all devices due to 3 unsuccessful attempts. Try again in ${mins} minute(s).`
          );
          err.isLockedOut = true;
          err.lockedUntil = txResult.lockedUntil;
          err.remainingMs = remainingMs;
          err.failedAttempts = MAX_PIN_ATTEMPTS;
          throw err;
        }

        if (txResult.status === 'wrong_pin') {
          const remainingAttempts = MAX_PIN_ATTEMPTS - txResult.failedAttempts;
          const err: any = new Error(
            `Incorrect Server PIN. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before 10-minute lock.`
          );
          err.isPinRejected = true;
          err.failedAttempts = txResult.failedAttempts;
          err.remainingAttempts = remainingAttempts;
          throw err;
        }
      }
    }

    // Fallback check (if Firestore transaction was skipped due to quota/offline)
    if (!isPinMatch) {
      const localState = readLocalLockoutMirror();
      if (localState.isLocked && localState.lockedUntil) {
        const err: any = new Error('Server login is locked for 10 minutes across all devices.');
        err.isLockedOut = true;
        err.lockedUntil = localState.lockedUntil;
        err.remainingMs = localState.remainingMs;
        err.failedAttempts = MAX_PIN_ATTEMPTS;
        throw err;
      }
      const nextAttempts = localState.failedAttempts + 1;
      if (nextAttempts >= MAX_PIN_ATTEMPTS) {
        const newLockedUntil = Date.now() + PIN_LOCKOUT_DURATION_MS;
        writeLocalLockoutMirror({ failedAttempts: MAX_PIN_ATTEMPTS, lockedUntil: newLockedUntil });
        const err: any = new Error('Too many failed attempts (3/3). Server login is locked for 10 minutes across all devices.');
        err.isLockedOut = true;
        err.lockedUntil = newLockedUntil;
        err.remainingMs = PIN_LOCKOUT_DURATION_MS;
        err.failedAttempts = MAX_PIN_ATTEMPTS;
        throw err;
      }
      writeLocalLockoutMirror({ failedAttempts: nextAttempts, lockedUntil: null });
      const remainingAttempts = MAX_PIN_ATTEMPTS - nextAttempts;
      const err: any = new Error(
        `Incorrect Server PIN. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before 10-minute lock.`
      );
      err.isPinRejected = true;
      err.failedAttempts = nextAttempts;
      err.remainingAttempts = remainingAttempts;
      throw err;
    }

    writeLocalLockoutMirror({ failedAttempts: 0, lockedUntil: null });
    const sessionDocRef = doc(db, SESSION_COL, 'active');
    let sessionSnap: any = null;
    try {
      sessionSnap = await getDoc(sessionDocRef);
    } catch (err) {
      checkAndHandleQuotaError(err);
    }

    const now = new Date().toISOString();
    const INACTIVITY_TIMEOUT = 10 * 60 * 1000;

    if (sessionSnap && sessionSnap.exists()) {
      const active = sessionSnap.data() as any;
      const elapsed = Date.now() - new Date(active.lastActiveAt || active.loggedInAt || 0).getTime();
      const isExpired = elapsed > INACTIVITY_TIMEOUT;
      const isCurrentDevice = active.deviceId === deviceId;

      if (!isExpired && !isCurrentDevice && !forceTakeover) {
        const error: any = new Error(
          `Server session is active on another device: ${active.deviceLabel || 'Other Device'}. You can take over the session to continue.`
        );
        error.isAlreadyLoggedIn = true;
        error.activeDevice = {
          label: active.deviceLabel || 'Other Device',
          loggedInAt: active.loggedInAt,
          lastActiveAt: active.lastActiveAt,
        };
        throw error;
      }
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const newSession = {
      sessionId,
      deviceId,
      deviceLabel,
      loggedInAt: now,
      lastActiveAt: now,
    };

    if (!isCloudQuotaExceeded) {
      try {
        await setDoc(sessionDocRef, sanitizeForFirestore(newSession));
      } catch (err) {
        checkAndHandleQuotaError(err);
      }
    }

    return {
      success: true,
      sessionId,
      deviceId,
      deviceLabel,
      message: forceTakeover
        ? 'Server control acquired! Session taken over from other device.'
        : 'Server PIN Verified. Full administrative control active.',
    };
  },

  async sendHeartbeat(sessionId: string): Promise<{ valid: boolean; reason?: string }> {
    if (isCloudQuotaExceeded) {
      return { valid: true };
    }
    try {
      const deviceId = getDeviceId();
      const sessionDocRef = doc(db, SESSION_COL, 'active');
      const sessionSnap = await getDoc(sessionDocRef);

      if (!sessionSnap.exists()) {
        return { valid: false, reason: 'Server session was ended.' };
      }

      const active = sessionSnap.data() as any;
      if (active.deviceId !== deviceId || (active.sessionId && active.sessionId !== sessionId)) {
        return {
          valid: false,
          reason: `Server control taken over by another device: ${active.deviceLabel || 'Other Device'}.`,
        };
      }

      // Throttle Firestore writes: only update if at least 15 minutes elapsed to preserve free quota
      const lastActiveTime = new Date(active.lastActiveAt || 0).getTime();
      if (Date.now() - lastActiveTime > 15 * 60 * 1000) {
        await setDoc(sessionDocRef, { ...active, lastActiveAt: new Date().toISOString() });
      }
      return { valid: true };
    } catch (err) {
      checkAndHandleQuotaError(err);
      return { valid: true };
    }
  },

  async logoutServer(sessionId?: string): Promise<{ success: boolean }> {
    if (isCloudQuotaExceeded) return { success: true };
    try {
      const sessionDocRef = doc(db, SESSION_COL, 'active');
      await deleteDoc(sessionDocRef);
    } catch (e) {
      checkAndHandleQuotaError(e);
      console.warn('[Firestore] Error logging out session:', e);
    }
    return { success: true };
  },

  async getSessionStatus(): Promise<{
    isServerLoggedIn: boolean;
    isCurrentDevice?: boolean;
    activeDevice?: { label: string; loggedInAt: string; lastActiveAt: string };
  }> {
    try {
      const deviceId = getDeviceId();
      const sessionDocRef = doc(db, SESSION_COL, 'active');
      const sessionSnap = await getDoc(sessionDocRef);

      if (!sessionSnap.exists()) return { isServerLoggedIn: false };
      const active = sessionSnap.data() as any;
      const elapsed = Date.now() - new Date(active.lastActiveAt || active.loggedInAt || 0).getTime();
      if (elapsed > 10 * 60 * 1000) {
        return { isServerLoggedIn: false };
      }

      return {
        isServerLoggedIn: true,
        isCurrentDevice: active.deviceId === deviceId,
        activeDevice: {
          label: active.deviceLabel || 'Other Device',
          loggedInAt: active.loggedInAt,
          lastActiveAt: active.lastActiveAt,
        },
      };
    } catch (err) {
      checkAndHandleQuotaError(err);
      return { isServerLoggedIn: false };
    }
  },

  // ----------------------------------------------------
  // PURGE ALL DATA EXCEPT EVENT LIST MASTER DATA
  // ----------------------------------------------------
  async purgeAllExceptEvents(): Promise<{ success: boolean; deletedCounts: Record<string, number> }> {
    const deletedCounts: Record<string, number> = {
      candidates: 0,
      uploads: 0,
      heats: 0,
      results: 0,
    };

    if (isCloudQuotaExceeded) {
      return { success: true, deletedCounts };
    }

    // 1. Delete all candidates from Firestore
    try {
      const candSnap = await getDocs(collection(db, CANDIDATES_COL));
      for (const d of candSnap.docs) {
        await deleteDoc(d.ref);
        deletedCounts.candidates++;
      }
    } catch (e) {
      checkAndHandleQuotaError(e);
      console.warn('[Firestore] Error deleting candidates:', e);
    }

    // 2. Delete all client uploads from Firestore
    try {
      const uploadSnap = await getDocs(collection(db, UPLOADS_COL));
      for (const d of uploadSnap.docs) {
        await deleteDoc(d.ref);
        deletedCounts.uploads++;
      }
    } catch (e) {
      checkAndHandleQuotaError(e);
      console.warn('[Firestore] Error deleting uploads:', e);
    }

    // 3. Delete all heats from Firestore
    try {
      const heatsSnap = await getDocs(collection(db, HEATS_COL));
      for (const d of heatsSnap.docs) {
        await deleteDoc(d.ref);
        deletedCounts.heats++;
      }
    } catch (e) {
      checkAndHandleQuotaError(e);
      console.warn('[Firestore] Error deleting heats:', e);
    }

    // 4. Delete all results from Firestore
    try {
      const resSnap = await getDocs(collection(db, RESULTS_COL));
      for (const d of resSnap.docs) {
        await deleteDoc(d.ref);
        deletedCounts.results++;
      }
    } catch (e) {
      checkAndHandleQuotaError(e);
      console.warn('[Firestore] Error deleting results:', e);
    }

    // Notice: Events list master data (EVENTS_COL) is strictly preserved!
    return { success: true, deletedCounts };
  },

  // ----------------------------------------------------
  // RESTORE ONLY ATHLETES DATA & EVENT ALLOCATION
  // (Updates candidates, heats, results, clubs; preserves events, settings, uploads)
  // ----------------------------------------------------
  async restoreAthletesData(data: {
    candidates: Candidate[];
    heats: EventHeat[];
    results: EventResult[];
    clubs?: Club[];
  }): Promise<{ success: boolean }> {
    if (isCloudQuotaExceeded) {
      return { success: true };
    }

    const writeBatched = async <T>(items: T[], fn: (item: T) => Promise<void>) => {
      const CHUNK_SIZE = 15;
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        if (isCloudQuotaExceeded) break;
        const slice = items.slice(i, i + CHUNK_SIZE);
        await Promise.all(slice.map(fn));
      }
    };

    try {
      // Clear existing candidates, heats, results, clubs collections in Firestore
      for (const colName of [CANDIDATES_COL, HEATS_COL, RESULTS_COL, CLUBS_COL]) {
        const snap = await getDocs(collection(db, colName));
        await writeBatched(snap.docs, (d) => deleteDoc(d.ref));
      }

      // Write restored candidates
      await writeBatched(data.candidates || [], async (c) => {
        const candId = String(c.id || `cand_chest_${c.chestNo || Date.now()}`);
        await setDoc(doc(db, CANDIDATES_COL, candId), sanitizeForFirestore({ ...c, id: candId }));
      });

      // Write restored heats
      await writeBatched(data.heats || [], async (h) => {
        const heatId = String(h.id || `heat_${h.eventNo}_${h.heatNumber}`);
        await setDoc(doc(db, HEATS_COL, heatId), sanitizeForFirestore({ ...h, id: heatId }));
      });

      // Write restored results
      await writeBatched(data.results || [], async (r) => {
        const resId = String(r.id || `res_${r.eventNo}`);
        await setDoc(doc(db, RESULTS_COL, resId), sanitizeForFirestore({ ...r, id: resId }));
      });

      // Write derived clubs master records (if supplied)
      if (Array.isArray(data.clubs) && data.clubs.length > 0) {
        await writeBatched(data.clubs, async (cl) => {
          const docId = getClubDocId(String(cl.id || cl.Reg_Club || cl.name || Date.now()));
          await setDoc(doc(db, CLUBS_COL, docId), sanitizeForFirestore({ ...cl, id: cl.id || docId }));
        });
      }

      return { success: true };
    } catch (err: any) {
      checkAndHandleQuotaError(err);
      if (err?.code === 'permission-denied' || (err instanceof Error && err.message.toLowerCase().includes('permission'))) {
        handleFirestoreError(err, OperationType.WRITE, CANDIDATES_COL);
      }
      throw err;
    }
  },

  // ----------------------------------------------------
  // LIVE SERVER-FRESH BOOTSTRAP & COLLECTION OPERATIONS
  // ----------------------------------------------------

  async fetchLiveBootstrap(): Promise<{
    events: SportEvent[];
    clubs: Club[];
    settings: SportsMeetSettings;
    heats: EventHeat[];
    results: EventResult[];
    uploads: ClientUpload[];
    candidates: Candidate[];
    source: 'firestore';
  }> {
    const fetchCol = async (colName: string) => {
      try {
        return await getDocsFromServer(collection(db, colName));
      } catch {
        return await getDocs(collection(db, colName));
      }
    };

    const fetchSettingsDoc = async () => {
      const ref = doc(db, SETTINGS_COL, SETTINGS_DOC_ID);
      try {
        return await getDocFromServer(ref);
      } catch {
        return await getDoc(ref);
      }
    };

    const [evtSnap, clubSnap, settingsSnap, heatsSnap, resSnap, uploadsSnap, candSnap] = await Promise.all([
      fetchCol(EVENTS_COL),
      fetchCol(CLUBS_COL),
      fetchSettingsDoc(),
      fetchCol(HEATS_COL),
      fetchCol(RESULTS_COL),
      fetchCol(UPLOADS_COL),
      fetchCol(CANDIDATES_COL),
    ]);

    // 1. Events
    const eventsMap = new Map<number, SportEvent>();
    evtSnap.forEach((d) => {
      const raw = d.data() as SportEvent;
      if (raw && raw.Evt_No !== undefined) {
        const evtNo = Number(raw.Evt_No);
        const isCanonicalDoc = d.id === `evt_${evtNo}`;
        const existing = eventsMap.get(evtNo);
        if (!existing || isCanonicalDoc) {
          eventsMap.set(evtNo, {
            ...raw,
            Evt_No: evtNo,
            Fees: Number(raw.Fees ?? 0),
            requiredHit: raw.requiredHit !== undefined ? raw.requiredHit : (evtNo === 15 ? false : true),
            requiredFinal: raw.requiredFinal !== undefined ? raw.requiredFinal : true,
          });
        }
      }
    });
    const events = Array.from(eventsMap.values()).sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));

    // 2. Clubs
    const clubsMap = new Map<string, Club>();
    clubSnap.forEach((d) => {
      const raw = d.data() as any;
      if (raw && (raw.id || raw.Reg_Club || raw.name)) {
        const regClub = String(raw.Reg_Club || raw.name || '').trim().toUpperCase();
        if (!regClub || regClub === 'SELF') return;
        const clubId = String(raw.id || d.id);
        const mob = (raw.Mob || raw.mobile || raw.phone || '').trim();
        const existing = clubsMap.get(regClub);
        if (!existing) {
          clubsMap.set(regClub, {
            id: clubId,
            Sl: raw.Sl,
            Reg_Club: regClub,
            Mob: mob,
            Count_1stPlace: Number(raw.Count_1stPlace) || 0,
            Count_2ndPlace: Number(raw.Count_2ndPlace) || 0,
            Count_3rdPlace: Number(raw.Count_3rdPlace) || 0,
            TotPoints: Number(raw.TotPoints) || 0,
            name: regClub,
            mobile: mob,
          });
        } else {
          const existingMob = (existing.Mob || existing.mobile || '').trim();
          const canonicalId = makeCanonicalClubDocId(regClub);
          clubsMap.set(regClub, {
            id: d.id === canonicalId ? canonicalId : existing.id,
            Sl: existing.Sl || raw.Sl,
            Reg_Club: regClub,
            Mob: mob || existingMob,
            Count_1stPlace: Math.max(Number(existing.Count_1stPlace) || 0, Number(raw.Count_1stPlace) || 0),
            Count_2ndPlace: Math.max(Number(existing.Count_2ndPlace) || 0, Number(raw.Count_2ndPlace) || 0),
            Count_3rdPlace: Math.max(Number(existing.Count_3rdPlace) || 0, Number(raw.Count_3rdPlace) || 0),
            TotPoints: Math.max(Number(existing.TotPoints) || 0, Number(raw.TotPoints) || 0),
            name: regClub,
            mobile: mob || existingMob,
          });
        }
      }
    });
    const clubs = Array.from(clubsMap.values()).map((c, idx) => ({ ...c, Sl: c.Sl || idx + 1 }));

    // 3. Settings
    const settings: SportsMeetSettings = settingsSnap.exists()
      ? { ...INITIAL_SETTINGS, ...(settingsSnap.data() as SportsMeetSettings) }
      : INITIAL_SETTINGS;

    // 4. Heats
    const heats: EventHeat[] = [];
    heatsSnap.forEach((d) => heats.push({ id: d.id, ...(d.data() as any) }));

    // 5. Results
    const results: EventResult[] = [];
    resSnap.forEach((d) => results.push({ id: d.id, ...(d.data() as any) }));

    // 6. Uploads
    const uploads: ClientUpload[] = [];
    uploadsSnap.forEach((d) => uploads.push({ ...(d.data() as any), id: d.id }));
    uploads.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());

    // 7. Candidates
    const candidates: Candidate[] = [];
    candSnap.forEach((d) => candidates.push({ id: d.id, ...(d.data() as any) }));
    candidates.sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));

    return {
      events,
      clubs,
      settings,
      heats,
      results,
      uploads,
      candidates,
      source: 'firestore',
    };
  },

  async clearCollection(table: 'candidates' | 'events' | 'clubs' | 'heats' | 'results' | 'clientUploads' | 'uploads'): Promise<number> {
    assertCloudWritable();
    const colName = table === 'clientUploads' ? UPLOADS_COL : table;
    let deleted = 0;
    try {
      const snap = await getDocs(collection(db, colName));
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 20) {
        if (isCloudQuotaExceeded) break;
        const batch = docs.slice(i, i + 20);
        await Promise.all(batch.map((d) => deleteDoc(d.ref)));
        deleted += batch.length;
      }
      return deleted;
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async replaceCollection(
    table: 'candidates' | 'events' | 'clubs' | 'heats' | 'results' | 'clientUploads' | 'uploads',
    items: any[]
  ): Promise<void> {
    assertCloudWritable();
    const colName = table === 'clientUploads' ? UPLOADS_COL : table;
    try {
      await this.clearCollection(table);
      const list = Array.isArray(items) ? items : [];
      for (let i = 0; i < list.length; i += 15) {
        if (isCloudQuotaExceeded) break;
        const slice = list.slice(i, i + 15);
        await Promise.all(
          slice.map(async (item: any, idx: number) => {
            let docId: string;
            let payload = { ...item };
            if (colName === EVENTS_COL) {
              const evtNo = Number(item.Evt_No ?? idx);
              docId = getEventDocId(evtNo);
              payload = { ...item, Evt_No: evtNo, Fees: Number(item.Fees ?? 0) };
            } else if (colName === CLUBS_COL) {
              const regName = String(item.Reg_Club || item.name || '').trim().toUpperCase();
              docId = item.id ? getClubDocId(String(item.id)) : makeCanonicalClubDocId(regName || String(idx));
              payload = { ...item, id: docId, ...(regName ? { Reg_Club: regName, name: regName } : {}) };
            } else if (colName === RESULTS_COL) {
              docId = String(item.id || `res_evt_${item.eventNo ?? idx}`);
              payload = { ...item, id: docId };
            } else if (colName === HEATS_COL) {
              docId = String(item.id || `heat_${item.eventNo ?? 0}_${item.heatNumber ?? idx}`);
              payload = { ...item, id: docId };
            } else {
              docId = String(item.id || `${colName}_${Date.now()}_${i + idx}`);
              payload = { ...item, id: docId };
            }
            await setDoc(doc(db, colName, docId), sanitizeForFirestore(payload));
          })
        );
      }
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async resetToDefaults(): Promise<void> {
    assertCloudWritable();
    try {
      await Promise.all([
        this.clearCollection('candidates'),
        this.clearCollection('clubs'),
        this.clearCollection('heats'),
        this.clearCollection('results'),
        this.clearCollection('uploads'),
      ]);
      await this.replaceCollection('events', INITIAL_EVENTS);
      await setDoc(doc(db, SETTINGS_COL, SETTINGS_DOC_ID), sanitizeForFirestore(INITIAL_SETTINGS));
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async deleteUploadCandidateGlobally(candId: string): Promise<void> {
    assertCloudWritable();
    try {
      const snap = await getDocs(collection(db, UPLOADS_COL));
      for (const d of snap.docs) {
        const upload = d.data() as ClientUpload;
        if (upload.status === 'pending' && Array.isArray(upload.candidates)) {
          const nextCands = upload.candidates.filter((c) => c.id !== candId);
          if (nextCands.length !== upload.candidates.length) {
            if (nextCands.length === 0) {
              await deleteDoc(d.ref);
            } else {
              const totalFees = nextCands.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0);
              await setDoc(d.ref, sanitizeForFirestore({ ...upload, candidates: nextCands, totalFees }));
            }
          }
        }
      }
    } catch (err) {
      checkAndHandleQuotaError(err);
    }
  },
};

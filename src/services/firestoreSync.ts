import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
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
        items.push({ id: d.id, ...(d.data() as any) });
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
        callback(INITIAL_EVENTS);
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
          const regClub = String(raw.Reg_Club || raw.name || '').trim();
          if (!regClub || regClub.toUpperCase() === 'SELF') return;
          const clubId = String(raw.id || d.id);
          const cleanClub: Club = {
            id: clubId,
            Sl: raw.Sl,
            Reg_Club: regClub,
            Mob: (raw.Mob || raw.mobile || raw.phone || '').trim(),
            Count_1stPlace: Number(raw.Count_1stPlace) || 0,
            Count_2ndPlace: Number(raw.Count_2ndPlace) || 0,
            Count_3rdPlace: Number(raw.Count_3rdPlace) || 0,
            TotPoints: Number(raw.TotPoints) || 0,
            name: regClub,
            mobile: (raw.Mob || raw.mobile || raw.phone || '').trim(),
          };
          itemsMap.set(clubId, cleanClub);
        }
      });
      callback(Array.from(itemsMap.values()));
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
          clientName: data.clientName || existing.clientName || '',
          notes: data.notes || existing.notes || '',
          candidates: updatedCandidates,
          totalFees: updatedCandidates.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0),
        };

        await setDoc(doc(db, UPLOADS_COL, (existingDoc as any).id), sanitizeForFirestore(updatedBatch));

        if (data.clubMobile && targetClub && targetClub !== 'Independent' && targetClub !== 'Independent / Unattached') {
          const clubDocId = getClubDocId(`club_${targetClub.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
          setDoc(doc(db, CLUBS_COL, clubDocId), sanitizeForFirestore({
            id: clubDocId,
            name: targetClub,
            mobile: data.clubMobile.trim(),
            phone: data.clubMobile.trim(),
          }), { merge: true }).catch(() => {});
        }

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
          clientName: data.clientName || '',
          uploadedAt: now,
          status: 'pending',
          candidates: processedCandidates as any,
          totalFees: Number(data.totalFees) || processedCandidates.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0),
          notes: data.notes || '',
        };

        await setDoc(doc(db, UPLOADS_COL, uploadId), sanitizeForFirestore(newUpload));

        if (data.clubMobile && targetClub && targetClub !== 'Independent' && targetClub !== 'Independent / Unattached') {
          const clubDocId = getClubDocId(`club_${targetClub.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
          setDoc(doc(db, CLUBS_COL, clubDocId), sanitizeForFirestore({
            id: clubDocId,
            name: targetClub,
            mobile: data.clubMobile.trim(),
            phone: data.clubMobile.trim(),
          }), { merge: true }).catch(() => {});
        }

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
      }

      const mergedUpload: ClientUpload = {
        ...upload,
        status: 'merged',
        mergedAt: now,
        reviewedAt: now,
        candidates: updatedCandidates,
      };

      await setDoc(uploadRef, sanitizeForFirestore(mergedUpload));

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
      const uploadRef = doc(db, UPLOADS_COL, uploadId);
      const snap = await getDoc(uploadRef);
      if (!snap.exists()) throw new Error('Upload batch not found');

      const upload = snap.data() as ClientUpload;
      const rejected: ClientUpload = {
        ...upload,
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
    } catch (err) {
      checkAndHandleQuotaError(err);
      throw err;
    }
  },

  async deleteUpload(uploadId: string): Promise<{ success: boolean }> {
    assertCloudWritable();
    try {
      await deleteDoc(doc(db, UPLOADS_COL, uploadId));
      return { success: true };
    } catch (err) {
      checkAndHandleQuotaError(err);
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

    const candidate: Candidate = {
      ...existingData,
      ...candData,
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

  async saveClub(club: Club): Promise<Club> {
    assertCloudWritable();
    try {
      const regClub = (club.Reg_Club || club.name || '').trim();
      const docId = getClubDocId(club.id || `club_${regClub.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
      const cleanData: Club = {
        id: club.id || docId,
        Sl: club.Sl,
        Reg_Club: regClub,
        Mob: (club.Mob || club.mobile || '').trim(),
        Count_1stPlace: Number(club.Count_1stPlace) || 0,
        Count_2ndPlace: Number(club.Count_2ndPlace) || 0,
        Count_3rdPlace: Number(club.Count_3rdPlace) || 0,
        TotPoints: Number(club.TotPoints) || 0,
        name: regClub,
        mobile: (club.Mob || club.mobile || '').trim(),
      };
      await setDoc(doc(db, CLUBS_COL, docId), sanitizeForFirestore(cleanData), { merge: true });
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

    if (pin.trim() !== correctPin.trim()) {
      throw new Error('Incorrect Server PIN. Default is 1234.');
    }

    const deviceId = getDeviceId();
    const deviceLabel = getDeviceLabel();
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
  }
};

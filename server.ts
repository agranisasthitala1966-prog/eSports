import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import * as XLSX from 'xlsx';

const app = express();
// AI Studio multi-container architecture: Nginx runs on 8080 and proxies traffic to app-container on 3000.
// PORT must be 3000 regardless of process.env.PORT (which Cloud Run sets to 8080 for Nginx).
const PORT = 3000;

process.on('uncaughtException', (err) => {
  console.error('[SERVER UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER UNHANDLED REJECTION]:', reason);
});

// Enable CORS and iframe embedding in AI Studio preview
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

// Never cache API responses across devices (ensures desktop/mobile always receive latest data)
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ----------------------------------------------------
// MULTI-DEVICE SERVER LOGIN RESTRICTION & SESSION MANAGEMENT
// ----------------------------------------------------
interface ServerSession {
  sessionId: string;
  deviceId: string;
  deviceLabel: string;
  ip?: string;
  loggedInAt: string;
  lastActiveAt: string;
}

let activeServerSession: ServerSession | null = null;
const SESSION_INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutes timeout if no heartbeat

function getValidActiveSession(): ServerSession | null {
  if (!activeServerSession) return null;
  const elapsed = Date.now() - new Date(activeServerSession.lastActiveAt).getTime();
  if (elapsed > SESSION_INACTIVITY_LIMIT_MS) {
    console.log(`[AUTH] Active server session ${activeServerSession.sessionId} expired due to inactivity (${Math.round(elapsed / 1000)}s)`);
    activeServerSession = null;
    return null;
  }
  return activeServerSession;
}

// Initial data definition
const DEFAULT_EVENTS = [
  { Evt_No: 0, Evt_Name: '50M SPRINT', Height: '3`-4``', Gender: 'CHILDRENS', Fees: 0.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 1, Evt_Name: '50 MTS. RUN', Height: '3`-8``', Gender: 'CHILDRENS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 2, Evt_Name: 'KANAMACHHI', Height: '3`-8``', Gender: 'CHILDRENS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 3, Evt_Name: '100 MTS. RUN', Height: '4`-2``', Gender: 'BOYS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 4, Evt_Name: 'POTATO RACE', Height: '4`-2``', Gender: 'BOYS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 5, Evt_Name: '200 MTS. RUN', Height: '4`-6``', Gender: 'BOYS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 6, Evt_Name: 'BROAD JUMP', Height: '4`-6``', Gender: 'BOYS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 7, Evt_Name: '200 MTS. RUN', Height: '4`-10``', Gender: 'BOYS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 8, Evt_Name: 'BROAD JUMP', Height: '4`-10``', Gender: 'BOYS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 9, Evt_Name: '100 MTS. RUN', Height: '4`-2``', Gender: 'GIRLS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 10, Evt_Name: 'POTATO RACE', Height: '4`-2``', Gender: 'GIRLS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 11, Evt_Name: '200 MTS. RUN', Height: '4`-6``', Gender: 'GIRLS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 12, Evt_Name: 'BROAD JUMP', Height: '4`-6``', Gender: 'GIRLS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 13, Evt_Name: '200 MTS. RUN', Height: '4`-10``', Gender: 'GIRLS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 14, Evt_Name: 'BROAD JUMP', Height: '4`-10``', Gender: 'GIRLS', Fees: 10.0, requiredHit: true, requiredFinal: true },
  { Evt_No: 15, Evt_Name: 'GO AS YOU LIKE', Height: 'ALL', Gender: 'ALL', Fees: 20.0, requiredHit: false, requiredFinal: true },
];

const DEFAULT_CLUBS: any[] = [];


const DEFAULT_SETTINGS = {
  ordinalTitle: '47th Annual Sports Meet 2027',
  organizer: 'Agrani Sasthitala Sports & Welfare Committee',
  venue: 'Sasthitala Central Stadium & Sports Complex',
  dates: '24th & 25th January 2027',
  president: 'Dr. B. K. Sengupta',
  secretary: 'Shri Tapas Ghosh',
  currencySymbol: '₹',
  autoChestStart: 101,
  serverPin: '1234',
};

const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

// Memory DB with persistence
interface DBData {
  events: any[];
  candidates: any[];
  clubs: any[];
  results: any[];
  heats: any[];
  settings: any;
  clientUploads: any[];
  lastUpdated: string;
}

let db: DBData = {
  events: [...DEFAULT_EVENTS],
  candidates: [],
  clubs: [...DEFAULT_CLUBS],
  results: [],
  heats: [],
  settings: { ...DEFAULT_SETTINGS },
  clientUploads: [],
  lastUpdated: new Date().toISOString(),
};

// Helper: Builds a canonical server candidate record with exact server columns
// Discards all temporary/client-side fields (localRecordNo, provisionalChestNo, status, merged, uploadedAt, etc.)
function toServerCandidateRecord(cand: any, assignedChestNo: number, existing?: any): any {
  const now = new Date().toISOString();
  const rawClub = (cand.club !== undefined && cand.club !== null && cand.club.trim() !== '') 
    ? cand.club.trim().toUpperCase() 
    : (existing?.club ? existing.club.trim().toUpperCase() : 'SELF');
  const record: any = {
    id: cand.id || existing?.id || `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    chestNo: Number(assignedChestNo),
    name: (cand.name || existing?.name || '').trim().toUpperCase(),
    club: rawClub || 'SELF',
    gender: cand.gender || existing?.gender || 'ALL',
    height: cand.height || existing?.height || 'ALL',
    selectedEvents: Array.isArray(cand.selectedEvents)
      ? cand.selectedEvents.map(Number)
      : (Array.isArray(existing?.selectedEvents) ? existing.selectedEvents.map(Number) : []),
    totalFees: Number(cand.totalFees !== undefined ? cand.totalFees : existing?.totalFees) || 0,
    mob: (cand.mob || cand.mobile || cand.clubMobile || existing?.mob || existing?.mobile || '').toString().trim(),
    createdAt: existing?.createdAt || cand.createdAt || now,
    updatedAt: now,
    synced: true,
    isDirty: false,
    syncedAt: now,
  };

  const feeStatus = cand.feeStatus || existing?.feeStatus;
  if (feeStatus) {
    record.feeStatus = feeStatus;
  }

  if (cand.isCancelled || existing?.isCancelled || cand.status === 'cancelled' || existing?.status === 'cancelled') {
    record.isCancelled = true;
    record.cancelledAt = cand.cancelledAt || existing?.cancelledAt || now;
  }

  // Explicitly discard client-side temporary fields
  delete record.localRecordNo;
  delete record.provisionalChestNo;
  delete record.status;
  delete record.merged;
  delete record.uploadedAt;
  delete record.clientName;
  delete record.notes;

  return record;
}

// Master Clubs table logic:
// Extract unique club names with mobile number (if available) from already enrolled candidate table.
// Columns: Sl, Reg_Club, Mob, Count_1stPlace, Count_2ndPlace, Count_3rdPlace, TotPoints.
// Count_1stPlace: number of candidate stood first place for a particular club
// Count_2ndPlace / Count_3rdPlace: stood 2nd and 3rd place respectively
// TotPoints: Count_1stPlace * 7 + Count_2ndPlace * 5 + Count_3rdPlace * 4 (exclude 'SELF')
// Eliminates: shortcode, phone, contactperson, address, logoUrl, logoUrl__part2
function syncClubMasterRecords(forceRebuild = false) {
  // 1. Extract unique club names from already enrolled candidate table
  const candidateClubMap = new Map<string, { regClub: string; mob: string }>();

  (db.candidates || []).forEach((c: any) => {
    let clubName = (c.club || '').trim();
    if (!clubName) {
      c.club = 'SELF';
      clubName = 'SELF';
    }
    const cleanKey = clubName.toUpperCase();
    const candidateMob = (c.mob || c.mobile || c.clubMobile || '').toString().trim();
    if (!candidateClubMap.has(cleanKey)) {
      candidateClubMap.set(cleanKey, { regClub: clubName.toUpperCase(), mob: candidateMob });
    } else if (!candidateClubMap.get(cleanKey)!.mob && candidateMob) {
      candidateClubMap.get(cleanKey)!.mob = candidateMob;
    }
  });

  // Client uploads check for club mobile
  (db.clientUploads || []).forEach((u: any) => {
    const uClub = (u.club || '').trim().toUpperCase();
    if (uClub && u.clubMobile) {
      const mob = String(u.clubMobile).trim();
      if (candidateClubMap.has(uClub) && !candidateClubMap.get(uClub)!.mob) {
        candidateClubMap.get(uClub)!.mob = mob;
      }
    }
  });

  // Settings registered club check
  if (db.settings?.registeredClubName && db.settings?.registeredClubPhone) {
    const sClub = String(db.settings.registeredClubName).trim().toUpperCase();
    const sMob = String(db.settings.registeredClubPhone).trim();
    if (candidateClubMap.has(sClub) && !candidateClubMap.get(sClub)!.mob) {
      candidateClubMap.get(sClub)!.mob = sMob;
    }
  }

  // 2. Count 1st, 2nd, 3rd places across completed events
  const podiumCounts = new Map<string, { count1: number; count2: number; count3: number }>();

  (db.results || []).forEach((r: any) => {
    const list = (r.winners && r.winners.length > 0) ? r.winners : (r.finalists || []);
    list.forEach((p: any) => {
      const pClub = (p.club || '').trim().toUpperCase();
      if (!pClub) return;
      if (!podiumCounts.has(pClub)) {
        podiumCounts.set(pClub, { count1: 0, count2: 0, count3: 0 });
      }
      const item = podiumCounts.get(pClub)!;
      const pos = Number(p.position);
      if (pos === 1) item.count1 += 1;
      else if (pos === 2) item.count2 += 1;
      else if (pos === 3) item.count3 += 1;
    });
  });

  // 3. Existing clubs map to preserve custom edited Mob or stable id
  const existingMap = new Map<string, any>();
  (db.clubs || []).forEach((c: any) => {
    const key = (c.Reg_Club || c.name || '').trim().toUpperCase();
    if (key) {
      existingMap.set(key, c);
    }
  });

  const nextClubs: any[] = [];
  let sl = 1;

  candidateClubMap.forEach((entry, cleanKey) => {
    const existing = existingMap.get(cleanKey);
    const id = existing?.id || `club_${cleanKey.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const mob = (existing?.Mob || existing?.mobile || entry.mob || '').toString().trim();
    const counts = podiumCounts.get(cleanKey) || { count1: 0, count2: 0, count3: 0 };
    const isSelf = cleanKey === 'SELF';
    const count1st = counts.count1;
    const count2nd = counts.count2;
    const count3rd = counts.count3;
    const totPoints = isSelf ? 0 : (count1st * 7 + count2nd * 5 + count3rd * 4);

    nextClubs.push({
      id,
      Sl: sl++,
      Reg_Club: entry.regClub,
      Mob: mob,
      Count_1stPlace: count1st,
      Count_2ndPlace: count2nd,
      Count_3rdPlace: count3rd,
      TotPoints: totPoints,
      name: entry.regClub, // compatibility alias
      mobile: mob,        // compatibility alias
    });
  });

  db.clubs = nextClubs;
}

// Ensure data directory and load existing db if available
function loadDB() {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      
      // Deduplicate candidates by ID and normalized name in case any duplicate was written
      const rawCandidates = parsed.candidates || [];
      const seenNames = new Set<string>();
      const seenIds = new Set<string>();
      const uniqueCandidates: any[] = [];
      rawCandidates.forEach((cand: any) => {
        if (!cand) return;
        const id = cand.id ? String(cand.id).trim() : '';
        if (id && seenIds.has(id)) return;
        if (id) seenIds.add(id);

        const name = (cand.name || '').trim().toUpperCase();
        const isCancelled = cand.isCancelled || cand.status === 'cancelled';
        if (!isCancelled && name) {
          if (seenNames.has(name)) return;
          seenNames.add(name);
        }
        uniqueCandidates.push(cand);
      });
      const sanitizedCandidates = uniqueCandidates.map((c: any) => {
        const chest = Number(c.chestNo) || 101;
        return toServerCandidateRecord(c, chest, c);
      });

      const loadedEvents = (parsed.events || [...DEFAULT_EVENTS]).map((e: any) => ({
        ...e,
        requiredHit: e.requiredHit !== undefined ? e.requiredHit : (e.Evt_No === 15 ? false : true),
        requiredFinal: e.requiredFinal !== undefined ? e.requiredFinal : true,
      }));

      const defaultBroadJumpRecords = {
        6: {
          eventNo: 6,
          eventName: 'BROAD JUMP',
          gender: 'BOYS',
          height: "4'-6\"",
          recordHolderName: 'Sourav Mondal',
          recordHolderClub: 'Milan Samity Athletic Club',
          recordYear: '2025',
          recordValue: `14'-05"`,
        },
        8: {
          eventNo: 8,
          eventName: 'BROAD JUMP',
          gender: 'BOYS',
          height: "4'-10\"",
          recordHolderName: 'Rahul Ghosh',
          recordHolderClub: 'Agrani Sasthitala Sangha',
          recordYear: '2024',
          recordValue: `16'-02"`,
        },
        12: {
          eventNo: 12,
          eventName: 'BROAD JUMP',
          gender: 'GIRLS',
          height: "4'-6\"",
          recordHolderName: 'Priya Mukherjee',
          recordHolderClub: 'Tarun Sangha Sports Club',
          recordYear: '2025',
          recordValue: `13'-08"`,
        },
        14: {
          eventNo: 14,
          eventName: 'BROAD JUMP',
          gender: 'GIRLS',
          height: "4'-10\"",
          recordHolderName: 'Tanushree Das',
          recordHolderClub: 'Subhash Nagar Yuba Parishad',
          recordYear: '2025',
          recordValue: `14'-09"`,
        },
      };

      const mergedSettings = {
        ...DEFAULT_SETTINGS,
        broadJumpPreviousRecords: defaultBroadJumpRecords,
        ...(parsed.settings || {}),
      };
      if (!mergedSettings.broadJumpPreviousRecords) {
        mergedSettings.broadJumpPreviousRecords = defaultBroadJumpRecords;
      }

      db = {
        events: loadedEvents,
        candidates: sanitizedCandidates,
        clubs: [],
        results: parsed.results || [],
        heats: parsed.heats || [],
        settings: mergedSettings,
        clientUploads: parsed.clientUploads || [],
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
      };
      syncClubMasterRecords(true);
      console.log(`[DB] Loaded ${db.candidates.length} candidates, ${db.clubs.length} clubs, ${db.clientUploads.length} client uploads, ${db.events.length} events.`);
    } else {
      saveDB();
    }
  } catch (err) {
    console.error('[DB] Failed to load DB file, using default in-memory state', err);
  }
}


// Live SSE (Server-Sent Events) clients for instantaneous push to desktop and mobile clients
const sseClients: Response[] = [];

function broadcastDBUpdate(table = 'all') {
  const payload = JSON.stringify({
    type: 'db_updated',
    table,
    lastUpdated: db.lastUpdated,
    serverTime: new Date().toISOString(),
  });
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(`data: ${payload}\n\n`);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

const QUOTA_FILE = path.join(process.cwd(), 'data', '.quota_exceeded.json');
let isCloudQuotaExceeded = false;

// Check if quota was marked exceeded today
try {
  if (fs.existsSync(QUOTA_FILE)) {
    const raw = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
    const recordedAt = new Date(raw.timestamp || 0);
    const now = new Date();
    if (
      recordedAt.getUTCFullYear() === now.getUTCFullYear() &&
      recordedAt.getUTCMonth() === now.getUTCMonth() &&
      recordedAt.getUTCDate() === now.getUTCDate()
    ) {
      isCloudQuotaExceeded = !!raw.exceeded;
      if (isCloudQuotaExceeded) {
        console.warn('[Firestore Quota] Initialized with daily write quota limit reached from disk. Pausing Cloud writes.');
      }
    }
  }
} catch {}

function setCloudQuotaExceeded(exceeded = true) {
  if (isCloudQuotaExceeded !== exceeded) {
    isCloudQuotaExceeded = exceeded;
    try {
      const dir = path.dirname(QUOTA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(QUOTA_FILE, JSON.stringify({
        exceeded,
        timestamp: new Date().toISOString(),
        reason: 'Free daily write units per project quota exceeded',
      }), 'utf8');
    } catch {}
  }
}

function handleCloudError(err: any, context: string) {
  const errMsg = err?.message || String(err);
  const errCode = err?.code || '';
  if (
    errCode === 'resource-exhausted' ||
    errMsg.includes('Quota') ||
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('Free daily write units')
  ) {
    setCloudQuotaExceeded(true);
    console.warn(`[Firestore Quota] ${context}: Daily write quota limit reached. Pausing Cloud Firestore writes. Local DB remains primary and active.`);
  } else {
    console.warn(`[Firestore] ${context} notice:`, err);
  }
}

// Local DB write only without triggering any Cloud Firestore reflections
function saveDBLocalOnly(table = 'all') {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    broadcastDBUpdate(table);
  } catch (err) {
    console.error('[DB] Failed to save DB to disk', err);
  }
}

function saveDB(table = 'all') {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    broadcastDBUpdate(table);

    // Synchronously commit updates to Firestore if cloud is connected and within quota limits
    if (cloudDb && !isCloudQuotaExceeded) {
      if (table === 'events') {
        (async () => {
          try {
            for (const evt of db.events) {
              const docId = `evt_${evt.Evt_No}`;
              await setDoc(doc(cloudDb, 'events', docId), sanitizeData({
                ...evt,
                Evt_No: Number(evt.Evt_No),
                Fees: Number(evt.Fees ?? 0),
              }), { merge: true });
            }
          } catch (e) {
            handleCloudError(e, 'saveDB events sync');
          }
        })();
      }
      if (table === 'clubs') {
        (async () => {
          try {
            for (const club of db.clubs) {
              const docId = club.id ? (club.id.startsWith('club_') ? club.id : `club_${club.id}`) : `club_${Date.now()}`;
              await setDoc(doc(cloudDb, 'clubs', docId), sanitizeData({
                id: docId,
                Sl: Number(club.Sl || 1),
                Reg_Club: (club.Reg_Club || club.name || '').trim().toUpperCase(),
                Mob: (club.Mob || club.mobile || '').toString().trim(),
                Count_1stPlace: Number(club.Count_1stPlace || 0),
                Count_2ndPlace: Number(club.Count_2ndPlace || 0),
                Count_3rdPlace: Number(club.Count_3rdPlace || 0),
                TotPoints: Number(club.TotPoints || 0),
                name: (club.Reg_Club || club.name || '').trim().toUpperCase(),
                mobile: (club.Mob || club.mobile || '').toString().trim(),
              }), { merge: true });
            }
          } catch (e) {
            handleCloudError(e, 'saveDB clubs sync');
          }
        })();
      }
      if (table === 'settings') {
        (async () => {
          try {
            await setDoc(doc(cloudDb, 'settings', 'meet_settings'), sanitizeData(db.settings), { merge: true });
          } catch (e) {
            handleCloudError(e, 'saveDB settings sync');
          }
        })();
      }
    }
  } catch (err) {
    console.error('[DB] Failed to save DB to disk', err);
  }
}

loadDB();

// ----------------------------------------------------
// CLOUD FIRESTORE SYNCHRONIZATION (Global Persistent Master DB)
// ----------------------------------------------------
let cloudDb: any = null;

try {
  const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(firebaseConfigPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    cloudDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || '(default)');
    console.log('[eSports] Connected to Cloud Firestore database:', firebaseConfig.firestoreDatabaseId);
  }
} catch (err) {
  console.warn('[eSports] Cloud Firestore init warning:', err);
}

// Clean object for Firestore writes (remove undefined)
function sanitizeData(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeData);
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        clean[k] = sanitizeData(v);
      }
    }
    return clean;
  }
  return obj;
}

// Pull live data from Cloud Firestore on startup
async function syncFromFirestore() {
  if (!cloudDb) return;
  try {
    // 1. Events
    const evtSnap = await getDocs(collection(cloudDb, 'events'));
    if (!evtSnap.empty) {
      const itemsMap = new Map<number, any>();
      evtSnap.forEach((d) => {
        const data = d.data();
        if (data && data.Evt_No !== undefined) {
          const evtNo = Number(data.Evt_No);
          itemsMap.set(evtNo, {
            ...data,
            Evt_No: evtNo,
            Fees: Number(data.Fees ?? 0),
            requiredHit: data.requiredHit !== undefined ? data.requiredHit : (evtNo === 15 ? false : true),
            requiredFinal: data.requiredFinal !== undefined ? data.requiredFinal : true,
          });
        }
      });
      if (itemsMap.size > 0) {
        db.events = Array.from(itemsMap.values()).sort((a, b) => a.Evt_No - b.Evt_No);
      }
    }

    // 2. Clubs
    const clubSnap = await getDocs(collection(cloudDb, 'clubs'));
    if (!clubSnap.empty) {
      const itemsMap = new Map<string, any>();
      clubSnap.forEach((d) => {
        const data = d.data();
        if (data && (data.Reg_Club || data.name)) {
          const regName = String(data.Reg_Club || data.name).trim().toUpperCase();
          const isDummy = ['AGRANI SASTHITALA SANGHA', 'MILAN SAMITY ATHLETIC CLUB', 'TARUN SANGHA SPORTS CLUB', 'SUBHASH NAGAR YUBA PARISHAD', 'INDEPENDENT / UNATTACHED'].includes(regName) && !db.candidates.some(c => (c.club || '').trim().toUpperCase() === regName);
          if (!isDummy) {
            const id = String(data.id || d.id);
            itemsMap.set(id, {
              id,
              Sl: Number(data.Sl) || 1,
              Reg_Club: data.Reg_Club || data.name,
              Mob: (data.Mob || data.mobile || data.phone || '').trim(),
              Count_1stPlace: Number(data.Count_1stPlace || 0),
              Count_2ndPlace: Number(data.Count_2ndPlace || 0),
              Count_3rdPlace: Number(data.Count_3rdPlace || 0),
              TotPoints: Number(data.TotPoints || 0),
              name: data.Reg_Club || data.name,
              mobile: (data.Mob || data.mobile || data.phone || '').trim(),
            });
          } else {
            deleteDoc(doc(cloudDb, 'clubs', d.id)).catch(() => {});
          }
        }
      });
      if (itemsMap.size > 0) db.clubs = Array.from(itemsMap.values());
    }

    // 3. Settings
    const settingsSnap = await getDocs(collection(cloudDb, 'settings'));
    if (!settingsSnap.empty) {
      settingsSnap.forEach((d) => {
        if (d.id === 'meet_settings') {
          db.settings = { ...DEFAULT_SETTINGS, ...d.data() };
        }
      });
    }

    // 4. Candidates
    const candSnap = await getDocs(collection(cloudDb, 'candidates'));
    if (!candSnap.empty) {
      const items: any[] = [];
      const seenNames = new Set<string>();
      const seenIds = new Set<string>();
      candSnap.forEach((d) => {
        const data = d.data();
        if (!data) return;
        const id = data.id || d.id;
        if (id && seenIds.has(id)) return;
        if (id) seenIds.add(id);

        const name = (data.name || '').trim().toUpperCase();
        const isCancelled = data.isCancelled || data.status === 'cancelled';
        if (!isCancelled && name) {
          if (seenNames.has(name)) return;
          seenNames.add(name);
        }
        items.push({ ...data, id });
      });
      if (items.length > 0) db.candidates = items;
    }

    // 5. Heats
    const heatsSnap = await getDocs(collection(cloudDb, 'heats'));
    if (!heatsSnap.empty) {
      const items: any[] = [];
      heatsSnap.forEach((d) => items.push(d.data()));
      if (items.length > 0) db.heats = items;
    }

    // 6. Results
    const resSnap = await getDocs(collection(cloudDb, 'results'));
    if (!resSnap.empty) {
      const items: any[] = [];
      resSnap.forEach((d) => items.push(d.data()));
      if (items.length > 0) db.results = items;
    }

    // 7. Uploads
    const uploadsSnap = await getDocs(collection(cloudDb, 'uploads'));
    if (!uploadsSnap.empty) {
      const items: any[] = [];
      uploadsSnap.forEach((d) => items.push(d.data()));
      if (items.length > 0) db.clientUploads = items;
    }

    syncClubMasterRecords(true);
    saveDBLocalOnly('all');
    console.log('[eSports] Server state initialized from Cloud Firestore. Event 0 fee is:', db.events.find(e => e.Evt_No === 0)?.Fees);
  } catch (err) {
    handleCloudError(err, 'Initial syncFromFirestore');
  }
}

// Subscribe to real-time Cloud Firestore updates in server.ts
function setupFirestoreServerSubscriptions() {
  if (!cloudDb) return;
  try {
    onSnapshot(collection(cloudDb, 'events'), (snap) => {
      if (!snap.empty) {
        const itemsMap = new Map<number, any>();
        snap.forEach((d) => {
          const data = d.data();
          if (data && data.Evt_No !== undefined) {
            const evtNo = Number(data.Evt_No);
            itemsMap.set(evtNo, {
              ...data,
              Evt_No: evtNo,
              Fees: Number(data.Fees ?? 0),
            });
          }
        });
        if (itemsMap.size > 0) {
          db.events = Array.from(itemsMap.values()).sort((a, b) => a.Evt_No - b.Evt_No);
          saveDBLocalOnly('events');
        }
      }
    }, (err) => handleCloudError(err, 'Server events subscription'));

    onSnapshot(collection(cloudDb, 'candidates'), (snap) => {
      const items: any[] = [];
      const seenNames = new Set<string>();
      const seenIds = new Set<string>();
      snap.forEach((d) => {
        const data = d.data();
        if (!data) return;
        const id = data.id || d.id;
        if (id && seenIds.has(id)) return;
        if (id) seenIds.add(id);

        const name = (data.name || '').trim().toUpperCase();
        const isCancelled = data.isCancelled || data.status === 'cancelled';
        if (!isCancelled && name) {
          if (seenNames.has(name)) return;
          seenNames.add(name);
        }
        items.push({ ...data, id });
      });
      db.candidates = items;
      syncClubMasterRecords();
      saveDBLocalOnly('candidates');
      saveDBLocalOnly('clubs');
    }, (err) => handleCloudError(err, 'Server candidates subscription'));

    onSnapshot(collection(cloudDb, 'clubs'), (snap) => {
      const itemsMap = new Map<string, any>();
      snap.forEach((d) => {
        const data = d.data();
        if (data && (data.Reg_Club || data.name)) {
          const regName = String(data.Reg_Club || data.name).trim().toUpperCase();
          const isDummy = ['AGRANI SASTHITALA SANGHA', 'MILAN SAMITY ATHLETIC CLUB', 'TARUN SANGHA SPORTS CLUB', 'SUBHASH NAGAR YUBA PARISHAD', 'INDEPENDENT / UNATTACHED'].includes(regName) && !db.candidates.some(c => (c.club || '').trim().toUpperCase() === regName);
          if (!isDummy) {
            const id = String(data.id || d.id);
            itemsMap.set(id, {
              id,
              Sl: Number(data.Sl) || 1,
              Reg_Club: data.Reg_Club || data.name,
              Mob: (data.Mob || data.mobile || data.phone || '').trim(),
              Count_1stPlace: Number(data.Count_1stPlace || 0),
              Count_2ndPlace: Number(data.Count_2ndPlace || 0),
              Count_3rdPlace: Number(data.Count_3rdPlace || 0),
              TotPoints: Number(data.TotPoints || 0),
              name: data.Reg_Club || data.name,
              mobile: (data.Mob || data.mobile || data.phone || '').trim(),
            });
          }
        }
      });
      if (itemsMap.size > 0) {
        db.clubs = Array.from(itemsMap.values());
      }
      syncClubMasterRecords();
      saveDBLocalOnly('clubs');
    }, (err) => handleCloudError(err, 'Server clubs subscription'));

    onSnapshot(collection(cloudDb, 'settings'), (snap) => {
      snap.forEach((d) => {
        if (d.id === 'meet_settings') {
          db.settings = { ...DEFAULT_SETTINGS, ...d.data() };
          saveDBLocalOnly('settings');
        }
      });
    }, (err) => handleCloudError(err, 'Server settings subscription'));

    onSnapshot(collection(cloudDb, 'uploads'), (snap) => {
      const items: any[] = [];
      snap.forEach((d) => items.push(d.data()));
      db.clientUploads = items;
      saveDBLocalOnly('clientUploads');
    }, (err) => handleCloudError(err, 'Server uploads subscription'));
  } catch (err) {
    handleCloudError(err, 'setupFirestoreServerSubscriptions');
  }
}

syncFromFirestore().then(() => {
  setupFirestoreServerSubscriptions();
});

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Health Checks
app.get(['/health', '/api/health'], (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    candidateCount: db.candidates.length,
    eventsCount: db.events.length,
    meetTitle: db.settings.ordinalTitle,
  });
});

// Single consolidated bootstrap endpoint to eliminate multi-request overhead and prevent rate limit issues
app.get('/api/bootstrap', (req: Request, res: Response) => {
  const currentActive = getValidActiveSession();
  res.json({
    events: db.events,
    clubs: db.clubs,
    settings: db.settings,
    heats: db.heats,
    results: db.results,
    uploads: db.clientUploads,
    candidates: db.candidates,
    lastUpdated: db.lastUpdated,
    serverSession: currentActive
      ? {
          isLoggedIn: true,
          deviceId: currentActive.deviceId,
          deviceLabel: currentActive.deviceLabel,
          loggedInAt: currentActive.loggedInAt,
        }
      : { isLoggedIn: false },
  });
});

// Lightweight sync summary endpoint for non-intrusive background sync checks
app.get('/api/sync-summary', (req: Request, res: Response) => {
  const pendingUploads = (db.clientUploads || []).filter((u: any) => u.status === 'pending');
  const pendingAthletesCount = pendingUploads.reduce((sum: number, u: any) => {
    const pendingCands = (u.candidates || []).filter((c: any) => !c.merged && c.status !== 'rejected').length;
    return sum + (pendingCands > 0 ? pendingCands : 1);
  }, 0);

  res.json({
    lastUpdated: db.lastUpdated,
    candidatesCount: (db.candidates || []).length,
    uploadsCount: (db.clientUploads || []).length,
    pendingUploadsCount: pendingUploads.length,
    pendingAthletesCount,
    heatsCount: (db.heats || []).length,
    resultsCount: (db.results || []).length,
  });
});

// Firestore Quota status endpoint
app.get('/api/quota-status', (req: Request, res: Response) => {
  res.json({
    isCloudQuotaExceeded,
    projectId: 'gen-lang-client-0314503200',
    firestoreDatabaseId: 'ai-studio-esportssportsman-cdafea5a-b133-49a1-b322-b307dac88fe4',
    upgradeUrl: 'https://console.firebase.google.com/project/gen-lang-client-0314503200/firestore/databases/ai-studio-esportssportsman-cdafea5a-b133-49a1-b322-b307dac88fe4/data?openUpgradeDialog=true',
    pricingUrl: 'https://firebase.google.com/pricing#cloud-firestore',
  });
});

// Real-time Server-Sent Events stream for immediate data sync on any client (desktop/mobile)
app.get('/api/sync-stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', lastUpdated: db.lastUpdated })}\n\n`);
  sseClients.push(res);

  // Keep-alive heartbeat every 15s to keep mobile proxies and NAT gateways alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.indexOf(res);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});

// Events Endpoints
app.get('/api/events', (req: Request, res: Response) => {
  res.json(db.events);
});

app.post('/api/events', async (req: Request, res: Response) => {
  const newEvt = req.body;
  if (newEvt.Evt_No === undefined || !newEvt.Evt_Name) {
    return res.status(400).json({ error: 'Evt_No and Evt_Name are required' });
  }
  const cleanEvt = {
    ...newEvt,
    Evt_No: Number(newEvt.Evt_No),
    Fees: Number(newEvt.Fees ?? 0),
  };
  const existingIdx = db.events.findIndex((e) => Number(e.Evt_No) === Number(cleanEvt.Evt_No));
  if (existingIdx >= 0) {
    db.events[existingIdx] = { ...db.events[existingIdx], ...cleanEvt };
  } else {
    db.events.push(cleanEvt);
  }
  db.events.sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));
  saveDB('events');
  if (cloudDb && !isCloudQuotaExceeded) {
    try {
      await setDoc(doc(cloudDb, 'events', `evt_${cleanEvt.Evt_No}`), sanitizeData(cleanEvt), { merge: true });
    } catch (e) {
      handleCloudError(e, 'Event direct setDoc');
    }
  }
  res.json({ success: true, event: cleanEvt });
});

app.put('/api/events/:evtNo', async (req: Request, res: Response) => {
  const evtNo = Number(req.params.evtNo);
  const idx = db.events.findIndex((e) => Number(e.Evt_No) === evtNo);
  if (idx < 0) {
    return res.status(404).json({ error: 'Event not found' });
  }
  const updatedEvt = {
    ...db.events[idx],
    ...req.body,
    Evt_No: evtNo,
    Fees: Number(req.body.Fees !== undefined ? req.body.Fees : (db.events[idx].Fees ?? 0)),
  };
  db.events[idx] = updatedEvt;
  saveDB('events');
  if (cloudDb && !isCloudQuotaExceeded) {
    try {
      await setDoc(doc(cloudDb, 'events', `evt_${evtNo}`), sanitizeData(updatedEvt), { merge: true });
    } catch (e) {
      handleCloudError(e, 'Event direct setDoc');
    }
  }
  res.json({ success: true, event: db.events[idx] });
});

app.delete('/api/events/:evtNo', async (req: Request, res: Response) => {
  const evtNo = Number(req.params.evtNo);
  db.events = db.events.filter((e) => Number(e.Evt_No) !== evtNo);
  saveDB('events');
  if (cloudDb && !isCloudQuotaExceeded) {
    try {
      await deleteDoc(doc(cloudDb, 'events', `evt_${evtNo}`));
      await deleteDoc(doc(cloudDb, 'events', String(evtNo))).catch(() => {});
    } catch (e) {
      handleCloudError(e, 'Event deleteDoc');
    }
  }
  res.json({ success: true });
});

app.post('/api/events/reset', async (req: Request, res: Response) => {
  db.events = [...DEFAULT_EVENTS];
  saveDB('events');
  if (cloudDb && !isCloudQuotaExceeded) {
    try {
      for (const evt of DEFAULT_EVENTS) {
        await setDoc(doc(cloudDb, 'events', `evt_${evt.Evt_No}`), sanitizeData(evt), { merge: true });
      }
    } catch (e) {
      handleCloudError(e, 'Reset events sync');
    }
  }
  res.json({ success: true, events: db.events });
});

// Candidates Endpoints
app.get('/api/candidates', (req: Request, res: Response) => {
  res.json(db.candidates);
});

// Helper: Evaluates candidate edit restriction
// Whenever a candidate has been promoted to final from any one of the events that he/she applied,
// or ranking list preparation is completed, edit details for that candidate is disabled.
function checkCandidateEditRestriction(existingCandidate: any): { isRestricted: boolean; message?: string; promotedFinalEvents?: number[]; rankingCompletedEvents?: number[] } {
  if (!existingCandidate || !existingCandidate.chestNo) {
    return { isRestricted: false };
  }
  const candChest = Number(existingCandidate.chestNo);
  if (!candChest || candChest <= 0) return { isRestricted: false };

  const appliedEvents = (existingCandidate.selectedEvents || []).map(Number);
  const promotedFinalEvents: number[] = [];
  const rankingCompletedEvents: number[] = [];

  appliedEvents.forEach((evtNo: number) => {
    // 1. Check if promoted to final in this event:
    // Case A: in results.finalists (promoted from hit OR direct final prepared)
    const res = (db.results || []).find((r: any) => Number(r.eventNo) === Number(evtNo));
    const isPromotedFinalist = Boolean(
      res &&
      Array.isArray(res.finalists) &&
      res.finalists.some((f: any) => Number(f.chestNo) === candChest)
    );

    // Case B: qualified in a heat
    const hasQualifiedInHeat = (db.heats || []).some(
      (h: any) =>
        Number(h.eventNo) === Number(evtNo) &&
        Array.isArray(h.participants) &&
        h.participants.some((p: any) => Number(p.chestNo) === candChest && Boolean(p.qualified))
    );

    if (isPromotedFinalist || hasQualifiedInHeat) {
      promotedFinalEvents.push(evtNo);
    }

    // 2. Check for ranking list preparation completion
    const isRankingDone = Boolean(
      res && (
        res.completed === true ||
        (Array.isArray(res.finalists) && res.finalists.some((f: any) => f.position && f.position > 0)) ||
        (Array.isArray(res.winners) && res.winners.length > 0)
      )
    );

    if (isRankingDone) {
      rankingCompletedEvents.push(evtNo);
    }
  });

  if (promotedFinalEvents.length > 0) {
    return {
      isRestricted: true,
      promotedFinalEvents,
      rankingCompletedEvents,
      message: `Editing disabled: Candidate "${existingCandidate.name}" (Chest #${existingCandidate.chestNo}) has been promoted to final in Event(s) ${promotedFinalEvents.map(e => `#${e}`).join(', ')}. Editing details is disabled once a candidate is promoted to final in any applied event.`,
    };
  }

  if (rankingCompletedEvents.length > 0) {
    return {
      isRestricted: true,
      promotedFinalEvents: [],
      rankingCompletedEvents,
      message: `Editing disabled: Ranking list preparation has already been completed for Event(s) ${rankingCompletedEvents.map(e => `#${e}`).join(', ')}.`,
    };
  }

  return { isRestricted: false };
}

// Single candidate create or update (for server front-end direct entry)
app.post('/api/candidates', (req: Request, res: Response) => {
  const cand = req.body;
  if (!cand.name) {
    return res.status(400).json({ error: 'Candidate name is required' });
  }

  if (cand.club === undefined || cand.club === null || !cand.club.trim()) {
    cand.club = 'SELF';
  }

  const candName = (cand.name || '').trim().toUpperCase();

  // 1. Try to find existing candidate by ID (if provided)
  let existingIdx = -1;
  if (cand.id) {
    existingIdx = db.candidates.findIndex((c) => c.id === cand.id);
  }
  // 2. If not found by ID, try to find existing candidate by Name (case-insensitive, non-cancelled)
  if (existingIdx < 0 && candName) {
    existingIdx = db.candidates.findIndex(
      (c) => (c.name || '').trim().toUpperCase() === candName && !c.isCancelled && c.status !== 'cancelled'
    );
  }

  const id = existingIdx >= 0
    ? db.candidates[existingIdx].id
    : (cand.id || `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    const existing = db.candidates[existingIdx];
    const isCancelling = cand.status === 'cancelled' || cand.isCancelled === true;
    if (!isCancelling) {
      const restriction = checkCandidateEditRestriction(existing);
      if (restriction.isRestricted) {
        return res.status(403).json({
          error: restriction.message,
          qualifiedEvents: restriction.promotedFinalEvents || [],
          isEditRestricted: true,
        });
      }
    }
  }

  let assignedChestNo: number;
  if (existingIdx >= 0 && db.candidates[existingIdx].chestNo && Number(db.candidates[existingIdx].chestNo) >= 101) {
    assignedChestNo = Number(db.candidates[existingIdx].chestNo);
  } else if (cand.chestNo && Number(cand.chestNo) >= 101) {
    const isChestTakenByOther = db.candidates.some(
      (c, idx) => idx !== existingIdx && Number(c.chestNo) === Number(cand.chestNo)
    );
    if (!isChestTakenByOther) {
      assignedChestNo = Number(cand.chestNo);
    } else {
      const highestChest = db.candidates.reduce((max, c) => {
        const num = parseInt(String(c.chestNo), 10) || 0;
        return num > max ? num : max;
      }, 100);
      assignedChestNo = highestChest + 1;
    }
  } else if (existingIdx >= 0 && db.candidates[existingIdx].chestNo) {
    assignedChestNo = Number(db.candidates[existingIdx].chestNo);
  } else {
    const highestChest = db.candidates.reduce((max, c) => {
      const num = parseInt(String(c.chestNo), 10) || 0;
      return num > max ? num : max;
    }, 100);
    assignedChestNo = highestChest + 1;
  }

  const existing = existingIdx >= 0 ? db.candidates[existingIdx] : undefined;
  const candidateRecord = toServerCandidateRecord({ ...cand, id }, assignedChestNo, existing);

  if (existingIdx >= 0) {
    db.candidates[existingIdx] = candidateRecord;
    // Keep heats and results participant details in sync with updated candidate name and club
    if (Array.isArray(db.heats)) {
      db.heats.forEach((h: any) => {
        if (Array.isArray(h.participants)) {
          h.participants.forEach((p: any) => {
            if (Number(p.chestNo) === assignedChestNo) {
              if (cand.name) p.candidateName = cand.name.trim().toUpperCase();
              if (cand.club) p.club = cand.club.trim().toUpperCase();
            }
          });
        }
      });
    }
    if (Array.isArray(db.results)) {
      db.results.forEach((r: any) => {
        if (Array.isArray(r.finalists)) {
          r.finalists.forEach((f: any) => {
            if (Number(f.chestNo) === assignedChestNo) {
              if (cand.name) f.candidateName = cand.name.trim().toUpperCase();
              if (cand.club) f.club = cand.club.trim().toUpperCase();
            }
          });
        }
        if (Array.isArray(r.winners)) {
          r.winners.forEach((w: any) => {
            if (Number(w.chestNo) === assignedChestNo) {
              if (cand.name) w.candidateName = cand.name.trim().toUpperCase();
              if (cand.club) w.club = cand.club.trim().toUpperCase();
            }
          });
        }
      });
    }
  } else {
    db.candidates.push(candidateRecord);
  }

  syncClubMasterRecords();
  saveDB();
  res.json({ success: true, candidate: candidateRecord });
});

app.put('/api/candidates/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const idx = db.candidates.findIndex((c) => c.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const existing = db.candidates[idx];

  // Restrict edit per Logic 1
  const isCancelling = req.body.status === 'cancelled' || req.body.isCancelled === true;
  if (!isCancelling) {
    const restriction = checkCandidateEditRestriction(existing);
    if (restriction.isRestricted) {
      return res.status(403).json({
        error: restriction.message,
        qualifiedEvents: restriction.promotedFinalEvents || [],
        isEditRestricted: true,
      });
    }
  }

  const chestNo = Number(existing.chestNo) || 101;
  const candidateRecord = toServerCandidateRecord({ ...existing, ...req.body, id }, chestNo, existing);
  db.candidates[idx] = candidateRecord;

  // Keep heats and results participant details in sync with updated candidate name and club
  if (Array.isArray(db.heats)) {
    db.heats.forEach((h: any) => {
      if (Array.isArray(h.participants)) {
        h.participants.forEach((p: any) => {
          if (Number(p.chestNo) === chestNo) {
            if (req.body.name) p.candidateName = req.body.name.trim().toUpperCase();
            if (req.body.club) p.club = req.body.club.trim().toUpperCase();
          }
        });
      }
    });
  }
  if (Array.isArray(db.results)) {
    db.results.forEach((r: any) => {
      if (Array.isArray(r.finalists)) {
        r.finalists.forEach((f: any) => {
          if (Number(f.chestNo) === chestNo) {
            if (req.body.name) f.candidateName = req.body.name.trim().toUpperCase();
            if (req.body.club) f.club = req.body.club.trim().toUpperCase();
          }
        });
      }
      if (Array.isArray(r.winners)) {
        r.winners.forEach((w: any) => {
          if (Number(w.chestNo) === chestNo) {
            if (req.body.name) w.candidateName = req.body.name.trim().toUpperCase();
            if (req.body.club) w.club = req.body.club.trim().toUpperCase();
          }
        });
      }
    });
  }

  syncClubMasterRecords();
  saveDB();
  res.json({ success: true, candidate: db.candidates[idx] });
});

// Cancel a candidate's chest number (deactivation without deleting the record, excluded from all hit lists)
app.post('/api/candidates/:id/cancel-chest', (req: Request, res: Response) => {
  const id = req.params.id;
  const idx = db.candidates.findIndex((c) => c.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'Candidate not found' });
  }

  const now = new Date().toISOString();
  const cand = db.candidates[idx];
  cand.status = 'cancelled';
  cand.isCancelled = true;
  cand.cancelledAt = now;
  cand.updatedAt = now;
  db.candidates[idx] = cand;

  // Remove this cancelled chest number from all heats so it never appears in any hit lists
  if (Array.isArray(db.heats)) {
    db.heats.forEach((h: any) => {
      if (Array.isArray(h.participants)) {
        h.participants = h.participants.filter((p: any) => Number(p.chestNo) !== Number(cand.chestNo));
      }
    });
  }

  // Remove this cancelled chest number from all results finalists and winners
  if (Array.isArray(db.results)) {
    db.results.forEach((r: any) => {
      if (Array.isArray(r.finalists)) {
        r.finalists = r.finalists.filter((f: any) => Number(f.chestNo) !== Number(cand.chestNo));
      }
      if (Array.isArray(r.winners)) {
        r.winners = r.winners.filter((w: any) => Number(w.chestNo) !== Number(cand.chestNo));
      }
    });
  }

  saveDB();
  res.json({
    success: true,
    message: `Chest #${cand.chestNo} for "${cand.name}" has been cancelled and excluded from all hit lists.`,
    candidate: cand,
  });
});

app.delete('/api/candidates/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const cand = db.candidates.find((c) => c.id === id);
  // Deletion of candidates with generated chest numbers is strictly prohibited under all circumstances
  if (cand && (Number(cand.chestNo) >= 101 || cand.chestNo || cand.synced)) {
    return res.status(403).json({
      error: `Deletion is strictly prohibited once a candidate record is saved and a chest number (#${cand.chestNo}) is generated. You can cancel this chest number instead.`,
      isProtected: true,
    });
  }
  db.candidates = db.candidates.filter((c) => c.id !== id);
  saveDB();
  res.json({ success: true });
});

// Incremental Candidate Synchronization Endpoint
// Satisfies: "must sure that only that new data should save to the server"
// Satisfies: "When Synced to the server, the chest numbers will generate then from server's heighest chest number"
app.post('/api/candidates/sync', (req: Request, res: Response) => {
  const incomingCandidates: any[] = req.body.candidates || [];
  if (!Array.isArray(incomingCandidates)) {
    return res.status(400).json({ error: 'Expected candidates array' });
  }

  const now = new Date().toISOString();
  const savedIds: string[] = [];
  const updatedCandidates: any[] = [];

  // Calculate highest existing chest number on server
  let highestChestNo = db.candidates.reduce((max, c) => {
    const num = parseInt(String(c.chestNo), 10) || 0;
    return num > max ? num : max;
  }, 100);

  incomingCandidates.forEach((cand) => {
    if (!cand.id) {
      cand.id = `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
    const idx = db.candidates.findIndex(
      (c) => c.id === cand.id ||
             (c.name && cand.name && c.name.trim().toUpperCase() === cand.name.trim().toUpperCase() &&
              c.club && cand.club && c.club.trim().toUpperCase() === cand.club.trim().toUpperCase())
    );

    let assignedChestNo: number;
    if (idx >= 0 && db.candidates[idx].chestNo && Number(db.candidates[idx].chestNo) >= 101) {
      // Existing server candidate with permanent official chest number
      assignedChestNo = Number(db.candidates[idx].chestNo);
    } else {
      // Generate next chest number strictly after server's highest chest number
      highestChestNo += 1;
      assignedChestNo = highestChestNo;
    }

    const candidateRecord = toServerCandidateRecord(cand, assignedChestNo, idx >= 0 ? db.candidates[idx] : undefined);

    if (idx >= 0) {
      db.candidates[idx] = candidateRecord;
    } else {
      db.candidates.push(candidateRecord);
    }
    savedIds.push(candidateRecord.id);
    updatedCandidates.push(candidateRecord);
  });

  syncClubMasterRecords();
  saveDB();

  res.json({
    success: true,
    syncedCount: savedIds.length,
    savedIds,
    updatedCandidates,
    serverTimestamp: now,
    totalServerCandidates: db.candidates.length,
  });
});

// Clubs Endpoints
app.get('/api/clubs', (req: Request, res: Response) => {
  res.json(db.clubs || []);
});

app.post('/api/clubs', async (req: Request, res: Response) => {
  const club = req.body;
  const regClub = (club.Reg_Club || club.name || '').trim().toUpperCase();
  if (!regClub) {
    return res.status(400).json({ error: 'Club name (Reg_Club) is required' });
  }
  const cleanMob = (club.Mob || club.mobile || club.phone || '').toString().trim();
  const existingIdx = db.clubs.findIndex(
    (c) => c.id === club.id || (c.Reg_Club && c.Reg_Club.toUpperCase() === regClub) || (c.name && c.name.toUpperCase() === regClub)
  );
  const id = existingIdx >= 0 ? db.clubs[existingIdx].id : (club.id || `club_${regClub.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
  const count1st = Number(club.Count_1stPlace !== undefined ? club.Count_1stPlace : (existingIdx >= 0 ? db.clubs[existingIdx].Count_1stPlace : 0)) || 0;
  const count2nd = Number(club.Count_2ndPlace !== undefined ? club.Count_2ndPlace : (existingIdx >= 0 ? db.clubs[existingIdx].Count_2ndPlace : 0)) || 0;
  const count3rd = Number(club.Count_3rdPlace !== undefined ? club.Count_3rdPlace : (existingIdx >= 0 ? db.clubs[existingIdx].Count_3rdPlace : 0)) || 0;
  const isSelf = regClub === 'SELF';
  const totPoints = isSelf ? 0 : (club.TotPoints !== undefined ? Number(club.TotPoints) : (count1st * 7 + count2nd * 5 + count3rd * 4));

  const newClub = {
    id,
    Sl: existingIdx >= 0 ? (db.clubs[existingIdx].Sl || (existingIdx + 1)) : (db.clubs.length + 1),
    Reg_Club: regClub,
    Mob: cleanMob,
    Count_1stPlace: count1st,
    Count_2ndPlace: count2nd,
    Count_3rdPlace: count3rd,
    TotPoints: totPoints,
    name: regClub,
    mobile: cleanMob,
  };

  if (existingIdx >= 0) {
    db.clubs[existingIdx] = newClub;
  } else {
    db.clubs.push(newClub);
  }
  saveDB('clubs');
  if (cloudDb && !isCloudQuotaExceeded) {
    try {
      const docId = id.startsWith('club_') ? id : `club_${id}`;
      await setDoc(doc(cloudDb, 'clubs', docId), sanitizeData(newClub), { merge: true });
    } catch (e) {
      handleCloudError(e, 'Club setDoc');
    }
  }
  res.json({ success: true, club: newClub });
});

app.put('/api/clubs/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const idx = db.clubs.findIndex((c) => c.id === id || c.Reg_Club?.toUpperCase() === id.toUpperCase() || c.name?.toUpperCase() === id.toUpperCase());
  if (idx < 0) {
    return res.status(404).json({ error: 'Club not found' });
  }
  const current = db.clubs[idx];
  const oldRegName = (current.Reg_Club || current.name || '').trim().toUpperCase();
  const regClub = (req.body.Reg_Club || req.body.name || current.Reg_Club || current.name || '').trim().toUpperCase();
  const cleanMob = req.body.Mob !== undefined ? String(req.body.Mob).trim() : (req.body.mobile !== undefined ? String(req.body.mobile).trim() : (current.Mob || current.mobile || ''));
  const count1st = Number(req.body.Count_1stPlace !== undefined ? req.body.Count_1stPlace : current.Count_1stPlace) || 0;
  const count2nd = Number(req.body.Count_2ndPlace !== undefined ? req.body.Count_2ndPlace : current.Count_2ndPlace) || 0;
  const count3rd = Number(req.body.Count_3rdPlace !== undefined ? req.body.Count_3rdPlace : current.Count_3rdPlace) || 0;
  const isSelf = regClub === 'SELF';
  const totPoints = isSelf ? 0 : (req.body.TotPoints !== undefined ? Number(req.body.TotPoints) : (count1st * 7 + count2nd * 5 + count3rd * 4));

  db.clubs[idx] = {
    id: current.id || id,
    Sl: current.Sl || (idx + 1),
    Reg_Club: regClub,
    Mob: cleanMob,
    Count_1stPlace: count1st,
    Count_2ndPlace: count2nd,
    Count_3rdPlace: count3rd,
    TotPoints: totPoints,
    name: regClub,
    mobile: cleanMob,
  };

  // If club name changed, update candidates
  if (oldRegName && regClub && oldRegName !== regClub) {
    db.candidates.forEach((c) => {
      if ((c.club || '').trim().toUpperCase() === oldRegName) {
        c.club = regClub;
      }
    });
    saveDBLocalOnly('candidates');
  }

  saveDB('clubs');
  if (cloudDb && !isCloudQuotaExceeded) {
    try {
      const docId = id.startsWith('club_') ? id : `club_${id}`;
      await setDoc(doc(cloudDb, 'clubs', docId), sanitizeData(db.clubs[idx]), { merge: true });
    } catch (e) {
      handleCloudError(e, 'Club setDoc');
    }
  }
  res.json({ success: true, club: db.clubs[idx] });
});

app.delete('/api/clubs/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const target = db.clubs.find((c) => String(c.id) === id || String(c.Reg_Club).toUpperCase() === id.toUpperCase() || String(c.name).toUpperCase() === id.toUpperCase());
  const targetName = (target?.Reg_Club || target?.name || id).trim().toUpperCase();

  // If candidates had this club, update them to 'SELF' so it never re-extracts
  if (targetName && targetName !== 'SELF') {
    db.candidates.forEach((c) => {
      if ((c.club || '').trim().toUpperCase() === targetName) {
        c.club = 'SELF';
      }
    });
    saveDBLocalOnly('candidates');
  }

  db.clubs = db.clubs.filter((c) => String(c.id) !== id && String(c.Reg_Club).toUpperCase() !== targetName && String(c.name).toUpperCase() !== targetName);
  saveDB('clubs');

  if (cloudDb && !isCloudQuotaExceeded) {
    try {
      const cleanId = id.replace(/^club_/, '');
      await deleteDoc(doc(cloudDb, 'clubs', `club_${cleanId}`)).catch(() => {});
      await deleteDoc(doc(cloudDb, 'clubs', id)).catch(() => {});
      const snap = await getDocs(collection(cloudDb, 'clubs'));
      for (const d of snap.docs) {
        const dData = d.data();
        if ((dData.Reg_Club && dData.Reg_Club.toUpperCase() === targetName) || (dData.name && dData.name.toUpperCase() === targetName)) {
          await deleteDoc(doc(cloudDb, 'clubs', d.id)).catch(() => {});
        }
      }
    } catch (e) {
      handleCloudError(e, 'Club deleteDoc');
    }
  }
  res.json({ success: true });
});

// Settings Endpoints
app.get('/api/settings', (req: Request, res: Response) => {
  res.json(db.settings);
});

app.post('/api/settings', async (req: Request, res: Response) => {
  db.settings = { ...db.settings, ...req.body };
  saveDB('settings');
  if (cloudDb && !isCloudQuotaExceeded) {
    try {
      await setDoc(doc(cloudDb, 'settings', 'meet_settings'), sanitizeData(db.settings), { merge: true });
    } catch (e) {
      handleCloudError(e, 'Settings setDoc');
    }
  }
  res.json({ success: true, settings: db.settings });
});

// ----------------------------------------------------
// AUTH & PIN MANAGEMENT ENDPOINTS (Single Server Device Restriction)
// ----------------------------------------------------
// Verify PIN and enforce single active server login across devices
app.post('/api/auth/verify-pin', (req: Request, res: Response) => {
  const { pin, deviceId, deviceLabel, forceTakeover } = req.body;
  const currentPin = db.settings?.serverPin || '1234';
  
  if (pin !== currentPin) {
    return res.status(401).json({ success: false, error: 'Incorrect PIN. Please try again.' });
  }

  const currentActive = getValidActiveSession();
  const incomingDeviceId = deviceId || `dev_${Date.now()}`;
  const incomingDeviceLabel = deviceLabel || (req.headers['user-agent']?.includes('Mobi') ? 'Mobile Device' : 'Desktop Browser');

  if (currentActive) {
    // If the active session is from the exact same device, allow reconnect/renew
    if (currentActive.deviceId === incomingDeviceId) {
      currentActive.lastActiveAt = new Date().toISOString();
      currentActive.deviceLabel = incomingDeviceLabel;
      return res.json({
        success: true,
        sessionId: currentActive.sessionId,
        deviceId: currentActive.deviceId,
        message: 'PIN verified. Resumed active server session.',
      });
    }

    // Different device is trying to log in while an active session exists
    if (!forceTakeover) {
      return res.status(409).json({
        success: false,
        isAlreadyLoggedIn: true,
        error: `Server is currently logged in on another device (${currentActive.deviceLabel}). Multiple concurrent server logins are restricted.`,
        activeDevice: {
          label: currentActive.deviceLabel,
          loggedInAt: currentActive.loggedInAt,
          lastActiveAt: currentActive.lastActiveAt,
        },
      });
    }

    // forceTakeover is true: Terminate previous session and establish new one
    console.log(`[AUTH] Server session taken over by device: ${incomingDeviceLabel} (${incomingDeviceId}) from previous: ${currentActive.deviceLabel}`);
  }

  // Create new active session
  activeServerSession = {
    sessionId: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    deviceId: incomingDeviceId,
    deviceLabel: incomingDeviceLabel,
    ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
    loggedInAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  if (cloudDb && !isCloudQuotaExceeded) {
    try {
      setDoc(doc(cloudDb, 'serverSession', 'active'), sanitizeData(activeServerSession)).catch((e) => handleCloudError(e, 'session login'));
    } catch (e) {
      handleCloudError(e, 'session login sync');
    }
  }

  return res.json({
    success: true,
    sessionId: activeServerSession.sessionId,
    deviceId: activeServerSession.deviceId,
    deviceLabel: activeServerSession.deviceLabel,
    message: currentActive ? 'Previous session disconnected. Server control unlocked on this device.' : 'PIN verified. Server control unlocked.',
  });
});

// Check if server is currently logged in on any device
app.get('/api/auth/session-status', (req: Request, res: Response) => {
  const deviceId = req.query.deviceId as string;
  const currentActive = getValidActiveSession();
  
  if (!currentActive) {
    return res.json({
      isServerLoggedIn: false,
    });
  }

  return res.json({
    isServerLoggedIn: true,
    isCurrentDevice: Boolean(deviceId && currentActive.deviceId === deviceId),
    activeDevice: {
      label: currentActive.deviceLabel,
      loggedInAt: currentActive.loggedInAt,
      lastActiveAt: currentActive.lastActiveAt,
    },
  });
});

let lastCloudHeartbeatWrite = 0;

// Server session heartbeat check
app.post('/api/auth/heartbeat', (req: Request, res: Response) => {
  const { sessionId, deviceId } = req.body;
  const currentActive = getValidActiveSession();

  if (!currentActive) {
    return res.json({ valid: false, reason: 'No active server session. Server was locked or session timed out.' });
  }

  if (currentActive.sessionId !== sessionId || (deviceId && currentActive.deviceId !== deviceId)) {
    return res.json({
      valid: false,
      reason: `Server control was taken over by another device (${currentActive.deviceLabel}).`,
    });
  }

  currentActive.lastActiveAt = new Date().toISOString();
  const now = Date.now();
  // Throttle to at most once per 15 minutes to preserve daily Firestore write units
  if (cloudDb && !isCloudQuotaExceeded && (now - lastCloudHeartbeatWrite > 15 * 60 * 1000)) {
    lastCloudHeartbeatWrite = now;
    try {
      setDoc(doc(cloudDb, 'serverSession', 'active'), sanitizeData(currentActive), { merge: true }).catch((e) => handleCloudError(e, 'session heartbeat'));
    } catch (e) {
      handleCloudError(e, 'session heartbeat sync');
    }
  }
  return res.json({ valid: true });
});

// Server logout / lock endpoint
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const { sessionId, deviceId } = req.body;
  const currentActive = getValidActiveSession();

  if (currentActive) {
    if (!sessionId || currentActive.sessionId === sessionId || (deviceId && currentActive.deviceId === deviceId)) {
      console.log(`[AUTH] Server logged out from device: ${currentActive.deviceLabel}`);
      activeServerSession = null;
      if (cloudDb && !isCloudQuotaExceeded) {
        try {
          deleteDoc(doc(cloudDb, 'serverSession', 'active')).catch((e) => handleCloudError(e, 'session logout'));
        } catch (e) {
          handleCloudError(e, 'session logout sync');
        }
      }
    }
  }

  return res.json({ success: true, message: 'Server session terminated' });
});

app.post('/api/auth/reset-pin', (req: Request, res: Response) => {
  const { currentPin, newPin } = req.body;
  const storedPin = db.settings?.serverPin || '1234';
  
  if (currentPin !== storedPin) {
    return res.status(401).json({ success: false, error: 'Current PIN is incorrect.' });
  }
  if (!newPin || String(newPin).trim().length < 4) {
    return res.status(400).json({ success: false, error: 'New PIN must be at least 4 digits.' });
  }

  db.settings.serverPin = String(newPin).trim();
  saveDB();
  res.json({ success: true, message: 'Server login PIN has been updated successfully!' });
});

// ----------------------------------------------------
// CLIENT UPLOADS & CLUB-WISE REVIEW / MERGE ENDPOINTS
// ----------------------------------------------------
// 1. Get all client uploads
app.get('/api/uploads', (req: Request, res: Response) => {
  res.json(db.clientUploads || []);
});

// 2. Client submits candidate upload batch
// Client submissions arrive into pending batches awaiting review & approval by server admin.
app.post('/api/uploads', (req: Request, res: Response) => {
  const { club, clientName, candidates, totalFees, notes, clubMobile } = req.body;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'At least one candidate is required for upload' });
  }

  const targetClub = (club || candidates[0]?.club || 'Independent / Unattached').trim();
  const now = new Date().toISOString();

  // If clubMobile provided and targetClub is not Independent, save/update in db.clubs table
  if (clubMobile && targetClub && targetClub !== 'Independent' && targetClub !== 'Independent / Unattached') {
    const cleanMobile = String(clubMobile).trim();
    const existingClubIdx = db.clubs.findIndex(c => (c.name || '').trim().toUpperCase() === targetClub.toUpperCase());
    if (existingClubIdx >= 0) {
      db.clubs[existingClubIdx].mobile = cleanMobile;
      if (!db.clubs[existingClubIdx].phone || db.clubs[existingClubIdx].phone === '-') {
        db.clubs[existingClubIdx].phone = cleanMobile;
      }
    } else {
      db.clubs.push({
        id: `club_${Date.now()}`,
        name: targetClub,
        shortCode: targetClub.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'CLUB',
        mobile: cleanMobile,
        phone: cleanMobile,
        address: '',
      });
    }
    const updatedClubObj = existingClubIdx >= 0 ? db.clubs[existingClubIdx] : db.clubs[db.clubs.length - 1];
    saveDB('clubs');
    if (cloudDb && !isCloudQuotaExceeded && updatedClubObj) {
      try {
        const docId = updatedClubObj.id.startsWith('club_') ? updatedClubObj.id : `club_${updatedClubObj.id}`;
        setDoc(doc(cloudDb, 'clubs', docId), sanitizeData(updatedClubObj), { merge: true }).catch(() => {});
      } catch {}
    }
  }

  // Process incoming candidates: ensure provisional chest numbers (< 101) are preserved as localRecordNo
  // and NOT mistakenly treated as official server chest numbers before approval.
  const processedCandidates = candidates.map((c: any, idx: number) => {
    const candId = c.id || `cand_up_${Date.now()}_${idx}`;
    const hasOfficialServerChest = Number(c.chestNo) >= 101;
    const recNo = Number(c.localRecordNo) > 0 ? Number(c.localRecordNo) : (!hasOfficialServerChest && Number(c.chestNo) > 0 ? Number(c.chestNo) : idx + 1);
    return {
      ...c,
      id: candId,
      club: targetClub,
      localRecordNo: recNo,
      chestNo: hasOfficialServerChest ? c.chestNo : undefined,
      merged: hasOfficialServerChest,
      status: hasOfficialServerChest ? 'merged' : 'pending',
      uploadedAt: now,
    };
  });

  // Find if there is an existing pending upload batch for this club
  let existingBatch = db.clientUploads.find(
    (u) => u.status === 'pending' && u.club.trim().toUpperCase() === targetClub.toUpperCase()
  );

  if (existingBatch) {
    // Merge or update incoming candidates into existing pending batch
    processedCandidates.forEach((newCand) => {
      const existingCandIdx = existingBatch!.candidates.findIndex(
        (ec: any) => ec.id === newCand.id || (ec.name && newCand.name && ec.name.trim().toUpperCase() === newCand.name.trim().toUpperCase())
      );
      if (existingCandIdx >= 0) {
        existingBatch!.candidates[existingCandIdx] = {
          ...existingBatch!.candidates[existingCandIdx],
          ...newCand,
          // Preserve merged status only if already officially merged
          status: existingBatch!.candidates[existingCandIdx].merged ? 'merged' : 'pending',
        };
      } else {
        existingBatch!.candidates.push(newCand);
      }
    });

    existingBatch.status = 'pending';
    existingBatch.uploadedAt = now;
    if (clubMobile) existingBatch.clubMobile = String(clubMobile).trim();
    if (clientName) existingBatch.clientName = clientName;
    if (notes) existingBatch.notes = notes;
    existingBatch.totalFees = existingBatch.candidates.reduce(
      (sum: number, c: any) => sum + (Number(c.totalFees) || 0),
      0
    );

    saveDB();
    console.log(`[APPROVAL REQUEST] Updated pending batch for club "${targetClub}" (+${processedCandidates.length} athletes). Server lastUpdated: ${db.lastUpdated}`);

    return res.json({
      success: true,
      message: `Batch for "${targetClub}" updated with ${processedCandidates.length} athlete(s) in server pending queue!`,
      upload: existingBatch,
      totalServerCandidates: db.candidates.length,
    });
  } else {
    // Create a new pending batch
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newUpload = {
      id: uploadId,
      club: targetClub,
      clubMobile: clubMobile ? String(clubMobile).trim() : '',
      clientName: clientName || '',
      uploadedAt: now,
      status: 'pending', // Pending review & approval
      candidates: processedCandidates,
      totalFees: Number(totalFees) || processedCandidates.reduce((sum: number, c: any) => sum + (Number(c.totalFees) || 0), 0),
      notes: notes || '',
    };

    db.clientUploads.unshift(newUpload);
    saveDB();
    console.log(`[APPROVAL REQUEST] Created new pending batch "${uploadId}" for club "${targetClub}" with ${processedCandidates.length} athletes. Server lastUpdated: ${db.lastUpdated}`);

    return res.json({
      success: true,
      message: `Batch of ${processedCandidates.length} candidate(s) for "${newUpload.club}" submitted to server pending queue! Subject to review and approval by server.`,
      upload: newUpload,
      totalServerCandidates: db.candidates.length,
    });
  }
});

// 3. Review and Merge an entire upload batch into official server candidates
app.post('/api/uploads/:id/merge', (req: Request, res: Response) => {
  const uploadId = req.params.id;
  const uploadIdx = db.clientUploads.findIndex((u) => u.id === uploadId);
  if (uploadIdx < 0) {
    return res.status(404).json({ error: 'Upload batch not found' });
  }

  const upload = db.clientUploads[uploadIdx];
  const now = new Date().toISOString();
  const mergedList: any[] = [];

  // Determine current highest chest number across all candidates on the server
  let highestChestNo = db.candidates.reduce((max, c) => {
    const num = parseInt(String(c.chestNo), 10) || 0;
    return num > max ? num : max;
  }, 100);

  upload.candidates.forEach((cand: any) => {
    // Check if candidate already exists by ID or by matching name and club
    const existingIdx = db.candidates.findIndex(
      (c) => c.id === cand.id ||
             (c.name && cand.name && c.name.trim().toUpperCase() === cand.name.trim().toUpperCase() &&
              c.club && (cand.club || upload.club) && c.club.trim().toUpperCase() === (cand.club || upload.club).trim().toUpperCase())
    );
    
    let assignedChestNo: number;
    if (existingIdx >= 0 && db.candidates[existingIdx].chestNo && Number(db.candidates[existingIdx].chestNo) >= 101) {
      assignedChestNo = Number(db.candidates[existingIdx].chestNo);
    } else {
      // Allocate strictly AFTER the highest chest number for new candidates
      highestChestNo += 1;
      assignedChestNo = highestChestNo;
    }

    const officialCandidate = toServerCandidateRecord(
      { ...cand, club: cand.club || upload.club },
      assignedChestNo,
      existingIdx >= 0 ? db.candidates[existingIdx] : undefined
    );

    if (existingIdx >= 0) {
      db.candidates[existingIdx] = officialCandidate;
    } else {
      db.candidates.push(officialCandidate);
    }
    cand.merged = true;
    cand.status = 'merged';
    cand.chestNo = assignedChestNo;
    delete cand.localRecordNo;
    delete cand.provisionalChestNo;
    mergedList.push(officialCandidate);
  });

  // Update upload batch status
  upload.status = 'merged';
  upload.mergedAt = now;
  upload.reviewedAt = now;
  db.clientUploads[uploadIdx] = upload;

  syncClubMasterRecords();
  saveDB();

  res.json({
    success: true,
    message: `Successfully reviewed and merged ${mergedList.length} candidate(s) from "${upload.club}" into official server database!`,
    mergedCandidates: mergedList,
    totalServerCandidates: db.candidates.length,
    upload,
  });
});

// 4. Reject an upload batch with reason
app.post('/api/uploads/:id/reject', (req: Request, res: Response) => {
  const uploadId = req.params.id;
  const upload = db.clientUploads.find((u) => u.id === uploadId);
  if (!upload) {
    return res.status(404).json({ error: 'Upload batch not found' });
  }

  upload.status = 'rejected';
  upload.reviewedAt = new Date().toISOString();
  if (req.body.reason) {
    upload.notes = req.body.reason;
  }
  saveDB();
  res.json({ success: true, message: `Upload batch from "${upload.club}" marked as rejected.`, upload });
});

// 5. Delete an upload batch
app.delete('/api/uploads/:id', (req: Request, res: Response) => {
  const uploadId = req.params.id;
  db.clientUploads = db.clientUploads.filter((u) => u.id !== uploadId);
  saveDB();
  res.json({ success: true, message: 'Upload batch removed' });
});

// 6. Edit a single candidate inside a pending upload batch before merge
app.put('/api/uploads/:id/candidate/:candId', (req: Request, res: Response) => {
  const { id: uploadId, candId } = req.params;
  const upload = db.clientUploads.find((u) => u.id === uploadId);
  if (!upload) {
    return res.status(404).json({ error: 'Upload batch not found' });
  }

  const candIdx = upload.candidates.findIndex((c: any) => c.id === candId);
  if (candIdx < 0) {
    return res.status(404).json({ error: 'Candidate not found in upload batch' });
  }

  upload.candidates[candIdx] = { ...upload.candidates[candIdx], ...req.body };
  upload.totalFees = upload.candidates.reduce((sum: number, c: any) => sum + (Number(c.totalFees) || 0), 0);
  saveDB();

  res.json({ success: true, candidate: upload.candidates[candIdx], upload });
});

// 7. Merge a single candidate from an upload batch
app.post('/api/uploads/:id/merge-single/:candId', (req: Request, res: Response) => {
  const { id: uploadId, candId } = req.params;
  const upload = db.clientUploads.find((u) => u.id === uploadId);
  if (!upload) {
    return res.status(404).json({ error: 'Upload batch not found' });
  }

  const cand = upload.candidates.find((c: any) => c.id === candId);
  if (!cand) {
    return res.status(404).json({ error: 'Candidate not found in upload batch' });
  }

  // Determine current highest chest number across all candidates on the server
  let highestChestNo = db.candidates.reduce((max, c) => {
    const num = parseInt(String(c.chestNo), 10) || 0;
    return num > max ? num : max;
  }, 100);

  const existingIdx = db.candidates.findIndex(
    (c) => c.id === cand.id ||
           (c.name && cand.name && c.name.trim().toUpperCase() === cand.name.trim().toUpperCase() &&
            c.club && (cand.club || upload.club) && c.club.trim().toUpperCase() === (cand.club || upload.club).trim().toUpperCase())
  );

  let assignedChestNo: number;
  if (existingIdx >= 0 && db.candidates[existingIdx].chestNo && Number(db.candidates[existingIdx].chestNo) >= 101) {
    assignedChestNo = Number(db.candidates[existingIdx].chestNo);
  } else {
    // Allocate strictly AFTER the highest chest number for new candidate
    highestChestNo += 1;
    assignedChestNo = highestChestNo;
  }

  const now = new Date().toISOString();
  const officialCandidate = toServerCandidateRecord(
    { ...cand, club: cand.club || upload.club },
    assignedChestNo,
    existingIdx >= 0 ? db.candidates[existingIdx] : undefined
  );

  if (existingIdx >= 0) {
    db.candidates[existingIdx] = officialCandidate;
  } else {
    db.candidates.push(officialCandidate);
  }

  cand.merged = true;
  cand.status = 'merged';
  cand.chestNo = assignedChestNo;
  delete cand.localRecordNo;
  delete cand.provisionalChestNo;

  // Check if all candidates are merged or rejected
  const allProcessed = upload.candidates.every((c: any) => c.merged || c.status === 'rejected');
  if (allProcessed) {
    const hasMerged = upload.candidates.some((c: any) => c.merged);
    upload.status = hasMerged ? 'merged' : 'rejected';
    upload.mergedAt = now;
  }

  saveDB();

  res.json({
    success: true,
    candidate: officialCandidate,
    upload,
    message: `Candidate "${officialCandidate.name}" approved and merged with Chest #${officialCandidate.chestNo}!`,
  });
});

// 8. Reject a single candidate from an upload batch
app.post('/api/uploads/:id/reject-single/:candId', (req: Request, res: Response) => {
  const { id: uploadId, candId } = req.params;
  const upload = db.clientUploads.find((u) => u.id === uploadId);
  if (!upload) {
    return res.status(404).json({ error: 'Upload batch not found' });
  }

  const cand = upload.candidates.find((c: any) => c.id === candId);
  if (!cand) {
    return res.status(404).json({ error: 'Candidate not found in upload batch' });
  }

  // Remove from server candidates if previously added
  db.candidates = db.candidates.filter((c) => c.id !== candId);

  cand.merged = false;
  cand.status = 'rejected';
  if (req.body?.reason) {
    cand.rejectionReason = req.body.reason;
  }

  // Check if all processed
  const allProcessed = upload.candidates.every((c: any) => c.merged || c.status === 'rejected');
  if (allProcessed) {
    const hasMerged = upload.candidates.some((c: any) => c.merged);
    upload.status = hasMerged ? 'merged' : 'rejected';
    upload.reviewedAt = new Date().toISOString();
  }

  saveDB();

  res.json({
    success: true,
    candidate: cand,
    upload,
    message: `Candidate "${cand.name}" has been rejected.`,
  });
});

// 9. Delete a candidate globally from pending uploads
app.delete('/api/uploads/candidate/:candId', (req: Request, res: Response) => {
  const { candId } = req.params;
  let modified = false;
  db.clientUploads.forEach((upload) => {
    if (upload.status === 'pending') {
      const origLen = upload.candidates.length;
      upload.candidates = upload.candidates.filter((c: any) => c.id !== candId);
      if (upload.candidates.length !== origLen) {
        modified = true;
        upload.totalFees = upload.candidates.reduce(
          (sum: number, c: any) => sum + (Number(c.totalFees) || 0),
          0
        );
      }
    }
  });
  // Clean up any empty pending uploads
  db.clientUploads = db.clientUploads.filter(
    (u) => !(u.status === 'pending' && u.candidates.length === 0)
  );
  if (modified) {
    saveDB();
  }
  res.json({ success: true });
});

// Heats (Hit List) Endpoints
app.get('/api/heats', (req: Request, res: Response) => {
  res.json(db.heats);
});

app.post('/api/heats', (req: Request, res: Response) => {
  const heat = req.body;
  if (!heat.id) {
    heat.id = `heat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  }

  // Ensure cancelled chest numbers never appear in any hit lists
  const cancelledChests = new Set(
    (db.candidates || []).filter((c: any) => c.isCancelled || c.status === 'cancelled').map((c: any) => Number(c.chestNo))
  );
  if (Array.isArray(heat.participants)) {
    heat.participants = heat.participants.filter((p: any) => !cancelledChests.has(Number(p.chestNo)));
  }

  const idx = db.heats.findIndex((h) => h.id === heat.id);
  if (idx >= 0) {
    db.heats[idx] = heat;
  } else {
    db.heats.push(heat);
  }
  saveDB();
  res.json({ success: true, heat });
});

app.delete('/api/heats/:id', (req: Request, res: Response) => {
  db.heats = db.heats.filter((h) => h.id !== req.params.id);
  saveDB();
  res.json({ success: true });
});

// Results (Final List & Ranking) Endpoints
app.get('/api/results', (req: Request, res: Response) => {
  res.json(db.results);
});

app.post('/api/results', (req: Request, res: Response) => {
  const result = req.body;
  if (!result.id) {
    result.id = `res_evt_${result.eventNo}`;
  }
  const idx = db.results.findIndex((r) => r.id === result.id || Number(r.eventNo) === Number(result.eventNo));
  if (idx >= 0) {
    const existing = db.results[idx];
    const isAlreadyRanked = Boolean(
      existing.completed && (existing.finalists || []).some((f: any) => f.position && f.position >= 1)
    );

    // If already officially ranked, reject altering rankings/finalists
    if (isAlreadyRanked && req.body.forceUpdate !== true) {
      return res.status(403).json({
        error: `Event #${existing.eventNo} rankings are already officially completed and locked against modifications. Only results print is permitted.`,
        isLocked: true,
      });
    }

    db.results[idx] = { ...db.results[idx], ...result };
  } else {
    db.results.push(result);
  }
  syncClubMasterRecords();
  saveDB();
  res.json({ success: true, result });
});

// Database Explorer & Direct Table Operations
app.get('/api/db/raw/:table', (req: Request, res: Response) => {
  const table = req.params.table as keyof DBData;
  if (db[table] === undefined) {
    return res.status(404).json({ error: `Table '${table}' not found` });
  }
  if (table === 'candidates' && Array.isArray(db.candidates)) {
    const sorted = [...db.candidates].sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
    return res.json(sorted);
  }
  if (table === 'events' && Array.isArray(db.events)) {
    const sorted = [...db.events].sort((a, b) => (Number(a.Evt_No) || Number(a.chestNo) || 0) - (Number(b.Evt_No) || Number(b.chestNo) || 0));
    return res.json(sorted);
  }
  res.json(db[table]);
});

app.post('/api/db/raw/:table', (req: Request, res: Response) => {
  const table = req.params.table as keyof DBData;
  if (!Array.isArray(db[table])) {
    return res.status(400).json({ error: `Table '${table}' is not a collection` });
  }
  const row = req.body;
  if (!row.id && table !== 'events') {
    row.id = table === 'candidates' && row.chestNo ? `cand_${row.chestNo}` : `${table}_${Date.now()}`;
  }
  if (table === 'events' && row.Evt_No !== undefined) {
    row.Evt_No = Number(row.Evt_No);
  }
  (db[table] as any[]).push(row);
  saveDB(table);
  if (cloudDb && !isCloudQuotaExceeded) {
    (async () => {
      try {
        if (table === 'events') {
          const docId = `evt_${row.Evt_No}`;
          await setDoc(doc(cloudDb, 'events', docId), sanitizeData({ ...row, Fees: Number(row.Fees ?? 0) }), { merge: true });
        } else if (table === 'clubs') {
          const docId = row.id ? (row.id.startsWith('club_') ? row.id : `club_${row.id}`) : `club_${Date.now()}`;
          await setDoc(doc(cloudDb, 'clubs', docId), sanitizeData(row), { merge: true });
        } else if (table === 'candidates') {
          await setDoc(doc(cloudDb, 'candidates', String(row.id)), sanitizeData(row), { merge: true });
        } else if (table === 'heats') {
          await setDoc(doc(cloudDb, 'heats', String(row.id)), sanitizeData(row), { merge: true });
        } else if (table === 'results') {
          await setDoc(doc(cloudDb, 'results', String(row.id)), sanitizeData(row), { merge: true });
        }
      } catch (e) {
        handleCloudError(e, `raw creating row in ${table}`);
      }
    })();
  }
  res.json({ success: true, row });
});

// Update entire table or settings directly from DB Explorer
app.put('/api/db/raw/:table', (req: Request, res: Response) => {
  const table = req.params.table as keyof DBData;
  if (db[table] === undefined) {
    return res.status(404).json({ error: `Table '${table}' not found` });
  }
  if (table === 'settings') {
    db.settings = { ...db.settings, ...req.body };
  } else if (Array.isArray(req.body)) {
    (db as any)[table] = req.body;
  } else if (Array.isArray(req.body.records)) {
    (db as any)[table] = req.body.records;
  } else {
    return res.status(400).json({ error: 'Expected array of records or settings object' });
  }
  saveDB(table);
  res.json({ success: true, table: db[table] });
});

app.put('/api/db/raw/:table/:id', (req: Request, res: Response) => {
  const table = req.params.table as keyof DBData;
  const id = req.params.id;
  if (table === 'settings') {
    db.settings = { ...db.settings, ...req.body };
    saveDB('settings');
    if (cloudDb && !isCloudQuotaExceeded) {
      setDoc(doc(cloudDb, 'settings', 'meet_settings'), sanitizeData(db.settings), { merge: true }).catch((e) => handleCloudError(e, 'raw settings setDoc'));
    }
    return res.json({ success: true, row: db.settings });
  }
  if (!Array.isArray(db[table])) {
    return res.status(400).json({ error: `Table '${table}' is not a collection` });
  }
  const arr = db[table] as any[];
  let idx = arr.findIndex((item) => {
    if (table === 'events') return String(item.Evt_No) === id || String(item.id) === id;
    if (table === 'results') return String(item.id) === id || String(item.eventNo) === id;
    if (table === 'candidates') return String(item.id) === id || String(item.chestNo) === id;
    if (table === 'clubs') return String(item.id) === id || String(item.name) === id || String(item.shortCode) === id;
    return String(item.id) === id;
  });

  // Fallback match by body properties
  if (idx < 0) {
    idx = arr.findIndex((item) => {
      if (req.body.id && String(item.id) === String(req.body.id)) return true;
      if (table === 'events' && req.body.Evt_No !== undefined && Number(item.Evt_No) === Number(req.body.Evt_No)) return true;
      if (table === 'candidates' && req.body.chestNo !== undefined && String(item.chestNo) === String(req.body.chestNo)) return true;
      if (table === 'results' && req.body.eventNo !== undefined && Number(item.eventNo) === Number(req.body.eventNo)) return true;
      return false;
    });
  }

  let finalRow: any;
  if (idx < 0) {
    finalRow = { ...req.body, id: req.body.id || id };
    arr.push(finalRow);
  } else {
    arr[idx] = { ...arr[idx], ...req.body };
    finalRow = arr[idx];
  }

  saveDB(table);
  if (cloudDb && !isCloudQuotaExceeded) {
    (async () => {
      try {
        if (table === 'events') {
          const docId = `evt_${finalRow.Evt_No !== undefined ? finalRow.Evt_No : id}`;
          await setDoc(doc(cloudDb, 'events', docId), sanitizeData({ ...finalRow, Fees: Number(finalRow.Fees ?? 0) }), { merge: true });
        } else if (table === 'clubs') {
          const clubId = String(finalRow.id || id);
          const docId = clubId.startsWith('club_') ? clubId : `club_${clubId}`;
          await setDoc(doc(cloudDb, 'clubs', docId), sanitizeData(finalRow), { merge: true });
        } else if (table === 'candidates') {
          await setDoc(doc(cloudDb, 'candidates', String(finalRow.id || id)), sanitizeData(finalRow), { merge: true });
        } else if (table === 'heats') {
          await setDoc(doc(cloudDb, 'heats', String(finalRow.id || id)), sanitizeData(finalRow), { merge: true });
        } else if (table === 'results') {
          await setDoc(doc(cloudDb, 'results', String(finalRow.id || id)), sanitizeData(finalRow), { merge: true });
        }
      } catch (e) {
        handleCloudError(e, `raw updating row in ${table}`);
      }
    })();
  }
  return res.json({ success: true, row: finalRow });
});

app.delete('/api/db/raw/:table/:id', (req: Request, res: Response) => {
  const table = req.params.table as keyof DBData;
  const id = req.params.id;
  if (!Array.isArray(db[table])) {
    return res.status(400).json({ error: `Table '${table}' is not a collection` });
  }
  if (table === 'events') {
    db.events = db.events.filter((e) => String(e.Evt_No) !== id && e.id !== id);
  } else if (table === 'results') {
    db.results = db.results.filter((r) => r.id !== id && String(r.eventNo) !== id);
    syncClubMasterRecords();
  } else if (table === 'candidates') {
    db.candidates = db.candidates.filter((c) => c.id !== id && String(c.chestNo) !== id);
    syncClubMasterRecords();
  } else if (table === 'clubs') {
    const target = db.clubs.find((c) => String(c.id) === id || String(c.Reg_Club).toUpperCase() === id.toUpperCase() || String(c.name).toUpperCase() === id.toUpperCase());
    const targetName = (target?.Reg_Club || target?.name || id).trim().toUpperCase();
    if (targetName && targetName !== 'SELF') {
      db.candidates.forEach((c) => {
        if ((c.club || '').trim().toUpperCase() === targetName) {
          c.club = 'SELF';
        }
      });
      saveDBLocalOnly('candidates');
    }
    db.clubs = db.clubs.filter((c) => String(c.id) !== id && String(c.Reg_Club).toUpperCase() !== targetName && String(c.name).toUpperCase() !== targetName);
  } else {
    (db as any)[table] = (db as any)[table].filter((item: any) => item.id !== id);
  }
  saveDB(table);
  if (cloudDb && !isCloudQuotaExceeded) {
    (async () => {
      try {
        if (table === 'events') {
          const cleanNo = id.replace(/^evt_/, '');
          await deleteDoc(doc(cloudDb, 'events', `evt_${cleanNo}`));
          await deleteDoc(doc(cloudDb, 'events', cleanNo)).catch(() => {});
        } else if (table === 'clubs') {
          const cleanId = id.replace(/^club_/, '');
          await deleteDoc(doc(cloudDb, 'clubs', `club_${cleanId}`)).catch(() => {});
          await deleteDoc(doc(cloudDb, 'clubs', id)).catch(() => {});
          const snap = await getDocs(collection(cloudDb, 'clubs'));
          for (const d of snap.docs) {
            const dData = d.data();
            if ((dData.Reg_Club && dData.Reg_Club.toUpperCase() === id.toUpperCase()) || (dData.name && dData.name.toUpperCase() === id.toUpperCase())) {
              await deleteDoc(doc(cloudDb, 'clubs', d.id)).catch(() => {});
            }
          }
        } else {
          await deleteDoc(doc(cloudDb, table, id));
        }
      } catch (e) {
        handleCloudError(e, `raw deleting row in ${table}`);
      }
    })();
  }
  res.json({ success: true });
});

// DB Backup (Export JSON)
app.get('/api/db/export', (req: Request, res: Response) => {
  const dump = {
    ...db,
    clubs: (db.clubs || []).map((c: any) => ({
      ...c,
      mobile: (c.mobile || c.phone || '').trim(),
      phone: (c.phone || c.mobile || '').trim(),
    })),
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    system: 'eSports Sports Management System',
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=eSports_Backup_${Date.now()}.json`);
  res.json(dump);
});

// DB Export (.xlsx) - Two sheets: 'General Entry' and 'Event Allocation'
app.get(['/api/db/export-excel', '/api/db/export-xlsx'], (req: Request, res: Response) => {
  try {
    const currencySymbol = db.settings?.currencySymbol || '₹';

    // 1. Sheet: General Entry
    const sortedCandidates = [...db.candidates].sort((a: any, b: any) => {
      const numA = Number(a.chestNo) || 0;
      const numB = Number(b.chestNo) || 0;
      return numA - numB;
    });

    const generalEntryRows = sortedCandidates.map((c: any, index: number) => {
      let feeStatusText = 'Due';
      const rawStatus = (c.feeStatus || '').trim();
      if (rawStatus.startsWith('Paid') || rawStatus === 'P') {
        feeStatusText = 'Paid';
      } else if (rawStatus.startsWith('Unpaid') || rawStatus.startsWith('Due') || rawStatus === 'U') {
        feeStatusText = 'Due';
      } else if (rawStatus.startsWith('Exempted') || rawStatus.startsWith('Free') || rawStatus === 'E') {
        feeStatusText = 'Free';
      } else if (rawStatus) {
        feeStatusText = rawStatus;
      }

      const evtList = (c.selectedEvents || []).map(Number).sort((a: number, b: number) => a - b);
      const evtStr = evtList.join(',');
      const amtNum = Number(c.totalFees ?? 0);
      const amtStr = `${currencySymbol} ${amtNum.toFixed(2)}`;

      return {
        Sl_No: index + 1,
        Chest_No: Number(c.chestNo) || '',
        Name_: (c.name || '').toUpperCase().trim(),
        Club_Name: (c.club || '').trim(),
        Height: c.height || '',
        Gndr: (c.gender || '').toUpperCase().trim(),
        Fees: feeStatusText,
        Evt: evtStr,
        _Amt: amtStr,
      };
    });

    const wsGeneralEntry = XLSX.utils.json_to_sheet(generalEntryRows, {
      header: ['Sl_No', 'Chest_No', 'Name_', 'Club_Name', 'Height', 'Gndr', 'Fees', 'Evt', '_Amt'],
    });

    wsGeneralEntry['!cols'] = [
      { wch: 8 },  // Sl_No
      { wch: 10 }, // Chest_No
      { wch: 26 }, // Name_
      { wch: 22 }, // Club_Name
      { wch: 10 }, // Height
      { wch: 14 }, // Gndr
      { wch: 10 }, // Fees
      { wch: 12 }, // Evt
      { wch: 14 }, // _Amt
    ];

    // 2. Sheet: Event Allocation
    const heatParticipantsMap = new Map<string, { qualified?: boolean; heatNumber: number }>();
    (db.heats || []).forEach((h: any) => {
      const evtNo = Number(h.eventNo);
      (h.participants || []).forEach((p: any) => {
        const chestNo = Number(p.chestNo);
        heatParticipantsMap.set(`${evtNo}_${chestNo}`, {
          qualified: Boolean(p.qualified),
          heatNumber: h.heatNumber,
        });
      });
    });

    const finalistsMap = new Map<string, { position?: number; jumpRecord?: string; resultValue?: string }>();
    (db.results || []).forEach((r: any) => {
      const evtNo = Number(r.eventNo);
      (r.finalists || []).forEach((f: any) => {
        const chestNo = Number(f.chestNo);
        finalistsMap.set(`${evtNo}_${chestNo}`, {
          position: f.position,
          jumpRecord: f.jumpRecord || f.resultValue,
          resultValue: f.resultValue || f.jumpRecord,
        });
      });
      (r.winners || []).forEach((w: any) => {
        const chestNo = Number(w.chestNo);
        if (!finalistsMap.has(`${evtNo}_${chestNo}`)) {
          finalistsMap.set(`${evtNo}_${chestNo}`, {
            position: w.position,
            jumpRecord: w.jumpRecord || w.resultValue,
            resultValue: w.resultValue || w.jumpRecord,
          });
        }
      });
    });

    const eventsMap = new Map<number, any>();
    (db.events || []).forEach((e) => eventsMap.set(Number(e.Evt_No), e));

    interface AllocItem {
      chestNo: number;
      evtNo: number;
    }

    const allocItems: AllocItem[] = [];
    const allEventNos = Array.from(
      new Set([
        ...(db.events || []).map((e: any) => Number(e.Evt_No)),
        ...(db.candidates || []).flatMap((c: any) => (c.selectedEvents || []).map(Number)),
        ...(db.heats || []).map((h: any) => Number(h.eventNo)),
        ...(db.results || []).map((r: any) => Number(r.eventNo)),
      ])
    ).sort((a: number, b: number) => a - b);

    allEventNos.forEach((evtNo: number) => {
      const enrolledForEvt = (db.candidates || [])
        .filter((c: any) => {
          const chest = Number(c.chestNo);
          if (!chest || chest < 100) return false;
          if (c.status === 'cancelled' || c.isCancelled) return false;
          const inSelected = (c.selectedEvents || []).map(Number).includes(evtNo);
          const inHeat = heatParticipantsMap.has(`${evtNo}_${chest}`);
          const inFinal = finalistsMap.has(`${evtNo}_${chest}`);
          return inSelected || inHeat || inFinal;
        })
        .sort((a: any, b: any) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));

      enrolledForEvt.forEach((cand: any) => {
        allocItems.push({
          chestNo: Number(cand.chestNo),
          evtNo,
        });
      });
    });

    const eventAllocRows = allocItems.map((item, index) => {
      const { chestNo, evtNo } = item;
      const evt = eventsMap.get(evtNo);
      const requiresHit = evt ? evt.requiredHit !== false : true;
      const key = `${evtNo}_${chestNo}`;

      const heatInfo = heatParticipantsMap.get(key);
      const finalistInfo = finalistsMap.get(key);

      let hitFlag = true;
      if (heatInfo !== undefined) {
        hitFlag = heatInfo.qualified !== false;
      }

      let finalFlag = false;
      if (finalistInfo !== undefined) {
        finalFlag = true;
      } else if (heatInfo && heatInfo.qualified) {
        finalFlag = true;
      } else if (!requiresHit) {
        finalFlag = true;
      }

      const position = finalistInfo?.position && finalistInfo.position >= 1 && finalistInfo.position <= 6
        ? finalistInfo.position
        : null;
      const isAwarded = position !== null;

      const prizeFlags: Record<string, boolean> = {
        Prize_1st: position === 1,
        Prize_2nd: position === 2,
        Prize_3rd: position === 3,
        Prize_4th: position === 4,
        Prize_5th: position === 5,
        Prize_6th: position === 6,
      };

      const jumpValues: Record<string, string> = {
        Jump_1st: position === 1 && finalistInfo?.jumpRecord ? finalistInfo.jumpRecord : '',
        Jump_2nd: position === 2 && finalistInfo?.jumpRecord ? finalistInfo.jumpRecord : '',
        Jump_3rd: position === 3 && finalistInfo?.jumpRecord ? finalistInfo.jumpRecord : '',
        Jump_4th: position === 4 && finalistInfo?.jumpRecord ? finalistInfo.jumpRecord : '',
        Jump_5th: position === 5 && finalistInfo?.jumpRecord ? finalistInfo.jumpRecord : '',
        Jump_6th: position === 6 && finalistInfo?.jumpRecord ? finalistInfo.jumpRecord : '',
      };

      return {
        Sl_No: index + 1,
        Chest_No: chestNo,
        Evt_No: evtNo,
        Hit_Flag: hitFlag ? 'TRUE' : 'FALSE',
        Final_Flag: finalFlag ? 'TRUE' : 'FALSE',
        Awd: isAwarded ? 'TRUE' : 'FALSE',
        Prize_1st: prizeFlags.Prize_1st ? 'TRUE' : 'FALSE',
        Jump_1st: jumpValues.Jump_1st,
        Prize_2nd: prizeFlags.Prize_2nd ? 'TRUE' : 'FALSE',
        Jump_2nd: jumpValues.Jump_2nd,
        Prize_3rd: prizeFlags.Prize_3rd ? 'TRUE' : 'FALSE',
        Jump_3rd: jumpValues.Jump_3rd,
        Prize_4th: prizeFlags.Prize_4th ? 'TRUE' : 'FALSE',
        Jump_4th: jumpValues.Jump_4th,
        Prize_5th: prizeFlags.Prize_5th ? 'TRUE' : 'FALSE',
        Jump_5th: jumpValues.Jump_5th,
        Prize_6th: prizeFlags.Prize_6th ? 'TRUE' : 'FALSE',
        Jump_6th: jumpValues.Jump_6th,
      };
    });

    const wsEventAlloc = XLSX.utils.json_to_sheet(eventAllocRows, {
      header: [
        'Sl_No',
        'Chest_No',
        'Evt_No',
        'Hit_Flag',
        'Final_Flag',
        'Awd',
        'Prize_1st',
        'Jump_1st',
        'Prize_2nd',
        'Jump_2nd',
        'Prize_3rd',
        'Jump_3rd',
        'Prize_4th',
        'Jump_4th',
        'Prize_5th',
        'Jump_5th',
        'Prize_6th',
        'Jump_6th',
      ],
    });

    wsEventAlloc['!cols'] = [
      { wch: 8 },  // Sl_No
      { wch: 10 }, // Chest_No
      { wch: 8 },  // Evt_No
      { wch: 10 }, // Hit_Flag
      { wch: 10 }, // Final_Flag
      { wch: 8 },  // Awd
      { wch: 10 }, // Prize_1st
      { wch: 14 }, // Jump_1st
      { wch: 10 }, // Prize_2nd
      { wch: 14 }, // Jump_2nd
      { wch: 10 }, // Prize_3rd
      { wch: 14 }, // Jump_3rd
      { wch: 10 }, // Prize_4th
      { wch: 14 }, // Jump_4th
      { wch: 10 }, // Prize_5th
      { wch: 14 }, // Jump_5th
      { wch: 10 }, // Prize_6th
      { wch: 14 }, // Jump_6th
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsGeneralEntry, 'General Entry');
    XLSX.utils.book_append_sheet(wb, wsEventAlloc, 'Event Allocation');

    // 3. Sheet: Clubs
    const clubsRows = (db.clubs || []).map((c: any) => ({
      ID: c.id || '',
      Club_Name: (c.name || '').trim(),
      Short_Code: (c.shortCode || '').trim(),
      Mobile: (c.mobile || c.phone || '').trim(),
      Phone: (c.phone || c.mobile || '').trim(),
      Contact_Person: (c.contactPerson || '').trim(),
      Address: (c.address || '').trim(),
    }));
    const wsClubs = XLSX.utils.json_to_sheet(clubsRows);
    wsClubs['!cols'] = [
      { wch: 12 }, // ID
      { wch: 32 }, // Club_Name
      { wch: 12 }, // Short_Code
      { wch: 18 }, // Mobile
      { wch: 18 }, // Phone
      { wch: 22 }, // Contact_Person
      { wch: 35 }, // Address
    ];
    XLSX.utils.book_append_sheet(wb, wsClubs, 'Clubs');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=eSports_Data_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.send(buffer);
  } catch (err: any) {
    console.error('[EXCEL EXPORT ERROR]:', err);
    res.status(500).json({ error: 'Failed to generate Excel workbook: ' + err.message });
  }
});

// DB Restore (Import)
app.post('/api/db/restore', (req: Request, res: Response) => {
  const dump = req.body;
  if (!dump || (!dump.events && !dump.candidates)) {
    return res.status(400).json({ error: 'Invalid database backup JSON format' });
  }
  db = {
    events: dump.events || [...DEFAULT_EVENTS],
    candidates: dump.candidates || [],
    clubs: dump.clubs || [...DEFAULT_CLUBS],
    results: dump.results || [],
    heats: dump.heats || [],
    settings: dump.settings || { ...DEFAULT_SETTINGS },
    clientUploads: dump.clientUploads || [],
    lastUpdated: new Date().toISOString(),
  };
  saveDB();
  res.json({
    success: true,
    message: `Database restored successfully! (${db.candidates.length} candidates, ${db.events.length} events, ${db.clubs.length} clubs)`,
    stats: {
      candidates: db.candidates.length,
      events: db.events.length,
      clubs: db.clubs.length,
      results: db.results.length,
    },
  });
});

// DB Sample Data: 20 Candidates for Testing
app.post('/api/db/sample-data', (req: Request, res: Response) => {
  const SAMPLE_CANDIDATES = [
    {
      id: 'cand_101',
      chestNo: 101,
      name: 'Aarav Mondal',
      club: 'Agrani Sasthitala Sangha',
      gender: 'CHILDRENS',
      height: '3`-4``',
      selectedEvents: [0],
      totalFees: 10.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_102',
      chestNo: 102,
      name: 'Rohan Sen',
      club: 'Agrani Sasthitala Sangha',
      gender: 'CHILDRENS',
      height: '3`-8``',
      selectedEvents: [1, 2],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_103',
      chestNo: 103,
      name: 'Ishaan Ghosh',
      club: 'Milan Samity Athletic Club',
      gender: 'CHILDRENS',
      height: '3`-8``',
      selectedEvents: [1, 15],
      totalFees: 30.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_104',
      chestNo: 104,
      name: 'Sourav Roy',
      club: 'Milan Samity Athletic Club',
      gender: 'BOYS',
      height: '4`-2``',
      selectedEvents: [3, 4],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_105',
      chestNo: 105,
      name: 'Debojyoti Paul',
      club: 'Tarun Sangha Sports Club',
      gender: 'BOYS',
      height: '4`-2``',
      selectedEvents: [3, 5],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_106',
      chestNo: 106,
      name: 'Subham Dutta',
      club: 'Tarun Sangha Sports Club',
      gender: 'BOYS',
      height: '4`-6``',
      selectedEvents: [5, 6],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_107',
      chestNo: 107,
      name: 'Aniket Banerjee',
      club: 'Subhash Nagar Yuba Parishad',
      gender: 'BOYS',
      height: '4`-6``',
      selectedEvents: [5, 7],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_108',
      chestNo: 108,
      name: 'Pritam Samanta',
      club: 'Subhash Nagar Yuba Parishad',
      gender: 'BOYS',
      height: '4`-10``',
      selectedEvents: [7, 8],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_109',
      chestNo: 109,
      name: 'Rajdeep Bhattacharya',
      club: 'Agrani Sasthitala Sangha',
      gender: 'BOYS',
      height: '4`-10``',
      selectedEvents: [7, 8, 15],
      totalFees: 40.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_110',
      chestNo: 110,
      name: 'Koustav Nandy',
      club: 'Independent / Unattached',
      gender: 'BOYS',
      height: '4`-6``',
      selectedEvents: [6, 15],
      totalFees: 30.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_111',
      chestNo: 111,
      name: 'Ananya Sarkar',
      club: 'Agrani Sasthitala Sangha',
      gender: 'GIRLS',
      height: '4`-2``',
      selectedEvents: [9, 10],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_112',
      chestNo: 112,
      name: 'Riya Chatterjee',
      club: 'Agrani Sasthitala Sangha',
      gender: 'GIRLS',
      height: '4`-2``',
      selectedEvents: [9, 11],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_113',
      chestNo: 113,
      name: 'Suhani Karmakar',
      club: 'Milan Samity Athletic Club',
      gender: 'GIRLS',
      height: '4`-6``',
      selectedEvents: [11, 12],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_114',
      chestNo: 114,
      name: 'Tanushree Majumdar',
      club: 'Milan Samity Athletic Club',
      gender: 'GIRLS',
      height: '4`-6``',
      selectedEvents: [11, 13],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_115',
      chestNo: 115,
      name: 'Sneha Bhowmik',
      club: 'Tarun Sangha Sports Club',
      gender: 'GIRLS',
      height: '4`-10``',
      selectedEvents: [13, 14],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_116',
      chestNo: 116,
      name: 'Pooja Biswas',
      club: 'Tarun Sangha Sports Club',
      gender: 'GIRLS',
      height: '4`-10``',
      selectedEvents: [13, 14, 15],
      totalFees: 40.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_117',
      chestNo: 117,
      name: 'Moumita Halder',
      club: 'Subhash Nagar Yuba Parishad',
      gender: 'GIRLS',
      height: '4`-6``',
      selectedEvents: [12, 15],
      totalFees: 30.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_118',
      chestNo: 118,
      name: 'Sayan Mitra',
      club: 'Agrani Sasthitala Sangha',
      gender: 'BOYS',
      height: '4`-2``',
      selectedEvents: [4, 15],
      totalFees: 30.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_119',
      chestNo: 119,
      name: 'Trisha Das',
      club: 'Subhash Nagar Yuba Parishad',
      gender: 'CHILDRENS',
      height: '3`-4``',
      selectedEvents: [0],
      totalFees: 10.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
    {
      id: 'cand_120',
      chestNo: 120,
      name: 'Arpan Chakraborty',
      club: 'Agrani Sasthitala Sangha',
      gender: 'BOYS',
      height: '4`-6``',
      selectedEvents: [5, 8],
      totalFees: 20.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: true,
      isDirty: false,
      syncedAt: new Date().toISOString(),
    },
  ];

  db.candidates = [...SAMPLE_CANDIDATES];
  saveDB();
  res.json({
    success: true,
    message: 'Loaded 20 sample candidates for testing!',
    count: db.candidates.length,
    candidates: db.candidates,
  });
});

app.post('/api/db/purge-except-events', (req: Request, res: Response) => {
  db.candidates = [];
  db.results = [];
  db.heats = [];
  db.clientUploads = [];
  // Preserve events list master data
  saveDB();
  res.json({
    success: true,
    message: 'All candidates, uploads, heats, and results deleted from database. Event list master data preserved.',
    preservedEventsCount: db.events.length,
  });
});

app.post('/api/db/clear', (req: Request, res: Response) => {
  db.candidates = [];
  db.results = [];
  db.heats = [];
  db.clientUploads = [];
  saveDB();
  res.json({ success: true, message: 'Cleared candidates, heats, results, and uploads' });
});

app.post('/api/db/factory-reset', (req: Request, res: Response) => {
  db = {
    events: [...DEFAULT_EVENTS],
    candidates: [],
    clubs: [],
    results: [],
    heats: [],
    settings: { ...DEFAULT_SETTINGS },
    clientUploads: [],
    lastUpdated: new Date().toISOString(),
  };
  syncClubMasterRecords(true);
  saveDB('all');
  console.log('[DB] Factory reset performed: all tables reset to default state.');
  res.json({
    success: true,
    message: 'Database reset to factory defaults successfully!',
    stats: {
      candidates: 0,
      events: db.events.length,
      clubs: db.clubs.length,
      results: 0,
      heats: 0,
    },
  });
});

// ----------------------------------------------------
// VITE OR STATIC SERVING
// ----------------------------------------------------
async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  // In AI Studio dev environment: 'npm run dev' is executed (process.env.npm_lifecycle_event === 'dev')
  // In AI Studio production deployment: 'npm start' runs 'node server.ts' and dist exists.
  const isDev = process.env.npm_lifecycle_event === 'dev' || (!hasDist && process.env.NODE_ENV !== 'production');
  const isProduction = !isDev;

  if (isProduction) {
    console.log('[eSports] Production mode: Serving static build from dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('[eSports] Development mode: Starting Vite dev server middleware');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[eSports] Sports Management Server running on port ${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer();

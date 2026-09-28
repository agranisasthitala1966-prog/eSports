import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Enable CORS for cross-origin client syncing (between mobile dev/pre domains and desktop)
app.use((req, res, next) => {
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

// Initial data definition
const DEFAULT_EVENTS = [
  { Evt_No: 0, Evt_Name: '50 MTS. RUN', Height: '3`-4``', Gender: 'CHILDRENS', Fees: 10.0 },
  { Evt_No: 1, Evt_Name: '50 MTS. RUN', Height: '3`-8``', Gender: 'CHILDRENS', Fees: 10.0 },
  { Evt_No: 2, Evt_Name: 'KANAMACHHI', Height: '3`-8``', Gender: 'CHILDRENS', Fees: 10.0 },
  { Evt_No: 3, Evt_Name: '100 MTS. RUN', Height: '4`-2``', Gender: 'BOYS', Fees: 10.0 },
  { Evt_No: 4, Evt_Name: 'POTATO RACE', Height: '4`-2``', Gender: 'BOYS', Fees: 10.0 },
  { Evt_No: 5, Evt_Name: '200 MTS. RUN', Height: '4`-6``', Gender: 'BOYS', Fees: 10.0 },
  { Evt_No: 6, Evt_Name: 'BROAD JUMP', Height: '4`-6``', Gender: 'BOYS', Fees: 10.0 },
  { Evt_No: 7, Evt_Name: '200 MTS. RUN', Height: '4`-10``', Gender: 'BOYS', Fees: 10.0 },
  { Evt_No: 8, Evt_Name: 'BROAD JUMP', Height: '4`-10``', Gender: 'BOYS', Fees: 10.0 },
  { Evt_No: 9, Evt_Name: '100 MTS. RUN', Height: '4`-2``', Gender: 'GIRLS', Fees: 10.0 },
  { Evt_No: 10, Evt_Name: 'POTATO RACE', Height: '4`-2``', Gender: 'GIRLS', Fees: 10.0 },
  { Evt_No: 11, Evt_Name: '200 MTS. RUN', Height: '4`-6``', Gender: 'GIRLS', Fees: 10.0 },
  { Evt_No: 12, Evt_Name: 'BROAD JUMP', Height: '4`-6``', Gender: 'GIRLS', Fees: 10.0 },
  { Evt_No: 13, Evt_Name: '200 MTS. RUN', Height: '4`-10``', Gender: 'GIRLS', Fees: 10.0 },
  { Evt_No: 14, Evt_Name: 'BROAD JUMP', Height: '4`-10``', Gender: 'GIRLS', Fees: 10.0 },
  { Evt_No: 15, Evt_Name: 'GO AS YOU LIKE', Height: 'ALL', Gender: 'ALL', Fees: 20.0 },
];

const DEFAULT_CLUBS = [
  {
    id: 'club_1',
    name: 'Agrani Sasthitala Sangha',
    shortCode: 'ASS',
    logoUrl: '/icon.svg',
    contactPerson: 'S. Chakraborty',
    phone: '+91 98301 23456',
    address: 'Sasthitala Main Road, Ward 4',
  },
  {
    id: 'club_2',
    name: 'Milan Samity Athletic Club',
    shortCode: 'MSAC',
    logoUrl: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=100&auto=format&fit=crop&q=60',
    contactPerson: 'P. Banerjee',
    phone: '+91 98311 87654',
    address: 'Station Road North, Block B',
  },
  {
    id: 'club_3',
    name: 'Tarun Sangha Sports Club',
    shortCode: 'TSSC',
    logoUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=100&auto=format&fit=crop&q=60',
    contactPerson: 'R. Mukherjee',
    phone: '+91 94330 55432',
    address: 'Vivekananda Sarani, Sector 2',
  },
  {
    id: 'club_4',
    name: 'Subhash Nagar Yuba Parishad',
    shortCode: 'SNYP',
    logoUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=100&auto=format&fit=crop&q=60',
    contactPerson: 'A. Dasgupta',
    phone: '+91 98322 11987',
    address: 'Subhash Pally, Ground Lane',
  },
  {
    id: 'club_5',
    name: 'Independent / Unattached',
    shortCode: 'IND',
    logoUrl: '/icon.svg',
    contactPerson: 'Individual Entry',
    phone: '-',
    address: 'General Public Entry',
  },
];

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
      
      // Deduplicate candidates by ID in case any duplicate was written
      const rawCandidates = parsed.candidates || [];
      const candidateMap = new Map<string, any>();
      rawCandidates.forEach((cand: any) => {
        if (cand && cand.id) {
          candidateMap.set(cand.id, cand);
        }
      });
      const uniqueCandidates = Array.from(candidateMap.values());

      db = {
        events: parsed.events || [...DEFAULT_EVENTS],
        candidates: uniqueCandidates,
        clubs: parsed.clubs || [...DEFAULT_CLUBS],
        results: parsed.results || [],
        heats: parsed.heats || [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        clientUploads: parsed.clientUploads || [],
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
      };
      console.log(`[DB] Loaded ${db.candidates.length} candidates, ${db.clientUploads.length} client uploads, ${db.events.length} events.`);
    } else {
      saveDB();
    }
  } catch (err) {
    console.error('[DB] Failed to load DB file, using default in-memory state', err);
  }
}

function saveDB() {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Failed to save DB to disk', err);
  }
}

loadDB();

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    candidateCount: db.candidates.length,
    eventsCount: db.events.length,
    meetTitle: db.settings.ordinalTitle,
  });
});

// Events Endpoints
app.get('/api/events', (req: Request, res: Response) => {
  res.json(db.events);
});

app.post('/api/events', (req: Request, res: Response) => {
  const newEvt = req.body;
  if (newEvt.Evt_No === undefined || !newEvt.Evt_Name) {
    return res.status(400).json({ error: 'Evt_No and Evt_Name are required' });
  }
  const existingIdx = db.events.findIndex((e) => Number(e.Evt_No) === Number(newEvt.Evt_No));
  if (existingIdx >= 0) {
    db.events[existingIdx] = { ...db.events[existingIdx], ...newEvt };
  } else {
    db.events.push(newEvt);
  }
  db.events.sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));
  saveDB();
  res.json({ success: true, event: newEvt });
});

app.put('/api/events/:evtNo', (req: Request, res: Response) => {
  const evtNo = Number(req.params.evtNo);
  const idx = db.events.findIndex((e) => Number(e.Evt_No) === evtNo);
  if (idx < 0) {
    return res.status(404).json({ error: 'Event not found' });
  }
  db.events[idx] = { ...db.events[idx], ...req.body, Evt_No: evtNo };
  saveDB();
  res.json({ success: true, event: db.events[idx] });
});

app.delete('/api/events/:evtNo', (req: Request, res: Response) => {
  const evtNo = Number(req.params.evtNo);
  db.events = db.events.filter((e) => Number(e.Evt_No) !== evtNo);
  saveDB();
  res.json({ success: true });
});

app.post('/api/events/reset', (req: Request, res: Response) => {
  db.events = [...DEFAULT_EVENTS];
  saveDB();
  res.json({ success: true, events: db.events });
});

// Candidates Endpoints
app.get('/api/candidates', (req: Request, res: Response) => {
  res.json(db.candidates);
});

// Single candidate create or update (for server front-end direct entry)
app.post('/api/candidates', (req: Request, res: Response) => {
  const cand = req.body;
  if (!cand.name) {
    return res.status(400).json({ error: 'Candidate name is required' });
  }

  const id = cand.id || `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const existingIdx = db.candidates.findIndex((c) => c.id === id);

  if (existingIdx >= 0) {
    const existing = db.candidates[existingIdx];
    const isCancelling = cand.status === 'cancelled' || cand.isCancelled === true;
    if (!isCancelling) {
      const qualifiedEvents: number[] = [];
      (db.results || []).forEach((r: any) => {
        if (r.finalists && r.finalists.some((f: any) => Number(f.chestNo) === Number(existing.chestNo))) {
          qualifiedEvents.push(Number(r.eventNo));
        }
      });
      (db.heats || []).forEach((h: any) => {
        if (h.participants && h.participants.some((p: any) => Number(p.chestNo) === Number(existing.chestNo) && Boolean(p.qualified))) {
          if (!qualifiedEvents.includes(Number(h.eventNo))) {
            qualifiedEvents.push(Number(h.eventNo));
          }
        }
      });

      if (qualifiedEvents.length > 0) {
        const evtList = qualifiedEvents.map(n => `#${n}`).join(', ');
        return res.status(403).json({
          error: `Editing restricted: Candidate "${existing.name}" (Chest #${existing.chestNo}) has already qualified from hit to final in Event(s) ${evtList}. Editing is not permitted even if heats of other events are not completed yet.`,
          qualifiedEvents,
          isEditRestricted: true,
        });
      }
    }
  }

  let assignedChestNo: number;
  if (cand.chestNo && Number(cand.chestNo) >= 101) {
    assignedChestNo = Number(cand.chestNo);
  } else if (existingIdx >= 0 && db.candidates[existingIdx].chestNo && Number(db.candidates[existingIdx].chestNo) >= 101) {
    assignedChestNo = Number(db.candidates[existingIdx].chestNo);
  } else {
    const highestChest = db.candidates.reduce((max, c) => {
      const num = parseInt(String(c.chestNo), 10) || 0;
      return num > max ? num : max;
    }, 100);
    assignedChestNo = highestChest + 1;
  }

  const candidateRecord = {
    ...(existingIdx >= 0 ? db.candidates[existingIdx] : {}),
    ...cand,
    id,
    chestNo: assignedChestNo,
    createdAt: (existingIdx >= 0 ? db.candidates[existingIdx].createdAt : cand.createdAt) || now,
    updatedAt: now,
    synced: true,
    isDirty: false,
    syncedAt: now,
  };

  if (existingIdx >= 0) {
    db.candidates[existingIdx] = candidateRecord;
  } else {
    db.candidates.push(candidateRecord);
  }

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

  // Restrict edit for candidates who already qualified from hit to final in at least one event
  const isCancelling = req.body.status === 'cancelled' || req.body.isCancelled === true;
  if (!isCancelling) {
    const qualifiedEvents: number[] = [];
    (db.results || []).forEach((r: any) => {
      if (r.finalists && r.finalists.some((f: any) => Number(f.chestNo) === Number(existing.chestNo))) {
        qualifiedEvents.push(Number(r.eventNo));
      }
    });
    (db.heats || []).forEach((h: any) => {
      if (h.participants && h.participants.some((p: any) => Number(p.chestNo) === Number(existing.chestNo) && Boolean(p.qualified))) {
        if (!qualifiedEvents.includes(Number(h.eventNo))) {
          qualifiedEvents.push(Number(h.eventNo));
        }
      }
    });

    if (qualifiedEvents.length > 0) {
      const evtList = qualifiedEvents.map(n => `#${n}`).join(', ');
      return res.status(403).json({
        error: `Editing restricted: Candidate "${existing.name}" (Chest #${existing.chestNo}) has already qualified from hit to final in Event(s) ${evtList}. Editing is not permitted even if heats of other events are not completed yet.`,
        qualifiedEvents,
        isEditRestricted: true,
      });
    }
  }

  const now = new Date().toISOString();
  db.candidates[idx] = {
    ...db.candidates[idx],
    ...req.body,
    id,
    updatedAt: now,
    synced: true,
    isDirty: false,
    syncedAt: now,
  };
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

    const candidateRecord = {
      ...cand,
      chestNo: assignedChestNo,
      synced: true,
      isDirty: false,
      syncedAt: now,
      updatedAt: cand.updatedAt || now,
    };

    if (idx >= 0) {
      db.candidates[idx] = candidateRecord;
    } else {
      db.candidates.push(candidateRecord);
    }
    savedIds.push(candidateRecord.id);
    updatedCandidates.push(candidateRecord);
  });

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
  res.json(db.clubs);
});

app.post('/api/clubs', (req: Request, res: Response) => {
  const club = req.body;
  if (!club.name) {
    return res.status(400).json({ error: 'Club name is required' });
  }
  const id = club.id || `club_${Date.now()}`;
  const newClub = { ...club, id };
  const idx = db.clubs.findIndex((c) => c.id === id);
  if (idx >= 0) {
    db.clubs[idx] = newClub;
  } else {
    db.clubs.push(newClub);
  }
  saveDB();
  res.json({ success: true, club: newClub });
});

app.put('/api/clubs/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const idx = db.clubs.findIndex((c) => c.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'Club not found' });
  }
  db.clubs[idx] = { ...db.clubs[idx], ...req.body, id };
  saveDB();
  res.json({ success: true, club: db.clubs[idx] });
});

app.delete('/api/clubs/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  db.clubs = db.clubs.filter((c) => c.id !== id);
  saveDB();
  res.json({ success: true });
});

// Settings Endpoints
app.get('/api/settings', (req: Request, res: Response) => {
  res.json(db.settings);
});

app.post('/api/settings', (req: Request, res: Response) => {
  db.settings = { ...db.settings, ...req.body };
  saveDB();
  res.json({ success: true, settings: db.settings });
});

// ----------------------------------------------------
// AUTH & PIN MANAGEMENT ENDPOINTS
// ----------------------------------------------------
app.post('/api/auth/verify-pin', (req: Request, res: Response) => {
  const { pin } = req.body;
  const currentPin = db.settings?.serverPin || '1234';
  if (pin === currentPin) {
    return res.json({ success: true, message: 'PIN verified successfully' });
  }
  return res.status(401).json({ success: false, error: 'Incorrect PIN. Please try again.' });
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
  const { club, clientName, candidates, totalFees, notes } = req.body;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'At least one candidate is required for upload' });
  }

  const targetClub = (club || candidates[0]?.club || 'Independent / Unattached').trim();
  const now = new Date().toISOString();

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

    existingBatch.uploadedAt = now;
    if (clientName) existingBatch.clientName = clientName;
    if (notes) existingBatch.notes = notes;
    existingBatch.totalFees = existingBatch.candidates.reduce(
      (sum: number, c: any) => sum + (Number(c.totalFees) || 0),
      0
    );

    saveDB();

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
      clientName: clientName || '',
      uploadedAt: now,
      status: 'pending', // Pending review & approval
      candidates: processedCandidates,
      totalFees: Number(totalFees) || processedCandidates.reduce((sum: number, c: any) => sum + (Number(c.totalFees) || 0), 0),
      notes: notes || '',
    };

    db.clientUploads.unshift(newUpload);
    saveDB();

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

    const officialCandidate = {
      ...(existingIdx >= 0 ? db.candidates[existingIdx] : {}),
      ...cand,
      chestNo: assignedChestNo,
      club: cand.club || upload.club,
      synced: true,
      isDirty: false,
      syncedAt: now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      db.candidates[existingIdx] = officialCandidate;
    } else {
      db.candidates.push(officialCandidate);
    }
    cand.merged = true;
    cand.status = 'merged';
    cand.chestNo = assignedChestNo;
    mergedList.push(officialCandidate);
  });

  // Update upload batch status
  upload.status = 'merged';
  upload.mergedAt = now;
  upload.reviewedAt = now;
  db.clientUploads[uploadIdx] = upload;

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
  const officialCandidate = {
    ...(existingIdx >= 0 ? db.candidates[existingIdx] : {}),
    ...cand,
    chestNo: assignedChestNo,
    club: cand.club || upload.club,
    synced: true,
    isDirty: false,
    syncedAt: now,
    updatedAt: now,
  };

  if (existingIdx >= 0) {
    db.candidates[existingIdx] = officialCandidate;
  } else {
    db.candidates.push(officialCandidate);
  }

  cand.merged = true;
  cand.status = 'merged';
  cand.chestNo = assignedChestNo;

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
  saveDB();
  res.json({ success: true, result });
});

// Database Explorer & Direct Table Operations
app.get('/api/db/raw/:table', (req: Request, res: Response) => {
  const table = req.params.table as keyof DBData;
  if (db[table] === undefined) {
    return res.status(404).json({ error: `Table '${table}' not found` });
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
    row.id = `row_${Date.now()}`;
  }
  (db[table] as any[]).push(row);
  saveDB();
  res.json({ success: true, row });
});

app.put('/api/db/raw/:table/:id', (req: Request, res: Response) => {
  const table = req.params.table as keyof DBData;
  const id = req.params.id;
  if (!Array.isArray(db[table])) {
    return res.status(400).json({ error: `Table '${table}' is not a collection` });
  }
  const arr = db[table] as any[];
  const idx = arr.findIndex((item) => (table === 'events' ? String(item.Evt_No) === id : item.id === id));
  if (idx < 0) {
    return res.status(404).json({ error: 'Record not found' });
  }
  arr[idx] = { ...arr[idx], ...req.body };
  saveDB();
  res.json({ success: true, row: arr[idx] });
});

app.delete('/api/db/raw/:table/:id', (req: Request, res: Response) => {
  const table = req.params.table as keyof DBData;
  const id = req.params.id;
  if (!Array.isArray(db[table])) {
    return res.status(400).json({ error: `Table '${table}' is not a collection` });
  }
  if (table === 'events') {
    db.events = db.events.filter((e) => String(e.Evt_No) !== id);
  } else {
    (db as any)[table] = (db as any)[table].filter((item: any) => item.id !== id);
  }
  saveDB();
  res.json({ success: true });
});

// DB Backup (Export)
app.get('/api/db/export', (req: Request, res: Response) => {
  const dump = {
    ...db,
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    system: 'eSports Sports Management System',
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=eSports_Backup_${Date.now()}.json`);
  res.json(dump);
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

app.post('/api/db/clear', (req: Request, res: Response) => {
  db.candidates = [];
  db.results = [];
  db.heats = [];
  saveDB();
  res.json({ success: true, message: 'Cleared candidates, heats, and results' });
});

// ----------------------------------------------------
// VITE OR STATIC SERVING
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[eSports] Sports Management Server running on port ${PORT}`);
  });
}

startServer();

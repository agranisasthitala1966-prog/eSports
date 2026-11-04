import * as XLSX from 'xlsx';
import { Candidate, SportEvent, EventHeat, EventResult, SportsMeetSettings, Club } from '../types';

export interface ExcelExportData {
  candidates: Candidate[];
  events: SportEvent[];
  heats: EventHeat[];
  results: EventResult[];
  settings?: SportsMeetSettings;
  clubs?: Club[];
}

/**
 * Generates an Excel workbook with exact structure requested:
 * Sheet 1: 'General Entry' as per image.png
 *   Columns: Sl_No | Chest_No | Name_ | Club_Name | Height | Gndr | Fees | Evt | _Amt
 * 
 * Sheet 2: 'Event Allocation' as per Evnt_Alloc.png
 *   Columns: Sl_No | Chest_No | Evt_No | Hit_Flag | Final_Flag | Awd | Prize_1st | Jump_1st | Prize_2nd | Jump_2nd | Prize_3rd | Jump_3rd | Prize_4th | Jump_4th | Prize_5th | Jump_5th | Prize_6th | Jump_6th
 */
export function generateSportsMeetExcelWorkbook(data: ExcelExportData): XLSX.WorkBook {
  const { candidates = [], events = [], heats = [], results = [], settings } = data;
  const currencySymbol = settings?.currencySymbol || '₹';

  // ----------------------------------------------------
  // 1. SHEET: 'General Entry'
  // Headers: Sl_No, Chest_No, Name_, Club_Name, Height, Gndr, Fees, Evt, _Amt
  // ----------------------------------------------------
  const sortedCandidates = [...candidates].sort((a, b) => {
    const numA = Number(a.chestNo) || 0;
    const numB = Number(b.chestNo) || 0;
    return numA - numB;
  });

  const generalEntryRows = sortedCandidates.map((c, index) => {
    // Normalizing fee status text (e.g. Paid, Due, Free, etc.)
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

    // Evt: Comma separated applied event numbers, e.g. "1,2"
    const evtList = (c.selectedEvents || []).map(Number).sort((a, b) => a - b);
    const evtStr = evtList.join(',');

    // _Amt: formatted currency string, e.g. "₹ 20.00"
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

  // Set explicit column widths for General Entry
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

  // ----------------------------------------------------
  // 2. SHEET: 'Event Allocation'
  // Columns:
  // Sl_No | Chest_No | Evt_No | Hit_Flag | Final_Flag | Awd |
  // Prize_1st | Jump_1st | Prize_2nd | Jump_2nd | Prize_3rd | Jump_3rd |
  // Prize_4th | Jump_4th | Prize_5th | Jump_5th | Prize_6th | Jump_6th
  // ----------------------------------------------------

  // Build quick lookups for heats and results
  // Heat participants map: key `${evtNo}_${chestNo}` -> HeatParticipant
  const heatParticipantsMap = new Map<string, { qualified?: boolean; heatNumber: number }>();
  heats.forEach((h) => {
    const evtNo = Number(h.eventNo);
    (h.participants || []).forEach((p) => {
      const chestNo = Number(p.chestNo);
      heatParticipantsMap.set(`${evtNo}_${chestNo}`, {
        qualified: Boolean(p.qualified),
        heatNumber: h.heatNumber,
      });
    });
  });

  // Results finalists map: key `${evtNo}_${chestNo}` -> FinalParticipant
  const finalistsMap = new Map<string, { position?: number; jumpRecord?: string; resultValue?: string }>();
  // Results object by eventNo
  const resultsByEvt = new Map<number, EventResult>();
  results.forEach((r) => {
    const evtNo = Number(r.eventNo);
    resultsByEvt.set(evtNo, r);
    (r.finalists || []).forEach((f) => {
      const chestNo = Number(f.chestNo);
      finalistsMap.set(`${evtNo}_${chestNo}`, {
        position: f.position,
        jumpRecord: f.jumpRecord || f.resultValue,
        resultValue: f.resultValue || f.jumpRecord,
      });
    });
    // Also include winners if stored separately
    (r.winners || []).forEach((w) => {
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

  // Map of events by Evt_No
  const eventsMap = new Map<number, SportEvent>();
  events.forEach((e) => eventsMap.set(Number(e.Evt_No), e));

  // Build allocation records: pair of (candidate, evtNo)
  interface AllocItem {
    chestNo: number;
    evtNo: number;
    candidate: Candidate;
  }

  const allocItems: AllocItem[] = [];

  // Group by event number ascending, then chest number ascending (as seen in Evnt_Alloc.png: evt 6 rows 1..18, evt 7 rows 19..45)
  // Gather all unique event numbers that athletes applied for, plus any existing in events list
  const allEventNos = Array.from(
    new Set([
      ...events.map((e) => Number(e.Evt_No)),
      ...candidates.flatMap((c) => (c.selectedEvents || []).map(Number)),
      ...heats.map((h) => Number(h.eventNo)),
      ...results.map((r) => Number(r.eventNo)),
    ])
  ).sort((a, b) => a - b);

  allEventNos.forEach((evtNo) => {
    // Find all candidates who selected or participated in this event
    const enrolledForEvt = candidates
      .filter((c) => {
        const chest = Number(c.chestNo);
        if (!chest || chest < 100) return false;
        if (c.status === 'cancelled' || c.isCancelled) return false;
        const inSelected = (c.selectedEvents || []).map(Number).includes(evtNo);
        const inHeat = heatParticipantsMap.has(`${evtNo}_${chest}`);
        const inFinal = finalistsMap.has(`${evtNo}_${chest}`);
        return inSelected || inHeat || inFinal;
      })
      .sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));

    enrolledForEvt.forEach((cand) => {
      allocItems.push({
        chestNo: Number(cand.chestNo),
        evtNo,
        candidate: cand,
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

    // 1. Hit_Flag:
    // When hit is required: TRUE if athlete participated / qualified in heat (default TRUE for enrolled athletes in heat, FALSE if marked not qualified/absent)
    // As shown in Evnt_Alloc.png, nearly all registered athletes have Hit_Flag TRUE unless absent
    let hitFlag = true;
    if (heatInfo !== undefined) {
      hitFlag = heatInfo.qualified !== false;
    }

    // 2. Final_Flag:
    // TRUE if the athlete was promoted to final or appears in finalists list
    let finalFlag = false;
    if (finalistInfo !== undefined) {
      finalFlag = true;
    } else if (heatInfo && heatInfo.qualified) {
      finalFlag = true;
    } else if (!requiresHit) {
      // Direct final event: all participants go to final
      finalFlag = true;
    }

    // 3. Position and Awards (Awd):
    // Prize 1st to 6th:
    // Awd is TRUE if athlete received a rank 1..6
    const position = finalistInfo?.position && finalistInfo.position >= 1 && finalistInfo.position <= 6
      ? finalistInfo.position
      : null;
    const isAwarded = position !== null;

    // Helper for Prize flag and jump record
    // e.g. Prize_1st = TRUE (or FALSE), Jump_1st = "13`-7``" (if broad jump or resultValue)
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

  // Set explicit column widths for Event Allocation
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

  // ----------------------------------------------------
  // 3. Combine into a single Excel Workbook (.xlsx)
  // ----------------------------------------------------
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsGeneralEntry, 'General Entry');
  XLSX.utils.book_append_sheet(wb, wsEventAlloc, 'Event Allocation');

  // Sheet 3: Clubs (if clubs table data provided)
  if (data.clubs && Array.isArray(data.clubs) && data.clubs.length > 0) {
    const clubsRows = data.clubs.map((c, idx) => ({
      Sl: c.Sl || (idx + 1),
      Reg_Club: (c.Reg_Club || c.name || '').toString().trim(),
      Mob: (c.Mob || c.mobile || c.phone || '').toString().trim(),
      Count_1stPlace: Number(c.Count_1stPlace || 0),
      Count_2ndPlace: Number(c.Count_2ndPlace || 0),
      Count_3rdPlace: Number(c.Count_3rdPlace || 0),
      TotPoints: Number(c.TotPoints || 0),
    }));
    const wsClubs = XLSX.utils.json_to_sheet(clubsRows, {
      header: ['Sl', 'Reg_Club', 'Mob', 'Count_1stPlace', 'Count_2ndPlace', 'Count_3rdPlace', 'TotPoints'],
    });
    wsClubs['!cols'] = [
      { wch: 8 },  // Sl
      { wch: 32 }, // Reg_Club
      { wch: 16 }, // Mob
      { wch: 16 }, // Count_1stPlace
      { wch: 16 }, // Count_2ndPlace
      { wch: 16 }, // Count_3rdPlace
      { wch: 14 }, // TotPoints
    ];
    XLSX.utils.book_append_sheet(wb, wsClubs, 'Clubs');
  }

  return wb;
}

/**
 * Convenience helper to download the workbook as .xlsx directly in browser
 */
export function downloadSportsMeetExcel(data: ExcelExportData, filename?: string): void {
  const wb = generateSportsMeetExcelWorkbook(data);
  const defaultName = `eSports_Athletes_Data_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename || defaultName, { bookType: 'xlsx' });
}

/**
 * Chunks long string fields across multiple keys so that no single Excel cell
 * ever exceeds Excel's strict limit of 32,767 characters (using a safe threshold of 30,000).
 */
export function chunkRowForExcel(row: Record<string, any>, maxLen = 30000): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === 'string' && val.length > maxLen) {
      const totalParts = Math.ceil(val.length / maxLen);
      result[key] = val.slice(0, maxLen);
      for (let p = 2; p <= totalParts; p++) {
        result[`${key}__part${p}`] = val.slice((p - 1) * maxLen, p * maxLen);
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Reassembles chunked string columns (__part2, __part3, etc.) back into the original field value.
 */
export function unchunkRowFromExcel(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = { ...row };
  const partKeys = Object.keys(result).filter((k) => k.includes('__part'));

  if (partKeys.length === 0) return result;

  const grouped: Record<string, Array<{ pKey: string; partNum: number; text: string }>> = {};
  for (const pKey of partKeys) {
    const match = pKey.match(/^(.+)__part(\d+)$/);
    if (match) {
      const baseKey = match[1];
      const partNum = parseInt(match[2], 10);
      if (!grouped[baseKey]) grouped[baseKey] = [];
      grouped[baseKey].push({ pKey, partNum, text: String(result[pKey] || '') });
      delete result[pKey];
    }
  }

  for (const [baseKey, parts] of Object.entries(grouped)) {
    parts.sort((a, b) => a.partNum - b.partNum);
    let full = String(result[baseKey] || '');
    for (const p of parts) {
      full += p.text;
    }
    result[baseKey] = full;
  }
  return result;
}

/**
 * Converts array of rows into a worksheet ensuring all string values are strictly under 32,700 chars.
 */
function createSafeSheet(rows: Record<string, any>[], header?: string[]): XLSX.WorkSheet {
  const safeRows = rows.map((r) => {
    const chunked = chunkRowForExcel(r, 30000);
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(chunked)) {
      if (typeof v === 'string' && v.length > 32700) {
        sanitized[k] = v.slice(0, 32700);
      } else {
        sanitized[k] = v;
      }
    }
    return sanitized;
  });
  return header ? XLSX.utils.json_to_sheet(safeRows, { header }) : XLSX.utils.json_to_sheet(safeRows);
}

/**
 * Generates a complete database backup as an Excel workbook (.xlsx)
 * with a dedicated sheet for every table structure & data.
 */
export function generateFullDatabaseExcelWorkbook(dbData: {
  candidates?: any[];
  events?: any[];
  clubs?: any[];
  heats?: any[];
  results?: any[];
  settings?: any;
  clientUploads?: any[];
}): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. Sheet: candidates
  const candidates = (dbData.candidates || []).map((c) => ({
    id: c.id || '',
    chestNo: Number(c.chestNo) || '',
    name: (c.name || '').toString().trim().toUpperCase(),
    club: (c.club || '').toString().trim(),
    gender: (c.gender || '').toString().trim(),
    height: (c.height || '').toString().trim(),
    selectedEvents: Array.isArray(c.selectedEvents) ? c.selectedEvents.join(',') : (c.selectedEvents || ''),
    totalFees: Number(c.totalFees) || 0,
    feeStatus: (c.feeStatus || 'Due').toString().trim(),
    isCancelled: Boolean(c.isCancelled),
    createdAt: c.createdAt || '',
    updatedAt: c.updatedAt || '',
  }));
  const wsCandidates = createSafeSheet(candidates);
  XLSX.utils.book_append_sheet(wb, wsCandidates, 'candidates');

  // 2. Sheet: events
  const events = (dbData.events || []).map((e) => ({
    Evt_No: Number(e.Evt_No),
    Evt_Name: (e.Evt_Name || '').toString().trim(),
    Height: (e.Height || '').toString().trim(),
    Gender: (e.Gender || '').toString().trim(),
    Fees: Number(e.Fees) || 0,
    requiredHit: Boolean(e.requiredHit),
    requiredFinal: Boolean(e.requiredFinal),
  }));
  const wsEvents = createSafeSheet(events);
  XLSX.utils.book_append_sheet(wb, wsEvents, 'events');

  // 3. Sheet: clubs
  const clubs = (dbData.clubs || []).map((c) => ({
    id: c.id || '',
    name: (c.name || '').toString().trim(),
    shortCode: (c.shortCode || '').toString().trim(),
    mobile: (c.mobile || c.phone || '').toString().trim(),
    phone: (c.phone || c.mobile || '').toString().trim(),
    contactPerson: (c.contactPerson || '').toString().trim(),
    address: (c.address || '').toString().trim(),
    logoUrl: (c.logoUrl || '').toString().trim(),
  }));
  const wsClubs = createSafeSheet(clubs);
  XLSX.utils.book_append_sheet(wb, wsClubs, 'clubs');

  // 4. Sheet: heats
  const heats = (dbData.heats || []).map((h) => ({
    id: h.id || '',
    eventNo: Number(h.eventNo),
    eventName: (h.eventName || '').toString().trim(),
    heatNumber: Number(h.heatNumber) || 1,
    isFinal: Boolean(h.isFinal),
    completed: Boolean(h.completed),
    participants: JSON.stringify(h.participants || []),
  }));
  const wsHeats = createSafeSheet(heats);
  XLSX.utils.book_append_sheet(wb, wsHeats, 'heats');

  // 5. Sheet: results
  const results = (dbData.results || []).map((r) => ({
    id: r.id || '',
    eventNo: Number(r.eventNo),
    eventName: (r.eventName || '').toString().trim(),
    first: JSON.stringify(r.first || null),
    second: JSON.stringify(r.second || null),
    third: JSON.stringify(r.third || null),
    fourth: JSON.stringify(r.fourth || null),
    fifth: JSON.stringify(r.fifth || null),
    sixth: JSON.stringify(r.sixth || null),
  }));
  const wsResults = createSafeSheet(results);
  XLSX.utils.book_append_sheet(wb, wsResults, 'results');

  // 6. Sheet: settings (Key-Value)
  const settingsEntries = Object.entries(dbData.settings || {}).map(([key, val]) => ({
    Setting_Key: key,
    Setting_Value: typeof val === 'object' ? JSON.stringify(val) : String(val),
  }));
  const wsSettings = createSafeSheet(settingsEntries);
  XLSX.utils.book_append_sheet(wb, wsSettings, 'settings');

  // 7. Sheet: clientUploads
  const uploads = (dbData.clientUploads || []).map((u) => ({
    id: u.id || '',
    clientName: (u.clientName || '').toString().trim(),
    uploadedAt: (u.uploadedAt || '').toString().trim(),
    candidateCount: Number(u.candidateCount) || 0,
    status: (u.status || '').toString().trim(),
    candidates: JSON.stringify(u.candidates || []),
  }));
  const wsUploads = createSafeSheet(uploads);
  XLSX.utils.book_append_sheet(wb, wsUploads, 'clientUploads');

  return wb;
}

/**
 * Downloads the full database backup as an Excel file (.xlsx) with all tables
 */
export function downloadFullDatabaseExcel(dbData: any, filename?: string): void {
  const wb = generateFullDatabaseExcelWorkbook(dbData);
  const defaultName = `eSports_Full_Database_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename || defaultName, { bookType: 'xlsx' });
}

/**
 * Parses an Excel (.xlsx) workbook and returns database dump structure
 * compatible with restoreDatabaseDump.
 */
export function parseDatabaseBackupFromExcel(wb: XLSX.WorkBook): any {
  const sheetNames = wb.SheetNames;
  const result: any = {};

  // 1. Candidates
  if (sheetNames.includes('candidates')) {
    const rawCandidates: any[] = XLSX.utils.sheet_to_json(wb.Sheets['candidates']);
    result.candidates = rawCandidates.map((rawC, idx) => {
      const c = unchunkRowFromExcel(rawC);
      let selectedEvents: number[] = [];
      if (typeof c.selectedEvents === 'string') {
        selectedEvents = c.selectedEvents
          .split(/[,;]/)
          .map((s: string) => Number(s.trim()))
          .filter((n: number) => !isNaN(n));
      } else if (Array.isArray(c.selectedEvents)) {
        selectedEvents = c.selectedEvents.map(Number);
      } else if (typeof c.selectedEvents === 'number') {
        selectedEvents = [c.selectedEvents];
      }

      return {
        id: c.id ? String(c.id) : `cand_import_${Date.now()}_${idx}`,
        chestNo: Number(c.chestNo) || (101 + idx),
        name: (c.name || '').toString().trim().toUpperCase(),
        club: (c.club || 'Independent').toString().trim(),
        gender: (c.gender || 'ALL').toString().trim(),
        height: (c.height || 'ALL').toString().trim(),
        selectedEvents,
        totalFees: Number(c.totalFees) || 0,
        feeStatus: (c.feeStatus || 'Due').toString().trim(),
        isCancelled: Boolean(c.isCancelled === true || c.isCancelled === 'true'),
        createdAt: c.createdAt || new Date().toISOString(),
        updatedAt: c.updatedAt || new Date().toISOString(),
      };
    });
  }

  // 2. Events
  if (sheetNames.includes('events')) {
    const rawEvents: any[] = XLSX.utils.sheet_to_json(wb.Sheets['events']);
    result.events = rawEvents.map((rawE) => {
      const e = unchunkRowFromExcel(rawE);
      return {
        Evt_No: Number(e.Evt_No),
        Evt_Name: (e.Evt_Name || '').toString().trim(),
        Height: (e.Height || 'ALL').toString().trim(),
        Gender: (e.Gender || 'ALL').toString().trim(),
        Fees: Number(e.Fees) || 0,
        requiredHit: e.requiredHit === true || e.requiredHit === 'true' || e.requiredHit === 1,
        requiredFinal: e.requiredFinal === true || e.requiredFinal === 'true' || e.requiredFinal === 1,
      };
    });
  }

  // 3. Clubs
  if (sheetNames.includes('clubs') || sheetNames.includes('Clubs')) {
    const rawClubs: any[] = XLSX.utils.sheet_to_json(wb.Sheets['clubs'] || wb.Sheets['Clubs']);
    result.clubs = rawClubs.map((rawC, idx) => {
      const c = unchunkRowFromExcel(rawC);
      const regClub = (c.Reg_Club || c.name || c.Club_Name || '').toString().trim().toUpperCase();
      const mob = (c.Mob || c.mobile || c.Mobile || c.phone || c.Phone || '').toString().trim();
      const count1 = Number(c.Count_1stPlace || 0);
      const count2 = Number(c.Count_2ndPlace || 0);
      const count3 = Number(c.Count_3rdPlace || 0);
      const isSelf = regClub === 'SELF';
      const totPoints = isSelf ? 0 : Number(c.TotPoints !== undefined ? c.TotPoints : (count1 * 7 + count2 * 5 + count3 * 4));
      return {
        id: c.id ? String(c.id) : `club_${idx + 1}`,
        Sl: Number(c.Sl) || (idx + 1),
        Reg_Club: regClub,
        Mob: mob,
        Count_1stPlace: count1,
        Count_2ndPlace: count2,
        Count_3rdPlace: count3,
        TotPoints: totPoints,
        name: regClub,
        mobile: mob,
      };
    });
  }

  // 4. Heats
  if (sheetNames.includes('heats')) {
    const rawHeats: any[] = XLSX.utils.sheet_to_json(wb.Sheets['heats']);
    result.heats = rawHeats.map((rawH, idx) => {
      const h = unchunkRowFromExcel(rawH);
      let participants = [];
      try {
        if (typeof h.participants === 'string' && h.participants.startsWith('[')) {
          participants = JSON.parse(h.participants);
        }
      } catch (e) {}
      return {
        id: h.id ? String(h.id) : `heat_${Date.now()}_${idx}`,
        eventNo: Number(h.eventNo),
        eventName: (h.eventName || '').toString().trim(),
        heatNumber: Number(h.heatNumber) || 1,
        isFinal: Boolean(h.isFinal === true || h.isFinal === 'true'),
        completed: Boolean(h.completed === true || h.completed === 'true'),
        participants,
      };
    });
  }

  // 5. Results
  if (sheetNames.includes('results')) {
    const rawResults: any[] = XLSX.utils.sheet_to_json(wb.Sheets['results']);
    result.results = rawResults.map((rawR, idx) => {
      const r = unchunkRowFromExcel(rawR);
      const parseObj = (val: any) => {
        if (!val) return null;
        if (typeof val === 'object') return val;
        try {
          if (typeof val === 'string' && val.startsWith('{')) return JSON.parse(val);
        } catch (e) {}
        return null;
      };
      return {
        id: r.id ? String(r.id) : `res_${Date.now()}_${idx}`,
        eventNo: Number(r.eventNo),
        eventName: (r.eventName || '').toString().trim(),
        first: parseObj(r.first),
        second: parseObj(r.second),
        third: parseObj(r.third),
        fourth: parseObj(r.fourth),
        fifth: parseObj(r.fifth),
        sixth: parseObj(r.sixth),
      };
    });
  }

  // 6. Settings
  if (sheetNames.includes('settings')) {
    const rawSettings: any[] = XLSX.utils.sheet_to_json(wb.Sheets['settings']);
    const settingsObj: any = {};
    rawSettings.forEach((rawRow) => {
      const row = unchunkRowFromExcel(rawRow);
      const key = row.Setting_Key || row.key;
      const val = row.Setting_Value !== undefined ? row.Setting_Value : row.value;
      if (key) {
        try {
          if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
            settingsObj[key] = JSON.parse(val);
          } else {
            settingsObj[key] = val;
          }
        } catch (e) {
          settingsObj[key] = val;
        }
      }
    });
    result.settings = settingsObj;
  }

  // 7. Client Uploads
  if (sheetNames.includes('clientUploads')) {
    const rawUploads: any[] = XLSX.utils.sheet_to_json(wb.Sheets['clientUploads']);
    result.clientUploads = rawUploads.map((rawU, idx) => {
      const u = unchunkRowFromExcel(rawU);
      let cands = [];
      try {
        if (typeof u.candidates === 'string' && u.candidates.startsWith('[')) {
          cands = JSON.parse(u.candidates);
        }
      } catch (e) {}
      return {
        id: u.id ? String(u.id) : `upload_${idx + 1}`,
        clientName: (u.clientName || '').toString().trim(),
        uploadedAt: u.uploadedAt || new Date().toISOString(),
        candidateCount: Number(u.candidateCount) || 0,
        status: (u.status || 'merged').toString().trim(),
        candidates: cands,
      };
    });
  }

  // Fallback: If workbook is from "Download Athletes' Data" ('General Entry' sheet)
  if (!result.candidates && sheetNames.includes('General Entry')) {
    const rawGeneral: any[] = XLSX.utils.sheet_to_json(wb.Sheets['General Entry']);
    result.candidates = rawGeneral.map((row, idx) => {
      let selectedEvents: number[] = [];
      const evtVal = row.Evt || row.evt || row.Events;
      if (typeof evtVal === 'string') {
        selectedEvents = evtVal.split(/[,;]/).map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n));
      } else if (typeof evtVal === 'number') {
        selectedEvents = [evtVal];
      }

      let totalFees = 0;
      const amtVal = row._Amt || row.Amt || row.Fees_Amount;
      if (typeof amtVal === 'number') {
        totalFees = amtVal;
      } else if (typeof amtVal === 'string') {
        const cleaned = amtVal.replace(/[^0-9.]/g, '');
        totalFees = parseFloat(cleaned) || 0;
      }

      return {
        id: `cand_import_${Date.now()}_${idx}`,
        chestNo: Number(row.Chest_No || row.chestNo) || (101 + idx),
        name: (row.Name_ || row.Name || row.name || '').toString().trim().toUpperCase(),
        club: (row.Club_Name || row.Club || row.club || 'Independent').toString().trim(),
        gender: (row.Gndr || row.Gender || row.gender || 'ALL').toString().trim(),
        height: (row.Height || row.height || 'ALL').toString().trim(),
        selectedEvents,
        totalFees,
        feeStatus: (row.Fees || row.feeStatus || 'Paid').toString().trim(),
        isCancelled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  return result;
}


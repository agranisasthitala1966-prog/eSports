import { Candidate, SportEvent, EventHeat, EventResult } from '../types';

/**
 * Checks if ranking list preparation has been completed for an event.
 */
export function isEventRankingCompleted(
  evtNo: number,
  results: EventResult[] = []
): boolean {
  const res = results.find((r) => Number(r.eventNo) === Number(evtNo));
  if (!res) return false;
  return Boolean(
    res.completed === true ||
    (res.finalists && res.finalists.some((f) => f.position && f.position > 0)) ||
    (res.winners && res.winners.length > 0)
  );
}

/**
 * Checks whether an event requires a Hit stage (defaults to true unless explicitly false or 'no').
 */
export function isEventHitRequired(evt: SportEvent | null | undefined): boolean {
  if (!evt) return true;
  return evt.requiredHit !== false && String(evt.requiredHit).toLowerCase() !== 'no';
}

/**
 * Checks if final list preparation has been completed/prepared for an event.
 */
export function isEventFinalListPrepared(
  evtNo: number,
  results: EventResult[] = []
): boolean {
  const res = results.find((r) => Number(r.eventNo) === Number(evtNo));
  if (!res) return false;
  return Boolean(
    (Array.isArray(res.finalists) && res.finalists.length > 0) ||
    isEventRankingCompleted(evtNo, results)
  );
}

/**
 * Enrollment auto-disable rule (server & client):
 * Auto-disable event thumbnails where:
 * - hit required = yes AND final list has been prepared
 * - OR hit required = no AND (final list has been prepared OR ranking list has been prepared)
 */
export function getServerEventEnrollmentDisableReason(
  evt: SportEvent,
  results: EventResult[] = [],
  _mode: 'server' | 'client' = 'server'
): string | null {
  const evtNo = Number(evt.Evt_No);
  const hitRequired = isEventHitRequired(evt);

  if (hitRequired) {
    if (isEventFinalListPrepared(evtNo, results)) {
      return `Event #${evtNo} is disabled: Final list has already been prepared.`;
    }
  } else {
    if (isEventRankingCompleted(evtNo, results)) {
      return `Event #${evtNo} is disabled: Ranking list has already been prepared.`;
    }
    if (isEventFinalListPrepared(evtNo, results)) {
      return `Event #${evtNo} is disabled: Final list has already been prepared.`;
    }
  }

  return null;
}

export interface CandidateRestrictionStatus {
  isRestricted: boolean;
  reason?: 'promoted_to_final' | 'hit_qualified' | 'ranking_completed';
  restrictingEvents: number[];
  promotedFinalEvents: number[];
  qualifiedHitEvents: number[];
  rankingCompletedEvents: number[];
}

/**
 * Evaluates candidate editing restriction status based on:
 * - Whenever a candidate has been promoted to final from ANY one of the events that he/she applied,
 *   then edit details for that candidate must be disabled.
 * - OR until completion of ranking list preparation for any applied event.
 */
export function getCandidateRestrictionStatus(
  cand: Candidate | null | undefined,
  events: SportEvent[] = [],
  heats: EventHeat[] = [],
  results: EventResult[] = [],
  mode: 'server' | 'client' = 'server'
): CandidateRestrictionStatus {
  if (mode !== 'server' || !cand || !cand.chestNo) {
    return {
      isRestricted: false,
      restrictingEvents: [],
      promotedFinalEvents: [],
      qualifiedHitEvents: [],
      rankingCompletedEvents: [],
    };
  }

  const candChest = Number(cand.chestNo);
  if (!candChest || candChest <= 0) {
    return {
      isRestricted: false,
      restrictingEvents: [],
      promotedFinalEvents: [],
      qualifiedHitEvents: [],
      rankingCompletedEvents: [],
    };
  }

  const appliedEvents = (cand.selectedEvents || []).map(Number);
  const promotedFinalEvents: number[] = [];
  const rankingCompletedEvents: number[] = [];

  appliedEvents.forEach((evtNo) => {
    // 1. Check if promoted to final in this event:
    // Case A: Candidate is in results.finalists (promoted to final from hit OR direct final prepared)
    const res = results.find((r) => Number(r.eventNo) === Number(evtNo));
    const isPromotedFinalist = Boolean(
      res &&
        res.finalists &&
        res.finalists.some((f) => Number(f.chestNo) === candChest)
    );

    // Case B: Candidate qualified in a heat
    const hasQualifiedInHeat = heats.some(
      (h) =>
        Number(h.eventNo) === Number(evtNo) &&
        h.participants &&
        h.participants.some(
          (p) => Number(p.chestNo) === candChest && Boolean(p.qualified)
        )
    );

    if (isPromotedFinalist || hasQualifiedInHeat) {
      promotedFinalEvents.push(evtNo);
    }

    // 2. Check for ranking list preparation completion
    if (isEventRankingCompleted(evtNo, results)) {
      rankingCompletedEvents.push(evtNo);
    }
  });

  if (promotedFinalEvents.length > 0) {
    return {
      isRestricted: true,
      reason: 'promoted_to_final',
      restrictingEvents: promotedFinalEvents,
      promotedFinalEvents,
      qualifiedHitEvents: promotedFinalEvents,
      rankingCompletedEvents,
    };
  }

  if (rankingCompletedEvents.length > 0) {
    return {
      isRestricted: true,
      reason: 'ranking_completed',
      restrictingEvents: rankingCompletedEvents,
      promotedFinalEvents: [],
      qualifiedHitEvents: [],
      rankingCompletedEvents,
    };
  }

  return {
    isRestricted: false,
    restrictingEvents: [],
    promotedFinalEvents: [],
    qualifiedHitEvents: [],
    rankingCompletedEvents,
  };
}

/**
 * Returns restricting event numbers for backward compatibility.
 * Accepts either:
 * - (cand, events, heats, results)
 * - or (cand, heats, results) [fallback]
 */
export function getCandidateQualifiedEvents(
  cand: Candidate | null | undefined,
  eventsOrHeats: SportEvent[] | EventHeat[] = [],
  heatsOrResults: EventHeat[] | EventResult[] = [],
  resultsParam?: EventResult[]
): number[] {
  let events: SportEvent[] = [];
  let heats: EventHeat[] = [];
  let results: EventResult[] = [];

  if (resultsParam !== undefined) {
    events = eventsOrHeats as SportEvent[];
    heats = heatsOrResults as EventHeat[];
    results = resultsParam;
  } else {
    const firstItem: any = eventsOrHeats[0];
    if (firstItem && 'Evt_No' in firstItem) {
      events = eventsOrHeats as SportEvent[];
      heats = heatsOrResults as EventHeat[];
      results = [];
    } else {
      heats = eventsOrHeats as EventHeat[];
      results = heatsOrResults as EventResult[];
    }
  }

  const status = getCandidateRestrictionStatus(cand, events, heats, results, 'server');
  return status.restrictingEvents;
}

/**
 * Checks if candidate editing should be restricted on the server side.
 */
export function isCandidateEditRestricted(
  cand: Candidate | null | undefined,
  events: SportEvent[] = [],
  heats: EventHeat[] = [],
  results: EventResult[] = [],
  mode: 'server' | 'client' = 'server'
): boolean {
  const status = getCandidateRestrictionStatus(cand, events, heats, results, mode);
  return status.isRestricted;
}

/**
 * Formats a clear alert message explaining why editing is locked.
 */
export function getCandidateEditRestrictedMessage(
  cand: Candidate,
  status: CandidateRestrictionStatus
): string {
  if (status.reason === 'promoted_to_final' || status.reason === 'hit_qualified') {
    const evts = status.promotedFinalEvents?.length ? status.promotedFinalEvents : status.qualifiedHitEvents;
    return `Editing Disabled!\n\nCandidate "${cand.name}" (Chest #${cand.chestNo}) has been promoted to final in Event #${evts.join(', #')}.\n\nEditing candidate details is disabled once a candidate has been promoted to final in any applied event.`;
  }
  if (status.reason === 'ranking_completed') {
    return `Editing Disabled!\n\nOfficial ranking list preparation has already been completed for Event #${status.rankingCompletedEvents.join(', #')}.\n\nEditing candidate details is disabled once ranking list preparation has been completed.`;
  }
  return `Editing Disabled!\n\nCandidate "${cand.name}" (Chest #${cand.chestNo}) details cannot be edited at this stage.`;
}

export interface LiveMeetTickerItem {
  key: string;
  text: string;
  isAlert: boolean;
  prefix?: string;
  phoneDigits?: string;
  suffix?: string;
}

export function isBeforeMeetStartDate(datesStr?: string): boolean {
  if (!datesStr || !datesStr.trim()) return true;
  const cleaned = datesStr.trim().replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const dmyMatch = cleaned.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (dmyMatch) {
    const dt = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
    if (!Number.isNaN(dt.getTime())) return todayStart < dt.getTime();
  }

  const ymdMatch = cleaned.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (ymdMatch) {
    const dt = new Date(parseInt(ymdMatch[1], 10), parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10));
    if (!Number.isNaN(dt.getTime())) return todayStart < dt.getTime();
  }

  const monthNames: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  const dmMatch = cleaned.match(/\b(\d{1,2})(?:\s*(?:&|and|to|-)\s*\d{1,2})?\s+([A-Za-z]+)[,\s]+(\d{4})\b/i);
  if (dmMatch) {
    const mIdx = monthNames[dmMatch[2].toLowerCase()];
    if (mIdx !== undefined) {
      const dt = new Date(parseInt(dmMatch[3], 10), mIdx, parseInt(dmMatch[1], 10));
      if (!Number.isNaN(dt.getTime())) return todayStart < dt.getTime();
    }
  }

  const mdMatch = cleaned.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:\s*(?:&|and|to|-)\s*\d{1,2})?[,\s]+(\d{4})\b/i);
  if (mdMatch) {
    const mIdx = monthNames[mdMatch[1].toLowerCase()];
    if (mIdx !== undefined) {
      const dt = new Date(parseInt(mdMatch[3], 10), mIdx, parseInt(mdMatch[2], 10));
      if (!Number.isNaN(dt.getTime())) return todayStart < dt.getTime();
    }
  }

  const fallback = new Date(cleaned);
  if (!Number.isNaN(fallback.getTime())) {
    const dtStart = new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()).getTime();
    return todayStart < dtStart;
  }

  return true;
}

export function buildLiveMeetTicker(
  settings: {
    dates?: string;
    ordinalTitle?: string;
    clientResponseEnabled?: boolean;
    registeredClubName?: string;
    registeredClubPhone?: string;
  } | null | undefined,
  events: SportEvent[] = [],
  results: EventResult[] = []
): { items: LiveMeetTickerItem[]; durationSec: number } {
  const items: LiveMeetTickerItem[] = [];
  const isEchoEnabled = settings?.clientResponseEnabled !== false;

  if (isEchoEnabled) {
    const clubName = (settings?.registeredClubName || 'Sasthitala Agrani').trim();
    items.push({
      key: 'host',
      text: clubName,
      isAlert: false,
    });
  }

  if (isBeforeMeetStartDate(settings?.dates) && settings?.ordinalTitle?.trim()) {
    items.push({ key: 'ordinal', text: settings.ordinalTitle.trim(), isAlert: false });
  }

  if (!isEchoEnabled) {
    items.push({ key: 'echo', text: 'নাম নেওয়া বন্ধ', isAlert: true });
  } else {
    items.push({ key: 'echo', text: 'নাম নেওয়া চলছে...', isAlert: false });
    items.push({
      key: 'helpline',
      text: 'App Helpline: 9830780772',
      isAlert: false,
      prefix: 'App Helpline: ',
      phoneDigits: '9830780772',
    });
  }

  const sortedEvents = [...events].sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));

  const hitCompletedEvts = sortedEvents
    .filter((e) => isEventHitRequired(e) && isEventFinalListPrepared(e.Evt_No, results))
    .map((e) => Number(e.Evt_No));
  if (hitCompletedEvts.length > 0) {
    items.push({ key: 'hit', text: `HIT completed: ${hitCompletedEvts.join(', ')}`, isAlert: false });
  }

  const finalCompletedEvts = sortedEvents
    .filter((e) => isEventFinalListPrepared(e.Evt_No, results))
    .map((e) => Number(e.Evt_No));
  if (finalCompletedEvts.length > 0) {
    items.push({ key: 'final', text: `Final completed: ${finalCompletedEvts.join(', ')}`, isAlert: false });
  }

  const resultDeclaredEvts = sortedEvents
    .filter((e) => isEventRankingCompleted(e.Evt_No, results))
    .map((e) => Number(e.Evt_No));
  if (resultDeclaredEvts.length > 0) {
    items.push({ key: 'rank', text: `Result declared: ${resultDeclaredEvts.join(', ')}`, isAlert: false });
  }

  const totalChars = items.reduce((sum, item) => sum + item.text.length + 4, 0);
  const durationSec = Math.max(7, Math.min(18, Math.round(6 + totalChars * 0.06)));

  return { items, durationSec };
}

const FIRST_PRINT_WARNED_STORAGE_KEY = 'esports_club_echo_first_print_warned_v1';

export type FirstPrintCategory = 'hit' | 'direct-final';

function readWarnedFirstPrintKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRST_PRINT_WARNED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function hasWarnedFirstPrint(category: FirstPrintCategory, evtNo: number): boolean {
  return readWarnedFirstPrintKeys().has(`${category}:${Number(evtNo)}`);
}

export function markFirstPrintWarned(category: FirstPrintCategory, evtNos: number[]): void {
  if (!evtNos || evtNos.length === 0) return;
  try {
    const existing = readWarnedFirstPrintKeys();
    evtNos.forEach((n) => existing.add(`${category}:${Number(n)}`));
    localStorage.setItem(FIRST_PRINT_WARNED_STORAGE_KEY, JSON.stringify(Array.from(existing)));
  } catch {
    // ignore storage errors
  }
}

export function clearFirstPrintWarned(): void {
  try {
    localStorage.removeItem(FIRST_PRINT_WARNED_STORAGE_KEY);
  } catch {
    // ignore
  }
}



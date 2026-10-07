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

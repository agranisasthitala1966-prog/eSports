import { Candidate, EventHeat, EventResult } from '../types';

/**
 * Returns an array of event numbers in which the given candidate has already
 * qualified from heat ("hit") to final.
 */
export function getCandidateQualifiedEvents(
  cand: Candidate | null | undefined,
  heats: EventHeat[],
  results: EventResult[]
): number[] {
  if (!cand || !cand.chestNo) return [];
  const candChest = Number(cand.chestNo);
  if (!candChest || candChest <= 0) return [];

  const qualifiedEvents = new Set<number>();

  // 1. Check saved results finalists
  (results || []).forEach((r) => {
    if (r.finalists && r.finalists.some((f) => Number(f.chestNo) === candChest)) {
      qualifiedEvents.add(Number(r.eventNo));
    }
  });

  // 2. Check heats participants marked as qualified
  (heats || []).forEach((h) => {
    if (
      h.participants &&
      h.participants.some((p) => Number(p.chestNo) === candChest && Boolean(p.qualified))
    ) {
      qualifiedEvents.add(Number(h.eventNo));
    }
  });

  return Array.from(qualifiedEvents).sort((a, b) => a - b);
}

/**
 * Checks if candidate editing should be restricted on the server side.
 * Restricts edit for any candidate who already qualified from hit to final
 * in at least one event among which they enrolled, even if hits of other events are not completed yet.
 */
export function isCandidateEditRestricted(
  cand: Candidate | null | undefined,
  heats: EventHeat[],
  results: EventResult[],
  mode: 'server' | 'client' = 'server'
): boolean {
  if (mode !== 'server' || !cand) return false;
  const qualified = getCandidateQualifiedEvents(cand, heats, results);
  return qualified.length > 0;
}

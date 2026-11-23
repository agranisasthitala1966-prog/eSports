export interface MinimalEventShape {
  Evt_No: number | string;
  Height?: string;
  Gender?: string;
}

/**
 * Checks if a club name is one of the allowed variations:
 * "Sasthitala Agrani", "Agrani", "SA", or "Sasthitala"
 */
export function isClubAllowedForEvent0(clubName?: string | null): boolean {
  if (!clubName) return false;
  const raw = clubName.trim();
  if (!raw) return false;

  const normalized = raw.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ');

  if (
    normalized === 'SA' ||
    normalized === 'AGRANI' ||
    normalized === 'SASTHITALA' ||
    normalized === 'SASTHITALA AGRANI' ||
    normalized === 'AGRANI SASTHITALA'
  ) {
    return true;
  }

  if (normalized.includes('SASTHITALA') && normalized.includes('AGRANI')) {
    return true;
  }

  return false;
}

/**
 * Converts height format like 3`-4``, 4`-6``, 4`-10``, or ALL to inches for strict numeric comparison
 */
export function parseHeightToInches(heightStr: string): number {
  if (!heightStr) return 0;
  const clean = heightStr.trim().toUpperCase();
  if (clean === 'ALL') return 9999;

  const match = clean.match(/(\d+)\s*[`'’]\s*[-–]?\s*(\d+)/);
  if (match) {
    const feet = parseInt(match[1], 10) || 0;
    const inches = parseInt(match[2], 10) || 0;
    return feet * 12 + inches;
  }

  const singleMatch = clean.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10) * 12;
  }

  return 0;
}

/**
 * Normalizes gender string for strict comparison:
 * 'BOYS', 'B' -> 'BOYS'
 * 'GIRLS', 'G' -> 'GIRLS'
 * 'CHILDRENS', 'CHILDREN', 'C' -> 'CHILDRENS'
 * 'ALL', '' -> 'ALL'
 */
export function normalizeGender(gender?: string | null): string {
  if (!gender) return 'ALL';
  const clean = gender.trim().toUpperCase();
  if (clean === 'BOYS' || clean === 'B') return 'BOYS';
  if (clean === 'GIRLS' || clean === 'G') return 'GIRLS';
  if (clean === 'CHILDRENS' || clean === 'CHILDREN' || clean === 'C') return 'CHILDRENS';
  return 'ALL';
}

/**
 * Checks whether an event is a Direct Event (both Height and Gender are "ALL").
 */
export function isDirectEvent(event: MinimalEventShape | null | undefined): boolean {
  if (!event) return false;
  const h = (event.Height || '').trim().toUpperCase();
  const g = (event.Gender || '').trim().toUpperCase();
  return h === 'ALL' && g === 'ALL';
}

/**
 * Returns additional eligible event numbers for a candidate:
 * events with strictly higher height brackets under the same gender category
 * (e.g., for 4`-2`` / BOYS -> 4`-6`` and 4`-10`` events under BOYS only).
 * Direct events (Height=ALL & Gender=ALL) are excluded here since they are listed separately.
 */
export function getAdditionalEventsForCandidate<T extends MinimalEventShape>(
  cand: { gender?: string | null; height?: string | null; club?: string | null } | null | undefined,
  events: T[] = []
): T[] {
  if (!cand) return [];
  const normCandGender = normalizeGender(cand.gender);
  const candHeightClean = (cand.height || '').trim().toUpperCase();

  if (!candHeightClean || candHeightClean === 'ALL' || normCandGender === 'ALL') {
    return [];
  }

  const candInches = parseHeightToInches(cand.height || '');
  if (candInches <= 0 || candInches >= 9999) {
    return [];
  }

  return events
    .filter((evt) => {
      if (isDirectEvent(evt)) return false;

      const evtNo = Number(evt.Evt_No);
      if (evtNo === 0 && !isClubAllowedForEvent0(cand.club)) {
        return false;
      }

      if (normalizeGender(evt.Gender) !== normCandGender) {
        return false;
      }

      const evtHeightClean = (evt.Height || '').trim().toUpperCase();
      const evtInches = evtHeightClean === 'ALL' ? 9999 : parseHeightToInches(evt.Height || '');
      return evtInches > candInches;
    })
    .sort((a, b) => {
      const hDiff = parseHeightToInches(a.Height || '') - parseHeightToInches(b.Height || '');
      if (hDiff !== 0) return hDiff;
      return Number(a.Evt_No) - Number(b.Evt_No);
    });
}

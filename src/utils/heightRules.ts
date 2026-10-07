import { SportEvent } from '../types';

/**
 * Checks if a club name is one of the allowed variations:
 * "Sasthitala Agrani", "Agrani", "SA", or "Sasthitala"
 */
export function isClubAllowedForEvent0(clubName?: string | null): boolean {
  if (!clubName) return false;
  const raw = clubName.trim();
  if (!raw) return false;

  const normalized = raw.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ');

  // Direct allowed identifiers: Sasthitala Agrani, Agrani, SA, Sasthitala
  if (
    normalized === 'SA' ||
    normalized === 'AGRANI' ||
    normalized === 'SASTHITALA' ||
    normalized === 'SASTHITALA AGRANI' ||
    normalized === 'AGRANI SASTHITALA'
  ) {
    return true;
  }

  // Also support full club names like "Sasthitala Agrani Sangha" / "Agrani Sasthitala Sangha" / "Sasthitala Agrani Club"
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

  // match feet and inches like 3`-4`` or 3'-4" or 4`-10``
  const match = clean.match(/(\d+)\s*[`'’]\s*[-–]?\s*(\d+)/);
  if (match) {
    const feet = parseInt(match[1], 10) || 0;
    const inches = parseInt(match[2], 10) || 0;
    return feet * 12 + inches;
  }

  // match single number
  const singleMatch = clean.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10) * 12;
  }

  return 0;
}

/**
 * Validates whether an event card is enabled for a candidate based on prompt rule:
 * "disable cards where events are not relevant means, only same and higher event cards will be enable under gender category"
 * Rule: Always disable event no 0 thumbnail where club name not in Sasthitala Agrani or Agrani or SA or Sasthitala
 */
export function isEventCardEnabled(
  event: SportEvent,
  candidateGender: string,
  candidateHeight: string,
  candidateClub?: string | null
): { enabled: boolean; reason?: string } {
  // Always disable event no 0 thumbnail where club name not in Sasthitala Agrani or Agrani or SA or Sasthitala
  if (Number(event.Evt_No) === 0) {
    if (!isClubAllowedForEvent0(candidateClub)) {
      return {
        enabled: false,
        reason: 'Event #0 is restricted to Sasthitala Agrani, Agrani, SA, or Sasthitala club members only.',
      };
    }
  }

  // If no gender or height has been specified yet, card is clickable (clicking will autofill combo)
  if (!candidateGender && !candidateHeight) {
    return { enabled: true };
  }

  // 1. Gender check:
  // If event is ALL, it's open to all genders.
  // Otherwise, must match candidate gender.
  if (event.Gender !== 'ALL' && candidateGender && candidateGender !== 'ALL') {
    if (event.Gender.toUpperCase() !== candidateGender.toUpperCase()) {
      return {
        enabled: false,
        reason: `Event is for ${event.Gender}, while candidate is ${candidateGender}`,
      };
    }
  }

  // 2. Height check:
  // "only same and higher event cards will be enable under gender category"
  if (candidateHeight && candidateHeight !== 'ALL') {
    // If event is for ALL heights (e.g. Go As You Like), it is enabled
    if (event.Height === 'ALL') {
      return { enabled: true };
    }

    const candidateInches = parseHeightToInches(candidateHeight);
    const eventInches = parseHeightToInches(event.Height);

    // Rule: Same and higher height events are permitted
    if (eventInches < candidateInches) {
      return {
        enabled: false,
        reason: `Event height (${event.Height}) is lower than candidate height (${candidateHeight}). Athletes cannot compete in lower brackets.`,
      };
    }
  }

  return { enabled: true };
}

import { SportEvent } from '../types';

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
 * If candidate height or gender is not set, all events are considered enabled.
 */
export function isEventCardEnabled(
  event: SportEvent,
  candidateGender: string,
  candidateHeight: string
): { enabled: boolean; reason?: string } {
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

import { SportEvent } from '../types';
import { INITIAL_EVENTS } from '../constants/initialData';

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
 * Validates whether an event card is enabled for a candidate based on prompt rule:
 * "When select height & gender from Combo box, adjust enabling or disabling lower event cards where the selected height & gender value matched with event master list under the same gender (for example – if selected height=3`-8`` & gender=”Boys” then no event card will be active for selection and if selected height=4`-2`` & gender=”Boys” then event card 3,4,5,6,7,8 will be active because of higher height and boys category for selection except, where height & gender value both is “ALL” in event master). Direct event card selection logic remains unchanged i.e. without selecting height & gender from Combo value."
 * Rule: Always disable event no 0 thumbnail where club name not in Sasthitala Agrani or Agrani or SA or Sasthitala
 */
export function isEventCardEnabled(
  event: SportEvent,
  candidateGender: string,
  candidateHeight: string,
  candidateClub?: string | null,
  masterEvents: SportEvent[] = INITIAL_EVENTS
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

  // Event where BOTH height and gender is "ALL" in event master is ALWAYS active for selection
  const isEvtAll = 
    (event.Height?.trim().toUpperCase() === 'ALL') && 
    (event.Gender?.trim().toUpperCase() === 'ALL');
  if (isEvtAll) {
    return { enabled: true };
  }

  const normCandGender = normalizeGender(candidateGender);
  const candHeightClean = (candidateHeight || '').trim().toUpperCase();
  const isCandHeightSelected = candHeightClean !== '' && candHeightClean !== 'ALL';
  const isCandGenderSelected = normCandGender !== 'ALL';

  // Direct event card selection logic remains unchanged i.e. without selecting height & gender from Combo value
  if (!isCandHeightSelected && !isCandGenderSelected) {
    return { enabled: true };
  }

  const candInches = isCandHeightSelected ? parseHeightToInches(candidateHeight) : 0;

  // When BOTH height and gender are selected from Combo box:
  if (isCandHeightSelected && isCandGenderSelected) {
    // 1. Check if the selected height & gender value matches with event master list under the same gender
    const hasMatchingEventInMaster = masterEvents.some(e => {
      const eNormGender = normalizeGender(e.Gender);
      if (eNormGender !== normCandGender) return false;
      const eCleanHeight = (e.Height || '').trim().toUpperCase();
      if (eCleanHeight === 'ALL') return false;
      const eInches = parseHeightToInches(e.Height);
      return eInches === candInches;
    });

    // If selected height & gender does NOT match with event master list under the same gender:
    // (for example - if selected height=3`-8`` & gender="Boys" then no event card will be active for selection
    //  except where height & gender value both is "ALL" in event master)
    if (!hasMatchingEventInMaster) {
      return {
        enabled: false,
        reason: `No event under ${candidateGender} category matches height ${candidateHeight} in event master list.`,
      };
    }

    // 2. If matched: adjust enabling or disabling lower event cards under the same gender
    // (for example - if selected height=4`-2`` & gender="Boys" then event card 3,4,5,6,7,8 will be active
    //  because of higher height and boys category for selection except where height & gender is "ALL")
    const normEvtGender = normalizeGender(event.Gender);
    if (normEvtGender !== normCandGender) {
      return {
        enabled: false,
        reason: `Event is for ${event.Gender}, while selected category is ${candidateGender}`,
      };
    }

    // Check height: lower event cards are disabled (only same and higher height events enabled)
    if (event.Height?.trim().toUpperCase() !== 'ALL') {
      const evtInches = parseHeightToInches(event.Height);
      if (evtInches < candInches) {
        return {
          enabled: false,
          reason: `Lower event card (${event.Height} < ${candidateHeight}) disabled under ${event.Gender} category.`,
        };
      }
    }

    return { enabled: true };
  }

  // When ONLY gender is selected from Combo box:
  if (isCandGenderSelected) {
    const normEvtGender = normalizeGender(event.Gender);
    if (normEvtGender !== 'ALL' && normEvtGender !== normCandGender) {
      return {
        enabled: false,
        reason: `Event is for ${event.Gender}, while selected category is ${candidateGender}`,
      };
    }
    return { enabled: true };
  }

  // When ONLY height is selected from Combo box:
  if (isCandHeightSelected) {
    if (event.Height?.trim().toUpperCase() !== 'ALL') {
      const evtInches = parseHeightToInches(event.Height);
      if (evtInches < candInches) {
        return {
          enabled: false,
          reason: `Lower event card (${event.Height} < ${candidateHeight}) disabled.`,
        };
      }
    }
    return { enabled: true };
  }

  return { enabled: true };
}

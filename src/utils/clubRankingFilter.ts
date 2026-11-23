const EXCLUDED_RANKING_CLUBS = new Set([
  '',
  'NA',
  'N/A',
  'N.A',
  'N.A.',
  'NULL',
  'NONE',
  'UNDEFINED',
  'SELF',
  'INDIVIDUAL',
  'INDEPENDENT',
  'INDEPENDENT / UNATTACHED',
  'UNATTACHED',
  '-',
  '—',
]);

/**
 * Returns true if a club name represents an excluded/unattached entry
 * (NA, N/A, Self, Individual, blank, null, etc.) that must not be counted
 * in the Club Championship / club ranking table.
 */
export function isExcludedClubForRanking(clubName?: string | null): boolean {
  if (clubName === null || clubName === undefined) return true;
  const normalized = String(clubName).trim().toUpperCase().replace(/\s+/g, ' ');
  return EXCLUDED_RANKING_CLUBS.has(normalized);
}

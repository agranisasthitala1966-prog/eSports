import React, { useState, useMemo } from 'react';
import { Candidate, SportEvent, Club, SportsMeetSettings, EventHeat, EventResult } from '../types';
import { 
  Search, 
  Pencil, 
  Trash2, 
  Download,
  X,
  Send,
  Ban,
  Lock,
  Printer,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Check
} from 'lucide-react';
import { CandidateEditModal } from './CandidateEditModal';
import { getCandidateRestrictionStatus, getServerEventEnrollmentDisableReason } from '../utils/qualificationRules';
import { getAdditionalEventsForCandidate, isDirectEvent } from '../utils/heightRules';

interface CandidateListProps {
  candidates: Candidate[];
  events: SportEvent[];
  clubs: Club[];
  settings: SportsMeetSettings;
  mode: 'client' | 'server';
  heats?: EventHeat[];
  results?: EventResult[];
  onEditCandidate?: (candidate: Candidate) => void;
  onSaveCandidate?: (updatedCandidate: Candidate) => Promise<void> | void;
  onDeleteCandidate: (id: string) => void;
  onCancelChest?: (id: string) => Promise<void> | void;
  onSyncToServer: () => Promise<void>;
  onForceFullSync?: () => Promise<void>;
  isSyncing: boolean;
  onClose?: () => void;
}

export const CandidateList: React.FC<CandidateListProps> = ({
  candidates,
  events,
  clubs,
  settings,
  mode,
  heats = [],
  results = [],
  onEditCandidate,
  onSaveCandidate,
  onDeleteCandidate,
  onCancelChest,
  onSyncToServer,
  onForceFullSync,
  isSyncing,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategoryPill, setActiveCategoryPill] = useState<'ALL' | 'C' | 'B' | 'G'>('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [togglingDirectKey, setTogglingDirectKey] = useState<string | null>(null);

  // Direct events: events where both Height and Gender are "ALL"
  const directEvents = useMemo(() => {
    return [...events]
      .filter((e) => isDirectEvent(e))
      .sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));
  }, [events]);

  const handleToggleQuickEvent = async (cand: Candidate, targetEvt: SportEvent) => {
    if (!onSaveCandidate || mode !== 'server') return;
    if (cand.isCancelled || cand.status === 'cancelled') return;

    const evtNo = Number(targetEvt.Evt_No);
    const key = `${cand.id}:${evtNo}`;
    if (togglingDirectKey === key) return;

    const currentEvents = (cand.selectedEvents || []).map(Number).filter((n) => !Number.isNaN(n));
    const isAlreadyEnrolled = currentEvents.includes(evtNo);

    if (isAlreadyEnrolled) {
      const restrictionStatus = getCandidateRestrictionStatus(cand, events, heats, results, mode);
      if (restrictionStatus.restrictingEvents.includes(evtNo)) {
        return;
      }
    } else {
      const disableReason = getServerEventEnrollmentDisableReason(targetEvt, results, mode);
      if (disableReason) {
        return;
      }
    }

    const nextSelectedEvents = isAlreadyEnrolled
      ? currentEvents.filter((n) => n !== evtNo)
      : [...currentEvents, evtNo].sort((a, b) => a - b);

    // Recalculate cumulative fee across all enrolled events while keeping personal details & feeStatus locked
    const feeSt = (cand.feeStatus || 'Due').toUpperCase();
    const isFree = feeSt.includes('FREE') || feeSt.includes('EXEMPT');
    const nextTotalFees = isFree
      ? 0
      : nextSelectedEvents.reduce((sum, no) => {
          const ev = events.find((e) => Number(e.Evt_No) === Number(no));
          return sum + (ev ? Number(ev.Fees) || 0 : 0);
        }, 0);

    setTogglingDirectKey(key);
    try {
      await onSaveCandidate({
        ...cand,
        selectedEvents: nextSelectedEvents,
        totalFees: nextTotalFees,
      });
    } catch (err: any) {
      console.error(`Failed to update event #${evtNo}:`, err);
    } finally {
      setTogglingDirectKey(null);
    }
  };

  const toggleRowExpand = (rowKey: string) => {
    setDeleteConfirmId(null);
    setCancelConfirmId(null);
    setExpandedRowId((prev) => (prev === rowKey ? null : rowKey));
  };

  // Sorted candidates by chest number for A4 printing
  const chestWiseCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
  }, [candidates]);

  // Unsynced candidates calculation
  const unsyncedCandidates = useMemo(() => {
    return candidates.filter(c => !c.synced || c.isDirty);
  }, [candidates]);

  // Set of chest numbers that have achieved a rank/position in any event result
  const rankedChestNosSet = useMemo(() => {
    const rankedSet = new Set<number>();
    results.forEach((res) => {
      const cancelledSet = new Set((res.cancelledChestNos || []).map(Number));
      const list = (res.winners && res.winners.length > 0) ? res.winners : (res.finalists || []);
      list.forEach((f) => {
        const ch = Number(f.chestNo);
        if (ch > 0 && !cancelledSet.has(ch) && Number(f.position || 0) > 0) {
          rankedSet.add(ch);
        }
      });
    });
    return rankedSet;
  }, [results]);

  // Category filter code helper: C (Children/All), B (Boys), G (Girls)
  const getGroupCode = (cand: Candidate): string => {
    const g = (cand.gender || '').toUpperCase();
    if (g === 'BOYS' || g === 'B') return 'B';
    if (g === 'GIRLS' || g === 'G') return 'G';
    return 'C';
  };

  // Expanded gender short form helper: C, B, G, All
  const getShortGenderDisplay = (cand: Candidate): string => {
    const g = (cand.gender || '').trim().toUpperCase();
    if (g === 'BOYS' || g === 'B') return 'B';
    if (g === 'GIRLS' || g === 'G') return 'G';
    if (g === 'CHILDRENS' || g === 'CHILDREN' || g === 'C') return 'C';
    if (g === 'ALL') return 'All';
    return cand.gender?.trim() || 'All';
  };

  // Height display helper
  const getHeightDisplay = (cand: Candidate): string => {
    if (!cand.height || cand.height.trim().toUpperCase() === 'ALL') return 'All';
    return cand.height.replace(/`/g, "'");
  };

  // Events display helper (sorted ascending)
  const getEventsDisplay = (cand: Candidate): string => {
    if (!cand.selectedEvents || cand.selectedEvents.length === 0) return '-';
    return [...cand.selectedEvents]
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)
      .join(', ');
  };

  // Category pill counts and unique candidates list
  const uniqueCandidates = useMemo(() => {
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const unique: Candidate[] = [];
    candidates.forEach(c => {
      if (!c || !c.id) return;
      const nameKey = (c.name || '').trim().toUpperCase();
      if (seenIds.has(c.id) || (nameKey && seenNames.has(nameKey))) return;
      seenIds.add(c.id);
      if (nameKey) seenNames.add(nameKey);
      unique.push(c);
    });
    return unique;
  }, [candidates]);

  const pillCounts = useMemo(() => {
    let cCount = 0;
    let bCount = 0;
    let gCount = 0;
    uniqueCandidates.forEach(cand => {
      const code = getGroupCode(cand);
      if (code === 'B') bCount++;
      else if (code === 'G') gCount++;
      else cCount++;
    });
    return {
      all: uniqueCandidates.length,
      c: cCount,
      b: bCount,
      g: gCount,
    };
  }, [uniqueCandidates]);

  // Filtered and sorted list
  const filteredCandidates = useMemo(() => {
    const list = uniqueCandidates.filter(c => {
      // Category pill filter
      if (activeCategoryPill !== 'ALL') {
        const code = getGroupCode(c);
        if (code !== activeCategoryPill) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchClub = (c.club || '').toLowerCase().includes(q);
        const matchEvents = (c.selectedEvents || []).some(no => String(no).includes(q));
        const matchChest = String(mode === 'server' ? (c.chestNo || '') : (c.chestNo || c.localRecordNo || '')).includes(q);
        if (!matchName && !matchClub && !matchEvents && !matchChest) return false;
      }

      return true;
    });

    if (mode === 'server') {
      // "view all candidate list in descending chest number wise in server page"
      return [...list].sort((a, b) => (Number(b.chestNo) || 0) - (Number(a.chestNo) || 0));
    } else {
      // In client mode: "the last entry should appear at top"
      return [...list].sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          if (diff !== 0) return diff;
        }
        const numA = Number(a.chestNo && Number(a.chestNo) >= 101 ? a.chestNo : (a.localRecordNo || a.chestNo)) || 0;
        const numB = Number(b.chestNo && Number(b.chestNo) >= 101 ? b.chestNo : (b.localRecordNo || b.chestNo)) || 0;
        if (numB !== numA) return numB - numA;
        return uniqueCandidates.indexOf(b) - uniqueCandidates.indexOf(a);
      });
    }
  }, [uniqueCandidates, activeCategoryPill, searchTerm, mode]);

  // Total fees sum for filtered candidates
  const totalFeesSum = useMemo(() => {
    return filteredCandidates.reduce((acc, c) => acc + (Number(c.totalFees) || 0), 0);
  }, [filteredCandidates]);

  // Export to CSV (descending Sl matching table order)
  const handleExportCSV = () => {
    const headers = ['Sl', 'Chest No', 'Name', 'Club', 'Group', 'Height', 'Event Numbers', 'Total Fees', 'Sync Status'];
    const rows = filteredCandidates.map((c, i) => [
      filteredCandidates.length - i,
      c.chestNo,
      `"${c.name}"`,
      `"${c.club}"`,
      getShortGenderDisplay(c),
      `"${c.height}"`,
      `"${(c.selectedEvents || []).join(', ')}"`,
      c.totalFees,
      c.synced && !c.isDirty ? 'Synced' : 'Pending',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `eSports_Candidates_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-3 print:max-w-none print:m-0 print:p-0">
      
      <div className={`space-y-3 candidate-web-content ${showPrintModal ? 'print:hidden' : ''}`}>
      {/* CARD CONTAINER: Medium-light slate surface (not dark, not glaring white) */}
      <div className="bg-slate-200 border border-slate-300 rounded-2xl shadow-lg overflow-hidden text-slate-900 animate-in fade-in">
        
        {/* TOP BAR: Amber-outlined Search Bar + Close 'X' Button */}
        <div className="p-3 bg-slate-200 border-b border-slate-300">
          <div className="flex items-center gap-2">
            
            {/* Search Box */}
            <div className="flex-1 flex items-center bg-slate-100 border-2 border-amber-500 rounded-2xl px-3 py-2 shadow-2xs">
              <Search className="w-5 h-5 text-amber-600 shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim() && filteredCandidates.length === 1) {
                    e.preventDefault();
                    const singleCand = filteredCandidates[0];
                    const rowKey = singleCand.id || `${singleCand.chestNo}-0`;
                    setDeleteConfirmId(null);
                    setCancelConfirmId(null);
                    setExpandedRowId(rowKey);
                    const isCancelled = singleCand.isCancelled || singleCand.status === 'cancelled';
                    const isRestricted = getCandidateRestrictionStatus(singleCand, events, heats, results, mode).isRestricted;
                    if (!isCancelled && !isRestricted) {
                      setEditingCandidate(singleCand);
                    }
                  }
                }}
                placeholder="Search chest no, name, club, events..."
                className="w-full bg-transparent text-slate-900 placeholder:text-slate-500 text-xs sm:text-sm font-semibold px-2.5 focus:outline-hidden"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-slate-500 hover:text-slate-900 p-0.5 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Close 'X' Button */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-700 hover:text-slate-950 hover:bg-slate-300/80 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Close and return"
              >
                <X className="w-6 h-6 stroke-[2.5]" />
              </button>
            )}

          </div>
        </div>

        {/* CATEGORY FILTER PILLS: ALL, C, B, G */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2 px-3 py-1.5 bg-slate-200/70 border-b border-slate-300">
          {/* ALL */}
          <button
            type="button"
            onClick={() => setActiveCategoryPill('ALL')}
            className={`w-full h-8 sm:h-9 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap truncate ${
              activeCategoryPill === 'ALL'
                ? 'bg-amber-100 border-2 border-amber-500 text-slate-950 shadow-xs font-extrabold'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-white hover:border-slate-400'
            }`}
          >
            ALL ({pillCounts.all})
          </button>

          {/* C (Children/All) */}
          <button
            type="button"
            onClick={() => setActiveCategoryPill('C')}
            className={`w-full h-8 sm:h-9 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap truncate ${
              activeCategoryPill === 'C'
                ? 'bg-amber-100 border-2 border-amber-500 text-slate-950 shadow-xs font-extrabold'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-white hover:border-slate-400'
            }`}
          >
            C ({pillCounts.c})
          </button>

          {/* B (Boys) */}
          <button
            type="button"
            onClick={() => setActiveCategoryPill('B')}
            className={`w-full h-8 sm:h-9 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap truncate ${
              activeCategoryPill === 'B'
                ? 'bg-amber-100 border-2 border-amber-500 text-slate-950 shadow-xs font-extrabold'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-white hover:border-slate-400'
            }`}
          >
            B ({pillCounts.b})
          </button>

          {/* G (Girls) */}
          <button
            type="button"
            onClick={() => setActiveCategoryPill('G')}
            className={`w-full h-8 sm:h-9 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap truncate ${
              activeCategoryPill === 'G'
                ? 'bg-amber-100 border-2 border-amber-500 text-slate-950 shadow-xs font-extrabold'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-white hover:border-slate-400'
            }`}
          >
            G ({pillCounts.g})
          </button>
        </div>

        {/* TABLE HEADER: Sl. | Chest | Name & Club | Info */}
        <div className="flex items-center justify-between gap-1.5 px-3 sm:px-4 py-2 text-xs font-black text-slate-800 border-b border-slate-300 select-none bg-slate-300/75">
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1">
            <div className="w-6 sm:w-7 text-center shrink-0">Sl.</div>
            <div className="w-10 sm:w-11 text-center shrink-0">{mode === 'client' ? 'No.' : 'Chest'}</div>
            <div className="flex-1 min-w-0">{mode === 'client' ? 'Name' : 'Name & Club'}</div>
          </div>
          <div className="w-8 text-right shrink-0 text-[11px] font-bold text-slate-600 pr-0.5">
            Info
          </div>
        </div>

        {/* CANDIDATES LIST ROWS */}
        <div className="overflow-y-auto divide-y divide-slate-300/80 max-h-[65vh] bg-slate-100">
          {filteredCandidates.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs sm:text-sm font-medium">
              No candidates found matching your criteria.
            </div>
          ) : (
            filteredCandidates.map((cand, idx) => {
              const rowKey = cand.id || `${cand.chestNo}-${idx}`;
              const slNumber = filteredCandidates.length - idx;
              const shortGender = getShortGenderDisplay(cand);
              const heightStr = getHeightDisplay(cand);
              const eventsStr = getEventsDisplay(cand);
              const isExpanded = expandedRowId === rowKey;
              const isConfirmingDelete = deleteConfirmId === cand.id;
              const isConfirmingCancel = cancelConfirmId === cand.id;
              const isCancelled = cand.isCancelled || cand.status === 'cancelled';
              const chestNumberNum = Number(cand.chestNo) || 0;
              const isRanked = !isCancelled && chestNumberNum > 0 && rankedChestNosSet.has(chestNumberNum);
              const isServerSaved = mode === 'server' && ((Boolean(cand.chestNo) && Number(cand.chestNo) >= 101) || cand.synced);
              const restrictionStatus = getCandidateRestrictionStatus(cand, events, heats, results, mode);
              const isRestricted = restrictionStatus.isRestricted;
              const displayChest =
                mode === 'server'
                  ? (cand.chestNo || '—')
                  : (cand.chestNo && Number(cand.chestNo) >= 101
                      ? cand.chestNo
                      : (cand.localRecordNo || cand.chestNo || '—'));

              const rowBgClass = isExpanded
                ? 'bg-blue-100 hover:bg-blue-100 border-l-4 border-l-blue-600'
                : isCancelled
                ? 'bg-rose-100 hover:bg-rose-200/70 border-l-4 border-l-rose-500'
                : isRanked
                ? 'bg-emerald-100 hover:bg-emerald-200/70 border-l-4 border-l-emerald-500'
                : 'bg-slate-100 hover:bg-slate-200/75';

              return (
                <div
                  key={rowKey}
                  className={`px-3 sm:px-4 py-2.5 transition-colors ${rowBgClass}`}
                >
                  {/* COLLAPSED HEADER LINE: Click/tap anywhere on row header to expand/minimize */}
                  <div
                    onClick={() => toggleRowExpand(rowKey)}
                    className="flex items-start justify-between gap-1.5 cursor-pointer touch-manipulation select-none"
                  >
                    <div className="flex items-start gap-1 sm:gap-1.5 min-w-0 flex-1">
                      {/* 1. Descending Sl. + Small Lock icon underneath when Edit is locked */}
                      <div className="w-6 sm:w-7 flex flex-col items-center shrink-0 pt-0.5">
                        <span className="text-center text-xs sm:text-sm font-bold text-slate-600 font-mono leading-snug">
                          {slNumber}
                        </span>
                        {isRestricted && (
                          <span
                            title={
                              restrictionStatus.reason === 'ranking_completed'
                                ? `Edit locked: Ranking list prepared for Event ${restrictionStatus.rankingCompletedEvents.join(', ')}`
                                : `Edit locked: Promoted to final in Event ${restrictionStatus.promotedFinalEvents.join(', ')}`
                            }
                            className="mt-1 inline-flex items-center justify-center text-slate-600"
                          >
                            <Lock className="w-3 h-3 stroke-[2.2]" />
                          </span>
                        )}
                      </div>

                      {/* 2. Chest Number (without # prefix) + "Ranked" label underneath in deep green */}
                      <div className="w-10 sm:w-11 flex flex-col items-center shrink-0">
                        <span
                          className={`w-9 sm:w-10 text-center px-1 py-0.5 rounded-md font-mono font-black text-xs sm:text-sm shadow-2xs ${
                            isCancelled
                              ? 'bg-rose-200/90 border border-rose-400 text-rose-800 line-through'
                              : isRanked
                              ? 'bg-emerald-200/80 border border-emerald-400 text-emerald-950'
                              : 'bg-amber-100 border border-amber-400 text-amber-950'
                          }`}
                        >
                          {displayChest}
                        </span>
                        {isRanked && (
                          <span className="text-[10px] sm:text-[11px] font-bold text-emerald-900 leading-tight mt-0.5 text-center select-none">
                            Ranked
                          </span>
                        )}
                      </div>

                      {/* 3. Name (line 1) & Club Name directly below Name (line 2) */}
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowExpand(rowKey);
                          }}
                          aria-expanded={isExpanded}
                          title={isExpanded ? `Minimize details for ${cand.name}` : `Expand details for ${cand.name}`}
                          className={`block w-full text-left font-extrabold text-xs sm:text-sm uppercase tracking-wide truncate leading-snug pt-0.5 cursor-pointer touch-manipulation transition-colors focus:outline-hidden ${
                            isExpanded
                              ? 'text-blue-700'
                              : 'text-slate-900 hover:text-amber-900'
                          } active:opacity-80`}
                        >
                          {cand.name}
                        </button>
                        {mode !== 'client' && (
                          <div className="text-[11px] sm:text-xs text-slate-600 font-semibold uppercase truncate leading-tight mt-0.5">
                            {cand.club || 'INDEPENDENT'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Expand / Minimize Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRowExpand(rowKey);
                      }}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Minimize details for ${cand.name}` : `Expand details for ${cand.name}`}
                      title={isExpanded ? 'Minimize row' : 'Expand row'}
                      className="p-1.5 rounded-lg bg-slate-200/90 hover:bg-slate-300 border border-slate-300 text-slate-700 hover:text-slate-950 transition-all active:scale-95 cursor-pointer shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 stroke-[2.5]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                      )}
                    </button>
                  </div>

                  {/* EXPANDED DETAILS SECTION */}
                  {isExpanded && (() => {
                    const additionalEvents =
                      mode === 'server' && !isCancelled
                        ? getAdditionalEventsForCandidate(cand, events)
                        : [];
                    const feeStUpper = (cand.feeStatus || 'Due').trim().toUpperCase();
                    const isFeeFree = feeStUpper.includes('FREE') || feeStUpper.includes('EXEMPT');
                    const isFeePaid = !isFeeFree && !feeStUpper.includes('DUE') && !feeStUpper.includes('UNPAID') && feeStUpper.includes('PAID');
                    const feeStatusLabel = isFeeFree ? 'Free' : isFeePaid ? 'Paid' : 'Due';
                    const candFeeDisplay = isFeeFree ? 'Free' : `${feeStatusLabel} ${settings.currencySymbol || '₹'}${Number(cand.totalFees || 0).toFixed(0)}`;

                    return (
                    <div className="mt-2 pt-2 border-t border-slate-300/80 pl-1 space-y-2 animate-in fade-in duration-150">
                      {/* Line 1: (height / gender short form) + Fee status & cumulative fee on left + Enrolled Events on right */}
                      <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-200 border border-slate-300 text-slate-800 font-bold font-mono whitespace-nowrap">
                            ({heightStr} / {shortGender})
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md border font-mono font-bold whitespace-nowrap ${
                              isFeeFree
                                ? 'bg-sky-100 border-sky-300 text-sky-900'
                                : isFeePaid
                                ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                                : 'bg-amber-100 border-amber-300 text-amber-900'
                            }`}
                          >
                            {candFeeDisplay}
                          </span>
                        </div>
                        <div className="text-right font-mono font-bold text-slate-800 truncate min-w-0 ml-auto">
                          <span className="font-sans font-semibold text-slate-500 mr-1">Events:</span>
                          <span className="text-amber-800">{eventsStr}</span>
                        </div>
                      </div>

                      {/* Additional Events (Higher Heights under Same Gender) & Direct Events Quick Enroll */}
                      {mode === 'server' && !isCancelled && (additionalEvents.length > 0 || directEvents.length > 0) && (
                        <div className="space-y-1.5 bg-slate-200/70 rounded-lg px-2 py-1.5 border border-slate-300/80">
                          {additionalEvents.length > 0 && (
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-[11px] font-bold text-slate-700 shrink-0">
                                Additional Events:
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                {additionalEvents.map((aEvt) => {
                                  const evtNo = Number(aEvt.Evt_No);
                                  const isEnrolled = (cand.selectedEvents || []).map(Number).includes(evtNo);
                                  const isToggling = togglingDirectKey === `${cand.id}:${evtNo}`;
                                  const isThisEvtLocked = restrictionStatus.restrictingEvents.includes(evtNo);
                                  const serverDisableReason = !isEnrolled
                                    ? getServerEventEnrollmentDisableReason(aEvt, results, mode)
                                    : null;
                                  const isDisabled = isToggling || (isEnrolled && isThisEvtLocked) || Boolean(serverDisableReason);
                                  const cleanHeight = (aEvt.Height || '').replace(/`/g, "'");
                                  return (
                                    <button
                                      key={evtNo}
                                      type="button"
                                      disabled={isDisabled}
                                      onClick={() => handleToggleQuickEvent(cand, aEvt)}
                                      title={
                                        isEnrolled && isThisEvtLocked
                                          ? `Event ${evtNo} (${aEvt.Evt_Name} - ${cleanHeight}) already promoted/ranked`
                                          : serverDisableReason
                                          ? serverDisableReason
                                          : isEnrolled
                                          ? `Click to remove Event ${evtNo} (${aEvt.Evt_Name} • ${cleanHeight} • ${settings.currencySymbol || '₹'}${Number(aEvt.Fees) || 0})`
                                          : `Click to add Event ${evtNo} (${aEvt.Evt_Name} • ${cleanHeight} • ${settings.currencySymbol || '₹'}${Number(aEvt.Fees) || 0})`
                                      }
                                      aria-pressed={isEnrolled}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-black text-xs border transition-all active:scale-95 cursor-pointer touch-manipulation disabled:opacity-55 disabled:cursor-not-allowed ${
                                        isEnrolled
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                                          : 'bg-white hover:bg-blue-50 text-slate-800 border-blue-400 shadow-2xs'
                                      }`}
                                    >
                                      <span>{evtNo}</span>
                                      <span className="font-sans font-semibold text-[10px] opacity-90 truncate max-w-[115px]">
                                        {aEvt.Evt_Name} ({cleanHeight})
                                      </span>
                                      {isEnrolled && <Check className="w-3 h-3 shrink-0 stroke-[3]" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {directEvents.length > 0 && (
                            <div className={`flex items-center justify-between gap-2 flex-wrap ${additionalEvents.length > 0 ? 'pt-1.5 border-t border-slate-300/70' : ''}`}>
                              <span className="text-[11px] font-bold text-slate-700 shrink-0">
                                Direct Events:
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                {directEvents.map((dEvt) => {
                                  const evtNo = Number(dEvt.Evt_No);
                                  const isEnrolled = (cand.selectedEvents || []).map(Number).includes(evtNo);
                                  const isToggling = togglingDirectKey === `${cand.id}:${evtNo}`;
                                  const isThisDirectEvtLocked = restrictionStatus.restrictingEvents.includes(evtNo);
                                  const serverDisableReason = !isEnrolled
                                    ? getServerEventEnrollmentDisableReason(dEvt, results, mode)
                                    : null;
                                  const isDisabled = isToggling || (isEnrolled && isThisDirectEvtLocked) || Boolean(serverDisableReason);
                                  return (
                                    <button
                                      key={evtNo}
                                      type="button"
                                      disabled={isDisabled}
                                      onClick={() => handleToggleQuickEvent(cand, dEvt)}
                                      title={
                                        isEnrolled && isThisDirectEvtLocked
                                          ? `Event ${evtNo} (${dEvt.Evt_Name}) already promoted/ranked`
                                          : serverDisableReason
                                          ? serverDisableReason
                                          : isEnrolled
                                          ? `Click to remove direct event ${evtNo} (${dEvt.Evt_Name})`
                                          : `Click to enroll in direct event ${evtNo} (${dEvt.Evt_Name})`
                                      }
                                      aria-pressed={isEnrolled}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-black text-xs border transition-all active:scale-95 cursor-pointer touch-manipulation disabled:opacity-55 disabled:cursor-not-allowed ${
                                        isEnrolled
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                                          : 'bg-white hover:bg-amber-50 text-slate-800 border-amber-400 shadow-2xs'
                                      }`}
                                    >
                                      <span>{evtNo}</span>
                                      <span className="font-sans font-semibold text-[10px] opacity-90 truncate max-w-[120px]">
                                        {dEvt.Evt_Name}
                                      </span>
                                      {isEnrolled && <Check className="w-3 h-3 shrink-0 stroke-[3]" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Line 2: Edit on LEFT; Chest Cancelled / Cancel Chest / Delete on RIGHT */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {isCancelled ? (
                          <>
                            <span />
                            <span className="text-[11px] font-bold text-rose-800 bg-rose-200/80 px-2.5 py-1 rounded-lg border border-rose-300 ml-auto">
                              Chest Cancelled
                            </span>
                          </>
                        ) : isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteCandidate(cand.id);
                                setDeleteConfirmId(null);
                              }}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2.5 py-1 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : isConfirmingCancel ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                if (onCancelChest) {
                                  await onCancelChest(cand.id);
                                }
                                setCancelConfirmId(null);
                              }}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                            >
                              Confirm Cancel Chest
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelConfirmId(null)}
                              className="px-2.5 py-1 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Left slot: Edit Button (omitted when edit is locked; Lock icon shown under Sl.) */}
                            {!isRestricted ? (
                              <button
                                type="button"
                                onClick={() => setEditingCandidate(cand)}
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 border border-amber-400 text-amber-900 text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap shadow-2xs active:scale-95 cursor-pointer"
                                title={`Edit ${cand.name}`}
                              >
                                <Pencil className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span>Edit</span>
                              </button>
                            ) : (
                              <span />
                            )}

                            {/* Right slot: Cancel Chest (Saved on Server) or Delete Button */}
                            {isServerSaved ? (
                              <button
                                type="button"
                                onClick={() => setCancelConfirmId(cand.id)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer whitespace-nowrap ml-auto"
                                title={`Cancel Chest ${cand.chestNo} (Deletion strictly prohibited for saved candidate)`}
                              >
                                <Ban className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>Cancel Chest</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(cand.id)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer whitespace-nowrap ml-auto"
                                title={`Delete ${cand.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>Delete</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>

        {/* BOTTOM ACTION & SUMMARY BAR */}
        <div className="px-3.5 py-2.5 bg-slate-200 border-t border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
          
          <div className="text-slate-700 font-medium text-center sm:text-left">
            Showing <span className="font-bold text-slate-950">{filteredCandidates.length}</span> of {candidates.length} candidates
            {totalFeesSum > 0 && (
              <span className="ml-2 text-amber-800 font-bold">• Total: {settings.currencySymbol || '₹'}{totalFeesSum}</span>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 sm:gap-2.5 w-full sm:w-auto">
            {/* Print, Excel & CSV Export Buttons - Only available on Server side, hidden on Client side */}
            {mode !== 'client' && (
              <>
                {/* Print A4 Button (Icon Only) */}
                <button
                  type="button"
                  onClick={() => setShowPrintModal(true)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
                  title="Print Candidate List A4 Sheet"
                  aria-label="Print Candidate List A4 Sheet"
                >
                  <Printer className="w-4 h-4" />
                </button>

                {/* Export Excel (.xlsx) with 'General Entry' & 'Event Allocation' (Icon Only) */}
                <button
                  type="button"
                  onClick={async () => {
                    const { downloadSportsMeetExcel } = await import('../services/excelExport');
                    downloadSportsMeetExcel({
                      candidates,
                      events,
                      clubs,
                      heats,
                      results,
                      settings,
                    });
                  }}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
                  title="Download Excel Workbook (.xlsx) with 'General Entry' & 'Event Allocation' sheets"
                  aria-label="Download Excel Workbook (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                </button>

                {/* Export CSV Button (Icon Only) */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0 border border-slate-500/40"
                  title="Export to CSV"
                  aria-label="Export to CSV"
                >
                  <Download className="w-4 h-4 text-white" />
                </button>
              </>
            )}

            {/* Send (Sync) Button with count badge (Icon Only) */}
            <button
              type="button"
              onClick={onSyncToServer}
              disabled={isSyncing || (mode === 'client' && (settings?.clientResponseEnabled === false))}
              className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl active:scale-95 text-white flex items-center justify-center shadow-md transition-all shrink-0 ${
                mode === 'client' && (settings?.clientResponseEnabled === false)
                  ? 'opacity-40 cursor-not-allowed bg-slate-400 text-slate-600'
                  : 'bg-[#15803d] hover:bg-[#16a34a] cursor-pointer disabled:opacity-50'
              }`}
              title={
                mode === 'client' && (settings?.clientResponseEnabled === false)
                  ? 'Client responses are paused by the server administrator'
                  : isSyncing
                  ? `Sending... (${unsyncedCandidates.length})`
                  : `Sync pending records to server database (${unsyncedCandidates.length} pending)`
              }
              aria-label="Send / Sync Records"
            >
              <Send className={`w-4 h-4 ${isSyncing ? 'animate-pulse' : ''}`} />
              {unsyncedCandidates.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 px-1 min-w-[16px] h-4 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow-xs pointer-events-none">
                  {unsyncedCandidates.length}
                </span>
              )}
            </button>
          </div>

        </div>

      </div>

      {/* DEDICATED SEPARATE PAGE/MODAL FOR EDITING CANDIDATE DETAILS */}
      {editingCandidate && (
        <CandidateEditModal
          candidate={editingCandidate}
          events={events}
          clubs={clubs}
          allCandidates={candidates}
          mode={mode}
          heats={heats}
          results={results}
          onSave={async (updated) => {
            if (onSaveCandidate) {
              await onSaveCandidate(updated);
            }
            setEditingCandidate(null);
          }}
          onClose={() => setEditingCandidate(null)}
        />
      )}
      </div>

      {/* CANDIDATE LIST A4 PRINT MODAL (Matches CandidateListA4.png exactly) */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
          {/* Dynamic Print Stylesheet */}
          <style>{`
            @media print {
              header, nav, footer, .candidate-web-content {
                display: none !important;
              }
              @page {
                size: A4 portrait !important;
                margin: 8mm 8mm !important;
              }
              html, body {
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .candidate-a4-printable-sheet {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
              }
            }
          `}</style>
          <div className="bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:max-w-none print:rounded-none print:overflow-visible print:p-0">
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-xs sm:text-base">Name List</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="flex items-center justify-center p-1.5 sm:p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-md transition-all cursor-pointer active:scale-95 shrink-0"
                  title="Close Preview (X)"
                  aria-label="Close Print Preview"
                >
                  <X className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Scrollable Preview Canvas */}
            <div className="p-2 sm:p-6 overflow-y-auto flex-1 bg-slate-200/80 flex justify-center print:p-0 print:bg-white print:overflow-visible print:block">
              <div 
                className="candidate-a4-printable-sheet bg-white w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-10 shadow-md border-0 outline-none text-black print:p-0 print:m-0 print:border-none print:shadow-none print:outline-none print:bg-white print:max-w-none print:min-h-0"
                id="printable-candidate-list"
                style={{ fontFamily: 'Consolas, "Courier New", monospace' }}
              >
                {/* Top Header: Logo + Club / Meet Title on Left | "Name list (Chest No. wise)" on Right */}
                <div className="flex items-center justify-between mb-4 pb-1 text-black font-bold">
                  <div className="flex items-center gap-2">
                    <img
                      src={settings.registeredClubLogo || clubs[0]?.logoUrl || '/icon.png'}
                      alt="Club Logo"
                      data-protect-logo="true"
                      draggable={false}
                      className="w-6 h-6 object-contain rounded-full shrink-0 protected-logo select-none pointer-events-none"
                    />
                    <span className="font-bold text-sm sm:text-base text-black tracking-tight">
                      {settings.registeredClubName || settings.organizer || 'Sasthitala Agrani'} / {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
                    </span>
                  </div>
                  <div className="font-bold text-sm sm:text-base text-black tracking-tight">
                    Name list (Chest No. wise)
                  </div>
                </div>

                {/* Table: In Consolas font with bold headers and only chest number in bold in rows */}
                <table className="w-full text-left border-collapse bg-white text-black" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
                  <thead>
                    <tr className="border-b border-gray-300 text-sm text-black font-bold">
                      <th className="py-1 px-2 text-center w-12 font-bold">Sl.</th>
                      <th className="py-1 px-3 text-center w-16 font-bold">Ch#</th>
                      <th className="py-1 px-3 text-left font-bold">Name (Club)</th>
                      <th className="py-1 px-3 text-left w-32 font-bold">Events</th>
                      <th className="py-1 px-3 text-left w-36 font-bold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chestWiseCandidates.map((cand, idx) => {
                      const isDue = (cand.feeStatus || '').toUpperCase().includes('DUE') || (cand.feeStatus || '').toUpperCase().includes('UNPAID');
                      const eventsStr = (cand.selectedEvents || []).map(Number).sort((a, b) => a - b).join(',');
                      const clubStr = cand.club ? `(${cand.club})` : '';
                      const amountStr = `₹ ${Number(cand.totalFees || 0).toFixed(2)} (${isDue ? 'D' : 'P'})`;

                      return (
                        <tr key={cand.id || cand.chestNo} className="border-b border-gray-200 text-sm text-black">
                          <td className="py-0.5 px-2 text-center font-normal text-black w-12 leading-tight">
                            {idx + 1}
                          </td>
                          <td className="py-0.5 px-3 text-center font-bold text-black w-16 leading-tight">
                            {cand.chestNo}
                          </td>
                          <td className="py-0.5 px-3 text-left font-normal text-black leading-tight">
                            <span className="uppercase font-normal">{cand.name}</span>
                            {clubStr && <span className="ml-2 font-normal"> {clubStr}</span>}
                          </td>
                          <td className="py-0.5 px-3 text-left font-normal text-black w-32 leading-tight">
                            {eventsStr || '—'}
                          </td>
                          <td className="py-0.5 px-3 text-left font-normal text-black w-36 whitespace-nowrap leading-tight">
                            {amountStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

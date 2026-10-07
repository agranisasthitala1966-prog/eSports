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
  Lock
} from 'lucide-react';
import { CandidateEditModal } from './CandidateEditModal';
import { 
  getCandidateRestrictionStatus, 
  getCandidateEditRestrictedMessage 
} from '../utils/qualificationRules';

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
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

  // Unsynced candidates calculation
  const unsyncedCandidates = useMemo(() => {
    return candidates.filter(c => !c.synced || c.isDirty);
  }, [candidates]);

  // Group code helper: C (Children/All), B (Boys), G (Girls)
  const getGroupCode = (cand: Candidate): string => {
    const g = (cand.gender || '').toUpperCase();
    if (g === 'BOYS' || g === 'B') return 'B';
    if (g === 'GIRLS' || g === 'G') return 'G';
    return 'C';
  };

  // Height display helper
  const getHeightDisplay = (cand: Candidate): string => {
    if (!cand.height || cand.height === 'ALL') return 'ALL';
    return cand.height.replace(/`/g, "'");
  };

  // Events display helper
  const getEventsDisplay = (cand: Candidate): string => {
    if (!cand.selectedEvents || cand.selectedEvents.length === 0) return '-';
    return cand.selectedEvents.join(', ');
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

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Sl', 'Chest No', 'Name', 'Club', 'Group', 'Height', 'Event Numbers', 'Total Fees', 'Sync Status'];
    const rows = filteredCandidates.map((c, i) => [
      i + 1,
      c.chestNo,
      `"${c.name}"`,
      `"${c.club}"`,
      getGroupCode(c),
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
    <div className="max-w-4xl mx-auto space-y-3">
      
      {/* CARD CONTAINER */}
      <div className="bg-[#080d19] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in">
        
        {/* TOP BAR: Yellow-outlined Search Bar + Close 'X' Button */}
        <div className="p-3 bg-[#080d19] border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            
            {/* Search Box with Gold Outline */}
            <div className="flex-1 flex items-center bg-[#0d1527] border-2 border-amber-400 rounded-2xl px-3 py-2 shadow-inner">
              <Search className="w-5 h-5 text-amber-400 shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search chest #, name, club, events..."
                className="w-full bg-transparent text-white placeholder:text-slate-500 text-xs sm:text-sm font-semibold px-2.5 focus:outline-hidden"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
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
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Close and return"
              >
                <X className="w-6 h-6 stroke-[2.5]" />
              </button>
            )}

          </div>
        </div>

        {/* CATEGORY FILTER PILLS: ALL, C, B, G */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#090f1d] border-b border-slate-800/80 overflow-x-auto no-scrollbar">
          {/* ALL */}
          <button
            type="button"
            onClick={() => setActiveCategoryPill('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeCategoryPill === 'ALL'
                ? 'bg-[#15231c] border-2 border-yellow-400 text-yellow-300 shadow-md'
                : 'bg-[#0f172a] border border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            ALL ({pillCounts.all})
          </button>

          {/* C (Children/All) */}
          <button
            type="button"
            onClick={() => setActiveCategoryPill('C')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeCategoryPill === 'C'
                ? 'bg-[#1f1b3b] border-2 border-yellow-400 text-yellow-300 shadow-md'
                : 'bg-[#161a35] border border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            C ({pillCounts.c})
          </button>

          {/* B (Boys) */}
          <button
            type="button"
            onClick={() => setActiveCategoryPill('B')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeCategoryPill === 'B'
                ? 'bg-[#1e204c] border-2 border-yellow-400 text-yellow-300 shadow-md'
                : 'bg-[#1c224a] border border-indigo-900/80 text-slate-300 hover:border-slate-500'
            }`}
          >
            B ({pillCounts.b})
          </button>

          {/* G (Girls) */}
          <button
            type="button"
            onClick={() => setActiveCategoryPill('G')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeCategoryPill === 'G'
                ? 'bg-[#143024] border-2 border-yellow-400 text-yellow-300 shadow-md'
                : 'bg-[#142921] border border-emerald-900/80 text-slate-300 hover:border-slate-500'
            }`}
          >
            G ({pillCounts.g})
          </button>
        </div>

        {/* TABLE HEADER: Sl. | Chest # | Name | Gr | Events | Actions */}
        <div className="grid grid-cols-12 gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2.5 text-xs font-black text-amber-400 border-b border-slate-800 select-none bg-[#070b15]">
          <div className="col-span-1 text-center">Sl.</div>
          <div className="col-span-2 text-center">{mode === 'client' ? '#' : 'Chest #'}</div>
          <div className="col-span-4 sm:col-span-3 pl-1">{mode === 'client' ? 'Name' : 'Name & Club'}</div>
          <div className="col-span-2 sm:col-span-2 text-center">Gr</div>
          <div className="col-span-3 sm:col-span-2 text-center">Events</div>
          <div className="hidden sm:block sm:col-span-2 text-right pr-2">Actions</div>
        </div>

        {/* CANDIDATES TABLE ROWS */}
        <div className="overflow-y-auto divide-y divide-slate-800/70 p-1 max-h-[65vh]">
          {filteredCandidates.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs sm:text-sm">
              No candidates found matching your criteria.
            </div>
          ) : (
            filteredCandidates.map((cand, idx) => {
              const groupCode = getGroupCode(cand);
              const heightStr = getHeightDisplay(cand);
              const eventsStr = getEventsDisplay(cand);
              const isConfirmingDelete = deleteConfirmId === cand.id;
              const isCancelled = cand.isCancelled || cand.status === 'cancelled';
              const isServerSaved = mode === 'server' && (Boolean(cand.chestNo) && Number(cand.chestNo) >= 101 || cand.synced);
              const restrictionStatus = getCandidateRestrictionStatus(cand, events, heats, results, mode);
              const isRestricted = restrictionStatus.isRestricted;
              const qualifiedEvts = restrictionStatus.restrictingEvents;

              return (
                <div
                  key={cand.id || idx}
                  className={`grid grid-cols-12 gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2.5 items-center transition-colors ${
                    isCancelled ? 'bg-rose-950/20 opacity-75' : 'hover:bg-[#0e172e]/60'
                  }`}
                >
                  {/* 1. Sl. */}
                  <div className="col-span-1 text-center text-xs sm:text-sm font-bold text-slate-400 font-mono">
                    {idx + 1}
                  </div>

                  {/* 2. Chest Number Badge */}
                  <div className="col-span-2 text-center">
                    <span className={`inline-block px-1.5 sm:px-2.5 py-0.5 rounded-md font-mono font-black text-xs sm:text-sm shadow-xs ${
                      isCancelled
                        ? 'bg-rose-950/80 border border-rose-500/70 text-rose-300 line-through'
                        : 'bg-amber-400/15 border border-amber-400/50 text-amber-300'
                    }`}>
                      #{mode === 'server' ? (cand.chestNo || '—') : (cand.chestNo && Number(cand.chestNo) >= 101 ? cand.chestNo : (cand.localRecordNo || cand.chestNo || '—'))}
                    </span>
                    {isCancelled && (
                      <span className="block text-[9px] font-black tracking-wider text-rose-400 uppercase mt-0.5">
                        CANCELLED
                      </span>
                    )}
                  </div>

                  {/* 3. Name & Club (Club removed only for client page) */}
                  <div className="col-span-4 sm:col-span-3 pl-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-white text-xs sm:text-sm uppercase tracking-wide truncate">
                        {cand.name}
                      </span>
                      {isRestricted && (
                        <span 
                          className="shrink-0 px-1 py-0.2 rounded bg-amber-500/20 border border-amber-400/60 text-amber-300 text-[9px] font-bold" 
                          title={
                            restrictionStatus.reason === 'hit_qualified'
                              ? `Qualified from hit to final in Event #${restrictionStatus.qualifiedHitEvents.join(', #')} - Editing locked`
                              : `Ranking preparation completed in Event #${restrictionStatus.rankingCompletedEvents.join(', #')} - Editing locked`
                          }
                        >
                          {restrictionStatus.reason === 'hit_qualified' ? 'Finalist' : 'Ranked'}
                        </span>
                      )}
                    </div>
                    {mode !== 'client' && (
                      <div className="text-[10px] sm:text-[11px] text-slate-400 font-semibold uppercase truncate">
                        {cand.club || 'INDEPENDENT'}
                      </div>
                    )}
                    {/* Mobile inline actions */}
                    <div className="flex sm:hidden items-center gap-2 mt-1">
                      {isCancelled ? (
                        <span className="text-[9px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-900/60">
                          Cancelled
                        </span>
                      ) : isConfirmingDelete ? (
                        <div className="flex items-center gap-1 animate-in fade-in">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteCandidate(cand.id);
                              setDeleteConfirmId(null);
                            }}
                            className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[9px] font-bold cursor-pointer"
                          >
                            Del
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[9px] font-bold cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isRestricted}
                            onClick={() => {
                              if (isRestricted) {
                                alert(getCandidateEditRestrictedMessage(cand, restrictionStatus));
                                return;
                              }
                              setEditingCandidate(cand);
                            }}
                            className={`text-[10px] font-bold flex items-center gap-0.5 ${
                              isRestricted ? 'text-slate-500 opacity-50 cursor-not-allowed' : 'text-amber-300 cursor-pointer hover:underline'
                            }`}
                            title={
                              isRestricted
                                ? (restrictionStatus.reason === 'ranking_completed'
                                    ? `Edit disabled: Ranking list prepared for Event #${restrictionStatus.rankingCompletedEvents.join(', #')}`
                                    : `Edit disabled: Candidate has been promoted to final in Event #${restrictionStatus.promotedFinalEvents.join(', #')}`)
                                : `Edit ${cand.name}`
                            }
                          >
                            {isRestricted ? <Lock className="w-2.5 h-2.5 text-slate-500" /> : <Pencil className="w-2.5 h-2.5" />}
                            <span>{isRestricted ? 'Disabled' : 'Edit'}</span>
                          </button>
                          <span className="text-slate-600 text-[10px]">•</span>

                          {isServerSaved ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Cancel Chest #${cand.chestNo} for candidate "${cand.name}"?\n\n• Deletion of saved candidate records is strictly prohibited under all circumstances.\n• This chest number will be marked as CANCELLED.\n• This candidate will not appear in any hit lists (heats).`
                                  )
                                ) {
                                  if (onCancelChest) {
                                    onCancelChest(cand.id);
                                  }
                                }
                              }}
                              className="text-[10px] text-rose-400 hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                            >
                              <Ban className="w-2.5 h-2.5" />
                              <span>Cancel Chest</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(cand.id)}
                              className="text-[10px] text-rose-400 hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* 4. Gr (Group Code & Height) */}
                  <div className="col-span-2 sm:col-span-2 text-center">
                    <div className="font-black text-amber-400 text-xs sm:text-sm">
                      {groupCode}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-300 font-mono truncate">
                      {heightStr}
                    </div>
                  </div>

                  {/* 5. Events */}
                  <div className="col-span-3 sm:col-span-2 text-center">
                    <div className="font-extrabold text-amber-400 font-mono text-xs sm:text-sm truncate">
                      {eventsStr}
                    </div>
                  </div>

                  {/* 6. Desktop Actions (Edit & Delete / Cancel Chest) */}
                  <div className="hidden sm:flex sm:col-span-2 items-center justify-end gap-1.5 pr-1">
                    {isCancelled ? (
                      <span className="text-[11px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900/60">
                        Chest Cancelled
                      </span>
                    ) : isConfirmingDelete ? (
                      <div className="flex items-center gap-1 animate-in fade-in">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCandidate(cand.id);
                            setDeleteConfirmId(null);
                          }}
                          className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          Del
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Edit Button */}
                        <button
                          type="button"
                          disabled={isRestricted}
                          onClick={() => {
                            if (isRestricted) {
                              alert(getCandidateEditRestrictedMessage(cand, restrictionStatus));
                              return;
                            }
                            setEditingCandidate(cand);
                          }}
                          className={`p-2 rounded-xl border transition-all shadow ${
                            isRestricted
                              ? 'opacity-40 cursor-not-allowed bg-slate-900 border-slate-700/60 text-slate-500'
                              : 'bg-[#18233c] hover:bg-[#23355b] border-blue-900/60 text-amber-300 active:scale-95 cursor-pointer'
                          }`}
                          title={
                            isRestricted
                              ? (restrictionStatus.reason === 'ranking_completed'
                                  ? `Editing disabled: Ranking list prepared for Event #${restrictionStatus.rankingCompletedEvents.join(', #')}`
                                  : `Editing disabled: Candidate has been promoted to final in Event #${restrictionStatus.promotedFinalEvents.join(', #')}`)
                              : `Edit ${cand.name}`
                          }
                        >
                          {isRestricted ? (
                            <Lock className="w-3.5 h-3.5 text-slate-500 stroke-[2.2]" />
                          ) : (
                            <Pencil className="w-3.5 h-3.5 text-amber-300 stroke-[2.2]" />
                          )}
                        </button>

                        {/* Delete or Cancel Chest Button */}
                        {isServerSaved ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Cancel Chest #${cand.chestNo} for candidate "${cand.name}"?\n\n• Deletion of saved candidate records is strictly prohibited under all circumstances.\n• This chest number will be marked as CANCELLED.\n• This candidate will not appear in any hit lists (heats).`
                                )
                              ) {
                                if (onCancelChest) {
                                  onCancelChest(cand.id);
                                }
                              }
                            }}
                            className="p-2 rounded-xl bg-[#3a1515] hover:bg-[#521b1b] border border-red-700/60 text-rose-300 transition-all active:scale-95 shadow cursor-pointer"
                            title={`Cancel Chest #${cand.chestNo} (Deletion strictly prohibited for saved candidate)`}
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-400 stroke-[2.2]" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(cand.id)}
                            className="p-2 rounded-xl bg-[#3b1219] hover:bg-[#521923] border border-rose-900/60 text-rose-300 transition-all active:scale-95 shadow cursor-pointer"
                            title={`Delete ${cand.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-300 stroke-[2.2]" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* BOTTOM ACTION & SUMMARY BAR */}
        <div className="px-3.5 py-3 bg-[#070b15] border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          
          <div className="text-slate-400 font-medium">
            Showing <span className="font-bold text-slate-200">{filteredCandidates.length}</span> of {candidates.length} candidates
            {totalFeesSum > 0 && (
              <span className="ml-2 text-amber-400 font-semibold">• Total: {settings.currencySymbol || '₹'}{totalFeesSum}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Export to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-300" />
              <span>CSV</span>
            </button>

            {/* Send (Sync) Button with count in bracket */}
            <button
              type="button"
              onClick={onSyncToServer}
              disabled={isSyncing}
              className="px-3.5 py-1.5 rounded-xl bg-[#15803d] hover:bg-[#16a34a] active:scale-98 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
              title="Sync pending records to server database"
            >
              <Send className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : ''}`} />
              <span>
                {isSyncing ? `Sending... (${unsyncedCandidates.length})` : `Send (${unsyncedCandidates.length})`}
              </span>
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
  );
};

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SportEvent, Candidate, EventResult, FinalParticipant, Club, SportsMeetSettings } from '../types';
import { 
  Trophy, 
  Printer, 
  X,
  Plus,
  ChevronDown,
  ArrowLeft,
  Lock,
  CheckCircle2
} from 'lucide-react';

interface RankingListProps {
  events: SportEvent[];
  candidates: Candidate[];
  results: EventResult[];
  clubs: Club[];
  settings: SportsMeetSettings;
  onSaveResult: (result: Partial<EventResult>) => Promise<void>;
  preselectedEvtNo?: number;
  onNavigateBackToHitList?: (evtNo?: number) => void;
}

type PrintScopeType = 'single' | 'range' | 'custom';

export const RankingList: React.FC<RankingListProps> = ({
  events,
  candidates,
  results,
  clubs,
  settings,
  onSaveResult,
  preselectedEvtNo,
  onNavigateBackToHitList,
}) => {
  // Sort events by Evt_No
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));
  }, [events]);

  const minEvtNo = sortedEvents[0]?.Evt_No ?? 1;
  const maxEvtNo = sortedEvents[sortedEvents.length - 1]?.Evt_No ?? 15;

  // Selected event for recording rankings
  const [selectedEvtNo, setSelectedEvtNo] = useState<number>(
    preselectedEvtNo ?? sortedEvents[0]?.Evt_No ?? 1
  );

  // Active event object
  const currentEvent = useMemo(() => {
    return events.find((e) => Number(e.Evt_No) === Number(selectedEvtNo)) || sortedEvents[0];
  }, [events, selectedEvtNo, sortedEvents]);

  // Current result from results pool
  const currentResult = useMemo(() => {
    return results.find((r) => Number(r.eventNo) === Number(selectedEvtNo));
  }, [results, selectedEvtNo]);

  // Check if current event already has completed / finalized rankings
  const isAlreadyRanked = useMemo(() => {
    if (!currentResult) return false;
    const hasRankedFinalists = (currentResult.finalists || []).some(
      (f) => f.position && f.position >= 1 && f.position <= 6
    );
    return Boolean(currentResult.completed || hasRankedFinalists);
  }, [currentResult]);

  // Synchronize with preselectedEvtNo prop whenever it changes
  useEffect(() => {
    if (preselectedEvtNo !== undefined) {
      setSelectedEvtNo(preselectedEvtNo);
    }
  }, [preselectedEvtNo]);

  // Eligible pool of finalists: prioritize saved finalists from heats/finals; fallback to candidates enrolled in this event
  const eligibleFinalists: FinalParticipant[] = useMemo(() => {
    const cancelledChestSet = new Set<number>();
    candidates.forEach((c) => {
      if (c.isCancelled || c.status === 'cancelled') {
        cancelledChestSet.add(Number(c.chestNo));
      }
    });

    if (currentResult?.finalists && currentResult.finalists.length > 0) {
      return currentResult.finalists.filter((f) => !cancelledChestSet.has(Number(f.chestNo)));
    }
    const registered = candidates.filter(
      (c) => (c.selectedEvents || []).includes(selectedEvtNo) && !c.isCancelled && c.status !== 'cancelled'
    );
    return registered.map((c, idx) => ({
      chestNo: c.chestNo,
      candidateName: c.name,
      club: c.club,
      lane: idx + 1,
    }));
  }, [currentResult, candidates, selectedEvtNo]);

  // Rankings state map: position (1, 2, 3, 4, 5, 6) -> chestNo | null
  const [rankedMap, setRankedMap] = useState<Record<number, number | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
  });

  // Toggle for additional ordinals (4th, 5th, 6th)
  const [showAdditionalOrdinals, setShowAdditionalOrdinals] = useState<boolean>(false);

  // Feedback banner
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Track if user has unsaved modifications in the current event's ranking map
  const isDirtyRef = useRef<boolean>(false);
  const prevEvtNoRef = useRef<number>(selectedEvtNo);

  // Print Scope states
  const [printScope, setPrintScope] = useState<PrintScopeType>('range');
  const [singlePrintEvt, setSinglePrintEvt] = useState<number>(selectedEvtNo);
  const [rangeStart, setRangeStart] = useState<number>(minEvtNo);
  const [rangeEnd, setRangeEnd] = useState<number>(maxEvtNo);
  const [customCsvInput, setCustomCsvInput] = useState<string>('1, 2, 3, 5');

  // Print Modal
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // Synchronize local rankedMap when selected event changes or when initial data loads
  // CRITICAL FIX: Do NOT overwrite user's in-progress selections during periodic background polling!
  useEffect(() => {
    const isEventSwitched = prevEvtNoRef.current !== selectedEvtNo;

    // If the event switched, always reset dirty flag and update event ref
    if (isEventSwitched) {
      isDirtyRef.current = false;
      prevEvtNoRef.current = selectedEvtNo;
    }

    // If the user has made unsaved selections for this event, do NOT let background polling wipe them out
    if (isDirtyRef.current && !isEventSwitched) {
      return;
    }

    const initialMap: Record<number, number | null> = {
      1: null,
      2: null,
      3: null,
      4: null,
      5: null,
      6: null,
    };

    if (currentResult?.finalists) {
      currentResult.finalists.forEach((f) => {
        if (f.position && f.position >= 1 && f.position <= 6) {
          initialMap[f.position] = f.chestNo;
        }
      });
    }

    setRankedMap(initialMap);
    setSaveSuccess(false);

    // If 4th, 5th or 6th already has data, auto expand
    if (initialMap[4] || initialMap[5] || initialMap[6]) {
      setShowAdditionalOrdinals(true);
    }
  }, [currentResult, selectedEvtNo]);

  // Helper to get available candidates for a specific position dropdown:
  // Excludes candidates already chosen in any other position slot
  const getOptionsForPosition = (position: number) => {
    const selectedElsewhere = new Set<number>();
    Object.entries(rankedMap).forEach(([posKey, chestNo]) => {
      const p = Number(posKey);
      if (p !== position && chestNo !== null) {
        selectedElsewhere.add(chestNo);
      }
    });

    return eligibleFinalists.filter((f) => !selectedElsewhere.has(f.chestNo));
  };

  // Assign candidate to rank position
  const handleAssignCandidate = (position: number, chestNoStr: string) => {
    if (isAlreadyRanked) {
      alert(`Event #${selectedEvtNo} official rankings are already completed and finalized. Modifications are restricted.`);
      return;
    }
    isDirtyRef.current = true;
    const chestNo = chestNoStr ? Number(chestNoStr) : null;
    setRankedMap((prev) => {
      const next = { ...prev };
      if (chestNo !== null) {
        Object.keys(next).forEach((posKey) => {
          const p = Number(posKey);
          if (p !== position && next[p] === chestNo) {
            next[p] = null;
          }
        });
      }
      next[position] = chestNo;
      return next;
    });
  };

  // Deselect candidate from a specific rank
  const handleDeselect = (position: number) => {
    if (isAlreadyRanked) {
      alert(`Event #${selectedEvtNo} official rankings are already completed and finalized. Modifications are restricted.`);
      return;
    }
    isDirtyRef.current = true;
    setRankedMap((prev) => ({
      ...prev,
      [position]: null,
    }));
  };

  // Standard points mapping matching sports meet standard
  const getPointsForPosition = (pos: number): number => {
    switch (pos) {
      case 1:
        return 7;
      case 2:
        return 5;
      case 3:
        return 4;
      case 4:
        return 3;
      case 5:
        return 2;
      case 6:
        return 1;
      default:
        return 0;
    }
  };

  // Save official rankings
  const handleSaveRankings = async () => {
    if (isAlreadyRanked) {
      alert(`Event #${selectedEvtNo} official rankings are already completed and finalized. Further modifications are locked.`);
      return;
    }

    setIsSaving(true);
    try {
      const updatedFinalists: FinalParticipant[] = eligibleFinalists.map((f) => {
        let assignedPos: number | undefined = undefined;
        let pts: number = 0;

        for (let pos = 1; pos <= 6; pos++) {
          if (rankedMap[pos] === f.chestNo) {
            assignedPos = pos;
            pts = getPointsForPosition(pos);
            break;
          }
        }

        return {
          ...f,
          position: assignedPos,
          points: pts,
        };
      });

      await onSaveResult({
        id: currentResult?.id || `res_evt_${selectedEvtNo}`,
        eventNo: selectedEvtNo,
        finalists: updatedFinalists,
        completed: true,
        recordedAt: new Date().toISOString(),
      });

      isDirtyRef.current = false;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to save rankings', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Club Championship Standings calculation
  const clubChampionshipTable = useMemo(() => {
    const clubMap: Record<string, { name: string; gold: number; silver: number; bronze: number; points: number }> = {};

    clubs.forEach((c) => {
      clubMap[c.name] = { name: c.name, gold: 0, silver: 0, bronze: 0, points: 0 };
    });

    candidates.forEach((c) => {
      if (c.club && !clubMap[c.club]) {
        clubMap[c.club] = { name: c.club, gold: 0, silver: 0, bronze: 0, points: 0 };
      }
    });

    results.forEach((res) => {
      (res.finalists || []).forEach((f) => {
        if (!f.club) return;
        if (!clubMap[f.club]) {
          clubMap[f.club] = { name: f.club, gold: 0, silver: 0, bronze: 0, points: 0 };
        }
        if (f.position === 1) {
          clubMap[f.club].gold += 1;
          clubMap[f.club].points += 7;
        } else if (f.position === 2) {
          clubMap[f.club].silver += 1;
          clubMap[f.club].points += 5;
        } else if (f.position === 3) {
          clubMap[f.club].bronze += 1;
          clubMap[f.club].points += 4;
        } else if (f.position === 4) {
          clubMap[f.club].points += 3;
        } else if (f.position === 5) {
          clubMap[f.club].points += 2;
        } else if (f.position === 6) {
          clubMap[f.club].points += 1;
        }
      });
    });

    return Object.values(clubMap)
      .filter((c) => c.points > 0 || c.gold > 0)
      .sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver);
  }, [results, clubs, candidates]);

  // Compute which events will be printed based on Print Scope selection
  const eventsToPrint = useMemo(() => {
    if (printScope === 'single') {
      return sortedEvents.filter((e) => Number(e.Evt_No) === Number(singlePrintEvt));
    }
    if (printScope === 'range') {
      const s = Math.min(Number(rangeStart) || 0, Number(rangeEnd) || 0);
      const e = Math.max(Number(rangeStart) || 0, Number(rangeEnd) || 0);
      return sortedEvents.filter((evt) => {
        const n = Number(evt.Evt_No);
        return n >= s && n <= e;
      });
    }
    if (printScope === 'custom') {
      const numbers = customCsvInput
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter((p) => p !== '' && !isNaN(Number(p)))
        .map(Number);
      return sortedEvents.filter((evt) => numbers.includes(Number(evt.Evt_No)));
    }
    return sortedEvents;
  }, [printScope, singlePrintEvt, rangeStart, rangeEnd, customCsvInput, sortedEvents]);

  // Trigger browser print
  const handleExecutePrint = () => {
    window.print();
  };

  // Helper config for rank slots
  const rankSlots = [
    {
      pos: 1,
      medal: '🥇',
      label: '1ST (7 PTS)',
      barColor: 'bg-amber-500',
      badgeBg: 'bg-amber-100 border-amber-400 text-amber-950',
      borderColor: 'focus:border-amber-500',
    },
    {
      pos: 2,
      medal: '🥈',
      label: '2ND (5 PTS)',
      barColor: 'bg-blue-500',
      badgeBg: 'bg-blue-100 border-blue-400 text-blue-950',
      borderColor: 'focus:border-blue-500',
    },
    {
      pos: 3,
      medal: '🥉',
      label: '3RD (4 PTS)',
      barColor: 'bg-emerald-500',
      badgeBg: 'bg-emerald-100 border-emerald-400 text-emerald-950',
      borderColor: 'focus:border-emerald-500',
    },
  ];

  const additionalSlots = [
    {
      pos: 4,
      medal: '🎖️',
      label: '4TH (3 PTS)',
      barColor: 'bg-purple-500',
      badgeBg: 'bg-purple-100 border-purple-400 text-purple-950',
      borderColor: 'focus:border-purple-500',
    },
    {
      pos: 5,
      medal: '🎖️',
      label: '5TH (2 PTS)',
      barColor: 'bg-indigo-500',
      badgeBg: 'bg-indigo-100 border-indigo-400 text-indigo-950',
      borderColor: 'focus:border-indigo-500',
    },
    {
      pos: 6,
      medal: '🎖️',
      label: '6TH (1 PT)',
      barColor: 'bg-slate-500',
      badgeBg: 'bg-slate-200 border-slate-400 text-slate-900',
      borderColor: 'focus:border-slate-500',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-4 px-2 sm:px-0">
      
      {/* ========================================================================= */}
      {/* MAIN CONTAINER (Concise, Mobile-Friendly Light Bluish Ash Palette)        */}
      {/* ========================================================================= */}
      <div className="bg-[#e4ebf3] rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-[#cbd5e1] shadow-md text-slate-800 space-y-3 sm:space-y-4">
        
        {/* Top Navigation Row: Back to H/F list placed at the very top of heading */}
        {onNavigateBackToHitList && (
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={() => onNavigateBackToHitList(selectedEvtNo)}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 hover:text-slate-950 border border-[#94a3b8] font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs active:scale-98 cursor-pointer"
              title="Return to Hit / Final List"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-blue-600 stroke-[2.5]" />
              <span>Back to H/F list</span>
            </button>
            <span className="text-[11px] sm:text-xs font-black text-slate-700 uppercase bg-white/80 px-2.5 py-1 rounded-full border border-slate-300 shadow-2xs">
              Event #{selectedEvtNo}
            </span>
          </div>
        )}

        {/* Title Header: Compact and responsive */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#cbd5e1] pb-2 sm:pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-blue-950 font-black text-base sm:text-lg leading-tight">
                Record Final Rankings &amp; Points
              </h1>
              <p className="text-[11px] text-slate-600 font-semibold hidden sm:block">
                Assign podium positions to finalists and calculate club championship points.
              </p>
            </div>
          </div>
          {!onNavigateBackToHitList && (
            <span className="text-[11px] sm:text-xs font-black text-slate-700 uppercase bg-white/80 px-2.5 py-1 rounded-full border border-slate-300 shadow-2xs">
              Event #{selectedEvtNo}
            </span>
          )}
        </div>

        {/* ========================================================================= */}
        {/* PRINT CONTROLS BAR: Compact, wrap-safe layout for phones                  */}
        {/* ========================================================================= */}
        <div className="bg-[#d5e0ee] rounded-lg sm:rounded-xl p-2.5 sm:p-3.5 border border-[#baccdb] shadow-2xs">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-end">
            
            {/* 1. Print Scope Dropdown */}
            <div className="sm:col-span-4 space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">
                Print Scope:
              </label>
              <div className="relative">
                <select
                  value={printScope}
                  onChange={(e) => setPrintScope(e.target.value as PrintScopeType)}
                  className="w-full bg-white border border-[#94a3b8] rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-600 cursor-pointer appearance-none pr-7 shadow-2xs"
                >
                  <option value="single">Single Event</option>
                  <option value="range">Range of Events</option>
                  <option value="custom">Comma Separated (#)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-2 pointer-events-none" />
              </div>
            </div>

            {/* 2. Scope Inputs */}
            <div className="sm:col-span-5 space-y-1">
              {printScope === 'single' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700">
                    Event Number:
                  </label>
                  <div className="relative">
                    <select
                      value={singlePrintEvt}
                      onChange={(e) => setSinglePrintEvt(Number(e.target.value))}
                      className="w-full bg-white border border-[#94a3b8] rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-600 cursor-pointer appearance-none pr-7 truncate shadow-2xs"
                    >
                      {sortedEvents.map((evt) => (
                        <option key={evt.Evt_No} value={evt.Evt_No}>
                          #{evt.Evt_No} - {evt.Evt_Name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-2 pointer-events-none" />
                  </div>
                </div>
              )}

              {printScope === 'range' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700">
                    Event Range:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-white border border-[#94a3b8] rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 text-center focus:outline-hidden focus:border-blue-600 shadow-2xs"
                      placeholder="Start"
                    />
                    <span className="text-[11px] text-slate-600 font-bold px-0.5">to</span>
                    <input
                      type="number"
                      min="1"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-white border border-[#94a3b8] rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 text-center focus:outline-hidden focus:border-blue-600 shadow-2xs"
                      placeholder="End"
                    />
                  </div>
                </div>
              )}

              {printScope === 'custom' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700">
                    Events (CSV):
                  </label>
                  <input
                    type="text"
                    placeholder="1, 2, 3, 5"
                    value={customCsvInput}
                    onChange={(e) => setCustomCsvInput(e.target.value)}
                    className="w-full bg-white border border-[#94a3b8] rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-hidden focus:border-blue-600 shadow-2xs"
                  />
                </div>
              )}
            </div>

            {/* 3. Print Button */}
            <div className="sm:col-span-3 pt-1 sm:pt-0">
              <button
                type="button"
                id="btn-print-ranking-sheets"
                onClick={() => setShowPrintModal(true)}
                className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-900 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5 text-amber-300" />
                <span>Print Sheets</span>
              </button>
            </div>

          </div>
        </div>

        {/* ========================================================================= */}
        {/* COMPLETED & LOCKED BANNER                                                 */}
        {/* ========================================================================= */}
        {isAlreadyRanked && (
          <div className="bg-emerald-50 border-2 border-emerald-500/60 rounded-xl p-3 sm:p-4 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-black text-xs sm:text-sm text-emerald-950 uppercase tracking-wide">
                    Event #{currentEvent?.Evt_No} Rankings Finalized &amp; Locked
                  </h4>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider">
                    Completed
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-emerald-800 mt-0.5">
                  Official ranking for this event has been finalized. Changes to podium entries are restricted to protect competition results.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPrintScope('single');
                setSinglePrintEvt(selectedEvtNo);
                setShowPrintModal(true);
              }}
              className="shrink-0 px-3.5 py-1.5 sm:py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all whitespace-nowrap self-end sm:self-center"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Results Sheet</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SELECT EVENT FOR RANKING DROPDOWN                                         */}
        {/* ========================================================================= */}
        <div className="space-y-1">
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            Select Event for Ranking:
          </label>
          <div className="relative">
            <select
              value={selectedEvtNo}
              onChange={(e) => setSelectedEvtNo(Number(e.target.value))}
              className="w-full bg-white border border-[#94a3b8] rounded-lg px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden focus:border-blue-600 cursor-pointer appearance-none pr-8 shadow-2xs"
            >
              {sortedEvents.map((evt) => {
                const res = results.find((r) => Number(r.eventNo) === Number(evt.Evt_No));
                const isCompleted = res?.completed || (res?.finalists || []).some((f: any) => f.position && f.position >= 1);
                return (
                  <option key={evt.Evt_No} value={evt.Evt_No}>
                    #{evt.Evt_No} - {evt.Evt_Name} ({evt.Gender}, {evt.Height ? evt.Height.replace(/`/g, "'") : 'ALL'}) {isCompleted ? '✓ Completed (Locked)' : ''}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PODIUM SLOTS (Concise & Mobile-Responsive Grid/Flex Rows)                 */}
        {/* ========================================================================= */}
        <div className="space-y-2 pt-1">
          
          {/* Main 1st, 2nd, 3rd Slots */}
          {rankSlots.map((slot) => {
            const assignedChestNo = rankedMap[slot.pos];
            const availableOptions = getOptionsForPosition(slot.pos);

            return (
              <div 
                key={slot.pos} 
                className="relative bg-[#f1f5f9] border border-[#cbd5e1] rounded-lg sm:rounded-xl p-2 sm:p-2.5 pl-3 sm:pl-3.5 shadow-2xs"
              >
                {/* Accent bar */}
                <div className={`absolute left-0 top-1.5 bottom-1.5 w-1.5 ${slot.barColor} rounded-r-md`}></div>

                {/* Mobile: stacked or responsive row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                  
                  {/* Badge & Quick Deselect on mobile */}
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <div className={`px-2.5 py-1 rounded-full border ${slot.badgeBg} font-black text-xs flex items-center gap-1 shrink-0 shadow-2xs`}>
                      <span>{slot.medal}</span>
                      <span>{slot.label}</span>
                    </div>

                    {/* Mobile deselect button or locked badge */}
                    {isAlreadyRanked ? (
                      assignedChestNo !== null && (
                        <span className="sm:hidden px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Locked</span>
                        </span>
                      )
                    ) : (
                      assignedChestNo !== null && (
                        <button
                          type="button"
                          onClick={() => handleDeselect(slot.pos)}
                          className="sm:hidden px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                        >
                          ✕ Clear
                        </button>
                      )
                    )}
                  </div>

                  {/* Candidate Dropdown */}
                  <div className="flex-1 min-w-0 relative">
                    <select
                      value={assignedChestNo || ''}
                      onChange={(e) => handleAssignCandidate(slot.pos, e.target.value)}
                      disabled={isAlreadyRanked}
                      className={`w-full ${
                        isAlreadyRanked 
                          ? 'bg-slate-100 text-slate-800 border-slate-300 cursor-not-allowed opacity-90' 
                          : 'bg-white cursor-pointer'
                      } border border-[#94a3b8] rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden ${slot.borderColor} appearance-none pr-8 truncate shadow-2xs`}
                    >
                      <option value="" className="text-slate-400">
                        {isAlreadyRanked ? '-- No placement awarded --' : '-- Select Finalist Candidate --'}
                      </option>
                      {availableOptions.map((f) => (
                        <option key={f.chestNo} value={f.chestNo}>
                          #{f.chestNo} - {f.candidateName} ({f.club || 'Independent'})
                        </option>
                      ))}
                    </select>
                    {isAlreadyRanked ? (
                      <Lock className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
                    )}
                  </div>

                  {/* Desktop Deselect Button or locked badge */}
                  {isAlreadyRanked ? (
                    assignedChestNo !== null && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Official Winner</span>
                      </span>
                    )
                  ) : (
                    assignedChestNo !== null && (
                      <button
                        type="button"
                        onClick={() => handleDeselect(slot.pos)}
                        className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 text-xs font-bold transition-colors cursor-pointer shrink-0 border border-rose-200 shadow-2xs"
                      >
                        ✕ Deselect
                      </button>
                    )
                  )}

                </div>
              </div>
            );
          })}

          {/* ADDITIONAL ORDINALS (4th, 5th, 6th Places) */}
          {showAdditionalOrdinals && (
            <div className="space-y-2 pt-1 animate-in fade-in">
              {additionalSlots.map((slot) => {
                const assignedChestNo = rankedMap[slot.pos];
                const availableOptions = getOptionsForPosition(slot.pos);

                return (
                  <div 
                    key={slot.pos} 
                    className="relative bg-[#f1f5f9] border border-[#cbd5e1] rounded-lg sm:rounded-xl p-2 sm:p-2.5 pl-3 sm:pl-3.5 shadow-2xs"
                  >
                    <div className={`absolute left-0 top-1.5 bottom-1.5 w-1.5 ${slot.barColor} rounded-r-md`}></div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                      
                      <div className="flex items-center justify-between sm:justify-start gap-2">
                        <div className={`px-2.5 py-1 rounded-full border ${slot.badgeBg} font-black text-xs flex items-center gap-1 shrink-0 shadow-2xs`}>
                          <span>{slot.medal}</span>
                          <span>{slot.label}</span>
                        </div>

                        {/* Mobile deselect button or locked badge */}
                        {isAlreadyRanked ? (
                          assignedChestNo !== null && (
                            <span className="sm:hidden px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              <span>Locked</span>
                            </span>
                          )
                        ) : (
                          assignedChestNo !== null && (
                            <button
                              type="button"
                              onClick={() => handleDeselect(slot.pos)}
                              className="sm:hidden px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                            >
                              ✕ Clear
                            </button>
                          )
                        )}
                      </div>

                      <div className="flex-1 min-w-0 relative">
                        <select
                          value={assignedChestNo || ''}
                          onChange={(e) => handleAssignCandidate(slot.pos, e.target.value)}
                          disabled={isAlreadyRanked}
                          className={`w-full ${
                            isAlreadyRanked 
                              ? 'bg-slate-100 text-slate-800 border-slate-300 cursor-not-allowed opacity-90' 
                              : 'bg-white cursor-pointer'
                          } border border-[#94a3b8] rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden ${slot.borderColor} appearance-none pr-8 truncate shadow-2xs`}
                        >
                          <option value="" className="text-slate-400">
                            {isAlreadyRanked ? '-- No placement awarded --' : '-- Select Finalist Candidate --'}
                          </option>
                          {availableOptions.map((f) => (
                            <option key={f.chestNo} value={f.chestNo}>
                              #{f.chestNo} - {f.candidateName} ({f.club || 'Independent'})
                            </option>
                          ))}
                        </select>
                        {isAlreadyRanked ? (
                          <Lock className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
                        )}
                      </div>

                      {/* Desktop Deselect Button or locked badge */}
                      {isAlreadyRanked ? (
                        assignedChestNo !== null && (
                          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Official Winner</span>
                          </span>
                        )
                      ) : (
                        assignedChestNo !== null && (
                          <button
                            type="button"
                            onClick={() => handleDeselect(slot.pos)}
                            className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 text-xs font-bold transition-colors cursor-pointer shrink-0 border border-rose-200 shadow-2xs"
                          >
                            ✕ Deselect
                          </button>
                        )
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Compact Toggle Button */}
          <button
            type="button"
            onClick={() => setShowAdditionalOrdinals(!showAdditionalOrdinals)}
            className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 py-1 cursor-pointer transition-colors"
          >
            <Plus className={`w-3.5 h-3.5 transition-transform ${showAdditionalOrdinals ? 'rotate-45' : ''}`} />
            <span>
              {showAdditionalOrdinals ? 'Collapse 4th, 5th, 6th Places' : '+ Expand 4th, 5th, 6th Places'}
            </span>
          </button>

        </div>

        {/* ========================================================================= */}
        {/* SAVE OFFICIAL RANKINGS BUTTON (Mobile Full Width)                         */}
        {/* ========================================================================= */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-[#cbd5e1]">
          
          <div className="min-h-[20px]">
            {isAlreadyRanked ? (
              <span className="text-emerald-800 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Event #{selectedEvtNo} rankings are finalized. Modifications are restricted.</span>
              </span>
            ) : saveSuccess ? (
              <span className="text-emerald-700 text-xs font-bold animate-in fade-in flex items-center gap-1">
                <span>✓</span>
                <span>Rankings saved! Points recalculated.</span>
              </span>
            ) : null}
          </div>

          <button
            type="button"
            id="btn-save-official-rankings"
            onClick={handleSaveRankings}
            disabled={isAlreadyRanked || isSaving}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-lg font-black text-xs sm:text-sm transition-all shadow-md text-center ${
              isAlreadyRanked
                ? 'bg-slate-700 text-slate-400 border border-slate-600 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 cursor-pointer disabled:opacity-50'
            }`}
          >
            {isAlreadyRanked ? 'Rankings Finalized (Locked)' : isSaving ? 'Saving...' : 'Save Official Rankings'}
          </button>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* LIVE CLUB CHAMPIONSHIP LEADERBOARD (Concise Mobile Table)                 */}
      {/* ========================================================================= */}
      <div className="bg-[#e4ebf3] rounded-xl sm:rounded-2xl border border-[#cbd5e1] overflow-hidden shadow-sm">
        <div className="bg-slate-800 text-white px-3 sm:px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="font-black text-xs sm:text-sm uppercase tracking-wide">
              Club Team Championship Standings
            </h3>
          </div>
          <span className="text-[11px] text-slate-300 hidden sm:inline">Live Points Tally</span>
        </div>

        {clubChampionshipTable.length === 0 ? (
          <div className="p-5 text-center text-slate-600 font-semibold text-xs">
            No medals or points awarded yet. Save rankings above to view positions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#d5e0ee] text-[10px] sm:text-[11px] font-black text-slate-700 uppercase border-b border-[#cbd5e1]">
                  <th className="py-2 px-2.5 sm:px-3 w-12 text-center">Rank</th>
                  <th className="py-2 px-2.5 sm:px-3">Club / Team</th>
                  <th className="py-2 px-2 sm:px-3 text-center w-16 text-amber-700">Gold (7p)</th>
                  <th className="py-2 px-2 sm:px-3 text-center w-16 text-slate-700">Silver (5p)</th>
                  <th className="py-2 px-2 sm:px-3 text-center w-16 text-amber-900">Bronze (4p)</th>
                  <th className="py-2 px-2.5 sm:px-3 text-right w-20 font-black">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#cbd5e1]">
                {clubChampionshipTable.map((team, idx) => (
                  <tr key={team.name} className={`hover:bg-white/60 transition-colors ${idx === 0 ? 'bg-amber-100/60 font-bold' : 'bg-white/30'}`}>
                    <td className="py-2 px-2.5 sm:px-3 text-center font-black">
                      {idx === 0 ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-amber-950 text-[10px] shadow-2xs">
                          1
                        </span>
                      ) : (
                        `#${idx + 1}`
                      )}
                    </td>

                    <td className="py-2 px-2.5 sm:px-3 font-bold text-slate-900 truncate max-w-[140px] sm:max-w-none">
                      {team.name}
                      {idx === 0 && (
                        <span className="ml-1.5 text-[9px] uppercase font-black bg-amber-200 text-amber-950 px-1.5 py-0.5 rounded-full border border-amber-300">
                          Leader
                        </span>
                      )}
                    </td>

                    <td className="py-2 px-2 sm:px-3 text-center font-bold text-amber-700">
                      {team.gold}
                    </td>

                    <td className="py-2 px-2 sm:px-3 text-center font-bold text-slate-600">
                      {team.silver}
                    </td>

                    <td className="py-2 px-2 sm:px-3 text-center font-bold text-amber-900">
                      {team.bronze}
                    </td>

                    <td className="py-2 px-2.5 sm:px-3 text-right font-mono font-black text-xs sm:text-sm text-blue-900">
                      {team.points} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PRINT PREVIEW MODAL (Full A4 Page Layout for Ranked Events)               */}
      {/* ========================================================================= */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 text-slate-900">
            
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="font-bold text-xs sm:text-base">Print Official Event Rankings Report</h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-400">
                    Scope: {printScope === 'single' ? `Event #${singlePrintEvt}` : printScope === 'range' ? `Events #${rangeStart} to #${rangeEnd}` : `Events: ${customCsvInput}`} ({eventsToPrint.length} Event(s))
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExecutePrint}
                  className="px-3 sm:px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 transition-all shadow-md cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Preview Canvas with realistic A4 Page Sheet */}
            <div className="p-2 sm:p-6 overflow-y-auto flex-1 bg-slate-800/80 flex justify-center">
              <div 
                className="bg-white w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-10 shadow-2xl border border-slate-200 flex flex-col justify-between text-slate-900 font-sans print:p-0 print:border-none print:shadow-none"
                id="printable-rankings-content"
              >
                <div>
                  {/* Official Header */}
                  <div className="text-center border-b-2 border-slate-900 pb-3 mb-4">
                    <div className="flex items-center justify-center gap-2.5 mb-1">
                      <img src="/icon.svg" alt="Meet Logo" className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover" />
                      <div>
                        <h1 className="text-lg sm:text-2xl font-black uppercase tracking-tight text-slate-900">
                          {settings.ordinalTitle || '47th Annual Sports Meet 2026'}
                        </h1>
                        <p className="text-[10px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Organized by: {settings.organizer || 'Agrani Sasthitala Club'} • Venue: {settings.venue || 'Main Stadium'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1.5 inline-block px-3 py-0.5 rounded-lg bg-amber-100 border border-amber-400">
                      <h2 className="text-xs sm:text-base font-black uppercase text-amber-950">
                        OFFICIAL ATHLETIC EVENT RANKINGS &amp; WINNERS REPORT
                      </h2>
                    </div>
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-1">
                      CHAMPIONSHIP MEDAL WINNERS • AUTHORIZED BY MEET COMMITTEE
                    </p>
                  </div>

                  {/* Print selected events */}
                  {eventsToPrint.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 font-semibold text-xs sm:text-sm">
                      No events match the selected print filter.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {eventsToPrint.map((evt) => {
                        const evtRes = results.find((r) => Number(r.eventNo) === Number(evt.Evt_No));
                        const rankedFinalists = (evtRes?.finalists || [])
                          .filter((f) => f.position && f.position >= 1 && f.position <= 6)
                          .sort((a, b) => (a.position || 0) - (b.position || 0));

                        return (
                          <div key={evt.Evt_No} className="avoid-break space-y-1.5 border-b border-slate-300 pb-3">
                            <div className="flex items-center justify-between bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-300">
                              <span className="font-black text-xs uppercase tracking-wide text-slate-900">
                                Event #{evt.Evt_No}: {evt.Evt_Name} ({evt.Gender} • {evt.Height ? evt.Height.replace(/`/g, "'") : 'ALL'})
                              </span>
                              <span className="text-[10px] font-bold text-slate-600">
                                {rankedFinalists.length > 0 ? `${rankedFinalists.length} Winner(s)` : 'No Winners Recorded'}
                              </span>
                            </div>

                            {rankedFinalists.length === 0 ? (
                              <div className="py-2 text-center text-xs text-slate-400 italic">
                                Results not recorded yet for Event #{evt.Evt_No}
                              </div>
                            ) : (
                              <table className="w-full text-left text-xs border border-slate-900 border-collapse">
                                <thead>
                                  <tr className="bg-slate-200 text-slate-900 font-black uppercase border-b border-slate-900">
                                    <th className="py-1.5 px-2.5 w-16 text-center border-r border-slate-900">Rank</th>
                                    <th className="py-1.5 px-2.5 w-20 text-center border-r border-slate-900">Chest #</th>
                                    <th className="py-1.5 px-3 border-r border-slate-900">Athlete Name</th>
                                    <th className="py-1.5 px-3 border-r border-slate-900">Club Name</th>
                                    <th className="py-1.5 px-2.5 text-center w-20 font-black">Points</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-900">
                                  {rankedFinalists.map((f) => {
                                    const rankLabel =
                                      f.position === 1
                                        ? '1st (Gold)'
                                        : f.position === 2
                                        ? '2nd (Silver)'
                                        : f.position === 3
                                        ? '3rd (Bronze)'
                                        : `${f.position}th`;

                                    return (
                                      <tr key={f.chestNo}>
                                        <td className="py-1.5 px-2.5 text-center font-black border-r border-slate-900">
                                          {rankLabel}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-center font-mono font-bold border-r border-slate-900">
                                          #{f.chestNo}
                                        </td>
                                        <td className="py-1.5 px-3 font-bold uppercase border-r border-slate-900">
                                          {f.candidateName}
                                        </td>
                                        <td className="py-1.5 px-3 uppercase font-semibold text-slate-700 border-r border-slate-900">
                                          {f.club || 'Independent'}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-center font-mono font-black text-slate-900">
                                          +{f.points || getPointsForPosition(f.position || 0)} pts
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Signatures Footer */}
                <div className="mt-8 pt-3 border-t border-slate-400 grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-800 avoid-break">
                  <div>
                    <div className="h-8"></div>
                    <div className="border-t border-slate-900 pt-1">Chief Track Judge</div>
                  </div>
                  <div>
                    <div className="h-8"></div>
                    <div className="border-t border-slate-900 pt-1">President of Meet</div>
                  </div>
                  <div>
                    <div className="h-8"></div>
                    <div className="border-t border-slate-900 pt-1">General Secretary</div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

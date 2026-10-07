import React, { useState, useMemo, useRef } from 'react';
import { SportEvent, Candidate, EventHeat, HeatParticipant, EventResult, FinalParticipant, SportsMeetSettings, Club } from '../types';
import { 
  Flame, 
  Receipt,
  FileText,
  Shuffle, 
  Award, 
  Printer, 
  Trash2, 
  X, 
  CheckCircle2, 
  Trophy, 
  ArrowRight,
  ChevronDown,
  Medal,
  Lock
} from 'lucide-react';

interface HitListProps {
  events: SportEvent[];
  candidates: Candidate[];
  heats: EventHeat[];
  results?: EventResult[];
  clubs?: Club[];
  settings: SportsMeetSettings;
  onSaveHeat: (heat: Partial<EventHeat>) => Promise<void>;
  onDeleteHeat: (heatId: string) => Promise<void>;
  onPromoteToFinal: (eventNo: number, qualifiedAthletes: HeatParticipant[]) => void;
  onNavigateToRanking?: (eventNo?: number) => void;
}

export const HitList: React.FC<HitListProps> = ({
  events,
  candidates,
  heats,
  results = [],
  clubs = [],
  settings,
  onSaveHeat,
  onDeleteHeat,
  onPromoteToFinal,
  onNavigateToRanking,
}) => {
  // Only one event selection at a time
  const [selectedEvtNo, setSelectedEvtNo] = useState<number>(events[0]?.Evt_No || 0);

  // Qualify checkbox visibility: appears after clicking "Prepare Final List"
  const [showQualifyCheckbox, setShowQualifyCheckbox] = useState<boolean>(false);

  // Print Preview Modals
  const [printModalType, setPrintModalType] = useState<'hit' | 'final' | 'results' | null>(null);
  const [modalFormat, setModalFormat] = useState<'a4' | 'thermal'>('a4');

  const currentTimestamp = useMemo(() => {
    return new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }, [printModalType]);

  // Reference for auto-scrolling to the candidates working list
  const workingTableRef = useRef<HTMLDivElement | null>(null);

  // Current selected event
  const currentEvent = useMemo(() => {
    return events.find((e) => Number(e.Evt_No) === Number(selectedEvtNo)) || events[0];
  }, [events, selectedEvtNo]);

  // Shorthand category for event thumbnails matching CandidateEnroll.tsx
  const getEventShorthand = (evt: SportEvent): string => {
    let gChar = 'C';
    if (evt.Gender === 'BOYS') gChar = 'B';
    else if (evt.Gender === 'GIRLS') gChar = 'G';
    else if (evt.Gender === 'ALL' || evt.Gender === 'CHILDRENS') gChar = 'C';

    const hClean = evt.Height ? evt.Height.replace(/`/g, "'") : 'ALL';
    return `${gChar} ${hClean}`;
  };

  // Cancelled chest numbers set: must never appear in any hit lists
  const cancelledChestSet = useMemo(() => {
    const set = new Set<number>();
    candidates.forEach((c) => {
      if (c.isCancelled || c.status === 'cancelled') {
        set.add(Number(c.chestNo));
      }
    });
    return set;
  }, [candidates]);

  // Helper to check if ranking has been prepared for any event
  const isRankingPreparedForEvent = (evtNo: number) => {
    const res = results.find((r) => Number(r.eventNo) === Number(evtNo));
    return Boolean(
      res && (
        res.completed === true ||
        (res.finalists && res.finalists.some((f) => f.position && f.position > 0)) ||
        (res.winners && res.winners.length > 0)
      )
    );
  };

  // Whether ranking is prepared for the currently selected event
  const isRankingPrepared = useMemo(() => {
    return isRankingPreparedForEvent(selectedEvtNo);
  }, [results, selectedEvtNo]);

  // Enrolled candidates for the currently selected event (excludes cancelled chest numbers)
  const enrolledCandidates: Candidate[] = useMemo(() => {
    return candidates
      .filter((c) => (c.selectedEvents || []).includes(selectedEvtNo) && !c.isCancelled && c.status !== 'cancelled')
      .sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
  }, [candidates, selectedEvtNo]);

  // Existing heats for this event (strictly excludes cancelled chest numbers)
  const eventHeats: EventHeat[] = useMemo(() => {
    return heats
      .filter((h) => Number(h.eventNo) === Number(selectedEvtNo))
      .map((h) => ({
        ...h,
        participants: (h.participants || []).filter((p) => !cancelledChestSet.has(Number(p.chestNo))),
      }));
  }, [heats, selectedEvtNo, cancelledChestSet]);

  // Saved finalists from Results pool (populated by "Promote to Final")
  const isHitRequired = currentEvent?.requiredHit !== false;
  const isFinalRequired = currentEvent?.requiredFinal !== false;

  const currentResult = useMemo(() => {
    return results.find((r) => Number(r.eventNo) === Number(selectedEvtNo));
  }, [results, selectedEvtNo]);

  const savedFinalists = useMemo(() => {
    return (currentResult?.finalists || []).filter((f) => !cancelledChestSet.has(Number(f.chestNo)));
  }, [currentResult, cancelledChestSet]);
  const isAlreadyPromoted = savedFinalists.length > 0;

  // Effective finalists:
  // 1) Saved finalists if already promoted
  // 2) If event heats exist, qualified participants (or all participants in heat)
  // 3) Enrolled candidates for this event (standard direct final flow)
  const effectiveFinalists: FinalParticipant[] = useMemo(() => {
    if (savedFinalists.length > 0) return savedFinalists;
    const activeHeat = eventHeats[0];
    if (activeHeat && activeHeat.participants && activeHeat.participants.length > 0) {
      const quals = activeHeat.participants.filter((p) => p.qualified);
      const list = quals.length > 0 ? quals : activeHeat.participants;
      return list.map((p, idx) => ({
        chestNo: p.chestNo,
        candidateName: p.candidateName,
        club: p.club,
        lane: p.lane || idx + 1,
      }));
    }
    if (enrolledCandidates.length > 0) {
      return enrolledCandidates.map((cand, idx) => ({
        chestNo: cand.chestNo,
        candidateName: cand.name,
        club: cand.club,
        lane: idx + 1,
      }));
    }
    return [];
  }, [savedFinalists, eventHeats, enrolledCandidates]);

  // Ranked winners for the currently selected event (ordered by rank 1..6)
  const rankedWinners = useMemo(() => {
    if (!currentResult || !currentResult.finalists) return [];
    return currentResult.finalists
      .filter((f) => !cancelledChestSet.has(Number(f.chestNo)) && f.position && f.position >= 1 && f.position <= 6)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }, [currentResult, cancelledChestSet]);

  const getPointsForPosition = (pos?: number): number => {
    switch (pos) {
      case 1: return 7;
      case 2: return 5;
      case 3: return 4;
      case 4: return 3;
      case 5: return 2;
      case 6: return 1;
      default: return 0;
    }
  };

  // Track qualified participants from the heat
  const qualifiedParticipants: HeatParticipant[] = useMemo(() => {
    if (isAlreadyPromoted) {
      return savedFinalists.map((f, i) => ({
        chestNo: f.chestNo,
        candidateName: f.candidateName,
        club: f.club,
        lane: f.lane || i + 1,
        heatNumber: 1,
        qualified: true,
      }));
    }

    const heat = eventHeats[0];
    if (!heat) return [];
    return heat.participants.filter((p) => p.qualified);
  }, [isAlreadyPromoted, savedFinalists, eventHeats]);

  // Can print final list: true when event has been promoted to final OR for direct final events
  const canPrintFinalList = (isAlreadyPromoted && savedFinalists.length > 0) || (!isHitRequired && enrolledCandidates.length > 0);

  // Prepare formatted heading
  const getDynamicEventHeading = (evt?: SportEvent) => {
    if (!evt) return '';
    const h = evt.Height ? evt.Height.replace(/`/g, "'") : 'ALL';
    return `Event #${evt.Evt_No}: ${evt.Evt_Name} (${evt.Gender} • ${h})`;
  };

  const getFormattedHeightGender = (evt?: SportEvent) => {
    if (!evt) return '';
    const h = evt.Height ? evt.Height.replace(/`/g, "'") : 'ALL';
    return `${evt.Gender} • ${h}`;
  };

  // "Prepare Final List" action with smooth auto-scroll to the list
  const handlePrepareFinalList = async () => {
    if (isRankingPrepared) {
      alert(`Event #${selectedEvtNo} ranking has already been prepared and completed. Further final list preparation is restricted.`);
      return;
    }

    if (isAlreadyPromoted) {
      alert(`Event #${selectedEvtNo} has already been promoted to the Final List.`);
      return;
    }

    if (enrolledCandidates.length === 0) {
      alert('No candidates registered for this event yet.');
      return;
    }

    // Always ensure a single all-at-once heat exists for this event
    if (eventHeats.length === 0) {
      const sortedCandidates = [...enrolledCandidates].sort(
        (a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0)
      );

      const participants: HeatParticipant[] = sortedCandidates.map((cand, idx) => ({
        chestNo: cand.chestNo,
        candidateName: cand.name,
        club: cand.club,
        lane: idx + 1,
        heatNumber: 1,
        qualified: !isHitRequired ? true : false,
      }));

      await onSaveHeat({
        eventNo: selectedEvtNo,
        heatNumber: 1,
        participants,
        status: 'scheduled',
      });
    }

    // Reveal qualify checkboxes at the left side of chest numbers
    setShowQualifyCheckbox(true);

    // Auto scroll-down smoothly up to the below working list
    setTimeout(() => {
      if (workingTableRef.current) {
        workingTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  };

  // Toggle qualification status for a participant (works with existing heat or creates heat on the fly)
  const handleToggleQualify = async (chestNo: number) => {
    if (isRankingPrepared) {
      alert(`Event #${selectedEvtNo} ranking has already been prepared and completed. Qualification edits are restricted.`);
      return;
    }

    if (isAlreadyPromoted) {
      alert(`Event #${selectedEvtNo} has already been promoted to the Final List. Further qualification edits are locked.`);
      return;
    }

    const activeHeat = eventHeats[0];
    if (activeHeat) {
      const updatedParticipants = activeHeat.participants.map((p) => {
        if (Number(p.chestNo) === Number(chestNo)) {
          return { ...p, qualified: !p.qualified };
        }
        return p;
      });

      await onSaveHeat({
        ...activeHeat,
        participants: updatedParticipants,
      });
    } else {
      // Direct final or first-time heat initialization: create heat with participants
      const sortedCandidates = [...enrolledCandidates].sort(
        (a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0)
      );

      const participants: HeatParticipant[] = sortedCandidates.map((cand, idx) => ({
        chestNo: cand.chestNo,
        candidateName: cand.name,
        club: cand.club,
        lane: idx + 1,
        heatNumber: 1,
        qualified: Number(cand.chestNo) === Number(chestNo) ? false : true,
      }));

      await onSaveHeat({
        eventNo: selectedEvtNo,
        heatNumber: 1,
        participants,
        status: 'scheduled',
      });
    }
  };

  const toggleParticipantQualified = async (heat: EventHeat, chestNo: number) => {
    await handleToggleQualify(chestNo);
  };

  // "Promote to Final" action
  const handleSendToFinal = () => {
    if (isRankingPrepared) {
      alert(`Event #${selectedEvtNo} ranking has already been completed. Final list cannot be modified.`);
      return;
    }

    if (isAlreadyPromoted) {
      alert(`Event #${selectedEvtNo} has already been promoted to Final. No further entries can be promoted.`);
      return;
    }

    if (qualifiedParticipants.length === 0) {
      alert('Please mark at least one candidate using the qualify checkbox on the left of their chest number before promoting.');
      return;
    }

    onPromoteToFinal(selectedEvtNo, qualifiedParticipants);
  };

  // Trigger system print
  const handleExecutePrint = () => {
    window.print();
  };

  // Helper to find club info
  const getClubInfo = (clubName?: string) => {
    if (!clubName) return undefined;
    return clubs.find((c) => c.name.toLowerCase() === clubName.toLowerCase());
  };

  // Helper to get club logo in B&W for thermal printer header
  const getThermalClubLogo = (clubName?: string) => {
    if (clubName) {
      const c = getClubInfo(clubName);
      if (c?.logoUrl) return c.logoUrl;
    }
    if (settings.registeredClubLogo) return settings.registeredClubLogo;
    const organizerClub = clubs.find((c) =>
      c.name.toLowerCase().includes((settings.registeredClubName || settings.organizer)?.toLowerCase() || '')
    ) || clubs[0];
    if (organizerClub?.logoUrl) return organizerClub.logoUrl;
    return '/icon.png';
  };

  // Helper to get organizer club name for thermal header
  const getThermalClubName = (clubName?: string) => {
    if (clubName && clubName !== 'all') return clubName;
    return settings.registeredClubName || settings.organizer || 'Agrani Sasthitala Sangha';
  };

  // Thermal header: Place club logo at left of two lines (registered club name, next line meet ordinal number)
  const renderThermalHeader = (specificClubName?: string) => {
    const clubDisplayName = getThermalClubName(specificClubName);
    const clubLogo = getThermalClubLogo(specificClubName);

    return (
      <div className="text-center pb-0.5 mb-1 border-b border-dashed border-black">
        <div className="flex items-center justify-center gap-2 leading-tight">
          <img
            src={clubLogo}
            alt="Club Logo"
            className="w-5 h-5 shrink-0 object-contain filter grayscale contrast-200"
            style={{ filter: 'grayscale(100%) contrast(200%)' }}
          />
          <div className="text-left leading-tight">
            <div className="font-bold text-[10px] uppercase tracking-tight text-black truncate max-w-[42mm]">
              {clubDisplayName}
            </div>
            <div className="text-[8.5px] font-semibold text-black leading-tight mt-0.5">
              {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Thermal footer: Place app logo and app name in ONE line, date & time stamp (minimal height)
  const renderThermalFooter = () => {
    return (
      <div className="text-center pt-0.5 mt-1 border-t border-dashed border-black text-black">
        <div className="flex items-center justify-center gap-1 leading-none">
          <img
            src="/icon.png"
            alt="eSports Logo"
            className="w-3.5 h-3.5 shrink-0 object-contain filter grayscale contrast-200"
            style={{ filter: 'grayscale(100%) contrast(200%)' }}
          />
          <span className="font-bold text-[8.5px] uppercase tracking-tight text-black">
            eSports (A Sports Management System)
          </span>
        </div>
        <div className="text-[7.5px] text-black leading-tight mt-0.5 font-mono">
          {currentTimestamp}
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Scoped Dynamic Print Stylesheet: Ensures complete isolation and precise formatting */}
      <style>{`
        @media print {
          ${
            modalFormat === 'thermal'
              ? `
            @page {
              size: 58mm auto !important;
              margin: 0 !important;
            }
            html, body {
              width: 58mm !important;
              min-width: 58mm !important;
              max-width: 58mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .thermal-printable-sheet {
              width: 48mm !important;
              max-width: 48mm !important;
              margin: 0 auto !important;
              padding: 1mm 0 4mm 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-size: 9.5px !important;
              line-height: 1.2 !important;
            }
            .thermal-printable-sheet * {
              color: #000000 !important;
              border-color: #000000 !important;
              background: transparent !important;
              box-shadow: none !important;
            }
            .thermal-printable-sheet img {
              filter: grayscale(100%) contrast(200%) !important;
              -webkit-filter: grayscale(100%) contrast(200%) !important;
            }
            .a4-printable-sheet {
              display: none !important;
            }
          `
              : `
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
            .a4-printable-sheet {
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
            .thermal-printable-sheet {
              display: none !important;
            }
          `
          }
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* WRAPPER FOR ALL INTERACTIVE HITLIST UI: Completely hidden on print so web page NEVER appears */}
      <div className={`space-y-4 ${printModalType !== null ? 'print:hidden' : ''}`}>

      {/* ========================================================================= */}
      {/* 1. NON-SCROLLING STICKY TOP ACTION BAR                                   */}
      {/* Displays: Event summary & action buttons with mobile-optimized layout     */}
      {/* ========================================================================= */}
      <div className="sticky top-16 sm:top-20 z-30 bg-[#0b1120]/95 backdrop-blur-md border-b border-slate-800 -mx-2 sm:-mx-6 lg:-mx-8 px-2 sm:px-6 lg:px-8 py-2.5 sm:py-3 shadow-xl print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          
          {/* Left: Dynamic Event Summary */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-xs sm:text-sm shrink-0 shadow-md">
              #{currentEvent?.Evt_No}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-white font-bold text-xs sm:text-base truncate leading-tight">
                {currentEvent?.Evt_Name}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs text-amber-400 font-semibold truncate">
                <span>{currentEvent ? getEventShorthand(currentEvent) : ''} • {enrolledCandidates.length} Enrolled</span>
                {!isHitRequired && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black border border-amber-300 text-[9px] sm:text-xs shadow-xs tracking-wider">
                    FINAL
                  </span>
                )}
                {isAlreadyPromoted && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 text-[9px] sm:text-xs">
                    Promoted ({savedFinalists.length})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: The Mandatory Action Buttons (Compact & Wrapping on mobile) */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            
            {/* BUTTON 0: Print Results (Prominent & Enabled ONLY when event Ranking has been prepared) */}
            {isRankingPrepared && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="btn-print-results"
                  onClick={() => {
                    setModalFormat('a4');
                    setPrintModalType('results');
                  }}
                  className="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer ring-2 ring-emerald-400/60 whitespace-nowrap animate-in fade-in"
                  title="Print Official Event Results & Rankings on Plain A4 Paper"
                >
                  <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span>Print Results</span>
                </button>
                <button
                  type="button"
                  id="btn-thermal-results"
                  onClick={() => {
                    setModalFormat('thermal');
                    setPrintModalType('results');
                  }}
                  className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1 transition-all shadow-md cursor-pointer whitespace-nowrap"
                  title="Print Results on 2&quot; Roll Thermal Printer"
                >
                  <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="text-[11px] font-black hidden sm:inline">2" Thermal</span>
                </button>
              </div>
            )}

            {/* BUTTON 1: Print Hit List (A4 & 2" Thermal) */}
            {/* Enabled before final list is prepared; disabled after final list is prepared or ranking completed */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                id="btn-print-hit-list"
                onClick={() => {
                  if (enrolledCandidates.length > 0 && !isAlreadyPromoted && !isRankingPrepared) {
                    setModalFormat('a4');
                    setPrintModalType('hit');
                  }
                }}
                disabled={enrolledCandidates.length === 0 || isAlreadyPromoted || isRankingPrepared}
                className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 transition-all shadow-md whitespace-nowrap ${
                  isRankingPrepared
                    ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-40'
                    : isAlreadyPromoted
                    ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-40'
                    : enrolledCandidates.length === 0
                    ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-40'
                    : 'bg-blue-600 hover:bg-blue-500 active:scale-98 text-white cursor-pointer'
                }`}
                title={
                  isRankingPrepared
                    ? 'Disabled: Event ranking completed. Only print of results is possible.'
                    : isAlreadyPromoted
                    ? 'Disabled: Final list has already been prepared. Hit list printing is disabled.'
                    : enrolledCandidates.length === 0
                    ? 'Disabled: No candidates enrolled for this event.'
                    : 'Print field working copy on Plain A4 Paper'
                }
              >
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Print Hit List</span>
              </button>

              <button
                type="button"
                id="btn-thermal-hit-list"
                onClick={() => {
                  if (enrolledCandidates.length > 0 && !isAlreadyPromoted && !isRankingPrepared) {
                    setModalFormat('thermal');
                    setPrintModalType('hit');
                  }
                }}
                disabled={enrolledCandidates.length === 0 || isAlreadyPromoted || isRankingPrepared}
                className={`p-1.5 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1 transition-all shadow-md whitespace-nowrap ${
                  isRankingPrepared || isAlreadyPromoted || enrolledCandidates.length === 0
                    ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-40'
                    : 'bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 cursor-pointer'
                }`}
                title="Print Hit List on 2&quot; Roll Thermal Printer"
              >
                <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="text-[11px] font-black hidden md:inline">2" Thermal</span>
              </button>
            </div>

            {/* BUTTON 2: Prepare Final List */}
            {/* Enabled before final list is prepared; disabled after final list is prepared or ranking completed */}
            <button
              type="button"
              id="btn-prepare-final-list"
              onClick={() => handlePrepareFinalList()}
              disabled={enrolledCandidates.length === 0 || isAlreadyPromoted || isRankingPrepared}
              className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 transition-all shadow-md whitespace-nowrap ${
                isRankingPrepared
                  ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-40'
                  : isAlreadyPromoted
                  ? 'bg-slate-700 text-slate-400 border border-slate-600 cursor-not-allowed opacity-60'
                  : showQualifyCheckbox
                  ? 'bg-amber-300 ring-2 ring-amber-400 text-slate-950 cursor-pointer active:scale-98'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer active:scale-98'
              }`}
              title={
                isRankingPrepared
                  ? 'Event ranking completed. Further final list preparation is restricted.'
                  : isAlreadyPromoted
                  ? 'Final list already prepared and promoted.'
                  : 'Prepare final list, auto scroll down and enable qualify checkboxes'
              }
            >
              <Shuffle className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
              <span>
                {isRankingPrepared ? 'Completed' : isAlreadyPromoted ? 'Final Prepared' : 'Prepare Final List'}
              </span>
            </button>

            {/* BUTTON: Promote to Final (Visible & Enabled ONLY when qualify checkmarks exist and neither promoted nor ranking prepared) */}
            {!isRankingPrepared && !isAlreadyPromoted && qualifiedParticipants.length > 0 && (
              <button
                type="button"
                id="btn-promote-to-final"
                onClick={handleSendToFinal}
                className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 transition-all shadow-md cursor-pointer animate-pulse whitespace-nowrap"
                title="Promote checked qualifiers to Final List"
              >
                <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Promote ({qualifiedParticipants.length})</span>
              </button>
            )}

            {/* BUTTON 3: Print Final List (A4 & 2" Thermal) */}
            {/* Disabled before final list is prepared; enabled after final list is prepared, disabled when ranking completed */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                id="btn-print-final-list"
                onClick={() => {
                  if (isAlreadyPromoted && !isRankingPrepared) {
                    setModalFormat('a4');
                    setPrintModalType('final');
                  }
                }}
                disabled={!isAlreadyPromoted || isRankingPrepared}
                className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 transition-all shadow-md whitespace-nowrap ${
                  isRankingPrepared
                    ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-40'
                    : isAlreadyPromoted
                    ? 'bg-blue-600 hover:bg-blue-500 active:scale-98 text-white cursor-pointer'
                    : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-50'
                }`}
                title={
                  isRankingPrepared
                    ? 'Disabled: Event ranking completed. Only print of results is possible.'
                    : (isAlreadyPromoted || !isHitRequired)
                    ? 'Print Finalist Start List on Plain A4 Paper'
                    : 'Disabled: Final list has not been prepared yet. Click "Prepare Final List" and promote candidates to enable.'
                }
              >
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Print Final List</span>
              </button>

              <button
                type="button"
                id="btn-thermal-final-list"
                onClick={() => {
                  if (isAlreadyPromoted && !isRankingPrepared) {
                    setModalFormat('thermal');
                    setPrintModalType('final');
                  }
                }}
                disabled={!isAlreadyPromoted || isRankingPrepared}
                className={`p-1.5 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1 transition-all shadow-md whitespace-nowrap ${
                  !isAlreadyPromoted || isRankingPrepared
                    ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-40'
                    : 'bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 cursor-pointer'
                }`}
                title="Print Final List on 2&quot; Roll Thermal Printer"
              >
                <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="text-[11px] font-black hidden md:inline">2" Thermal</span>
              </button>
            </div>

            {/* LINK BUTTON: Shift to Ranking & Points page */}
            {onNavigateToRanking && (
              <button
                type="button"
                id="btn-shift-to-rankings"
                onClick={() => {
                  if (isAlreadyPromoted || isRankingPrepared) {
                    onNavigateToRanking(selectedEvtNo);
                  }
                }}
                disabled={!isAlreadyPromoted && !isRankingPrepared}
                className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1 sm:gap-1.5 transition-all shadow-2xs whitespace-nowrap ${
                  isRankingPrepared
                    ? 'bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-400 text-emerald-300 cursor-pointer active:scale-98'
                    : isAlreadyPromoted
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-amber-300 hover:text-amber-200 cursor-pointer active:scale-98 ring-1 ring-amber-400/40'
                    : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-50'
                }`}
                title={
                  isRankingPrepared
                    ? 'View or review rankings on Ranking & Points page'
                    : isAlreadyPromoted
                    ? 'Shift to Ranking & Points page to record official results'
                    : 'Disabled: Promote finalists to prepare the Final List first'
                }
              >
                <Trophy className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isRankingPrepared ? 'text-emerald-400' : isAlreadyPromoted ? 'text-amber-400' : 'text-slate-500'}`} />
                <span>Ranking &amp; Points</span>
                <ArrowRight className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${isRankingPrepared ? 'text-emerald-400' : isAlreadyPromoted ? 'text-amber-400' : 'text-slate-500'}`} />
              </button>
            )}

          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. EVENT SELECTOR THUMBNAILS (Displayed for both Mobile & Desktop)        */}
      {/* ========================================================================= */}
      <div className="bg-[#0b1120] rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-slate-800 shadow-xl space-y-2 sm:space-y-2.5 print:hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400">
              Select Athletic Event
            </h3>
          </div>
          <span className="text-[10px] sm:text-xs text-slate-400 font-mono">
            #{currentEvent?.Evt_No} Selected • {enrolledCandidates.length} Enrolled {isRankingPrepared ? '• ✓ Completed' : ''}
          </span>
        </div>

        {/* Thumbnails Grid: 2 columns on Mobile, 3 on sm, 4 on md, 6 on lg */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 sm:gap-2">
          {events.map((evt) => {
            const isSelected = selectedEvtNo === evt.Evt_No;
            const count = candidates.filter((c) => (c.selectedEvents || []).includes(evt.Evt_No)).length;
            const res = results.find((r) => Number(r.eventNo) === Number(evt.Evt_No));
            const evtCompleted = isRankingPreparedForEvent(evt.Evt_No);
            const evtPromoted = Boolean(res && res.finalists && res.finalists.length > 0);
            const isDirectFinal = evt.requiredHit === false;
            const isFinalListPrepared = evtPromoted || evtCompleted;
            const showFinalLabel = isDirectFinal || isFinalListPrepared;

            return (
              <div
                key={evt.Evt_No}
                id={`hit-thumb-event-${evt.Evt_No}`}
                onClick={() => {
                  setSelectedEvtNo(evt.Evt_No);
                }}
                className={`rounded-lg sm:rounded-xl p-2 sm:p-2.5 transition-all select-none flex flex-col justify-between border min-h-[58px] sm:min-h-[64px] cursor-pointer active:scale-98 ${
                  evtCompleted
                    ? isSelected
                      ? 'bg-emerald-950/90 border-emerald-400 ring-2 ring-emerald-400/90 shadow-lg text-emerald-300'
                      : 'bg-[#062c1e] border-emerald-700/80 hover:border-emerald-500 hover:bg-[#093d2b] text-emerald-100'
                    : isSelected
                    ? 'bg-amber-950/60 border-amber-400 ring-2 ring-amber-400/80 shadow-lg text-amber-400'
                    : 'bg-[#0e172e] border-slate-800/90 hover:border-slate-600 hover:bg-[#121c38] text-slate-200'
                }`}
              >
                {/* Top Row: #Number + Name */}
                <div className="flex items-center gap-1 sm:gap-1.5 overflow-hidden">
                  <span className={`font-mono text-xs font-black shrink-0 ${
                    evtCompleted
                      ? isSelected ? 'text-emerald-300' : 'text-emerald-400'
                      : isSelected ? 'text-amber-300' : 'text-amber-400'
                  }`}>
                    #{evt.Evt_No}
                  </span>
                  <span className="font-bold text-[11px] sm:text-xs uppercase tracking-tight truncate text-white">
                    {evt.Evt_Name}
                  </span>
                </div>

                {/* Bottom Row: Shorthand Category + Status / Count badge */}
                <div className={`flex items-center justify-between text-[10px] sm:text-[11px] font-semibold mt-1 pt-1 border-t ${
                  evtCompleted ? 'border-emerald-800/60' : 'border-slate-800/60'
                }`}>
                  <span className="text-slate-300 font-mono text-[9px] sm:text-[10px]">
                    {getEventShorthand(evt)}
                  </span>
                  <div className="flex items-center gap-1">
                    {showFinalLabel && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-yellow-400 text-slate-950 border-2 border-yellow-200 shadow-sm shadow-yellow-500/30 tracking-wider font-mono">
                          FINAL
                        </span>
                        {count > 0 && (evtPromoted || isDirectFinal) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvtNo(evt.Evt_No);
                              setPrintModalType('final');
                            }}
                            className="p-0.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-all cursor-pointer"
                            title="Print Final List"
                          >
                            <Printer className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </button>
                        )}
                      </div>
                    )}
                    {evtCompleted && (
                      <span className="text-[8px] sm:text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md bg-emerald-600 text-white border border-emerald-400/50 shadow-xs flex items-center gap-0.5">
                        Completed
                      </span>
                    )}
                    <span className={`font-mono text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      evtCompleted
                        ? isSelected ? 'bg-emerald-400 text-slate-950' : 'bg-emerald-800 text-emerald-100'
                        : isSelected
                        ? 'bg-amber-400 text-slate-950'
                        : count > 0
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {count}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. HIT LIST WORKING TABLE (Target of auto-scroll upon Prepare Final List)  */}
      {/* ========================================================================= */}
      <div ref={workingTableRef} id="hit-list-working-container" className="scroll-mt-36 sm:scroll-mt-32">
        {isRankingPrepared && (
          <div className="mb-3 p-3 sm:p-4 rounded-xl bg-emerald-950/80 border-2 border-emerald-500 text-emerald-100 flex flex-wrap items-center justify-between gap-3 shadow-lg print:hidden">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <h4 className="font-extrabold text-xs sm:text-sm text-emerald-300 uppercase tracking-wide">
                  Event #{currentEvent?.Evt_No} Ranking Completed
                </h4>
                <p className="text-[11px] sm:text-xs text-emerald-200/90 font-medium mt-0.5">
                  Official ranking has been prepared and completed. Further final list preparation is restricted. Only print of results is possible.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setModalFormat('a4');
                  setPrintModalType('results');
                }}
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                title="Print Results on Plain A4 Paper"
              >
                <Printer className="w-4 h-4" />
                <span>Print Results</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalFormat('thermal');
                  setPrintModalType('results');
                }}
                className="p-1.5 sm:px-3 sm:py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-1 shadow-md transition-all cursor-pointer"
                title="Print Results on 2&quot; Thermal Printer"
              >
                <Receipt className="w-4 h-4" />
                <span className="text-[11px] font-black hidden sm:inline">2" Thermal</span>
              </button>
            </div>
          </div>
        )}

        {enrolledCandidates.length === 0 ? (
          <div className="bg-white rounded-xl sm:rounded-2xl p-6 sm:p-10 text-center border border-slate-200 shadow-sm">
            <Flame className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500 mx-auto mb-2 opacity-60" />
            <h3 className="text-sm sm:text-base font-bold text-slate-800">No Candidates Enrolled for Event #{currentEvent?.Evt_No}</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Athletes must be registered in this event from Candidate Enrollment before generating the Hit List.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
            
            {/* Table Header Card */}
            <div className="bg-slate-900 text-white px-3 sm:px-5 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {isRankingPrepared ? (
                  <>
                    <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-[11px] sm:text-xs uppercase tracking-wider shrink-0 shadow-2xs">
                      Completed
                    </span>
                    <h3 className="font-bold text-xs sm:text-sm text-slate-100 uppercase tracking-wide truncate">
                      {currentEvent?.Evt_Name}, ({getFormattedHeightGender(currentEvent)}) • Official Results
                    </h3>
                  </>
                ) : (showQualifyCheckbox || eventHeats.length > 0 || isAlreadyPromoted) ? (
                  <>
                    <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[11px] sm:text-xs uppercase tracking-wider shrink-0 shadow-2xs">
                      Event: {currentEvent?.Evt_No}
                    </span>
                    <h3 className="font-bold text-xs sm:text-sm text-slate-100 uppercase tracking-wide truncate">
                      {currentEvent?.Evt_Name}, ({getFormattedHeightGender(currentEvent)}) • Final Preparation
                    </h3>
                  </>
                ) : (
                  <h3 className="font-bold text-xs sm:text-sm text-slate-100 truncate">
                    {getDynamicEventHeading(currentEvent)} ({enrolledCandidates.length} Athletes)
                  </h3>
                )}
              </div>

              <div className="flex items-center gap-2 print:hidden shrink-0">
                {isRankingPrepared ? (
                  <span className="text-[11px] sm:text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ranking Completed
                  </span>
                ) : isAlreadyPromoted ? (
                  <span className="text-[11px] sm:text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Final List Locked
                  </span>
                ) : showQualifyCheckbox || eventHeats.length > 0 ? (
                  <span className="text-[11px] sm:text-xs text-amber-300 font-bold">
                    {qualifiedParticipants.length} Qualifier(s)
                  </span>
                ) : null}

                {/* Reset Hit list button */}
                {!isRankingPrepared && !isAlreadyPromoted && eventHeats.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      for (const h of eventHeats) {
                        await onDeleteHeat(h.id);
                      }
                      setShowQualifyCheckbox(false);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                    title="Reset Hit List Selection"
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Candidates Working Table: Responsive with horizontal scrolling on mobile */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[500px] sm:min-w-full">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 text-[11px] sm:text-xs font-black uppercase border-b-2 border-slate-300">
                    <th className="py-2 sm:py-2.5 px-2.5 sm:px-3 w-10 sm:w-12 text-center border-r border-slate-300">Sl.</th>
                    <th className="py-2 sm:py-2.5 px-2.5 sm:px-3 w-32 sm:w-36 border-r border-slate-300">
                      {isRankingPrepared
                        ? 'Rank | Chest'
                        : (!isHitRequired || showQualifyCheckbox || eventHeats.length > 0 || isAlreadyPromoted)
                        ? 'Qualify | Chest' 
                        : 'Chest no.'}
                    </th>
                    <th className="py-2 sm:py-2.5 px-3 sm:px-4 border-r border-slate-300">Name (Club name)</th>
                    <th className="py-1 px-1 text-center w-36 sm:w-52" colSpan={4}>
                      <div className="text-[9px] sm:text-[10px] text-slate-600 uppercase font-black tracking-wider mb-0.5">
                        Position / Score
                      </div>
                      <div className="grid grid-cols-4 border-t border-slate-300 pt-0.5 font-mono text-[11px] sm:text-xs font-black text-slate-800">
                        <span className="text-center">1</span>
                        <span className="text-center border-l border-slate-300">2</span>
                        <span className="text-center border-l border-slate-300">3</span>
                        <span className="text-center border-l border-slate-300">4</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(() => {
                    const activeHeat = eventHeats[0];
                    const displayList = activeHeat ? activeHeat.participants : enrolledCandidates;

                    return displayList.map((item: any, idx: number) => {
                      const chestNo = item.chestNo;
                      const candName = item.candidateName || item.name;
                      const clubName = item.club;
                      const isQualified = activeHeat 
                        ? Boolean(item.qualified) 
                        : isAlreadyPromoted
                        ? savedFinalists.some((f) => Number(f.chestNo) === Number(chestNo))
                        : (!isHitRequired ? true : false);
                      const isFinalist = isAlreadyPromoted && savedFinalists.some(f => f.chestNo === chestNo);
                      const finalistRankObj = currentResult?.finalists?.find((f) => Number(f.chestNo) === Number(chestNo));
                      const rankPosition = finalistRankObj?.position;

                      return (
                        <tr 
                          key={chestNo || idx} 
                          className={`transition-colors hover:bg-slate-50 ${
                            rankPosition
                              ? 'bg-emerald-50/70 font-semibold'
                              : isFinalist
                              ? 'bg-slate-100/70'
                              : isQualified
                              ? 'bg-emerald-50/70'
                              : ''
                          }`}
                        >
                          {/* 1. Sl. */}
                          <td className="py-2 sm:py-2.5 px-2.5 sm:px-3 text-center font-mono font-bold text-slate-700 border-r border-slate-300 text-xs">
                            {idx + 1}
                          </td>

                          {/* 2. Chest no. with qualify checkbox or rank badge */}
                          <td className="py-2 sm:py-2.5 px-2.5 sm:px-3 font-mono font-bold border-r border-slate-300">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              {/* Qualify checkbox active on every direct final or final event card */}
                              {!isRankingPrepared && (!isHitRequired || showQualifyCheckbox || eventHeats.length > 0 || isAlreadyPromoted) && (
                                <input
                                  type="checkbox"
                                  id={`qualify-chk-${selectedEvtNo}-${chestNo}`}
                                  checked={isQualified}
                                  onChange={() => handleToggleQualify(chestNo)}
                                  className="w-4 h-4 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600 shrink-0"
                                  title="Mark candidate as Qualified for Final"
                                />
                              )}

                              <span className="text-sm sm:text-base text-blue-900 font-black">
                                #{chestNo}
                              </span>

                              {isRankingPrepared && rankPosition ? (
                                rankPosition === 1 ? (
                                  <span className="text-[9px] sm:text-[10px] font-black uppercase px-1.5 py-0.5 rounded-xs bg-amber-400 text-slate-950 shrink-0">
                                    1st (Gold)
                                  </span>
                                ) : rankPosition === 2 ? (
                                  <span className="text-[9px] sm:text-[10px] font-black uppercase px-1.5 py-0.5 rounded-xs bg-slate-300 text-slate-950 shrink-0">
                                    2nd (Silver)
                                  </span>
                                ) : rankPosition === 3 ? (
                                  <span className="text-[9px] sm:text-[10px] font-black uppercase px-1.5 py-0.5 rounded-xs bg-amber-700 text-white shrink-0">
                                    3rd (Bronze)
                                  </span>
                                ) : (
                                  <span className="text-[9px] sm:text-[10px] font-black uppercase px-1.5 py-0.5 rounded-xs bg-emerald-700 text-white shrink-0">
                                    {rankPosition}th
                                  </span>
                                )
                              ) : isFinalist ? (
                                <span className="text-[9px] sm:text-[10px] font-black uppercase px-1.5 py-0.5 rounded-xs bg-amber-400 text-slate-950 border border-amber-300 shadow-xs shrink-0 tracking-wider">
                                  FINAL
                                </span>
                              ) : isQualified ? (
                                <span className="text-[9px] sm:text-[10px] font-black uppercase px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded-xs bg-emerald-600 text-white shrink-0">
                                  Q
                                </span>
                              ) : null}
                            </div>
                          </td>

                          {/* 3. Name (Club name) */}
                          <td className="py-2 sm:py-2.5 px-3 sm:px-4 font-bold text-slate-900 border-r border-slate-300">
                            <span className="uppercase text-xs sm:text-sm">{candName}</span>
                            <span className="text-slate-600 font-semibold text-[11px] sm:text-xs ml-1.5">
                              ({clubName || 'Independent'})
                            </span>
                          </td>

                          {/* 4. | 1 | 2 | 3 | 4 | boxes */}
                          <td className={`py-1.5 sm:py-2 px-1 text-center w-9 sm:w-13 border-r border-slate-300 ${rankPosition === 1 ? 'bg-amber-100/60' : ''}`}>
                            <div className={`w-6 h-6 sm:w-7 sm:h-7 border-2 rounded-xs mx-auto flex items-center justify-center font-mono font-bold text-[10px] sm:text-xs ${
                              rankPosition === 1
                                ? 'border-amber-600 bg-amber-400 text-slate-950 font-black'
                                : 'border-slate-400 text-slate-300 print:border-black print:text-transparent'
                            }`}>
                              {rankPosition === 1 ? '✓' : '1'}
                            </div>
                          </td>
                          <td className={`py-1.5 sm:py-2 px-1 text-center w-9 sm:w-13 border-r border-slate-300 ${rankPosition === 2 ? 'bg-slate-100/80' : ''}`}>
                            <div className={`w-6 h-6 sm:w-7 sm:h-7 border-2 rounded-xs mx-auto flex items-center justify-center font-mono font-bold text-[10px] sm:text-xs ${
                              rankPosition === 2
                                ? 'border-slate-600 bg-slate-300 text-slate-950 font-black'
                                : 'border-slate-400 text-slate-300 print:border-black print:text-transparent'
                            }`}>
                              {rankPosition === 2 ? '✓' : '2'}
                            </div>
                          </td>
                          <td className={`py-1.5 sm:py-2 px-1 text-center w-9 sm:w-13 border-r border-slate-300 ${rankPosition === 3 ? 'bg-amber-100/60' : ''}`}>
                            <div className={`w-6 h-6 sm:w-7 sm:h-7 border-2 rounded-xs mx-auto flex items-center justify-center font-mono font-bold text-[10px] sm:text-xs ${
                              rankPosition === 3
                                ? 'border-amber-800 bg-amber-700 text-white font-black'
                                : 'border-slate-400 text-slate-300 print:border-black print:text-transparent'
                            }`}>
                              {rankPosition === 3 ? '✓' : '3'}
                            </div>
                          </td>
                          <td className={`py-1.5 sm:py-2 px-1 text-center w-9 sm:w-13 ${rankPosition === 4 ? 'bg-emerald-100/60' : ''}`}>
                            <div className={`w-6 h-6 sm:w-7 sm:h-7 border-2 rounded-xs mx-auto flex items-center justify-center font-mono font-bold text-[10px] sm:text-xs ${
                              rankPosition === 4
                                ? 'border-emerald-700 bg-emerald-600 text-white font-black'
                                : 'border-slate-400 text-slate-300 print:border-black print:text-transparent'
                            }`}>
                              {rankPosition === 4 ? '✓' : '4'}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div> {/* END WRAPPER FOR INTERACTIVE HITLIST UI */}

      {/* ========================================================================= */}
      {/* 4. MODAL: PRINT HIT LIST (Full A4 Page Preview & Printing)               */}
      {/* ========================================================================= */}
      {printModalType === 'hit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none print:overflow-visible print:p-0">
            
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="font-bold text-xs sm:text-base">Field Working Copy Preview (Hit List)</h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-400">
                    Event #{currentEvent?.Evt_No}: {currentEvent?.Evt_Name} • {enrolledCandidates.length} Athlete(s)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Format Switcher */}
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setModalFormat('a4')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      modalFormat === 'a4'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Print on Plain A4 Paper without outlines, borders, or background graphics"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Plain A4</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalFormat('thermal')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      modalFormat === 'thermal'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Print on 2-inch roll thermal printer"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>2" Thermal</span>
                  </button>
                </div>

                {/* Print Trigger */}
                <button
                  type="button"
                  onClick={handleExecutePrint}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                    modalFormat === 'thermal'
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{modalFormat === 'thermal' ? 'Print 2" Thermal Receipt' : 'Print Plain A4 Paper'}</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setPrintModalType(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Preview Canvas */}
            {modalFormat === 'thermal' ? (
              /* ================= 2-INCH THERMAL ROLL RECEIPT PREVIEW ================= */
              <div className="p-4 sm:p-8 bg-[#cbd5e1] overflow-y-auto flex-1 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div
                  className="thermal-printable-sheet w-full max-w-[320px] bg-white text-black p-4 shadow-[0_10px_35px_rgba(0,0,0,0.22)] rounded-xs font-mono text-[9.5px] leading-tight print:shadow-none print:p-0 print:max-w-[48mm] print:w-[48mm]"
                  style={{
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  }}
                >
                  {renderThermalHeader()}

                  <div className="text-center mb-1 leading-tight">
                    <div className="font-bold text-[10px] uppercase">
                      HIT LIST • WORKING COPY
                    </div>
                    <div className="font-bold text-[9.5px]">
                      EVT #{currentEvent?.Evt_No}: {currentEvent?.Evt_Name}
                    </div>
                    <div className="text-[8.5px]">
                      {getFormattedHeightGender(currentEvent)} • {enrolledCandidates.length} ATHLETES
                    </div>
                  </div>

                  <div className="border-b border-black pb-0.5 mb-1 font-bold flex justify-between text-[8.5px] leading-tight">
                    <span className="w-5 text-center">SL</span>
                    <span className="w-7 text-center">CH#</span>
                    <span className="flex-1 text-left">ATHLETE (CLUB)</span>
                    <span className="w-10 text-center">POS/SC</span>
                  </div>

                  <div className="space-y-1">
                    {enrolledCandidates.map((cand, idx) => (
                      <div
                        key={cand.id || cand.chestNo}
                        className="flex justify-between items-center text-[9px] leading-tight border-b border-dotted border-slate-300 pb-0.5"
                      >
                        <span className="w-5 text-center font-bold">{idx + 1}</span>
                        <span className="w-7 text-center font-mono font-bold">#{cand.chestNo}</span>
                        <span className="flex-1 text-left truncate pr-1">
                          {cand.name} <span className="text-[7.5px]">({cand.club || 'Ind'})</span>
                        </span>
                        <span className="w-10 text-center font-mono text-[8px] border border-black px-1 py-0.5">
                          [ &nbsp; ]
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 text-center text-[8px]">
                    Track / Field Official Sign: __________________
                  </div>

                  {renderThermalFooter()}
                </div>
              </div>
            ) : (
              /* ================= PLAIN A4 PAPER SHEET (NO OUTLINES/BORDERS/GRAPHICS) ================= */
              <div className="p-2 sm:p-6 overflow-y-auto flex-1 bg-slate-200/80 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div
                  className="a4-printable-sheet bg-white w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-10 shadow-md border-0 outline-none flex flex-col justify-between text-black font-sans print:p-0 print:m-0 print:border-none print:shadow-none print:outline-none print:bg-white print:max-w-none print:min-h-0"
                  id="printable-hit-content"
                >
                  <div>
                    {/* Official Meet Header */}
                    <div className="text-center border-b-2 border-black pb-3 mb-4">
                      <div className="flex items-center justify-center gap-3.5 mb-1">
                        <img src={settings.registeredClubLogo || '/icon.png'} alt="Club Logo" className="w-10 h-10 object-contain shrink-0" />
                        <div className="text-left">
                          <h1 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-black leading-tight">
                            {settings.registeredClubName || settings.organizer || 'Agrani Sasthitala Sangha'}
                          </h1>
                          <p className="text-xs sm:text-sm font-semibold text-black uppercase tracking-wide leading-tight mt-0.5">
                            {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-1.5 inline-block px-3 py-1">
                        <h2 className="text-xs sm:text-base font-black uppercase text-black">
                          {getDynamicEventHeading(currentEvent)}
                        </h2>
                      </div>
                      <p className="text-[10px] text-black font-bold uppercase tracking-wider mt-1">
                        OFFICIAL FIELD WORKING COPY • RECORDING SHEET • ALL PARTICIPANTS
                      </p>
                    </div>

                    {/* All Participants Hit List Table: Pure white, clean black borders, no background graphics */}
                    <table className="w-full text-left text-xs border border-black border-collapse bg-white">
                      <thead>
                        <tr className="bg-white text-black font-black uppercase border-b-2 border-black">
                          <th className="py-2 px-2 w-10 text-center border-r border-black">Sl.</th>
                          <th className="py-2 px-3 w-28 text-center border-r border-black">Chest no.</th>
                          <th className="py-2 px-3 border-r border-black">Name (Club name)</th>
                          <th className="py-1 px-1 text-center w-48" colSpan={4}>
                            <div className="text-[9px] uppercase tracking-wider font-black">Position / Score</div>
                            <div className="grid grid-cols-4 border-t border-black pt-0.5 font-bold">
                              <span>1</span>
                              <span className="border-l border-black">2</span>
                              <span className="border-l border-black">3</span>
                              <span className="border-l border-black">4</span>
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black">
                        {enrolledCandidates.map((cand, idx) => (
                          <tr key={cand.id || cand.chestNo} className="bg-white">
                            <td className="py-2 px-2 text-center font-bold border-r border-black text-black">{idx + 1}</td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-sm border-r border-black text-black">
                              #{cand.chestNo}
                            </td>
                            <td className="py-2 px-3 font-bold border-r border-black uppercase text-black">
                              {cand.name} <span className="text-[11px] font-semibold text-black">({cand.club || 'Independent'})</span>
                            </td>
                            <td className="py-2 px-1 text-center w-12 border-r border-black">
                              <div className="w-6 h-6 border-2 border-black rounded-xs mx-auto bg-white"></div>
                            </td>
                            <td className="py-2 px-1 text-center w-12 border-r border-black">
                              <div className="w-6 h-6 border-2 border-black rounded-xs mx-auto bg-white"></div>
                            </td>
                            <td className="py-2 px-1 text-center w-12 border-r border-black">
                              <div className="w-6 h-6 border-2 border-black rounded-xs mx-auto bg-white"></div>
                            </td>
                            <td className="py-2 px-1 text-center w-12">
                              <div className="w-6 h-6 border-2 border-black rounded-xs mx-auto bg-white"></div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Signatures Footer */}
                  <div className="mt-8 pt-3 border-t border-black grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-black avoid-break">
                    <div>
                      <div className="h-8"></div>
                      <div className="border-t border-black pt-1">Track Judge Signature</div>
                    </div>
                    <div>
                      <div className="h-8"></div>
                      <div className="border-t border-black pt-1">Field Referee</div>
                    </div>
                    <div>
                      <div className="h-8"></div>
                      <div className="border-t border-black pt-1">Meet Secretary</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: PRINT FINAL LIST (Plain A4 & 2" Thermal Roll)                   */}
      {/* STRICT REQUIREMENT: Only checked marked & promoted candidates appear here */}
      {/* ========================================================================= */}
      {printModalType === 'final' && canPrintFinalList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none print:overflow-visible print:p-0">
            
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 print:hidden">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="font-bold text-xs sm:text-base">Official Final List Preview (Championship Round)</h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-400">
                    Event #{currentEvent?.Evt_No}: {currentEvent?.Evt_Name} • {effectiveFinalists.length} Finalist(s)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Format Switcher */}
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setModalFormat('a4')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      modalFormat === 'a4'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Print on Plain A4 Paper without outlines, borders, or background graphics"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Plain A4</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalFormat('thermal')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      modalFormat === 'thermal'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Print on 2-inch roll thermal printer"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>2" Thermal</span>
                  </button>
                </div>

                {/* Print Action */}
                <button
                  type="button"
                  onClick={handleExecutePrint}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                    modalFormat === 'thermal'
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{modalFormat === 'thermal' ? 'Print 2" Thermal Receipt' : 'Print Plain A4 Paper'}</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setPrintModalType(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Preview Canvas */}
            {modalFormat === 'thermal' ? (
              /* ================= 2-INCH THERMAL ROLL RECEIPT PREVIEW ================= */
              <div className="p-4 sm:p-8 bg-[#cbd5e1] overflow-y-auto flex-1 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div
                  className="thermal-printable-sheet w-full max-w-[320px] bg-white text-black p-4 shadow-[0_10px_35px_rgba(0,0,0,0.22)] rounded-xs font-mono text-[9.5px] leading-tight print:shadow-none print:p-0 print:max-w-[48mm] print:w-[48mm]"
                  style={{
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  }}
                >
                  {renderThermalHeader()}

                  <div className="text-center mb-1 leading-tight">
                    <div className="font-bold text-[10px] uppercase">
                      FINAL ROUND START LIST
                    </div>
                    <div className="font-bold text-[9.5px]">
                      EVT #{currentEvent?.Evt_No}: {currentEvent?.Evt_Name}
                    </div>
                    <div className="text-[8.5px]">
                      {getFormattedHeightGender(currentEvent)} • {effectiveFinalists.length} FINALISTS
                    </div>
                  </div>

                  <div className="border-b border-black pb-0.5 mb-1 font-bold flex justify-between text-[8.5px] leading-tight">
                    <span className="w-5 text-center">LN</span>
                    <span className="w-7 text-center">CH#</span>
                    <span className="flex-1 text-left">ATHLETE (CLUB)</span>
                    <span className="w-10 text-center">POS/MARK</span>
                  </div>

                  <div className="space-y-1">
                    {effectiveFinalists.map((cand, idx) => (
                      <div
                        key={cand.chestNo}
                        className="flex justify-between items-center text-[9px] leading-tight border-b border-dotted border-slate-300 pb-0.5"
                      >
                        <span className="w-5 text-center font-bold">L{cand.lane || idx + 1}</span>
                        <span className="w-7 text-center font-mono font-bold">#{cand.chestNo}</span>
                        <span className="flex-1 text-left truncate pr-1">
                          {cand.candidateName} <span className="text-[7.5px]">({cand.club || 'Ind'})</span>
                        </span>
                        <span className="w-10 text-center font-mono text-[8px] border border-black px-1 py-0.5">
                          {cand.position ? `${cand.position}` : '[   ]'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 text-center text-[8px]">
                    Chief Referee Sign: __________________
                  </div>

                  {renderThermalFooter()}
                </div>
              </div>
            ) : (
              /* ================= PLAIN A4 PAPER SHEET (NO OUTLINES/BORDERS/GRAPHICS) ================= */
              <div className="p-2 sm:p-6 overflow-y-auto flex-1 bg-slate-200/80 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div
                  className="a4-printable-sheet bg-white w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-10 shadow-md border-0 outline-none flex flex-col justify-between text-black font-sans print:p-0 print:m-0 print:border-none print:shadow-none print:outline-none print:bg-white print:max-w-none print:min-h-0"
                  id="printable-final-content"
                >
                  <div>
                    {/* Official Meet Header */}
                    <div className="text-center border-b-2 border-black pb-3 mb-4">
                      <div className="flex items-center justify-center gap-3.5 mb-1">
                        <img src={settings.registeredClubLogo || '/icon.png'} alt="Club Logo" className="w-10 h-10 object-contain shrink-0" />
                        <div className="text-left">
                          <h1 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-black leading-tight">
                            {settings.registeredClubName || settings.organizer || 'Agrani Sasthitala Sangha'}
                          </h1>
                          <p className="text-xs sm:text-sm font-semibold text-black uppercase tracking-wide leading-tight mt-0.5">
                            {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-1.5 inline-block px-3 py-1">
                        <h2 className="text-xs sm:text-base font-black uppercase text-black">
                          OFFICIAL FINALIST START LIST • {getDynamicEventHeading(currentEvent)}
                        </h2>
                      </div>
                      <p className="text-[10px] text-black font-bold uppercase tracking-wider mt-1">
                        CHAMPIONSHIP ROUND FINALISTS
                      </p>
                    </div>

                    {/* Finalists Table: Pure white, clean black borders, no background graphics */}
                    <table className="w-full text-left text-xs border border-black border-collapse bg-white">
                      <thead>
                        <tr className="bg-white text-black font-black uppercase border-b-2 border-black">
                          <th className="py-2 px-2 w-12 text-center border-r border-black">Lane</th>
                          <th className="py-2 px-3 w-28 text-center border-r border-black">Chest no.</th>
                          <th className="py-2 px-3 border-r border-black">Finalist Athlete Name</th>
                          <th className="py-2 px-3 border-r border-black">Club Name</th>
                          <th className="py-2 px-3 text-center w-28 border-r border-black">Official Position</th>
                          <th className="py-2 px-3 text-center w-24">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black">
                        {effectiveFinalists.map((cand, idx) => (
                          <tr key={cand.chestNo} className="bg-white">
                            <td className="py-2 px-2 text-center font-mono font-black text-sm border-r border-black text-black">
                              {cand.lane || idx + 1}
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-sm border-r border-black text-black">
                              #{cand.chestNo}
                            </td>
                            <td className="py-2 px-3 font-bold border-r border-black uppercase text-black">
                              {cand.candidateName}
                            </td>
                            <td className="py-2 px-3 uppercase font-semibold text-black border-r border-black">
                              {cand.club || 'Independent'}
                            </td>
                            <td className="py-2 px-3 text-center border-r border-black">
                              <div className="w-14 sm:w-16 h-6 sm:h-7 border-2 border-black rounded-xs mx-auto flex items-center justify-center font-bold bg-white text-black">
                                {cand.position ? `${cand.position}` : ''}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-black"></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Final Signatures */}
                  <div className="mt-8 pt-3 border-t border-black grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-black avoid-break">
                    <div>
                      <div className="h-8"></div>
                      <div className="border-t border-black pt-1">Chief Judge Signature</div>
                    </div>
                    <div>
                      <div className="h-8"></div>
                      <div className="border-t border-black pt-1">President of Meet</div>
                    </div>
                    <div>
                      <div className="h-8"></div>
                      <div className="border-t border-black pt-1">General Secretary</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL: PRINT OFFICIAL RESULTS (Plain A4 & 2" Thermal Roll)             */}
      {/* ========================================================================= */}
      {printModalType === 'results' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none print:overflow-visible print:p-0">
            
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 print:hidden">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-xs sm:text-base">Official Event Results &amp; Rankings Report</h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-400">
                    Event #{currentEvent?.Evt_No}: {currentEvent?.Evt_Name} • {rankedWinners.length} Ranked Winner(s)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Format Switcher */}
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setModalFormat('a4')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      modalFormat === 'a4'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Print on Plain A4 Paper without outlines, borders, or background graphics"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Plain A4</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalFormat('thermal')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      modalFormat === 'thermal'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Print on 2-inch roll thermal printer"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>2" Thermal</span>
                  </button>
                </div>

                {/* Print Trigger */}
                <button
                  type="button"
                  onClick={handleExecutePrint}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                    modalFormat === 'thermal'
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{modalFormat === 'thermal' ? 'Print 2" Thermal Receipt' : 'Print Plain A4 Paper'}</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setPrintModalType(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Preview Canvas */}
            {modalFormat === 'thermal' ? (
              /* ================= 2-INCH THERMAL ROLL RECEIPT PREVIEW ================= */
              <div className="p-4 sm:p-8 bg-[#cbd5e1] overflow-y-auto flex-1 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div
                  className="thermal-printable-sheet w-full max-w-[320px] bg-white text-black p-4 shadow-[0_10px_35px_rgba(0,0,0,0.22)] rounded-xs font-mono text-[9.5px] leading-tight print:shadow-none print:p-0 print:max-w-[48mm] print:w-[48mm]"
                  style={{
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  }}
                >
                  {renderThermalHeader()}

                  <div className="text-center mb-1 leading-tight">
                    <div className="font-bold text-[10px] uppercase">
                      OFFICIAL EVENT RESULTS
                    </div>
                    <div className="font-bold text-[9.5px]">
                      EVT #{currentEvent?.Evt_No}: {currentEvent?.Evt_Name}
                    </div>
                    <div className="text-[8.5px]">
                      {getFormattedHeightGender(currentEvent)}
                    </div>
                  </div>

                  <div className="border-b border-black pb-0.5 mb-1 font-bold flex justify-between text-[8.5px] leading-tight">
                    <span className="w-6 font-bold text-center">POS</span>
                    <span className="w-7 text-center">CH#</span>
                    <span className="flex-1 text-left">ATHLETE (CLUB)</span>
                    <span className="w-6 text-center">PTS</span>
                    <span className="w-8 text-right">PERF</span>
                  </div>

                  <div className="space-y-0.5">
                    {rankedWinners.map((w) => {
                      const posLabel =
                        w.position === 1
                          ? '1ST'
                          : w.position === 2
                          ? '2ND'
                          : w.position === 3
                          ? '3RD'
                          : `${w.position}TH`;
                      const pts = getPointsForPosition(w.position);
                      return (
                        <div key={w.chestNo} className="flex justify-between items-center text-[9px] leading-tight">
                          <span className="w-6 font-bold text-center">{posLabel}</span>
                          <span className="w-7 text-center font-mono">#{w.chestNo}</span>
                          <span className="flex-1 text-left truncate pr-1">
                            {w.candidateName} <span className="text-[7.5px]">({w.club || 'Ind'})</span>
                          </span>
                          <span className="w-6 text-center font-bold">{pts}</span>
                          <span className="w-8 text-right font-mono text-[8px]">
                            {w.jumpRecord || w.resultValue || '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {currentResult?.highestRecord?.isRecordBroken && (
                    <div className="mt-1 pt-0.5 border-t border-dashed border-black text-[8px] font-bold text-center leading-tight">
                      * NEW RECORD: {currentResult.highestRecord.recordValue} ({currentResult.highestRecord.candidateName}) *
                    </div>
                  )}

                  <div className="pt-2 text-center text-[8px]">
                    Chief Referee Sign: __________________
                  </div>

                  {renderThermalFooter()}
                </div>
              </div>
            ) : (
              /* ================= PLAIN A4 PAPER SHEET (NO OUTLINES/BORDERS/GRAPHICS) ================= */
              <div className="p-2 sm:p-6 overflow-y-auto flex-1 bg-slate-200/80 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div
                  className="a4-printable-sheet bg-white w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-10 shadow-md border-0 outline-none flex flex-col justify-between text-black font-sans print:p-0 print:m-0 print:border-none print:shadow-none print:outline-none print:bg-white print:w-full print:min-h-0"
                  id="printable-results-content"
                >
                  <div>
                    {/* Official Meet Header */}
                    <div className="text-center border-b-2 border-black pb-3 mb-4">
                      <div className="flex items-center justify-center gap-3.5 mb-1">
                        <img src={settings.registeredClubLogo || '/icon.png'} alt="Club Logo" className="w-10 h-10 object-contain shrink-0" />
                        <div className="text-left">
                          <h1 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-black leading-tight">
                            {settings.registeredClubName || settings.organizer || 'Agrani Sasthitala Sangha'}
                          </h1>
                          <p className="text-xs sm:text-sm font-semibold text-black uppercase tracking-wide leading-tight mt-0.5">
                            {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-1.5 inline-block px-3 py-1">
                        <h2 className="text-xs sm:text-base font-black uppercase text-black">
                          OFFICIAL RESULTS &amp; PODIUM RANKINGS • {getDynamicEventHeading(currentEvent)}
                        </h2>
                      </div>
                      <p className="text-[10px] text-black font-bold uppercase tracking-wider mt-1">
                        AUTHORIZED BY MEET COMMITTEE • OFFICIAL MEDAL &amp; POINTS TALLY
                      </p>
                    </div>

                    {/* Winners Table: Pure white, clean black borders, no background graphics */}
                    <table className="w-full text-left text-xs border border-black border-collapse mb-6 bg-white">
                      <thead>
                        <tr className="bg-white text-black font-black uppercase border-b-2 border-black">
                          <th className="py-2.5 px-2 w-14 text-center border-r border-black">Pos</th>
                          <th className="py-2.5 px-2 w-20 text-center border-r border-black">Medal</th>
                          <th className="py-2.5 px-3 w-28 text-center border-r border-black">Chest #</th>
                          <th className="py-2.5 px-3 border-r border-black">Athlete Name</th>
                          <th className="py-2.5 px-3 border-r border-black">Club Name</th>
                          <th className="py-2.5 px-3 text-center border-r border-black w-24">Performance</th>
                          <th className="py-2.5 px-3 text-center w-20">Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black font-bold">
                        {rankedWinners.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-black italic bg-white">
                              No rankings have been recorded yet for this event.
                            </td>
                          </tr>
                        ) : (
                          rankedWinners.map((winner) => {
                            const pts = getPointsForPosition(winner.position);
                            const posLabel =
                              winner.position === 1
                                ? '1st'
                                : winner.position === 2
                                ? '2nd'
                                : winner.position === 3
                                ? '3rd'
                                : `${winner.position}th`;

                            return (
                              <tr key={winner.chestNo} className="bg-white text-black">
                                <td className="py-2 px-2 text-center font-black border-r border-black">{posLabel}</td>
                                <td className="py-2 px-2 text-center border-r border-black font-black">
                                  {winner.position === 1 ? 'GOLD' : winner.position === 2 ? 'SILVER' : winner.position === 3 ? 'BRONZE' : '—'}
                                </td>
                                <td className="py-2 px-3 text-center font-mono font-black text-sm border-r border-black">
                                  #{winner.chestNo}
                                </td>
                                <td className="py-2 px-3 uppercase border-r border-black font-bold">
                                  {winner.candidateName}
                                </td>
                                <td className="py-2 px-3 uppercase border-r border-black text-black">
                                  {winner.club || 'Independent'}
                                </td>
                                <td className="py-2 px-3 text-center font-mono font-bold border-r border-black">
                                  {winner.jumpRecord || winner.resultValue || '—'}
                                </td>
                                <td className="py-2 px-3 text-center font-mono font-black text-sm">
                                  {pts}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>

                    {/* Broad Jump Record Callout (Clean Plain Paper Style) */}
                    {currentEvent?.Evt_Name?.toUpperCase().includes('BROAD JUMP') && currentResult?.highestRecord && (
                      <div className="mb-6 p-3 border-2 border-black text-xs flex items-center justify-between bg-white text-black">
                        <div>
                          <span className="font-black uppercase">🏅 Meet Broad Jump Record: </span>
                          <span className="font-bold">
                            Highest Jump: <strong className="font-mono">{currentResult.highestRecord.recordValue}</strong> by {currentResult.highestRecord.candidateName} (#{currentResult.highestRecord.chestNo}, {currentResult.highestRecord.club})
                          </span>
                          {currentResult.highestRecord.previousRecordValue && (
                            <span className="text-black ml-1">
                              (Previous: {currentResult.highestRecord.previousRecordValue}{currentResult.highestRecord.previousRecordHolder ? ` by ${currentResult.highestRecord.previousRecordHolder}` : ''} {currentResult.highestRecord.previousRecordYear ? `[${currentResult.highestRecord.previousRecordYear}]` : ''})
                            </span>
                          )}
                        </div>
                        <span className="px-2 py-0.5 border border-black text-xs font-black uppercase">
                          {currentResult.highestRecord.isRecordBroken ? 'Record Broken' : 'Record Stands'}
                        </span>
                      </div>
                    )}

                    {/* Other Finalists section */}
                    {savedFinalists.filter((f) => !f.position || f.position < 1 || f.position > 6).length > 0 && (
                      <div className="mt-4 mb-6">
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-black mb-1.5">
                          Other Finalist Competitors
                        </h4>
                        <table className="w-full text-left text-[11px] border border-black border-collapse bg-white">
                          <thead>
                            <tr className="bg-white text-black font-bold uppercase border-b border-black">
                              <th className="py-1 px-2 w-12 text-center border-r border-black">Lane</th>
                              <th className="py-1 px-2.5 w-24 text-center border-r border-black">Chest #</th>
                              <th className="py-1 px-3 border-r border-black">Athlete Name</th>
                              <th className="py-1 px-3">Club Name</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black">
                            {savedFinalists
                              .filter((f) => !f.position || f.position < 1 || f.position > 6)
                              .map((f, i) => (
                                <tr key={f.chestNo} className="bg-white text-black">
                                  <td className="py-1 px-2 text-center font-mono border-r border-black">{f.lane || i + 1}</td>
                                  <td className="py-1 px-2.5 text-center font-mono font-bold border-r border-black">#{f.chestNo}</td>
                                  <td className="py-1 px-3 uppercase font-semibold border-r border-black">{f.candidateName}</td>
                                  <td className="py-1 px-3 uppercase text-black">{f.club || 'Independent'}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Signatures Footer */}
                  <div className="mt-8 pt-3 border-t border-black grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-black avoid-break">
                    <div>
                      <div className="h-8"></div>
                      <div className="border-t border-black pt-1">Track / Field Judge</div>
                    </div>
                    <div>
                      <div className="h-8"></div>
                      <div className="border-t border-black pt-1">Chief Referee</div>
                    </div>
                    <div>
                      <div className="h-8"></div>
                      <div className="border-t border-black pt-1">General Secretary</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

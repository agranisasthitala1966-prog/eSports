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
  CheckCircle2,
  Award,
  Flame,
  Sparkles,
  Receipt,
  FileText,
  Sliders
} from 'lucide-react';
import { ThermalPageSetupModal } from './ThermalPageSetupModal';
import { 
  ThermalPrintSettings, 
  getThermalSettings, 
  generateThermalPrintCSS 
} from '../utils/thermalSettings';

// Helper to parse jump measurement strings like "16`-02``", "16'-02\"", "14' 5\"", "14 ft 5 in", "4.45m", "16.5" into numeric inches for accurate comparison
export function parseJumpToInches(val?: string | null): number {
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;

  // Pattern 1: Feet & inches with backticks (16`-02``), quotes (16'-02"), ft/in (16 ft 2 in), or hyphen (16-2)
  const ftInMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:'|`|ft|feet)?\s*[-–]?\s*(\d+(?:\.\d+)?)\s*(?:"|``|`|in|inch|inches)?$/i);
  if (ftInMatch) {
    const ft = parseFloat(ftInMatch[1]) || 0;
    const inch = parseFloat(ftInMatch[2]) || 0;
    return ft * 12 + inch;
  }

  // Pattern 2: Feet only like 16' or 16` or 16 ft
  const ftMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:'|`|ft|feet)$/i);
  if (ftMatch) {
    return (parseFloat(ftMatch[1]) || 0) * 12;
  }

  // Pattern 3: Meters like 4.45m, 4.45 m
  const meterMatch = str.match(/^(\d+(?:\.\d+)?)\s*m(?:eters?)?$/i);
  if (meterMatch) {
    return (parseFloat(meterMatch[1]) || 0) * 39.3701;
  }

  // Pattern 4: Bare number or decimals like 16.5
  const num = parseFloat(str);
  if (!isNaN(num)) {
    return num * 12;
  }

  return 0;
}

// Format numeric inches or jump string into standard 16`-02`` format
export function formatJumpBenchmark(val?: string | number | null): string {
  if (val === undefined || val === null || val === '') return '';
  const totalInches = typeof val === 'number' ? val : parseJumpToInches(String(val));
  if (totalInches <= 0) return typeof val === 'string' ? val : '';
  let feet = Math.floor(totalInches / 12);
  let remInches = Math.round(totalInches % 12);
  if (remInches === 12) {
    feet += 1;
    remInches = 0;
  }
  return `${feet}\`-${String(remInches).padStart(2, '0')}\`\``;
}

// Convert ranking numeric position to word (e.g. First, Second, Third) as shown in RankingA4.png
export function getPositionWord(pos?: number, idx?: number): string {
  const p = (pos && pos > 0) ? pos : ((idx !== undefined) ? idx + 1 : 1);
  const words: Record<number, string> = {
    1: 'First',
    2: 'Second',
    3: 'Third',
    4: 'Fourth',
    5: 'Fifth',
    6: 'Sixth',
    7: 'Seventh',
    8: 'Eighth',
    9: 'Ninth',
    10: 'Tenth'
  };
  return words[p] || `${p}th`;
}

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

  // Cancelled chest numbers set helper
  const cancelledChestSet = useMemo(() => {
    const set = new Set<number>();
    candidates.forEach((c) => {
      if (c.isCancelled || c.status === 'cancelled') {
        set.add(Number(c.chestNo));
      }
    });
    return set;
  }, [candidates]);

  // Events where final list has been generated (strictly requires finalists saved in results)
  // Per user requirement: Where final list has not been generated for an event, that event number must NOT appear in Ranking page event selection combo.
  const eventsWithFinalList = useMemo(() => {
    return sortedEvents.filter((evt) => {
      const res = results.find((r) => Number(r.eventNo) === Number(evt.Evt_No));
      if (!res) return false;
      if (!res.finalists || res.finalists.length === 0) return false;
      const validFinalists = res.finalists.filter((f) => !cancelledChestSet.has(Number(f.chestNo)));
      return validFinalists.length > 0;
    });
  }, [sortedEvents, results, cancelledChestSet]);

  // Selected event for recording rankings - strictly must be an event with final list generated
  const [selectedEvtNo, setSelectedEvtNo] = useState<number>(() => {
    if (
      preselectedEvtNo !== undefined &&
      eventsWithFinalList.some((e) => Number(e.Evt_No) === Number(preselectedEvtNo))
    ) {
      return preselectedEvtNo;
    }
    return eventsWithFinalList[0]?.Evt_No ?? 0;
  });

  // Active event object - must be an event with final list generated
  const currentEvent = useMemo(() => {
    if (eventsWithFinalList.length === 0) return null;
    return (
      eventsWithFinalList.find((e) => Number(e.Evt_No) === Number(selectedEvtNo)) ||
      eventsWithFinalList[0] ||
      null
    );
  }, [eventsWithFinalList, selectedEvtNo]);

  // Current result from results pool
  const currentResult = useMemo(() => {
    if (!currentEvent) return undefined;
    return results.find((r) => Number(r.eventNo) === Number(currentEvent.Evt_No));
  }, [results, currentEvent]);

  // Check if current event already has completed / finalized rankings
  const isAlreadyRanked = useMemo(() => {
    if (!currentResult) return false;
    const hasRankedFinalists = (currentResult.finalists || []).some(
      (f) => f.position && f.position >= 1 && f.position <= 6
    );
    return Boolean(currentResult.completed || hasRankedFinalists);
  }, [currentResult]);

  // Synchronize with preselectedEvtNo prop or first event with generated final list
  useEffect(() => {
    if (
      preselectedEvtNo !== undefined &&
      eventsWithFinalList.some((e) => Number(e.Evt_No) === Number(preselectedEvtNo))
    ) {
      setSelectedEvtNo(preselectedEvtNo);
    } else if (eventsWithFinalList.length > 0) {
      if (!eventsWithFinalList.some((e) => Number(e.Evt_No) === Number(selectedEvtNo))) {
        setSelectedEvtNo(eventsWithFinalList[0].Evt_No);
      }
    } else {
      setSelectedEvtNo(0);
    }
  }, [eventsWithFinalList, preselectedEvtNo, selectedEvtNo]);

  // Eligible pool of finalists: strictly uses the generated finalists from results
  const eligibleFinalists: FinalParticipant[] = useMemo(() => {
    if (currentResult?.finalists && currentResult.finalists.length > 0) {
      return currentResult.finalists.filter((f) => !cancelledChestSet.has(Number(f.chestNo)));
    }
    return [];
  }, [currentResult, cancelledChestSet]);

  // Broad Jump detection
  const isBroadJump = useMemo(() => {
    return (currentEvent?.Evt_Name || '').toUpperCase().includes('BROAD JUMP');
  }, [currentEvent]);

  // Jump records map: chestNo -> string (e.g. "14' 8\"" or "4.52m")
  const [jumpRecords, setJumpRecords] = useState<Record<number, string>>({});

  // Previous year's record for this Broad Jump event from settings
  const previousRecord = useMemo(() => {
    if (!isBroadJump) return null;
    return settings.broadJumpPreviousRecords?.[selectedEvtNo] || null;
  }, [isBroadJump, settings, selectedEvtNo]);

  // Rankings state map: position (1, 2, 3, 4, 5, 6) -> chestNo | null
  const [rankedMap, setRankedMap] = useState<Record<number, number | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
  });

  // Highest Jump Analysis: computes the best jump among ranked athletes & checks if previous record was broken
  const highestJumpAnalysis = useMemo(() => {
    if (!isBroadJump) return null;

    let bestChestNo: number | null = null;
    let bestValueStr = '';
    let maxInches = 0;

    Object.entries(rankedMap).forEach(([posStr, chestNo]) => {
      if (!chestNo) return;
      const jumpVal = jumpRecords[chestNo] || '';
      if (!jumpVal.trim()) return;
      const inches = parseJumpToInches(jumpVal);
      if (inches > maxInches) {
        maxInches = inches;
        bestChestNo = chestNo;
        bestValueStr = jumpVal.trim();
      }
    });

    const prevInches = previousRecord ? parseJumpToInches(previousRecord.recordValue) : 0;
    const formattedBenchmark = previousRecord ? formatJumpBenchmark(previousRecord.recordValue) : '';

    if (!bestChestNo && currentResult?.highestRecord) {
      const hr = currentResult.highestRecord;
      const hrInches = parseJumpToInches(hr.recordValue);
      const isBroken = hr.isRecordBroken ?? (prevInches > 0 ? hrInches > prevInches : hrInches > 0);
      const comp = prevInches > 0 ? (hrInches > prevInches ? 'greater' : hrInches < prevInches ? 'less' : 'equal') : 'none';
      return {
        candidateName: hr.candidateName,
        chestNo: hr.chestNo,
        club: hr.club,
        recordValue: formatJumpBenchmark(hr.recordValue) || hr.recordValue,
        isRecordBroken: isBroken,
        inches: hrInches,
        comparison: comp,
        previousRecordValue: formattedBenchmark || hr.previousRecordValue,
        previousRecordHolder: hr.previousRecordHolder || previousRecord?.recordHolderName,
        previousRecordYear: hr.previousRecordYear || previousRecord?.recordYear,
      };
    }

    if (!bestChestNo) return null;

    const candidateObj = candidates.find((c) => Number(c.chestNo) === Number(bestChestNo));
    const isRecordBroken = prevInches > 0 ? maxInches > prevInches : maxInches > 0;
    const comparison = prevInches > 0 ? (maxInches > prevInches ? 'greater' : maxInches < prevInches ? 'less' : 'equal') : 'none';

    return {
      candidateName: candidateObj?.name || `Chest #${bestChestNo}`,
      chestNo: bestChestNo,
      club: candidateObj?.club || '',
      recordValue: formatJumpBenchmark(bestValueStr) || bestValueStr,
      isRecordBroken,
      inches: maxInches,
      comparison,
      previousRecordValue: formattedBenchmark,
      previousRecordHolder: previousRecord?.recordHolderName,
      previousRecordYear: previousRecord?.recordYear,
    };
  }, [isBroadJump, rankedMap, jumpRecords, candidates, currentResult, previousRecord]);

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
  const [singlePrintEvt, setSinglePrintEvt] = useState<number>(() => {
    return eventsWithFinalList[0]?.Evt_No ?? selectedEvtNo ?? 0;
  });
  const minFinalEvt = eventsWithFinalList[0]?.Evt_No ?? 1;
  const maxFinalEvt = eventsWithFinalList[eventsWithFinalList.length - 1]?.Evt_No ?? 15;
  const [rangeStart, setRangeStart] = useState<number>(minFinalEvt);
  const [rangeEnd, setRangeEnd] = useState<number>(maxFinalEvt);
  const [customCsvInput, setCustomCsvInput] = useState<string>('1, 2, 3, 5');

  // Synchronize singlePrintEvt and ranges when eventsWithFinalList changes
  useEffect(() => {
    if (eventsWithFinalList.length > 0) {
      if (!eventsWithFinalList.some((e) => Number(e.Evt_No) === Number(singlePrintEvt))) {
        setSinglePrintEvt(eventsWithFinalList[0].Evt_No);
      }
    } else {
      setSinglePrintEvt(0);
    }
  }, [eventsWithFinalList, singlePrintEvt]);

  // Print Modal
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [modalFormat, setModalFormat] = useState<'a4' | 'thermal'>('a4');
  const [thermalConfig, setThermalConfig] = useState<ThermalPrintSettings>(getThermalSettings());
  const [showThermalSetup, setShowThermalSetup] = useState<boolean>(false);

  const currentTimestamp = useMemo(() => {
    return new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }, [showPrintModal]);

  useEffect(() => {
    const handleSettingsChange = (e: any) => {
      if (e.detail) {
        setThermalConfig(e.detail);
      }
    };
    window.addEventListener('thermal-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('thermal-settings-changed', handleSettingsChange);
  }, []);

  // Handle ESC key to exit print preview modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPrintModal) {
        setShowPrintModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPrintModal]);

  // Synchronize local rankedMap & jumpRecords when selected event changes or when initial data loads
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
    const initialJumpMap: Record<number, string> = {};

    if (currentResult?.finalists) {
      currentResult.finalists.forEach((f) => {
        if (f.position && f.position >= 1 && f.position <= 6) {
          initialMap[f.position] = f.chestNo;
        }
        if (f.jumpRecord) {
          initialJumpMap[f.chestNo] = f.jumpRecord;
        } else if (f.resultValue) {
          initialJumpMap[f.chestNo] = f.resultValue;
        }
      });
    }

    setRankedMap(initialMap);
    setJumpRecords(initialJumpMap);
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
            const isSelf = (f.club || '').trim().toUpperCase() === 'SELF';
            pts = isSelf ? 0 : getPointsForPosition(pos);
            break;
          }
        }

        const jumpVal = jumpRecords[f.chestNo]?.trim() || '';

        return {
          ...f,
          position: assignedPos,
          points: pts,
          jumpRecord: jumpVal || undefined,
          resultValue: jumpVal || undefined,
        };
      });

      // Highest Record computation for Broad Jump
      let highestRecordToSave = undefined;
      if (isBroadJump && highestJumpAnalysis) {
        highestRecordToSave = {
          candidateName: highestJumpAnalysis.candidateName,
          chestNo: highestJumpAnalysis.chestNo,
          club: highestJumpAnalysis.club,
          recordValue: highestJumpAnalysis.recordValue,
          isRecordBroken: highestJumpAnalysis.isRecordBroken,
          previousRecordValue: highestJumpAnalysis.previousRecordValue,
          previousRecordHolder: highestJumpAnalysis.previousRecordHolder,
          previousRecordYear: highestJumpAnalysis.previousRecordYear,
        };
      }

      await onSaveResult({
        id: currentResult?.id || `res_evt_${selectedEvtNo}`,
        eventNo: selectedEvtNo,
        finalists: updatedFinalists,
        completed: true,
        recordedAt: new Date().toISOString(),
        highestRecord: highestRecordToSave,
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

  // Club Championship Standings calculation (excludes SELF and Independent)
  const clubChampionshipTable = useMemo(() => {
    const clubMap: Record<string, { name: string; gold: number; silver: number; bronze: number; points: number }> = {};

    clubs.forEach((c) => {
      if (!c.name) return;
      const cleanName = c.name.trim();
      if (!cleanName || cleanName.toUpperCase() === 'SELF' || cleanName === 'Independent' || cleanName === 'Independent / Unattached') return;
      clubMap[cleanName] = { name: cleanName, gold: 0, silver: 0, bronze: 0, points: 0 };
    });

    candidates.forEach((c) => {
      const cClub = (c.club || '').trim();
      if (!cClub || cClub.toUpperCase() === 'SELF' || cClub === 'Independent' || cClub === 'Independent / Unattached') return;
      if (!clubMap[cClub]) {
        clubMap[cClub] = { name: cClub, gold: 0, silver: 0, bronze: 0, points: 0 };
      }
    });

    results.forEach((res) => {
      const participants = res.winners && res.winners.length > 0 ? res.winners : (res.finalists || []);
      participants.forEach((f) => {
        const fClub = (f.club || '').trim();
        if (!fClub || fClub.toUpperCase() === 'SELF' || fClub === 'Independent' || fClub === 'Independent / Unattached') return;
        if (!clubMap[fClub]) {
          clubMap[fClub] = { name: fClub, gold: 0, silver: 0, bronze: 0, points: 0 };
        }
        if (f.position === 1) {
          clubMap[fClub].gold += 1;
          clubMap[fClub].points += 7;
        } else if (f.position === 2) {
          clubMap[fClub].silver += 1;
          clubMap[fClub].points += 5;
        } else if (f.position === 3) {
          clubMap[fClub].bronze += 1;
          clubMap[fClub].points += 4;
        } else if (f.position === 4) {
          clubMap[fClub].points += 3;
        } else if (f.position === 5) {
          clubMap[fClub].points += 2;
        } else if (f.position === 6) {
          clubMap[fClub].points += 1;
        }
      });
    });

    return Object.values(clubMap)
      .filter((c) => c.points > 0 || c.gold > 0)
      .sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver);
  }, [results, clubs, candidates]);

  // Compute which events will be printed based on Print Scope selection (only events with final list generated)
  const eventsToPrint = useMemo(() => {
    const baseEvents = eventsWithFinalList.length > 0 ? eventsWithFinalList : [];
    if (printScope === 'single') {
      return baseEvents.filter((e) => Number(e.Evt_No) === Number(singlePrintEvt));
    }
    if (printScope === 'range') {
      const s = Math.min(Number(rangeStart) || 0, Number(rangeEnd) || 0);
      const e = Math.max(Number(rangeStart) || 0, Number(rangeEnd) || 0);
      return baseEvents.filter((evt) => {
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
      return baseEvents.filter((evt) => numbers.includes(Number(evt.Evt_No)));
    }
    return baseEvents;
  }, [printScope, singlePrintEvt, rangeStart, rangeEnd, customCsvInput, eventsWithFinalList]);

  // Trigger browser print
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

  // Thermal header: Same as Candidate List thermal report (inline logo beside club name, ordinal below centered)
  const renderThermalHeader = (specificClubName?: string) => {
    const clubDisplayName = getThermalClubName(specificClubName);
    const clubLogo = getThermalClubLogo(specificClubName);

    return (
      <div className="pb-1 mb-1 border-b border-dashed border-black pt-1">
        <div className="flex items-center justify-center gap-1.5 leading-tight">
          <img
            src={clubLogo}
            alt="Club Logo"
            className="w-5 h-5 shrink-0 object-contain filter grayscale contrast-200"
            style={{ filter: 'grayscale(100%) contrast(200%)' }}
          />
          <span className="font-bold text-[10.5px] uppercase tracking-tight text-black truncate max-w-[36mm]">
            {clubDisplayName}
          </span>
        </div>
        <div className="text-[8.5px] font-semibold text-black leading-tight mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[46mm] mx-auto text-center">
          {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
        </div>
      </div>
    );
  };

  // Thermal footer: Same as Candidate List thermal report
  const renderThermalFooter = () => {
    return (
      <div className="text-center pt-1 mt-1 border-t border-dashed border-black text-black">
        <div className="flex items-center justify-center gap-1 leading-none max-w-[46mm] mx-auto whitespace-nowrap overflow-hidden">
          <img
            src="/icon.png"
            alt="eSports Logo"
            className="w-3.5 h-3.5 shrink-0 object-contain filter grayscale contrast-200"
            style={{ filter: 'grayscale(100%) contrast(200%)' }}
          />
          <span className="font-semibold text-[8px] tracking-tight text-black whitespace-nowrap truncate">
            eSports (Sport Management System)
          </span>
        </div>
        <div className="text-[7.5px] text-black leading-none mt-0.5 font-mono whitespace-nowrap">
          {currentTimestamp}
        </div>
      </div>
    );
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
    <div className="relative">
      {/* Scoped Dynamic Print Stylesheet: Ensures complete isolation and precise formatting */}
      {modalFormat === 'thermal' ? (
        <style>{generateThermalPrintCSS(thermalConfig)}</style>
      ) : (
        <style>{`
          @media print {
            header, nav, footer, .print-hidden-element, .interactive-ranking-ui {
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
            .receipt,
            .thermal-printable-wrapper,
            .thermal-printable-sheet {
              display: none !important;
            }
            .avoid-break {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        `}</style>
      )}

      {/* Interactive Ranking UI Wrapper: Hidden when print modal is open */}
      <div className={`max-w-5xl mx-auto space-y-4 px-2 sm:px-0 interactive-ranking-ui ${showPrintModal ? 'print:hidden' : ''}`}>
      
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
            {eventsWithFinalList.length > 0 ? (
              <span className="text-[11px] sm:text-xs font-black text-slate-700 uppercase bg-white/80 px-2.5 py-1 rounded-full border border-slate-300 shadow-2xs">
                Event #{selectedEvtNo}
              </span>
            ) : (
              <span className="text-[11px] sm:text-xs font-bold text-amber-800 uppercase bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 shadow-2xs">
                No Final Lists
              </span>
            )}
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
                Final Rankings &amp; Points
              </h1>
              <p className="text-[11px] text-slate-600 font-semibold hidden sm:block">
                Assign podium positions to finalists and calculate club championship points.
              </p>
            </div>
          </div>
          {!onNavigateBackToHitList && (
            eventsWithFinalList.length > 0 ? (
              <span className="text-[11px] sm:text-xs font-black text-slate-700 uppercase bg-white/80 px-2.5 py-1 rounded-full border border-slate-300 shadow-2xs">
                Event #{selectedEvtNo}
              </span>
            ) : (
              <span className="text-[11px] sm:text-xs font-bold text-amber-800 uppercase bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 shadow-2xs">
                No Final Lists
              </span>
            )
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
                      value={eventsWithFinalList.some(e => Number(e.Evt_No) === Number(singlePrintEvt)) ? singlePrintEvt : (eventsWithFinalList[0]?.Evt_No ?? '')}
                      onChange={(e) => setSinglePrintEvt(Number(e.target.value))}
                      disabled={eventsWithFinalList.length === 0}
                      className="w-full bg-white border border-[#94a3b8] rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-600 cursor-pointer appearance-none pr-7 truncate shadow-2xs disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {eventsWithFinalList.length === 0 ? (
                        <option value="">No events with final list</option>
                      ) : (
                        eventsWithFinalList.map((evt) => (
                          <option key={evt.Evt_No} value={evt.Evt_No}>
                            #{evt.Evt_No} - {evt.Evt_Name}
                          </option>
                        ))
                      )}
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

            {/* 3. Print Buttons (Plain A4 & 2" Thermal) */}
            <div className="sm:col-span-3 pt-1 sm:pt-0 flex items-center gap-1.5">
              <button
                type="button"
                id="btn-print-ranking-sheets"
                onClick={() => {
                  setModalFormat('a4');
                  setShowPrintModal(true);
                }}
                className="flex-1 py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-900 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer whitespace-nowrap"
                title="Print Official Rankings Report on Plain A4 Paper"
              >
                <Printer className="w-3.5 h-3.5 text-amber-300" />
                <span>Plain A4</span>
              </button>
              <button
                type="button"
                id="btn-thermal-ranking-sheets"
                onClick={() => {
                  setModalFormat('thermal');
                  setShowPrintModal(true);
                }}
                className="py-2 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-xs flex items-center justify-center gap-1 transition-all shadow-md cursor-pointer whitespace-nowrap"
                title="Print Official Rankings on 2&quot; Roll Thermal Printer"
              >
                <Receipt className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-black hidden md:inline">2" Thermal</span>
              </button>
            </div>

          </div>
        </div>

        {/* ========================================================================= */}
        {/* COMPLETED & LOCKED BADGE                                                 */}
        {/* ========================================================================= */}
        {isAlreadyRanked && (
          <div className="pt-0.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-600 text-white font-black text-xs uppercase tracking-wider shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Event completed &amp; Locked</span>
            </span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SELECT EVENT FOR RANKING DROPDOWN                                         */}
        {/* Strictly only contains events where the final list has been generated     */}
        {/* ========================================================================= */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Select Event for Ranking:
            </label>
            <span className="text-[10px] font-bold text-slate-500">
              {eventsWithFinalList.length} Event(s) with Final List
            </span>
          </div>
          <div className="relative">
            <select
              value={eventsWithFinalList.some(e => Number(e.Evt_No) === Number(selectedEvtNo)) ? selectedEvtNo : (eventsWithFinalList[0]?.Evt_No ?? '')}
              onChange={(e) => setSelectedEvtNo(Number(e.target.value))}
              disabled={eventsWithFinalList.length === 0}
              className="w-full bg-white border border-[#94a3b8] rounded-lg px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden focus:border-blue-600 cursor-pointer appearance-none pr-8 shadow-2xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {eventsWithFinalList.length === 0 ? (
                <option value="">No events with final list generated yet</option>
              ) : (
                eventsWithFinalList.map((evt) => {
                  const res = results.find((r) => Number(r.eventNo) === Number(evt.Evt_No));
                  const isCompleted =
                    res?.completed ||
                    (res?.finalists || []).some((f: any) => f.position && f.position >= 1);
                  return (
                    <option key={evt.Evt_No} value={evt.Evt_No}>
                      #{evt.Evt_No} - {evt.Evt_Name} ({evt.Gender},{' '}
                      {evt.Height ? evt.Height.replace(/`/g, "'") : 'ALL'}){' '}
                      {isCompleted ? '✓ Completed (Locked)' : ''}
                    </option>
                  );
                })
              )}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* Empty State when no events have final lists generated */}
        {eventsWithFinalList.length === 0 ? (
          <div className="bg-white rounded-xl sm:rounded-2xl p-6 sm:p-10 text-center border-2 border-dashed border-amber-300 shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">
                No Final Lists Generated Yet
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto mt-1">
                Events must have their Final List prepared and promoted before entering official podium rankings. 
                Please visit the <strong>Hit / Final List</strong> section to qualify and promote athletes to the final.
              </p>
            </div>
            {onNavigateBackToHitList && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigateBackToHitList()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-98"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Go to Hit / Final List</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* BROAD JUMP RECORD COMPARISON BANNER (Only for Broad Jump events) */}
            {isBroadJump && (
              <div className="p-3 sm:p-4 rounded-xl border bg-linear-to-r from-amber-50 to-orange-50 border-amber-300 shadow-xs space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <h4 className="font-black text-xs sm:text-sm text-amber-950 uppercase tracking-wide">
                        Broad Jump Official Record Comparison
                      </h4>
                      <p className="text-[11px] text-amber-800 font-semibold">
                        Track individual athlete jump records &amp; compare against previous year meet benchmark.
                      </p>
                    </div>
                  </div>
                  {highestJumpAnalysis && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs self-start sm:self-auto ${
                      highestJumpAnalysis.isRecordBroken
                        ? 'bg-emerald-600 text-white animate-pulse'
                        : highestJumpAnalysis.comparison === 'equal'
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-200 text-amber-900 border border-amber-400'
                    }`}>
                      {highestJumpAnalysis.isRecordBroken ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>🏆 NEW RECORD BROKEN!</span>
                        </>
                      ) : highestJumpAnalysis.comparison === 'equal' ? (
                        <span>Benchmark Tied</span>
                      ) : (
                        <span>Benchmark Stands</span>
                      )}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium">
                  {/* Previous Record Benchmark */}
                  <div className="bg-white/80 rounded-lg p-2.5 border border-amber-200 flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Previous Year's Record Benchmark:
                    </span>
                    {previousRecord ? (
                      <div className="mt-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-base sm:text-lg font-black text-amber-900">
                            {formatJumpBenchmark(previousRecord.recordValue)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">
                            ({Math.floor(parseJumpToInches(previousRecord.recordValue) / 12)} feet {Math.round(parseJumpToInches(previousRecord.recordValue) % 12)} inch)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-700 font-semibold truncate mt-0.5">
                          by <span className="font-bold text-slate-900">{previousRecord.recordHolderName}</span> ({previousRecord.recordHolderClub || 'Club'}, {previousRecord.recordYear})
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[11px] mt-1">No previous record on file for this height category.</span>
                    )}
                  </div>

                  {/* Current Highest Jump & Comparison */}
                  <div className={`rounded-lg p-2.5 border flex flex-col justify-between ${
                    highestJumpAnalysis?.isRecordBroken
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-white/80 border-amber-200 text-slate-900'
                  }`}>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Current Meet Highest Jump:
                    </span>
                    {highestJumpAnalysis ? (
                      <div className="mt-1">
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className={`font-mono text-base sm:text-lg font-black ${highestJumpAnalysis.isRecordBroken ? 'text-emerald-700' : 'text-blue-900'}`}>
                            {formatJumpBenchmark(highestJumpAnalysis.recordValue)}
                          </span>
                          {previousRecord && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded whitespace-nowrap ${
                              highestJumpAnalysis.isRecordBroken
                                ? 'bg-emerald-600 text-white'
                                : highestJumpAnalysis.comparison === 'equal'
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-200 text-slate-800'
                            }`}>
                              {highestJumpAnalysis.isRecordBroken
                                ? `> Greater than benchmark (${formatJumpBenchmark(previousRecord.recordValue)})`
                                : highestJumpAnalysis.comparison === 'equal'
                                ? `= Equal to benchmark (${formatJumpBenchmark(previousRecord.recordValue)})`
                                : `< Less than benchmark (${formatJumpBenchmark(previousRecord.recordValue)})`}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-semibold truncate mt-0.5">
                          by <span className="font-bold text-slate-900">{highestJumpAnalysis.candidateName}</span> (Chest #{highestJumpAnalysis.chestNo}{highestJumpAnalysis.club ? ` • ${highestJumpAnalysis.club}` : ''})
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[11px] mt-1">Enter candidate jump records in the podium slots below to compare.</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PODIUM SLOTS */}

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

                  {/* Jump Record Input for Broad Jump */}
                  {isBroadJump && assignedChestNo !== null && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-600 uppercase whitespace-nowrap">
                          Jump:
                        </span>
                        {isAlreadyRanked ? (
                          <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-950 font-mono font-black text-xs border border-amber-300">
                            {formatJumpBenchmark(jumpRecords[assignedChestNo]) || jumpRecords[assignedChestNo] || '—'}
                          </span>
                        ) : (
                          <input
                            type="text"
                            placeholder="e.g. 16`-02``"
                            value={jumpRecords[assignedChestNo] || ''}
                            onChange={(e) => {
                              isDirtyRef.current = true;
                              setJumpRecords((prev) => ({
                                ...prev,
                                [assignedChestNo]: e.target.value,
                              }));
                            }}
                            className="w-24 sm:w-28 px-2 py-1 text-xs font-mono font-bold bg-white border border-[#94a3b8] rounded-md text-slate-900 focus:outline-hidden focus:border-blue-600 shadow-2xs"
                            title="Enter candidate jump measurement in 16`-02`` format (e.g. 16`-02``)"
                          />
                        )}
                      </div>
                      {jumpRecords[assignedChestNo] && previousRecord && (() => {
                        const enteredInches = parseJumpToInches(jumpRecords[assignedChestNo]);
                        const benchmarkInches = parseJumpToInches(previousRecord.recordValue);
                        if (enteredInches <= 0 || benchmarkInches <= 0) return null;
                        if (enteredInches > benchmarkInches) {
                          return (
                            <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 whitespace-nowrap">
                              &gt; {formatJumpBenchmark(previousRecord.recordValue)} (Record Broken)
                            </span>
                          );
                        } else if (enteredInches < benchmarkInches) {
                          return (
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 whitespace-nowrap">
                              &lt; {formatJumpBenchmark(previousRecord.recordValue)}
                            </span>
                          );
                        } else {
                          return (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 whitespace-nowrap">
                              = {formatJumpBenchmark(previousRecord.recordValue)} (Tied)
                            </span>
                          );
                        }
                      })()}
                    </div>
                  )}

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

                      {/* Jump Record Input for Broad Jump */}
                      {isBroadJump && assignedChestNo !== null && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-600 uppercase whitespace-nowrap">
                              Jump:
                            </span>
                            {isAlreadyRanked ? (
                              <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-950 font-mono font-black text-xs border border-amber-300">
                                {formatJumpBenchmark(jumpRecords[assignedChestNo]) || jumpRecords[assignedChestNo] || '—'}
                              </span>
                            ) : (
                              <input
                                type="text"
                                placeholder="e.g. 16`-02``"
                                value={jumpRecords[assignedChestNo] || ''}
                                onChange={(e) => {
                                  isDirtyRef.current = true;
                                  setJumpRecords((prev) => ({
                                    ...prev,
                                    [assignedChestNo]: e.target.value,
                                  }));
                                }}
                                className="w-24 sm:w-28 px-2 py-1 text-xs font-mono font-bold bg-white border border-[#94a3b8] rounded-md text-slate-900 focus:outline-hidden focus:border-blue-600 shadow-2xs"
                                title="Enter candidate jump measurement in 16`-02`` format (e.g. 16`-02``)"
                              />
                            )}
                          </div>
                          {jumpRecords[assignedChestNo] && previousRecord && (() => {
                            const enteredInches = parseJumpToInches(jumpRecords[assignedChestNo]);
                            const benchmarkInches = parseJumpToInches(previousRecord.recordValue);
                            if (enteredInches <= 0 || benchmarkInches <= 0) return null;
                            if (enteredInches > benchmarkInches) {
                              return (
                                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 whitespace-nowrap">
                                  &gt; {formatJumpBenchmark(previousRecord.recordValue)} (Record Broken)
                                </span>
                              );
                            } else if (enteredInches < benchmarkInches) {
                              return (
                                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 whitespace-nowrap">
                                  &lt; {formatJumpBenchmark(previousRecord.recordValue)}
                                </span>
                              );
                            } else {
                              return (
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 whitespace-nowrap">
                                  = {formatJumpBenchmark(previousRecord.recordValue)} (Tied)
                                </span>
                              );
                            }
                          })()}
                        </div>
                      )}

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
        </>
      )}
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
      </div> {/* END INTERACTIVE RANKING UI */}

      {/* ========================================================================= */}
      {/* PRINT PREVIEW MODAL (Plain A4 & 2" Thermal Roll Preview & Printing)       */}
      {/* ========================================================================= */}
      {showPrintModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPrintModal(false);
          }}
        >
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 text-slate-900 print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none print:overflow-visible print:p-0">
            
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900 text-white flex flex-col gap-2.5 border-b border-slate-800 print:hidden shrink-0">
              {/* Row 1: Title and Prominent Top-Right Highlighted 'X' Close Button */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-base truncate">Official Event Rankings Preview</h3>
                    <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                      Scope: {printScope === 'single' ? `Event #${singlePrintEvt}` : printScope === 'range' ? `Events #${rangeStart} to #${rangeEnd}` : `Events: ${customCsvInput}`} ({eventsToPrint.length} Event(s))
                    </p>
                  </div>
                </div>

                {/* Highlighted 'X' Close Button situated at top right corner */}
                <button
                  type="button"
                  id="btn-close-ranking-preview"
                  onClick={() => setShowPrintModal(false)}
                  className="flex items-center justify-center p-1.5 sm:p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-md transition-all cursor-pointer active:scale-95 shrink-0"
                  title="Close Preview (X)"
                  aria-label="Close Print Preview"
                >
                  <X className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>

              {/* Row 2: Left-aligned (Normal, Thermal, Print) | Right-aligned (58mm Thermal Page Setup) */}
              <div className="flex items-center justify-between gap-2 w-full">
                {/* Left Aligned: Normal, Thermal, Print */}
                <div className="flex items-center gap-1.5 sm:gap-2">
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
                      title="Normal"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Normal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalFormat('thermal')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                        modalFormat === 'thermal'
                          ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Thermal"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Thermal</span>
                    </button>
                  </div>

                  {/* Print Trigger */}
                  <button
                    type="button"
                    onClick={handleExecutePrint}
                    className={`px-2.5 sm:px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                      modalFormat === 'thermal'
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                    title="Print"
                  >
                    <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>Print</span>
                  </button>
                </div>

                {/* Right Aligned: 58mm Thermal Page Setup Button */}
                <button
                  type="button"
                  disabled={modalFormat === 'a4'}
                  onClick={() => setShowThermalSetup(true)}
                  className={`px-2 sm:px-2.5 py-1.5 rounded-lg border border-slate-700 transition-all flex items-center gap-1.5 text-xs font-bold ${
                    modalFormat === 'a4'
                      ? 'opacity-40 cursor-not-allowed bg-slate-800/60 text-slate-500'
                      : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 active:scale-98 cursor-pointer'
                  }`}
                  title={modalFormat === 'a4' ? "Thermal setup only available in Thermal mode" : "58mm Thermal Printer Page Setup"}
                >
                  <Sliders className={`w-3.5 h-3.5 ${modalFormat === 'a4' ? 'text-slate-500' : 'text-amber-400'}`} />
                  <span className="hidden sm:inline">58mm Setup</span>
                </button>
              </div>
            </div>

            {/* Scrollable Preview Canvas */}
            {modalFormat === 'thermal' ? (
              /* ================= 58MM THERMAL ROLL RECEIPT PREVIEW (EXACT MATCHING) ================= */
              <div className="p-4 sm:p-8 bg-slate-300 overflow-y-auto flex-1 flex flex-col items-center print:p-0 print:bg-white print:overflow-visible">
                <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5 print:hidden">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  <span>58mm Roll Preview ({thermalConfig.printableWidth}mm net printable)</span>
                </div>
                <div
                  className="receipt thermal-printable-sheet bg-white text-black p-3 shadow-2xl rounded-xs select-none print:shadow-none print:p-0"
                  style={{
                    width: `${thermalConfig.printableWidth}mm`,
                    maxWidth: `${thermalConfig.printableWidth}mm`,
                    paddingLeft: `${thermalConfig.marginHorizontal}mm`,
                    paddingRight: `${thermalConfig.marginHorizontal}mm`,
                    paddingTop: `${thermalConfig.topMargin || 5}mm`,
                    paddingBottom: `${thermalConfig.feedBeforeCut}mm`,
                    fontSize: `${thermalConfig.fontSize}px`,
                    lineHeight: thermalConfig.lineSpacing,
                    fontFamily: 'Consolas, "Courier New", monospace',
                  }}
                >
                  {eventsToPrint.length === 0 ? (
                    <div className="py-4 text-center text-[9px] italic">
                      No events match print scope.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {eventsToPrint.map((evt) => {
                        const evtRes = results.find((r) => Number(r.eventNo) === Number(evt.Evt_No));
                        const rankedFinalists = (evtRes?.winners && evtRes.winners.length > 0 ? evtRes.winners : (evtRes?.finalists || []))
                          .filter((f) => (f.position || 0) > 0)
                          .sort((a, b) => (a.position || 0) - (b.position || 0));

                        const formatHeightStr = (hStr?: string) => {
                          if (!hStr) return 'ALL';
                          const clean = hStr.trim().toUpperCase();
                          if (clean === 'ALL') return 'ALL';
                          return clean.replace(/[`']/g, "'").replace(/''|``|"/g, "''");
                        };

                        const getGenderAbbrStr = (gender?: string) => {
                          if (!gender) return 'ALL';
                          const g = gender.trim().toUpperCase();
                          if (g.startsWith('BOY') || g === 'B') return 'B';
                          if (g.startsWith('GIRL') || g === 'G') return 'G';
                          if (g.startsWith('CHILD') || g === 'C') return 'C';
                          return 'ALL';
                        };

                        const getRankPosLabel = (pos?: number, fallbackIdx?: number) => {
                          const p = (pos && pos > 0) ? pos : ((fallbackIdx !== undefined) ? fallbackIdx + 1 : 1);
                          if (p === 1) return '1st';
                          if (p === 2) return '2nd';
                          if (p === 3) return '3rd';
                          return `${p}th`;
                        };

                        const heightDisp = formatHeightStr(evt.Height);
                        const genderAbbr = getGenderAbbrStr(evt.Gender);
                        const isBroadJump = (evt.Evt_Name || '').toUpperCase().includes('BROAD JUMP');

                        return (
                          <div key={evt.Evt_No} className="avoid-break pt-4 pb-2 border-b border-dashed border-black last:border-b-0 text-black leading-tight">
                            {/* Header: same as Candidate list */}
                            {renderThermalHeader()}

                            {/* Dashed Line */}
                            <div className="border-b border-dashed border-black my-1"></div>

                            {/* Event Title Line: broken into two lines */}
                            <div className="text-center py-0.5 tracking-tight text-black leading-tight">
                              <div className="font-bold text-[10px] uppercase">RANKING LIST</div>
                              <div className="text-[8.5px] font-semibold mt-0.5 uppercase break-words">
                                EVT #{evt.Evt_No}: {evt.Evt_Name} ({heightDisp} • {genderAbbr})
                              </div>
                            </div>

                            {/* Dashed Line */}
                            <div className="border-b border-dashed border-black my-1"></div>

                            {/* Table Column Headers */}
                            <div className="flex items-center text-[9px] font-bold text-black uppercase pt-1">
                              <span className={isBroadJump ? "w-7 text-center shrink-0" : "w-8 text-center shrink-0"}>Rank</span>
                              <span className={isBroadJump ? "w-7 text-center shrink-0" : "w-8 text-center shrink-0"}>CH#</span>
                              <span className={isBroadJump ? "flex-1 text-left pl-1" : "flex-1 text-left pl-2"}>ATHLETE (CLUB)</span>
                              {isBroadJump && (
                                <span className="w-14 text-right pr-0.5 shrink-0">Jump</span>
                              )}
                            </div>
                            <div className="border-b-2 border-black mb-1 mt-0.5"></div>

                            {/* Ranked Athletes List with dotted separators */}
                            <div className="space-y-0 text-black">
                              {rankedFinalists.length === 0 ? (
                                <div className="text-[8px] italic text-center py-2 text-slate-600">
                                  No rankings declared yet for this event.
                                </div>
                              ) : (
                                rankedFinalists.map((f, idx) => {
                                  const club = getClubInfo(f.club || '');
                                  const isSelf = (f.club || '').trim().toUpperCase() === 'SELF';
                                  const clubNameStr = isSelf ? '' : (club?.name || f.club || '');
                                  const athleteDisplay = clubNameStr ? `${f.candidateName} (${clubNameStr})` : f.candidateName;
                                  return (
                                    <div key={f.chestNo}>
                                      <div className="flex items-center text-[9.5px] py-1 text-black leading-tight">
                                        <span className={isBroadJump ? "w-7 text-center font-normal shrink-0" : "w-8 text-center font-normal shrink-0"}>
                                          {getRankPosLabel(f.position, idx)}
                                        </span>
                                        <span className={isBroadJump ? "w-7 text-center font-bold shrink-0" : "w-8 text-center font-bold shrink-0"}>
                                          {f.chestNo}
                                        </span>
                                        <span className={isBroadJump ? "flex-1 text-left font-normal uppercase truncate pl-1" : "flex-1 text-left font-normal uppercase truncate pl-2"}>
                                          {athleteDisplay}
                                        </span>
                                        {isBroadJump && (
                                          <span className="w-14 text-right font-mono text-[8.5px] font-normal shrink-0">
                                            {f.jumpRecord || f.resultValue || '—'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="border-b border-dotted border-black/80"></div>
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {/* Broad Jump Record Callout for Thermal Print */}
                            {isBroadJump && (() => {
                              const prevRecord = settings.broadJumpPreviousRecords?.[Number(evt.Evt_No)] ||
                                (evtRes?.highestRecord?.previousRecordValue ? {
                                  recordValue: evtRes.highestRecord.previousRecordValue,
                                  recordHolderName: evtRes.highestRecord.previousRecordHolder || 'Record Holder',
                                  recordHolderClub: '',
                                  recordYear: evtRes.highestRecord.previousRecordYear || '',
                                } : null);

                              if (!prevRecord) return null;

                              const prevInches = parseJumpToInches(prevRecord.recordValue);
                              let maxJumpInches = 0;
                              rankedFinalists.forEach(r => {
                                const jInches = parseJumpToInches(r.jumpRecord || (r as any).resultValue);
                                if (jInches > maxJumpInches) maxJumpInches = jInches;
                              });
                              if (evtRes?.highestRecord?.recordValue) {
                                const hrInches = parseJumpToInches(evtRes.highestRecord.recordValue);
                                if (hrInches > maxJumpInches) maxJumpInches = hrInches;
                              }
                              const isBroken = prevInches > 0 ? (maxJumpInches > prevInches) : (maxJumpInches > 0);
                              const recFlag = isBroken ? 'Y' : 'N';
                              const formattedPrev = formatJumpBenchmark(prevRecord.recordValue) || prevRecord.recordValue;
                              const holderClub = prevRecord.recordHolderClub ? ` (${prevRecord.recordHolderClub})` : '';
                              const holderYear = prevRecord.recordYear ? `, ${prevRecord.recordYear}` : '';

                              return (
                                <div className="py-1 text-[8.5px] font-bold text-center text-black leading-tight border-b border-dotted border-black/80">
                                  New record: {recFlag} | Prev: {formattedPrev} by {prevRecord.recordHolderName}{holderClub}{holderYear}
                                </div>
                              );
                            })()}

                            {/* Footer: Dashed Line + App Name Only (No other footer info) */}
                            {renderThermalFooter()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ================= PLAIN A4 PAPER SHEET (REDESIGNED AS PER RankingA4.png) ================= */
              <div className="p-2 sm:p-6 overflow-y-auto flex-1 bg-slate-200/80 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div 
                  className="a4-printable-sheet bg-white w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-10 shadow-md border-0 outline-none text-black font-sans print:p-0 print:m-0 print:border-none print:shadow-none print:outline-none print:bg-white print:max-w-none print:min-h-0 space-y-6"
                  id="printable-rankings-content"
                >
                  {/* Top Header: Logo + Club & Meet Title on Left | FINAL RANKINGS on Right */}
                  <div className="flex items-center justify-between pb-2 mb-1 text-black">
                    <div className="flex items-center gap-3">
                      <img 
                        src={settings.registeredClubLogo || '/icon.png'} 
                        alt="Club Logo" 
                        className="w-12 h-12 object-contain rounded-full shrink-0"
                      />
                      <div className="text-left">
                        <h1 className="text-xl sm:text-2xl font-black text-black uppercase tracking-tight leading-tight">
                          {(settings.registeredClubName || settings.organizer || 'SASHTITALA AGRANI').toUpperCase()}
                        </h1>
                        <h2 className="text-xs sm:text-sm font-bold text-black uppercase tracking-wide leading-tight mt-0.5">
                          {(settings.ordinalTitle || '47TH ANNUAL SPORTS MEET 2027').toUpperCase()}
                        </h2>
                      </div>
                    </div>
                    <div className="text-right">
                      <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-black">
                        FINAL RANKINGS
                      </h2>
                    </div>
                  </div>

                  {/* Thick Horizontal Divider */}
                  <div className="border-b-2 border-black mb-4"></div>

                  {/* Print selected events */}
                  {eventsToPrint.length === 0 ? (
                    <div className="p-6 text-center text-black font-semibold text-xs sm:text-sm">
                      No events match the selected print filter.
                    </div>
                  ) : (
                    eventsToPrint.map((evt) => {
                      const evtRes = results.find((r) => Number(r.eventNo) === Number(evt.Evt_No));
                      const rankedFinalists = (evtRes?.winners && evtRes.winners.length > 0 ? evtRes.winners : (evtRes?.finalists || []))
                        .filter((f) => (f.position || 0) > 0)
                        .sort((a, b) => (a.position || 0) - (b.position || 0));

                      const cleanHeight = evt.Height ? (evt.Height.toUpperCase() === 'ALL' ? 'ALL' : evt.Height.replace(/[`']/g, "'").replace(/''|``|"/g, '"')) : 'ALL';
                      const isBroadJump = (evt.Evt_Name || '').toUpperCase().includes('BROAD JUMP');

                      return (
                        <div 
                          key={evt.Evt_No} 
                          className="bg-white p-0 border-0 outline-none shadow-none text-black font-sans avoid-break"
                        >
                          {/* Event Header Box */}
                          <div className="border border-slate-300 rounded-xs py-1.5 px-3 mb-2 flex items-center text-sm font-sans">
                            <span className="text-black font-normal mr-4">Event:</span>
                            <span className="font-bold text-black mr-6">{evt.Evt_No}</span>
                            <span className="font-bold text-black uppercase">
                              {evt.Evt_Name} / {cleanHeight} / {evt.Gender}
                            </span>
                          </div>

                          {/* Rankings Table as per RankingA4.png without box borders and with underlined headers */}
                          <table className="w-full text-left text-sm border-collapse text-black mb-3 font-sans">
                            <thead>
                              <tr className="text-black font-bold">
                                <th className="pb-1 text-left w-24 font-bold underline">Position</th>
                                <th className="pb-1 text-left w-24 font-bold underline">Chest No</th>
                                <th className="pb-1 text-left font-bold underline">Name (Club name)</th>
                                {isBroadJump && (
                                  <th className="pb-1 text-left w-28 font-bold underline">Jump</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {rankedFinalists.length === 0 ? (
                                <tr>
                                  <td colSpan={isBroadJump ? 4 : 3} className="py-2 text-slate-500 italic text-xs">
                                    No rankings recorded yet for this event.
                                  </td>
                                </tr>
                              ) : (
                                rankedFinalists.map((f, idx) => {
                                  const club = getClubInfo(f.club || '');
                                  const isSelf = (f.club || '').trim().toUpperCase() === 'SELF';
                                  const clubNameStr = isSelf ? '' : (club?.name || f.club || '');
                                  const clubText = clubNameStr ? `(${clubNameStr})` : '';
                                  const posLabel = getPositionWord(f.position, idx);

                                  return (
                                    <tr key={f.chestNo} className="text-sm text-black">
                                      <td className="py-1 text-left font-normal text-black w-24">
                                        {posLabel}
                                      </td>
                                      <td className="py-1 text-left font-bold text-black w-24">
                                        {f.chestNo}
                                      </td>
                                      <td className="py-1 text-left font-normal text-black uppercase">
                                        {f.candidateName} {clubText}
                                      </td>
                                      {isBroadJump && (
                                        <td className="py-1 text-left font-normal text-black w-28 font-mono">
                                          {formatJumpBenchmark(f.jumpRecord || (f as any).resultValue) || f.jumpRecord || (f as any).resultValue || '—'}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* 58mm Thermal Printer Page Setup Modal */}
      <ThermalPageSetupModal 
        isOpen={showThermalSetup} 
        onClose={() => setShowThermalSetup(false)} 
        settings={settings} 
      />

    </div>
  );
};

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Lock,
  Sliders,
  RefreshCw,
  Bluetooth
} from 'lucide-react';
import { ThermalPageSetupModal } from './ThermalPageSetupModal';
import { 
  ThermalPrintSettings, 
  getThermalSettings, 
  generateThermalPrintCSS,
  formatThermalEventSuffix 
} from '../utils/thermalSettings';
import { 
  printDirectlyToThermalPrinter, 
  isWebBluetoothSupported, 
  isMobileClient 
} from '../utils/thermalBluetoothPrint';
import { ThermalLogo } from './ThermalLogo';
import { ThermalTwoLineRecord } from './ThermalTwoLineRecord';
import { receiptDomToOfflineHtmlBlob } from '../utils/thermalLogo';
import { parseJumpToInches, formatJumpBenchmark } from './RankingList';
import {
  WhatsAppIcon,
  buildServerReportFileName,
  shareThermalHtmlBlob,
} from '../utils/whatsappThermalReport';
import { ClubEchoPrintModal } from './ClubEchoPrintModal';
import {
  FirstPrintCategory,
  hasWarnedFirstPrint,
  markFirstPrintWarned,
} from '../utils/qualificationRules';

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
  onSaveSettings?: (settings: SportsMeetSettings) => Promise<void> | void;
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
  onSaveSettings,
}) => {
  // Only one event selection at a time
  const [selectedEvtNo, setSelectedEvtNo] = useState<number>(events[0]?.Evt_No || 0);

  // Qualify checkbox visibility: appears after clicking "Prepare Final List" or typing chest numbers
  const [showQualifyCheckbox, setShowQualifyCheckbox] = useState<boolean>(false);

  // Comma-separated qualifier chest numbers input inside the black ribbon
  const [qualifierChestInput, setQualifierChestInput] = useState<string>('');
  const [optimisticQualifiedSet, setOptimisticQualifiedSet] = useState<Set<number> | null>(null);
  const qualifierSaveTimerRef = useRef<number | null>(null);
  const latestDesiredSetRef = useRef<Set<number> | null>(null);
  const hasEditedInputForEventRef = useRef<boolean>(false);

  // Print Preview Modals
  const [printModalType, setPrintModalType] = useState<'hit' | 'final' | 'results' | null>(null);
  const [modalFormat, setModalFormat] = useState<'a4' | 'thermal'>('a4');
  const [thermalConfig, setThermalConfig] = useState<ThermalPrintSettings>(getThermalSettings());
  const [showThermalSetup, setShowThermalSetup] = useState<boolean>(false);
  const [echoPrintModalState, setEchoPrintModalState] = useState<{
    category: FirstPrintCategory;
    evtNos: number[];
    contextLabel: string;
  } | null>(null);

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
      if (e.key === 'Escape' && printModalType !== null) {
        setPrintModalType(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [printModalType]);

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
      .filter(
        (c) =>
          (c.selectedEvents || []).map(Number).includes(Number(selectedEvtNo)) &&
          !c.isCancelled &&
          c.status !== 'cancelled'
      )
      .sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
  }, [candidates, selectedEvtNo]);

  // Set of valid chest numbers belonging to the currently selected event
  const enrolledChestSet = useMemo(() => {
    return new Set<number>(enrolledCandidates.map((c) => Number(c.chestNo)));
  }, [enrolledCandidates]);

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

  // Unified participant list combining ALL enrolled candidates and qualification flags across ALL heats
  // Ensures selecting an event ALWAYS populates all candidates below (never truncated to 8 heat lanes)
  const mergedEventParticipants: HeatParticipant[] = useMemo(() => {
    const heatMap = new Map<number, HeatParticipant>();
    eventHeats.forEach((h) => {
      (h.participants || []).forEach((p) => {
        const ch = Number(p.chestNo);
        if (!ch || cancelledChestSet.has(ch)) return;
        const prev = heatMap.get(ch);
        heatMap.set(ch, {
          ...p,
          chestNo: ch,
          qualified: prev ? Boolean(prev.qualified || p.qualified) : Boolean(p.qualified),
        });
      });
    });

    const combinedMap = new Map<number, HeatParticipant>();
    enrolledCandidates.forEach((cand, idx) => {
      const ch = Number(cand.chestNo);
      const fromHeat = heatMap.get(ch);
      combinedMap.set(ch, {
        chestNo: ch,
        candidateName: cand.name,
        club: cand.club,
        lane: fromHeat?.lane || idx + 1,
        heatNumber: 1,
        qualified: fromHeat ? Boolean(fromHeat.qualified) : false,
      });
    });

    heatMap.forEach((p, ch) => {
      if (!combinedMap.has(ch)) {
        combinedMap.set(ch, { ...p, heatNumber: 1 });
      }
    });

    return Array.from(combinedMap.values())
      .sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0))
      .map((p, idx) => ({ ...p, lane: idx + 1 }));
  }, [eventHeats, enrolledCandidates, cancelledChestSet]);

  // Effective finalists:
  // 1) Saved finalists if already promoted
  // 2) If event heats exist, qualified participants across all heats (or all merged participants)
  // 3) Enrolled candidates for this event (standard direct final flow)
  const effectiveFinalists: FinalParticipant[] = useMemo(() => {
    if (savedFinalists.length > 0) return savedFinalists;
    if (eventHeats.length > 0 && mergedEventParticipants.length > 0) {
      const quals = mergedEventParticipants.filter((p) => p.qualified);
      const list = quals.length > 0 ? quals : mergedEventParticipants;
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
  }, [savedFinalists, eventHeats, mergedEventParticipants, enrolledCandidates]);

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

  // Track qualified participants across all heats (or optimistic set while typing)
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

    if (optimisticQualifiedSet !== null) {
      return mergedEventParticipants
        .filter((p) => optimisticQualifiedSet.has(Number(p.chestNo)))
        .map((p) => ({ ...p, qualified: true }));
    }

    if (eventHeats.length === 0) return [];
    return mergedEventParticipants.filter((p) => p.qualified);
  }, [isAlreadyPromoted, savedFinalists, optimisticQualifiedSet, eventHeats, mergedEventParticipants]);

  // Initialize qualifier chest input when switching events
  useEffect(() => {
    if (qualifierSaveTimerRef.current) {
      window.clearTimeout(qualifierSaveTimerRef.current);
      qualifierSaveTimerRef.current = null;
    }
    latestDesiredSetRef.current = null;
    setOptimisticQualifiedSet(null);
    hasEditedInputForEventRef.current = false;

    const heatsForEvt = heats.filter((h) => Number(h.eventNo) === Number(selectedEvtNo));
    const qualChests = new Set<number>();
    heatsForEvt.forEach((h) => {
      (h.participants || []).forEach((p) => {
        const ch = Number(p.chestNo);
        if (p.qualified && ch && !cancelledChestSet.has(ch)) {
          qualChests.add(ch);
        }
      });
    });

    const sortedChests = Array.from(qualChests).sort((a, b) => a - b);
    setQualifierChestInput(sortedChests.join(', '));
    setShowQualifyCheckbox(false);
  }, [selectedEvtNo]);

  // Populate qualifier input if heats load asynchronously before user starts editing this event
  useEffect(() => {
    if (hasEditedInputForEventRef.current) return;
    if (optimisticQualifiedSet !== null || latestDesiredSetRef.current !== null) return;

    const heatsForEvt = heats.filter((h) => Number(h.eventNo) === Number(selectedEvtNo));
    const qualChests = new Set<number>();
    heatsForEvt.forEach((h) => {
      (h.participants || []).forEach((p) => {
        const ch = Number(p.chestNo);
        if (p.qualified && ch && !cancelledChestSet.has(ch)) {
          qualChests.add(ch);
        }
      });
    });
    const nextStr = Array.from(qualChests).sort((a, b) => a - b).join(', ');
    if (nextStr !== qualifierChestInput) {
      setQualifierChestInput(nextStr);
    }
  }, [heats, selectedEvtNo, cancelledChestSet]);

  useEffect(() => {
    return () => {
      if (qualifierSaveTimerRef.current) {
        window.clearTimeout(qualifierSaveTimerRef.current);
      }
    };
  }, []);

  // Validate comma-separated chest numbers entered in the black ribbon input box
  const hasInvalidChestInput = useMemo(() => {
    if (!qualifierChestInput.trim()) return false;
    const tokens = qualifierChestInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return tokens.some((token) => !/^\d+$/.test(token) || !enrolledChestSet.has(Number(token)));
  }, [qualifierChestInput, enrolledChestSet]);

  // Can print final list: true when event has been promoted to final OR for direct final events
  const canPrintFinalList = (isAlreadyPromoted && savedFinalists.length > 0) || (!isHitRequired && enrolledCandidates.length > 0);

  const getShortGender = (gender?: string): string => {
    if (gender === 'BOYS') return 'B';
    if (gender === 'GIRLS') return 'G';
    return 'C';
  };

  // Prepare formatted heading
  const getDynamicEventHeading = (evt?: SportEvent) => {
    if (!evt) return '';
    const h = evt.Height ? evt.Height.replace(/`/g, "'") : 'ALL';
    return `Event #${evt.Evt_No}: ${evt.Evt_Name} (${getShortGender(evt.Gender)} • ${h})`;
  };

  const getFormattedHeightGender = (evt?: SportEvent) => {
    if (!evt) return '';
    const h = evt.Height ? evt.Height.replace(/`/g, "'") : 'ALL';
    return `${getShortGender(evt.Gender)} • ${h}`;
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

    // Always ensure a single all-at-once heat exists containing ALL enrolled candidates for this event
    if (eventHeats.length === 0) {
      const participants: HeatParticipant[] = enrolledCandidates.map((cand, idx) => ({
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
    } else if (
      eventHeats.length > 1 ||
      (eventHeats[0]?.participants?.length || 0) < mergedEventParticipants.length
    ) {
      await onSaveHeat({
        ...eventHeats[0],
        participants: mergedEventParticipants,
      });
      for (const extraHeat of eventHeats.slice(1)) {
        await onDeleteHeat(extraHeat.id);
      }
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

  // Persist a specific set of qualified chest numbers onto the event's unified heat
  const persistQualifiedChestSet = async (nextSet: Set<number>) => {
    const participants: HeatParticipant[] = mergedEventParticipants.map((p, idx) => ({
      ...p,
      lane: idx + 1,
      heatNumber: 1,
      qualified: nextSet.has(Number(p.chestNo)),
    }));

    if (eventHeats.length > 0) {
      await onSaveHeat({
        ...eventHeats[0],
        participants,
      });
      for (const extraHeat of eventHeats.slice(1)) {
        await onDeleteHeat(extraHeat.id);
      }
    } else {
      await onSaveHeat({
        eventNo: selectedEvtNo,
        heatNumber: 1,
        participants,
        status: 'scheduled',
      });
    }
    setOptimisticQualifiedSet(null);
  };

  // Handle typing/deleting comma-separated qualified chest numbers in the black ribbon box
  const handleQualifierInputChange = (rawValue: string) => {
    hasEditedInputForEventRef.current = true;
    setQualifierChestInput(rawValue);

    const tokens = rawValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const validSet = new Set<number>();
    tokens.forEach((token) => {
      if (/^\d+$/.test(token)) {
        const ch = Number(token);
        if (enrolledChestSet.has(ch)) {
          validSet.add(ch);
        }
      }
    });

    if (validSet.size > 0 || eventHeats.length > 0) {
      setShowQualifyCheckbox(true);
    }

    setOptimisticQualifiedSet(validSet);
    latestDesiredSetRef.current = validSet;

    if (qualifierSaveTimerRef.current) {
      window.clearTimeout(qualifierSaveTimerRef.current);
    }
    qualifierSaveTimerRef.current = window.setTimeout(() => {
      qualifierSaveTimerRef.current = null;
      if (latestDesiredSetRef.current) {
        persistQualifiedChestSet(latestDesiredSetRef.current);
        latestDesiredSetRef.current = null;
      }
    }, 220);
  };

  const handleQualifierInputBlur = () => {
    if (qualifierSaveTimerRef.current && latestDesiredSetRef.current) {
      window.clearTimeout(qualifierSaveTimerRef.current);
      qualifierSaveTimerRef.current = null;
      const desired = latestDesiredSetRef.current;
      latestDesiredSetRef.current = null;
      persistQualifiedChestSet(desired);
    }
  };

  // Toggle qualification status for a participant (always saves full merged participant list)
  const handleToggleQualify = async (chestNo: number) => {
    if (isRankingPrepared) {
      alert(`Event #${selectedEvtNo} ranking has already been prepared and completed. Qualification edits are restricted.`);
      return;
    }

    if (isAlreadyPromoted) {
      alert(`Event #${selectedEvtNo} has already been promoted to the Final List. Further qualification edits are locked.`);
      return;
    }

    hasEditedInputForEventRef.current = true;
    const chNum = Number(chestNo);
    const currentQualSet = new Set<number>();
    if (optimisticQualifiedSet !== null) {
      optimisticQualifiedSet.forEach((n) => currentQualSet.add(n));
    } else if (eventHeats.length > 0) {
      mergedEventParticipants.forEach((p) => {
        if (p.qualified) currentQualSet.add(Number(p.chestNo));
      });
    } else if (!isHitRequired) {
      mergedEventParticipants.forEach((p) => currentQualSet.add(Number(p.chestNo)));
    }

    const willBeChecked = !currentQualSet.has(chNum);
    if (willBeChecked) {
      currentQualSet.add(chNum);
    } else {
      currentQualSet.delete(chNum);
    }

    // Keep comma-separated textbox synchronized with row checkbox toggles
    const existingTokens = qualifierChestInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (willBeChecked) {
      if (!existingTokens.some((t) => /^\d+$/.test(t) && Number(t) === chNum)) {
        existingTokens.push(String(chNum));
      }
      setQualifierChestInput(existingTokens.join(', '));
    } else {
      const nextTokens = existingTokens.filter((t) => !(/^\d+$/.test(t) && Number(t) === chNum));
      setQualifierChestInput(nextTokens.join(', '));
    }

    setShowQualifyCheckbox(true);
    setOptimisticQualifiedSet(currentQualSet);
    if (qualifierSaveTimerRef.current) {
      window.clearTimeout(qualifierSaveTimerRef.current);
      qualifierSaveTimerRef.current = null;
    }
    latestDesiredSetRef.current = null;
    await persistQualifiedChestSet(currentQualSet);
  };

  const toggleParticipantQualified = async (heat: EventHeat, chestNo: number) => {
    await handleToggleQualify(chestNo);
  };

  // "Promote to Final" action
  const handleSendToFinal = async () => {
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

    if (qualifierSaveTimerRef.current && latestDesiredSetRef.current) {
      window.clearTimeout(qualifierSaveTimerRef.current);
      qualifierSaveTimerRef.current = null;
      const desired = latestDesiredSetRef.current;
      latestDesiredSetRef.current = null;
      await persistQualifiedChestSet(desired);
    }

    onPromoteToFinal(selectedEvtNo, qualifiedParticipants);
  };

  const [isDirectPrinting, setIsDirectPrinting] = useState<boolean>(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState<boolean>(false);
  const [directPrintStatus, setDirectPrintStatus] = useState<string | null>(null);
  const thermalModalSheetRef = useRef<HTMLDivElement | null>(null);
  const offscreenThermalShareRef = useRef<HTMLDivElement | null>(null);

  // Trigger print: Direct Bluetooth thermal on mobile when in thermal mode, without opening any other mobile app!
  const executeActualPrint = async () => {
    if (modalFormat === 'thermal') {
      const receiptEl = document.querySelector('.receipt') as HTMLElement | null;

      // On mobile devices (or whenever Web Bluetooth is available), send directly to the thermal printer
      if (isWebBluetoothSupported() || isMobileClient()) {
        try {
          setIsDirectPrinting(true);
          setDirectPrintStatus('Connecting directly to thermal printer...');
          const result = await printDirectlyToThermalPrinter(receiptEl, thermalConfig);
          if (result.success) {
            setDirectPrintStatus(result.message);
            setTimeout(() => setDirectPrintStatus(null), 4000);
          } else {
            setDirectPrintStatus(result.message);
            setTimeout(() => setDirectPrintStatus(null), 3000);
          }
        } catch (err: any) {
          console.warn('Bluetooth thermal print fallback:', err?.message || err);
          window.print();
          setDirectPrintStatus('Printed via print dialog (Bluetooth unavailable in this frame)');
          setTimeout(() => setDirectPrintStatus(null), 4000);
        } finally {
          setIsDirectPrinting(false);
        }
        return;
      }
    }

    // Default system print for desktop or A4 mode
    window.print();
  };

  const handleExecutePrint = async () => {
    const isClubEchoOn = settings?.clientResponseEnabled !== false;
    if (isClubEchoOn) {
      if (printModalType === 'hit' && isHitRequired && !hasWarnedFirstPrint('hit', selectedEvtNo)) {
        setEchoPrintModalState({
          category: 'hit',
          evtNos: [selectedEvtNo],
          contextLabel: `Event #${selectedEvtNo}${currentEvent?.Evt_Name ? `: ${currentEvent.Evt_Name}` : ''} — Hit List`,
        });
        return;
      }
      if (printModalType === 'final' && !isHitRequired && !hasWarnedFirstPrint('direct-final', selectedEvtNo)) {
        setEchoPrintModalState({
          category: 'direct-final',
          evtNos: [selectedEvtNo],
          contextLabel: `Event #${selectedEvtNo}${currentEvent?.Evt_Name ? `: ${currentEvent.Evt_Name}` : ''} — Direct Final List`,
        });
        return;
      }
    }

    await executeActualPrint();
  };

  // Trigger WhatsApp share with complete white-page offline HTML thermal report
  const handleShareWhatsApp = async (type: 'hit' | 'final' | 'results') => {
    if (!currentEvent) return;
    const targetEl =
      (modalFormat === 'thermal' ? thermalModalSheetRef.current : offscreenThermalShareRef.current) ||
      (document.querySelector('.receipt') as HTMLElement | null);

    const reportKind = type === 'results' ? 'ranking' : type;
    const reportLabel = type === 'hit' ? 'Hit List' : type === 'final' ? 'Final List' : 'Ranking List';
    const fileName = buildServerReportFileName(reportKind, {
      eventNo: currentEvent.Evt_No,
      extension: 'html',
    });
    const docTitle = fileName.replace(/\.html$/i, '');

    if (!targetEl) {
      setDirectPrintStatus(`Unable to locate ${reportLabel} thermal sheet for offline HTML export.`);
      setTimeout(() => setDirectPrintStatus(null), 4000);
      return;
    }

    setIsSharingWhatsApp(true);
    setDirectPrintStatus(`Generating offline HTML for ${reportLabel}...`);

    try {
      const htmlBlob = await receiptDomToOfflineHtmlBlob(targetEl, {
        title: docTitle,
        printableWidthMm: thermalConfig.printableWidth,
      });
      if (!htmlBlob) {
        setDirectPrintStatus(`Failed to generate offline HTML for ${reportLabel}.`);
        setTimeout(() => setDirectPrintStatus(null), 4000);
        return;
      }
      const res = await shareThermalHtmlBlob(htmlBlob, fileName, docTitle);
      if (!res.cancelled) {
        setDirectPrintStatus(res.message);
        setTimeout(() => setDirectPrintStatus(null), 5000);
      } else {
        setDirectPrintStatus(null);
      }
    } finally {
      setIsSharingWhatsApp(false);
    }
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

  // Thermal header: inline logo beside club name, ordinal below centered
  const renderThermalHeader = (specificClubName?: string) => {
    const clubDisplayName = getThermalClubName(specificClubName);
    const clubLogo = getThermalClubLogo(specificClubName);

    return (
      <div className="w-full pb-1 mb-1 border-b border-dashed border-black pt-1">
        <div className="flex items-center justify-center gap-1.5 leading-tight flex-wrap text-center">
          <ThermalLogo
            src={clubLogo}
            alt="Club Logo"
            className="thermal-header-logo w-5 h-5 shrink-0 object-contain"
            rasterSizePx={64}
          />
          <span className="thermal-header-club font-bold uppercase tracking-tight text-black break-words">
            {clubDisplayName}
          </span>
        </div>
        <div className="thermal-ordinal-title font-normal text-black leading-tight mt-0.5 break-words text-center">
          {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
        </div>
      </div>
    );
  };

  // Thermal footer: Brand logo and brand name + timestamp (no top dashed border)
  const renderThermalFooter = () => {
    return (
      <div className="w-full text-center pt-1.5 mt-1 text-black">
        <div className="flex items-center justify-center gap-1 leading-tight flex-wrap">
          <ThermalLogo
            src="/icon.png"
            alt="eSports Logo"
            className="thermal-footer-logo w-3.5 h-3.5 shrink-0 object-contain"
            rasterSizePx={48}
          />
          <span className="thermal-footer-brand font-semibold tracking-tight text-black break-words">
            eSports-Sport Management
          </span>
        </div>
        <div className="thermal-footer-time text-black leading-tight mt-0.5 break-words">
          {currentTimestamp}
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Scoped Dynamic Print Stylesheet: Ensures complete isolation and precise formatting */}
      {modalFormat === 'thermal' ? (
        <style>{generateThermalPrintCSS(thermalConfig)}</style>
      ) : (
        <style>{`
          @media print {
            header, nav, footer, .print-hidden-element {
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

      {/* WRAPPER FOR ALL INTERACTIVE HITLIST UI: Completely hidden on print so web page NEVER appears */}
      <div className={`space-y-4 ${printModalType !== null ? 'print:hidden' : ''}`}>

      {/* ========================================================================= */}
      {/* 1. FIXED ACTION BUTTONS DIRECTLY ON PAGE BODY (NO BLACK SECTION)          */}
      {/* ========================================================================= */}
      <div className="sticky top-[45px] sm:top-[49px] lg:top-[86px] z-30 bg-slate-100/95 backdrop-blur-xs -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 py-1.5 print:hidden">
        <div className="flex items-center justify-between gap-2">
          {(() => {
            const isPromoteVisible = !isRankingPrepared && !isAlreadyPromoted && qualifiedParticipants.length > 0;
            const isMakeFinalDisabled = enrolledCandidates.length === 0 || isAlreadyPromoted || isRankingPrepared;
            const isMeritDisabled = isRankingPrepared || !isAlreadyPromoted;

            return (
              <>
                {/* LEFT: Make Final List */}
                <button
                  type="button"
                  id="btn-prepare-final-list"
                  onClick={() => handlePrepareFinalList()}
                  disabled={isMakeFinalDisabled}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm whitespace-nowrap ${
                    isRankingPrepared
                      ? 'bg-emerald-600 text-white border border-emerald-700 cursor-default animate-pulse'
                      : isMakeFinalDisabled
                      ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-70'
                      : showQualifyCheckbox
                      ? `bg-amber-300 ring-2 ring-amber-500 text-slate-950 border border-amber-400 cursor-pointer active:scale-98 ${!isPromoteVisible ? 'animate-pulse' : ''}`
                      : `bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-500/60 cursor-pointer active:scale-98 ${!isPromoteVisible ? 'animate-pulse' : ''}`
                  }`}
                  title={
                    isRankingPrepared
                      ? 'Event ranking completed. Further final list preparation is restricted.'
                      : isAlreadyPromoted
                      ? 'Final list already prepared and promoted.'
                      : 'Make final list, auto scroll down and enable qualify checkboxes'
                  }
                >
                  <Shuffle className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
                  <span>
                    {isRankingPrepared ? 'Completed' : isAlreadyPromoted ? 'Final Prepared' : 'Make Final List'}
                  </span>
                </button>

                {/* RIGHT: Promote button (when unhidden) OR Prepare Merit List -> (mutually exclusive) */}
                {isPromoteVisible ? (
                  <button
                    type="button"
                    id="btn-promote-to-final"
                    onClick={handleSendToFinal}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer animate-pulse whitespace-nowrap"
                    title="Promote checked qualifiers to Final List"
                  >
                    <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>Promote ({qualifiedParticipants.length})</span>
                  </button>
                ) : onNavigateToRanking ? (
                  <button
                    type="button"
                    id="btn-shift-to-rankings"
                    onClick={() => {
                      if (!isMeritDisabled) {
                        onNavigateToRanking(selectedEvtNo);
                      }
                    }}
                    disabled={isMeritDisabled}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm whitespace-nowrap ${
                      !isMeritDisabled
                        ? 'bg-indigo-600 hover:bg-indigo-500 border border-indigo-700 text-white cursor-pointer active:scale-98 ring-2 ring-indigo-300'
                        : 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-70'
                    }`}
                    title={
                      isRankingPrepared
                        ? 'Disabled: Ranking has already been prepared for this event.'
                        : isAlreadyPromoted
                        ? 'Open Ranking & Points page to prepare merit list'
                        : 'Disabled: Promote finalists to prepare the Final List first'
                    }
                  >
                    <Trophy className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${!isMeritDisabled ? 'text-amber-300' : 'text-slate-400'}`} />
                    <span>Prepare Merit List</span>
                    <ArrowRight className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${!isMeritDisabled ? 'text-white' : 'text-slate-400'}`} />
                  </button>
                ) : null}
              </>
            );
          })()}
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
            <h3 className="text-xs sm:text-sm font-black tracking-wide text-amber-400">
              Click/Tap to select Event
            </h3>
          </div>
        </div>

        {/* Thumbnails Grid: 2 columns on Mobile, 3 on sm, 4 on md, 6 on lg */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 sm:gap-2">
          {events.map((evt) => {
            const isSelected = selectedEvtNo === evt.Evt_No;
            const count = candidates.filter(
              (c) =>
                (c.selectedEvents || []).map(Number).includes(Number(evt.Evt_No)) &&
                !c.isCancelled &&
                c.status !== 'cancelled'
            ).length;
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
                    {evtCompleted ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-600 text-white border-2 border-emerald-400 shadow-sm shadow-emerald-600/30 tracking-wider font-mono">
                          Ranked
                        </span>
                        {count > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvtNo(evt.Evt_No);
                              setPrintModalType('results');
                            }}
                            className="p-0.5 rounded bg-emerald-800 hover:bg-emerald-700 text-emerald-100 transition-all cursor-pointer"
                            title="Print Ranked Results"
                          >
                            <Printer className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </button>
                        )}
                      </div>
                    ) : showFinalLabel ? (
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
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-200/50 border border-purple-400/20 tracking-wider font-mono">
                          HIT
                        </span>
                        {count > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvtNo(evt.Evt_No);
                              setPrintModalType('hit');
                            }}
                            className="p-0.5 rounded bg-slate-700 hover:bg-slate-600 text-white transition-all cursor-pointer"
                            title="Print Hit List"
                          >
                            <Printer className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </button>
                        )}
                      </div>
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
      <div ref={workingTableRef} id="hit-list-working-container" className="scroll-mt-24 sm:scroll-mt-28 lg:scroll-mt-36">
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

              <div className="flex flex-wrap items-center gap-2 print:hidden shrink-0">
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
                      if (qualifierSaveTimerRef.current) {
                        window.clearTimeout(qualifierSaveTimerRef.current);
                        qualifierSaveTimerRef.current = null;
                      }
                      latestDesiredSetRef.current = null;
                      hasEditedInputForEventRef.current = false;
                      setOptimisticQualifiedSet(null);
                      setQualifierChestInput('');
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

                {/* Comma-separated Final Qualifier Chest Numbers Text Box */}
                {!isRankingPrepared && !isAlreadyPromoted && (
                  <input
                    type="text"
                    id="input-final-qualifier-chests"
                    value={qualifierChestInput}
                    onChange={(e) => handleQualifierInputChange(e.target.value)}
                    onBlur={handleQualifierInputBlur}
                    placeholder="Qualify Chest# (e.g. 101, 105)"
                    title={
                      hasInvalidChestInput
                        ? 'Invalid chest number! Enter comma-separated chest numbers enrolled in this event.'
                        : 'Type comma-separated chest numbers qualified for final (e.g. 101, 105, 112)'
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-mono font-bold border outline-none transition-all w-44 sm:w-56 ${
                      hasInvalidChestInput
                        ? 'bg-rose-100 text-rose-700 border-rose-400 placeholder:text-rose-400 focus:ring-2 focus:ring-rose-500'
                        : 'bg-white text-slate-900 border-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-400'
                    }`}
                  />
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
                    return mergedEventParticipants.map((item: HeatParticipant, idx: number) => {
                      const chestNo = Number(item.chestNo);
                      const candName = item.candidateName;
                      const clubName = item.club;
                      const isQualified = optimisticQualifiedSet !== null
                        ? optimisticQualifiedSet.has(chestNo)
                        : eventHeats.length > 0
                        ? Boolean(item.qualified)
                        : isAlreadyPromoted
                        ? savedFinalists.some((f) => Number(f.chestNo) === chestNo)
                        : (!isHitRequired ? true : false);
                      const isFinalist = isAlreadyPromoted && savedFinalists.some((f) => Number(f.chestNo) === chestNo);
                      const finalistRankObj = currentResult?.finalists?.find((f) => Number(f.chestNo) === chestNo);
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
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPrintModalType(null);
          }}
        >
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none print:overflow-visible print:p-0">
            
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900 text-white flex flex-col gap-2.5 border-b border-slate-800 print:hidden shrink-0">
              {/* Row 1: Title + Thermal Setup & Close 'X' Buttons */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Printer className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-base truncate">Hit List</h3>
                    <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                      Event #{currentEvent?.Evt_No}: {currentEvent?.Evt_Name} • {enrolledCandidates.length} Athlete(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowThermalSetup(true)}
                    className="px-2 sm:px-2.5 py-1.5 rounded-xl border border-amber-500/40 transition-all flex items-center gap-1.5 text-xs font-bold text-amber-200 hover:text-white bg-slate-800 hover:bg-slate-700 active:scale-95 cursor-pointer shrink-0"
                    title="Thermal Printer Setup"
                    aria-label="Thermal Printer Setup"
                  >
                    <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="hidden xs:inline sm:inline">Setup</span>
                  </button>

                  {/* Highlighted 'X' Close Button situated at top right corner */}
                  <button
                    type="button"
                    id="btn-close-hit-preview"
                    onClick={() => setPrintModalType(null)}
                    className="flex items-center justify-center p-1.5 sm:p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-md transition-all cursor-pointer active:scale-95 shrink-0"
                    title="Close Preview (X)"
                    aria-label="Close Print Preview"
                  >
                    <X className="w-5 h-5 stroke-[2.5]" />
                  </button>
                </div>
              </div>

              {/* Row 2: Format Switcher (Normal, Thermal), Print, WhatsApp */}
              <div className="flex items-center justify-between gap-2 w-full flex-wrap">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {/* Format Switcher */}
                  <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setModalFormat('a4')}
                      className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
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
                      className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
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
                    disabled={isDirectPrinting}
                    onClick={handleExecutePrint}
                    className={`px-2.5 sm:px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-60 active:scale-95 ${
                      modalFormat === 'thermal'
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                    title="Print directly to thermal printer"
                  >
                    {isDirectPrinting ? (
                      <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-slate-950" />
                    ) : (
                      <Printer className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${modalFormat === 'thermal' ? 'text-slate-950' : 'text-white'}`} />
                    )}
                    <span>{isDirectPrinting ? 'Printing...' : 'Print'}</span>
                  </button>

                  {/* Share Thermal Data to WhatsApp */}
                  <button
                    type="button"
                    id="btn-whatsapp-share-hit-modal"
                    disabled={isSharingWhatsApp}
                    onClick={() => handleShareWhatsApp('hit')}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0 ${isSharingWhatsApp ? 'opacity-60 cursor-wait' : ''}`}
                    title={`Share Hit List Thermal Report (Offline HTML)`}
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" />
                    <span className="hidden xs:inline sm:inline">WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Direct Mobile Printing Status Alert */}
              {directPrintStatus && (
                <div className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-between gap-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 truncate">
                    {isDirectPrinting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate">{directPrintStatus}</span>
                  </div>
                  {!isDirectPrinting && (
                    <button
                      type="button"
                      onClick={() => setDirectPrintStatus(null)}
                      className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable Preview Canvas */}
            {modalFormat === 'thermal' ? (
              /* ================= 58MM THERMAL ROLL RECEIPT PREVIEW (EXACT MATCHING) ================= */
              <div className="p-3 sm:p-8 bg-slate-300 overflow-y-auto flex-1 flex flex-col items-center print:p-0 print:bg-white print:overflow-visible">
                <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5 print:hidden">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  <span>58mm Roll Preview ({thermalConfig.printableWidth}mm • {thermalConfig.fontSize}pt)</span>
                </div>
                <div
                  ref={thermalModalSheetRef}
                  className="receipt thermal-printable-sheet bg-white text-black p-0 shadow-2xl rounded-xs select-none print:shadow-none print:p-0"
                  style={{
                    width: `${thermalConfig.printableWidth}mm`,
                    maxWidth: `${thermalConfig.printableWidth}mm`,
                    boxSizing: 'border-box',
                    paddingLeft: `${thermalConfig.marginHorizontal}mm`,
                    paddingRight: `${thermalConfig.marginHorizontal}mm`,
                    paddingTop: `${thermalConfig.topMargin ?? 5}mm`,
                    paddingBottom: `${thermalConfig.feedBeforeCut}mm`,
                    fontSize: `${thermalConfig.fontSize}pt`,
                    lineHeight: thermalConfig.lineSpacing,
                    fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif',
                  }}
                >
                  {/* Header */}
                  {renderThermalHeader()}

                  {/* Event Title Line: broken into two lines */}
                  <div className="text-center py-0.5 tracking-tight text-black leading-tight">
                    <div className="font-bold uppercase">HIT LIST</div>
                    <div className="thermal-event-details font-normal mt-0.5 uppercase tracking-tight break-words leading-tight">
                      {currentEvent ? (
                        <><span className="thermal-event-no font-bold">EVT {currentEvent.Evt_No}</span>{formatThermalEventSuffix(currentEvent.Evt_Name, currentEvent.Height, currentEvent.Gender)}</>
                      ) : ''}
                    </div>
                  </div>

                  {/* Single Dashed Line */}
                  <div className="w-full border-b border-dashed border-black my-1"></div>

                  {/* Table Column Headers */}
                  <div className="flex items-center font-normal text-black uppercase pt-1">
                    <span className="w-[1.8em] text-left shrink-0">SL</span>
                    <span className="w-[2.6em] text-left shrink-0">CH</span>
                    <span className="flex-1 text-left pl-1">ATHLETE (CLUB)</span>
                  </div>
                  <div className="w-full border-b-2 border-black mb-1 mt-0.5"></div>

                  {/* Athletes List with dotted separators */}
                  <div className="space-y-0 text-black">
                    {enrolledCandidates.map((cand, idx) => (
                      <div key={cand.id || cand.chestNo}>
                        <div className="flex items-start py-1 text-black leading-tight">
                          <span className="w-[1.8em] text-left font-normal shrink-0">{idx + 1}</span>
                          <span className="w-[2.6em] text-left font-normal shrink-0 thermal-chest-no">{cand.chestNo}</span>
                          <div className="flex-1 min-w-0 text-left pl-1">
                            <div className="font-normal uppercase thermal-record-clamp-1">
                              {cand.name} ({cand.club || 'BANDIPUR'})
                            </div>
                          </div>
                        </div>
                        <div className="w-full border-b border-dotted border-black/80"></div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
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
                    {/* Top Header: Logo on Left + Centered Club Name & Meet Title */}
                    <div className="relative mb-2">
                      <div className="absolute left-0 top-0">
                        <img 
                          src={settings.registeredClubLogo || '/icon.png'} 
                          alt="Club Logo" 
                          className="w-14 h-14 object-contain"
                        />
                      </div>
                      <div className="text-center pt-0.5 pb-2">
                        <h1 className="text-xl sm:text-2xl font-black text-black uppercase tracking-wide leading-tight">
                          {(settings.registeredClubName || settings.organizer || 'SASHTITALA AGRANI').toUpperCase()}
                        </h1>
                        <h2 className="text-xs sm:text-sm font-bold text-black uppercase tracking-wide leading-tight mt-1">
                          {(settings.ordinalTitle || '47TH ANNUAL SPORTS MEET 2027').toUpperCase()}
                        </h2>
                      </div>
                    </div>

                    {/* Horizontal Divider Line */}
                    <div className="border-b border-black mb-3"></div>

                    {/* Event Header Bar (Thick border above and below) */}
                    <div className="border-t-2 border-b-2 border-black py-1.5 px-0.5 mb-3 flex items-center justify-between">
                      <div className="font-bold text-sm sm:text-base text-black uppercase tracking-wide">
                        EVENT #{currentEvent?.Evt_No} : {currentEvent?.Evt_Name} / {(currentEvent?.Height || '').toUpperCase() === 'ALL' ? 'ALL' : (currentEvent?.Height || '').replace(/[`']/g, "'").replace(/''|``|"/g, '"')} / {currentEvent?.Gender}
                      </div>
                      <div className="font-bold text-sm sm:text-base text-black uppercase tracking-wider">
                        HIT LIST
                      </div>
                    </div>

                    {/* All Participants Hit List Table: Matches HitListA4Reports.jpg exactly */}
                    <table className="w-full text-left border border-black border-collapse bg-white">
                      <thead>
                        <tr className="bg-white text-black font-bold">
                          <th rowSpan={2} className="border border-black py-2 px-1 text-center text-xs uppercase" style={{ width: '40px' }}>
                            SL.
                          </th>
                          <th rowSpan={2} className="border border-black py-2 px-1 text-center text-xs uppercase font-bold" style={{ width: '60px', minWidth: '60px' }}>
                            CHEST NO.
                          </th>
                          <th rowSpan={2} className="border border-black py-2 px-3 text-left text-xs uppercase font-bold">
                            NAME (CLUB NAME)
                          </th>
                          <th colSpan={4} className="border border-black py-1 px-1 text-center text-xs uppercase font-bold">
                            POSITION / CHANCE
                          </th>
                        </tr>
                        <tr className="bg-white text-black font-bold">
                          <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>1</th>
                          <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>2</th>
                          <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>3</th>
                          <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>4</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrolledCandidates.map((cand, idx) => (
                          <tr key={cand.id || cand.chestNo} className="bg-white">
                            <td className="border border-black py-2.5 px-1 text-center text-sm font-normal text-black" style={{ width: '40px' }}>
                              {idx + 1}
                            </td>
                            <td className="border border-black py-2.5 px-1 text-center text-sm font-bold text-black" style={{ width: '60px', minWidth: '60px' }}>
                              {cand.chestNo}
                            </td>
                            <td className="border border-black py-2.5 px-3 text-left text-sm font-normal text-black uppercase">
                              {cand.name} ({cand.club || 'BANDIPUR'})
                            </td>
                            <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                            <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                            <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                            <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Footer as per HitListA4Reports.jpg */}
                    <div className="flex items-center justify-between mt-2.5 pt-1 text-black">
                      <div className="flex items-center gap-1.5 text-xs text-black font-medium">
                        <img src="/icon.png" alt="eSports" className="w-4 h-4 object-contain" />
                        <span>eSports (Sport Management System)</span>
                      </div>
                      <div className="text-[11px] text-black font-normal">
                        {currentTimestamp}
                      </div>
                    </div>

                    {/* Bottom dashed line separator */}
                    <div className="border-b border-dashed border-slate-300 mt-2"></div>
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
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPrintModalType(null);
          }}
        >
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none print:overflow-visible print:p-0">
            
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900 text-white flex flex-col gap-2.5 border-b border-slate-800 print:hidden shrink-0">
              {/* Row 1: Title + Thermal Setup & Close 'X' Buttons */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Award className="w-4 h-4 text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-base truncate">Final List</h3>
                    <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                      Event #{currentEvent?.Evt_No}: {currentEvent?.Evt_Name} • {effectiveFinalists.length} Finalist(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowThermalSetup(true)}
                    className="px-2 sm:px-2.5 py-1.5 rounded-xl border border-amber-500/40 transition-all flex items-center gap-1.5 text-xs font-bold text-amber-200 hover:text-white bg-slate-800 hover:bg-slate-700 active:scale-95 cursor-pointer shrink-0"
                    title="Thermal Printer Setup"
                    aria-label="Thermal Printer Setup"
                  >
                    <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="hidden xs:inline sm:inline">Setup</span>
                  </button>

                  {/* Highlighted 'X' Close Button situated at top right corner */}
                  <button
                    type="button"
                    id="btn-close-final-preview"
                    onClick={() => setPrintModalType(null)}
                    className="flex items-center justify-center p-1.5 sm:p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-md transition-all cursor-pointer active:scale-95 shrink-0"
                    title="Close Preview (X)"
                    aria-label="Close Print Preview"
                  >
                    <X className="w-5 h-5 stroke-[2.5]" />
                  </button>
                </div>
              </div>

              {/* Row 2: Format Switcher (Normal, Thermal), Print, WhatsApp */}
              <div className="flex items-center justify-between gap-2 w-full flex-wrap">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
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

                  {/* Print Action */}
                  <button
                    type="button"
                    disabled={isDirectPrinting}
                    onClick={handleExecutePrint}
                    className={`px-2.5 sm:px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-60 active:scale-95 ${
                      modalFormat === 'thermal'
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                    title="Print directly to thermal printer"
                  >
                    {isDirectPrinting ? (
                      <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-slate-950" />
                    ) : (
                      <Printer className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${modalFormat === 'thermal' ? 'text-slate-950' : 'text-white'}`} />
                    )}
                    <span>{isDirectPrinting ? 'Printing...' : 'Print'}</span>
                  </button>

                  {/* Share Thermal Data to WhatsApp */}
                  <button
                    type="button"
                    id="btn-whatsapp-share-final-modal"
                    disabled={isSharingWhatsApp}
                    onClick={() => handleShareWhatsApp('final')}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0 ${isSharingWhatsApp ? 'opacity-60 cursor-wait' : ''}`}
                    title={`Share Final List Thermal Report (Offline HTML)`}
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" />
                    <span className="hidden xs:inline sm:inline">WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Direct Mobile Printing Status Alert */}
              {directPrintStatus && (
                <div className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-between gap-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 truncate">
                    {isDirectPrinting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate">{directPrintStatus}</span>
                  </div>
                  {!isDirectPrinting && (
                    <button
                      type="button"
                      onClick={() => setDirectPrintStatus(null)}
                      className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable Preview Canvas */}
            {modalFormat === 'thermal' ? (
              /* ================= 58MM THERMAL ROLL RECEIPT PREVIEW (EXACT MATCHING) ================= */
              <div className="p-3 sm:p-8 bg-slate-300 overflow-y-auto flex-1 flex flex-col items-center print:p-0 print:bg-white print:overflow-visible">
                <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5 print:hidden">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  <span>58mm Roll Preview ({thermalConfig.printableWidth}mm • {thermalConfig.fontSize}pt)</span>
                </div>
                <div
                  ref={thermalModalSheetRef}
                  className="receipt thermal-printable-sheet bg-white text-black p-0 shadow-2xl rounded-xs select-none print:shadow-none print:p-0"
                  style={{
                    width: `${thermalConfig.printableWidth}mm`,
                    maxWidth: `${thermalConfig.printableWidth}mm`,
                    boxSizing: 'border-box',
                    paddingLeft: `${thermalConfig.marginHorizontal}mm`,
                    paddingRight: `${thermalConfig.marginHorizontal}mm`,
                    paddingTop: `${thermalConfig.topMargin ?? 5}mm`,
                    paddingBottom: `${thermalConfig.feedBeforeCut}mm`,
                    fontSize: `${thermalConfig.fontSize}pt`,
                    lineHeight: thermalConfig.lineSpacing,
                    fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif',
                  }}
                >
                  {/* Header */}
                  {renderThermalHeader()}

                  {/* Event Title Line: broken into two lines */}
                  <div className="text-center py-0.5 tracking-tight text-black leading-tight">
                    <div className="font-bold uppercase">FINAL LIST</div>
                    <div className="thermal-event-details font-normal mt-0.5 uppercase tracking-tight break-words leading-tight">
                      {currentEvent ? (
                        <><span className="thermal-event-no font-bold">EVT {currentEvent.Evt_No}</span>{formatThermalEventSuffix(currentEvent.Evt_Name, currentEvent.Height, currentEvent.Gender)}</>
                      ) : ''}
                    </div>
                  </div>

                  {/* Single Dashed Line */}
                  <div className="w-full border-b border-dashed border-black my-1"></div>

                  {/* Table Column Headers */}
                  <div className="flex items-center font-normal text-black uppercase pt-1">
                    <span className="w-[1.8em] text-left shrink-0">SL</span>
                    <span className="w-[2.6em] text-left shrink-0">CH</span>
                    <span className="flex-1 text-left pl-1">ATHLETE (CLUB)</span>
                  </div>
                  <div className="w-full border-b-2 border-black mb-1 mt-0.5"></div>

                  {/* Finalists List with dotted separators */}
                  <div className="space-y-0 text-black">
                    {effectiveFinalists.map((cand, idx) => (
                      <div key={cand.chestNo}>
                        <div className="flex items-start py-1 text-black leading-tight">
                          <span className="w-[1.8em] text-left font-normal shrink-0">{idx + 1}</span>
                          <span className="w-[2.6em] text-left font-normal shrink-0 thermal-chest-no">{cand.chestNo}</span>
                          <div className="flex-1 min-w-0 text-left pl-1">
                            <div className="font-normal uppercase thermal-record-clamp-1">
                              {cand.candidateName} ({cand.club || 'BANDIPUR'})
                            </div>
                          </div>
                        </div>
                        <div className="w-full border-b border-dotted border-black/80"></div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  {renderThermalFooter()}
                </div>
              </div>
            ) : (
              /* ================= PLAIN A4 PAPER SHEET (REDESIGNED AS PER HitListA4Reports.jpg) ================= */
              <div className="p-2 sm:p-6 overflow-y-auto flex-1 bg-slate-200/80 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div
                  className="a4-printable-sheet bg-white w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-10 shadow-md border-0 outline-none flex flex-col justify-between text-black font-sans print:p-0 print:m-0 print:border-none print:shadow-none print:outline-none print:bg-white print:max-w-none print:min-h-0"
                  id="printable-final-content"
                >
                  <div>
                    {/* Top Header: Logo on Left + Centered Club Name & Meet Title */}
                    <div className="relative mb-2">
                      <div className="absolute left-0 top-0">
                        <img 
                          src={settings.registeredClubLogo || '/icon.png'} 
                          alt="Club Logo" 
                          className="w-14 h-14 object-contain"
                        />
                      </div>
                      <div className="text-center pt-0.5 pb-2">
                        <h1 className="text-xl sm:text-2xl font-black text-black uppercase tracking-wide leading-tight">
                          {(settings.registeredClubName || settings.organizer || 'SASHTITALA AGRANI').toUpperCase()}
                        </h1>
                        <h2 className="text-xs sm:text-sm font-bold text-black uppercase tracking-wide leading-tight mt-1">
                          {(settings.ordinalTitle || '47TH ANNUAL SPORTS MEET 2027').toUpperCase()}
                        </h2>
                      </div>
                    </div>

                    {/* Horizontal Divider Line */}
                    <div className="border-b-2 border-black mb-1"></div>

                    {/* Event Header Bar */}
                    <div className="py-1 px-0.5 mb-2 flex items-center justify-between text-black font-bold uppercase text-sm sm:text-base">
                      <div>
                        EVENT #{currentEvent?.Evt_No} : {currentEvent?.Evt_Name} / {(currentEvent?.Height || '').toUpperCase() === 'ALL' ? 'ALL' : (currentEvent?.Height || '').replace(/[`']/g, "'").replace(/''|``|"/g, '"')} / {currentEvent?.Gender}
                      </div>
                      <div className="tracking-wider">
                        FINAL LIST
                      </div>
                    </div>

                    {/* Finalists Table: Matches FinalListA4Reports.JPG exactly */}
                    <table className="w-full text-left border-collapse border border-black bg-white">
                      <thead>
                        <tr className="bg-white text-black font-bold">
                          <th 
                            rowSpan={2} 
                            className="border border-black py-2 px-1 text-center text-xs uppercase font-bold"
                            style={{ width: '48px' }}
                          >
                            SL.
                          </th>
                          <th 
                            rowSpan={2} 
                            className="border border-black py-2 px-1 text-center text-xs uppercase font-bold"
                            style={{ width: '70px', minWidth: '70px' }}
                          >
                            CHEST NO.
                          </th>
                          <th 
                            rowSpan={2} 
                            className="border border-black py-2 px-3 text-left text-xs uppercase font-bold"
                          >
                            NAME (CLUB NAME)
                          </th>
                          <th 
                            colSpan={4} 
                            className="border border-black py-1 px-1 text-center text-xs uppercase font-bold"
                          >
                            POSITION / CHANCE
                          </th>
                        </tr>
                        <tr className="bg-white text-black font-bold">
                          <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>1</th>
                          <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>2</th>
                          <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>3</th>
                          <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>4</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectiveFinalists.map((cand, idx) => (
                          <tr key={cand.chestNo} className="bg-white">
                            <td 
                              className="border border-black py-3 px-1 text-center text-sm font-normal text-black"
                              style={{ width: '48px' }}
                            >
                              {idx + 1}
                            </td>
                            <td 
                              className="border border-black py-3 px-1 text-center text-sm font-bold text-black"
                              style={{ width: '70px', minWidth: '70px' }}
                            >
                              {cand.chestNo}
                            </td>
                            <td className="border border-black py-3 px-3 text-left text-sm font-normal text-black uppercase">
                              {cand.candidateName} ({cand.club || 'INDEPENDENT'})
                            </td>
                            <td className="border border-black py-3 px-1 text-center font-bold text-sm" style={{ width: '85px', minWidth: '85px' }}>
                              {cand.position === 1 ? '1' : ''}
                            </td>
                            <td className="border border-black py-3 px-1 text-center font-bold text-sm" style={{ width: '85px', minWidth: '85px' }}>
                              {cand.position === 2 ? '2' : ''}
                            </td>
                            <td className="border border-black py-3 px-1 text-center font-bold text-sm" style={{ width: '85px', minWidth: '85px' }}>
                              {cand.position === 3 ? '3' : ''}
                            </td>
                            <td className="border border-black py-3 px-1 text-center font-bold text-sm" style={{ width: '85px', minWidth: '85px' }}>
                              {cand.position === 4 ? '4' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Footer as per FinalListA4Reports.JPG without signatures */}
                    <div className="flex items-center justify-between mt-3 pt-1 text-black">
                      <div className="flex items-center gap-1.5 text-xs text-black font-medium">
                        <img src="/icon.png" alt="eSports" className="w-4 h-4 object-contain" />
                        <span>eSports (Sports Management System)</span>
                      </div>
                      <div className="text-[11px] text-black font-normal">
                        {currentTimestamp}
                      </div>
                    </div>

                    {/* Bottom dotted separator */}
                    <div className="border-b border-dotted border-black/80 mt-1"></div>
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
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPrintModalType(null);
          }}
        >
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none print:overflow-visible print:p-0">
            
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900 text-white flex flex-col gap-2.5 border-b border-slate-800 print:hidden shrink-0">
              {/* Row 1: Title + Thermal Setup & Close 'X' Buttons */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-base truncate">Rankings</h3>
                    <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                      Event #{currentEvent?.Evt_No}: {currentEvent?.Evt_Name} • {rankedWinners.length} Ranked Winner(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowThermalSetup(true)}
                    className="px-2 sm:px-2.5 py-1.5 rounded-xl border border-amber-500/40 transition-all flex items-center gap-1.5 text-xs font-bold text-amber-200 hover:text-white bg-slate-800 hover:bg-slate-700 active:scale-95 cursor-pointer shrink-0"
                    title="Thermal Printer Setup"
                    aria-label="Thermal Printer Setup"
                  >
                    <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="hidden xs:inline sm:inline">Setup</span>
                  </button>

                  {/* Highlighted 'X' Close Button situated at top right corner */}
                  <button
                    type="button"
                    id="btn-close-results-preview"
                    onClick={() => setPrintModalType(null)}
                    className="flex items-center justify-center p-1.5 sm:p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-md transition-all cursor-pointer active:scale-95 shrink-0"
                    title="Close Preview (X)"
                    aria-label="Close Print Preview"
                  >
                    <X className="w-5 h-5 stroke-[2.5]" />
                  </button>
                </div>
              </div>

              {/* Row 2: Format Switcher (Normal, Thermal), Print, WhatsApp */}
              <div className="flex items-center justify-between gap-2 w-full flex-wrap">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
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
                    disabled={isDirectPrinting}
                    onClick={handleExecutePrint}
                    className={`px-2.5 sm:px-4 py-1.5 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-60 active:scale-95 ${
                      modalFormat === 'thermal'
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                    title="Print directly to thermal printer"
                  >
                    {isDirectPrinting ? (
                      <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-slate-950" />
                    ) : (
                      <Printer className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${modalFormat === 'thermal' ? 'text-slate-950' : 'text-white'}`} />
                    )}
                    <span>{isDirectPrinting ? 'Printing...' : 'Print'}</span>
                  </button>

                  {/* Share Thermal Data to WhatsApp */}
                  <button
                    type="button"
                    id="btn-whatsapp-share-results-modal"
                    disabled={isSharingWhatsApp}
                    onClick={() => handleShareWhatsApp('results')}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0 ${isSharingWhatsApp ? 'opacity-60 cursor-wait' : ''}`}
                    title={`Share Ranking List Thermal Report (Offline HTML)`}
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" />
                    <span className="hidden xs:inline sm:inline">WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Direct Mobile Printing Status Alert */}
              {directPrintStatus && (
                <div className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-between gap-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 truncate">
                    {isDirectPrinting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate">{directPrintStatus}</span>
                  </div>
                  {!isDirectPrinting && (
                    <button
                      type="button"
                      onClick={() => setDirectPrintStatus(null)}
                      className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable Preview Canvas */}
            {modalFormat === 'thermal' ? (
              /* ================= 58MM THERMAL ROLL RECEIPT PREVIEW (EXACT MATCHING) ================= */
              <div className="p-3 sm:p-8 bg-slate-300 overflow-y-auto flex-1 flex flex-col items-center print:p-0 print:bg-white print:overflow-visible">
                <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5 print:hidden">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  <span>58mm Roll Preview ({thermalConfig.printableWidth}mm • {thermalConfig.fontSize}pt)</span>
                </div>
                <div
                  ref={thermalModalSheetRef}
                  className="receipt thermal-printable-sheet bg-white text-black p-0 shadow-2xl rounded-xs select-none print:shadow-none print:p-0"
                  style={{
                    width: `${thermalConfig.printableWidth}mm`,
                    maxWidth: `${thermalConfig.printableWidth}mm`,
                    boxSizing: 'border-box',
                    paddingLeft: `${thermalConfig.marginHorizontal}mm`,
                    paddingRight: `${thermalConfig.marginHorizontal}mm`,
                    paddingTop: `${thermalConfig.topMargin ?? 5}mm`,
                    paddingBottom: `${thermalConfig.feedBeforeCut}mm`,
                    fontSize: `${thermalConfig.fontSize}pt`,
                    lineHeight: thermalConfig.lineSpacing,
                    fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif',
                  }}
                >
                  {/* Header */}
                  {renderThermalHeader()}

                  {/* Event Title Line: broken into two lines */}
                  <div className="text-center py-0.5 tracking-tight text-black leading-tight">
                    <div className="font-bold uppercase">RANKING LIST</div>
                    <div className="thermal-event-details font-normal mt-0.5 uppercase tracking-tight break-words leading-tight">
                      {currentEvent ? (
                        <><span className="thermal-event-no font-bold">EVT {currentEvent.Evt_No}</span>{formatThermalEventSuffix(currentEvent.Evt_Name, currentEvent.Height, currentEvent.Gender)}</>
                      ) : ''}
                    </div>
                  </div>

                  {/* Single Dashed Line */}
                  <div className="w-full border-b border-dashed border-black my-1"></div>

                  {(() => {
                    const isBroadJump = (currentEvent?.Evt_Name || '').toUpperCase().includes('BROAD JUMP');
                    return (
                      <>
                        {/* Table Column Headers */}
                        <div className="flex items-center font-normal text-black uppercase pt-1">
                          <span className="w-[2.2em] text-left shrink-0">RK</span>
                          <span className="w-[2.6em] text-left shrink-0">CH</span>
                          <span className="flex-1 text-left pl-1">ATHLETE (CLUB)</span>
                          {isBroadJump && (
                            <span className="text-right pl-1 shrink-0">JMP</span>
                          )}
                        </div>
                        <div className="w-full border-b-2 border-black mb-1 mt-0.5"></div>

                        {/* Ranked Athletes List with dotted separators */}
                        <div className="space-y-0 text-black">
                          {rankedWinners.length === 0 ? (
                            <div className="italic text-center py-2 text-slate-600">
                              No rankings declared yet for this event.
                            </div>
                          ) : (
                            rankedWinners.map((w, idx) => {
                              const p = (w.position && w.position > 0) ? w.position : (idx + 1);
                              const rankLabel = p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`;
                              const club = getClubInfo(w.club || '');
                              const isSelf = (w.club || '').trim().toUpperCase() === 'SELF';
                              const clubNameStr = isSelf ? '' : (club?.name || w.club || '').trim();
                              const athleteDisplay = clubNameStr ? `${w.candidateName} (${clubNameStr})` : w.candidateName;
                              const jumpVal = isBroadJump ? (w.jumpRecord || w.resultValue || '—') : undefined;
                              return (
                                <div key={w.chestNo}>
                                  <div className="flex items-start py-1 text-black leading-tight">
                                    <span className="w-[2.2em] text-left font-normal shrink-0">{rankLabel}</span>
                                    <span className="w-[2.6em] text-left font-normal shrink-0 thermal-chest-no">{w.chestNo}</span>
                                    <div className="flex-1 min-w-0 text-left font-normal uppercase pl-1">
                                      <ThermalTwoLineRecord
                                        text={athleteDisplay}
                                        rightText={jumpVal}
                                        rightClassName="thermal-jump-record whitespace-nowrap"
                                        deps={[thermalConfig.printableWidth, thermalConfig.fontSize, thermalConfig.lineSpacing, thermalConfig.marginHorizontal]}
                                      />
                                    </div>
                                  </div>
                                  <div className="w-full border-b border-dotted border-black/80"></div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {isBroadJump && (() => {
                          const prevRecord = settings.broadJumpPreviousRecords?.[Number(currentEvent?.Evt_No)] ||
                            (currentResult?.highestRecord?.previousRecordValue ? {
                              recordValue: currentResult.highestRecord.previousRecordValue,
                              recordHolderName: currentResult.highestRecord.previousRecordHolder || 'Record Holder',
                              recordHolderClub: '',
                              recordYear: currentResult.highestRecord.previousRecordYear || '',
                            } : null);

                          if (!prevRecord) return null;

                          const prevInches = parseJumpToInches(prevRecord.recordValue);
                          let maxJumpInches = 0;
                          rankedWinners.forEach(r => {
                            const jInches = parseJumpToInches(r.jumpRecord || (r as any).resultValue);
                            if (jInches > maxJumpInches) maxJumpInches = jInches;
                          });
                          if (currentResult?.highestRecord?.recordValue) {
                            const hrInches = parseJumpToInches(currentResult.highestRecord.recordValue);
                            if (hrInches > maxJumpInches) maxJumpInches = hrInches;
                          }
                          const isBroken = prevInches > 0 ? (maxJumpInches > prevInches) : (maxJumpInches > 0);
                          const formattedPrev = formatJumpBenchmark(prevRecord.recordValue) || prevRecord.recordValue;
                          const holderClub = prevRecord.recordHolderClub ? ` (${prevRecord.recordHolderClub})` : '';
                          const holderYear = prevRecord.recordYear ? `, ${prevRecord.recordYear}` : '';

                          if (!isBroken) {
                            return (
                              <div className="thermal-new-record-callout py-1 font-normal text-center text-black leading-tight border-b border-dotted border-black/80 break-words">
                                New Record: N
                              </div>
                            );
                          }

                          return (
                            <div className="thermal-new-record-callout py-1 font-normal text-center text-black leading-tight border-b border-dotted border-black/80 break-words">
                              <span className="font-bold">New Record: Y</span>
                              <span> | Prev: {formattedPrev} by {prevRecord.recordHolderName}{holderClub}{holderYear}</span>
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}

                  {/* Footer */}
                  {renderThermalFooter()}
                </div>
              </div>
            ) : (
              /* ================= PLAIN A4 PAPER SHEET (REDESIGNED AS PER HitListA4Reports.jpg) ================= */
              <div className="p-2 sm:p-6 overflow-y-auto flex-1 bg-slate-200/80 flex justify-center print:p-0 print:bg-white print:overflow-visible">
                <div
                  className="a4-printable-sheet bg-white w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-10 shadow-md border-0 outline-none flex flex-col justify-between text-black font-sans print:p-0 print:m-0 print:border-none print:shadow-none print:outline-none print:bg-white print:w-full print:min-h-0"
                  id="printable-results-content"
                >
                  <div>
                    {/* Top Header: Logo on Left + Centered Club Name & Meet Title */}
                    <div className="relative mb-2">
                      <div className="absolute left-0 top-0">
                        <img 
                          src={settings.registeredClubLogo || '/icon.png'} 
                          alt="Club Logo" 
                          className="w-14 h-14 object-contain"
                        />
                      </div>
                      <div className="text-center pt-0.5 pb-2">
                        <h1 className="text-xl sm:text-2xl font-black text-black uppercase tracking-wide leading-tight">
                          {(settings.registeredClubName || settings.organizer || 'SASHTITALA AGRANI').toUpperCase()}
                        </h1>
                        <h2 className="text-xs sm:text-sm font-bold text-black uppercase tracking-wide leading-tight mt-1">
                          {(settings.ordinalTitle || '47TH ANNUAL SPORTS MEET 2027').toUpperCase()}
                        </h2>
                      </div>
                    </div>

                    {/* Horizontal Divider Line */}
                    <div className="border-b border-black mb-3"></div>

                    {/* Event Header Bar (Thick border above and below) */}
                    <div className="border-t-2 border-b-2 border-black py-1.5 px-0.5 mb-3 flex items-center justify-between">
                      <div className="font-bold text-sm sm:text-base text-black uppercase tracking-wide">
                        EVENT #{currentEvent?.Evt_No} : {currentEvent?.Evt_Name} / {(currentEvent?.Height || '').toUpperCase() === 'ALL' ? 'ALL' : (currentEvent?.Height || '').replace(/[`']/g, "'").replace(/''|``|"/g, '"')} / {currentEvent?.Gender}
                      </div>
                      <div className="font-bold text-sm sm:text-base text-black uppercase tracking-wider">
                        RANKING LIST
                      </div>
                    </div>

                    {/* Rankings Table: Matches HitListA4Reports.jpg with minimum chest no width & chest no in bold */}
                    {(() => {
                      const isBroadJump = (currentEvent?.Evt_Name || '').toUpperCase().includes('BROAD JUMP');
                      const getRankPosLabel = (pos?: number, fallbackIdx?: number) => {
                        const p = (pos && pos > 0) ? pos : ((fallbackIdx !== undefined) ? fallbackIdx + 1 : 1);
                        const j = p % 10, k = p % 100;
                        if (j === 1 && k !== 11) return `${p}st`;
                        if (j === 2 && k !== 12) return `${p}nd`;
                        if (j === 3 && k !== 13) return `${p}rd`;
                        return `${p}th`;
                      };

                      return (
                        <table className="w-full text-left border-collapse border border-black bg-white">
                          <thead>
                            <tr className="bg-white text-black font-bold">
                              <th 
                                className="border border-black py-2 px-1 text-center text-xs uppercase"
                                style={{ width: '45px' }}
                              >
                                RANK
                              </th>
                              <th 
                                className="border border-black py-2 px-1 text-center text-xs uppercase font-bold"
                                style={{ width: '60px', minWidth: '60px' }}
                              >
                                CHEST NO.
                              </th>
                              <th 
                                className="border border-black py-2 px-3 text-left text-xs uppercase font-bold"
                              >
                                NAME (CLUB NAME)
                              </th>
                              {isBroadJump && (
                                <th 
                                  className="border border-black py-2 px-2 text-center text-xs uppercase font-bold"
                                  style={{ width: '80px', minWidth: '80px' }}
                                >
                                  JUMP
                                </th>
                              )}
                              <th 
                                className="border border-black py-2 px-2 text-center text-xs uppercase font-bold"
                                style={{ width: '65px', minWidth: '65px' }}
                              >
                                POINTS
                              </th>
                              <th 
                                className="border border-black py-2 px-2 text-center text-xs uppercase font-bold"
                                style={{ width: '85px', minWidth: '85px' }}
                              >
                                REMARKS
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rankedWinners.length === 0 ? (
                              <tr>
                                <td colSpan={isBroadJump ? 6 : 5} className="border border-black py-4 text-center font-normal text-slate-500">
                                  No rankings declared yet for this event.
                                </td>
                              </tr>
                            ) : (
                              rankedWinners.map((winner, idx) => {
                                const pts = getPointsForPosition(winner.position);
                                const defaultRemark = winner.position === 1 ? 'GOLD' : winner.position === 2 ? 'SILVER' : winner.position === 3 ? 'BRONZE' : '';

                                return (
                                  <tr key={winner.chestNo} className="bg-white">
                                    <td 
                                      className="border border-black py-2.5 px-1 text-center text-sm font-normal text-black"
                                      style={{ width: '45px' }}
                                    >
                                      {getRankPosLabel(winner.position, idx)}
                                    </td>
                                    <td 
                                      className="border border-black py-2.5 px-1 text-center text-sm font-bold text-black"
                                      style={{ width: '60px', minWidth: '60px' }}
                                    >
                                      {winner.chestNo}
                                    </td>
                                    <td className="border border-black py-2.5 px-3 text-left text-sm font-normal text-black uppercase">
                                      {winner.candidateName} ({winner.club || 'INDEPENDENT'})
                                    </td>
                                    {isBroadJump && (
                                      <td 
                                        className="border border-black py-2.5 px-2 text-center text-sm font-mono font-normal text-black"
                                        style={{ width: '80px', minWidth: '80px' }}
                                      >
                                        {winner.jumpRecord || winner.resultValue || '—'}
                                      </td>
                                    )}
                                    <td 
                                      className="border border-black py-2.5 px-2 text-center text-sm font-bold text-black"
                                      style={{ width: '65px', minWidth: '65px' }}
                                    >
                                      {pts}
                                    </td>
                                    <td 
                                      className="border border-black py-2.5 px-2 text-center text-xs font-normal text-black"
                                      style={{ width: '85px', minWidth: '85px' }}
                                    >
                                      {winner.remarks || defaultRemark}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      );
                    })()}

                    {/* Broad Jump Record Callout */}
                    {currentEvent?.Evt_Name?.toUpperCase().includes('BROAD JUMP') && currentResult?.highestRecord && (
                      <div className="mt-2.5 p-2 border-2 border-black bg-white text-xs font-bold text-black uppercase flex items-center justify-between avoid-break">
                        <div>
                          <span className="font-bold">★ MEET BROAD JUMP RECORD: {currentResult.highestRecord.recordValue} by {currentResult.highestRecord.candidateName} (#{currentResult.highestRecord.chestNo}{currentResult.highestRecord.club ? `, ${currentResult.highestRecord.club}` : ''})</span>
                        </div>
                        <span>{currentResult.highestRecord.isRecordBroken ? '🏆 RECORD BROKEN' : 'RECORD STANDS'}</span>
                      </div>
                    )}
                  </div>

                  {/* Signatures Footer */}
                  <div className="mt-8 pt-4 flex items-center justify-between text-xs font-bold text-black avoid-break">
                    <div className="text-center w-48">
                      <div className="border-b border-black mb-1 h-8" />
                      <span>Chief Referee Sign</span>
                    </div>
                    <div className="text-center w-48">
                      <div className="border-b border-black mb-1 h-8" />
                      <span>Track Referee Sign</span>
                    </div>
                    <div className="text-center w-48">
                      <div className="border-b border-black mb-1 h-8" />
                      <span>President / Convener Sign</span>
                    </div>
                  </div>
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

      {/* Club Echo ON Warning Flash Modal on First Print */}
      <ClubEchoPrintModal
        isOpen={Boolean(echoPrintModalState)}
        contextLabel={echoPrintModalState?.contextLabel}
        canTurnOffEcho={Boolean(onSaveSettings)}
        onTurnOffAndPrint={async () => {
          if (!echoPrintModalState) return;
          markFirstPrintWarned(echoPrintModalState.category, echoPrintModalState.evtNos);
          setEchoPrintModalState(null);
          if (onSaveSettings) {
            await onSaveSettings({ ...settings, clientResponseEnabled: false });
          }
          setTimeout(() => {
            executeActualPrint();
          }, 60);
        }}
        onContinuePrint={() => {
          if (!echoPrintModalState) return;
          markFirstPrintWarned(echoPrintModalState.category, echoPrintModalState.evtNos);
          setEchoPrintModalState(null);
          setTimeout(() => {
            executeActualPrint();
          }, 60);
        }}
        onCancel={() => setEchoPrintModalState(null)}
      />

      {/* Offscreen Thermal sheet so WhatsApp Offline HTML share works even while Normal (A4) preview is active */}
      {printModalType && modalFormat !== 'thermal' && currentEvent && (
        <div
          aria-hidden="true"
          className="fixed -left-[99999px] top-0 pointer-events-none opacity-0 print:hidden"
        >
          <div
            ref={offscreenThermalShareRef}
            className="thermal-printable-sheet bg-white text-black p-0"
            style={{
              width: `${thermalConfig.printableWidth}mm`,
              maxWidth: `${thermalConfig.printableWidth}mm`,
              boxSizing: 'border-box',
              paddingLeft: `${thermalConfig.marginHorizontal}mm`,
              paddingRight: `${thermalConfig.marginHorizontal}mm`,
              paddingTop: `${thermalConfig.topMargin ?? 5}mm`,
              paddingBottom: `${thermalConfig.feedBeforeCut}mm`,
              fontSize: `${thermalConfig.fontSize}pt`,
              lineHeight: thermalConfig.lineSpacing,
              fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif',
            }}
          >
            {renderThermalHeader()}
            <div className="text-center py-0.5 tracking-tight text-black leading-tight">
              <div className="font-bold uppercase">
                {printModalType === 'hit' ? 'HIT LIST' : printModalType === 'final' ? 'FINAL LIST' : 'RANKING LIST'}
              </div>
              <div className="thermal-event-details font-normal mt-0.5 uppercase tracking-tight break-words leading-tight">
                <span className="thermal-event-no font-bold">EVT {currentEvent.Evt_No}</span>
                {formatThermalEventSuffix(currentEvent.Evt_Name, currentEvent.Height, currentEvent.Gender)}
              </div>
            </div>
            <div className="w-full border-b border-dashed border-black my-1"></div>
            {printModalType === 'results' ? (
              (() => {
                const isBroadJump = (currentEvent.Evt_Name || '').toUpperCase().includes('BROAD JUMP');
                return (
                  <>
                    <div className="flex items-center font-normal text-black uppercase pt-1">
                      <span className="w-[2.2em] text-left shrink-0">RK</span>
                      <span className="w-[2.6em] text-left shrink-0">CH</span>
                      <span className="flex-1 text-left pl-1">ATHLETE (CLUB)</span>
                      {isBroadJump && <span className="text-right pl-1 shrink-0">JMP</span>}
                    </div>
                    <div className="w-full border-b-2 border-black mb-1 mt-0.5"></div>
                    <div className="space-y-0 text-black">
                      {rankedWinners.length === 0 ? (
                        <div className="italic text-center py-2 text-slate-600">No rankings declared yet for this event.</div>
                      ) : (
                        rankedWinners.map((w, idx) => {
                          const p = w.position && w.position > 0 ? w.position : idx + 1;
                          const rankLabel = p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`;
                          const club = getClubInfo(w.club || '');
                          const isSelf = (w.club || '').trim().toUpperCase() === 'SELF';
                          const clubNameStr = isSelf ? '' : (club?.name || w.club || '').trim();
                          const athleteDisplay = clubNameStr ? `${w.candidateName} (${clubNameStr})` : w.candidateName;
                          const jumpVal = isBroadJump ? (w.jumpRecord || w.resultValue || '—') : undefined;
                          return (
                            <div key={w.chestNo}>
                              <div className="flex items-start py-1 text-black leading-tight">
                                <span className="w-[2.2em] text-left font-normal shrink-0">{rankLabel}</span>
                                <span className="w-[2.6em] text-left font-normal shrink-0 thermal-chest-no">{w.chestNo}</span>
                                <div className="flex-1 min-w-0 text-left font-normal uppercase pl-1">
                                  <ThermalTwoLineRecord
                                    text={athleteDisplay}
                                    rightText={jumpVal}
                                    rightClassName="thermal-jump-record whitespace-nowrap"
                                    deps={[thermalConfig.printableWidth, thermalConfig.fontSize, thermalConfig.lineSpacing, thermalConfig.marginHorizontal]}
                                  />
                                </div>
                              </div>
                              <div className="w-full border-b border-dotted border-black/80"></div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {isBroadJump && (() => {
                      const prevRecord = settings.broadJumpPreviousRecords?.[Number(currentEvent?.Evt_No)] ||
                        (currentResult?.highestRecord?.previousRecordValue ? {
                          recordValue: currentResult.highestRecord.previousRecordValue,
                          recordHolderName: currentResult.highestRecord.previousRecordHolder || 'Record Holder',
                          recordHolderClub: '',
                          recordYear: currentResult.highestRecord.previousRecordYear || '',
                        } : null);

                      if (!prevRecord) return null;

                      const prevInches = parseJumpToInches(prevRecord.recordValue);
                      let maxJumpInches = 0;
                      rankedWinners.forEach((r) => {
                        const jInches = parseJumpToInches(r.jumpRecord || (r as any).resultValue);
                        if (jInches > maxJumpInches) maxJumpInches = jInches;
                      });
                      if (currentResult?.highestRecord?.recordValue) {
                        const hrInches = parseJumpToInches(currentResult.highestRecord.recordValue);
                        if (hrInches > maxJumpInches) maxJumpInches = hrInches;
                      }
                      const isBroken = prevInches > 0 ? maxJumpInches > prevInches : maxJumpInches > 0;
                      const formattedPrev = formatJumpBenchmark(prevRecord.recordValue) || prevRecord.recordValue;
                      const holderClub = prevRecord.recordHolderClub ? ` (${prevRecord.recordHolderClub})` : '';
                      const holderYear = prevRecord.recordYear ? `, ${prevRecord.recordYear}` : '';

                      if (!isBroken) {
                        return (
                          <div className="thermal-new-record-callout py-1 font-normal text-center text-black leading-tight border-b border-dotted border-black/80 break-words">
                            New Record: N
                          </div>
                        );
                      }

                      return (
                        <div className="thermal-new-record-callout py-1 font-normal text-center text-black leading-tight border-b border-dotted border-black/80 break-words">
                          <span className="font-bold">New Record: Y</span>
                          <span> | Prev: {formattedPrev} by {prevRecord.recordHolderName}{holderClub}{holderYear}</span>
                        </div>
                      );
                    })()}
                  </>
                );
              })()
            ) : (
              <>
                <div className="flex items-center font-normal text-black uppercase pt-1">
                  <span className="w-[1.8em] text-left shrink-0">SL</span>
                  <span className="w-[2.6em] text-left shrink-0">CH</span>
                  <span className="flex-1 text-left pl-1">ATHLETE (CLUB)</span>
                </div>
                <div className="w-full border-b-2 border-black mb-1 mt-0.5"></div>
                <div className="space-y-0 text-black">
                  {(printModalType === 'hit'
                    ? enrolledCandidates.map((c) => ({ chestNo: c.chestNo, name: c.name, club: c.club }))
                    : effectiveFinalists.map((f) => ({ chestNo: f.chestNo, name: f.candidateName, club: f.club }))
                  ).map((row, idx) => (
                    <div key={`${row.chestNo}-${idx}`}>
                      <div className="flex items-start py-1 text-black leading-tight">
                        <span className="w-[1.8em] text-left font-normal shrink-0">{idx + 1}</span>
                        <span className="w-[2.6em] text-left font-normal shrink-0 thermal-chest-no">{row.chestNo}</span>
                        <div className="flex-1 min-w-0 text-left pl-1">
                          <div className="font-normal uppercase thermal-record-clamp-1">
                            {row.name} ({row.club || 'BANDIPUR'})
                          </div>
                        </div>
                      </div>
                      <div className="w-full border-b border-dotted border-black/80"></div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {renderThermalFooter()}
          </div>
        </div>
      )}

    </div>
  );
};

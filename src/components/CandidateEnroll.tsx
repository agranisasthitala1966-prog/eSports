import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  SportEvent, 
  Club, 
  Candidate, 
  SportsMeetSettings 
} from '../types';
import { api } from '../services/api';
import { isEventCardEnabled, parseHeightToInches, isClubAllowedForEvent0 } from '../utils/heightRules';
import { 
  UserPlus, 
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Copy,
  Check,
  X,
  List,
  Send,
  Building2,
  DollarSign,
  Users,
  Pencil,
  ExternalLink,
  Eye,
  History,
} from 'lucide-react';
import { EventHeat, EventResult } from '../types';
import { getServerEventEnrollmentDisableReason } from '../utils/qualificationRules';

interface CandidateEnrollProps {
  events: SportEvent[];
  clubs: Club[];
  settings: SportsMeetSettings;
  mode: 'client' | 'server';
  onSaveCandidate: (candidateData: any) => Promise<void> | void;
  candidateToEdit?: Candidate | null;
  onCancelEdit?: () => void;
  suggestedChestNo: number;
  candidates: Candidate[];
  heats?: EventHeat[];
  results?: EventResult[];
  onNavigateToCandidates: () => void;
  onSyncTrigger: () => void;
  isSyncing?: boolean;
  onEditCandidate?: (cand: Candidate) => void;
  onDeleteCandidate?: (id: string) => Promise<void> | void;
  onCancelChest?: (id: string) => Promise<void> | void;
  onSaveClub?: (clubData: Partial<Club>) => Promise<void> | void;
}

interface LastTwoEntriesDisplayProps {
  candidates: Candidate[];
  events: SportEvent[];
  onEditCandidate?: (cand: Candidate) => void;
}

const LastTwoEntriesDisplay: React.FC<LastTwoEntriesDisplayProps> = ({
  candidates,
  events,
  onEditCandidate,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLatestIdRef = useRef<string | null>(null);
  const prevLatestChestRef = useRef<number | null>(null);
  const isInitialMountRef = useRef<boolean>(true);

  // Take the last two enrolled entries from the candidates list and order them by chest number descending
  const lastTwo = useMemo(() => {
    const valid = [...candidates].filter(
      (c) => !c.isCancelled && c.status !== 'cancelled' && Number(c.chestNo) > 0
    );
    // Take the last 2 enrolled entries:
    const lastTwoEnrolled = valid.slice(-2);
    // Order them by chest number descending:
    return [...lastTwoEnrolled].sort((a, b) => Number(b.chestNo) - Number(a.chestNo));
  }, [candidates]);

  // Requirement 1 & 2 Helper: accurately determine gender code (B, G, C)
  const getGenderCode = (cand: Candidate): string => {
    const rawG = (cand.gender || '').trim().toUpperCase();
    if (rawG === 'BOYS' || rawG === 'BOY' || rawG === 'B') return 'B';
    if (rawG === 'GIRLS' || rawG === 'GIRL' || rawG === 'G') return 'G';
    if (rawG === 'CHILDRENS' || rawG === 'CHILDREN' || rawG === 'C') return 'C';

    // If candidate gender is empty or 'ALL', determine from their selected events
    if (cand.selectedEvents && cand.selectedEvents.length > 0) {
      for (const evNo of cand.selectedEvents) {
        const ev = events.find((e) => Number(e.Evt_No) === Number(evNo));
        const evG = (ev?.Gender || '').trim().toUpperCase();
        if (evG === 'BOYS' || evG === 'BOY' || evG === 'B') return 'B';
        if (evG === 'GIRLS' || evG === 'GIRL' || evG === 'G') return 'G';
        if (evG === 'CHILDRENS' || evG === 'CHILDREN' || evG === 'C') return 'C';
      }
    }
    return 'B'; // default fallback
  };

  // Requirement 2 Helper: format height
  const getHeightStr = (cand: Candidate): string => {
    let h = (cand.height || '').trim();
    if (!h || h === 'ALL') {
      if (cand.selectedEvents && cand.selectedEvents.length > 0) {
        for (const evNo of cand.selectedEvents) {
          const ev = events.find((e) => Number(e.Evt_No) === Number(evNo));
          if (ev?.Height && ev.Height !== 'ALL') {
            h = ev.Height;
            break;
          }
        }
      }
    }
    return h || '—';
  };

  // Auto scroll DOWN when a new candidate is enrolled such that the last item (previous entry at bottom) becomes visible
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || lastTwo.length === 0) return;

    const latestCand = lastTwo[0]; // New entry is at index 0 (top)
    const latestId = latestCand?.id || (latestCand?.chestNo ? String(latestCand.chestNo) : '');
    const latestChest = Number(latestCand?.chestNo) || 0;

    const getMaxScroll = () => Math.max(0, el.scrollHeight - el.clientHeight);

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevLatestIdRef.current = latestId;
      prevLatestChestRef.current = latestChest;
      el.scrollTop = 0;
      return;
    }

    // Trigger auto-scroll down ONLY when a new candidate is enrolled
    const isNewEnrollment =
      (prevLatestIdRef.current !== null && latestId !== prevLatestIdRef.current) ||
      (prevLatestChestRef.current !== null && latestChest > prevLatestChestRef.current);

    if (isNewEnrollment && lastTwo.length > 1) {
      prevLatestIdRef.current = latestId;
      prevLatestChestRef.current = latestChest;

      // Position at top showing the new entry first
      el.scrollTop = 0;

      let animId: number;
      // Pause briefly (200ms) matching the initial still frame in the mp4 video, then auto scroll down smoothly to the last item
      const timer = setTimeout(() => {
        const startTop = 0;
        const targetTop = getMaxScroll();
        const distance = targetTop - startTop;
        if (distance <= 0) return;

        const duration = 1400; // 1.4s smooth downward scroll cadence matching mp4 video
        const startTime = performance.now();

        // Ease-in-out cubic: gentle start, smooth cruise, soft decelerating landing
        const easeInOutCubic = (t: number) => {
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        };

        const step = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = easeInOutCubic(progress);

          el.scrollTop = startTop + distance * eased;

          if (progress < 1) {
            animId = requestAnimationFrame(step);
          }
        };

        animId = requestAnimationFrame(step);
      }, 200);

      return () => {
        clearTimeout(timer);
        if (animId) cancelAnimationFrame(animId);
      };
    } else {
      prevLatestIdRef.current = latestId;
      prevLatestChestRef.current = latestChest;
    }
  }, [lastTwo]);

  if (lastTwo.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      {/* Exactly one record visible at a time (58px container with 54px cards), contains last 2 entries with mini scrollbar */}
      <div
        ref={scrollRef}
        className="mini-scrollbar h-[58px] overflow-y-auto rounded-xl border border-[#123d75] bg-[#00142e] p-0.5 shadow-inner transition-colors focus-within:border-amber-400/50"
        title="Last 2 enrolled entries. Scroll to view previous entry."
      >
        <div className="space-y-1">
          {lastTwo.map((cand, idx) => {
            const gCode = getGenderCode(cand);
            const hStr = getHeightStr(cand);
            const eventNums = (cand.selectedEvents || []).sort((a, b) => a - b).join(', ');

            return (
              <div
                key={cand.id || `${cand.chestNo}_${idx}`}
                className="h-[54px] px-2.5 py-1.5 sm:py-2 rounded-lg bg-[#002857] border border-[#174a8a] hover:border-amber-400/50 transition-all shadow-2xs flex flex-col justify-between shrink-0"
              >
                {/* Row 1: Chest & Name on left; Gender+Height, Merged Due+Amount, Edit button on right */}
                <div className="flex items-center justify-between gap-1.5 leading-none">
                  {/* Left: Chest # & Candidate Name */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-mono font-black text-[11px] shrink-0 shadow-xs">
                      #{cand.chestNo}
                    </span>
                    <span className="font-extrabold text-slate-100 text-xs truncate uppercase tracking-tight">
                      {cand.name}
                    </span>
                  </div>

                  {/* Right: Gender+Height, Merged Fee Status with Amount, Edit button */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Requirement 2: Gender and height together in format like B (4`-2``) at gender position */}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold leading-none ${
                        gCode === 'B'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : gCode === 'G'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {gCode} ({hStr})
                    </span>

                    {/* Requirement 3: Merged display of Due label with amount */}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold leading-none ${
                        (cand.feeStatus || '').toUpperCase().includes('PAID')
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : (cand.feeStatus || '').toUpperCase().includes('FREE')
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {(cand.feeStatus || 'Due').toUpperCase().includes('PAID')
                        ? `Paid ₹${cand.totalFees ?? 0}`
                        : (cand.feeStatus || '').toUpperCase().includes('FREE')
                        ? 'Free'
                        : `Due ₹${cand.totalFees ?? 0}`}
                    </span>

                    {/* Edit button */}
                    {onEditCandidate && (
                      <button
                        type="button"
                        onClick={() => onEditCandidate(cand)}
                        className="p-1 rounded bg-[#003570] hover:bg-[#00448f] text-slate-200 hover:text-amber-400 transition-colors cursor-pointer"
                        title={`Edit #${cand.chestNo} ${cand.name}`}
                      >
                        <Pencil className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Club name on left; comma-separated event numbers on right below edit button */}
                <div className="flex items-center justify-between text-[10.5px] leading-none pt-0.5">
                  {/* Left: Club Name */}
                  <div className="flex items-center gap-1 truncate max-w-[70%]">
                    <span className="text-slate-500 text-[10px]">Club:</span>
                    <span className="font-medium text-slate-300 truncate">
                      {cand.club || 'Independent'}
                    </span>
                  </div>

                  {/* Requirement 4: Event numbers with comma separated placed below edit button with right alignment */}
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-amber-400 text-[10.5px]">
                      {eventNums || '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const CandidateEnroll: React.FC<CandidateEnrollProps> = ({
  events,
  clubs,
  settings,
  mode,
  onSaveCandidate,
  candidateToEdit,
  onCancelEdit,
  suggestedChestNo,
  candidates,
  heats = [],
  results = [],
  onNavigateToCandidates,
  onSyncTrigger,
  isSyncing = false,
  onEditCandidate,
  onDeleteCandidate,
  onCancelChest,
  onSaveClub,
}) => {
  // Client's Club Name: starts empty when app is opened fresh every time
  const [clientClubName, setClientClubName] = useState<string>(() => {
    // Only retrieve from active tab sessionStorage if user typed it during current session; clean on fresh open
    try {
      localStorage.removeItem('esports_client_club_name');
      return sessionStorage.getItem('esports_client_club_name') || '';
    } catch {
      return '';
    }
  });

  // Client's Club Mobile: starts empty, strictly allows only up to 10 digits
  const [clientClubMobile, setClientClubMobile] = useState<string>(() => {
    try {
      localStorage.removeItem('esports_client_club_mobile');
      const saved = sessionStorage.getItem('esports_client_club_mobile') || '';
      return saved.replace(/\D/g, '').slice(0, 10);
    } catch {
      return '';
    }
  });

  const handleClientClubMobileChange = (val: string) => {
    // Strictly allow only numbers and maximum 10 digits
    const cleaned = val.replace(/\D/g, '').slice(0, 10);
    setClientClubMobile(cleaned);
    try {
      sessionStorage.setItem('esports_client_club_mobile', cleaned);
    } catch {
      // ignore
    }
  };

  const [name, setName] = useState('');
  const [clubName, setClubName] = useState('');
  const [height, setHeight] = useState('');
  const [gender, setGender] = useState('');
  const [feeStatus, setFeeStatus] = useState<string>('Due');
  const [selectedEvents, setSelectedEvents] = useState<number[]>([]);
  const [keypadInput, setKeypadInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Effective club name for active enrollment / edit form:
  // In client mode it's clientClubName, in server mode it's clubName (or candidateToEdit club)
  const effectiveClubForEvent0 = useMemo(() => {
    if (mode === 'client') return clientClubName;
    return (clubName || candidateToEdit?.club || '').trim();
  }, [mode, clientClubName, clubName, candidateToEdit]);

  // Always disable and deselect Event #0 if current club is not in Sasthitala Agrani or Agrani or SA or Sasthitala
  useEffect(() => {
    if (!isClubAllowedForEvent0(effectiveClubForEvent0) && selectedEvents.includes(0)) {
      setSelectedEvents(prev => prev.filter(n => n !== 0));
    }
  }, [effectiveClubForEvent0, selectedEvents]);

  // Keypad focus tracker and auto-scroll anchor ref
  const isKeypadFocusedRef = React.useRef(false);
  const bottomScrollAnchorRef = React.useRef<HTMLDivElement>(null);

  // Previously enrolled clubs populated from database (for server mode auto-suggestions)
  const enrolledClubSuggestions = useMemo(() => {
    const clubSet = new Set<string>();
    // Clubs registered in DB
    clubs.forEach((c) => {
      if (c.name && c.name.trim()) clubSet.add(c.name.trim().toUpperCase());
    });
    // Candidates enrolled in DB
    candidates.forEach((cand) => {
      if (cand.club && cand.club.trim()) clubSet.add(cand.club.trim().toUpperCase());
    });
    return Array.from(clubSet).sort();
  }, [clubs, candidates]);

  // Client provisional chest number (strictly unique, non-duplicating record number for client mode)
  const clientProvisionalChestNo = useMemo(() => {
    if (candidateToEdit) {
      return candidateToEdit.localRecordNo || candidateToEdit.chestNo || 1;
    }
    const pool = (candidates || []).filter(c => {
      if (mode === 'client' && clientClubName.trim()) {
        return (c.club || '').trim().toUpperCase() === clientClubName.trim().toUpperCase();
      }
      return true;
    });
    const used = new Set<number>();
    pool.forEach(c => {
      const rec = Number(c.localRecordNo);
      if (rec && rec > 0) used.add(rec);
      const ch = Number(c.chestNo);
      if (ch && ch > 0 && ch < 100) used.add(ch);
    });
    let nextNo = 1;
    while (used.has(nextNo)) {
      nextNo++;
    }
    return nextNo;
  }, [candidates, clientClubName, candidateToEdit, mode]);

  // Auto-dismiss popup message after 3.5 seconds
  useEffect(() => {
    if (feedbackMsg) {
      const timer = setTimeout(() => {
        setFeedbackMsg(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [feedbackMsg]);

  // Summary Modal State
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [summaryFeeDetail, setSummaryFeeDetail] = useState<'paid' | 'due' | null>(null);
  const [activeSummaryRowPopup, setActiveSummaryRowPopup] = useState<{ key: string; placement: 'above' | 'below' } | null>(null);
  const summaryListContainerRef = useRef<HTMLDivElement | null>(null);

  // Save client club name to sessionStorage on change (persists during active session, blank on fresh open)
  const handleClientClubChange = (val: string) => {
    const uppercaseVal = val.toUpperCase();
    setClientClubName(uppercaseVal);
    try {
      sessionStorage.setItem('esports_client_club_name', uppercaseVal);
    } catch {
      // ignore
    }
  };

  // Available Heights from events
  const availableHeights = useMemo(() => {
    const set = new Set<string>();
    events.forEach(e => {
      if (e.Height && e.Height !== 'ALL') set.add(e.Height);
    });
    return Array.from(set).sort((a, b) => parseHeightToInches(a) - parseHeightToInches(b));
  }, [events]);

  // Available Genders from events
  const availableGenders = useMemo(() => {
    const set = new Set<string>();
    events.forEach(e => {
      if (e.Gender && e.Gender !== 'ALL') set.add(e.Gender);
    });
    return Array.from(set);
  }, [events]);

  // Populate when editing
  useEffect(() => {
    if (candidateToEdit) {
      setName(candidateToEdit.name || '');
      setClubName(candidateToEdit.club || '');
      if (candidateToEdit.club) {
        setClientClubName(candidateToEdit.club.toUpperCase());
      }
      setHeight(candidateToEdit.height === 'ALL' ? '' : (candidateToEdit.height || ''));
      setGender(candidateToEdit.gender === 'ALL' ? '' : (candidateToEdit.gender || ''));
      
      // Normalize feeStatus
      const rawStatus = candidateToEdit.feeStatus || 'Paid';
      if (rawStatus.startsWith('Paid')) setFeeStatus('Paid');
      else if (rawStatus.startsWith('Unpaid') || rawStatus.startsWith('Due')) setFeeStatus('Due');
      else if (mode !== 'client' && (rawStatus.startsWith('Exempted') || rawStatus.startsWith('Free'))) setFeeStatus('Free');
      else if (mode === 'client' && (rawStatus.startsWith('Exempted') || rawStatus.startsWith('Free'))) setFeeStatus('Due');
      else setFeeStatus(rawStatus);

      const evts = candidateToEdit.selectedEvents || [];
      setSelectedEvents(evts);
      setKeypadInput(evts.join(', '));
    }
  }, [candidateToEdit]);

  // Keep keypad input in sync with selectedEvents ONLY when keypad input is not actively focused
  useEffect(() => {
    if (!isKeypadFocusedRef.current) {
      setKeypadInput(selectedEvents.join(', '));
    }
  }, [selectedEvents]);

  // Calculate total fees
  const totalFees = useMemo(() => {
    if (feeStatus === 'Free' || feeStatus === 'Exempted [E]') return 0;
    return selectedEvents.reduce((acc, evtNo) => {
      const evt = events.find(e => Number(e.Evt_No) === Number(evtNo));
      return acc + (evt ? Number(evt.Fees) || 0 : 0);
    }, 0);
  }, [selectedEvents, events, feeStatus]);

  // Format shorthand category for thumbnail: e.g. "C 3'-4'", "B 4'-2'", "C ALL"
  const getEventShorthand = (evt: SportEvent): string => {
    let gChar = 'C';
    if (evt.Gender === 'BOYS') gChar = 'B';
    else if (evt.Gender === 'GIRLS') gChar = 'G';
    else if (evt.Gender === 'ALL' || evt.Gender === 'CHILDRENS') gChar = 'C';

    const hClean = evt.Height.replace(/`/g, "'");
    return `${gChar} ${hClean}`;
  };

  // Thumbnail click handler
  const handleToggleEvent = (evt: SportEvent) => {
    const isSelected = selectedEvents.includes(evt.Evt_No);

    if (isSelected) {
      const nextSelected = selectedEvents.filter(no => no !== evt.Evt_No);
      setSelectedEvents(nextSelected);

      // Requirement: "on deselect all event thumbnails all cards must be enable and Height & gender combo to value All"
      if (nextSelected.length === 0) {
        setHeight('');
        setGender('');
      }
      return;
    }

    // Rule: Always disable event no 0 thumbnail where club name not in Sasthitala Agrani or Agrani or SA or Sasthitala
    if (Number(evt.Evt_No) === 0 && !isClubAllowedForEvent0(effectiveClubForEvent0)) {
      setFeedbackMsg({
        type: 'error',
        text: 'Event #0 is restricted to Sasthitala Agrani, Agrani, SA, or Sasthitala club members only.',
      });
      return;
    }

    // Server-side rule: auto-disable events whose final list (when hit required=yes) or ranking list (when hit required=no) is prepared
    const serverDisableReason = getServerEventEnrollmentDisableReason(evt, results, mode);
    if (serverDisableReason) {
      setFeedbackMsg({
        type: 'error',
        text: serverDisableReason,
      });
      return;
    }

    // Autofill gender & height if not set
    let activeGender = gender;
    let activeHeight = height;

    if (!gender && evt.Gender !== 'ALL') {
      activeGender = evt.Gender;
      setGender(evt.Gender);
    }

    if (!height && evt.Height !== 'ALL') {
      activeHeight = evt.Height;
      setHeight(evt.Height);
    }

    // Eligibility check
    const check = isEventCardEnabled(evt, activeGender, activeHeight, effectiveClubForEvent0, events);
    if (!check.enabled) {
      setFeedbackMsg({
        type: 'error',
        text: `Cannot select Event #${evt.Evt_No}: ${check.reason}`,
      });
      return;
    }

    setSelectedEvents(prev => [...prev, evt.Evt_No].sort((a, b) => a - b));
    setFeedbackMsg(null);
  };

  // Helper to check if two gender categories are compatible (e.g. BOYS vs BOYS, or with ALL)
  const isGenderCategoryCompatible = (g1: string, g2: string): boolean => {
    if (!g1 || !g2) return true;
    const u1 = g1.trim().toUpperCase();
    const u2 = g2.trim().toUpperCase();
    if (u1 === 'ALL' || u2 === 'ALL') return true;
    return u1 === u2;
  };

  // Keypad input handler (Server mode only)
  // Rule: Do not allow to enter event numbers not under the same gender category against the very first event number entered
  const handleKeypadChange = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setKeypadInput(text);
      setSelectedEvents([]);
      setGender('');
      setHeight('');
      setFeedbackMsg(null);
      return;
    }

    const endsWithDelimiter = /[,\s]$/.test(text);
    const rawTokens = text.split(/[\s,]+/).map(p => p.trim()).filter(p => p !== '');

    let firstValidEvt: SportEvent | null = null;
    const validEventNos: number[] = [];
    let rejectedMsg: string | null = null;
    let shouldPruneLastToken = false;

    let targetGender = gender;
    let targetHeight = height;

    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      const isLastToken = (i === rawTokens.length - 1);
      const isFinishedToken = !isLastToken || endsWithDelimiter;

      if (isNaN(Number(tok))) continue;
      const num = Number(tok);

      // Rule: Always disable event no 0 where club name not in Sasthitala Agrani or Agrani or SA or Sasthitala
      if (num === 0 && !isClubAllowedForEvent0(effectiveClubForEvent0)) {
        rejectedMsg = `Event #0 is not allowed! Restricted to Sasthitala Agrani / Agrani / SA / Sasthitala only.`;
        shouldPruneLastToken = isLastToken;
        continue;
      }

      const found = events.find(e => Number(e.Evt_No) === num);
      const foundServerDisableReason = found ? getServerEventEnrollmentDisableReason(found, results, mode) : null;

      if (found && foundServerDisableReason) {
        const couldBePrefixOfEnabledEvent = !isFinishedToken && events.some(
          e =>
            String(e.Evt_No).startsWith(tok) &&
            !getServerEventEnrollmentDisableReason(e, results, mode) &&
            (!firstValidEvt || isGenderCategoryCompatible(e.Gender, targetGender || firstValidEvt.Gender))
        );
        if (!couldBePrefixOfEnabledEvent) {
          rejectedMsg = foundServerDisableReason;
          shouldPruneLastToken = isLastToken;
          continue;
        }
      }

      if (!firstValidEvt) {
        if (found && !foundServerDisableReason) {
          firstValidEvt = found;
          validEventNos.push(num);
          targetGender = found.Gender;
          if (found.Gender && found.Gender !== 'ALL') {
            setGender(found.Gender);
          }
          if (found.Height && found.Height !== 'ALL' && !targetHeight) {
            targetHeight = found.Height;
            setHeight(found.Height);
          }
        }
      } else {
        const firstCategory = targetGender || firstValidEvt.Gender;

        if (found) {
          const compatible = isGenderCategoryCompatible(found.Gender, firstCategory);

          if (!compatible) {
            const couldBePrefixOfMatchingEvent = !isFinishedToken && events.some(
              e =>
                String(e.Evt_No).startsWith(tok) &&
                isGenderCategoryCompatible(e.Gender, firstCategory) &&
                !getServerEventEnrollmentDisableReason(e, results, mode)
            );

            if (!couldBePrefixOfMatchingEvent) {
              rejectedMsg = `Event #${num} (${found.Gender}) is not allowed! Must be under the same category as first event #${firstValidEvt.Evt_No} (${firstCategory}).`;
              shouldPruneLastToken = isLastToken;
              continue;
            }
          } else if (!foundServerDisableReason) {
            validEventNos.push(num);
          }
        } else {
          if (!isFinishedToken) {
            const hasPossibleMatch = events.some(
              e =>
                String(e.Evt_No).startsWith(tok) &&
                isGenderCategoryCompatible(e.Gender, firstCategory) &&
                !getServerEventEnrollmentDisableReason(e, results, mode)
            );
            if (!hasPossibleMatch) {
              rejectedMsg = `No ${firstCategory} event starts with "${tok}". Only events under the same category as #${firstValidEvt.Evt_No} (${firstCategory}) are allowed.`;
              shouldPruneLastToken = isLastToken;
              continue;
            }
          }
        }
      }
    }

    if (rejectedMsg) {
      setFeedbackMsg({ type: 'error', text: rejectedMsg });
      if (shouldPruneLastToken) {
        const prunedTokens = rawTokens.slice(0, -1);
        const newText = prunedTokens.length > 0 ? prunedTokens.join(', ') + ', ' : '';
        setKeypadInput(newText);
      } else {
        setKeypadInput(validEventNos.join(', ') + (endsWithDelimiter ? ', ' : ''));
      }
    } else {
      setKeypadInput(text);
    }

    const nextSelected = Array.from(new Set(validEventNos)).sort((a, b) => a - b);
    setSelectedEvents(nextSelected);

    if (nextSelected.length === 0 && rawTokens.length === 0) {
      setHeight('');
      setGender('');
    }
  };

  // Height filter change: clears selected events on changing combo as requested by user
  const handleHeightChange = (newHeight: string) => {
    setHeight(newHeight);
    setSelectedEvents([]);
    setKeypadInput('');
  };

  // Gender filter change: clears selected events on changing combo as requested by user
  const handleGenderChange = (newGender: string) => {
    setGender(newGender);
    setSelectedEvents([]);
    setKeypadInput('');
  };

  // Reset form: NOTE - client's club name is strictly preserved!
  const resetForm = () => {
    setName('');
    if (mode === 'server') {
      setClubName(''); // Clear club name on server mode
    }
    // Client's club name does NOT reset
    setHeight('');
    setGender('');
    setFeeStatus('Due');
    setSelectedEvents([]);
    setKeypadInput('');
    setFeedbackMsg(null);
    if (onCancelEdit) onCancelEdit();
  };

  // Submit Registration
  const handleSubmit = async (e?: React.FormEvent | React.SyntheticEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (isSubmitting) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFeedbackMsg({ type: 'error', text: 'Candidate name is required.' });
      return;
    }

    // Ensure Duplicate candidate name is not allowed for new entry or for edit both
    const normalizedName = trimmedName.toUpperCase();
    const existingDuplicate = candidates.find(c => {
      if (candidateToEdit && (c.id === candidateToEdit.id || (candidateToEdit.chestNo && Number(c.chestNo) === Number(candidateToEdit.chestNo)))) return false;
      return (c.name || '').trim().toUpperCase() === normalizedName;
    });

    if (existingDuplicate) {
      setFeedbackMsg({
        type: 'error',
        text: `Duplicate Name! "${normalizedName}" already exists (${existingDuplicate.club || 'Independent'}). Duplicate candidate names are not allowed.`,
      });
      return;
    }

    if (selectedEvents.length === 0) {
      setFeedbackMsg({ type: 'error', text: 'Please select at least one event.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const assignedChest = mode === 'client'
        ? (candidateToEdit ? (candidateToEdit.chestNo || candidateToEdit.localRecordNo || clientProvisionalChestNo) : clientProvisionalChestNo)
        : (candidateToEdit?.chestNo || suggestedChestNo);
      const assignedRecordNo = mode === 'client'
        ? (candidateToEdit ? (candidateToEdit.localRecordNo || candidateToEdit.chestNo || clientProvisionalChestNo) : clientProvisionalChestNo)
        : undefined;
      const targetClub = mode === 'server'
        ? (clubName.trim().toUpperCase() || 'SELF')
        : (clientClubName.trim() || 'Independent');

      if (selectedEvents.includes(0) && !isClubAllowedForEvent0(targetClub)) {
        setFeedbackMsg({
          type: 'error',
          text: 'Event #0 is restricted to Sasthitala Agrani, Agrani, SA, or Sasthitala club members only.',
        });
        setIsSubmitting(false);
        return;
      }

      await onSaveCandidate({
        id: candidateToEdit?.id,
        chestNo: assignedChest,
        localRecordNo: assignedRecordNo,
        name: name.trim().toUpperCase(),
        club: targetClub,
        gender: gender || 'ALL',
        height: height || 'ALL',
        feeStatus,
        selectedEvents,
        totalFees,
        clubMobile: mode === 'client' ? clientClubMobile.trim() : undefined,
      });

      setFeedbackMsg({
        type: 'success',
        text: candidateToEdit
          ? `Candidate "${name.toUpperCase()}" updated successfully!`
          : mode === 'client'
          ? `Candidate "${name.toUpperCase()}" saved locally (#${assignedChest}). Official chest number will generate upon Server Sync.`
          : `Candidate "${name.toUpperCase()}" enrolled with Server Chest #${assignedChest}!`,
      });

      // Reset fields: Clear club name only for server page, preserve clientClubName
      setName('');
      if (mode === 'server') {
        setClubName(''); // clear the club name value after enroll (for only at server page)
      }
      setHeight('');
      setGender('');
      setFeeStatus('Due');
      setSelectedEvents([]);
      setKeypadInput('');

      // Auto-focus back to candidate name for rapid next entry
      setTimeout(() => {
        const nameInput = document.getElementById('candidate-name') as HTMLInputElement | null;
        nameInput?.focus();
        nameInput?.select();
      }, 100);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to save candidate' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Statistical Calculation for Summary Strip & Popup
  const stats = useMemo(() => {
    // Filter candidates for current club (or all candidates if in client mode)
    const targetCandidates = mode === 'client' && clientClubName.trim()
      ? candidates.filter(c => c.club?.trim().toUpperCase() === clientClubName.trim().toUpperCase())
      : candidates;

    let cCount = 0;
    let bCount = 0;
    let gCount = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let totalFree = 0;
    let totalAll = 0;
    let paidCount = 0;
    let paidC = 0;
    let paidB = 0;
    let paidG = 0;
    let dueCount = 0;
    let dueC = 0;
    let dueB = 0;
    let dueG = 0;
    let freeCount = 0;

    targetCandidates.forEach(c => {
      const gen = (c.gender || '').toUpperCase();
      const isBoy = gen === 'BOYS' || gen === 'B';
      const isGirl = gen === 'GIRLS' || gen === 'G';
      if (isBoy) bCount++;
      else if (isGirl) gCount++;
      else cCount++;

      const fee = Number(c.totalFees) || 0;
      totalAll += fee;

      const st = (c.feeStatus || 'Paid').toUpperCase();
      if (st.includes('UNPAID') || st.includes('DUE')) {
        totalDue += fee;
        dueCount++;
        if (isBoy) dueB++;
        else if (isGirl) dueG++;
        else dueC++;
      } else if (st.includes('EXEMPT') || st.includes('FREE')) {
        totalFree += fee;
        freeCount++;
      } else {
        totalPaid += fee;
        paidCount++;
        if (isBoy) paidB++;
        else if (isGirl) paidG++;
        else paidC++;
      }
    });

    return {
      count: targetCandidates.length,
      cCount,
      bCount,
      gCount,
      totalFees: totalAll,
      paidFees: totalPaid,
      dueFees: totalDue,
      freeFees: totalFree,
      paidCount,
      paidC,
      paidB,
      paidG,
      dueCount,
      dueC,
      dueB,
      dueG,
      freeCount,
      candidatesList: targetCandidates,
    };
  }, [candidates, clientClubName, mode]);

  // Unsynced / New records count awaiting sync to server
  const unsyncedCount = useMemo(() => {
    return candidates.filter(c => !c.synced || c.isDirty).length;
  }, [candidates]);

  // Expanded gender short form helper: C, B, G, All
  const getShortGenderDisplay = (cand: Candidate): string => {
    const g = (cand.gender || '').trim().toUpperCase();
    if (g === 'BOYS' || g === 'B') return 'B';
    if (g === 'GIRLS' || g === 'G') return 'G';
    if (g === 'CHILDRENS' || g === 'CHILDREN' || g === 'C') return 'C';
    if (g === 'ALL') return 'All';
    return cand.gender?.trim() || 'All';
  };

  // Events display for summary list (sorted ascending)
  const getEventsDisplay = (cand: Candidate): string => {
    if (!cand.selectedEvents || cand.selectedEvents.length === 0) return '-';
    return [...cand.selectedEvents]
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)
      .join(', ');
  };

  return (
    <div className="max-w-6xl xl:max-w-7xl mx-auto space-y-2.5">
      {/* Deep Midnight Navy Card Frame (#002047) */}
      <div className="bg-[#002047] rounded-2xl border border-[#123c73] shadow-2xl overflow-hidden text-slate-100 font-sans">
        
        {/* FIXED / STICKY TOP SECTION: Client Club Name (client mode only) / Server Info (server mode) + Meet Title + QR Link */}
        <div className="sticky top-0 z-30 bg-[#002047]/95 backdrop-blur-md border-b border-[#123c73] px-4 sm:px-6 py-2.5 shadow-md">
          <div className="flex items-center justify-between gap-3">
            
            {/* Ask Client's Club Name and Club Mobile beside each other in client mode; remove from server mode */}
            {mode === 'client' ? (
              <div className="flex-1 min-w-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-4">
                <div className="flex-1 min-w-[150px] sm:max-w-xs md:max-w-sm">
                  <label htmlFor="client-club-input" className="block text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                    Your Club Name
                  </label>
                  <input
                    id="client-club-input"
                    type="text"
                    value={clientClubName}
                    onChange={(e) => handleClientClubChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const mobileInput = document.getElementById('client-club-mobile-input') as HTMLInputElement | null;
                        if (mobileInput) {
                          mobileInput.focus();
                          mobileInput.select();
                        }
                      }
                    }}
                    placeholder="e.g. YOUR CLUB NAME"
                    className="w-full px-3 py-1.5 rounded-xl bg-[#001736] border border-amber-400/80 text-amber-400 font-extrabold uppercase text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400/40 transition-all shadow-inner"
                  />
                </div>
                <div className="w-full sm:w-56 md:w-64 min-w-[140px]">
                  <label htmlFor="client-club-mobile-input" className="block text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                    Club Mobile
                  </label>
                  <input
                    id="client-club-mobile-input"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={clientClubMobile}
                    onChange={(e) => handleClientClubMobileChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const candNameInput = document.getElementById('candidate-name') as HTMLInputElement | null;
                        if (candNameInput) {
                          candNameInput.focus();
                          candNameInput.select();
                        }
                      }
                    }}
                    maxLength={10}
                    className="w-full px-3 py-1.5 rounded-xl bg-[#001736] border border-amber-400/80 text-amber-400 font-extrabold text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400/40 transition-all shadow-inner"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-extrabold text-amber-400 truncate">
                    {settings.ordinalTitle || '47th Annual Sports Meet 2026'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-300/80 font-medium mt-0.5">
                  Official Candidate Enrollment & Direct Registry
                </p>
              </div>
            )}

            {/* Right: Actions */}
            {candidateToEdit && (
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-200 bg-[#002c61] hover:bg-[#003a7d] rounded-xl transition-colors flex items-center gap-1 border border-[#194a8a] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Cancel</span>
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Content Container (Compact on desktop to fit without page scroll) */}
        <div className="p-3 sm:p-4 lg:p-4">
          
          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 md:gap-4 lg:gap-5 items-stretch">

              {/* ========================================================================= */}
              {/* GROUP 1 (LEFT COLUMN): Candidate Name, Club Name, Height, Gender TOGETHER */}
              {/* Also houses Summary strip and Action buttons on desktop & Tab              */}
              {/* ========================================================================= */}
              <div className="md:col-span-5 flex flex-col justify-between space-y-2.5">
                
                {/* FIELD 1: Candidate Name * */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="candidate-name" className="block text-xs font-bold text-slate-100">
                      Candidate Name <span className="text-amber-400">*</span>
                    </label>
                    {mode === 'server' ? (
                      <span className="text-[11px] font-mono font-bold text-amber-400 bg-[#001736] px-2 py-0.5 rounded-lg border border-amber-400/40">
                        Chest No. #{candidateToEdit ? candidateToEdit.chestNo : suggestedChestNo}
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono font-bold text-amber-400 bg-[#001736] px-2.5 py-0.5 rounded-lg border border-amber-400/40">
                        #{clientProvisionalChestNo}
                      </span>
                    )}
                  </div>
                  <input
                    id="candidate-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (mode === 'server') {
                          const clubInput = document.getElementById('candidate-club-input') as HTMLInputElement | null;
                          clubInput?.focus();
                          clubInput?.select();
                        } else {
                          // Client mode: focus moves to event card after pressing enter on candidate name
                          const selectedCard = document.querySelector<HTMLElement>('[id^="thumb-event-"][aria-pressed="true"]');
                          const firstCard = selectedCard || document.querySelector<HTMLElement>('[id^="thumb-event-"]:not([aria-disabled="true"])');
                          if (firstCard) {
                            firstCard.focus();
                            firstCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          } else {
                            const feeSelect = document.getElementById('fee-status-select') as HTMLSelectElement | null;
                            feeSelect?.focus();
                          }
                        }
                      }
                    }}
                    placeholder="e.g. ARJUN SEN"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#001736] border border-amber-400/70 text-white placeholder:text-slate-400 text-xs sm:text-sm font-semibold uppercase focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all shadow-inner"
                  />
                </div>

                {/* FIELD 2: Club Name (kept together with candidate name - Only for Server mode, removed for Client mode) */}
                {mode === 'server' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="candidate-club-input" className="block text-xs font-bold text-slate-100">
                        Club Name <span className="text-slate-300/80 font-normal text-[11px]">(Leave blank for "SELF")</span>
                      </label>
                      {enrolledClubSuggestions.length > 0 && (
                        <span className="text-[10px] text-slate-300/80 font-medium">
                          {enrolledClubSuggestions.length} club(s) enrolled
                        </span>
                      )}
                    </div>
                    <input
                      id="candidate-club-input"
                      type="text"
                      list="enrolled-clubs-datalist"
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const keypadInputEl = document.getElementById('server-keypad') as HTMLInputElement | null;
                          if (keypadInputEl) {
                            keypadInputEl.focus();
                            keypadInputEl.select();
                          } else {
                            const feeSelect = document.getElementById('fee-status-select') as HTMLSelectElement | null;
                            feeSelect?.focus();
                          }
                        }
                      }}
                      placeholder="e.g. CLUB NAME (Leave blank for SELF)"
                      className="w-full px-3.5 py-2 rounded-xl bg-[#001736] border border-amber-400/70 text-white placeholder:text-slate-400 text-xs sm:text-sm font-semibold uppercase focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all shadow-inner"
                    />
                    <datalist id="enrolled-clubs-datalist">
                      {enrolledClubSuggestions.map((cName) => (
                        <option key={cName} value={cName} />
                      ))}
                    </datalist>
                  </div>
                )}

                {/* FIELD 3 & 4: Height Category & Gender Category (kept together with name and club) */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Height Category */}
                  <div>
                    <label htmlFor="height-select" className="block text-xs font-bold text-slate-100 mb-1">
                      Height Category
                    </label>
                    <div className="relative">
                      <select
                        id="height-select"
                        value={height}
                        onChange={(e) => handleHeightChange(e.target.value)}
                        className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#001736] border border-amber-400/80 text-white text-xs sm:text-sm font-semibold focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all cursor-pointer appearance-none pr-7 shadow-inner"
                      >
                        <option value="">ALL (Auto)</option>
                        {availableHeights.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-300">
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Gender Category */}
                  <div>
                    <label htmlFor="gender-select" className="block text-xs font-bold text-slate-100 mb-1">
                      Gender Category
                    </label>
                    <div className="relative">
                      <select
                        id="gender-select"
                        value={gender}
                        onChange={(e) => handleGenderChange(e.target.value)}
                        className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#001736] border border-amber-400/80 text-white text-xs sm:text-sm font-semibold focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all cursor-pointer appearance-none pr-7 shadow-inner"
                      >
                        <option value="">ALL (Auto)</option>
                        {availableGenders.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-300">
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DESKTOP & TAB PLACEMENT: Summary Strip, 3 Action Buttons, and Bottom-aligned Last 2 Entries */}
                <div className="hidden md:flex flex-col flex-1 justify-between pt-1">
                  <div className="space-y-2.5">
                    {/* Summary Strip & Reset Button with Overlapping Notification */}
                    <div className="relative">
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#001736] border border-[#123c73] shadow-inner min-h-[42px]">
                      <button
                        type="button"
                        id="btn-open-summary-popup"
                        onClick={() => setShowSummaryPopup(true)}
                        className="flex-1 text-left text-xs font-bold text-slate-100 hover:text-amber-400 transition-colors cursor-pointer truncate"
                        title="Click to view detailed Accounts & Registration Summary"
                      >
                        ({stats.count} Reg (C:{stats.cCount}/B:{stats.bCount}/G:{stats.gCount}) | ₹{stats.totalFees} (P:₹{stats.paidFees}/D:₹{stats.dueFees}))
                      </button>

                      <button
                        type="button"
                        id="btn-reset-form"
                        onClick={resetForm}
                        className="shrink-0 px-2 py-1 rounded-lg bg-[#002c61] hover:bg-[#003a7d] active:scale-95 text-slate-100 border border-[#194a8a] flex items-center gap-1 text-[11px] font-semibold transition-all cursor-pointer"
                        title="Reset fields (Client club name is preserved)"
                      >
                        <RotateCcw className="w-3 h-3 text-amber-400" />
                        <span>Reset</span>
                      </button>
                    </div>

                    {/* Feedback Popup Overlay */}
                    {feedbackMsg && (
                      <div
                        role="alert"
                        className={`absolute inset-0 z-30 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xl transition-all duration-300 animate-in fade-in zoom-in-95 ${
                          feedbackMsg.type === 'success'
                            ? 'bg-[#064e3b] border-2 border-emerald-400 text-emerald-50 shadow-emerald-950/90'
                            : 'bg-[#881337] border-2 border-rose-400 text-rose-50 shadow-rose-950/90'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {feedbackMsg.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
                          )}
                          <span className="truncate text-xs font-black tracking-wide">{feedbackMsg.text}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFeedbackMsg(null)}
                          className="p-1 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Client Responses Paused Notice */}
                  {mode === 'client' && (settings?.clientResponseEnabled === false) && (
                    <div className="mb-2 p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Client responses are currently paused by the server administrator.</span>
                    </div>
                  )}

                  {/* 3 Action Buttons */}
                  <div className="grid grid-cols-12 gap-2">
                    <button
                      type="button"
                      id="btn-view-edit-list"
                      disabled={mode === 'client' && (settings?.clientResponseEnabled === false)}
                      onClick={() => onNavigateToCandidates()}
                      className={`col-span-4 py-2.5 px-2 rounded-xl active:scale-98 text-white font-black text-xs flex items-center justify-center gap-1 shadow-lg transition-all truncate ${
                        mode === 'client' && (settings?.clientResponseEnabled === false)
                          ? 'opacity-40 cursor-not-allowed bg-slate-800'
                          : 'bg-[#881337] hover:bg-[#9f1239] cursor-pointer'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-0.5 truncate">
                        <span>Edit/</span>
                        <Eye className="w-3.5 h-3.5 shrink-0 inline text-slate-100" />
                        <span>({stats.count})</span>
                      </span>
                    </button>

                    <button
                      type="submit"
                      id="btn-submit-enroll"
                      disabled={(mode === 'client' && (settings?.clientResponseEnabled === false)) || isSubmitting || selectedEvents.length === 0 || !name.trim()}
                      className={`col-span-4 py-2.5 px-2 rounded-xl active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs flex items-center justify-center gap-1 shadow-lg shadow-amber-500/10 transition-all truncate ${
                        mode === 'client' && (settings?.clientResponseEnabled === false)
                          ? 'opacity-40 cursor-not-allowed bg-slate-700 text-slate-400'
                          : 'bg-[#facc15] hover:bg-[#eab308] cursor-pointer'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                      <span className="truncate">{candidateToEdit ? 'Update' : '+ Enroll'}</span>
                    </button>

                    <button
                      type="button"
                      id="btn-send-sync"
                      onClick={onSyncTrigger}
                      disabled={(mode === 'client' && (settings?.clientResponseEnabled === false)) || isSyncing}
                      className={`col-span-4 py-2.5 px-2 rounded-xl active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-xs flex items-center justify-center gap-1 shadow-lg transition-all truncate ${
                        mode === 'client' && (settings?.clientResponseEnabled === false)
                          ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500'
                          : 'bg-[#15803d] hover:bg-[#16a34a] cursor-pointer'
                      }`}
                    >
                      <Send className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-pulse' : ''}`} />
                      <span className="truncate">
                        {isSyncing ? `Sending...` : `Send (${unsyncedCount})`}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Serverside & Desktop/Tab: Last 2 Entries positioned flush with bottom line of fee structure combobox */}
                {mode === 'server' && (
                  <div className="mt-auto mb-1 relative -top-1.5">
                    <LastTwoEntriesDisplay candidates={candidates} events={events} onEditCandidate={onEditCandidate} />
                  </div>
                )}
              </div>

              </div>

              {/* ========================================================================================= */}
              {/* GROUP 2 (RIGHT COLUMN): Keypad, Event Cards, Fee Status and Calculated Fee KEPT TOGETHER */}
              {/* ========================================================================================= */}
              <div className="md:col-span-7 space-y-2.5">
                
                {/* 1. Type Event Numbers (Keypad) text box - OMITTED ON CLIENT PAGE */}
                {mode === 'server' && (
                  <div id="server-keypad-container" className="scroll-mt-28">
                    <div className="mb-1">
                      <label htmlFor="server-keypad" className="block text-xs font-semibold text-slate-300">
                        Type Event Numbers or Click on Events below to select
                      </label>
                    </div>
                    <input
                      id="server-keypad"
                      type="text"
                      value={keypadInput}
                      onFocus={() => {
                        isKeypadFocusedRef.current = true;
                      }}
                      onBlur={() => {
                        isKeypadFocusedRef.current = false;
                        setKeypadInput(selectedEvents.join(', '));
                      }}
                      onChange={(e) => {
                        handleKeypadChange(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const feeSelect = document.getElementById('fee-status-select') as HTMLSelectElement | null;
                          if (feeSelect) {
                            feeSelect.focus();
                          }
                        }
                      }}
                      placeholder="e.g. 1, 8, 9"
                      className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#001736] border border-[#194a8a] text-white placeholder:text-slate-400 font-mono text-xs sm:text-sm focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 shadow-inner"
                    />
                  </div>
                )}

                {/* 2. Event Cards (Thumbnails Grid) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200">
                      Select Events <span className="text-amber-400">*</span>
                    </label>
                    {selectedEvents.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEvents([]);
                          setHeight('');
                          setGender('');
                        }}
                        className="text-[11px] text-amber-400 hover:underline font-semibold"
                      >
                        Clear Selected ({selectedEvents.length})
                      </button>
                    )}
                  </div>

                  {/* Event Thumbnails Grid: fully expanded for mobile app mode without scroll bar */}
                  <div
                    className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-1.5 no-scrollbar ${
                      mode === 'client'
                        ? 'overflow-visible max-h-none h-auto'
                        : 'max-lg:overflow-visible max-lg:max-h-none lg:max-h-[250px] lg:overflow-y-auto pr-0.5'
                    }`}
                  >
                    {events.map((evt) => {
                      const isSelected = selectedEvents.includes(evt.Evt_No);
                      const eligibility = isEventCardEnabled(evt, gender, height, effectiveClubForEvent0, events);
                      const serverDisableReason = getServerEventEnrollmentDisableReason(evt, results, mode);
                      const isEnabled = eligibility.enabled && !serverDisableReason;
                      const disabledReason = serverDisableReason || eligibility.reason;
                      const isEvt0Restricted = Number(evt.Evt_No) === 0 && !isClubAllowedForEvent0(effectiveClubForEvent0);

                      return (
                        <div
                          key={evt.Evt_No}
                          id={`thumb-event-${evt.Evt_No}`}
                          data-event-no={evt.Evt_No}
                          role="button"
                          tabIndex={isEnabled ? 0 : -1}
                          aria-disabled={!isEnabled}
                          aria-pressed={isSelected}
                          title={!isEnabled ? disabledReason : undefined}
                          onClick={() => isEnabled && handleToggleEvent(evt)}
                          onKeyDown={(e) => {
                            if (!isEnabled) return;
                            if (e.key === ' ' || e.key === 'Spacebar') {
                              e.preventDefault();
                              handleToggleEvent(evt);
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              // Select event if not already selected
                              if (!isSelected) {
                                handleToggleEvent(evt);
                              }
                              // Then focus moves to fee status combo
                              const feeSelect = document.getElementById('fee-status-select') as HTMLSelectElement | null;
                              feeSelect?.focus();
                            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const cards = Array.from(document.querySelectorAll<HTMLElement>('[id^="thumb-event-"]:not([aria-disabled="true"])'));
                              const currentIdx = cards.indexOf(e.currentTarget);
                              if (currentIdx >= 0 && currentIdx < cards.length - 1) {
                                cards[currentIdx + 1]?.focus();
                                cards[currentIdx + 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                              } else {
                                const feeSelect = document.getElementById('fee-status-select') as HTMLSelectElement | null;
                                feeSelect?.focus();
                              }
                            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                              e.preventDefault();
                              const cards = Array.from(document.querySelectorAll<HTMLElement>('[id^="thumb-event-"]:not([aria-disabled="true"])'));
                              const currentIdx = cards.indexOf(e.currentTarget);
                              if (currentIdx > 0) {
                                cards[currentIdx - 1]?.focus();
                                cards[currentIdx - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                              }
                            }
                          }}
                          className={`rounded-lg p-1.5 sm:p-2 transition-all select-none flex flex-col justify-between border min-h-[48px] sm:min-h-[52px] focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 focus:ring-offset-[#002047] ${
                            isSelected
                              ? 'bg-amber-950/60 border-amber-400 ring-2 ring-amber-400/70 shadow-md cursor-pointer'
                              : isEnabled
                              ? 'bg-[#001736] border-[#133d73] hover:border-[#245ea8] hover:bg-[#002a5c] cursor-pointer'
                              : 'bg-[#00122b] border-[#0a2345] opacity-30 cursor-not-allowed pointer-events-none'
                          }`}
                        >
                          {/* Top Row: #Number + Name (No Final label on entry page per specification) */}
                          <div className="flex items-center gap-1 overflow-hidden">
                            <span className="text-amber-400 font-extrabold font-mono text-[11px] shrink-0">
                              #{evt.Evt_No}
                            </span>
                            <span className="text-white font-bold text-[11px] uppercase tracking-tight truncate">
                              {evt.Evt_Name}
                            </span>
                            {isEvt0Restricted && (
                              <span className="text-[8px] sm:text-[9px] font-black uppercase px-1 py-0.2 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 tracking-wider font-mono shrink-0 ml-auto" title="Restricted to Sasthitala Agrani / Agrani / SA / Sasthitala">
                                SA ONLY
                              </span>
                            )}
                          </div>

                          {/* Bottom Row: Shorthand Category + Price */}
                          <div className="flex items-center justify-between text-[10px] font-semibold mt-0.5 pt-0.5 border-t border-[#10386b]">
                            <span className="text-slate-300 font-mono truncate">
                              {getEventShorthand(evt)}
                            </span>
                            <span className="text-amber-400 font-mono font-bold shrink-0">
                              {settings.currencySymbol || '₹'}{Number(evt.Fees ?? 0).toFixed(0)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3 & 4. Fee Status & Calculated Fee (Kept right together with keypad & event cards) */}
                <div className="grid grid-cols-2 gap-2.5 items-center pt-0.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="fee-status-select" className="block text-xs font-semibold text-slate-200">
                        Fee Status
                      </label>
                    </div>
                    <select
                      id="fee-status-select"
                      value={feeStatus}
                      onChange={(e) => setFeeStatus(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSubmit(e);
                        }
                      }}
                      className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#001736] border border-amber-400/80 text-white text-xs sm:text-sm font-bold focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all cursor-pointer shadow-inner"
                    >
                      {mode === 'client' ? (
                        <>
                          <option value="Due">Due</option>
                          <option value="Paid">Paid</option>
                        </>
                      ) : (
                        <>
                          <option value="Due">Due</option>
                          <option value="Paid">Paid</option>
                          <option value="Free">Free</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Calculated Fee
                    </label>
                    <div className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#001736] border border-[#194a8a] text-amber-400 font-mono font-bold text-xs sm:text-sm flex items-center justify-between shadow-inner">
                      <span>{settings.currencySymbol || '₹'}{totalFees.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-300">
                        {selectedEvents.length} selected
                      </span>
                    </div>
                  </div>
                </div>

                {/* MOBILE PLACEMENT: Summary & 3 Action Buttons below Group 2 on small screens */}
                <div className="block md:hidden pt-2 space-y-2.5">
                  {/* Summary Strip & Reset Button */}
                  <div className="relative">
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#001736] border border-[#123c73] shadow-inner min-h-[42px]">
                      <button
                        type="button"
                        id="btn-open-summary-popup-mobile"
                        onClick={() => setShowSummaryPopup(true)}
                        className="flex-1 text-left text-xs font-bold text-slate-100 hover:text-amber-400 transition-colors cursor-pointer truncate"
                        title="Click to view detailed Accounts & Registration Summary"
                      >
                        ({stats.count} Reg (C:{stats.cCount}/B:{stats.bCount}/G:{stats.gCount}) | ₹{stats.totalFees} (P:₹{stats.paidFees}/D:₹{stats.dueFees}))
                      </button>

                      <button
                        type="button"
                        id="btn-reset-form-mobile"
                        onClick={resetForm}
                        className="shrink-0 px-2 py-1 rounded-lg bg-[#002c61] hover:bg-[#003a7d] active:scale-95 text-slate-100 border border-[#194a8a] flex items-center gap-1 text-[11px] font-semibold transition-all cursor-pointer"
                        title="Reset fields (Client club name is preserved)"
                      >
                        <RotateCcw className="w-3 h-3 text-amber-400" />
                        <span>Reset</span>
                      </button>
                    </div>

                    {/* Feedback Popup Overlay */}
                    {feedbackMsg && (
                      <div
                        role="alert"
                        className={`absolute inset-0 z-30 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xl transition-all duration-300 animate-in fade-in zoom-in-95 ${
                          feedbackMsg.type === 'success'
                            ? 'bg-[#064e3b] border-2 border-emerald-400 text-emerald-50 shadow-emerald-950/90'
                            : 'bg-[#881337] border-2 border-rose-400 text-rose-50 shadow-rose-950/90'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {feedbackMsg.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
                          )}
                          <span className="truncate text-xs font-black tracking-wide">{feedbackMsg.text}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFeedbackMsg(null)}
                          className="p-1 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 3 Action Buttons on mobile & tablet */}
                  <div className="grid grid-cols-12 gap-2">
                    <button
                      type="button"
                      id="btn-view-edit-list-mobile"
                      disabled={mode === 'client' && (settings?.clientResponseEnabled === false)}
                      onClick={() => onNavigateToCandidates()}
                      className="col-span-4 py-2.5 px-2 rounded-xl bg-[#881337] hover:bg-[#9f1239] active:scale-98 text-white font-black text-xs flex items-center justify-center gap-1 shadow-lg transition-all cursor-pointer truncate"
                    >
                      <span className="flex items-center justify-center gap-0.5 truncate">
                        <span>Edit/</span>
                        <Eye className="w-3.5 h-3.5 shrink-0 inline text-slate-100" />
                        <span>({stats.count})</span>
                      </span>
                    </button>

                    <button
                      type="submit"
                      id="btn-submit-enroll-mobile"
                      disabled={isSubmitting || selectedEvents.length === 0 || !name.trim()}
                      className="col-span-4 py-2.5 px-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs flex items-center justify-center gap-1 shadow-lg shadow-amber-500/10 transition-all cursor-pointer truncate"
                    >
                      <UserPlus className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                      <span className="truncate">{candidateToEdit ? 'Update' : '+ Enroll'}</span>
                    </button>

                    <button
                      type="button"
                      id="btn-send-sync-mobile"
                      onClick={onSyncTrigger}
                      disabled={isSyncing}
                      className="col-span-4 py-2.5 px-2 rounded-xl bg-[#15803d] hover:bg-[#16a34a] active:scale-98 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-1 shadow-lg transition-all cursor-pointer truncate"
                    >
                      <Send className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-pulse' : ''}`} />
                      <span className="truncate">
                        {isSyncing ? `Sending...` : `Send (${unsyncedCount})`}
                      </span>
                    </button>
                  </div>

                  {/* Serverside & Tablet portrait (sm to md screens): Last 2 entries below 3 buttons */}
                  {mode === 'server' && (
                    <div className="hidden sm:block md:hidden">
                      <LastTwoEntriesDisplay candidates={candidates} events={events} onEditCandidate={onEditCandidate} />
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* Bottom scroll anchor */}
            <div ref={bottomScrollAnchorRef} className="h-1" />
          </form>

        </div>
      </div>

      {/* MODAL 1: REGISTRATION & FEES POPUP (#002047 navy theme) */}
      {showSummaryPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#002047] border border-[#164685] rounded-2xl max-w-xl w-full h-[90vh] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95">
            {/* Compact Modal Header */}
            <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[#123c73] bg-[#001736] shrink-0">
              <div className="flex items-baseline gap-2 min-w-0 truncate">
                <h3 className="font-black text-sm sm:text-base text-amber-400 leading-tight shrink-0">
                  Registration & Fees
                </h3>
                <span className="text-[11px] text-slate-300 font-semibold truncate">
                  • <span className="text-white">{clientClubName}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSummaryPopup(false);
                  setSummaryFeeDetail(null);
                  setActiveSummaryRowPopup(null);
                }}
                className="p-1 text-slate-300 hover:text-white rounded-lg hover:bg-[#002c61] transition-colors shrink-0 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Miniature Summary + Maximized Candidate List */}
            <div className="p-2.5 sm:p-3 flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
              {/* Miniature Stat Metric Tiles + Breakdown & Right-Aligned Compact Total Fees */}
              <div className="shrink-0 space-y-1.5">
                <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                  <div className="bg-[#002857] px-1.5 py-1 rounded-lg border border-[#164685] text-center flex flex-col justify-center">
                    <div className="text-[9px] sm:text-[10px] leading-tight text-slate-300 font-semibold truncate">Total Reg</div>
                    <div className="text-xs sm:text-sm font-mono font-black text-white leading-tight mt-0.5">{stats.count}</div>
                  </div>
                  <div className="bg-[#002857] px-1.5 py-1 rounded-lg border border-[#164685] text-center flex flex-col justify-center">
                    <div className="text-[9px] sm:text-[10px] leading-tight text-slate-300 font-semibold truncate">Categories</div>
                    <div className="text-[9px] sm:text-[11px] font-mono font-bold text-amber-400 leading-tight mt-0.5 flex flex-wrap items-center justify-center gap-x-1">
                      <span>C:{stats.cCount}</span>
                      <span>B:{stats.bCount}</span>
                      <span>G:{stats.gCount}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSummaryFeeDetail((prev) => (prev === 'paid' ? null : 'paid'))}
                    title="Click to view paid candidate count by category"
                    className={`bg-[#002857] hover:bg-[#00316b] px-1.5 py-1 rounded-lg border text-center flex flex-col justify-center cursor-pointer transition-colors ${
                      summaryFeeDetail === 'paid'
                        ? 'border-emerald-400 ring-1 ring-emerald-400/60'
                        : 'border-[#164685]'
                    }`}
                  >
                    <div className="text-[9px] sm:text-[10px] leading-tight text-emerald-400 font-semibold truncate">Paid (P)</div>
                    <div className="text-xs sm:text-sm font-mono font-black text-emerald-400 leading-tight mt-0.5 truncate">
                      ₹{stats.paidFees}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSummaryFeeDetail((prev) => (prev === 'due' ? null : 'due'))}
                    title="Click to view due candidate count by category"
                    className={`bg-[#002857] hover:bg-[#00316b] px-1.5 py-1 rounded-lg border text-center flex flex-col justify-center cursor-pointer transition-colors ${
                      summaryFeeDetail === 'due'
                        ? 'border-rose-400 ring-1 ring-rose-400/60'
                        : 'border-[#164685]'
                    }`}
                  >
                    <div className="text-[9px] sm:text-[10px] leading-tight text-rose-400 font-semibold truncate">Due (D)</div>
                    <div className="text-xs sm:text-sm font-mono font-black text-rose-400 leading-tight mt-0.5 truncate">
                      ₹{stats.dueFees}
                    </div>
                  </button>
                </div>

                {/* Below Total Reg (Left): Paid/Due Category Count Breakdown | Right: Reduced-Width Total Fees */}
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="min-w-0">
                    {summaryFeeDetail === 'paid' && (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-[10px] sm:text-[11px] font-mono font-bold">
                        <span className="font-sans text-emerald-400">Paid:</span>
                        <span>{stats.paidCount}={stats.paidC}C+{stats.paidB}B+{stats.paidG}G</span>
                      </div>
                    )}
                    {summaryFeeDetail === 'due' && (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-950/90 border border-rose-500/50 text-rose-300 text-[10px] sm:text-[11px] font-mono font-bold">
                        <span className="font-sans text-rose-400">Due:</span>
                        <span>{stats.dueCount}={stats.dueC}C+{stats.dueB}B+{stats.dueG}G</span>
                      </div>
                    )}
                  </div>

                  <div className="ml-auto w-fit bg-[#001736] px-2.5 py-1 rounded-lg border border-amber-400/40 inline-flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-slate-200 whitespace-nowrap">Total Fees:</span>
                    <span className="text-xs sm:text-sm font-mono font-black text-amber-400 whitespace-nowrap">
                      {settings.currencySymbol || '₹'}{stats.totalFees.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Candidate Quick Table - Maximized Height */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-1.5 shrink-0">
                  <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Enrolled Candidates ({stats.candidatesList.length})
                  </h4>
                  <span className="text-[11px] font-mono font-bold text-sky-300">
                    Free: {stats.freeCount}
                  </span>
                </div>
                {stats.candidatesList.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No candidates registered yet for this club.
                  </p>
                ) : (
                  <div
                    ref={summaryListContainerRef}
                    className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 pb-2"
                  >
                    {stats.candidatesList.map((cand, idx) => {
                      const rowKey = `${cand.id || cand.chestNo || idx}-${idx}`;
                      const feeStUpper = (cand.feeStatus || '').toUpperCase();
                      const isDueStatus = feeStUpper.includes('DUE') || feeStUpper.includes('UNPAID');
                      const isFreeStatus = feeStUpper.includes('FREE') || feeStUpper.includes('EXEMPT');
                      const isPopupVisible = activeSummaryRowPopup?.key === rowKey;
                      const shortGender = getShortGenderDisplay(cand);
                      const rawHeight = cand.height?.trim() ? cand.height.trim() : 'ALL';
                      const enrolledEventsText = getEventsDisplay(cand);

                      return (
                        <div
                          key={rowKey}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            if (activeSummaryRowPopup?.key === rowKey) {
                              setActiveSummaryRowPopup(null);
                              return;
                            }
                            const rowRect = e.currentTarget.getBoundingClientRect();
                            const containerRect = summaryListContainerRef.current?.getBoundingClientRect();
                            const spaceBelow = containerRect ? containerRect.bottom - rowRect.bottom : 100;
                            const spaceAbove = containerRect ? rowRect.top - containerRect.top : 0;
                            const placement: 'above' | 'below' =
                              spaceBelow >= 44 || spaceBelow >= spaceAbove ? 'below' : 'above';
                            setActiveSummaryRowPopup({ key: rowKey, placement });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (activeSummaryRowPopup?.key === rowKey) {
                                setActiveSummaryRowPopup(null);
                                return;
                              }
                              const rowRect = e.currentTarget.getBoundingClientRect();
                              const containerRect = summaryListContainerRef.current?.getBoundingClientRect();
                              const spaceBelow = containerRect ? containerRect.bottom - rowRect.bottom : 100;
                              const spaceAbove = containerRect ? rowRect.top - containerRect.top : 0;
                              const placement: 'above' | 'below' =
                                spaceBelow >= 44 || spaceBelow >= spaceAbove ? 'below' : 'above';
                              setActiveSummaryRowPopup({ key: rowKey, placement });
                            }
                          }}
                          className={`relative flex items-center justify-between px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors select-none ${
                            isPopupVisible
                              ? 'z-20 bg-[#002857] border-amber-400/70'
                              : 'bg-[#001736] hover:bg-[#00214a] border-[#123c73]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="font-mono font-bold text-amber-400">
                              {mode === 'server' ? (cand.chestNo || (idx + 1)) : (cand.chestNo && Number(cand.chestNo) >= 101 ? cand.chestNo : (cand.localRecordNo || cand.chestNo || (idx + 1)))}
                            </span>
                            <span className="font-bold text-white uppercase truncate">
                              {cand.name}
                            </span>
                            <span className="text-[10px] text-slate-300 shrink-0">
                              ({shortGender}/{rawHeight})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-slate-200">
                              ₹{Number(cand.totalFees || 0).toFixed(0)}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isDueStatus
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : isFreeStatus
                                ? 'bg-sky-950 text-sky-300 border border-sky-800'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}>
                              {isDueStatus ? 'Due' : isFreeStatus ? 'Free' : 'Paid'}
                            </span>
                          </div>

                          {/* Flash Popup for Enrolled Events just above or below row */}
                          {isPopupVisible && (
                            <div
                              className={`absolute left-2 sm:left-3 max-w-[calc(100%-1rem)] z-30 pointer-events-none animate-in fade-in zoom-in-95 duration-150 ${
                                activeSummaryRowPopup.placement === 'above'
                                  ? 'bottom-full mb-1.5'
                                  : 'top-full mt-1.5'
                              }`}
                            >
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#002f6c] border border-amber-400 shadow-xl shadow-black/70 text-[11px] sm:text-xs">
                                <span className="text-slate-200 font-semibold shrink-0">Events:</span>
                                <span className="font-mono font-black text-amber-300 break-words">
                                  {enrolledEventsText}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Compact Modal Footer */}
            <div className="px-3.5 py-2 border-t border-[#123c73] bg-[#001736] flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowSummaryPopup(false);
                  setSummaryFeeDetail(null);
                  setActiveSummaryRowPopup(null);
                }}
                className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

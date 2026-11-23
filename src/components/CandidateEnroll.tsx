import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  SportEvent, 
  Club, 
  Candidate, 
  SportsMeetSettings 
} from '../types';
import { api } from '../services/api';
import { isEventCardEnabled, parseHeightToInches, isClubAllowedForEvent0, isDirectEvent, getAdditionalEventsForCandidate } from '../utils/heightRules';
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
  Search,
  Pencil,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Lock,
  Ban,
  XCircle,
  Eye,
  History,
} from 'lucide-react';
import { EventHeat, EventResult } from '../types';
import { 
  getCandidateRestrictionStatus, 
  getCandidateEditRestrictedMessage, 
  getCandidateQualifiedEvents,
  getServerEventEnrollmentDisableReason
} from '../utils/qualificationRules';

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

  // Modals & Redesigned View/Edit Screen
  const [showViewEditModal, setShowViewEditModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryPill, setActiveCategoryPill] = useState<'ALL' | 'C' | 'B' | 'G'>('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [expandedModalRowId, setExpandedModalRowId] = useState<string | null>(null);
  const [togglingDirectKey, setTogglingDirectKey] = useState<string | null>(null);

  // Direct events: events where both Height and Gender are "ALL"
  const directEvents = useMemo(() => {
    return [...events]
      .filter((e) => isDirectEvent(e))
      .sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));
  }, [events]);

  const handleToggleQuickEventModal = async (cand: Candidate, targetEvt: SportEvent) => {
    if (mode !== 'server') return;
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

  const toggleModalRowExpand = (rowKey: string) => {
    setDeleteConfirmId(null);
    setCancelConfirmId(null);
    setExpandedModalRowId((prev) => (prev === rowKey ? null : rowKey));
  };

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

  // Dedicated Separate Edit Candidate State (Attachments 1 & 2)
  const [editingCandidateItem, setEditingCandidateItem] = useState<Candidate | null>(null);
  const [editName, setEditName] = useState('');
  const [editClub, setEditClub] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editGender, setEditGender] = useState('B');
  const [editFeeStatus, setEditFeeStatus] = useState('Due');
  const [editSelectedEvents, setEditSelectedEvents] = useState<number[]>([]);
  const [editErrorMsg, setEditErrorMsg] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Multi-select Events Modal (Attachment 2)
  const [showSelectEventsModal, setShowSelectEventsModal] = useState(false);
  const [tempSelectedEvents, setTempSelectedEvents] = useState<number[]>([]);

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

  // Candidate Group Code for View/Edit list: C (Children/All), B (Boys), G (Girls)
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

  // Height display for View/Edit list
  const getHeightDisplay = (cand: Candidate): string => {
    if (!cand.height || cand.height.trim().toUpperCase() === 'ALL') return 'All';
    return cand.height.replace(/`/g, "'");
  };

  // Events display for View/Edit list (sorted ascending)
  const getEventsDisplay = (cand: Candidate): string => {
    if (!cand.selectedEvents || cand.selectedEvents.length === 0) return '-';
    return [...cand.selectedEvents]
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)
      .join(', ');
  };

  // Target candidates for View/Edit screen (Strict deduplication by ID and normalized Name)
  const targetClubCandidates = useMemo(() => {
    let list = candidates;
    if (mode === 'client' && clientClubName.trim()) {
      list = candidates.filter(c => (c.club || '').trim().toUpperCase() === clientClubName.trim().toUpperCase());
    }

    const seenNames = new Set<string>();
    const seenIds = new Set<string>();
    const deduplicated: Candidate[] = [];

    for (const c of list) {
      if (!c) continue;
      const id = c.id;
      const normalizedName = (c.name || '').trim().toUpperCase();

      if (id && seenIds.has(id)) continue;
      if (normalizedName && seenNames.has(normalizedName)) continue;

      if (id) seenIds.add(id);
      if (normalizedName) seenNames.add(normalizedName);
      deduplicated.push(c);
    }
    return deduplicated;
  }, [candidates, clientClubName, mode]);

  // Category pill counts for View/Edit screen
  const pillCounts = useMemo(() => {
    let cCount = 0;
    let bCount = 0;
    let gCount = 0;
    targetClubCandidates.forEach(cand => {
      const code = getGroupCode(cand);
      if (code === 'B') bCount++;
      else if (code === 'G') gCount++;
      else cCount++;
    });
    return {
      all: targetClubCandidates.length,
      c: cCount,
      b: bCount,
      g: gCount,
    };
  }, [targetClubCandidates]);

  // Filtered candidate list for View/Edit screen
  const filteredViewEditCandidates = useMemo(() => {
    const list = targetClubCandidates.filter(c => {
      if (activeCategoryPill !== 'ALL') {
        const code = getGroupCode(c);
        if (code !== activeCategoryPill) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchClub = (c.club || '').toLowerCase().includes(q);
        const matchEvents = (c.selectedEvents || []).some(no => String(no).includes(q));
        const matchChest = String(mode === 'server' ? (c.chestNo || '') : (c.chestNo || c.localRecordNo || '')).includes(q);
        if (!matchName && !matchClub && !matchEvents && !matchChest) return false;
      }
      return true;
    });

    if (mode === 'client') {
      // "in client side page view/edit list the last entry should appear at top"
      return [...list].sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          if (diff !== 0) return diff;
        }
        const numA = Number(a.chestNo && Number(a.chestNo) >= 101 ? a.chestNo : (a.localRecordNo || a.chestNo)) || 0;
        const numB = Number(b.chestNo && Number(b.chestNo) >= 101 ? b.chestNo : (b.localRecordNo || b.chestNo)) || 0;
        if (numB !== numA) return numB - numA;
        return targetClubCandidates.indexOf(b) - targetClubCandidates.indexOf(a);
      });
    } else {
      // "view all candidate list in descending chest number wise in server page"
      return [...list].sort((a, b) => (Number(b.chestNo) || 0) - (Number(a.chestNo) || 0));
    }
  }, [targetClubCandidates, activeCategoryPill, searchQuery, mode]);

  // Trigger candidate editing from View/Edit list (DO NOT return to main enroll page)
  const handleInitiateEdit = (cand: Candidate) => {
    if (cand.isCancelled || cand.status === 'cancelled') {
      alert(`Chest #${cand.chestNo} for candidate "${cand.name}" has been cancelled. Details cannot be edited.`);
      return;
    }

    if (mode === 'server') {
      const restrictionStatus = getCandidateRestrictionStatus(cand, events, heats, results, mode);
      if (restrictionStatus.isRestricted) {
        alert(getCandidateEditRestrictedMessage(cand, restrictionStatus));
        return;
      }
    }

    setEditingCandidateItem(cand);
    setEditName(cand.name || '');
    setEditClub(cand.club || clientClubName || '');
    setEditHeight(cand.height === 'ALL' ? '' : (cand.height || ''));

    // Normalize gender for dropdown: B, G, C, ALL
    const g = (cand.gender || '').toUpperCase();
    if (g === 'BOYS' || g === 'B') setEditGender('B');
    else if (g === 'GIRLS' || g === 'G') setEditGender('G');
    else if (g === 'CHILDRENS' || g === 'CHILDREN' || g === 'C') setEditGender('C');
    else setEditGender('ALL');

    // Normalize fee status: Due, Paid, Free (In client mode: only Due, Paid)
    const fs = (cand.feeStatus || '').toUpperCase();
    if (fs.includes('PAID')) setEditFeeStatus('Paid');
    else if (mode !== 'client' && (fs.includes('FREE') || fs.includes('EXEMPT'))) setEditFeeStatus('Free');
    else setEditFeeStatus('Due');

    setEditSelectedEvents(cand.selectedEvents ? [...cand.selectedEvents] : []);
    setEditErrorMsg(null);
  };

  // Auto-remove Event #0 in Candidate Edit Modal if edited club is not allowed
  useEffect(() => {
    if (editingCandidateItem && !isClubAllowedForEvent0(editClub)) {
      if (editSelectedEvents.includes(0)) {
        setEditSelectedEvents(prev => prev.filter(n => n !== 0));
      }
      if (tempSelectedEvents.includes(0)) {
        setTempSelectedEvents(prev => prev.filter(n => n !== 0));
      }
    }
  }, [editingCandidateItem, editClub]);

  // Handle Edit Name change with duplicate detection
  const handleEditNameChange = (val: string) => {
    const uppercaseVal = val.toUpperCase();
    setEditName(uppercaseVal);
    const trimmed = uppercaseVal.trim();
    if (trimmed && editingCandidateItem) {
      const isDuplicate = candidates.some(
        c => c.id !== editingCandidateItem.id && (c.name || '').trim().toUpperCase() === trimmed
      );
      if (isDuplicate) {
        setEditErrorMsg(`Duplicate Candidate Name! "${trimmed}" is already registered. Duplicate candidate names are not allowed.`);
      } else {
        setEditErrorMsg(null);
      }
    } else {
      setEditErrorMsg(null);
    }
  };

  // Criteria display for multi-select events modal (Attachment 2)
  const criteriaGenderDisplay = useMemo(() => {
    if (editGender === 'B') return 'BOYS';
    if (editGender === 'G') return 'GIRLS';
    if (editGender === 'C') return 'CHILDRENS';
    return 'ALL';
  }, [editGender]);

  const criteriaHeightDisplay = useMemo(() => {
    return editHeight || 'ALL';
  }, [editHeight]);

  // Eligible events for multi-select box:
  // - Keeping event no 15 available for all candidates.
  // - When combo value of Height & Gender both is "ALL", enable selection ONLY for Event no 15.
  // - Event selection for a candidate will not be possible for multiple gendered events (only higher events under same gender).
  const eligibleEditEvents = useMemo(() => {
    const isBothAll = (!editHeight || editHeight === 'ALL') && (!editGender || editGender === 'ALL');

    // If both Height & Gender are "ALL", enable selection ONLY for Event no 15
    if (isBothAll) {
      return events.filter(evt => Number(evt.Evt_No) === 15);
    }

    const targetGender = criteriaGenderDisplay; // 'BOYS' | 'GIRLS' | 'CHILDRENS' | 'ALL'
    const candidateInches = parseHeightToInches(editHeight);

    return events.filter(evt => {
      const evtNo = Number(evt.Evt_No);

      // Event #15 ("GO AS YOU LIKE") is always available for all candidates
      if (evtNo === 15) {
        return true;
      }

      // Gender check: only allow events strictly under the selected gender (no cross-gender)
      if (targetGender && targetGender !== 'ALL') {
        const evtGenderUpper = (evt.Gender || '').toUpperCase();
        if (evtGenderUpper !== targetGender) {
          return false;
        }
      }

      // Height check: only selected and higher events under same gender
      if (editHeight && editHeight !== 'ALL') {
        if (evt.Height !== 'ALL') {
          const eventInches = parseHeightToInches(evt.Height);
          if (eventInches < candidateInches) {
            return false;
          }
        }
      }

      return true;
    }).sort((a, b) => {
      // Keep event 15 at the end or sort naturally
      const numA = Number(a.Evt_No);
      const numB = Number(b.Evt_No);
      if (numA === 15) return 1;
      if (numB === 15) return -1;
      const hA = parseHeightToInches(a.Height);
      const hB = parseHeightToInches(b.Height);
      if (hA !== hB) return hA - hB;
      return numA - numB;
    });
  }, [events, criteriaGenderDisplay, editHeight, editGender]);

  // Toggle selection in event multi-select modal:
  // Ensure that event selection cannot mix multiple genders (e.g. Children and Boys / Children and Girls / Girls and Boys)
  // while allowing Event no 15 alongside any gender's events.
  const toggleTempEvent = (evtNo: number) => {
    // Rule: Always disable event no 0 where club name not in Sasthitala Agrani or Agrani or SA or Sasthitala
    if (evtNo === 0 && !isClubAllowedForEvent0(editClub)) {
      return;
    }

    setTempSelectedEvents(prev => {
      if (prev.includes(evtNo)) {
        return prev.filter(no => no !== evtNo);
      } else {
        const clickedEvt = events.find(e => Number(e.Evt_No) === evtNo);
        const clickedGender = (clickedEvt?.Gender || '').toUpperCase();

        // If clicked event is event 15 or Gender ALL, it is compatible with anything
        if (evtNo === 15 || clickedGender === 'ALL') {
          return [...prev, evtNo].sort((a, b) => a - b);
        }

        // Check if there are already selected events with a different gender (excluding event 15 / ALL)
        const hasOtherGender = prev.some(existingNo => {
          if (existingNo === 15) return false;
          const ev = events.find(e => Number(e.Evt_No) === existingNo);
          const g = (ev?.Gender || '').toUpperCase();
          return g !== 'ALL' && g !== clickedGender;
        });

        if (hasOtherGender) {
          // If incompatible gender event was previously selected, remove other gendered events and keep this one + event 15
          const sanitizedPrev = prev.filter(existingNo => {
            if (existingNo === 15) return true;
            const ev = events.find(e => Number(e.Evt_No) === existingNo);
            const g = (ev?.Gender || '').toUpperCase();
            return g === clickedGender || g === 'ALL';
          });
          return [...sanitizedPrev, evtNo].sort((a, b) => a - b);
        }

        return [...prev, evtNo].sort((a, b) => a - b);
      }
    });
  };

  // Confirm selected events from modal back to edit form
  const confirmSelectEvents = () => {
    setEditSelectedEvents(tempSelectedEvents);
    setShowSelectEventsModal(false);
  };

  // Save changes from Edit Candidate modal
  const handleSaveCandidateEdits = async () => {
    if (!editingCandidateItem) return;
    const trimmedName = editName.trim().toUpperCase();
    if (!trimmedName) {
      setEditErrorMsg('Candidate name is required.');
      return;
    }

    // Duplicate candidate name check
    const duplicate = candidates.find(
      c => c.id !== editingCandidateItem.id && (!editingCandidateItem.chestNo || Number(c.chestNo) !== Number(editingCandidateItem.chestNo)) && (c.name || '').trim().toUpperCase() === trimmedName
    );
    if (duplicate) {
      setEditErrorMsg(`Duplicate Candidate Name! "${trimmedName}" is already registered (${duplicate.club || 'Independent'}). Duplicate names are not allowed.`);
      return;
    }

    if (mode === 'server') {
      const restrictionStatus = getCandidateRestrictionStatus(editingCandidateItem, events, heats, results, mode);
      if (restrictionStatus.isRestricted) {
        setEditErrorMsg(getCandidateEditRestrictedMessage(editingCandidateItem, restrictionStatus));
        return;
      }
    }

    if (editSelectedEvents.length === 0) {
      setEditErrorMsg('Please tap to select at least one event from the multi-select box.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const targetGender = criteriaGenderDisplay;
      const targetClub = editClub.trim().toUpperCase() || clientClubName || 'Independent';

      if (editSelectedEvents.includes(0) && !isClubAllowedForEvent0(targetClub)) {
        setEditErrorMsg('Event #0 is restricted to Sasthitala Agrani, Agrani, SA, or Sasthitala club members only.');
        setIsSavingEdit(false);
        return;
      }

      // Calculate total fees
      let totalFees = 0;
      if (editFeeStatus !== 'Free' && editFeeStatus !== 'Exempted [E]') {
        for (const evtNo of editSelectedEvents) {
          const ev = events.find(e => Number(e.Evt_No) === Number(evtNo));
          totalFees += ev && ev.Fees !== undefined ? Number(ev.Fees) : 0;
        }
      }

      const updatedCand: Candidate = {
        ...editingCandidateItem,
        name: trimmedName,
        club: targetClub,
        gender: targetGender,
        height: editHeight || 'ALL',
        feeStatus: editFeeStatus,
        selectedEvents: editSelectedEvents,
        totalFees,
        updatedAt: new Date().toISOString(),
        isDirty: true,
        synced: false,
      };

      await onSaveCandidate(updatedCand);

      setFeedbackMsg({
        type: 'success',
        text: `Candidate "${trimmedName}" updated successfully!`,
      });
      setEditingCandidateItem(null);
    } catch (err: any) {
      setEditErrorMsg(err.message || 'Failed to update candidate details.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete candidate handler
  const handleInitiateDelete = async (id: string) => {
    const cand = candidates.find(c => c.id === id);
    if (mode === 'server' && cand && (Number(cand.chestNo) >= 101 || cand.chestNo || cand.synced)) {
      alert(
        `Deletion Prohibited!\n\nCandidate "${cand.name}" has an official generated Chest #${cand.chestNo}. Deletion of saved candidates is strictly not permitted under any circumstances.\n\nPlease use the "Cancel Chest No." option to deactivate this chest number.`
      );
      setDeleteConfirmId(null);
      return;
    }
    if (onDeleteCandidate) {
      await onDeleteCandidate(id);
    }
    setDeleteConfirmId(null);
    setFeedbackMsg({
      type: 'success',
      text: `Candidate "${(cand?.name || '').toUpperCase()}" deleted successfully.`,
    });
  };

  // Cancel candidate chest number handler
  const handleInitiateCancelChest = async (cand: Candidate) => {
    if (
      !window.confirm(
        `Are you sure you want to cancel Chest #${cand.chestNo} for candidate "${cand.name}"?\n\n• Deletion of saved candidate records is strictly prohibited under all circumstances.\n• This chest number will be marked as CANCELLED.\n• This candidate will not appear in any hit lists (heats).`
      )
    ) {
      return;
    }
    if (onCancelChest) {
      await onCancelChest(cand.id);
    }
    setFeedbackMsg({
      type: 'success',
      text: `Chest #${cand.chestNo} for "${cand.name}" has been cancelled and excluded from all hit lists.`,
    });
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
                      onClick={() => setShowViewEditModal(true)}
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
                      onClick={() => setShowViewEditModal(true)}
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

      {/* MODAL 3: VIEW/EDIT CANDIDATES SCREEN (Matches All Candidates page style & expandable row layout) */}
      {showViewEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-slate-200 border border-slate-300 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 animate-in fade-in zoom-in-95">
            
            {/* Top Bar: Amber-outlined Search Box with close 'X' button */}
            <div className="p-3 bg-slate-200 border-b border-slate-300">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-slate-100 border-2 border-amber-500 rounded-2xl px-3 py-2 shadow-2xs">
                  <Search className="w-5 h-5 text-amber-600 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim() && filteredViewEditCandidates.length === 1) {
                        e.preventDefault();
                        const singleCand = filteredViewEditCandidates[0];
                        const rowKey = singleCand.id || `${singleCand.chestNo}-0`;
                        setDeleteConfirmId(null);
                        setCancelConfirmId(null);
                        setExpandedModalRowId(rowKey);
                        const isCancelled = singleCand.isCancelled || singleCand.status === 'cancelled';
                        const isRestricted = getCandidateRestrictionStatus(singleCand, events, heats, results, mode).isRestricted;
                        if (!isCancelled && !isRestricted) {
                          handleInitiateEdit(singleCand);
                        }
                      }
                    }}
                    placeholder="Search chest no, name, club, events..."
                    className="w-full bg-transparent text-slate-900 placeholder:text-slate-500 text-xs sm:text-sm font-semibold px-2.5 focus:outline-hidden"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-slate-500 hover:text-slate-900 p-0.5 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Close View/Edit Screen Button */}
                <button
                  type="button"
                  id="btn-close-view-edit-modal"
                  onClick={() => setShowViewEditModal(false)}
                  className="p-2 text-slate-700 hover:text-slate-950 hover:bg-slate-300/80 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Close and return to Enroll"
                >
                  <X className="w-6 h-6 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Category Filter Pills: ALL, C, B, G */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 px-3 py-1.5 bg-slate-200/70 border-b border-slate-300">
              {/* ALL */}
              <button
                type="button"
                id="pill-cat-all"
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
                id="pill-cat-c"
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
                id="pill-cat-b"
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
                id="pill-cat-g"
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

            {/* Table Header: Sl. | Chest | Name & Club | Info */}
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

            {/* Candidates Expandable List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-300/80 bg-slate-100">
              {filteredViewEditCandidates.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs sm:text-sm font-medium">
                  No candidates found matching your criteria.
                </div>
              ) : (
                filteredViewEditCandidates.map((cand, idx) => {
                  const rowKey = cand.id || `${cand.chestNo}-${idx}`;
                  const slNumber = filteredViewEditCandidates.length - idx;
                  const shortGender = getShortGenderDisplay(cand);
                  const heightStr = getHeightDisplay(cand);
                  const eventsStr = getEventsDisplay(cand);
                  const isExpanded = expandedModalRowId === rowKey;
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
                      {/* Collapsed Header Line: Click/tap anywhere on row header to expand/minimize */}
                      <div
                        onClick={() => toggleModalRowExpand(rowKey)}
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
                                toggleModalRowExpand(rowKey);
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
                            toggleModalRowExpand(rowKey);
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

                      {/* Expanded Details Section */}
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
                                          onClick={() => handleToggleQuickEventModal(cand, aEvt)}
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
                                          onClick={() => handleToggleQuickEventModal(cand, dEvt)}
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
                                  onClick={() => handleInitiateDelete(cand.id)}
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
                                      setFeedbackMsg({
                                        type: 'success',
                                        text: `Chest #${cand.chestNo} for "${cand.name}" has been cancelled and excluded from all hit lists.`,
                                      });
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
                                    onClick={() => handleInitiateEdit(cand)}
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

            {/* Bottom Summary Bar in View/Edit Screen */}
            <div className="px-4 py-2.5 bg-slate-200 border-t border-slate-300 flex items-center justify-between text-xs text-slate-700 font-medium">
              <span>Showing <span className="font-bold text-slate-950">{filteredViewEditCandidates.length}</span> of {targetClubCandidates.length} candidate(s)</span>
              <button
                type="button"
                onClick={() => setShowViewEditModal(false)}
                className="text-amber-800 font-bold hover:underline cursor-pointer"
              >
                Back to Enroll
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DEDICATED SEPARATE PAGE/MODAL: EDIT CANDIDATE DETAILS (Deep Grey Scheme) */}
      {editingCandidateItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in">
          <div className="border-2 border-yellow-400 rounded-3xl bg-[#202124] p-5 sm:p-6 shadow-2xl max-w-sm sm:max-w-md w-full space-y-4 text-neutral-100">
            
            {/* Title Header */}
            <h2 className="text-yellow-400 font-bold text-lg sm:text-xl">
              Edit Candidate ({mode === 'server' ? `Chest ${editingCandidateItem.chestNo || '—'}` : (editingCandidateItem.chestNo && Number(editingCandidateItem.chestNo) >= 101 ? `Chest ${editingCandidateItem.chestNo}` : `${editingCandidateItem.localRecordNo || editingCandidateItem.chestNo || 1}`)})
            </h2>

            {/* Form Fields */}
            <div className="space-y-3.5">
              
              {/* Field 1: Candidate Name (UPPERCASE) */}
              <div className="relative border border-neutral-500 rounded-xl px-3 pt-3 pb-2.5 bg-[#2b2d31] focus-within:border-yellow-400 transition-colors">
                <label className="absolute -top-2.5 left-3 px-1.5 bg-[#2b2d31] text-[11px] font-bold text-neutral-300 pointer-events-none">
                  Candidate Name (UPPERCASE)
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => handleEditNameChange(e.target.value)}
                  placeholder="CANDIDATE NAME"
                  className="w-full bg-transparent text-white font-bold text-sm sm:text-base uppercase tracking-wide focus:outline-hidden"
                />
              </div>

              {/* Field 2: Club Name (UPPERCASE) - Only for Server mode */}
              {mode === 'server' && (
                <div className="relative border border-neutral-500 rounded-xl px-3 pt-3 pb-2.5 bg-[#2b2d31] focus-within:border-yellow-400 transition-colors">
                  <label className="absolute -top-2.5 left-3 px-1.5 bg-[#2b2d31] text-[11px] font-bold text-neutral-300 pointer-events-none">
                    Club Name (UPPERCASE)
                  </label>
                  <input
                    type="text"
                    value={editClub}
                    onChange={(e) => setEditClub(e.target.value.toUpperCase())}
                    placeholder="CLUB NAME"
                    className="w-full bg-transparent text-white font-bold text-sm sm:text-base uppercase tracking-wide focus:outline-hidden"
                  />
                </div>
              )}

              {/* Fields 3 & 4: Height & Gender (Two Columns) */}
              <div className="grid grid-cols-2 gap-3">
                {/* Height */}
                <div className="relative border border-neutral-500 rounded-xl px-3 pt-3 pb-2 bg-[#2b2d31] focus-within:border-yellow-400 transition-colors">
                  <label className="absolute -top-2.5 left-3 px-1.5 bg-[#2b2d31] text-[11px] font-bold text-neutral-300 pointer-events-none">
                    Height
                  </label>
                  <select
                    value={editHeight}
                    onChange={(e) => {
                      const newHeight = e.target.value;
                      if (newHeight !== editHeight) {
                        setEditHeight(newHeight);
                        setEditSelectedEvents([]);
                        setTempSelectedEvents([]);
                      }
                    }}
                    className="w-full bg-transparent text-white font-bold text-sm sm:text-base focus:outline-hidden cursor-pointer"
                  >
                    <option value="ALL" className="bg-[#2b2d31] text-white">ALL</option>
                    {availableHeights.map(h => (
                      <option key={h} value={h} className="bg-[#2b2d31] text-white">{h}</option>
                    ))}
                  </select>
                </div>

                {/* Gender */}
                <div className="relative border border-neutral-500 rounded-xl px-3 pt-3 pb-2 bg-[#2b2d31] focus-within:border-yellow-400 transition-colors">
                  <label className="absolute -top-2.5 left-3 px-1.5 bg-[#2b2d31] text-[11px] font-bold text-neutral-300 pointer-events-none">
                    Gender
                  </label>
                  <select
                    value={editGender}
                    onChange={(e) => {
                      const newGender = e.target.value;
                      if (newGender !== editGender) {
                        setEditGender(newGender);
                        setEditSelectedEvents([]);
                        setTempSelectedEvents([]);
                      }
                    }}
                    className="w-full bg-transparent text-white font-bold text-sm sm:text-base focus:outline-hidden cursor-pointer"
                  >
                    <option value="B" className="bg-[#2b2d31] text-white">B</option>
                    <option value="G" className="bg-[#2b2d31] text-white">G</option>
                    <option value="C" className="bg-[#2b2d31] text-white">C</option>
                    <option value="ALL" className="bg-[#2b2d31] text-white">ALL</option>
                  </select>
                </div>
              </div>

              {/* Field 5: Selected Events (Tap to update) with Golden Pencil */}
              <div
                onClick={() => {
                  setTempSelectedEvents([...editSelectedEvents]);
                  setShowSelectEventsModal(true);
                }}
                className="relative border border-neutral-500 rounded-xl px-3 pt-3 pb-2.5 bg-[#2b2d31] cursor-pointer hover:border-yellow-400 transition-colors flex items-center justify-between group"
              >
                <label className="absolute -top-2.5 left-3 px-1.5 bg-[#2b2d31] text-[11px] font-bold text-neutral-300 group-hover:text-yellow-400 transition-colors pointer-events-none">
                  Selected Events (Tap to update)
                </label>
                <span className="text-yellow-400 font-extrabold text-sm sm:text-base font-mono truncate mr-2">
                  {editSelectedEvents.length > 0 ? editSelectedEvents.join(', ') : 'Tap to select events'}
                </span>
                <Pencil className="w-4 h-4 text-yellow-400 shrink-0 stroke-[2.5]" />
              </div>

              {/* Field 6: Fee Status */}
              <div className="relative border border-neutral-500 rounded-xl px-3 pt-3 pb-2 bg-[#2b2d31] focus-within:border-yellow-400 transition-colors">
                <label className="absolute -top-2.5 left-3 px-1.5 bg-[#2b2d31] text-[11px] font-bold text-neutral-300 pointer-events-none">
                  Fee Status
                </label>
                <select
                  value={editFeeStatus}
                  onChange={(e) => setEditFeeStatus(e.target.value)}
                  className="w-full bg-transparent text-white font-bold text-sm sm:text-base focus:outline-hidden cursor-pointer"
                >
                  <option value="Due" className="bg-[#2b2d31] text-white">Due</option>
                  <option value="Paid" className="bg-[#2b2d31] text-white">Paid</option>
                  {mode !== 'client' && (
                    <option value="Free" className="bg-[#2b2d31] text-white">Free</option>
                  )}
                </select>
              </div>

            </div>

            {/* Error Message for Duplicate Name or Missing Events */}
            {editErrorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{editErrorMsg}</span>
              </div>
            )}

            {/* Action Buttons: Cancel and Save Changes */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingCandidateItem(null);
                  setEditErrorMsg(null);
                }}
                className="flex-1 py-3 rounded-full bg-[#35373d] hover:bg-[#43464e] text-white font-bold border border-neutral-500 text-sm active:scale-98 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCandidateEdits}
                disabled={isSavingEdit || Boolean(editErrorMsg)}
                className="flex-1 py-3 rounded-full bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-black text-sm shadow-md active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MULTI-SELECT EVENTS LIST BOX MODAL (Deep Grey Scheme) */}
      {showSelectEventsModal && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in">
          <div className="border-2 border-yellow-400 rounded-3xl bg-[#202124] p-5 shadow-2xl max-w-sm sm:max-w-md w-full flex flex-col max-h-[85vh] text-neutral-100">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-neutral-700">
              <div>
                <h3 className="text-yellow-400 font-bold text-lg sm:text-xl">
                  Select Events
                </h3>
                <p className="text-neutral-400 text-xs font-semibold mt-0.5">
                  {(!editHeight || editHeight === 'ALL') && (!editGender || editGender === 'ALL')
                    ? 'Criteria: ALL / ALL • Event #15 Only'
                    : `Criteria: ${criteriaGenderDisplay} • ${criteriaHeightDisplay} & higher (Event #15 Open for All)`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSelectEventsModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            {/* Events List Scrollable */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1">
              {eligibleEditEvents.length === 0 ? (
                <div className="text-center py-10 text-neutral-400 text-xs">
                  No events found matching criteria ({criteriaGenderDisplay} • {criteriaHeightDisplay} & higher).
                </div>
              ) : (
                eligibleEditEvents.map((evt) => {
                  const isSelected = tempSelectedEvents.includes(evt.Evt_No);
                  const isEvt0Disabled = Number(evt.Evt_No) === 0 && !isClubAllowedForEvent0(editClub);
                  const serverDisableReason = getServerEventEnrollmentDisableReason(evt, results, mode);
                  const isDisabled = isEvt0Disabled || Boolean(serverDisableReason && !isSelected);
                  return (
                    <div
                      key={evt.Evt_No}
                      title={serverDisableReason || undefined}
                      onClick={() => !isDisabled && toggleTempEvent(evt.Evt_No)}
                      className={`rounded-2xl p-3 flex items-center gap-3 transition-all ${
                        isDisabled
                          ? 'opacity-35 bg-[#18191b] border border-neutral-800 cursor-not-allowed pointer-events-none select-none'
                          : isSelected
                          ? 'border-2 border-yellow-400 bg-[#2f3136] shadow-md shadow-yellow-500/10 cursor-pointer'
                          : 'border border-neutral-600 bg-[#27282c] hover:border-neutral-400 cursor-pointer'
                      }`}
                    >
                      {/* Checkbox Icon */}
                      <div
                        className={`w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors ${
                          isDisabled
                            ? 'border-2 border-neutral-700 bg-transparent'
                            : isSelected
                            ? 'bg-yellow-400 text-neutral-950 font-black'
                            : 'border-2 border-neutral-500 bg-transparent'
                        }`}
                      >
                        {isSelected && !isDisabled && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>

                      {/* Event Number Badge */}
                      <div
                        className={`w-7 h-7 rounded flex items-center justify-center font-black text-xs shrink-0 ${
                          isDisabled
                            ? 'bg-neutral-800 text-neutral-500'
                            : isSelected
                            ? 'bg-amber-400 text-neutral-950'
                            : 'bg-[#3b3e46] text-neutral-200'
                        }`}
                      >
                        #{evt.Evt_No}
                      </div>

                      {/* Event Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-extrabold text-xs sm:text-sm uppercase tracking-wide truncate ${isDisabled ? 'text-neutral-500' : 'text-white'}`}>
                            {evt.Evt_Name}
                          </span>
                          {isEvt0Disabled && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              Sasthitala Agrani Only
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-400 font-semibold truncate">
                          {evt.Gender} • {evt.Height} • {settings.currencySymbol || '₹'}{Number(evt.Fees ?? 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer with Selection Count, Cancel and Ok */}
            <div className="flex items-center justify-between pt-3 border-t border-neutral-700 gap-3">
              <div className="text-yellow-400 font-bold text-xs sm:text-sm">
                {tempSelectedEvents.length} event(s) selected
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSelectEventsModal(false)}
                  className="px-4 sm:px-5 py-2 rounded-full bg-[#35373d] hover:bg-[#43464e] text-white font-bold border border-neutral-500 text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSelectEvents}
                  className="px-5 sm:px-6 py-2 rounded-full bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-black text-xs sm:text-sm shadow-md transition-all active:scale-98 cursor-pointer"
                >
                  Ok
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

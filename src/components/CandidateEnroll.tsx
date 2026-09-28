import React, { useState, useEffect, useMemo } from 'react';
import { 
  SportEvent, 
  Club, 
  Candidate, 
  SportsMeetSettings 
} from '../types';
import { isEventCardEnabled, parseHeightToInches } from '../utils/heightRules';
import { 
  UserPlus, 
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  QrCode,
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
  Lock,
  Ban,
  XCircle,
} from 'lucide-react';
import { EventHeat, EventResult } from '../types';
import { getCandidateQualifiedEvents } from '../utils/qualificationRules';

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
}

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
}) => {
  // Client's Club Name: stored in localStorage and persistent across resets
  const [clientClubName, setClientClubName] = useState<string>(() => {
    return localStorage.getItem('esports_client_club_name') || 'SASTHITALA AGRANI';
  });

  const [name, setName] = useState('');
  const [clubName, setClubName] = useState('');
  const [height, setHeight] = useState('');
  const [gender, setGender] = useState('');
  const [feeStatus, setFeeStatus] = useState<string>('Due');
  const [selectedEvents, setSelectedEvents] = useState<number[]>([]);
  const [keypadInput, setKeypadInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Dedicated Separate Edit Candidate State (Attachments 1 & 2)
  const [editingCandidateItem, setEditingCandidateItem] = useState<Candidate | null>(null);
  const [editName, setEditName] = useState('');
  const [editClub, setEditClub] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editGender, setEditGender] = useState('B');
  const [editFeeStatus, setEditFeeStatus] = useState('Due [D]');
  const [editSelectedEvents, setEditSelectedEvents] = useState<number[]>([]);
  const [editErrorMsg, setEditErrorMsg] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Multi-select Events Modal (Attachment 2)
  const [showSelectEventsModal, setShowSelectEventsModal] = useState(false);
  const [tempSelectedEvents, setTempSelectedEvents] = useState<number[]>([]);

  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrTargetMode, setQrTargetMode] = useState<'desktop' | 'dev' | 'shared'>('desktop');
  const [copiedLink, setCopiedLink] = useState(false);

  // Save client club name to localStorage on change
  const handleClientClubChange = (val: string) => {
    const uppercaseVal = val.toUpperCase();
    setClientClubName(uppercaseVal);
    localStorage.setItem('esports_client_club_name', uppercaseVal);
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
      else if (rawStatus.startsWith('Exempted') || rawStatus.startsWith('Free')) setFeeStatus('Free');
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
    const check = isEventCardEnabled(evt, activeGender, activeHeight);
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
      const found = events.find(e => Number(e.Evt_No) === num);

      if (!firstValidEvt) {
        if (found) {
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
              e => String(e.Evt_No).startsWith(tok) && isGenderCategoryCompatible(e.Gender, firstCategory)
            );

            if (!couldBePrefixOfMatchingEvent) {
              rejectedMsg = `Event #${num} (${found.Gender}) is not allowed! Must be under the same category as first event #${firstValidEvt.Evt_No} (${firstCategory}).`;
              shouldPruneLastToken = isLastToken;
              continue;
            }
          } else {
            validEventNos.push(num);
          }
        } else {
          if (!isFinishedToken) {
            const hasPossibleMatch = events.some(
              e => String(e.Evt_No).startsWith(tok) && isGenderCategoryCompatible(e.Gender, firstCategory)
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
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFeedbackMsg({ type: 'error', text: 'Candidate name is required.' });
      return;
    }

    // Ensure Duplicate candidate name is not allowed for new entry or for edit both
    const normalizedName = trimmedName.toUpperCase();
    const existingDuplicate = candidates.find(c => {
      if (candidateToEdit && c.id === candidateToEdit.id) return false;
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
      const targetClub = (mode === 'client' ? clientClubName : (clubName || clientClubName)).trim() || 'Independent';

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

    targetCandidates.forEach(c => {
      const gen = (c.gender || '').toUpperCase();
      if (gen === 'BOYS' || gen === 'B') bCount++;
      else if (gen === 'GIRLS' || gen === 'G') gCount++;
      else cCount++;

      const fee = Number(c.totalFees) || 0;
      totalAll += fee;

      const st = (c.feeStatus || 'Paid').toUpperCase();
      if (st.includes('UNPAID') || st.includes('DUE')) {
        totalDue += fee;
      } else if (st.includes('EXEMPT') || st.includes('FREE')) {
        totalFree += fee;
      } else {
        totalPaid += fee;
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

  // Height display for View/Edit list
  const getHeightDisplay = (cand: Candidate): string => {
    if (!cand.height || cand.height === 'ALL') return 'ALL';
    return cand.height.replace(/`/g, "'");
  };

  // Events display for View/Edit list
  const getEventsDisplay = (cand: Candidate): string => {
    if (!cand.selectedEvents || cand.selectedEvents.length === 0) return '-';
    return cand.selectedEvents.join(', ');
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
        const matchChest = String(c.chestNo || c.localRecordNo || '').includes(q);
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
        const numA = Number(a.localRecordNo || a.chestNo) || 0;
        const numB = Number(b.localRecordNo || b.chestNo) || 0;
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
      const qualifiedEvts = getCandidateQualifiedEvents(cand, heats, results);
      if (qualifiedEvts.length > 0) {
        alert(
          `Editing Restricted!\n\nCandidate "${cand.name}" (Chest #${cand.chestNo}) has already qualified from hit to final in Event #${qualifiedEvts.join(', #')}.\n\nEditing candidate details is restricted once an athlete qualifies for finals in any enrolled event, even after hits of other events are not completed yet.`
        );
        return;
      }
    }

    setEditingCandidateItem(cand);
    setEditName(cand.name || '');
    setEditClub(cand.club || clientClubName || 'SASTHITALA AGRANI');
    setEditHeight(cand.height === 'ALL' ? '' : (cand.height || ''));

    // Normalize gender for dropdown: B, G, C, ALL
    const g = (cand.gender || '').toUpperCase();
    if (g === 'BOYS' || g === 'B') setEditGender('B');
    else if (g === 'GIRLS' || g === 'G') setEditGender('G');
    else if (g === 'CHILDRENS' || g === 'CHILDREN' || g === 'C') setEditGender('C');
    else setEditGender('ALL');

    // Normalize fee status: Due [D], Paid [P], Free [F]
    const fs = (cand.feeStatus || '').toUpperCase();
    if (fs.includes('PAID')) setEditFeeStatus('Paid [P]');
    else if (fs.includes('FREE') || fs.includes('EXEMPT')) setEditFeeStatus('Free [F]');
    else setEditFeeStatus('Due [D]');

    setEditSelectedEvents(cand.selectedEvents ? [...cand.selectedEvents] : []);
    setEditErrorMsg(null);
  };

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
      c => c.id !== editingCandidateItem.id && (c.name || '').trim().toUpperCase() === trimmedName
    );
    if (duplicate) {
      setEditErrorMsg(`Duplicate Candidate Name! "${trimmedName}" is already registered (${duplicate.club || 'Independent'}). Duplicate names are not allowed.`);
      return;
    }

    if (mode === 'server') {
      const qualifiedEvts = getCandidateQualifiedEvents(editingCandidateItem, heats, results);
      if (qualifiedEvts.length > 0) {
        setEditErrorMsg(`Editing Restricted: Candidate "${editingCandidateItem.name}" (Chest #${editingCandidateItem.chestNo}) has already qualified from hit to final in Event #${qualifiedEvts.join(', #')}. Editing candidate details is restricted.`);
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
      const targetClub = editClub.trim().toUpperCase() || clientClubName || 'SASTHITALA AGRANI';

      // Calculate total fees
      let totalFees = 0;
      for (const evtNo of editSelectedEvents) {
        const ev = events.find(e => Number(e.Evt_No) === Number(evtNo));
        totalFees += Number(ev?.Fees || 10);
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

  const DEV_APP_URL = 'https://ais-dev-g4v5u3ijukxjajvttmnfdk-944293067646.asia-southeast1.run.app/?mode=client';
  const SHARED_APP_URL = 'https://ais-pre-g4v5u3ijukxjajvttmnfdk-944293067646.asia-southeast1.run.app/?mode=client';
  const DESKTOP_SERVER_URL = 'https://ais-dev-g4v5u3ijukxjajvttmnfdk-944293067646.asia-southeast1.run.app/?mode=server';

  const appUrl = useMemo(() => {
    if (qrTargetMode === 'desktop') {
      if (typeof window !== 'undefined' && window.location.origin) {
        return `${window.location.origin}/?mode=server`;
      }
      return DESKTOP_SERVER_URL;
    }
    if (qrTargetMode === 'shared') {
      return SHARED_APP_URL;
    }
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin.includes('localhost') || origin.includes('ais-pre')) {
        return DEV_APP_URL;
      }
      return `${origin}${window.location.pathname}?mode=client`;
    }
    return DEV_APP_URL;
  }, [qrTargetMode]);

  const handleCopyLink = () => {
    if (navigator.clipboard && appUrl) {
      navigator.clipboard.writeText(appUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div className="max-w-6xl xl:max-w-7xl mx-auto">
      {/* Dark Card Frame matching User's Mobile Mockup */}
      <div className="bg-[#0b1120] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden text-slate-100 font-sans">
        
        {/* FIXED / STICKY TOP SECTION: Client Club Name (client mode only) / Server Info (server mode) + Meet Title + QR Link */}
        <div className="sticky top-0 z-30 bg-[#0b1120]/95 backdrop-blur-md border-b border-slate-800/90 px-4 sm:px-6 py-2.5 shadow-md">
          <div className="flex items-center justify-between gap-3">
            
            {/* Ask Client's Club Name only in client mode; remove from server mode */}
            {mode === 'client' ? (
              <div className="flex-1 min-w-0">
                <label htmlFor="client-club-input" className="block text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                  Your Club Name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="client-club-input"
                    type="text"
                    value={clientClubName}
                    onChange={(e) => handleClientClubChange(e.target.value)}
                    placeholder="e.g. SASTHITALA AGRANI"
                    className="w-full sm:w-80 px-3 py-1.5 rounded-xl bg-[#0e172e] border border-amber-400/80 text-amber-400 font-extrabold uppercase text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400/40 transition-all shadow-inner"
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
                  {settings.ordinalTitle || '47th Annual Sports Meet 2026'}
                </p>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-extrabold text-amber-400 truncate">
                    {settings.ordinalTitle || '47th Annual Sports Meet 2026'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  Official Candidate Enrollment & Direct Registry
                </p>
              </div>
            )}

            {/* Right: QR Link Button */}
            <div className="shrink-0 flex items-center gap-2">
              {candidateToEdit && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1 border border-slate-700"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Cancel</span>
                </button>
              )}

              <button
                type="button"
                id="btn-qr-link"
                onClick={() => setShowQrModal(true)}
                className="px-3 py-1.5 rounded-xl bg-[#1e1416] hover:bg-[#2e191d] border border-red-900/80 text-amber-400 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-98 cursor-pointer"
                title="View & Share QR Link"
              >
                <QrCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>QR Link</span>
              </button>
            </div>

          </div>
        </div>

        {/* Content Container (Compact on desktop to fit without page scroll) */}
        <div className="p-3 sm:p-4 lg:p-4">
          
          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-5 items-start">

              {/* ========================================================================= */}
              {/* GROUP 1 (LEFT COLUMN): Candidate Name, Club Name, Height, Gender TOGETHER */}
              {/* Also houses Summary strip and Action buttons on desktop                    */}
              {/* ========================================================================= */}
              <div className="lg:col-span-5 space-y-2.5">
                
                {/* FIELD 1: Candidate Name * */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="candidate-name" className="block text-xs font-bold text-slate-200">
                      Candidate Name <span className="text-amber-400">*</span>
                    </label>
                    {mode === 'server' ? (
                      <span className="text-[11px] font-mono font-bold text-amber-400 bg-[#0e172e] px-2 py-0.5 rounded-lg border border-amber-400/40">
                        Chest No. #{candidateToEdit ? candidateToEdit.chestNo : suggestedChestNo}
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono font-bold text-amber-400 bg-[#0e172e] px-2.5 py-0.5 rounded-lg border border-amber-400/40">
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
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0e172e] border border-amber-400/70 text-white placeholder:text-slate-500 text-xs sm:text-sm font-semibold uppercase focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all shadow-inner"
                  />
                </div>

                {/* FIELD 2: Club Name (kept together with candidate name - Only for Server mode, removed for Client mode) */}
                {mode === 'server' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="candidate-club-input" className="block text-xs font-bold text-slate-200">
                        Club Name <span className="text-amber-400">*</span>
                      </label>
                      {enrolledClubSuggestions.length > 0 && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          {enrolledClubSuggestions.length} club(s) enrolled
                        </span>
                      )}
                    </div>
                    <input
                      id="candidate-club-input"
                      type="text"
                      list="enrolled-clubs-datalist"
                      required
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
                      placeholder="Type or select previously enrolled club..."
                      className="w-full px-3.5 py-2 rounded-xl bg-[#0e172e] border border-amber-400/70 text-white placeholder:text-slate-500 text-xs sm:text-sm font-semibold uppercase focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all shadow-inner"
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
                    <label htmlFor="height-select" className="block text-xs font-bold text-slate-200 mb-1">
                      Height Category
                    </label>
                    <div className="relative">
                      <select
                        id="height-select"
                        value={height}
                        onChange={(e) => handleHeightChange(e.target.value)}
                        className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#0e172e] border border-amber-400/80 text-white text-xs sm:text-sm font-semibold focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all cursor-pointer appearance-none pr-7 shadow-inner"
                      >
                        <option value="">ALL (Auto)</option>
                        {availableHeights.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Gender Category */}
                  <div>
                    <label htmlFor="gender-select" className="block text-xs font-bold text-slate-200 mb-1">
                      Gender Category
                    </label>
                    <div className="relative">
                      <select
                        id="gender-select"
                        value={gender}
                        onChange={(e) => handleGenderChange(e.target.value)}
                        className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#0e172e] border border-amber-400/80 text-white text-xs sm:text-sm font-semibold focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all cursor-pointer appearance-none pr-7 shadow-inner"
                      >
                        <option value="">ALL (Auto)</option>
                        {availableGenders.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DESKTOP PLACEMENT: Summary Strip & The 3 Action Buttons */}
                <div className="hidden lg:block pt-1 space-y-2.5">
                  {/* Summary Strip & Reset Button with Overlapping Notification */}
                  <div className="relative">
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#0e172e] border border-slate-800 shadow-inner min-h-[42px]">
                      <button
                        type="button"
                        id="btn-open-summary-popup"
                        onClick={() => setShowSummaryPopup(true)}
                        className="flex-1 text-left text-xs font-bold text-slate-200 hover:text-amber-400 transition-colors cursor-pointer truncate"
                        title="Click to view detailed Accounts & Registration Summary"
                      >
                        ({stats.count} Reg (C:{stats.cCount}/B:{stats.bCount}/G:{stats.gCount}) | ₹{stats.totalFees} (P:₹{stats.paidFees}/D:₹{stats.dueFees}))
                      </button>

                      <button
                        type="button"
                        id="btn-reset-form"
                        onClick={resetForm}
                        className="shrink-0 px-2 py-1 rounded-lg bg-[#14203d] hover:bg-[#1a2c54] active:scale-95 text-slate-200 border border-slate-700 flex items-center gap-1 text-[11px] font-semibold transition-all cursor-pointer"
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

                  {/* 3 Action Buttons */}
                  <div className="grid grid-cols-12 gap-2">
                    <button
                      type="button"
                      id="btn-view-edit-list"
                      onClick={() => setShowViewEditModal(true)}
                      className="col-span-4 py-2.5 px-2 rounded-xl bg-[#881337] hover:bg-[#9f1239] active:scale-98 text-white font-black text-xs flex items-center justify-center gap-1 shadow-lg transition-all cursor-pointer truncate"
                    >
                      <List className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">View/Edit ({stats.count})</span>
                    </button>

                    <button
                      type="submit"
                      id="btn-submit-enroll"
                      disabled={isSubmitting || selectedEvents.length === 0 || !name.trim()}
                      className="col-span-4 py-2.5 px-2 rounded-xl bg-[#facc15] hover:bg-[#eab308] active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs flex items-center justify-center gap-1 shadow-lg shadow-amber-500/10 transition-all cursor-pointer truncate"
                    >
                      <UserPlus className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                      <span className="truncate">{candidateToEdit ? 'Update' : '+ Enroll'}</span>
                    </button>

                    <button
                      type="button"
                      id="btn-send-sync"
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
                </div>

              </div>

              {/* ========================================================================================= */}
              {/* GROUP 2 (RIGHT COLUMN): Keypad, Event Cards, Fee Status and Calculated Fee KEPT TOGETHER */}
              {/* ========================================================================================= */}
              <div className="lg:col-span-7 space-y-2.5">
                
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
                      className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#0e172e] border border-slate-700 text-white font-mono text-xs sm:text-sm focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 shadow-inner"
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

                  {/* Concise 4-Column Grid on desktop, fits without page scroll */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-1.5 max-h-[220px] lg:max-h-[250px] overflow-y-auto pr-0.5">
                    {events.map((evt) => {
                      const isSelected = selectedEvents.includes(evt.Evt_No);
                      const eligibility = isEventCardEnabled(evt, gender, height);
                      const isEnabled = eligibility.enabled;

                      return (
                        <div
                          key={evt.Evt_No}
                          id={`thumb-event-${evt.Evt_No}`}
                          data-event-no={evt.Evt_No}
                          role="button"
                          tabIndex={isEnabled ? 0 : -1}
                          aria-disabled={!isEnabled}
                          aria-pressed={isSelected}
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
                          className={`rounded-lg p-1.5 sm:p-2 transition-all select-none flex flex-col justify-between border min-h-[48px] sm:min-h-[52px] focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 focus:ring-offset-[#0b1120] ${
                            isSelected
                              ? 'bg-amber-950/50 border-amber-400 ring-2 ring-amber-400/70 shadow-md cursor-pointer'
                              : isEnabled
                              ? 'bg-[#0e172e] border-slate-800/90 hover:border-slate-600 hover:bg-[#121c38] cursor-pointer'
                              : 'bg-[#080d19] border-slate-900 opacity-25 cursor-not-allowed pointer-events-none'
                          }`}
                        >
                          {/* Top Row: #Number + Name */}
                          <div className="flex items-center gap-1 overflow-hidden">
                            <span className="text-amber-400 font-extrabold font-mono text-[11px] shrink-0">
                              #{evt.Evt_No}
                            </span>
                            <span className="text-white font-bold text-[11px] uppercase tracking-tight truncate">
                              {evt.Evt_Name}
                            </span>
                          </div>

                          {/* Bottom Row: Shorthand Category + Price */}
                          <div className="flex items-center justify-between text-[10px] font-semibold mt-0.5 pt-0.5 border-t border-slate-800/60">
                            <span className="text-slate-300 font-mono truncate">
                              {getEventShorthand(evt)}
                            </span>
                            <span className="text-amber-400 font-mono font-bold shrink-0">
                              {settings.currencySymbol || '₹'}{Number(evt.Fees).toFixed(0)}
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
                      <label htmlFor="fee-status-select" className="block text-xs font-semibold text-slate-300">
                        Fee Status
                      </label>
                      <span className="text-[10px] text-amber-400 font-bold">Press Enter to Enroll</span>
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
                      className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#0e172e] border border-amber-400/80 text-white text-xs sm:text-sm font-bold focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all cursor-pointer shadow-inner"
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
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Calculated Fee
                    </label>
                    <div className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#0e172e] border border-slate-700 text-amber-400 font-mono font-bold text-xs sm:text-sm flex items-center justify-between shadow-inner">
                      <span>{settings.currencySymbol || '₹'}{totalFees.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400">
                        {selectedEvents.length} selected
                      </span>
                    </div>
                  </div>
                </div>

                {/* MOBILE PLACEMENT: Summary & 3 Action Buttons below Group 2 on small screens */}
                <div className="block lg:hidden pt-2 space-y-2.5">
                  {/* Summary Strip & Reset Button */}
                  <div className="relative">
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#0e172e] border border-slate-800 shadow-inner min-h-[42px]">
                      <button
                        type="button"
                        id="btn-open-summary-popup-mobile"
                        onClick={() => setShowSummaryPopup(true)}
                        className="flex-1 text-left text-xs font-bold text-slate-200 hover:text-amber-400 transition-colors cursor-pointer truncate"
                        title="Click to view detailed Accounts & Registration Summary"
                      >
                        ({stats.count} Reg (C:{stats.cCount}/B:{stats.bCount}/G:{stats.gCount}) | ₹{stats.totalFees} (P:₹{stats.paidFees}/D:₹{stats.dueFees}))
                      </button>

                      <button
                        type="button"
                        id="btn-reset-form-mobile"
                        onClick={resetForm}
                        className="shrink-0 px-2 py-1 rounded-lg bg-[#14203d] hover:bg-[#1a2c54] active:scale-95 text-slate-200 border border-slate-700 flex items-center gap-1 text-[11px] font-semibold transition-all cursor-pointer"
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

                  {/* 3 Action Buttons on mobile */}
                  <div className="grid grid-cols-12 gap-2">
                    <button
                      type="button"
                      id="btn-view-edit-list-mobile"
                      onClick={() => setShowViewEditModal(true)}
                      className="col-span-4 py-2.5 px-2 rounded-xl bg-[#881337] hover:bg-[#9f1239] active:scale-98 text-white font-black text-xs flex items-center justify-center gap-1 shadow-lg transition-all cursor-pointer truncate"
                    >
                      <List className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">View/Edit ({stats.count})</span>
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
                </div>

              </div>

            </div>

            {/* Bottom scroll anchor */}
            <div ref={bottomScrollAnchorRef} className="h-1" />
          </form>

        </div>
      </div>

      {/* MODAL 1: REGISTRATION & ACCOUNTS SUMMARY POPUP */}
      {showSummaryPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e172e] border border-slate-700 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0b1326]">
              <div>
                <h3 className="font-black text-base sm:text-lg text-amber-400">
                  Registration & Accounts Summary
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Club: <span className="text-white">{clientClubName}</span>
                </p>
              </div>
              <button
                onClick={() => setShowSummaryPopup(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Stat Metric Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-[#131d38] p-3 rounded-xl border border-slate-800 text-center">
                  <div className="text-[11px] text-slate-400 font-semibold">Total Reg</div>
                  <div className="text-xl font-mono font-black text-white">{stats.count}</div>
                </div>
                <div className="bg-[#131d38] p-3 rounded-xl border border-slate-800 text-center">
                  <div className="text-[11px] text-slate-400 font-semibold">Categories</div>
                  <div className="text-xs font-mono font-bold text-amber-400 mt-1">
                    C:{stats.cCount} B:{stats.bCount} G:{stats.gCount}
                  </div>
                </div>
                <div className="bg-[#131d38] p-3 rounded-xl border border-slate-800 text-center">
                  <div className="text-[11px] text-emerald-400 font-semibold">Paid (P)</div>
                  <div className="text-base font-mono font-black text-emerald-400">
                    ₹{stats.paidFees}
                  </div>
                </div>
                <div className="bg-[#131d38] p-3 rounded-xl border border-slate-800 text-center">
                  <div className="text-[11px] text-rose-400 font-semibold">Due (D)</div>
                  <div className="text-base font-mono font-black text-rose-400">
                    ₹{stats.dueFees}
                  </div>
                </div>
              </div>

              {/* Total Summary Row */}
              <div className="bg-[#0b1326] p-3.5 rounded-xl border border-amber-400/40 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-200">Total Calculated Fees:</span>
                <span className="text-lg font-mono font-black text-amber-400">
                  {settings.currencySymbol || '₹'}{stats.totalFees.toFixed(2)}
                </span>
              </div>

              {/* Candidate Quick Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Enrolled Candidates ({stats.candidatesList.length})
                </h4>
                {stats.candidatesList.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No candidates registered yet for this club.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {stats.candidatesList.map((cand, idx) => (
                      <div
                        key={cand.id || idx}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0b1326] border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span className="font-mono font-bold text-amber-400">
                            #{cand.localRecordNo || cand.chestNo || (idx + 1)}
                          </span>
                          <span className="font-bold text-white uppercase truncate">
                            {cand.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({cand.gender}/{cand.height})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-slate-300">
                            ₹{Number(cand.totalFees || 0).toFixed(0)}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            (cand.feeStatus || '').toUpperCase().includes('DUE') || (cand.feeStatus || '').toUpperCase().includes('UNPAID')
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {(cand.feeStatus || '').toUpperCase().includes('DUE') || (cand.feeStatus || '').toUpperCase().includes('UNPAID') ? 'Due' : 'Paid'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-800 bg-[#0b1326] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setShowSummaryPopup(false);
                  onNavigateToCandidates();
                }}
                className="px-3.5 py-2 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                Go to View / Edit All
              </button>
              <button
                type="button"
                onClick={() => setShowSummaryPopup(false)}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-500 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: QR LINK POPUP */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e172e] border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-amber-400">
                  Client QR Enrollment Link
                </h3>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#070b15] rounded-xl border border-slate-800 mb-3 text-xs font-bold">
              <button
                type="button"
                onClick={() => setQrTargetMode('desktop')}
                className={`py-1.5 px-1.5 rounded-lg transition-all cursor-pointer text-center truncate ${
                  qrTargetMode === 'desktop'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Desktop Browser URL for Server Operations"
              >
                🖥️ Desktop Site
              </button>
              <button
                type="button"
                onClick={() => setQrTargetMode('dev')}
                className={`py-1.5 px-1.5 rounded-lg transition-all cursor-pointer text-center truncate ${
                  qrTargetMode === 'dev'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Mobile Client Live Dev Link"
              >
                📱 Mobile Dev
              </button>
              <button
                type="button"
                onClick={() => setQrTargetMode('shared')}
                className={`py-1.5 px-1.5 rounded-lg transition-all cursor-pointer text-center truncate ${
                  qrTargetMode === 'shared'
                    ? 'bg-emerald-400 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Mobile Client Public Shared Link (No login required)"
              >
                🌐 Mobile Public
              </button>
            </div>

            <div className="flex flex-col items-center text-center space-y-3">
              {/* Scalable High Contrast QR Code Display */}
              <div className="p-3 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center border-4 border-amber-400">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(appUrl)}`}
                  alt="QR Code for Mobile Portal"
                  className="w-48 h-48 object-contain"
                  loading="lazy"
                />
              </div>

              <div className="space-y-1 text-center">
                <p className="text-xs font-semibold text-slate-300">
                  {qrTargetMode === 'desktop'
                    ? 'Use this link on any desktop computer to access full Server Controls, Heats & Finals.'
                    : 'Scan this QR code with any smartphone camera to open the Client Portal.'}
                </p>
                <p className="text-[11px] text-amber-400 font-bold">
                  {qrTargetMode === 'desktop' ? 'Mode: Server / Official Admin Operations' : `Club: ${clientClubName}`}
                </p>
              </div>

              {/* Troubleshooting Notice */}
              <div className="w-full text-left p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] space-y-1 text-slate-300">
                <div className="flex items-center gap-1.5 font-bold text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Link Tips & Access:</span>
                </div>
                {qrTargetMode === 'desktop' ? (
                  <>
                    <p className="leading-relaxed">
                      • <strong>Desktop Browser</strong>: Open this link in Chrome/Edge on your desktop computer to view all live candidate registrations, create heats, and record results.
                    </p>
                    <p className="leading-relaxed">
                      • Default Server PIN: <strong>{settings.serverPin || '1234'}</strong> (unlocks Server Control).
                    </p>
                  </>
                ) : (
                  <>
                    <p className="leading-relaxed">
                      • <strong>Dev Link</strong>: Open on mobile logged into Google with <strong>agrani.sasthitala1966@gmail.com</strong>.
                    </p>
                    <p className="leading-relaxed">
                      • <strong>Public Link (No login)</strong>: Published preview link for any smartphone without logging in.
                    </p>
                  </>
                )}
              </div>

              {/* URL Box + Copy Button */}
              <div className="w-full flex items-center gap-2 bg-[#0b1326] p-2 rounded-xl border border-slate-800">
                <input
                  type="text"
                  readOnly
                  value={appUrl}
                  className="bg-transparent text-xs font-mono text-slate-300 w-full focus:outline-hidden px-2 truncate select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-slate-950" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-950" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div className="w-full grid grid-cols-2 gap-2">
                <a
                  href={appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Portal</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REDESIGNED VIEW/EDIT CANDIDATES SCREEN (Matching User's Attached Reference) */}
      {showViewEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-[#080d19] border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95">
            
            {/* Top Bar: Yellow-outlined Search Box with close 'X' button */}
            <div className="p-3 bg-[#080d19] border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-[#0d1527] border-2 border-amber-400 rounded-2xl px-3 py-2 shadow-inner">
                  <Search className="w-5 h-5 text-amber-400 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search chest #, name, club..."
                    className="w-full bg-transparent text-white placeholder:text-slate-500 text-xs sm:text-sm font-semibold px-2.5 focus:outline-hidden"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-slate-400 hover:text-white p-0.5"
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
                  className="p-2 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Close and return to Enroll"
                >
                  <X className="w-6 h-6 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Category Filter Pills: ALL, C, B, G */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#090f1d] border-b border-slate-800/80 overflow-x-auto no-scrollbar">
              {/* ALL */}
              <button
                type="button"
                id="pill-cat-all"
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
                id="pill-cat-c"
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
                id="pill-cat-b"
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
                id="pill-cat-g"
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

            {/* Table Header: Sl. | Chest # | Name | Gr | Events | Actions */}
            <div className="grid grid-cols-12 gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2.5 text-xs font-black text-amber-400 border-b border-slate-800 select-none bg-[#070b15]">
              <div className="col-span-1 text-center">Sl.</div>
              <div className="col-span-2 text-center">{mode === 'client' ? '#' : 'Chest #'}</div>
              <div className="col-span-4 sm:col-span-3 pl-1">{mode === 'client' ? 'Name' : 'Name & Club'}</div>
              <div className="col-span-2 sm:col-span-2 text-center">Gr</div>
              <div className="col-span-3 sm:col-span-2 text-center">Events</div>
              <div className="hidden sm:block sm:col-span-2 text-right pr-2">Actions</div>
            </div>

            {/* Candidates Table List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70 p-1">
              {filteredViewEditCandidates.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs sm:text-sm">
                  No candidates found matching your criteria.
                </div>
              ) : (
                filteredViewEditCandidates.map((cand, idx) => {
                  const groupCode = getGroupCode(cand);
                  const heightStr = getHeightDisplay(cand);
                  const eventsStr = getEventsDisplay(cand);
                  const isConfirmingDelete = deleteConfirmId === cand.id;
                  const isCancelled = cand.isCancelled || cand.status === 'cancelled';
                  const isServerSaved = mode === 'server' && (Boolean(cand.chestNo) && Number(cand.chestNo) >= 101 || cand.synced);
                  const qualifiedEvts = mode === 'server' ? getCandidateQualifiedEvents(cand, heats, results) : [];
                  const isRestricted = qualifiedEvts.length > 0;

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
                        <span className={`inline-block px-1.5 sm:px-2 py-0.5 rounded-md font-mono font-black text-xs sm:text-sm shadow-xs ${
                          isCancelled
                            ? 'bg-rose-950/80 border border-rose-500/70 text-rose-300 line-through'
                            : 'bg-amber-400/15 border border-amber-400/50 text-amber-300'
                        }`}>
                          #{cand.localRecordNo || cand.chestNo || '—'}
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
                            <span className="shrink-0 px-1 py-0.2 rounded bg-amber-500/20 border border-amber-400/60 text-amber-300 text-[9px] font-bold" title={`Qualified to Final in Event #${qualifiedEvts.join(', #')} - Editing locked`}>
                              Finalist
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
                                onClick={() => handleInitiateDelete(cand.id)}
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
                                onClick={() => handleInitiateEdit(cand)}
                                className={`text-[10px] font-bold flex items-center gap-0.5 cursor-pointer hover:underline ${
                                  isRestricted ? 'text-amber-400' : 'text-amber-300'
                                }`}
                              >
                                {isRestricted ? <Lock className="w-2.5 h-2.5 text-amber-400" /> : <Pencil className="w-2.5 h-2.5" />}
                                <span>{isRestricted ? 'Locked' : 'Edit'}</span>
                              </button>
                              <span className="text-slate-600 text-[10px]">•</span>

                              {isServerSaved ? (
                                <button
                                  type="button"
                                  onClick={() => handleInitiateCancelChest(cand)}
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
                              onClick={() => handleInitiateDelete(cand.id)}
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
                              onClick={() => handleInitiateEdit(cand)}
                              className={`p-2 rounded-xl border transition-all active:scale-95 shadow cursor-pointer ${
                                isRestricted
                                  ? 'bg-amber-950/60 hover:bg-amber-900/60 border-amber-600/70 text-amber-300'
                                  : 'bg-[#18233c] hover:bg-[#23355b] border-blue-900/60 text-amber-300'
                              }`}
                              title={
                                isRestricted
                                  ? `Editing restricted: qualified to final in Event #${qualifiedEvts.join(', #')}`
                                  : `Edit ${cand.name}`
                              }
                            >
                              {isRestricted ? (
                                <Lock className="w-3.5 h-3.5 text-amber-400 stroke-[2.2]" />
                              ) : (
                                <Pencil className="w-3.5 h-3.5 text-amber-300 stroke-[2.2]" />
                              )}
                            </button>

                            {/* Delete or Cancel Chest Button */}
                            {isServerSaved ? (
                              <button
                                type="button"
                                onClick={() => handleInitiateCancelChest(cand)}
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

            {/* Bottom Summary Bar in View/Edit Screen */}
            <div className="px-4 py-2.5 bg-[#070b15] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Showing {filteredViewEditCandidates.length} of {targetClubCandidates.length} candidate(s)</span>
              <button
                type="button"
                onClick={() => setShowViewEditModal(false)}
                className="text-amber-400 font-bold hover:underline cursor-pointer"
              >
                Back to Enroll
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DEDICATED SEPARATE PAGE/MODAL: EDIT CANDIDATE DETAILS (Attachment 1 Design) */}
      {editingCandidateItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in">
          <div className="border-2 border-yellow-400 rounded-3xl bg-[#090f1d] p-5 sm:p-6 shadow-2xl max-w-sm sm:max-w-md w-full space-y-4 text-slate-100">
            
            {/* Title Header */}
            <h2 className="text-yellow-400 font-bold text-lg sm:text-xl">
              Edit Candidate ({mode === 'client' ? `#${editingCandidateItem.localRecordNo || editingCandidateItem.chestNo || 1}` : `Chest #${editingCandidateItem.chestNo || editingCandidateItem.localRecordNo || 1}`})
            </h2>

            {/* Form Fields matching Attachment 1 */}
            <div className="space-y-3.5">
              
              {/* Field 1: Candidate Name (UPPERCASE) */}
              <div className="relative border border-slate-600 rounded-xl px-3 pt-3 pb-2.5 bg-[#0d1628] focus-within:border-yellow-400 transition-colors">
                <label className="absolute -top-2.5 left-3 px-1.5 bg-[#0d1628] text-[11px] font-bold text-slate-300 pointer-events-none">
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
                <div className="relative border border-slate-600 rounded-xl px-3 pt-3 pb-2.5 bg-[#0d1628] focus-within:border-yellow-400 transition-colors">
                  <label className="absolute -top-2.5 left-3 px-1.5 bg-[#0d1628] text-[11px] font-bold text-slate-300 pointer-events-none">
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
                <div className="relative border border-slate-600 rounded-xl px-3 pt-3 pb-2 bg-[#0d1628] focus-within:border-yellow-400 transition-colors">
                  <label className="absolute -top-2.5 left-3 px-1.5 bg-[#0d1628] text-[11px] font-bold text-slate-300 pointer-events-none">
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
                    <option value="ALL" className="bg-[#0d1628] text-white">ALL</option>
                    {availableHeights.map(h => (
                      <option key={h} value={h} className="bg-[#0d1628] text-white">{h}</option>
                    ))}
                  </select>
                </div>

                {/* Gender */}
                <div className="relative border border-slate-600 rounded-xl px-3 pt-3 pb-2 bg-[#0d1628] focus-within:border-yellow-400 transition-colors">
                  <label className="absolute -top-2.5 left-3 px-1.5 bg-[#0d1628] text-[11px] font-bold text-slate-300 pointer-events-none">
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
                    <option value="B" className="bg-[#0d1628] text-white">B</option>
                    <option value="G" className="bg-[#0d1628] text-white">G</option>
                    <option value="C" className="bg-[#0d1628] text-white">C</option>
                    <option value="ALL" className="bg-[#0d1628] text-white">ALL</option>
                  </select>
                </div>
              </div>

              {/* Field 5: Selected Events (Tap to update) with Golden Pencil */}
              <div
                onClick={() => {
                  setTempSelectedEvents([...editSelectedEvents]);
                  setShowSelectEventsModal(true);
                }}
                className="relative border border-slate-600 rounded-xl px-3 pt-3 pb-2.5 bg-[#0d1628] cursor-pointer hover:border-yellow-400 transition-colors flex items-center justify-between group"
              >
                <label className="absolute -top-2.5 left-3 px-1.5 bg-[#0d1628] text-[11px] font-bold text-slate-300 group-hover:text-yellow-400 transition-colors pointer-events-none">
                  Selected Events (Tap to update)
                </label>
                <span className="text-yellow-400 font-extrabold text-sm sm:text-base font-mono truncate mr-2">
                  {editSelectedEvents.length > 0 ? editSelectedEvents.join(', ') : 'Tap to select events'}
                </span>
                <Pencil className="w-4 h-4 text-yellow-400 shrink-0 stroke-[2.5]" />
              </div>

              {/* Field 6: Fee Status */}
              <div className="relative border border-slate-600 rounded-xl px-3 pt-3 pb-2 bg-[#0d1628] focus-within:border-yellow-400 transition-colors">
                <label className="absolute -top-2.5 left-3 px-1.5 bg-[#0d1628] text-[11px] font-bold text-slate-300 pointer-events-none">
                  Fee Status
                </label>
                <select
                  value={editFeeStatus}
                  onChange={(e) => setEditFeeStatus(e.target.value)}
                  className="w-full bg-transparent text-white font-bold text-sm sm:text-base focus:outline-hidden cursor-pointer"
                >
                  <option value="Due [D]" className="bg-[#0d1628] text-white">Due [D]</option>
                  <option value="Paid [P]" className="bg-[#0d1628] text-white">Paid [P]</option>
                  <option value="Free [F]" className="bg-[#0d1628] text-white">Free [F]</option>
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
                className="flex-1 py-3 rounded-full bg-[#162035] hover:bg-[#1f2d4a] text-white font-bold border border-slate-600 text-sm active:scale-98 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCandidateEdits}
                disabled={isSavingEdit || Boolean(editErrorMsg)}
                className="flex-1 py-3 rounded-full bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black text-sm shadow-md active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MULTI-SELECT EVENTS LIST BOX MODAL (Attachment 2 Design) */}
      {showSelectEventsModal && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in">
          <div className="border-2 border-yellow-400 rounded-3xl bg-[#090f1d] p-5 shadow-2xl max-w-sm sm:max-w-md w-full flex flex-col max-h-[85vh] text-slate-100">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-yellow-400 font-bold text-lg sm:text-xl">
                  Select Events
                </h3>
                <p className="text-slate-400 text-xs font-semibold mt-0.5">
                  {(!editHeight || editHeight === 'ALL') && (!editGender || editGender === 'ALL')
                    ? 'Criteria: ALL / ALL • Event #15 Only'
                    : `Criteria: ${criteriaGenderDisplay} • ${criteriaHeightDisplay} & higher (Event #15 Open for All)`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSelectEventsModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            {/* Events List Scrollable */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1">
              {eligibleEditEvents.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No events found matching criteria ({criteriaGenderDisplay} • {criteriaHeightDisplay} & higher).
                </div>
              ) : (
                eligibleEditEvents.map((evt) => {
                  const isSelected = tempSelectedEvents.includes(evt.Evt_No);
                  return (
                    <div
                      key={evt.Evt_No}
                      onClick={() => toggleTempEvent(evt.Evt_No)}
                      className={`rounded-2xl p-3 flex items-center gap-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-2 border-yellow-400 bg-[#0e172a] shadow-md shadow-yellow-500/10'
                          : 'border border-slate-700 bg-[#0b1222] hover:border-slate-500'
                      }`}
                    >
                      {/* Checkbox Icon */}
                      <div
                        className={`w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-yellow-400 text-slate-950 font-black'
                            : 'border-2 border-slate-500 bg-transparent'
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>

                      {/* Event Number Badge */}
                      <div
                        className={`w-7 h-7 rounded flex items-center justify-center font-black text-xs shrink-0 ${
                          isSelected
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-[#1a2b4c] text-blue-200'
                        }`}
                      >
                        #{evt.Evt_No}
                      </div>

                      {/* Event Details */}
                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-white text-xs sm:text-sm uppercase tracking-wide truncate">
                          {evt.Evt_Name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-semibold truncate">
                          {evt.Gender} • {evt.Height} • ₹{Number(evt.Fees || 10).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer with Selection Count, Cancel and Ok */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800 gap-3">
              <div className="text-yellow-400 font-bold text-xs sm:text-sm">
                {tempSelectedEvents.length} event(s) selected
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSelectEventsModal(false)}
                  className="px-4 sm:px-5 py-2 rounded-full bg-[#162035] hover:bg-[#1f2d4a] text-white font-bold border border-slate-600 text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSelectEvents}
                  className="px-5 sm:px-6 py-2 rounded-full bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black text-xs sm:text-sm shadow-md transition-all active:scale-98 cursor-pointer"
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

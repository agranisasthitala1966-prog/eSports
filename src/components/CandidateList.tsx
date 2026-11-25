import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Check,
  MoreVertical,
  FileText,
  Receipt,
  RefreshCw,
  CheckCircle2,
  Sliders,
  AlertTriangle
} from 'lucide-react';
import { getCandidateRestrictionStatus, getCandidateEditRestrictedMessage, getServerEventEnrollmentDisableReason } from '../utils/qualificationRules';
import { getAdditionalEventsForCandidate, isDirectEvent, parseHeightToInches, isClubAllowedForEvent0 } from '../utils/heightRules';
import { ThermalPageSetupModal } from './ThermalPageSetupModal';
import {
  ThermalPrintSettings,
  getThermalSettings,
  generateThermalPrintCSS,
} from '../utils/thermalSettings';
import {
  printDirectlyToThermalPrinter,
  isWebBluetoothSupported,
  isMobileClient,
} from '../utils/thermalBluetoothPrint';
import { ThermalLogo } from './ThermalLogo';
import { receiptDomToOfflineHtmlBlob } from '../utils/thermalLogo';
import { ThermalTwoLineRecord } from './ThermalTwoLineRecord';
import {
  WhatsAppIcon,
  buildServerReportFileName,
  shareThermalHtmlBlob,
  shareA4PdfBlob,
} from '../utils/whatsappThermalReport';
import { generateNameListA4PdfBlob } from '../utils/nameListA4Pdf';

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
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editClub, setEditClub] = useState('');
  const [editHeight, setEditHeight] = useState('ALL');
  const [editGender, setEditGender] = useState('B');
  const [editFeeStatus, setEditFeeStatus] = useState('Due');
  const [editSelectedEvents, setEditSelectedEvents] = useState<number[]>([]);
  const [editErrorMsg, setEditErrorMsg] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [modalFormat, setModalFormat] = useState<'a4' | 'thermal'>('a4');
  const [thermalConfig, setThermalConfig] = useState<ThermalPrintSettings>(getThermalSettings());
  const [showThermalSetup, setShowThermalSetup] = useState(false);
  const [isDirectPrinting, setIsDirectPrinting] = useState(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState(false);
  const [directPrintStatus, setDirectPrintStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const thermalReceiptRef = useRef<HTMLDivElement | null>(null);
  const [togglingDirectKey, setTogglingDirectKey] = useState<string | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // Auto-remove Event #0 if edited club is not allowed
  useEffect(() => {
    if (editingRowKey && !isClubAllowedForEvent0(editClub) && editSelectedEvents.includes(0)) {
      setEditSelectedEvents((prev) => prev.filter((n) => n !== 0));
    }
  }, [editingRowKey, editClub, editSelectedEvents]);

  // Available heights sorted numerically in inches for inline edit dropdown
  const availableHeights = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.Height && e.Height !== 'ALL') set.add(e.Height);
    });
    return Array.from(set).sort((a, b) => parseHeightToInches(a) - parseHeightToInches(b));
  }, [events]);

  // Enrolled club suggestions for inline server-mode Club Name editing
  const enrolledClubSuggestions = useMemo(() => {
    const clubSet = new Set<string>();
    clubs.forEach((c) => {
      if (c.name && c.name.trim()) clubSet.add(c.name.trim().toUpperCase());
    });
    candidates.forEach((c) => {
      if (c.club && c.club.trim()) clubSet.add(c.club.trim().toUpperCase());
    });
    return Array.from(clubSet).sort();
  }, [clubs, candidates]);

  const criteriaGenderDisplay = useMemo(() => {
    if (editGender === 'B') return 'BOYS';
    if (editGender === 'G') return 'GIRLS';
    if (editGender === 'C') return 'CHILDRENS';
    return 'ALL';
  }, [editGender]);

  const eligibleEditEvents = useMemo(() => {
    const isBothAll = (!editHeight || editHeight === 'ALL') && (!editGender || editGender === 'ALL');
    if (isBothAll) {
      return events.filter((evt) => Number(evt.Evt_No) === 15);
    }

    const targetGender = criteriaGenderDisplay;
    const candidateInches = parseHeightToInches(editHeight);

    const isHeightSet = editHeight && editHeight !== 'ALL';
    const isGenderSet = targetGender && targetGender !== 'ALL';
    if (isHeightSet && isGenderSet) {
      const hasMatchingEventInMaster = events.some((e) => {
        const eGenderUpper = (e.Gender || '').toUpperCase();
        if (eGenderUpper !== targetGender) return false;
        if (e.Height === 'ALL') return false;
        return parseHeightToInches(e.Height) === candidateInches;
      });
      if (!hasMatchingEventInMaster) {
        return events.filter((e) => Number(e.Evt_No) === 15);
      }
    }

    return events
      .filter((evt) => {
        const evtNo = Number(evt.Evt_No);
        if (evtNo === 15) return true;
        if (targetGender && targetGender !== 'ALL') {
          const evtGenderUpper = (evt.Gender || '').toUpperCase();
          if (evtGenderUpper !== targetGender) return false;
        }
        if (editHeight && editHeight !== 'ALL') {
          if (evt.Height !== 'ALL') {
            const eventInches = parseHeightToInches(evt.Height);
            if (eventInches < candidateInches) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
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

  const inlineEditTotalFees = useMemo(() => {
    if (editFeeStatus === 'Free' || editFeeStatus === 'Exempted [E]') return 0;
    return editSelectedEvents.reduce((sum, evtNo) => {
      const ev = events.find((e) => Number(e.Evt_No) === Number(evtNo));
      return sum + (ev && ev.Fees !== undefined ? Number(ev.Fees) : 0);
    }, 0);
  }, [editFeeStatus, editSelectedEvents, events]);

  useEffect(() => {
    const handleSettingsChange = (e: any) => {
      if (e.detail) {
        setThermalConfig(e.detail);
      }
    };
    window.addEventListener('thermal-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('thermal-settings-changed', handleSettingsChange);
  }, []);

  useEffect(() => {
    if (!showActionMenu) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowActionMenu(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showActionMenu]);

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
    setEditingRowKey(null);
    setEditErrorMsg(null);
    setExpandedRowId((prev) => (prev === rowKey ? null : rowKey));
  };

  const startInlineEdit = (cand: Candidate, rowKey: string) => {
    if (cand.isCancelled || cand.status === 'cancelled') return;
    const restrictionStatus = getCandidateRestrictionStatus(cand, events, heats, results, mode);
    if (restrictionStatus.isRestricted) return;

    setDeleteConfirmId(null);
    setCancelConfirmId(null);
    setExpandedRowId(rowKey);
    setEditingRowKey(rowKey);
    setEditName(cand.name || '');
    setEditClub(cand.club || '');
    setEditHeight(cand.height || 'ALL');

    const g = (cand.gender || '').toUpperCase();
    if (g === 'BOYS' || g === 'B') setEditGender('B');
    else if (g === 'GIRLS' || g === 'G') setEditGender('G');
    else if (g === 'CHILDRENS' || g === 'CHILDREN' || g === 'C') setEditGender('C');
    else setEditGender('ALL');

    const fs = (cand.feeStatus || '').toUpperCase();
    if (fs.includes('PAID')) setEditFeeStatus('Paid');
    else if (mode !== 'client' && (fs.includes('FREE') || fs.includes('EXEMPT'))) setEditFeeStatus('Free');
    else setEditFeeStatus('Due');

    setEditSelectedEvents(cand.selectedEvents ? cand.selectedEvents.map(Number) : []);
    setEditErrorMsg(null);
    setIsSavingEdit(false);
  };

  const cancelInlineEdit = () => {
    setEditingRowKey(null);
    setEditErrorMsg(null);
    setIsSavingEdit(false);
  };

  const handleEditNameChange = (val: string, cand: Candidate) => {
    const uppercaseVal = val.toUpperCase();
    setEditName(uppercaseVal);
    const trimmed = uppercaseVal.trim();
    if (trimmed) {
      const isDuplicate = candidates.some(
        (c) => c.id !== cand.id && (c.name || '').trim().toUpperCase() === trimmed
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

  const toggleInlineEditEvent = (evtNo: number, evt: SportEvent, isAlreadySelected: boolean) => {
    if (evtNo === 0 && !isClubAllowedForEvent0(editClub)) return;
    const serverDisableReason = getServerEventEnrollmentDisableReason(evt, results, mode);
    if (!isAlreadySelected && serverDisableReason) return;

    setEditSelectedEvents((prev) => {
      if (prev.includes(evtNo)) {
        return prev.filter((no) => no !== evtNo);
      }
      const clickedGender = (evt.Gender || '').toUpperCase();
      if (evtNo === 15 || clickedGender === 'ALL') {
        return [...prev, evtNo].sort((a, b) => a - b);
      }
      const hasOtherGender = prev.some((existingNo) => {
        if (existingNo === 15) return false;
        const ev = events.find((e) => Number(e.Evt_No) === existingNo);
        const g = (ev?.Gender || '').toUpperCase();
        return g !== 'ALL' && g !== clickedGender;
      });
      if (hasOtherGender) {
        const sanitizedPrev = prev.filter((existingNo) => {
          if (existingNo === 15) return true;
          const ev = events.find((e) => Number(e.Evt_No) === existingNo);
          const g = (ev?.Gender || '').toUpperCase();
          return g === clickedGender || g === 'ALL';
        });
        return [...sanitizedPrev, evtNo].sort((a, b) => a - b);
      }
      return [...prev, evtNo].sort((a, b) => a - b);
    });
  };

  const handleSaveInlineEdit = async (cand: Candidate) => {
    if (!onSaveCandidate) return;
    const trimmedName = editName.trim().toUpperCase();
    if (!trimmedName) {
      setEditErrorMsg('Candidate name is required.');
      return;
    }

    const duplicate = candidates.find(
      (c) =>
        c.id !== cand.id &&
        (!cand.chestNo || Number(c.chestNo) !== Number(cand.chestNo)) &&
        (c.name || '').trim().toUpperCase() === trimmedName
    );
    if (duplicate) {
      setEditErrorMsg(
        `Duplicate Candidate Name! "${trimmedName}" is already registered (${duplicate.club || 'Independent'}). Duplicate names are not allowed.`
      );
      return;
    }

    const restrictionStatus = getCandidateRestrictionStatus(cand, events, heats, results, mode);
    if (restrictionStatus.isRestricted) {
      setEditErrorMsg(getCandidateEditRestrictedMessage(cand, restrictionStatus));
      return;
    }

    if (editSelectedEvents.length === 0) {
      setEditErrorMsg('Please select at least one event.');
      return;
    }

    const targetClub =
      mode === 'client'
        ? (cand.club || 'Independent')
        : editClub.trim().toUpperCase() || 'SELF';

    if (editSelectedEvents.includes(0) && !isClubAllowedForEvent0(targetClub)) {
      setEditErrorMsg('Event #0 is restricted to Sasthitala Agrani, Agrani, SA, or Sasthitala club members only.');
      return;
    }

    setIsSavingEdit(true);
    try {
      let totalFees = 0;
      if (editFeeStatus !== 'Free' && editFeeStatus !== 'Exempted [E]') {
        for (const evtNo of editSelectedEvents) {
          const ev = events.find((e) => Number(e.Evt_No) === Number(evtNo));
          totalFees += ev && ev.Fees !== undefined ? Number(ev.Fees) : 0;
        }
      }

      const updated: Candidate = {
        ...cand,
        name: trimmedName,
        club: targetClub,
        gender: criteriaGenderDisplay,
        height: editHeight || 'ALL',
        feeStatus: editFeeStatus,
        selectedEvents: editSelectedEvents,
        totalFees,
        updatedAt: new Date().toISOString(),
        isDirty: mode !== 'server',
        synced: mode === 'server',
      };

      await onSaveCandidate(updated);
      setEditingRowKey(null);
      setEditErrorMsg(null);
    } catch (err: any) {
      setEditErrorMsg(err?.message || 'Failed to update candidate details.');
    } finally {
      setIsSavingEdit(false);
    }
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

  const getRegisteredClubLogo = () => {
    if (settings.registeredClubLogo && settings.registeredClubLogo.trim() !== '') {
      return settings.registeredClubLogo;
    }
    const hostClub =
      clubs.find((c) =>
        c.name.toLowerCase().includes((settings.registeredClubName || settings.organizer || 'agrani').toLowerCase())
      ) || clubs[0];
    if (hostClub?.logoUrl && hostClub.logoUrl.trim() !== '') {
      return hostClub.logoUrl;
    }
    return '/icon.png';
  };

  const getThermalClubName = () => {
    return settings.registeredClubName || settings.organizer || 'Agrani Sasthitala Sangha';
  };

  const currentTimestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const handleExecutePrint = async () => {
    if (modalFormat === 'thermal' && (isWebBluetoothSupported() || isMobileClient())) {
      const receiptEl = thermalReceiptRef.current || (document.querySelector('.receipt') as HTMLElement | null);
      setIsDirectPrinting(true);
      setDirectPrintStatus({ message: 'Sending directly to thermal printer...', type: 'info' });
      try {
        const result = await printDirectlyToThermalPrinter(receiptEl, thermalConfig);
        if (result.success) {
          setDirectPrintStatus({ message: result.message || 'Printed directly to thermal printer!', type: 'success' });
          setTimeout(() => setDirectPrintStatus(null), 4000);
        } else {
          setDirectPrintStatus({ message: result.message, type: 'error' });
          setTimeout(() => setDirectPrintStatus(null), 3500);
        }
      } catch (err: any) {
        console.warn('Bluetooth thermal print fallback:', err?.message || err);
        window.print();
        setDirectPrintStatus({ message: 'Printed via print dialog (Bluetooth unavailable in this frame)', type: 'info' });
        setTimeout(() => setDirectPrintStatus(null), 4000);
      } finally {
        setIsDirectPrinting(false);
      }
      return;
    }

    window.print();
  };

  const handleShareWhatsApp = async () => {
    if (chestWiseCandidates.length === 0) {
      setDirectPrintStatus({ message: 'No candidate records available to share.', type: 'error' });
      setTimeout(() => setDirectPrintStatus(null), 4000);
      return;
    }

    const currentYear = new Date().getFullYear();

    // Normal (A4) format -> Share Name List A4 PDF
    if (modalFormat === 'a4') {
      const fileName = buildServerReportFileName('chest', { year: currentYear, extension: 'pdf' });
      const docTitle = `Name List - ${currentYear}`;
      setIsSharingWhatsApp(true);
      setDirectPrintStatus({ message: 'Generating Name List A4 PDF...', type: 'info' });

      try {
        const pdfBlob = await generateNameListA4PdfBlob({
          candidates: chestWiseCandidates,
          settings,
          clubs,
        });
        if (!pdfBlob) {
          setDirectPrintStatus({ message: 'Failed to generate Name List A4 PDF.', type: 'error' });
          setTimeout(() => setDirectPrintStatus(null), 4000);
          return;
        }
        const res = await shareA4PdfBlob(pdfBlob, fileName, docTitle);
        if (!res.cancelled) {
          setDirectPrintStatus({ message: res.message, type: res.success ? 'success' : 'error' });
          setTimeout(() => setDirectPrintStatus(null), 5000);
        } else {
          setDirectPrintStatus(null);
        }
      } finally {
        setIsSharingWhatsApp(false);
      }
      return;
    }

    // Thermal format -> Share complete white-page thermal sheet in offline HTML format
    const targetEl = thermalReceiptRef.current || (document.querySelector('.receipt') as HTMLElement | null);
    const fileName = buildServerReportFileName('chest', { year: currentYear, extension: 'html' });
    const docTitle = fileName.replace(/\.html$/i, '');

    if (!targetEl) {
      setDirectPrintStatus({ message: 'Unable to locate Name List thermal sheet for offline HTML export.', type: 'error' });
      setTimeout(() => setDirectPrintStatus(null), 4000);
      return;
    }

    setIsSharingWhatsApp(true);
    setDirectPrintStatus({ message: 'Generating offline HTML for Name List...', type: 'info' });
    try {
      const htmlBlob = await receiptDomToOfflineHtmlBlob(targetEl, {
        title: docTitle,
        printableWidthMm: thermalConfig.printableWidth,
      });
      if (!htmlBlob) {
        setDirectPrintStatus({ message: 'Failed to generate offline HTML for Name List.', type: 'error' });
        setTimeout(() => setDirectPrintStatus(null), 4000);
        return;
      }
      const res = await shareThermalHtmlBlob(htmlBlob, fileName, docTitle);
      if (!res.cancelled) {
        setDirectPrintStatus({ message: res.message, type: res.success ? 'success' : 'error' });
        setTimeout(() => setDirectPrintStatus(null), 5000);
      } else {
        setDirectPrintStatus(null);
      }
    } finally {
      setIsSharingWhatsApp(false);
    }
  };

  const renderThermalCandidateList = () => {
    const totalFees = chestWiseCandidates.reduce((s, c) => s + (Number(c.totalFees) || 0), 0);
    const totalPaid = chestWiseCandidates.reduce((s, c) => {
      const st = (c.feeStatus || 'Paid').toUpperCase();
      if (!st.includes('UNPAID') && !st.includes('DUE') && !st.includes('EXEMPT') && !st.includes('FREE')) {
        return s + (Number(c.totalFees) || 0);
      }
      return s;
    }, 0);
    const totalDue = chestWiseCandidates.reduce((s, c) => {
      const st = (c.feeStatus || 'Paid').toUpperCase();
      if (st.includes('UNPAID') || st.includes('DUE')) {
        return s + (Number(c.totalFees) || 0);
      }
      return s;
    }, 0);

    return (
      <div style={{ fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif' }}>
        <div className="w-full pb-1 mb-1 border-b border-dashed border-black pt-1">
          <div className="flex items-center justify-center gap-1.5 leading-tight flex-wrap text-center">
            <ThermalLogo
              src={getRegisteredClubLogo()}
              alt="Club Logo"
              className="thermal-header-logo w-5 h-5 shrink-0 object-contain"
              rasterSizePx={64}
            />
            <span className="thermal-header-club font-bold uppercase tracking-tight text-black break-words">
              {getThermalClubName()}
            </span>
          </div>
          <div className="thermal-ordinal-title font-normal text-black leading-tight mt-0.5 break-words text-center">
            {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
          </div>
        </div>

        <div className="text-center font-bold uppercase mb-1 tracking-wider leading-tight">
          NAME LIST
        </div>

        <div className="flex items-center font-normal leading-tight text-black pb-0.5">
          <span className="w-[2.4em] pr-0.5 text-left shrink-0 font-normal">SL</span>
          <span className="w-[2.3em] text-left shrink-0 font-normal">CH</span>
          <span className="flex-1 text-left pl-0.5 font-normal">NAME</span>
          <span className="text-right pl-1 shrink-0 font-normal">EVTS</span>
        </div>
        <div className="w-full border-b border-black mb-1"></div>

        <div className="space-y-0 text-black">
          {chestWiseCandidates.map((c, idx) => {
            const clubText = c.club ? `(${c.club})` : '';
            const evtsText = (c.selectedEvents || []).map(Number).sort((a, b) => a - b).join(',');
            return (
              <div key={c.id || c.chestNo}>
                <div className="flex items-start py-0.5 leading-tight">
                  <span className="w-[2.4em] pr-0.5 text-left font-normal shrink-0">{idx + 1}</span>
                  <span className="w-[2.3em] text-left font-normal shrink-0 thermal-chest-no">{c.chestNo}</span>
                  <div className="flex-1 min-w-0 text-left pl-0.5">
                    <ThermalTwoLineRecord
                      text={`${c.name} ${clubText}`.trim()}
                      rightText={evtsText}
                      rightClassName="max-w-[26%] !pl-1 thermal-record-clamp-2 thermal-evts-col font-normal"
                      deps={[thermalConfig.printableWidth, thermalConfig.fontSize, thermalConfig.lineSpacing, thermalConfig.marginHorizontal]}
                    />
                  </div>
                </div>
                <div className="w-full border-b border-dotted border-black/80"></div>
              </div>
            );
          })}
        </div>

        <div className="w-full mt-1 pt-0.5 font-normal leading-tight text-center text-black break-words">
          <span>
            Amt:{settings.currencySymbol || '₹'}{totalFees.toFixed(0)} | P:{settings.currencySymbol || '₹'}{totalPaid.toFixed(0)} | D:{settings.currencySymbol || '₹'}{totalDue.toFixed(0)}
          </span>
        </div>

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
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-3 print:max-w-none print:m-0 print:p-0">
      
      <div className={`space-y-3 candidate-web-content ${showPrintModal ? 'print:hidden' : ''}`}>
      {/* CARD CONTAINER: Medium-light slate surface (not dark, not glaring white) */}
      <div className="bg-slate-200 border border-slate-300 rounded-2xl shadow-lg text-slate-900 animate-in fade-in">
        
        {/* SEARCH BAR SECTION: Compact height */}
        <div className="px-2.5 sm:px-3 py-1 bg-slate-200 border-b border-slate-300 rounded-t-2xl">
          <div className="flex items-center gap-1.5 sm:gap-2">
            
            {/* Search Box */}
            <div className="flex-1 h-7 sm:h-8 flex items-center bg-slate-100 border-2 border-amber-500 rounded-xl px-2.5 py-0 shadow-2xs">
              <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
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
                      startInlineEdit(singleCand, rowKey);
                    }
                  }
                }}
                placeholder="Search chest no, name, club, events..."
                className="w-full h-full bg-transparent text-slate-900 placeholder:text-slate-500 text-xs sm:text-sm font-semibold px-2 py-0 leading-none focus:outline-hidden"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-slate-500 hover:text-slate-900 p-0.5 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Close 'X' Button */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-700 hover:text-slate-950 hover:bg-slate-300/80 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Close and return"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
              </button>
            )}

          </div>
        </div>

        {/* CATEGORY COUNTER LABELS (Left) + STATUS COUNT LABEL x/y & 3-DOT MENU (Right) */}
        <div className="flex items-center justify-between gap-1 px-2 sm:px-3 py-1.5 bg-slate-200/70 border-b border-slate-300">
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
            {/* ALL */}
            <button
              type="button"
              onClick={() => setActiveCategoryPill('ALL')}
              className={`h-7 sm:h-8 px-1.5 sm:px-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shrink-0 ${
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
              className={`h-7 sm:h-8 px-1.5 sm:px-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shrink-0 ${
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
              className={`h-7 sm:h-8 px-1.5 sm:px-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shrink-0 ${
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
              className={`h-7 sm:h-8 px-1.5 sm:px-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shrink-0 ${
                activeCategoryPill === 'G'
                  ? 'bg-amber-100 border-2 border-amber-500 text-slate-950 shadow-xs font-extrabold'
                  : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-white hover:border-slate-400'
              }`}
            >
              G ({pillCounts.g})
            </button>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <div
              className="text-[11px] sm:text-xs font-mono tabular-nums whitespace-nowrap text-slate-700"
              title={`Showing ${filteredCandidates.length} of ${uniqueCandidates.length} candidates`}
            >
              <span className="font-black text-slate-950">{filteredCandidates.length}</span>
              <span className="text-slate-500 font-bold">/</span>
              <span className="font-bold text-slate-700">{uniqueCandidates.length}</span>
            </div>

            {/* Three Vertical Dot Menu containing the 4 action buttons */}
            <div ref={actionMenuRef} className="relative">
              <button
                type="button"
                id="btn-candidates-more-actions"
                onClick={() => setShowActionMenu((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={showActionMenu}
                aria-label="More actions"
                title="Print, Export & Sync Actions"
                className={`relative p-1 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
                  showActionMenu
                    ? 'bg-slate-300 text-slate-950'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-slate-300/80'
                }`}
              >
                <MoreVertical className="w-4 h-4 stroke-[2.25]" />
                {unsyncedCandidates.length > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-slate-200 pointer-events-none" />
                )}
              </button>

              {showActionMenu && (
                <div
                  role="menu"
                  aria-label="Candidate list actions"
                  className="absolute right-0 top-full mt-1.5 z-50 w-48 bg-white border border-slate-300 rounded-xl shadow-xl p-1.5 space-y-1 text-xs animate-in fade-in duration-100"
                >
                  {mode !== 'client' && (
                    <>
                      {/* Print / Share List Button */}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowActionMenu(false);
                          setShowPrintModal(true);
                        }}
                        className="w-full px-2.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
                        title="Print or Share Candidate List (Normal A4 & Thermal)"
                      >
                        <Printer className="w-4 h-4 shrink-0" />
                        <span>Print / Share List</span>
                      </button>

                      {/* Export Excel (.xlsx) */}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={async () => {
                          setShowActionMenu(false);
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
                        className="w-full px-2.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 active:scale-[0.98] text-white font-bold flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
                        title="Download Excel Workbook (.xlsx) with 'General Entry' & 'Event Allocation' sheets"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-100 shrink-0" />
                        <span>Export Excel</span>
                      </button>

                      {/* Export CSV */}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowActionMenu(false);
                          handleExportCSV();
                        }}
                        className="w-full px-2.5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 active:scale-[0.98] text-white font-bold flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
                        title="Export to CSV"
                      >
                        <Download className="w-4 h-4 text-white shrink-0" />
                        <span>Export CSV</span>
                      </button>
                    </>
                  )}

                  {/* Send (Sync) Button */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowActionMenu(false);
                      onSyncToServer();
                    }}
                    disabled={isSyncing || (mode === 'client' && (settings?.clientResponseEnabled === false))}
                    className={`w-full px-2.5 py-2 rounded-lg active:scale-[0.98] text-white font-bold flex items-center justify-between gap-2 transition-all shadow-2xs ${
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
                  >
                    <span className="flex items-center gap-2">
                      <Send className={`w-4 h-4 shrink-0 ${isSyncing ? 'animate-pulse' : ''}`} />
                      <span>{isSyncing ? 'Syncing...' : 'Sync Records'}</span>
                    </span>
                    {unsyncedCandidates.length > 0 && (
                      <span className="px-1.5 min-w-[18px] h-4 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center">
                        {unsyncedCandidates.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
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
        <div className="overflow-y-auto divide-y divide-slate-300/80 max-h-[65vh] bg-slate-100 rounded-b-2xl">
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

                  {/* EXPANDED DETAILS / IN-PLACE EDIT SECTION */}
                  {isExpanded && (() => {
                    const isRowEditing = editingRowKey === rowKey && !isCancelled && !isRestricted;

                    if (isRowEditing) {
                      return (
                        <div className="mt-2 pt-2.5 border-t border-blue-300/80 space-y-2.5 animate-in fade-in duration-150">
                          <div className="bg-white/95 border border-amber-400 rounded-xl p-2.5 sm:p-3 shadow-xs space-y-2.5">
                            {/* Name & Club Inputs */}
                            <div className={`grid gap-2 ${mode !== 'client' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  Candidate Name
                                </label>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => handleEditNameChange(e.target.value, cand)}
                                  placeholder="CANDIDATE NAME"
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white text-slate-950 font-bold text-xs sm:text-sm uppercase focus:outline-hidden"
                                />
                              </div>

                              {mode !== 'client' && (
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                    Club Name
                                  </label>
                                  <input
                                    type="text"
                                    list="inline-edit-clubs-datalist"
                                    value={editClub}
                                    onChange={(e) => setEditClub(e.target.value.toUpperCase())}
                                    placeholder="CLUB NAME (Blank = SELF)"
                                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white text-slate-950 font-bold text-xs sm:text-sm uppercase focus:outline-hidden"
                                  />
                                  <datalist id="inline-edit-clubs-datalist">
                                    {enrolledClubSuggestions.map((cName) => (
                                      <option key={cName} value={cName} />
                                    ))}
                                  </datalist>
                                </div>
                              )}
                            </div>

                            {/* Height, Gender & Fee Status */}
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  Height
                                </label>
                                <select
                                  value={editHeight}
                                  onChange={(e) => {
                                    const newHeight = e.target.value;
                                    if (newHeight !== editHeight) {
                                      setEditHeight(newHeight);
                                      setEditSelectedEvents([]);
                                    }
                                  }}
                                  className="w-full px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white text-slate-950 font-bold text-xs focus:outline-hidden cursor-pointer"
                                >
                                  <option value="ALL">ALL</option>
                                  {availableHeights.map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  Gender
                                </label>
                                <select
                                  value={editGender}
                                  onChange={(e) => {
                                    const newGender = e.target.value;
                                    if (newGender !== editGender) {
                                      setEditGender(newGender);
                                      setEditSelectedEvents([]);
                                    }
                                  }}
                                  className="w-full px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white text-slate-950 font-bold text-xs focus:outline-hidden cursor-pointer"
                                >
                                  <option value="B">B</option>
                                  <option value="G">G</option>
                                  <option value="C">C</option>
                                  <option value="ALL">ALL</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                                  Fee Status
                                </label>
                                <select
                                  value={editFeeStatus}
                                  onChange={(e) => setEditFeeStatus(e.target.value)}
                                  className="w-full px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white text-slate-950 font-bold text-xs focus:outline-hidden cursor-pointer"
                                >
                                  <option value="Due">Due</option>
                                  <option value="Paid">Paid</option>
                                  {mode !== 'client' && <option value="Free">Free</option>}
                                </select>
                              </div>
                            </div>

                            {/* Inline Multi-Select Events */}
                            <div className="space-y-1.5 pt-0.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-[11px] font-bold text-slate-700">
                                  Select Events{' '}
                                  <span className="font-normal text-slate-500">
                                    ({(!editHeight || editHeight === 'ALL') && (!editGender || editGender === 'ALL')
                                      ? 'ALL / ALL • #15 Only'
                                      : `${criteriaGenderDisplay} • ${editHeight || 'ALL'} & higher`})
                                  </span>
                                </span>
                                <span className="text-[11px] font-mono font-bold text-amber-800">
                                  {editSelectedEvents.length} selected • {settings.currencySymbol || '₹'}{inlineEditTotalFees.toFixed(0)}
                                </span>
                              </div>

                              <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1.5 rounded-lg bg-slate-100 border border-slate-200">
                                {eligibleEditEvents.length === 0 ? (
                                  <div className="col-span-full text-center py-4 text-slate-500 text-xs">
                                    No events found matching criteria.
                                  </div>
                                ) : (
                                  eligibleEditEvents.map((evt) => {
                                    const evtNo = Number(evt.Evt_No);
                                    const isSelected = editSelectedEvents.includes(evtNo);
                                    const isEvt0Disabled = evtNo === 0 && !isClubAllowedForEvent0(editClub);
                                    const serverDisableReason = getServerEventEnrollmentDisableReason(evt, results, mode);
                                    const isDisabled = isEvt0Disabled || Boolean(serverDisableReason && !isSelected);
                                    const cleanHeight = (evt.Height || '').replace(/`/g, "'");
                                    return (
                                      <button
                                        key={evtNo}
                                        type="button"
                                        disabled={isDisabled}
                                        onClick={() => toggleInlineEditEvent(evtNo, evt, isSelected)}
                                        title={
                                          isEvt0Disabled
                                            ? 'Restricted to Sasthitala Agrani / Agrani / SA / Sasthitala'
                                            : serverDisableReason || `${evt.Evt_Name} (${evt.Gender} • ${cleanHeight})`
                                        }
                                        aria-pressed={isSelected}
                                        className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                          isSelected
                                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                            : 'bg-white hover:bg-amber-50 text-slate-800 border-slate-300'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span
                                            className={`px-1.5 py-0.5 rounded font-mono font-black text-[11px] shrink-0 ${
                                              isSelected ? 'bg-emerald-800 text-white' : 'bg-amber-100 text-amber-950'
                                            }`}
                                          >
                                            #{evtNo}
                                          </span>
                                          <div className="min-w-0">
                                            <div className="text-[11px] font-bold uppercase truncate leading-tight">
                                              {evt.Evt_Name}
                                            </div>
                                            <div className={`text-[10px] font-mono leading-tight ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                                              {evt.Gender} • {cleanHeight} • {settings.currencySymbol || '₹'}{Number(evt.Fees ?? 0).toFixed(0)}
                                            </div>
                                          </div>
                                        </div>
                                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0 stroke-[3]" />}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* Validation Error */}
                            {editErrorMsg && (
                              <div className="p-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>{editErrorMsg}</span>
                              </div>
                            )}

                            {/* Inline Save / Cancel */}
                            <div className="flex items-center justify-end gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={cancelInlineEdit}
                                className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveInlineEdit(cand)}
                                disabled={isSavingEdit || Boolean(editErrorMsg) || editSelectedEvents.length === 0}
                                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black shadow-xs cursor-pointer transition-all disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

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
                                onClick={() => startInlineEdit(cand, rowKey)}
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

      </div>

      </div>

      {/* CANDIDATE LIST PRINT / SHARE PREVIEW MODAL (Normal A4 & 58mm Thermal) */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-black/85 backdrop-blur-2xs overflow-y-auto print:static print:inset-auto print:p-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
          {/* Dynamic Print Stylesheet */}
          {modalFormat === 'thermal' ? (
            <style>{`
              @media print {
                header, nav, footer, .candidate-web-content {
                  display: none !important;
                }
              }
              ${generateThermalPrintCSS(thermalConfig)}
            `}</style>
          ) : (
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
          )}
          <div className="bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:max-w-none print:rounded-none print:overflow-visible print:p-0">
            {/* Modal Actions Bar (Hidden on print) */}
            <div className="px-3 sm:px-5 py-2.5 sm:py-3 bg-slate-900 text-white flex flex-col gap-2 border-b border-slate-800 print:hidden">
              {/* Row 1: Page Title on Left | Transparent 'X' Close Button on Right */}
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <Printer className="w-4 h-4 text-blue-400 shrink-0" />
                  <h3 className="font-bold text-xs sm:text-base truncate">Name List</h3>
                </div>

                {/* Transparent 'X' Close Button */}
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="flex items-center justify-center p-1.5 rounded-lg bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95 shrink-0"
                  title="Close Preview (X)"
                  aria-label="Close Print Preview"
                >
                  <X className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>

              {/* Row 2: Format Switcher (Normal/Thermal) on Left | Thermal Setup, Direct Print, WhatsApp Share on Right */}
              <div className="flex items-center justify-between gap-2 w-full flex-wrap">
                {/* Left: Format Switcher: Normal (A4) & Thermal */}
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalFormat('a4')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      modalFormat === 'a4'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Normal (A4 Plain Paper)"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Normal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalFormat('thermal')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      modalFormat === 'thermal'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Thermal (58mm Roll Receipt)"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Thermal</span>
                  </button>
                </div>

                {/* Right: Thermal Setup (disabled when Normal), Direct Print (Icon Only), WhatsApp Share (Icon Only) */}
                <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
                  {/* Thermal Printer Page Setup Button (to the left of Print icon button, disabled in Normal mode) */}
                  <button
                    type="button"
                    disabled={modalFormat !== 'thermal'}
                    onClick={() => setShowThermalSetup(true)}
                    className={`p-2 rounded-lg border transition-all shrink-0 ${
                      modalFormat === 'thermal'
                        ? 'border-amber-500/40 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white active:scale-95 cursor-pointer'
                        : 'border-slate-700 bg-slate-800/60 text-slate-500 opacity-40 cursor-not-allowed'
                    }`}
                    title={
                      modalFormat === 'thermal'
                        ? 'Thermal Printer Setup'
                        : 'Switch to Thermal mode to configure thermal page setup'
                    }
                    aria-label="Thermal Printer Setup"
                  >
                    <Sliders className="w-4 h-4 shrink-0" />
                  </button>

                  {/* Direct Print Trigger (Icon Only) */}
                  <button
                    type="button"
                    id="btn-candidate-modal-print"
                    disabled={isDirectPrinting}
                    onClick={handleExecutePrint}
                    className={`p-2 rounded-lg font-bold flex items-center justify-center transition-all shadow-md cursor-pointer disabled:opacity-60 active:scale-95 shrink-0 ${
                      modalFormat === 'thermal'
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                    title={
                      isDirectPrinting
                        ? 'Printing...'
                        : modalFormat === 'thermal'
                        ? 'Print directly to thermal printer'
                        : 'Print Normal A4 List'
                    }
                    aria-label="Print List"
                  >
                    {isDirectPrinting ? (
                      <RefreshCw className={`w-4 h-4 animate-spin ${modalFormat === 'thermal' ? 'text-slate-950' : 'text-white'}`} />
                    ) : (
                      <Printer className={`w-4 h-4 ${modalFormat === 'thermal' ? 'text-slate-950' : 'text-white'}`} />
                    )}
                  </button>

                  {/* WhatsApp Share Button (Icon Only) - A4 PDF for Normal, Offline HTML for Thermal */}
                  <button
                    type="button"
                    id="btn-candidate-modal-whatsapp"
                    disabled={isSharingWhatsApp}
                    onClick={handleShareWhatsApp}
                    className={`p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer shrink-0 ${
                      isSharingWhatsApp ? 'opacity-60 cursor-wait' : ''
                    }`}
                    title={
                      modalFormat === 'a4'
                        ? 'Share Name List A4 Report via WhatsApp (PDF)'
                        : 'Share Name List Thermal Report via WhatsApp (Offline HTML)'
                    }
                    aria-label="Share via WhatsApp"
                  >
                    {isSharingWhatsApp ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white shrink-0" />
                    ) : (
                      <WhatsAppIcon className="w-4 h-4 text-white shrink-0" />
                    )}
                  </button>
                </div>
              </div>

              {/* Status Alert Banner */}
              {directPrintStatus && (
                <div
                  className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 animate-in fade-in duration-150 ${
                    directPrintStatus.type === 'error'
                      ? 'bg-rose-500/20 text-rose-200 border-rose-500/30'
                      : directPrintStatus.type === 'success'
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {isDirectPrinting || isSharingWhatsApp ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate">{directPrintStatus.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDirectPrintStatus(null)}
                    className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Scrollable Preview Canvas */}
            {modalFormat === 'thermal' ? (
              <div className="p-3 sm:p-8 bg-slate-300 overflow-y-auto flex-1 flex flex-col items-center print:p-0 print:bg-white print:overflow-visible print:block">
                <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5 print:hidden">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  <span>58mm Roll Preview ({thermalConfig.printableWidth}mm • {thermalConfig.fontSize}pt)</span>
                </div>
                <div
                  ref={thermalReceiptRef}
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
                  {renderThermalCandidateList()}
                </div>
              </div>
            ) : (
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

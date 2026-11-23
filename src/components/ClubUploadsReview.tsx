import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ClientUpload, 
  Candidate, 
  SportEvent, 
  Club, 
  SportsMeetSettings 
} from '../types';
import { api } from '../services/api';
import { 
  CloudUpload, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Filter, 
  Trash2, 
  Edit3, 
  UserCheck, 
  Building2, 
  RefreshCw, 
  Sparkles,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  Users,
  List,
  X,
  Radio,
  Ban,
  Pause
} from 'lucide-react';

interface ClubUploadsReviewProps {
  uploads: ClientUpload[];
  events: SportEvent[];
  clubs: Club[];
  settings: SportsMeetSettings;
  serverCandidates: Candidate[];
  onRefresh: () => Promise<void>;
  onMergeSuccess: (msg: string) => void;
  onNavigateToCandidates?: () => void;
  onSaveSettings?: (settings: SportsMeetSettings) => Promise<void>;
}

export const ClubUploadsReview: React.FC<ClubUploadsReviewProps> = ({
  uploads,
  events,
  clubs,
  settings,
  serverCandidates,
  onRefresh,
  onMergeSuccess,
  onNavigateToCandidates,
  onSaveSettings,
}) => {
  const [selectedClubFilter, setSelectedClubFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'merged' | 'rejected'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedUploads, setExpandedUploads] = useState<Record<string, boolean>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isApprovedGroupExpanded, setIsApprovedGroupExpanded] = useState<boolean>(false);
  const [isRejectedGroupExpanded, setIsRejectedGroupExpanded] = useState<boolean>(false);

  // Event List miniature popup state (anchored like settings button click)
  const [showEventListPopup, setShowEventListPopup] = useState(false);
  const [popupCoords, setPopupCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [eventFilterTerm, setEventFilterTerm] = useState('');
  const eventListBtnRef = useRef<HTMLButtonElement>(null);
  const eventListPopupRef = useRef<HTMLDivElement>(null);

  // Position calculation so popup floats over scrolling page section with no scrollbars
  const updatePopupPosition = () => {
    if (eventListBtnRef.current) {
      const rect = eventListBtnRef.current.getBoundingClientRect();
      const popupWidth = Math.min(500, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - popupWidth - 12));
      setPopupCoords({
        top: rect.bottom + 8,
        left,
      });
    }
  };

  useEffect(() => {
    if (showEventListPopup) {
      updatePopupPosition();
      window.addEventListener('resize', updatePopupPosition);
      window.addEventListener('scroll', updatePopupPosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePopupPosition);
      window.removeEventListener('scroll', updatePopupPosition, true);
    };
  }, [showEventListPopup]);

  // Close Event List popup on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        eventListPopupRef.current &&
        !eventListPopupRef.current.contains(target) &&
        eventListBtnRef.current &&
        !eventListBtnRef.current.contains(target)
      ) {
        setShowEventListPopup(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEventListPopup(false);
      }
    };
    if (showEventListPopup) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showEventListPopup]);

  // Sorted and filtered master events for the miniature popup
  const sortedAndFilteredEvents = useMemo(() => {
    const sorted = [...(events || [])].sort((a, b) => Number(a.Evt_No) - Number(b.Evt_No));
    if (!eventFilterTerm.trim()) return sorted;
    const q = eventFilterTerm.toLowerCase();
    return sorted.filter((e) => {
      const matchNo = String(e.Evt_No).includes(q);
      const matchName = (e.Evt_Name || '').toLowerCase().includes(q);
      const matchHeight = (e.Height || '').toLowerCase().includes(q);
      const matchGender = (e.Gender || '').toLowerCase().includes(q);
      return matchNo || matchName || matchHeight || matchGender;
    });
  }, [events, eventFilterTerm]);

  // Edit Candidate Modal state
  const [editingCandidate, setEditingCandidate] = useState<{
    uploadId: string;
    candidate: Candidate;
  } | null>(null);
  const [editForm, setEditForm] = useState<Partial<Candidate>>({});

  // Existing server candidate names set for duplicate checking
  const existingServerNames = useMemo(() => {
    return new Set(serverCandidates.map((c) => (c.name || '').trim().toUpperCase()));
  }, [serverCandidates]);

  // Event map for quick lookup
  const eventMap = useMemo(() => {
    const map = new Map<number, SportEvent>();
    events.forEach((e) => map.set(Number(e.Evt_No), e));
    return map;
  }, [events]);

  // Toggle expand/collapse of an upload card
  const toggleExpand = (id: string) => {
    setExpandedUploads((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Background sync is handled by App.tsx sync-summary listener
  // Window focus / visibility also triggers fresh data loads.

  // Filtered uploads
  const filteredUploads = useMemo(() => {
    return uploads.filter((u) => {
      // Club filter
      if (selectedClubFilter !== 'ALL' && u.club !== selectedClubFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'ALL' && u.status !== statusFilter) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesClub = (u.club || '').toLowerCase().includes(term);
        const matchesClient = (u.clientName || '').toLowerCase().includes(term);
        const matchesId = (u.id || '').toLowerCase().includes(term);
        const matchesCandidate = (u.candidates || []).some((c) =>
          (c.name || '').toLowerCase().includes(term)
        );
        return matchesClub || matchesClient || matchesId || matchesCandidate;
      }
      return true;
    });
  }, [uploads, selectedClubFilter, statusFilter, searchTerm]);

  // Pending client requests sorted descending upon date & time (newest first)
  const pendingUploads = useMemo(() => {
    return filteredUploads
      .filter((u) => u.status === 'pending')
      .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
  }, [filteredUploads]);

  // Approved client requests sorted descending upon date & time (newest first)
  const approvedUploads = useMemo(() => {
    return filteredUploads
      .filter((u) => u.status === 'merged')
      .sort((a, b) => {
        const timeB = new Date(b.mergedAt || b.uploadedAt || 0).getTime();
        const timeA = new Date(a.mergedAt || a.uploadedAt || 0).getTime();
        return timeB - timeA;
      });
  }, [filteredUploads]);

  // Rejected client requests sorted descending upon date & time
  const rejectedUploads = useMemo(() => {
    return filteredUploads
      .filter((u) => u.status === 'rejected')
      .sort((a, b) => {
        const timeB = new Date(b.reviewedAt || b.uploadedAt || 0).getTime();
        const timeA = new Date(a.reviewedAt || a.uploadedAt || 0).getTime();
        return timeB - timeA;
      });
  }, [filteredUploads]);
  const stats = useMemo(() => {
    const total = uploads.length;
    const pending = uploads.filter((u) => u.status === 'pending').length;
    const merged = uploads.filter((u) => u.status === 'merged').length;
    const rejected = uploads.filter((u) => u.status === 'rejected').length;
    const totalAthletes = uploads.reduce((acc, u) => acc + (u.candidates?.length || 0), 0);
    const pendingAthletes = uploads
      .filter((u) => u.status === 'pending')
      .reduce((acc, u) => acc + (u.candidates?.length || 0), 0);

    return { total, pending, merged, rejected, totalAthletes, pendingAthletes };
  }, [uploads]);

  // Unique clubs present in uploads
  const uploadClubs = useMemo(() => {
    const clubsSet = new Set<string>();
    uploads.forEach((u) => clubsSet.add(u.club));
    return Array.from(clubsSet).sort();
  }, [uploads]);

  // Action: Merge Entire Upload Batch
  const handleMergeUpload = async (upload: ClientUpload) => {
    setActionError(null);
    setProcessingId(upload.id);
    try {
      const res = await api.mergeUpload(upload.id);
      await onRefresh();
      onMergeSuccess(
        `Merged ${res.mergedCandidates.length} athlete(s) from "${upload.club}" into official server data! Official chest numbers assigned.`
      );
    } catch (err: any) {
      setActionError(`Merge failed: ${err.message || 'Error occurred'}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Action: Reject Upload Batch
  const handleRejectUpload = async (upload: ClientUpload) => {
    const reason = 'Rejected by server admin';
    setActionError(null);
    setProcessingId(upload.id);
    try {
      await api.rejectUpload(upload.id, reason);
      await onRefresh();
      onMergeSuccess(`Batch from "${upload.club}" marked as rejected.`);
    } catch (err: any) {
      setActionError(`Failed to reject: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Action: Delete Upload Batch
  const handleDeleteUpload = async (uploadId: string, club: string) => {
    setActionError(null);
    setProcessingId(uploadId);
    try {
      await api.deleteUpload(uploadId);
      await onRefresh();
      onMergeSuccess(`Upload batch from "${club}" deleted successfully.`);
    } catch (err: any) {
      setActionError(`Failed to delete: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Action: Merge Single Candidate from upload
  const handleMergeSingle = async (uploadId: string, candId: string, candName: string) => {
    setActionError(null);
    setProcessingId(candId);
    try {
      const res = await api.mergeSingleUploadCandidate(uploadId, candId);
      await onRefresh();
      onMergeSuccess(`Athlete "${candName}" approved and merged with Chest #${res.candidate.chestNo}!`);
    } catch (err: any) {
      setActionError(`Approval failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Action: Reject Single Candidate from upload
  const handleRejectSingle = async (uploadId: string, candId: string, candName: string) => {
    const reason = 'Not eligible or duplicate entry';
    setActionError(null);
    setProcessingId(candId);
    try {
      await api.rejectSingleUploadCandidate(uploadId, candId, reason);
      await onRefresh();
      onMergeSuccess(`Candidate "${candName}" marked as rejected.`);
    } catch (err: any) {
      setActionError(`Reject failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Open Edit Candidate Modal
  const openEditCandidate = (uploadId: string, candidate: Candidate) => {
    setEditingCandidate({ uploadId, candidate });
    setEditForm({
      name: candidate.name,
      gender: candidate.gender,
      height: candidate.height,
      selectedEvents: [...candidate.selectedEvents],
      totalFees: candidate.totalFees,
    });
  };

  // Save Edited Candidate
  const handleSaveEditedCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCandidate) return;

    try {
      await api.editUploadCandidate(
        editingCandidate.uploadId,
        editingCandidate.candidate.id,
        editForm
      );
      await onRefresh();
      setEditingCandidate(null);
      onMergeSuccess('Candidate updated in upload batch.');
    } catch (err: any) {
      setActionError(`Update failed: ${err.message}`);
    }
  };

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  // Render individual upload batch card
  // Render individual upload batch card
  const renderUploadCard = (upload: ClientUpload, index: number = 0) => {
    const isExpanded = Boolean(expandedUploads[upload.id]);
    const isPending = upload.status === 'pending';
    const isMerged = upload.status === 'merged';
    const isRejected = upload.status === 'rejected';

    const uploadDate = new Date(upload.uploadedAt);
    const formattedUploadDate = isNaN(uploadDate.getTime())
      ? upload.uploadedAt
      : uploadDate.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }) + ' at ' + uploadDate.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

    const mergedDate = upload.mergedAt ? new Date(upload.mergedAt) : null;
    const formattedMergedDate = mergedDate && !isNaN(mergedDate.getTime())
      ? mergedDate.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }) + ' at ' + mergedDate.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : null;

    return (
      <div
        key={upload.id}
        className={`bg-white rounded-xl border transition-all duration-150 overflow-hidden shadow-2xs ${
          isPending
            ? 'border-amber-300 ring-1 ring-amber-100'
            : isMerged
            ? 'border-emerald-200'
            : 'border-slate-200 opacity-80'
        }`}
      >
        {/* Header: Responsive layout - Clean 2-row on mobile with fully visible Club Name & expand down arrow, Single-line on desktop */}
        <div className="py-2 px-3 sm:px-4 bg-slate-50/70 border-b border-slate-100 min-h-[44px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          {/* Top row on mobile / Left group on desktop */}
          <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3 min-w-0 w-full sm:w-auto">
            {/* Sl + Club Name (Fully Visible) + Expand Down Arrow */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-initial">
              {/* Sl */}
              <span className="w-6 h-6 rounded-md bg-slate-200/90 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shrink-0 border border-slate-300/60">
                {index + 1}
              </span>

              {/* Club Name & Expand Down Arrow Button - Click to expand/minimize */}
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => toggleExpand(upload.id)}
                  className="flex items-center gap-1.5 text-left group cursor-pointer focus:outline-hidden py-0.5"
                  title={isExpanded ? 'Click to minimize candidate details' : 'Click to expand candidate details'}
                >
                  <span className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase leading-snug">
                    {upload.club}
                  </span>
                  <span className="inline-flex items-center justify-center p-0.5 rounded-md text-blue-600 bg-blue-100/70 group-hover:bg-blue-200 transition-colors shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
                    )}
                  </span>
                </button>

                {/* Uploaded label below club name (Visible on Desktop) */}
                <div className="hidden sm:flex text-[11px] text-slate-500 items-center gap-2">
                  <span>
                    Uploaded: <strong>{formattedUploadDate}</strong>
                  </span>
                  {formattedMergedDate && (
                    <span className="text-emerald-700 font-semibold">
                      • Approved: <strong>{formattedMergedDate}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile-only Athletes count badge in top row */}
            <div className="sm:hidden text-right whitespace-nowrap shrink-0">
              <span className="text-[11px] font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-md">
                {(upload.candidates || []).length} Athlete{(upload.candidates || []).length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* Bottom row on mobile / Right group on desktop */}
          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
            {/* Uploaded label (Visible on Mobile) */}
            <div className="sm:hidden text-[10.5px] text-slate-500 flex items-center gap-1.5 truncate">
              <span>
                Uploaded: <strong>{formattedUploadDate}</strong>
              </span>
              {formattedMergedDate && (
                <span className="text-emerald-700 font-semibold">
                  • Approved: <strong>{formattedMergedDate}</strong>
                </span>
              )}
            </div>

            {/* Right: Athletes (Desktop) + Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto sm:ml-0">
              {/* Athletes on Desktop */}
              <div className="hidden sm:block text-right whitespace-nowrap">
                <span className="text-xs font-bold text-slate-800">
                  {(upload.candidates || []).length} Athlete{(upload.candidates || []).length === 1 ? '' : 's'}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 ml-1.5">
                  ({settings.currencySymbol}{upload.totalFees})
                </span>
              </div>

              {/* In Pending: All Ok & Reject All button */}
              {isPending && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    disabled={processingId === upload.id}
                    onClick={() => handleMergeUpload(upload)}
                    className="px-2.5 sm:px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-xs active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                    title="Approve all candidates in this batch"
                  >
                    <span>{processingId === upload.id ? 'Approving...' : '∀ ✔'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={processingId === upload.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRejectUpload(upload);
                    }}
                    className="px-2 sm:px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center disabled:opacity-50"
                    title="Reject all candidates in this batch"
                  >
                    <span>∀ ✘</span>
                  </button>

                  <button
                    type="button"
                    disabled={processingId === upload.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteUpload(upload.id, upload.club);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                    title="Delete batch record"
                    aria-label="Delete pending batch record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* In Approved: Approved label */}
              {isMerged && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Approved</span>
                  </span>
                  <button
                    type="button"
                    disabled={processingId === upload.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteUpload(upload.id, upload.club);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                    title="Delete batch record"
                    aria-label="Delete approved batch record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* In Rejected: Rejected label */}
              {isRejected && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold inline-flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Rejected</span>
                  </span>
                  <button
                    type="button"
                    disabled={processingId === upload.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteUpload(upload.id, upload.club);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                    title="Delete batch record"
                    aria-label="Delete rejected batch record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upload Rejection Note if any */}
        {upload.notes && isRejected && (
          <div className="px-5 py-2.5 bg-rose-50 text-rose-800 text-xs font-medium border-b border-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>Rejection Reason: <strong>{upload.notes}</strong></span>
          </div>
        )}

        {/* Athletes Detail List */}
        {isExpanded && (
          <div className="p-4 sm:p-5 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="pb-2.5 px-2">#</th>
                  <th className="pb-2.5 px-3">Athlete Name</th>
                  <th className="pb-2.5 px-3">Category</th>
                  <th className="pb-2.5 px-3">Height</th>
                  <th className="pb-2.5 px-3">Selected Events</th>
                  <th className="pb-2.5 px-3 text-right">Fee</th>
                  <th className="pb-2.5 px-3 text-center">Status / Chest</th>
                  <th className="pb-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(upload.candidates || []).map((cand, idx) => {
                  const candNameUpper = (cand.name || '').trim().toUpperCase();
                  const isDuplicate = existingServerNames.has(candNameUpper);
                  
                  // Official server match for chest number lookup
                  const officialServerCand = serverCandidates.find(
                    (sc) => sc.id === cand.id || (sc.name && cand.name && sc.name.trim().toUpperCase() === candNameUpper && (sc.club || '').trim().toUpperCase() === (upload.club || '').trim().toUpperCase())
                  );
                  const hasOfficialServerChest = (officialServerCand && Number(officialServerCand.chestNo) >= 101) || (Number(cand.chestNo) >= 101);
                  const officialAllottedChest = (officialServerCand && Number(officialServerCand.chestNo) >= 101) 
                    ? officialServerCand.chestNo 
                    : (Number(cand.chestNo) >= 101 ? cand.chestNo : null);
                  const isCandApproved = Boolean(cand.merged) || Boolean(isMerged) || Boolean(hasOfficialServerChest);
                  const isCandRejected = cand.status === 'rejected' || isRejected;
                  const provRecordNo = cand.localRecordNo || (!hasOfficialServerChest && Number(cand.chestNo) > 0 ? cand.chestNo : idx + 1);

                  return (
                    <tr
                      key={cand.id || idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isDuplicate && !isCandApproved ? 'bg-amber-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-2 font-mono text-slate-400 font-medium">
                        {provRecordNo}
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{cand.name}</span>
                          {isDuplicate && !isCandApproved && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold flex items-center gap-1"
                              title="A candidate with this name already exists in official server records"
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Duplicate Name Alert
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-700">
                          {cand.gender}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-medium text-slate-600">
                        {cand.height || '—'}
                      </td>

                      {/* Selected Event Column: Display just event numbers separated by comma (like 1, 8, 9...) */}
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-slate-800 text-xs">
                          {(cand.selectedEvents || []).map(Number).sort((a, b) => a - b).join(', ') || '—'}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-slate-800">
                        {settings.currencySymbol}{cand.totalFees}
                      </td>

                      {/* Status / Chest Column: Displays allotted respective chest number after merged with server database */}
                      <td className="py-3 px-3 text-center">
                        {isCandApproved && officialAllottedChest ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Chest #{officialAllottedChest}</span>
                          </span>
                        ) : isCandApproved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Approved</span>
                          </span>
                        ) : isCandRejected ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-xs">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Rejected</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending (#{provRecordNo})</span>
                          </span>
                        )}
                      </td>

                      {/* Beside each individual candidate: "Approved" or "Reject" button */}
                      <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                        {!isCandApproved && !isCandRejected && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditCandidate(upload.id, cand)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors inline-flex items-center"
                              title="Edit athlete before approval"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={processingId === cand.id}
                              onClick={() => handleMergeSingle(upload.id, cand.id, cand.name)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors inline-flex items-center justify-center cursor-pointer disabled:opacity-50 shadow-2xs"
                              title="Approve candidate and merge into server database"
                            >
                              <span>{processingId === cand.id ? '...' : '✔'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={processingId === cand.id}
                              onClick={() => handleRejectSingle(upload.id, cand.id, cand.name)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
                              title="Reject candidate"
                            >
                              <span>{processingId === cand.id ? '...' : '✘'}</span>
                            </button>
                          </>
                        )}
                        {isCandApproved && (
                          <span className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Approved {officialAllottedChest ? `(#${officialAllottedChest})` : ''}</span>
                          </span>
                        )}
                        {isCandRejected && (
                          <span className="text-[11px] font-bold text-rose-600 inline-flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Rejected</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Bar (Blue thumbnail banner removed as requested) */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
          Club Submissions & Review
        </h1>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            <span>Active Server Registry:</span>
            <span className="font-extrabold text-blue-700 font-mono">{serverCandidates.length} Athletes</span>
          </div>

          {/* Club Echo Toggle Button: Right-aligned on the same line */}
          <button
            type="button"
            id="btn-toggle-client-response"
            onClick={async () => {
              const currentStatus = settings.clientResponseEnabled ?? true;
              const newSettings = { ...settings, clientResponseEnabled: !currentStatus };
              if (onSaveSettings) {
                await onSaveSettings(newSettings);
              } else {
                await api.saveSettings(newSettings);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer border shrink-0 ${
              (settings.clientResponseEnabled ?? true)
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300'
            }`}
            title={
              (settings.clientResponseEnabled ?? true)
                ? 'Club Echo: ON (Client responses are allowed - Click to pause)'
                : 'Club Echo: PAUSED (Client responses are blocked - Click to enable)'
            }
            aria-label="Toggle Club Echo"
          >
            <span>Club Echo:</span>
            {(settings.clientResponseEnabled ?? true) ? (
              <Radio className="w-4 h-4 text-emerald-600 animate-blink-1-5s shrink-0" />
            ) : (
              <Pause className="w-4 h-4 text-rose-600 animate-blink-1-5s shrink-0" />
            )}
          </button>
        </div>
      </div>

      {/* Action Error Notification */}
      {actionError && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-800 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-xs bg-rose-200 hover:bg-rose-300 text-rose-900 px-2 py-0.5 rounded-md cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Live Incoming Requests Alert Banner */}
      {stats.pendingAthletes > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border-2 border-amber-500 text-amber-950 flex items-center justify-between gap-3 shadow-md animate-pulse">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <span className="text-xs sm:text-sm font-black text-amber-950">
              {stats.pendingAthletes} athlete(s) awaiting your approval from remote client submission!
            </span>
          </div>
          <span className="text-xs font-bold text-amber-800 hidden sm:inline">
            Click "Approve & Merge" to allot official server chest numbers.
          </span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Left Side: Event List Button + Search Box */}
        <div className="flex items-center gap-2 flex-1">
          {/* Event List Icon Button: Placed at the left of the search box */}
          <div className="relative shrink-0">
            <button
              ref={eventListBtnRef}
              type="button"
              id="btn-event-list-reference"
              onClick={() => {
                updatePopupPosition();
                setShowEventListPopup((prev) => !prev);
              }}
              className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer shadow-2xs flex items-center justify-center shrink-0 ${
                showEventListPopup
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-400/40'
                  : 'bg-slate-50 hover:bg-slate-100 text-blue-600 hover:text-blue-700 border-slate-200 active:scale-95'
              }`}
              title="Event List (Ready Reference)"
              aria-label="Event List"
              aria-expanded={showEventListPopup}
            >
              <List className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by club name, athlete name, or batch ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-hidden transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-600 rounded-full cursor-pointer transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Event Details Miniature Popup (anchored like Settings button click) */}
        {showEventListPopup && (
          <div
            ref={eventListPopupRef}
            className="fixed w-[340px] sm:w-[480px] md:w-[520px] max-w-[94vw] bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-3 sm:p-4 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: `${popupCoords.top}px`,
              left: `${popupCoords.left}px`,
              boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.22), 0 10px 20px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            {/* Header Row (like Settings popup) */}
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 px-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/60">
                  <List className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block truncate">
                    EVENT MASTER LIST
                  </span>
                  <span className="text-xs font-bold text-slate-800 block truncate">
                    Ready Reference
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                  {(events || []).length} Events
                </span>
                <button
                  type="button"
                  onClick={() => setShowEventListPopup(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick mini-filter input inside popup */}
            <div className="relative mb-2.5">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Quick search event by name, height, or gender..."
                value={eventFilterTerm}
                onChange={(e) => setEventFilterTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-hidden transition-colors"
              />
              {eventFilterTerm && (
                <button
                  type="button"
                  onClick={() => setEventFilterTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded-full cursor-pointer"
                  title="Clear filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Miniature List of Event Details */}
            <div className="max-h-72 sm:max-h-80 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
              {sortedAndFilteredEvents.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No events match "{eventFilterTerm}".
                </div>
              ) : (
                sortedAndFilteredEvents.map((evt) => (
                  <div
                    key={evt.Evt_No}
                    className="pt-1.5 first:pt-0 p-1.5 rounded-xl hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                        #{evt.Evt_No}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 truncate uppercase text-[12px] sm:text-[13px] leading-tight">
                          {evt.Evt_Name}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500 mt-0.5">
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                            {evt.Height || 'ALL'}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded font-bold ${
                              evt.Gender === 'BOYS'
                                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                : evt.Gender === 'GIRLS'
                                ? 'bg-pink-50 text-pink-700 border border-pink-200'
                                : evt.Gender === 'CHILDRENS'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {evt.Gender || 'ALL'}
                          </span>
                          {evt.requiredHit === false ? (
                            <span className="text-[10px] text-slate-400 font-medium">Final Only</span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Hit &amp; Final</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs sm:text-sm font-black text-emerald-600">
                        ₹{evt.Fees || 0}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer summary */}
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium px-1">
              <span>Showing {sortedAndFilteredEvents.length} of {(events || []).length} master events</span>
              <span className="text-slate-400 italic">Press Esc to close</span>
            </div>
          </div>
        )}

        {/* Club Filter with Refresh Symbol Button immediately to the right */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex items-center">
            <Building2 className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
            <select
              value={selectedClubFilter}
              onChange={(e) => setSelectedClubFilter(e.target.value)}
              className="text-xs sm:text-sm py-2 pl-8 pr-7 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-medium text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Clubs ({uploadClubs.length})</option>
              {uploadClubs.map((club) => (
                <option key={club} value={club}>
                  {club}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Uploads Button: Just with Refresh symbol at the rightside of club selection combo */}
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 hover:text-blue-700 rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            title="Refresh upload list from server"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* All Candidates Button Link: Beside refresh button, just in Symbols as caption */}
          {onNavigateToCandidates && (
            <button
              type="button"
              onClick={onNavigateToCandidates}
              className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 hover:text-blue-700 rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs"
              title={`View All Candidates Registry (${serverCandidates.length} enrolled)`}
            >
              <Users className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs with Counts in Button Captions */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto">
          {[
            { id: 'ALL', label: `All (${stats.total})` },
            { id: 'pending', label: `Pending (${stats.pending})` },
            { id: 'merged', label: `Merged (${stats.merged})` },
            { id: 'rejected', label: `Rejected (${stats.rejected})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Uploads Content Area */}
      {filteredUploads.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-200 space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <CloudUpload className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Uploaded Data Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {uploads.length === 0
              ? 'No client devices have submitted athlete batches yet. Open Client Portal on any smartphone or tablet to submit candidates.'
              : 'No uploads match your current search or status filter.'}
          </p>
        </div>
      ) : statusFilter === 'pending' ? (
        /* Status Filter: Pending only */
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                Pending Client Requests
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                {pendingUploads.length}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Descending date &amp; time (newest first)
            </span>
          </div>

          {pendingUploads.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs">
              No pending client requests found.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingUploads.map((u, idx) => renderUploadCard(u, idx))}
            </div>
          )}
        </div>
      ) : statusFilter === 'merged' ? (
        /* Status Filter: Merged/Approved only */
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                Approved Client Requests
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                {approvedUploads.length}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Descending date &amp; time (newest first)
            </span>
          </div>

          {approvedUploads.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs">
              No approved client requests found.
            </div>
          ) : (
            <div className="space-y-2">
              {approvedUploads.map((u, idx) => renderUploadCard(u, idx))}
            </div>
          )}
        </div>
      ) : statusFilter === 'rejected' ? (
        /* Status Filter: Rejected only */
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <XCircle className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                Rejected Client Requests
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                {rejectedUploads.length}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Descending date &amp; time (newest first)
            </span>
          </div>

          {rejectedUploads.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs">
              No rejected client requests found.
            </div>
          ) : (
            <div className="space-y-2">
              {rejectedUploads.map((u, idx) => renderUploadCard(u, idx))}
            </div>
          )}
        </div>
      ) : (
        /* Status Filter: ALL (Default view) */
        <div className="space-y-6">
          {/* Section 1: Pending Client Requests (ordered descending upon date & time) */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                  Pending Client Requests
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  {pendingUploads.length}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                Ordered by descending upon date &amp; time
              </span>
            </div>

            {pendingUploads.length > 0 && (
              <div className="space-y-2">
                {pendingUploads.map((u, idx) => renderUploadCard(u, idx))}
              </div>
            )}
          </div>

          {/* Section 2: Group all approved requests inside expand & minimized format below pending requests */}
          <div className="rounded-2xl border border-emerald-300/80 bg-white shadow-xs overflow-hidden transition-all duration-200">
            {/* Expand & Minimized Accordion Header */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsApprovedGroupExpanded((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsApprovedGroupExpanded((prev) => !prev);
                }
              }}
              className="w-full p-3.5 sm:p-4 bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-white hover:from-emerald-100/70 hover:to-emerald-50/50 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 select-none"
              title={isApprovedGroupExpanded ? 'Click to minimize approved requests' : 'Click to expand approved requests'}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-600/30">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                        Approved Requests
                      </h2>
                      <span 
                        className="inline-flex items-center justify-center p-0.5 rounded-md text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-colors shrink-0"
                        title={isApprovedGroupExpanded ? 'Click to minimize approved requests' : 'Click to expand approved requests'}
                      >
                        {isApprovedGroupExpanded ? (
                          <ChevronUp className="w-4 h-4 stroke-[2.5]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                        )}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black">
                      {approvedUploads.length} Approved {approvedUploads.length === 1 ? 'Batch' : 'Batches'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {approvedUploads.reduce((sum, u) => sum + (u.candidates?.length || 0), 0)} Athletes merged into server registry • Total Fees: {settings.currencySymbol}{approvedUploads.reduce((sum, u) => sum + (u.totalFees || 0), 0)}
                  </p>
                </div>
              </div>
            </div>

            {/* Expanded Content: Cards of all approved requests */}
            {isApprovedGroupExpanded && (
              <div className="p-3 sm:p-3.5 bg-slate-50/50 space-y-2 animate-in fade-in duration-200">
                {approvedUploads.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                    No approved client requests yet. Once pending requests are approved, they will appear here.
                  </div>
                ) : (
                  approvedUploads.map((u, idx) => renderUploadCard(u, idx))
                )}
              </div>
            )}
          </div>

          {/* Section 3: Rejected Requests (if any) */}
          {rejectedUploads.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-white shadow-xs overflow-hidden transition-all duration-200">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setIsRejectedGroupExpanded((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsRejectedGroupExpanded((prev) => !prev);
                  }
                }}
                className="w-full p-3.5 sm:p-4 bg-gradient-to-r from-rose-50/90 to-white hover:from-rose-100/70 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-100 select-none"
                title={isRejectedGroupExpanded ? 'Click to minimize rejected requests' : 'Click to expand rejected requests'}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                          Rejected Requests
                        </h2>
                        <span 
                          className="inline-flex items-center justify-center p-0.5 rounded-md text-rose-700 bg-rose-100 hover:bg-rose-200 transition-colors shrink-0"
                          title={isRejectedGroupExpanded ? 'Click to minimize rejected requests' : 'Click to expand rejected requests'}
                        >
                          {isRejectedGroupExpanded ? (
                            <ChevronUp className="w-4 h-4 stroke-[2.5]" />
                          ) : (
                            <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                          )}
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-black">
                        {rejectedUploads.length} {rejectedUploads.length === 1 ? 'Batch' : 'Batches'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {rejectedUploads.reduce((sum, u) => sum + (u.candidates?.length || 0), 0)} Athletes rejected
                    </p>
                  </div>
                </div>
              </div>

              {isRejectedGroupExpanded && (
                <div className="p-3 sm:p-3.5 bg-slate-50/50 space-y-2 animate-in fade-in duration-200">
                  {rejectedUploads.map((u, idx) => renderUploadCard(u, idx))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Candidate Modal */}
      {editingCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Edit Candidate Details
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Modify details before merging into the official database.
            </p>

            <form onSubmit={handleSaveEditedCandidate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Candidate Name
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 text-sm font-semibold uppercase focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Category
                  </label>
                  <select
                    value={editForm.gender || 'BOYS'}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                    className="w-full py-2 px-3 rounded-xl border border-slate-300 text-sm font-semibold focus:border-blue-600 focus:outline-hidden"
                  >
                    <option value="CHILDRENS">CHILDRENS</option>
                    <option value="BOYS">BOYS</option>
                    <option value="GIRLS">GIRLS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Height
                  </label>
                  <input
                    type="text"
                    value={editForm.height || ''}
                    onChange={(e) => setEditForm({ ...editForm, height: e.target.value })}
                    className="w-full py-2 px-3 rounded-xl border border-slate-300 text-sm font-semibold focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Total Fees ({settings.currencySymbol})
                </label>
                <input
                  type="number"
                  step="1"
                  value={editForm.totalFees || 0}
                  onChange={(e) => setEditForm({ ...editForm, totalFees: Number(e.target.value) })}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 text-sm font-semibold focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingCandidate(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useMemo } from 'react';
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
  Users
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
}) => {
  const [selectedClubFilter, setSelectedClubFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'merged' | 'rejected'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedUploads, setExpandedUploads] = useState<Record<string, boolean>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // Auto-refresh periodically to catch remote entries live
  React.useEffect(() => {
    const timer = setInterval(() => {
      onRefresh();
    }, 3500);
    return () => clearInterval(timer);
  }, [onRefresh]);

  // Automatically expand pending upload batches so admin immediately sees new incoming requests
  React.useEffect(() => {
    const pendingMap: Record<string, boolean> = {};
    uploads.forEach((u) => {
      if (u.status === 'pending') {
        pendingMap[u.id] = true;
      }
    });
    if (Object.keys(pendingMap).length > 0) {
      setExpandedUploads((prev) => ({ ...pendingMap, ...prev }));
    }
  }, [uploads]);

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

  // Overall statistics
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
    setProcessingId(uploadId);
    try {
      await api.deleteUpload(uploadId);
      await onRefresh();
      onMergeSuccess(`Upload batch deleted successfully.`);
    } catch (err: any) {
      setActionError(`Failed to delete: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Action: Merge Single Candidate from upload
  const handleMergeSingle = async (uploadId: string, candId: string, candName: string) => {
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

  return (
    <div className="space-y-4">
      {/* Header Bar (Blue thumbnail banner removed as requested) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            Club Submissions & Review
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pending client entries require server approval before merging into official registry and receiving chest numbers.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 self-start sm:self-auto">
          <span>Active Server Registry:</span>
          <span className="font-extrabold text-blue-700 font-mono">{serverCandidates.length} Athletes</span>
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
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by club name, athlete name, or batch ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-hidden transition-colors"
          />
        </div>

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

      {/* Uploads List */}
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
      ) : (
        <div className="space-y-4">
          {filteredUploads.map((upload) => {
            const isExpanded = expandedUploads[upload.id] ?? (upload.status === 'pending');
            const isPending = upload.status === 'pending';
            const isMerged = upload.status === 'merged';
            const isRejected = upload.status === 'rejected';

            // Find matching club info
            const clubInfo = clubs.find((c) => c.name === upload.club);

            return (
              <div
                key={upload.id}
                className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs ${
                  isPending
                    ? 'border-amber-300 ring-2 ring-amber-100'
                    : isMerged
                    ? 'border-emerald-200'
                    : 'border-slate-200 opacity-80'
                }`}
              >
                {/* Upload Card Header */}
                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70 border-b border-slate-100">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-extrabold shadow-sm">
                      {clubInfo?.shortCode ? clubInfo.shortCode.substring(0, 3) : <Building2 className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold text-slate-900 truncate">
                          {upload.club}
                        </h3>
                        {/* Status Badge */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                            isPending
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : isMerged
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {isPending && <Clock className="w-3 h-3 text-amber-600" />}
                          {isMerged && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                          {isRejected && <XCircle className="w-3 h-3 text-rose-600" />}
                          <span className="capitalize">{upload.status === 'pending' ? 'Pending Review' : upload.status}</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                        <span>
                          Uploaded: <strong>{new Date(upload.uploadedAt).toLocaleString()}</strong>
                        </span>
                        {upload.clientName && (
                          <span>
                            • Submitter: <strong>{upload.clientName}</strong>
                          </span>
                        )}
                        <span>
                          • Batch ID: <code className="font-mono text-[11px] text-slate-600">{upload.id}</code>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary & Controls */}
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200">
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-700">
                        {(upload.candidates || []).length} Athlete{(upload.candidates || []).length === 1 ? '' : 's'}
                      </div>
                      <div className="text-xs font-semibold text-emerald-600">
                        Total Fees: {settings.currencySymbol}{upload.totalFees}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Provision "Approve All" or "Reject All" button to approve as a whole */}
                      {isPending && (
                        <>
                          <button
                            type="button"
                            disabled={processingId === upload.id}
                            onClick={() => handleMergeUpload(upload)}
                            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Approve all candidates in this batch and merge into main server database"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{processingId === upload.id ? 'Approving...' : 'Approve All'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={processingId === upload.id}
                            onClick={() => handleRejectUpload(upload)}
                            className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                            title="Reject all candidates in this batch"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject All</span>
                          </button>
                        </>
                      )}

                      {/* Delete Batch Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteUpload(upload.id, upload.club)}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Delete batch record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {/* Toggle Expand */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(upload.id)}
                        className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                        title={isExpanded ? 'Collapse' : 'Expand athletes'}
                      >
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
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
                                <div className="text-[11px] text-slate-500">
                                  ID: <code className="font-mono text-[10px]">{cand.id}</code>
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
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                                      title="Approve candidate and merge into server database"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Approve</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingId === cand.id}
                                      onClick={() => handleRejectSingle(upload.id, cand.id, cand.name)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                      title="Reject candidate"
                                    >
                                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                      <span>Reject</span>
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
          })}
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

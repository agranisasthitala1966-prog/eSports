import React, { useState, useMemo, useEffect } from 'react';
import { Candidate, SportEvent, Club, EventHeat, EventResult } from '../types';
import { parseHeightToInches, isClubAllowedForEvent0 } from '../utils/heightRules';
import { 
  getCandidateRestrictionStatus, 
  getCandidateEditRestrictedMessage 
} from '../utils/qualificationRules';
import { Pencil, Check, X, AlertTriangle, Lock } from 'lucide-react';

interface CandidateEditModalProps {
  candidate: Candidate;
  events: SportEvent[];
  clubs: Club[];
  allCandidates: Candidate[];
  mode?: 'client' | 'server';
  heats?: EventHeat[];
  results?: EventResult[];
  onSave: (updatedCandidate: Candidate) => Promise<void> | void;
  onClose: () => void;
}

export const CandidateEditModal: React.FC<CandidateEditModalProps> = ({
  candidate,
  events,
  clubs,
  allCandidates,
  mode = 'client',
  heats = [],
  results = [],
  onSave,
  onClose,
}) => {
  // Check if candidate editing is restricted
  const restrictionStatus = useMemo(() => {
    return getCandidateRestrictionStatus(candidate, events, heats, results, mode);
  }, [candidate, events, heats, results, mode]);

  const isEditRestricted = restrictionStatus.isRestricted;
  const qualifiedEvents = restrictionStatus.restrictingEvents;
  // Normalize initial gender (B, G, C, ALL)
  const initialGender = useMemo(() => {
    const g = (candidate.gender || '').toUpperCase();
    if (g === 'BOYS' || g === 'B') return 'B';
    if (g === 'GIRLS' || g === 'G') return 'G';
    if (g === 'CHILDRENS' || g === 'CHILDREN' || g === 'C') return 'C';
    return 'ALL';
  }, [candidate.gender]);

  // Normalize initial fee status
  const initialFeeStatus = useMemo(() => {
    const fs = (candidate.feeStatus || '').toUpperCase();
    if (fs.includes('PAID')) return 'Paid [P]';
    if (fs.includes('FREE') || fs.includes('EXEMPT')) return 'Free [F]';
    return 'Due [D]';
  }, [candidate.feeStatus]);

  const [editName, setEditName] = useState(candidate.name || '');
  const [editClub, setEditClub] = useState(candidate.club || '');
  const [editHeight, setEditHeight] = useState(candidate.height || 'ALL');
  const [editGender, setEditGender] = useState(initialGender);
  const [editFeeStatus, setEditFeeStatus] = useState(initialFeeStatus);
  const [editSelectedEvents, setEditSelectedEvents] = useState<number[]>(
    candidate.selectedEvents ? [...candidate.selectedEvents] : []
  );
  const [editErrorMsg, setEditErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Multi-select events modal (Design matching 2nd attachment with golden border)
  const [showSelectEventsModal, setShowSelectEventsModal] = useState(false);
  const [tempSelectedEvents, setTempSelectedEvents] = useState<number[]>([]);

  // Auto-remove Event #0 if candidate club is not in Sasthitala Agrani or Agrani or SA or Sasthitala
  useEffect(() => {
    if (!isClubAllowedForEvent0(editClub)) {
      if (editSelectedEvents.includes(0)) {
        setEditSelectedEvents(prev => prev.filter(n => n !== 0));
      }
      setTempSelectedEvents(prev => prev.filter(n => n !== 0));
    }
  }, [editClub, editSelectedEvents]);

  // Available heights sorted numerically in inches
  const availableHeights = useMemo(() => {
    const set = new Set<string>();
    events.forEach(e => {
      if (e.Height && e.Height !== 'ALL') set.add(e.Height);
    });
    return Array.from(set).sort((a, b) => parseHeightToInches(a) - parseHeightToInches(b));
  }, [events]);

  // Target gender string for comparison
  const criteriaGenderDisplay = useMemo(() => {
    if (editGender === 'B') return 'BOYS';
    if (editGender === 'G') return 'GIRLS';
    if (editGender === 'C') return 'CHILDRENS';
    return 'ALL';
  }, [editGender]);

  // Handle edit name change with duplicate detection
  const handleNameChange = (val: string) => {
    const uppercaseVal = val.toUpperCase();
    setEditName(uppercaseVal);
    const trimmed = uppercaseVal.trim();
    if (trimmed) {
      const isDuplicate = allCandidates.some(
        c => c.id !== candidate.id && (c.name || '').trim().toUpperCase() === trimmed
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

  // Eligible events for multi-select list box:
  // 1. Keeping Event no 15 ("GO AS YOU LIKE") available for all candidates.
  // 2. When combo value of Height & Gender both is "ALL", enable selection ONLY for Event no 15.
  // 3. Ensuring selected and higher events are available under selected gender only.
  // 4. Cross-gender events (e.g. Children and Boys / Children and Girls / Girls and Boys) CANNOT be selected.
  const eligibleEditEvents = useMemo(() => {
    const isBothAll = (!editHeight || editHeight === 'ALL') && (!editGender || editGender === 'ALL');

    // Rule: "Here when combo value of Height & Gender both is "ALL" the enable selection only for Event no 15."
    if (isBothAll) {
      return events.filter(evt => Number(evt.Evt_No) === 15);
    }

    const targetGender = criteriaGenderDisplay; // 'BOYS' | 'GIRLS' | 'CHILDRENS' | 'ALL'
    const candidateInches = parseHeightToInches(editHeight);

    return events.filter(evt => {
      const evtNo = Number(evt.Evt_No);

      // Event #15 is open for all candidates
      if (evtNo === 15) return true;

      // Gender check: strictly under selected gender (no cross-gender)
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
  // Prevents multiple gendered events (only higher events under same gender + event 15 allowed)
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

        // If clicked event is event 15 or Gender ALL, it is compatible with any gender
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
          // Incompatible gender event was previously selected: sanitize list to clicked gender + event 15
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

  const confirmSelectEvents = () => {
    setEditSelectedEvents(tempSelectedEvents);
    setShowSelectEventsModal(false);
  };

  // Save changes
  const handleSave = async () => {
    const trimmedName = editName.trim().toUpperCase();
    if (!trimmedName) {
      setEditErrorMsg('Candidate name is required.');
      return;
    }

    // Duplicate check
    const duplicate = allCandidates.find(
      c => c.id !== candidate.id && (!candidate.chestNo || Number(c.chestNo) !== Number(candidate.chestNo)) && (c.name || '').trim().toUpperCase() === trimmedName
    );
    if (duplicate) {
      setEditErrorMsg(`Duplicate Candidate Name! "${trimmedName}" is already registered (${duplicate.club || 'Independent'}). Duplicate names are not allowed.`);
      return;
    }

    if (isEditRestricted) {
      setEditErrorMsg(getCandidateEditRestrictedMessage(candidate, restrictionStatus));
      return;
    }

    if (editSelectedEvents.length === 0) {
      setEditErrorMsg('Please tap to select at least one event from the multi-select box.');
      return;
    }

    const targetClub = editClub.trim().toUpperCase() || candidate.club;
    if (editSelectedEvents.includes(0) && !isClubAllowedForEvent0(targetClub)) {
      setEditErrorMsg('Event #0 is restricted to Sasthitala Agrani, Agrani, SA, or Sasthitala club members only.');
      return;
    }

    setIsSaving(true);
    try {
      let totalFees = 0;
      for (const evtNo of editSelectedEvents) {
        const ev = events.find(e => Number(e.Evt_No) === Number(evtNo));
        totalFees += Number(ev?.Fees || 10);
      }

      const updated: Candidate = {
        ...candidate,
        name: trimmedName,
        club: editClub.trim().toUpperCase() || candidate.club,
        gender: criteriaGenderDisplay,
        height: editHeight || 'ALL',
        feeStatus: editFeeStatus,
        selectedEvents: editSelectedEvents,
        totalFees,
        updatedAt: new Date().toISOString(),
        isDirty: mode !== 'server',
        synced: mode === 'server',
      };

      await onSave(updated);
      onClose();
    } catch (err: any) {
      setEditErrorMsg(err.message || 'Failed to update candidate details.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* DEDICATED SEPARATE MODAL / PAGE: EDIT CANDIDATE DETAILS (Matching 1st Attachment) */}
      <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in">
        <div className="border-2 border-yellow-400 rounded-3xl bg-[#090f1d] p-5 sm:p-6 shadow-2xl max-w-sm sm:max-w-md w-full space-y-4 text-slate-100">
          
          {/* Header Title with Golden Text */}
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-yellow-400 font-bold text-lg sm:text-xl">
              Edit Candidate ({mode === 'server' ? `Chest #${candidate.chestNo || '—'}` : (candidate.chestNo && Number(candidate.chestNo) >= 101 ? `Chest #${candidate.chestNo}` : `#${candidate.localRecordNo || candidate.chestNo || 1}`)})
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Promoted to Final / Restricted Banner */}
          {isEditRestricted && (
            <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/70 text-amber-200 text-xs flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-300">Editing Details Disabled</div>
                <div className="text-[11px] mt-0.5 text-amber-200/90 whitespace-pre-line">
                  {getCandidateEditRestrictedMessage(candidate, restrictionStatus)}
                </div>
              </div>
            </div>
          )}

          {/* Form Fields matching 1st Attachment with Floating Labels and Yellow Accents */}
          <div className="space-y-3.5">
            
            {/* Field 1: Candidate Name (UPPERCASE) */}
            <div className="relative border border-slate-600 rounded-xl px-3 pt-3 pb-2.5 bg-[#0d1628] focus-within:border-yellow-400 transition-colors">
              <label className="absolute -top-2.5 left-3 px-1.5 bg-[#0d1628] text-[11px] font-bold text-slate-300 pointer-events-none">
                Candidate Name (UPPERCASE)
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="CANDIDATE NAME"
                className="w-full bg-transparent text-white font-bold text-sm sm:text-base uppercase tracking-wide focus:outline-hidden"
              />
            </div>

            {/* Field 2: Club Name (UPPERCASE) - Only for Server mode, omitted for Client mode */}
            {mode !== 'client' && (
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
              {/* Height Combo */}
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
                      // Reset events on height change as required
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

              {/* Gender Combo */}
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
                      // Reset events on gender change as required
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

          {/* Duplicate Name or Validation Error Message */}
          {editErrorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{editErrorMsg}</span>
            </div>
          )}

          {/* Editing Restricted Notice */}
          {isEditRestricted && (
            <div className="p-3 rounded-xl bg-amber-950/80 border-2 border-amber-500/80 text-amber-200 text-xs font-bold flex items-start gap-2.5 animate-in fade-in">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-amber-300 uppercase tracking-wide">Editing Restricted</p>
                <p className="text-[11px] font-medium text-amber-200/90 mt-0.5">
                  {restrictionStatus.reason === 'hit_qualified'
                    ? `Candidate has already qualified from hit to final in Event #${restrictionStatus.qualifiedHitEvents.join(', #')}. Editing candidate details is restricted once an athlete qualifies for finals in any hit-based event.`
                    : `Official ranking list preparation has already been completed for Event #${restrictionStatus.rankingCompletedEvents.join(', #')}. Editing candidate details is restricted once ranking has been prepared.`}
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons: Cancel and Save Changes */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-full bg-[#162035] hover:bg-[#1f2d4a] text-white font-bold border border-slate-600 text-sm active:scale-98 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isEditRestricted || Boolean(editErrorMsg)}
              className="flex-1 py-3 rounded-full bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black text-sm shadow-md active:scale-98 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEditRestricted ? 'Editing Disabled' : isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

        </div>
      </div>

      {/* MULTI-SELECT EVENTS LIST BOX MODAL (Matching 2nd Attachment with Golden Border) */}
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
                    : `Criteria: ${criteriaGenderDisplay} • ${editHeight || 'ALL'} & higher (Event #15 Open for All)`}
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
                  No events found matching criteria ({criteriaGenderDisplay} • {editHeight || 'ALL'} & higher).
                </div>
              ) : (
                eligibleEditEvents.map((evt) => {
                  const isSelected = tempSelectedEvents.includes(evt.Evt_No);
                  const isEvt0Disabled = Number(evt.Evt_No) === 0 && !isClubAllowedForEvent0(editClub);
                  const isDisabled = isEvt0Disabled;
                  return (
                    <div
                      key={evt.Evt_No}
                      onClick={() => !isDisabled && toggleTempEvent(evt.Evt_No)}
                      className={`rounded-2xl p-3 flex items-center gap-3 transition-all ${
                        isDisabled
                          ? 'opacity-35 bg-slate-900/60 border border-slate-800 cursor-not-allowed pointer-events-none select-none'
                          : isSelected
                          ? 'border-2 border-yellow-400 bg-[#0e172a] shadow-md shadow-yellow-500/10 cursor-pointer'
                          : 'border border-slate-700 bg-[#0b1222] hover:border-slate-500 cursor-pointer'
                      }`}
                    >
                      {/* Checkbox Icon */}
                      <div
                        className={`w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors ${
                          isDisabled
                            ? 'border-2 border-slate-700 bg-transparent'
                            : isSelected
                            ? 'bg-yellow-400 text-slate-950 font-black'
                            : 'border-2 border-slate-500 bg-transparent'
                        }`}
                      >
                        {isSelected && !isDisabled && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>

                      {/* Event Number Badge */}
                      <div
                        className={`w-7 h-7 rounded flex items-center justify-center font-black text-xs shrink-0 ${
                          isDisabled
                            ? 'bg-slate-800 text-slate-500'
                            : isSelected
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-[#1a2b4c] text-blue-200'
                        }`}
                      >
                        #{evt.Evt_No}
                      </div>

                      {/* Event Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-extrabold text-xs sm:text-sm uppercase tracking-wide truncate ${isDisabled ? 'text-slate-500' : 'text-white'}`}>
                            {evt.Evt_Name}
                          </span>
                          {isEvt0Disabled && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              Sasthitala Agrani Only
                            </span>
                          )}
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
    </>
  );
};

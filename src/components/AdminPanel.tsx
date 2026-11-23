import React, { useState, useEffect, useMemo } from 'react';
import { Club, SportsMeetSettings, SportEvent, Candidate, EventHeat, EventResult } from '../types';
import { EventMaster } from './EventMaster';
import { resizeImageToMax50KB } from '../utils/imageResize';
import { 
  Settings, 
  Building2, 
  Upload, 
  Plus, 
  Trash2, 
  Check, 
  AlertTriangle, 
  Save, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  Shield, 
  Phone
} from 'lucide-react';

interface AdminPanelProps {
  settings: SportsMeetSettings;
  clubs: Club[];
  events?: SportEvent[];
  candidates?: Candidate[];
  heats?: EventHeat[];
  results?: EventResult[];
  onSaveSettings: (settings: SportsMeetSettings) => Promise<void>;
  onSaveClub: (club: Partial<Club>) => Promise<void>;
  onDeleteClub: (clubId: string) => Promise<void>;
  onMarkClubsPaid?: (clubNames: string[]) => Promise<{ updatedCount: number; totalMarkedAmount: number }>;
  onSaveEvent?: (event: SportEvent) => Promise<void>;
  onDeleteEvent?: (evtNo: number) => Promise<void>;
  onResetEvents?: () => Promise<void>;
  onDownloadBackup?: () => void;
  onDownloadExcel?: () => void;
  onRestoreBackup?: (jsonData: any) => Promise<void>;
  onResetAllData?: () => Promise<void>;
  onPurgeExceptEvents?: () => Promise<void>;
  onOpenResetPin?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  settings,
  clubs,
  events = [],
  candidates = [],
  onSaveSettings,
  onSaveClub,
  onDeleteClub,
  onMarkClubsPaid,
  onSaveEvent,
  onDeleteEvent,
  onResetEvents,
  onOpenResetPin,
}) => {
  const [localSettings, setLocalSettings] = useState<SportsMeetSettings>(() => ({
    ...settings,
    registeredClubName:
      settings.registeredClubName ||
      clubs.find((c) => c.id === 'club_1')?.name ||
      clubs[0]?.name ||
      settings.organizer ||
      'Agrani Sasthitala Sangha',
    registeredClubLogo:
      settings.registeredClubLogo ||
      clubs.find((c) => c.id === 'club_1')?.logoUrl ||
      clubs[0]?.logoUrl ||
      '/icon.png',
    registeredClubPhone:
      settings.registeredClubPhone ||
      (clubs.find((c) => c.id === 'club_1')?.phone || clubs[0]?.phone || '').replace(/\D/g, '') ||
      '',
  }));
  const [isDirty, setIsDirty] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoSizeInfo, setLogoSizeInfo] = useState<string | null>(null);
  const [editingClub, setEditingClub] = useState<Partial<Club> | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedClubNames, setSelectedClubNames] = useState<string[]>([]);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  useEffect(() => {
    // Only synchronize from upstream if user is not actively editing the meet details form
    if (!isDirty) {
      setLocalSettings({
        ...settings,
        registeredClubName:
          settings.registeredClubName ||
          clubs.find((c) => c.id === 'club_1')?.name ||
          clubs[0]?.name ||
          settings.organizer ||
          'Agrani Sasthitala Sangha',
        registeredClubLogo:
          settings.registeredClubLogo ||
          clubs.find((c) => c.id === 'club_1')?.logoUrl ||
          clubs[0]?.logoUrl ||
          '/icon.png',
        registeredClubPhone:
          settings.registeredClubPhone ||
          (clubs.find((c) => c.id === 'club_1')?.phone || clubs[0]?.phone || '').replace(/\D/g, '') ||
          '',
      });
    }
  }, [settings, clubs, isDirty]);

  // Handle logo upload with auto-resize <= 50 KB
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    setStatusMsg(null);
    try {
      const { dataUrl, sizeKB } = await resizeImageToMax50KB(file);
      setIsDirty(true);
      setLocalSettings((prev) => ({ ...prev, registeredClubLogo: dataUrl }));
      setLogoSizeInfo(`Logo resized & optimized: ${sizeKB} KB (within 50 KB limit)`);
      setStatusMsg({
        type: 'success',
        text: `Club logo auto-resized and compressed to ${sizeKB} KB (within 50 KB limit). Click "Save Meet Configuration" to save.`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to process logo image' });
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  // Sections start in minimized form with option to expand
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    meetDetails: false,
    eventMaster: false,
    clubs: false,
    securityPin: false,
  });

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const expandAll = () => {
    setExpandedSections({
      meetDetails: true,
      eventMaster: true,
      clubs: true,
      securityPin: true,
    });
  };

  const minimizeAll = () => {
    setExpandedSections({
      meetDetails: false,
      eventMaster: false,
      clubs: false,
      securityPin: false,
    });
  };

  // Handle settings update
  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);
    try {
      await onSaveSettings(localSettings);
      setIsDirty(false);
      setStatusMsg({ type: 'success', text: 'Sports Meet settings saved successfully!' });
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  // Club save (no logo)
  const handleClubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClub || !editingClub.name?.trim()) return;

    setIsSaving(true);
    setStatusMsg(null);
    try {
      await onSaveClub(editingClub);
      setStatusMsg({ type: 'success', text: `Club "${editingClub.name}" saved successfully!` });
      setEditingClub(null);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save club' });
    } finally {
      setIsSaving(false);
    }
  };

  // Selected clubs statistics & bulk Paid action
  const activeSelectedClubsSet = useMemo(() => {
    const validClubsSet = new Set(
      clubs.map((c) => String(c.Reg_Club || c.name || '').trim().toUpperCase()).filter(Boolean)
    );
    return new Set(
      selectedClubNames.map((n) => n.trim().toUpperCase()).filter((n) => validClubsSet.has(n))
    );
  }, [clubs, selectedClubNames]);

  const { selectedClubCandidateCount, selectedClubDueCandidates, selectedClubDueAmount } = useMemo(() => {
    if (activeSelectedClubsSet.size === 0) {
      return {
        selectedClubCandidateCount: 0,
        selectedClubDueCandidates: [] as Candidate[],
        selectedClubDueAmount: 0,
      };
    }

    const matchedCandidates = candidates.filter((c) => {
      if (c.isCancelled || c.status === 'cancelled') return false;
      const clubNorm = (c.club || '').trim().toUpperCase();
      return activeSelectedClubsSet.has(clubNorm);
    });

    const dueCandidates = matchedCandidates.filter((c) => {
      const st = (c.feeStatus || 'Due').trim().toUpperCase();
      const isFree = st.includes('FREE') || st.includes('EXEMPT');
      return !isFree && (st.includes('DUE') || st.includes('UNPAID') || !st.includes('PAID'));
    });

    const dueAmount = dueCandidates.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0);
    return {
      selectedClubCandidateCount: matchedCandidates.length,
      selectedClubDueCandidates: dueCandidates,
      selectedClubDueAmount: dueAmount,
    };
  }, [candidates, activeSelectedClubsSet]);

  const toggleClubSelection = (clubNameRaw: string) => {
    const normalized = clubNameRaw.trim().toUpperCase();
    if (!normalized) return;
    setSelectedClubNames((prev) =>
      prev.includes(normalized)
        ? prev.filter((name) => name !== normalized)
        : [...prev, normalized]
    );
  };

  const handleMarkSelectedClubsPaid = async () => {
    if (!onMarkClubsPaid || activeSelectedClubsSet.size === 0 || selectedClubDueCandidates.length === 0) {
      return;
    }
    setIsMarkingPaid(true);
    setStatusMsg(null);
    try {
      const targetClubList = Array.from(activeSelectedClubsSet);
      const result = await onMarkClubsPaid(targetClubList);
      setStatusMsg({
        type: 'success',
        text: `Marked ${result.updatedCount} due candidate(s) as Paid (${settings.currencySymbol || '₹'}${result.totalMarkedAmount.toFixed(0)}) across ${targetClubList.join(', ')}.`,
      });
      setTimeout(() => setStatusMsg(null), 4500);
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Failed to update club payment status',
      });
    } finally {
      setIsMarkingPaid(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-3.5 sm:space-y-4">
      
      {/* Header - Direct to Page Background (No White Box) */}
      <div className="flex flex-row items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-none truncate">
            Sports Meet Admin Control
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={expandAll}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Expand All</span>
          </button>
          <button
            type="button"
            onClick={minimizeAll}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Minimize All</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2.5 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SPORTS MEET DETAILS & ORDINAL NUMBER (MINIMIZED WITH OPTION TO EXPAND) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => toggleSection('meetDetails')}
          className="min-h-[64px] px-4 py-3 sm:px-5 sm:py-3.5 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              1
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    Host Club &amp; Meet Setup
                  </h2>
                  <span className="hidden lg:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 truncate">
                    {localSettings.ordinalTitle || 'Configured'}
                  </span>
                  <span className="hidden lg:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 truncate">
                    {localSettings.registeredClubName || 'Registered Club'}
                  </span>
                  <span className="hidden md:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 truncate">
                    Start Chest: #{localSettings.autoChestStart || 101}
                  </span>
                  {localSettings.registeredClubPhone && (
                    <span className="hidden xl:inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 truncate items-center gap-1 font-mono">
                      <Phone className="w-3 h-3 text-emerald-600" />
                      <span>{localSettings.registeredClubPhone}</span>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('meetDetails');
                  }}
                  aria-label={expandedSections.meetDetails ? 'Minimize Host Club & Meet Setup' : 'Expand Host Club & Meet Setup'}
                  title={expandedSections.meetDetails ? 'Minimize' : 'Expand'}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 active:scale-95 transition-colors shrink-0 cursor-pointer ml-auto"
                >
                  {expandedSections.meetDetails ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug truncate">
                {expandedSections.meetDetails
                  ? 'Configure host club registration, logo, meet title, dates, venue, and starting chest number.'
                  : 'Click to expand and edit host club registration, logo, meet title, dates, venue, and starting chest number.'}
              </p>
            </div>
          </div>
        </div>

        {expandedSections.meetDetails && (
          <div className="p-6 pt-0 border-t border-slate-100 mt-2 space-y-5 animate-in fade-in duration-150">
            <form onSubmit={handleSettingsSubmit} className="space-y-6 pt-2">
              {/* ========================================================================= */}
              {/* GROUP A: REGISTERED CLUB DETAILS                                          */}
              {/* Fields: 1. Club Name (left) & Logo upload (right) in same line, 2. Mobile (mandatory), 3. Venue */}
              {/* ========================================================================= */}
              <div className="bg-slate-50/80 rounded-xl p-4 sm:p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Registered Club Details
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  {/* 1. Club Name - (Mandatory entry) */}
                  <div className="md:col-span-7">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Club Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={localSettings.registeredClubName || localSettings.organizer || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setIsDirty(true);
                        setLocalSettings({
                          ...localSettings,
                          registeredClubName: val,
                          organizer: val,
                        });
                      }}
                      placeholder="e.g. Agrani Sasthitala Sangha"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  {/* 2. Logo Upload at the right side of Club Name in same line */}
                  <div className="md:col-span-5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Logo Upload</span>
                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        ≤ 50 KB
                      </span>
                    </label>
                    
                    <div className="flex items-center gap-2 p-1.5 bg-white border border-slate-200 rounded-xl">
                      {/* Logo Preview */}
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 p-0.5 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                        {localSettings.registeredClubLogo ? (
                          <img
                            src={localSettings.registeredClubLogo}
                            alt="Club Logo"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/icon.png';
                            }}
                          />
                        ) : (
                          <Building2 className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <label className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer truncate">
                          <Upload className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{logoUploading ? 'Resizing...' : 'Upload Logo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={logoUploading}
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                        </label>

                        {localSettings.registeredClubLogo && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsDirty(true);
                              setLocalSettings({ ...localSettings, registeredClubLogo: '' });
                              setLogoSizeInfo(null);
                            }}
                            className="px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    {logoSizeInfo && (
                      <p className="text-[10px] text-emerald-700 font-bold mt-1 truncate">
                        ✓ {logoSizeInfo}
                      </p>
                    )}
                  </div>

                  {/* 3. Mobile Number - Mandatory Entry */}
                  <div className="md:col-span-6">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Mobile Number <span className="text-rose-500">*</span></span>
                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        Digits Only
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        inputMode="numeric"
                        pattern="[0-9]{10}"
                        maxLength={10}
                        value={localSettings.registeredClubPhone || ''}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setIsDirty(true);
                          setLocalSettings({ ...localSettings, registeredClubPhone: digits });
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* 4. Venue */}
                  <div className="md:col-span-6">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Venue
                    </label>
                    <input
                      type="text"
                      value={localSettings.venue || ''}
                      onChange={(e) => {
                        setIsDirty(true);
                        setLocalSettings({ ...localSettings, venue: e.target.value });
                      }}
                      placeholder="e.g. Central Sports Stadium"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* GROUP B: MEET DETAILS                                                     */}
              {/* Fields in same line: Meet Title (mandatory), Meet Date (mandatory), Starting Chest Number (mandatory) */}
              {/* Currency Symbol and associated field omitted                              */}
              {/* ========================================================================= */}
              <div className="bg-slate-50/80 rounded-xl p-4 sm:p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Meet Details
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. Meet Title - Mandatory */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Meet Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={localSettings.ordinalTitle || ''}
                      onChange={(e) => {
                        setIsDirty(true);
                        setLocalSettings({ ...localSettings, ordinalTitle: e.target.value });
                      }}
                      placeholder="e.g. 47th Annual Sports Meet 2027"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  {/* 2. Meet Date - Mandatory */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Meet Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={localSettings.dates || ''}
                      onChange={(e) => {
                        setIsDirty(true);
                        setLocalSettings({ ...localSettings, dates: e.target.value });
                      }}
                      placeholder="e.g. 24th & 25th January 2027"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  {/* 3. Starting Chest Number - Mandatory */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Starting Chest Number <span className="text-rose-500">*</span></span>
                      <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                        Start #{localSettings.autoChestStart || 101}
                      </span>
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={localSettings.autoChestStart || 101}
                      onChange={(e) => {
                        setIsDirty(true);
                        setLocalSettings({
                          ...localSettings,
                          autoChestStart: parseInt(e.target.value, 10) || 101,
                        });
                      }}
                      placeholder="e.g. 101"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Form Action Controls */}
              <div className="sm:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div>
                  {isDirty ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        <span>Unsaved Changes</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setLocalSettings({
                            ...settings,
                            registeredClubName:
                              settings.registeredClubName ||
                              clubs.find((c) => c.id === 'club_1')?.name ||
                              clubs[0]?.name ||
                              settings.organizer ||
                              'Agrani Sasthitala Sangha',
                            registeredClubLogo:
                              settings.registeredClubLogo ||
                              clubs.find((c) => c.id === 'club_1')?.logoUrl ||
                              clubs[0]?.logoUrl ||
                              '/icon.png',
                            registeredClubPhone:
                              settings.registeredClubPhone ||
                              (clubs.find((c) => c.id === 'club_1')?.phone || clubs[0]?.phone || '').replace(/\D/g, '') ||
                              '',
                          });
                          setIsDirty(false);
                          setLogoSizeInfo(null);
                        }}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                      >
                        Discard Changes
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">All settings synchronized</span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-98"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving Settings...' : 'Save Meet Configuration'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. EVENT MASTER ENTRY (MINIMIZED WITH OPTION TO EXPAND)                    */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => toggleSection('eventMaster')}
          className="min-h-[64px] px-4 py-3 sm:px-5 sm:py-3.5 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              2
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    Event Master Entry
                  </h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {events?.length || 0} Events Registered
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('eventMaster');
                  }}
                  aria-label={expandedSections.eventMaster ? 'Minimize Event Master Entry' : 'Expand Event Master Entry'}
                  title={expandedSections.eventMaster ? 'Minimize' : 'Expand'}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 active:scale-95 transition-colors shrink-0 cursor-pointer ml-auto"
                >
                  {expandedSections.eventMaster ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                View &amp; Manage Event List
              </p>
            </div>
          </div>
        </div>

        {expandedSections.eventMaster && (
          <div className="p-6 pt-0 border-t border-slate-100 mt-2 space-y-4 animate-in fade-in duration-150">
            <div className="pt-3">
              <EventMaster
                events={events || []}
                settings={localSettings}
                onSaveEvent={onSaveEvent || (async () => {})}
                onDeleteEvent={onDeleteEvent || (async () => {})}
                onResetEvents={onResetEvents || (async () => {})}
                isEmbedded={true}
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. REGISTERED CLUBS (MINIMIZED WITH OPTION TO EXPAND, ALL LOGOS REMOVED)   */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => toggleSection('clubs')}
          className="min-h-[64px] px-4 py-3 sm:px-5 sm:py-3.5 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              3
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    Registered Clubs
                  </h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {clubs.length} Clubs Registered
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-wrap justify-end">
                  {expandedSections.clubs && (
                    <>
                      {/* Left of total fee label: Total candidate count for selected club(s) */}
                      <span
                        onClick={(e) => e.stopPropagation()}
                        title="Total active candidates under selected club(s)"
                        className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-bold whitespace-nowrap"
                      >
                        {selectedClubCandidateCount} Cand.
                      </span>

                      {/* Left of Paid ∀ button: Total due amount for selected club(s) */}
                      <span
                        onClick={(e) => e.stopPropagation()}
                        title="Total due amount to be paid for selected club(s)"
                        className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] sm:text-xs font-bold whitespace-nowrap"
                      >
                        Due: {settings.currencySymbol || '₹'}{selectedClubDueAmount}
                      </span>

                      {/* Left of Club Add button: Paid ∀ button */}
                      <button
                        type="button"
                        disabled={isMarkingPaid || selectedClubDueCandidates.length === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkSelectedClubsPaid();
                        }}
                        title={
                          activeSelectedClubsSet.size === 0
                            ? 'Select club checkbox(es) first'
                            : selectedClubDueCandidates.length === 0
                            ? 'No due candidates in selected club(s)'
                            : `Mark ${selectedClubDueCandidates.length} unpaid candidate(s) as Paid`
                        }
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-45 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                      >
                        {isMarkingPaid ? 'Updating...' : 'Paid ∀'}
                      </button>

                      {/* Icon-only Add Club button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingClub({ name: '', shortCode: '', address: '' });
                        }}
                        aria-label="Add Club"
                        title="Add Club"
                        className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg flex items-center justify-center transition-colors cursor-pointer shadow-xs shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('clubs');
                    }}
                    aria-label={expandedSections.clubs ? 'Minimize Registered Clubs' : 'Expand Registered Clubs'}
                    title={expandedSections.clubs ? 'Minimize' : 'Expand'}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 active:scale-95 transition-colors shrink-0 cursor-pointer"
                  >
                    {expandedSections.clubs ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                View/Edit club details &amp; mark bulk club payments
              </p>
            </div>
          </div>
        </div>

        {expandedSections.clubs && (
          <div className="p-6 pt-0 border-t border-slate-100 mt-2 space-y-5 animate-in fade-in duration-150">
            {/* Edit or Add Club Dialog (No club logo fields) */}
            {editingClub && (
              <form onSubmit={handleClubSubmit} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4 pt-4 mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>{editingClub.id ? 'Edit Club Details' : 'Register New Club'}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingClub(null)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Club Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editingClub.name || ''}
                      onChange={(e) => setEditingClub({ ...editingClub, name: e.target.value })}
                      placeholder="e.g. Phoenix Athletic Club"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Short Code</label>
                    <input
                      type="text"
                      value={editingClub.shortCode || ''}
                      onChange={(e) => setEditingClub({ ...editingClub, shortCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. PAC"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono font-bold uppercase bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Club Mobile</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={editingClub.mobile || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setEditingClub({ ...editingClub, mobile: val, phone: val });
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Address / Region</label>
                    <input
                      type="text"
                      value={editingClub.address || ''}
                      onChange={(e) => setEditingClub({ ...editingClub, address: e.target.value })}
                      placeholder="e.g. North Zone"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingClub(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                  >
                    Save Club
                  </button>
                </div>
              </form>
            )}

            {/* Compact Club Grid with Checkbox Selection (Reduced Thumbnail Height) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-3">
              {clubs.map((c) => {
                const clubNormName = String(c.Reg_Club || c.name || '').trim().toUpperCase();
                const isSelected = activeSelectedClubsSet.has(clubNormName);
                const metaParts = [
                  c.shortCode ? c.shortCode : '',
                  c.mobile || c.phone ? `${c.mobile || c.phone}` : '',
                  c.address ? c.address : '',
                ].filter(Boolean);

                return (
                  <div
                    key={c.id}
                    className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 transition-colors shadow-2xs ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none py-0.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleClubSelection(clubNormName)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 cursor-pointer shrink-0 accent-blue-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-[13px] font-bold text-slate-900 leading-tight truncate">
                          {c.name}
                        </div>
                        {metaParts.length > 0 && (
                          <div className="text-[10px] text-slate-500 leading-tight truncate mt-0.5">
                            {metaParts.join(' • ')}
                          </div>
                        )}
                      </div>
                    </label>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingClub(c);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                        title="Edit Club"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete club "${c.name}"?`)) {
                            setSelectedClubNames((prev) => prev.filter((name) => name !== clubNormName));
                            await onDeleteClub(c.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                        title="Delete Club"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. SERVER SECURITY & ACCESS PIN (MINIMIZED WITH OPTION TO EXPAND)         */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => toggleSection('securityPin')}
          className="min-h-[64px] px-4 py-3 sm:px-5 sm:py-3.5 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              4
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    Security PIN Setup
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
                    Active
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('securityPin');
                  }}
                  aria-label={expandedSections.securityPin ? 'Minimize Security PIN Setup' : 'Expand Security PIN Setup'}
                  title={expandedSections.securityPin ? 'Minimize' : 'Expand'}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 active:scale-95 transition-colors shrink-0 cursor-pointer ml-auto"
                >
                  {expandedSections.securityPin ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                Server PIN Protection
              </p>
            </div>
          </div>
        </div>

        {expandedSections.securityPin && (
          <div className="p-6 pt-0 border-t border-slate-100 mt-2 space-y-4 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 mt-4">
              <div className="space-y-1">
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>Server Login PIN Protection</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
                  Any other device or desktop browser attempting to enter Server Control must enter this PIN. Default PIN is <code className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">1234</code>.
                </p>
              </div>

              {onOpenResetPin && (
                <button
                  type="button"
                  onClick={onOpenResetPin}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Reset / Change PIN</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

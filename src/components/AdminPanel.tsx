import React, { useState, useEffect } from 'react';
import { Club, SportsMeetSettings, SportEvent } from '../types';
import { api } from '../services/api';
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
  onSaveSettings: (settings: SportsMeetSettings) => Promise<void>;
  onSaveClub: (club: Partial<Club>) => Promise<void>;
  onDeleteClub: (clubId: string) => Promise<void>;
  onSaveEvent?: (event: SportEvent) => Promise<void>;
  onDeleteEvent?: (evtNo: number) => Promise<void>;
  onResetEvents?: () => Promise<void>;
  onDownloadBackup: () => void;
  onRestoreBackup: (jsonData: any) => Promise<void>;
  onResetAllData: () => Promise<void>;
  onPurgeExceptEvents?: () => Promise<void>;
  onOpenResetPin?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  settings,
  clubs,
  events = [],
  onSaveSettings,
  onSaveClub,
  onDeleteClub,
  onSaveEvent,
  onDeleteEvent,
  onResetEvents,
  onDownloadBackup,
  onRestoreBackup,
  onResetAllData,
  onPurgeExceptEvents,
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
    clubs: false,
    eventMaster: false,
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
      clubs: true,
      eventMaster: true,
      securityPin: true,
    });
  };

  const minimizeAll = () => {
    setExpandedSections({
      meetDetails: false,
      clubs: false,
      eventMaster: false,
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => toggleSection('meetDetails')}
          className="p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              1
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Host Club registration &amp; Meet Settings</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 truncate">
                  {localSettings.ordinalTitle || 'Configured'}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 truncate">
                  {localSettings.registeredClubName || 'Registered Club'}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 truncate">
                  Start Chest: #{localSettings.autoChestStart || 101}
                </span>
                {localSettings.registeredClubPhone && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 truncate flex items-center gap-1 font-mono">
                    <Phone className="w-3 h-3 text-emerald-600" />
                    <span>{localSettings.registeredClubPhone}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {expandedSections.meetDetails
                  ? 'Configure host club registration, logo, meet title, dates, venue, and starting chest number.'
                  : 'Click to expand and edit host club registration, logo, meet title, dates, venue, and starting chest number.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection('meetDetails');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors shrink-0 cursor-pointer"
          >
            {expandedSections.meetDetails ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>Minimize</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>Expand</span>
              </>
            )}
          </button>
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
                        pattern="[0-9]+"
                        value={localSettings.registeredClubPhone || ''}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '');
                          setIsDirty(true);
                          setLocalSettings({ ...localSettings, registeredClubPhone: digits });
                        }}
                        placeholder="e.g. 9830123456"
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
      {/* 2. REGISTERED CLUBS (MINIMIZED WITH OPTION TO EXPAND, ALL LOGOS REMOVED)   */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => toggleSection('clubs')}
          className="p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              2
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Registered Clubs</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {clubs.length} Clubs Registered
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {expandedSections.clubs
                  ? 'Manage participating sports clubs, short codes, and addresses.'
                  : 'Click to expand and view or manage registered sports clubs.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {expandedSections.clubs && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingClub({ name: '', shortCode: '', address: '' });
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Club</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('clubs');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
            >
              {expandedSections.clubs ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span>Minimize</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span>Expand</span>
                </>
              )}
            </button>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

            {/* Club Grid without any club logo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
              {clubs.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100">
                      {c.shortCode ? c.shortCode.slice(0, 3) : <Building2 className="w-5 h-5 text-blue-600" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 leading-tight truncate">{c.name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {c.shortCode ? `Code: ${c.shortCode}` : ''} {c.address ? `• ${c.address}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingClub(c)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Edit Club"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm(`Delete club "${c.name}"?`)) {
                          await onDeleteClub(c.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Delete Club"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. EVENT MASTER LIST REGISTRY (MINIMIZED WITH OPTION TO EXPAND)           */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => toggleSection('eventMaster')}
          className="p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              3
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Event Master List Registry</h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {events?.length || 0} Events Registered
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {expandedSections.eventMaster
                  ? 'Configure athletic meet disciplines, standard height brackets, categories, and fees.'
                  : 'Click to expand and view or manage athletic events master list.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection('eventMaster');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors shrink-0 cursor-pointer"
          >
            {expandedSections.eventMaster ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>Minimize</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>Expand</span>
              </>
            )}
          </button>
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
      {/* 4. SERVER SECURITY & ACCESS PIN (MINIMIZED WITH OPTION TO EXPAND)         */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        <div
          onClick={() => toggleSection('securityPin')}
          className="p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              4
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Server Security &amp; Access PIN</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {expandedSections.securityPin
                  ? 'Protect Server Control from unauthorized devices & browsers.'
                  : 'Click to expand and manage server access PIN protection.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSection('securityPin');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors shrink-0 cursor-pointer"
          >
            {expandedSections.securityPin ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>Minimize</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>Expand</span>
              </>
            )}
          </button>
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

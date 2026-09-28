import React, { useState } from 'react';
import { Club, SportsMeetSettings } from '../types';
import { 
  Settings, 
  Building2, 
  Database, 
  Upload, 
  Download, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Check, 
  AlertTriangle,
  Image as ImageIcon,
  Save
} from 'lucide-react';

interface AdminPanelProps {
  settings: SportsMeetSettings;
  clubs: Club[];
  onSaveSettings: (settings: SportsMeetSettings) => Promise<void>;
  onSaveClub: (club: Partial<Club>) => Promise<void>;
  onDeleteClub: (clubId: string) => Promise<void>;
  onDownloadBackup: () => void;
  onRestoreBackup: (jsonData: any) => Promise<void>;
  onResetAllData: () => Promise<void>;
  onOpenResetPin?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  settings,
  clubs,
  onSaveSettings,
  onSaveClub,
  onDeleteClub,
  onDownloadBackup,
  onRestoreBackup,
  onResetAllData,
  onOpenResetPin,
}) => {
  const [localSettings, setLocalSettings] = useState<SportsMeetSettings>(settings);
  const [editingClub, setEditingClub] = useState<Partial<Club> | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Handle settings update
  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);
    try {
      await onSaveSettings(localSettings);
      setStatusMsg({ type: 'success', text: 'Sports Meet settings saved successfully!' });
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  // Club logo image upload handler (reads as base64 data URL)
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && editingClub) {
        setEditingClub({ ...editingClub, logoUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  // Club save
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

  // Restore file picker handler
  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result as string);
        if (window.confirm('Are you sure you want to restore the database? This will overwrite existing data.')) {
          await onRestoreBackup(json);
          setStatusMsg({ type: 'success', text: 'Database restored successfully!' });
        }
      } catch (err: any) {
        setStatusMsg({ type: 'error', text: 'Invalid JSON backup file: ' + err.message });
      }
    };
    reader.readAsText(file);
    // Reset file input value so user can pick the same file again if needed
    e.target.value = '';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">
            <Settings className="w-4 h-4" />
            <span>Administration &amp; System Configuration</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Sports Meet Admin Control
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Configure sports meet ordinal title, clubs and logos, and perform database backup / restore.
          </p>
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
            <Check className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* 1. Meet Identity & Ordinal Number Form */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</span>
          <h2 className="text-base font-bold text-slate-900">Sports Meet Details &amp; Ordinal Number</h2>
        </div>

        <form onSubmit={handleSettingsSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Sports Ordinal Title / Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={localSettings.ordinalTitle}
              onChange={(e) => setLocalSettings({ ...localSettings, ordinalTitle: e.target.value })}
              placeholder="e.g. 47th Annual Sports Meet 2027"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Appears on report headers, printouts, banner displays, and certificates.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Organizing Body / Association
            </label>
            <input
              type="text"
              value={localSettings.organizer}
              onChange={(e) => setLocalSettings({ ...localSettings, organizer: e.target.value })}
              placeholder="e.g. District Sports Council"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Venue / Stadium
            </label>
            <input
              type="text"
              value={localSettings.venue}
              onChange={(e) => setLocalSettings({ ...localSettings, venue: e.target.value })}
              placeholder="e.g. Central Sports Stadium"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Meet Dates
            </label>
            <input
              type="text"
              value={localSettings.dates}
              onChange={(e) => setLocalSettings({ ...localSettings, dates: e.target.value })}
              placeholder="e.g. 24th - 26th January 2027"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Currency Symbol
            </label>
            <input
              type="text"
              value={localSettings.currencySymbol}
              onChange={(e) => setLocalSettings({ ...localSettings, currencySymbol: e.target.value })}
              placeholder="e.g. ₹ or $"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="sm:col-span-2 flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Settings...' : 'Save Meet Configuration'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 2. Registered Clubs & Logos Management */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</span>
            <h2 className="text-base font-bold text-slate-900">Registered Clubs &amp; Club Logos</h2>
          </div>

          <button
            onClick={() => setEditingClub({ name: '', shortCode: '', address: '', logoUrl: '' })}
            className="px-3.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Club</span>
          </button>
        </div>

        {/* Edit or Add Club Dialog */}
        {editingClub && (
          <form onSubmit={handleClubSubmit} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {editingClub.id ? 'Edit Club' : 'Register New Club'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Club Name</label>
                <input
                  type="text"
                  required
                  value={editingClub.name || ''}
                  onChange={(e) => setEditingClub({ ...editingClub, name: e.target.value })}
                  placeholder="e.g. Phoenix Athletic Club"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Short Code</label>
                <input
                  type="text"
                  value={editingClub.shortCode || ''}
                  onChange={(e) => setEditingClub({ ...editingClub, shortCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. PAC"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono font-bold uppercase bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Address / Region</label>
                <input
                  type="text"
                  value={editingClub.address || ''}
                  onChange={(e) => setEditingClub({ ...editingClub, address: e.target.value })}
                  placeholder="e.g. North Zone"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium bg-white"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-bold text-slate-700 mb-1">Club Logo (Image URL or Upload)</label>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <input
                    type="text"
                    value={editingClub.logoUrl || ''}
                    onChange={(e) => setEditingClub({ ...editingClub, logoUrl: e.target.value })}
                    placeholder="https://... or upload image"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                  />
                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                    <label className="cursor-pointer px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
                      <ImageIcon className="w-4 h-4" />
                      <span>Upload Logo</span>
                      <input type="file" accept="image/*" onChange={handleLogoFileUpload} className="hidden" />
                    </label>
                    {editingClub.logoUrl && (
                      <img
                        src={editingClub.logoUrl}
                        alt="Preview"
                        className="w-8 h-8 rounded-full object-cover border border-slate-300 bg-white"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingClub(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Save Club
              </button>
            </div>
          </form>
        )}

        {/* Club Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clubs.map((c) => (
            <div
              key={c.id}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white flex items-center justify-between gap-3 shadow-2xs"
            >
              <div className="flex items-center gap-3">
                {c.logoUrl ? (
                  <img
                    src={c.logoUrl}
                    alt={c.name}
                    className="w-10 h-10 rounded-full object-contain border border-slate-200 bg-slate-50 p-0.5 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-100">
                    {c.shortCode || c.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 leading-tight">{c.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {c.shortCode ? `Code: ${c.shortCode}` : ''} {c.address ? `• ${c.address}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setEditingClub(c)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Edit Club"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (window.confirm(`Delete club "${c.name}"?`)) {
                      await onDeleteClub(c.id);
                    }
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Delete Club"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Database Backup & Restore */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">3</span>
          <h2 className="text-base font-bold text-slate-900">Database Backup, Restore &amp; Maintenance</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          {/* Download Backup */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3 flex flex-col justify-between">
            <div>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center mb-2">
                <Download className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Export Backup (JSON)</h3>
              <p className="text-xs text-slate-500 mt-1">
                Download full snapshot of candidates, events, heats, rankings, and settings.
              </p>
            </div>

            <button
              onClick={onDownloadBackup}
              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Backup File</span>
            </button>
          </div>

          {/* Restore Backup */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3 flex flex-col justify-between">
            <div>
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center mb-2">
                <Upload className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Restore from File</h3>
              <p className="text-xs text-slate-500 mt-1">
                Upload a previously saved `.json` database file to overwrite current database.
              </p>
            </div>

            <label className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs text-center">
              <Upload className="w-3.5 h-3.5" />
              <span>Select File &amp; Restore</span>
              <input type="file" accept=".json" onChange={handleFileRestore} className="hidden" />
            </label>
          </div>

          {/* Factory Reset */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3 flex flex-col justify-between">
            <div>
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center mb-2">
                <RotateCcw className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Factory Reset</h3>
              <p className="text-xs text-slate-500 mt-1">
                Reset database back to the default 16 events and demo starter records.
              </p>
            </div>

            <button
              onClick={async () => {
                if (window.confirm('WARNING: This will reset all database tables to defaults! Continue?')) {
                  await onResetAllData();
                  setStatusMsg({ type: 'success', text: 'Database reset to factory defaults!' });
                }
              }}
              className="w-full py-2 px-3 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Database</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: SERVER SECURITY & LOGIN PIN */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">4</span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Server Security &amp; Access PIN</h2>
              <p className="text-xs text-slate-500">Protect Server Control from unauthorized devices &amp; browsers</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="space-y-1">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
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
    </div>
  );
};

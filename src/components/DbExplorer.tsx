import React, { useState, useMemo, useEffect } from 'react';
import { 
  Database, 
  Table, 
  Code, 
  Search, 
  Download, 
  Copy, 
  Check, 
  RefreshCw,
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  AlertTriangle,
  Settings,
  Sparkles,
  CheckCircle2,
  Layers,
  Award,
  Upload,
  RotateCcw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { api } from '../services/api';

interface DbExplorerProps {
  data: {
    candidates: any[];
    events: any[];
    clubs: any[];
    heats: any[];
    results: any[];
    settings: any;
    clientUploads?: any[];
  };
  onRefresh: () => Promise<void>;
  onDownloadBackup?: () => void;
  onRestoreBackup?: (jsonData: any) => Promise<void>;
  onResetAllData?: () => Promise<void>;
  onPurgeExceptEvents?: () => Promise<void>;
}

type TableId = 'candidates' | 'events' | 'clubs' | 'heats' | 'results' | 'settings' | 'clientUploads';

export const DbExplorer: React.FC<DbExplorerProps> = ({ 
  data, 
  onRefresh,
  onDownloadBackup,
  onRestoreBackup,
  onResetAllData,
  onPurgeExceptEvents,
}) => {
  const [activeTable, setActiveTable] = useState<TableId>('candidates');
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isBackupExpanded, setIsBackupExpanded] = useState(false);
  const [isRawDbExpanded, setIsRawDbExpanded] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit / Create Record Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'edit' | 'create'>('edit');
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | number>('');
  const [modalTab, setModalTab] = useState<'form' | 'json'>('form');
  const [modalJsonText, setModalJsonText] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  // Full-table JSON edit mode state
  const [isEditingFullJson, setIsEditingFullJson] = useState(false);
  const [fullJsonText, setFullJsonText] = useState('');

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<any>(data.settings || {});
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    if (data.settings) {
      setSettingsForm(data.settings);
    }
  }, [data.settings]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const tables = [
    { id: 'candidates' as TableId, label: 'Candidates', count: data.candidates?.length || 0 },
    { id: 'events' as TableId, label: 'Events Master', count: data.events?.length || 0 },
    { id: 'clubs' as TableId, label: 'Clubs', count: data.clubs?.length || 0 },
    { id: 'results' as TableId, label: 'Results & Rankings', count: data.results?.length || 0 },
    { id: 'heats' as TableId, label: 'Heats (Hit List)', count: data.heats?.length || 0 },
    { id: 'clientUploads' as TableId, label: 'Client Uploads', count: data.clientUploads?.length || 0 },
    { id: 'settings' as TableId, label: 'Settings', count: 1 },
  ];

  const currentRecords = useMemo(() => {
    const raw = data[activeTable];
    if (!raw) return [];
    if (!Array.isArray(raw)) return [raw];

    if (!searchTerm.trim()) return raw;

    const term = searchTerm.toLowerCase();
    return raw.filter((item) => JSON.stringify(item).toLowerCase().includes(term));
  }, [data, activeTable, searchTerm]);

  // Canonical columns per table to guarantee exact synchronization between headers and data cells
  const tableColumns = useMemo(() => {
    if (!currentRecords || currentRecords.length === 0) return [];

    if (activeTable === 'candidates') {
      const canonical = [
        'id',
        'chestNo',
        'name',
        'club',
        'gender',
        'height',
        'selectedEvents',
        'totalFees',
        'feeStatus',
        'createdAt',
        'updatedAt',
        'synced',
        'isDirty',
        'syncedAt',
      ];
      const extraKeys = new Set<string>();
      currentRecords.forEach((r) => {
        if (r && typeof r === 'object') {
          Object.keys(r).forEach((k) => {
            if (!canonical.includes(k)) {
              extraKeys.add(k);
            }
          });
        }
      });
      const presentCanonical = canonical.filter((k) =>
        currentRecords.some((r) => r && r[k] !== undefined)
      );
      return [...presentCanonical, ...Array.from(extraKeys)];
    }

    // For other tables, extract all unique keys in order
    const keys = new Set<string>();
    currentRecords.forEach((r) => {
      if (r && typeof r === 'object') {
        Object.keys(r).forEach((k) => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [activeTable, currentRecords]);

  // Synchronize full json text when switching tables or records change
  useEffect(() => {
    const raw = data[activeTable];
    setFullJsonText(JSON.stringify(raw, null, 2));
    setIsEditingFullJson(false);
  }, [data, activeTable]);

  // Copy JSON to clipboard
  const handleCopyJson = () => {
    const raw = data[activeTable];
    navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export JSON file
  const handleDownloadJson = () => {
    const raw = data[activeTable];
    const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(raw, null, 2));
    const a = document.createElement('a');
    a.href = jsonStr;
    a.download = `eSports_${activeTable}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
      showToast('success', 'Database reloaded from server successfully');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to refresh database');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get record identifier
  const getRecordId = (record: any, table: TableId): string => {
    if (table === 'events') return String(record.Evt_No);
    if (record.id !== undefined) return String(record.id);
    if (table === 'candidates' && record.chestNo !== undefined) return String(record.chestNo);
    if (table === 'results' && record.eventNo !== undefined) return String(record.eventNo);
    return String(record.id || '');
  };

  // Open Edit Modal for a Record
  const handleEditRecord = (record: any) => {
    const id = getRecordId(record, activeTable);
    setEditingRecordId(id);
    setEditingRecord({ ...record });
    setModalJsonText(JSON.stringify(record, null, 2));
    setModalMode('edit');
    setModalTab('form');
    setModalError(null);
    setModalOpen(true);
  };

  // Open Create Record Modal
  const handleStartCreate = () => {
    let template: any = {};
    if (activeTable === 'events') {
      const nextNo = (data.events || []).length > 0 ? Math.max(...data.events.map((e: any) => Number(e.Evt_No) || 0)) + 1 : 1;
      template = {
        Evt_No: nextNo,
        Evt_Name: 'NEW ATHLETIC EVENT',
        Height: "4'-2\"",
        Gender: 'BOYS',
        Fees: 10.0,
        requiredHit: true,
        requiredFinal: true,
      };
    } else if (activeTable === 'candidates') {
      const nextChest = (data.candidates || []).length > 0 ? Math.max(...data.candidates.map((c: any) => Number(c.chestNo) || 0)) + 1 : 101;
      template = {
        chestNo: nextChest,
        name: 'New Athlete',
        club: data.clubs?.[0]?.name || 'Agrani Sasthitala Sangha',
        gender: 'BOYS',
        height: "4'-2\"",
        feeStatus: 'Paid [P]',
        selectedEvents: [1],
        totalFees: 10.0,
        status: 'pending',
        synced: true,
        isDirty: false,
      };
    } else if (activeTable === 'clubs') {
      template = {
        name: 'New Sports Club',
        shortCode: 'NSC',
        contactPerson: 'Secretary',
        phone: '+91 98300 00000',
        address: 'Club Grounds',
      };
    } else {
      template = {
        id: `row_${Date.now()}`,
        name: 'New Entry',
        createdAt: new Date().toISOString(),
      };
    }

    setEditingRecordId('');
    setEditingRecord(template);
    setModalJsonText(JSON.stringify(template, null, 2));
    setModalMode('create');
    setModalTab('form');
    setModalError(null);
    setModalOpen(true);
  };

  // Save Record (Edit or Create)
  const handleSaveModal = async () => {
    setIsSavingRecord(true);
    setModalError(null);
    try {
      let finalData = editingRecord;
      if (modalTab === 'json') {
        try {
          finalData = JSON.parse(modalJsonText);
        } catch (parseErr: any) {
          setModalError('Invalid JSON format: ' + parseErr.message);
          setIsSavingRecord(false);
          return;
        }
      }

      if (modalMode === 'create') {
        await api.createRawRow(activeTable, finalData);
        showToast('success', `New record created in table '${activeTable}'`);
      } else {
        await api.updateRawRow(activeTable, String(editingRecordId), finalData);
        showToast('success', `Record #${editingRecordId} updated in table '${activeTable}'`);
      }

      setModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save record to server');
    } finally {
      setIsSavingRecord(false);
    }
  };

  // Delete Record
  const handleDeleteRecord = async (record: any) => {
    const id = getRecordId(record, activeTable);
    const confirmName = record.name || record.Evt_Name || record.candidateName || `Record #${id}`;
    if (!window.confirm(`Are you sure you want to permanently delete '${confirmName}' (ID: ${id}) from table '${activeTable}'?`)) {
      return;
    }

    try {
      await api.deleteRawRow(activeTable, id);
      showToast('success', `Record #${id} deleted from '${activeTable}'`);
      await onRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete record');
    }
  };

  // In-line Quick Toggle for Booleans in Grid
  const handleQuickToggle = async (record: any, field: string) => {
    const id = getRecordId(record, activeTable);
    const updated = { ...record, [field]: !record[field] };
    try {
      await api.updateRawRow(activeTable, id, updated);
      showToast('success', `Updated ${field} on record #${id}`);
      await onRefresh();
    } catch (err: any) {
      showToast('error', err.message || `Failed to update ${field}`);
    }
  };

  // Save Full Table JSON
  const handleSaveFullJson = async () => {
    try {
      const parsed = JSON.parse(fullJsonText);
      if (activeTable === 'settings') {
        await api.updateSettings(parsed);
      } else {
        await api.updateRawTable(activeTable, parsed);
      }
      showToast('success', `Table '${activeTable}' updated successfully via JSON editor`);
      setIsEditingFullJson(false);
      await onRefresh();
    } catch (err: any) {
      showToast('error', 'JSON error: ' + (err.message || 'Invalid JSON syntax'));
    }
  };

  // Save Settings Form
  const handleSaveSettingsForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await api.updateSettings(settingsForm);
      showToast('success', 'Meet Settings & Benchmarks updated successfully');
      await onRefresh();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Full database backup download
  const handleDownloadFullBackup = async () => {
    if (onDownloadBackup) {
      onDownloadBackup();
      return;
    }
    try {
      const backupData = await api.exportDatabase();
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eSports_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('success', 'Full database backup downloaded successfully');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to download backup');
    }
  };

  // Restore database from file
  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result as string);
        if (window.confirm('Are you sure you want to restore the database? This will overwrite existing data.')) {
          if (onRestoreBackup) {
            await onRestoreBackup(json);
          } else {
            await api.restoreDatabase(json);
            await onRefresh();
          }
          showToast('success', 'Database restored successfully!');
        }
      } catch (err: any) {
        showToast('error', 'Invalid JSON backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Delete all data except event list master data
  const handlePurgeExceptEvents = async () => {
    const confirmation = window.confirm(
      'CRITICAL DATABASE ACTION:\n\n' +
      'Are you sure you want to delete ALL data from the database EXCEPT Event List Master Data?\n\n' +
      '• All Candidates will be permanently DELETED\n' +
      '• All Client Uploads will be permanently DELETED\n' +
      '• All Heats (Hit Lists) will be permanently DELETED\n' +
      '• All Results & Rankings will be permanently DELETED\n' +
      '• The 16 Event List Master Data records will be strictly PRESERVED\n\n' +
      'Click OK to confirm deletion.'
    );

    if (!confirmation) return;

    setIsPurging(true);
    try {
      if (onPurgeExceptEvents) {
        await onPurgeExceptEvents();
      } else {
        await api.purgeAllExceptEvents();
        await onRefresh();
      }
      showToast('success', 'All database data deleted! Event list master data preserved.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete database data');
    } finally {
      setIsPurging(false);
    }
  };

  // Factory reset
  const handleResetFactory = async () => {
    if (!window.confirm('WARNING: This will reset all database tables to factory defaults! Continue?')) {
      return;
    }
    try {
      if (onResetAllData) {
        await onResetAllData();
      } else {
        await api.resetToDefaults();
        await onRefresh();
      }
      showToast('success', 'Database reset to factory defaults!');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to reset database');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      
      {/* Header - Direct to Page Background (Same font size as Reports & Registers) */}
      <div className="flex flex-row items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            Server Database Manager
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRefresh}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-100 active:scale-98 text-slate-700 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer shadow-2xs"
            title="Refresh database from server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleCopyJson}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy JSON'}</span>
          </button>

          <button
            onClick={handleDownloadJson}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-2 animate-in fade-in ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-300 text-emerald-900' 
            : 'bg-rose-50 border border-rose-300 text-rose-900'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DATABASE BACKUP, RESTORE & MAINTENANCE SECTION (EXPAND / MINIMIZE FORM)  */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        {/* Expand / Minimize Header */}
        <div
          onClick={() => setIsBackupExpanded(!isBackupExpanded)}
          className="py-2 px-3 sm:px-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
              <Database className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                  Database Backup, Restore &amp; Maintenance
                </h2>
                <span className="hidden sm:inline-block text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                  Direct Operations
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate leading-tight">
                {isBackupExpanded
                  ? 'Backup exports, file restore, selective data deletion, or factory reset.'
                  : 'Click to expand backup, restore, and maintenance operations.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsBackupExpanded(!isBackupExpanded);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors shrink-0 cursor-pointer"
          >
            {isBackupExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Minimize</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Expand</span>
              </>
            )}
          </button>
        </div>

        {/* Small Miniature Four Thumbnails After Expand */}
        {isBackupExpanded && (
          <div className="p-3 sm:p-4 pt-0 border-t border-slate-100 space-y-3 animate-in fade-in duration-150">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 pt-3">
              
              {/* Miniature Thumbnail 1: Export Backup */}
              <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between gap-2 hover:border-slate-300 transition-all shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Download className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-900 truncate">Export Backup</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    Full JSON snapshot of candidates, events &amp; clubs.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadFullBackup}
                  className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Download className="w-3 h-3" />
                  <span>Download Backup</span>
                </button>
              </div>

              {/* Miniature Thumbnail 2: Restore Backup */}
              <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between gap-2 hover:border-slate-300 transition-all shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-900 truncate">Restore File</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    Upload JSON backup file to overwrite database.
                  </p>
                </div>

                <label className="w-full py-1.5 px-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs text-center">
                  <Upload className="w-3 h-3" />
                  <span>Select &amp; Restore</span>
                  <input type="file" accept=".json" onChange={handleFileRestore} className="hidden" />
                </label>
              </div>

              {/* Miniature Thumbnail 3: Delete All Data Except Event List Master Data */}
              <div className="p-2.5 rounded-lg border border-rose-300 bg-rose-50/70 flex flex-col justify-between gap-2 hover:border-rose-400 transition-all shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <Trash2 className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-rose-950 truncate">Delete All Data</span>
                    </div>
                    <span className="text-[9px] font-extrabold px-1 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                      Keep Events
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-tight">
                    Deletes candidates &amp; results. Preserves 16 master events.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePurgeExceptEvents}
                  disabled={isPurging}
                  className="w-full py-1.5 px-2 bg-rose-600 hover:bg-rose-700 active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs"
                  title="Delete all data except event list master data"
                >
                  {isPurging ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3 h-3" />
                      <span>Delete (Keep Events)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Miniature Thumbnail 4: Factory Reset */}
              <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between gap-2 hover:border-slate-300 transition-all shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-md bg-slate-200 text-slate-800 flex items-center justify-center shrink-0">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-900 truncate">Factory Reset</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    Reset database back to default starter records.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleResetFactory}
                  className="w-full py-1.5 px-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Database</span>
                </button>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* RAW DATABASE OPERATION (EXPAND & MINIMIZE FORM)                           */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all">
        {/* Expand / Minimize Section Header */}
        <div
          onClick={() => setIsRawDbExpanded(!isRawDbExpanded)}
          className="p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
              <Table className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">
                  Raw Database Operation
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Tables &amp; Records Viewer
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isRawDbExpanded
                  ? `Active table: ${activeTable} (${tables.find((t) => t.id === activeTable)?.count || 0} records). Switch table tabs, search records, and inspect data.`
                  : 'Click to expand table navigation, search records, and view raw database.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsRawDbExpanded(!isRawDbExpanded);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors shrink-0 cursor-pointer"
          >
            {isRawDbExpanded ? (
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

        {/* When Expanded: Merged DB Table Names Row, Search Bar, and Data Viewer */}
        {isRawDbExpanded && (
          <div className="p-4 sm:p-6 pt-0 border-t border-slate-100 space-y-4 animate-in fade-in duration-150">
            
            {/* 1. DB Table Names Row */}
            <div className="pt-4">
              <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-50 rounded-xl border border-slate-200">
                {tables.map((t) => {
                  const isActive = activeTable === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setActiveTable(t.id);
                        setSearchTerm('');
                        setIsEditingFullJson(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-transparent text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      <span>{t.label}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-700'}`}>
                        {t.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. SPECIAL VIEW: Interactive Settings Editor */}
            {activeTable === 'settings' ? (
              <div className="rounded-xl p-4 sm:p-5 border border-slate-200 bg-slate-50/50 space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="text-base font-black text-slate-900">Manage Meet Configuration &amp; Records</h3>
                      <p className="text-xs text-slate-500">Edit general parameters and Broad Jump meet benchmarks.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewMode(viewMode === 'table' ? 'json' : 'table')}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>{viewMode === 'table' ? 'Switch to Raw JSON' : 'Switch to Form'}</span>
                  </button>
                </div>

                {viewMode === 'json' ? (
                  <div className="space-y-3">
                    <textarea
                      value={fullJsonText}
                      onChange={(e) => setFullJsonText(e.target.value)}
                      rows={16}
                      className="w-full font-mono text-xs p-4 rounded-xl bg-slate-950 text-emerald-400 border border-slate-800 focus:outline-hidden focus:border-blue-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleSaveFullJson}
                        className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                      >
                        <Save className="w-4 h-4" />
                        <span>Save Settings JSON</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveSettingsForm} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Meet Title</label>
                        <input
                          type="text"
                          value={settingsForm.ordinalTitle || ''}
                          onChange={(e) => setSettingsForm({ ...settingsForm, ordinalTitle: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Organizer</label>
                        <input
                          type="text"
                          value={settingsForm.organizer || ''}
                          onChange={(e) => setSettingsForm({ ...settingsForm, organizer: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Venue / Stadium</label>
                        <input
                          type="text"
                          value={settingsForm.venue || ''}
                          onChange={(e) => setSettingsForm({ ...settingsForm, venue: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Meet Dates</label>
                        <input
                          type="text"
                          value={settingsForm.dates || ''}
                          onChange={(e) => setSettingsForm({ ...settingsForm, dates: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">President</label>
                        <input
                          type="text"
                          value={settingsForm.president || ''}
                          onChange={(e) => setSettingsForm({ ...settingsForm, president: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Secretary</label>
                        <input
                          type="text"
                          value={settingsForm.secretary || ''}
                          onChange={(e) => setSettingsForm({ ...settingsForm, secretary: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Currency Symbol</label>
                        <input
                          type="text"
                          value={settingsForm.currencySymbol || '₹'}
                          onChange={(e) => setSettingsForm({ ...settingsForm, currencySymbol: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Auto Chest Start</label>
                        <input
                          type="number"
                          value={settingsForm.autoChestStart || 101}
                          onChange={(e) => setSettingsForm({ ...settingsForm, autoChestStart: parseInt(e.target.value, 10) || 101 })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold font-mono text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Server PIN</label>
                        <input
                          type="text"
                          value={settingsForm.serverPin || '1234'}
                          onChange={(e) => setSettingsForm({ ...settingsForm, serverPin: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold font-mono text-slate-900"
                        />
                      </div>
                    </div>

                    {/* Broad Jump Benchmarks Section */}
                    <div className="pt-4 border-t border-slate-200 space-y-3">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-600" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          Previous Broad Jump Records Benchmarks
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[6, 8, 12, 14].map((evtNo) => {
                          const rec = settingsForm.broadJumpPreviousRecords?.[evtNo] || {
                            eventNo: evtNo,
                            eventName: 'BROAD JUMP',
                            gender: evtNo === 6 || evtNo === 8 ? 'BOYS' : 'GIRLS',
                            height: evtNo === 6 || evtNo === 12 ? "4'-6\"" : "4'-10\"",
                            recordHolderName: '',
                            recordHolderClub: '',
                            recordYear: '2025',
                            recordValue: `14' 5"`,
                          };

                          return (
                            <div key={evtNo} className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-amber-950">
                                  Event #{evtNo}: BROAD JUMP ({rec.gender} • {rec.height})
                                </span>
                                <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded">
                                  Benchmark
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-[10px] text-slate-500 font-semibold block">Record Value</span>
                                  <input
                                    type="text"
                                    value={rec.recordValue}
                                    onChange={(e) => {
                                      const nextRecs = { ...settingsForm.broadJumpPreviousRecords };
                                      nextRecs[evtNo] = { ...rec, recordValue: e.target.value };
                                      setSettingsForm({ ...settingsForm, broadJumpPreviousRecords: nextRecs });
                                    }}
                                    placeholder={`e.g. 15' 2"`}
                                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded font-mono font-bold text-xs"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-500 font-semibold block">Record Year</span>
                                  <input
                                    type="text"
                                    value={rec.recordYear}
                                    onChange={(e) => {
                                      const nextRecs = { ...settingsForm.broadJumpPreviousRecords };
                                      nextRecs[evtNo] = { ...rec, recordYear: e.target.value };
                                      setSettingsForm({ ...settingsForm, broadJumpPreviousRecords: nextRecs });
                                    }}
                                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-semibold"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-500 font-semibold block">Holder Name</span>
                                  <input
                                    type="text"
                                    value={rec.recordHolderName}
                                    onChange={(e) => {
                                      const nextRecs = { ...settingsForm.broadJumpPreviousRecords };
                                      nextRecs[evtNo] = { ...rec, recordHolderName: e.target.value };
                                      setSettingsForm({ ...settingsForm, broadJumpPreviousRecords: nextRecs });
                                    }}
                                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-semibold"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-500 font-semibold block">Club</span>
                                  <input
                                    type="text"
                                    value={rec.recordHolderClub}
                                    onChange={(e) => {
                                      const nextRecs = { ...settingsForm.broadJumpPreviousRecords };
                                      nextRecs[evtNo] = { ...rec, recordHolderClub: e.target.value };
                                      setSettingsForm({ ...settingsForm, broadJumpPreviousRecords: nextRecs });
                                    }}
                                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-semibold"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end pt-3">
                      <button
                        type="submit"
                        disabled={isSavingSettings}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>{isSavingSettings ? 'Saving Settings...' : 'Save All Settings & Records'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              /* STANDARD TABLE MANAGEMENT VIEW */
              <div className="space-y-4">
                {/* Controls Bar: Search & View Modes */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={`Search ${activeTable}...`}
                      className="w-full pl-9 pr-3 py-1.5 bg-white rounded-lg border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <span className="text-xs font-semibold text-slate-500">
                      {currentRecords.length} record(s) matching
                    </span>

                    <div className="flex bg-slate-200/80 p-0.5 rounded-lg border border-slate-200">
                      <button
                        onClick={() => setViewMode('table')}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          viewMode === 'table' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Table className="w-3.5 h-3.5" />
                        <span>Grid View</span>
                      </button>
                      <button
                        onClick={() => setViewMode('json')}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          viewMode === 'json' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>Raw JSON</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main View Area */}
                {viewMode === 'json' ? (
                  <div className="bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-800 shadow-inner space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-300 border-b border-slate-800 pb-2">
                      <span>Direct JSON Editor for table: <strong>{activeTable}</strong></span>
                      <div className="flex items-center gap-2">
                        {isEditingFullJson ? (
                          <>
                            <button
                              onClick={() => setIsEditingFullJson(false)}
                              className="px-3 py-1 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded text-xs font-bold"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveFullJson}
                              className="px-4 py-1 bg-emerald-600 text-white hover:bg-emerald-500 rounded text-xs font-bold flex items-center gap-1"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Validate &amp; Save Table</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setIsEditingFullJson(true)}
                            className="px-3 py-1 bg-blue-600 text-white hover:bg-blue-500 rounded text-xs font-bold flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Raw Table JSON</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditingFullJson ? (
                      <textarea
                        value={fullJsonText}
                        onChange={(e) => setFullJsonText(e.target.value)}
                        rows={20}
                        className="w-full font-mono text-xs p-4 rounded-xl bg-slate-950 text-emerald-400 border border-slate-800 focus:outline-hidden focus:border-blue-500 leading-relaxed"
                      />
                    ) : (
                      <pre className="text-xs font-mono text-emerald-400 overflow-x-auto max-h-[500px] leading-relaxed select-all">
                        {JSON.stringify(currentRecords, null, 2)}
                      </pre>
                    )}
                  </div>
                ) : (
                  /* Table Grid View with Actions Column */
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                    {currentRecords.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-sm">
                        No records found in "{activeTable}".
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[600px]">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
                            <tr>
                              <th className="py-2.5 px-3 font-bold text-slate-700 uppercase tracking-wider text-center w-20">
                                Actions
                              </th>
                              {tableColumns.map((col) => (
                                <th key={col} className="py-2.5 px-3 font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {currentRecords.map((item, idx) => {
                              const recId = getRecordId(item, activeTable);
                              return (
                                <tr key={recId || idx} className="hover:bg-slate-50/70 transition-colors">
                                  {/* Actions Column */}
                                  <td className="py-2 px-2 text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => handleEditRecord(item)}
                                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                        title={`Edit record #${recId}`}
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteRecord(item)}
                                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                        title={`Delete record #${recId}`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>

                                  {/* Data Cells mapped strictly by column header name */}
                                  {tableColumns.map((col) => {
                                    const v = item[col];
                                    // If boolean, render interactive toggle checkbox
                                    if (typeof v === 'boolean') {
                                      return (
                                        <td key={col} className="py-2 px-3 text-center">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(v)}
                                            onChange={() => handleQuickToggle(item, col)}
                                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            title={`Toggle ${col} on #${recId}`}
                                          />
                                        </td>
                                      );
                                    }

                                    return (
                                      <td key={col} className="py-2.5 px-3 text-slate-800 max-w-xs truncate">
                                        {v === undefined || v === null
                                          ? '—'
                                          : typeof v === 'object'
                                          ? JSON.stringify(v)
                                          : String(v)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* EDIT / CREATE RECORD MODAL                                                */}
      {/* ========================================================================= */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm sm:text-base">
                  {modalMode === 'create' ? `Add Record to '${activeTable}'` : `Edit Record #${editingRecordId} in '${activeTable}'`}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-800 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (modalTab === 'json') {
                        try {
                          setEditingRecord(JSON.parse(modalJsonText));
                        } catch (e) {}
                      }
                      setModalTab('form');
                    }}
                    className={`px-2.5 py-1 rounded font-bold ${modalTab === 'form' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                  >
                    Form
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalJsonText(JSON.stringify(editingRecord, null, 2));
                      setModalTab('json');
                    }}
                    className={`px-2.5 py-1 rounded font-bold ${modalTab === 'json' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                  >
                    JSON
                  </button>
                </div>
                <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {modalTab === 'json' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Raw Record JSON</label>
                  <textarea
                    value={modalJsonText}
                    onChange={(e) => setModalJsonText(e.target.value)}
                    rows={14}
                    className="w-full font-mono text-xs p-3 rounded-xl bg-slate-950 text-emerald-400 border border-slate-800 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(editingRecord || {}).map(([key, val]) => {
                    const isBool = typeof val === 'boolean';
                    const isNumber = typeof val === 'number';
                    const isObj = typeof val === 'object' && val !== null;

                    if (isBool) {
                      return (
                        <div key={key} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-xs font-bold text-slate-700">{key}</span>
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(val)}
                              onChange={(e) => setEditingRecord({ ...editingRecord, [key]: e.target.checked })}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-xs font-semibold text-slate-600">{val ? 'true' : 'false'}</span>
                          </label>
                        </div>
                      );
                    }

                    if (isObj) {
                      return (
                        <div key={key}>
                          <label className="block text-xs font-bold text-slate-700 mb-1">{key} (JSON Object / Array)</label>
                          <textarea
                            value={JSON.stringify(val, null, 2)}
                            onChange={(e) => {
                              try {
                                const parsed = JSON.parse(e.target.value);
                                setEditingRecord({ ...editingRecord, [key]: parsed });
                              } catch (err) {}
                            }}
                            rows={3}
                            className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-800 bg-white"
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={key}>
                        <label className="block text-xs font-bold text-slate-700 mb-1">{key}</label>
                        <input
                          type={isNumber ? 'number' : 'text'}
                          value={val !== undefined && val !== null ? String(val) : ''}
                          onChange={(e) => {
                            const newV = isNumber ? parseFloat(e.target.value) || 0 : e.target.value;
                            setEditingRecord({ ...editingRecord, [key]: newV });
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                disabled={isSavingRecord}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingRecord ? 'Saving...' : 'Save Record'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

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
  ChevronUp,
  Users,
  Building2,
  DollarSign,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../services/api';
import { 
  downloadSportsMeetExcel, 
  downloadFullDatabaseExcel, 
  parseDatabaseBackupFromExcel 
} from '../services/excelExport';

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
  onRefresh: (force?: boolean) => Promise<void>;
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

  // In-app Confirmation Modal State (replaces blocked window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    action: 'purge' | 'factoryReset';
  } | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);

  // Edit / Create Record Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'edit' | 'create'>('edit');
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | number>('');
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

    let list = [...raw];
    if (activeTable === 'candidates') {
      list.sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
    } else if (activeTable === 'events') {
      list.sort((a, b) => (Number(a.Evt_No) || Number(a.chestNo) || 0) - (Number(b.Evt_No) || Number(b.chestNo) || 0));
    }

    if (!searchTerm.trim()) return list;

    const term = searchTerm.toLowerCase();
    return list.filter((item) => JSON.stringify(item).toLowerCase().includes(term));
  }, [data, activeTable, searchTerm]);

  // Canonical columns per table to guarantee exact synchronization between headers and data cells
  const tableColumns = useMemo(() => {
    if (!currentRecords || currentRecords.length === 0) return [];

    if (activeTable === 'clubs') {
      return ['Sl', 'Reg_Club', 'Mob', 'Count_1stPlace', 'Count_2ndPlace', 'Count_3rdPlace', 'TotPoints'];
    }

    if (activeTable === 'events') {
      return ['Evt_No', 'Evt_Name', 'Height', 'Gender', 'Fees', 'requiredHit', 'requiredFinal'];
    }

    if (activeTable === 'candidates') {
      const canonical = [
        'chestNo',
        'name',
        'club',
        'gender',
        'height',
        'selectedEvents',
        'totalFees',
        'feeStatus',
        'id',
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
    if (!record) return '';
    if (table === 'events') return String(record.Evt_No);
    if (table === 'clubs') return String(record.id || record.Reg_Club || record.name || '');
    if (record.id !== undefined) return String(record.id);
    if (table === 'candidates' && record.chestNo !== undefined) return String(record.chestNo);
    if (table === 'results' && record.eventNo !== undefined) return String(record.eventNo);
    return String(record.id || '');
  };

  // Open Edit Modal for a Record
  const handleEditRecord = (record: any) => {
    const id = getRecordId(record, activeTable);
    setEditingRecordId(id);
    setEditingRecord(JSON.parse(JSON.stringify(record)));
    setModalMode('edit');
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
        club: data.clubs?.[0]?.Reg_Club || data.clubs?.[0]?.name || 'SELF',
        gender: 'BOYS',
        height: "4'-2\"",
        feeStatus: 'Paid',
        selectedEvents: [1],
        totalFees: 10.0,
        status: 'pending',
        synced: true,
        isDirty: false,
      };
    } else if (activeTable === 'clubs') {
      template = {
        Sl: (data.clubs || []).length + 1,
        Reg_Club: 'NEW SPORTS CLUB',
        Mob: '',
        Count_1stPlace: 0,
        Count_2ndPlace: 0,
        Count_3rdPlace: 0,
        TotPoints: 0,
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
    setModalMode('create');
    setModalError(null);
    setModalOpen(true);
  };

  // Save Record (Edit or Create)
  const handleSaveModal = async () => {
    setIsSavingRecord(true);
    setModalError(null);
    try {
      const finalData = { ...editingRecord };
      if (!finalData.id && editingRecordId) {
        finalData.id = String(editingRecordId);
      }

      if (modalMode === 'create') {
        await api.createRawRow(activeTable, finalData);
        showToast('success', `New record created in table '${activeTable}'`);
      } else {
        await api.updateRawRow(activeTable, String(editingRecordId), finalData);
        showToast('success', `Record #${editingRecordId} updated in table '${activeTable}'`);
      }

      setModalOpen(false);
      await onRefresh(true);
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
      await onRefresh(true);
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
      await onRefresh(true);
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
      await onRefresh(true);
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

  // Full database backup download (JSON)
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

  // Full database & data Excel workbook export (.xlsx)
  const handleDownloadExcelBackup = () => {
    try {
      downloadSportsMeetExcel({
        candidates: data.candidates || [],
        events: data.events || [],
        heats: data.heats || [],
        results: data.results || [],
        settings: data.settings,
      });
      showToast('success', 'Excel workbook (.xlsx) with General Entry & Event Allocation downloaded!');
    } catch (err: any) {
      showToast('error', 'Failed to generate Excel file: ' + err.message);
    }
  };

  // Restore database from file
  // Download Full Database in .xlsx
  const handleDownloadFullDbXlsx = () => {
    try {
      downloadFullDatabaseExcel(data);
      showToast('success', 'Full database downloaded as .xlsx with all table structures and data!');
    } catch (err: any) {
      showToast('error', 'Failed to generate Excel database backup: ' + err.message);
    }
  };

  // Restore Database from .xlsx file
  const handleExcelFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const parsedDb = parseDatabaseBackupFromExcel(wb);

      if (!parsedDb.candidates && !parsedDb.events && !parsedDb.clubs) {
        throw new Error('No valid database tables found in uploaded Excel file.');
      }

      if (onRestoreBackup) {
        await onRestoreBackup(parsedDb);
      } else {
        await api.restoreDatabaseDump(parsedDb);
        await onRefresh();
      }
      showToast('success', 'Database restored successfully from .xlsx file!');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to restore database from Excel file');
    } finally {
      e.target.value = '';
    }
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result as string);
        if (onRestoreBackup) {
          await onRestoreBackup(json);
        } else {
          await api.restoreDatabase(json);
          await onRefresh();
        }
        showToast('success', 'Database restored successfully from JSON!');
      } catch (err: any) {
        showToast('error', 'Invalid JSON backup file: ' + err.message);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Delete all data except event list master data
  const handlePurgeExceptEvents = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete All Data (Keep Events)',
      message: 'Are you sure you want to delete all candidates, client uploads, heats, and results?\n\nAll 16 Event List Master Data records will be strictly PRESERVED.',
      confirmText: 'Yes, Delete All Data',
      action: 'purge',
    });
  };

  // Factory reset
  const handleResetFactory = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Factory Reset Database',
      message: 'WARNING: This will reset all database tables to factory defaults! All candidates, results, and heats will be deleted, and master events, clubs, and settings will be restored to defaults.',
      confirmText: 'Yes, Reset to Defaults',
      action: 'factoryReset',
    });
  };

  const handleExecuteConfirmedAction = async () => {
    if (!confirmModal) return;
    setIsExecutingAction(true);
    try {
      if (confirmModal.action === 'purge') {
        setIsPurging(true);
        if (onPurgeExceptEvents) {
          await onPurgeExceptEvents();
        } else {
          await api.purgeAllExceptEvents();
          await onRefresh();
        }
        showToast('success', 'All database data deleted! Event list master data preserved.');
      } else if (confirmModal.action === 'factoryReset') {
        if (onResetAllData) {
          await onResetAllData();
        } else {
          await api.resetToDefaults();
          await onRefresh();
        }
        showToast('success', 'Database reset to factory defaults successfully!');
      }
      setConfirmModal(null);
    } catch (err: any) {
      showToast('error', err.message || 'Operation failed');
    } finally {
      setIsPurging(false);
      setIsExecutingAction(false);
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
                    Athletes data or full database snapshot in JSON &amp; XLSX.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleDownloadExcelBackup}
                    className="w-full py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    title="Export Athletes' Data with 'General Entry' & 'Event Allocation' sheets"
                  >
                    <FileSpreadsheet className="w-3 h-3 text-emerald-200" />
                    <span>Download Athletes' Data</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleDownloadFullBackup}
                      className="flex-1 py-1.5 px-2 bg-slate-700 hover:bg-slate-800 active:scale-98 text-white rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      title="Export raw JSON database backup"
                    >
                      <Download className="w-3 h-3" />
                      <span>JSON</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadFullDbXlsx}
                      className="flex-1 py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      title="Download the whole database with all table structure and data in .xlsx format"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-200" />
                      <span>XLSX</span>
                    </button>
                  </div>
                </div>
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
                    Upload .xlsx or .json backup file to overwrite database.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="w-full py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs text-center">
                    <FileSpreadsheet className="w-3 h-3 text-emerald-200" />
                    <span>Restore Database (.xlsx)</span>
                    <input type="file" accept=".xlsx,.xls" onChange={handleExcelFileRestore} className="hidden" />
                  </label>

                  <label className="w-full py-1.5 px-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs text-center">
                    <Upload className="w-3 h-3" />
                    <span>Select &amp; Restore</span>
                    <input type="file" accept=".json" onChange={handleFileRestore} className="hidden" />
                  </label>
                </div>
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
            
            {/* Top Unified Controls Bar: Table Combo on Left, Search Box with Clear Button, and Actions */}
            <div className="pt-4">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
                {/* Left Group: Table Combo Box + Search Box with Cross button */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-2xl">
                  {/* 1. Combo for Table Names */}
                  <div className="relative w-full sm:w-60 shrink-0">
                    <label className="sr-only">Select Database Table</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-600">
                        <Table className="w-4 h-4" />
                      </div>
                      <select
                        value={activeTable}
                        onChange={(e) => {
                          setActiveTable(e.target.value as TableId);
                          setSearchTerm('');
                          setIsEditingFullJson(false);
                        }}
                        className="w-full pl-9 pr-8 py-2 bg-white rounded-lg border border-slate-300 text-xs font-bold text-slate-800 shadow-2xs hover:border-blue-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer appearance-none transition-colors"
                      >
                        {tables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label} ({t.count})
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* 2. Search Box with Cross (X) icon to clear with one click */}
                  <div className="relative w-full sm:flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={`Search ${tables.find((t) => t.id === activeTable)?.label || activeTable}...`}
                      className="w-full pl-9 pr-9 py-2 bg-white rounded-lg border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs transition-colors"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Right Group: Record Count, Add Record, View Modes */}
                <div className="flex items-center gap-2 justify-between md:justify-end flex-wrap">
                  <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                    {currentRecords.length} record(s) matching
                  </span>

                  {activeTable !== 'settings' && (
                    <button
                      type="button"
                      onClick={handleStartCreate}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Record</span>
                    </button>
                  )}

                  {activeTable !== 'settings' && (
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
                  )}
                </div>
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
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm sm:text-base text-white truncate">
                    {modalMode === 'create'
                      ? `Add New Record to '${tables.find((t) => t.id === activeTable)?.label || activeTable}'`
                      : activeTable === 'candidates'
                      ? `Edit Candidate #${editingRecord?.chestNo || editingRecordId}: ${editingRecord?.name || ''}`
                      : activeTable === 'events'
                      ? `Edit Event #${editingRecord?.Evt_No || editingRecordId}: ${editingRecord?.Evt_Name || ''}`
                      : activeTable === 'clubs'
                      ? `Edit Club: ${editingRecord?.name || editingRecordId}`
                      : activeTable === 'heats'
                      ? `Edit Heat #${editingRecord?.heatNumber || ''} (Event #${editingRecord?.eventNo || ''})`
                      : activeTable === 'results'
                      ? `Edit Results (Event #${editingRecord?.eventNo || ''})`
                      : `Edit Record #${editingRecordId} in '${tables.find((t) => t.id === activeTable)?.label || activeTable}'`}
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    {tables.find((t) => t.id === activeTable)?.label || activeTable} &bull; Form Entry Mode
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: User-Friendly Entry Form (NO JSON FORMAT) */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* 1. CANDIDATES ENTRY FORM */}
              {activeTable === 'candidates' && editingRecord && (
                <div className="space-y-4">
                  {/* Athlete Profile */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>Athlete Profile</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Chest Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          value={editingRecord.chestNo ?? ''}
                          onChange={(e) => setEditingRecord({ ...editingRecord, chestNo: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-black text-blue-600"
                          placeholder="e.g. 101"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Candidate Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editingRecord.name ?? ''}
                          onChange={(e) => setEditingRecord({ ...editingRecord, name: e.target.value.toUpperCase() })}
                          placeholder="ENTER FULL NAME"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 uppercase"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Club Name <span className="text-rose-500">*</span>
                        </label>
                        <div className="space-y-1.5">
                          <select
                            value={data.clubs?.some((c) => c.name === editingRecord.club) ? editingRecord.club : '__custom__'}
                            onChange={(e) => {
                              if (e.target.value !== '__custom__') {
                                setEditingRecord({ ...editingRecord, club: e.target.value });
                              }
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 cursor-pointer"
                          >
                            <option value="">-- Select Registered Club --</option>
                            {data.clubs?.map((c) => (
                              <option key={c.id || c.name} value={c.name}>
                                {c.name} {c.shortCode ? `(${c.shortCode})` : ''}
                              </option>
                            ))}
                            <option value="__custom__">Other / Type Custom Club Name</option>
                          </select>
                          {(!data.clubs?.some((c) => c.name === editingRecord.club) || editingRecord.club === '') && (
                            <input
                              type="text"
                              value={editingRecord.club ?? ''}
                              onChange={(e) => setEditingRecord({ ...editingRecord, club: e.target.value })}
                              placeholder="Or type custom club name..."
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                            />
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                          <select
                            value={editingRecord.gender ?? 'BOYS'}
                            onChange={(e) => setEditingRecord({ ...editingRecord, gender: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 cursor-pointer"
                          >
                            <option value="BOYS">BOYS</option>
                            <option value="GIRLS">GIRLS</option>
                            <option value="CHILDRENS">CHILDRENS</option>
                            <option value="ALL">ALL</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Height</label>
                          <input
                            type="text"
                            value={editingRecord.height ?? ''}
                            onChange={(e) => setEditingRecord({ ...editingRecord, height: e.target.value })}
                            placeholder={"e.g. 4'-2\" or ALL"}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment & Fees */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <span>Fee &amp; Payment Status</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Fee Status</label>
                        <select
                          value={editingRecord.feeStatus ?? 'Paid'}
                          onChange={(e) => setEditingRecord({ ...editingRecord, feeStatus: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 cursor-pointer"
                        >
                          <option value="Due">Due</option>
                          <option value="Paid">Paid</option>
                          <option value="Free">Free</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Total Fees (₹)</label>
                        <input
                          type="number"
                          value={editingRecord.totalFees ?? 0}
                          onChange={(e) => setEditingRecord({ ...editingRecord, totalFees: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Interactive Selected Events Selection */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <Layers className="w-4 h-4 text-blue-600" />
                        <span>Selected Events</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-700 font-bold">
                          {(editingRecord.selectedEvents || []).length} Selected
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const allEvtNos = (data.events || []).map((e: any) => Number(e.Evt_No));
                            const calcFees = (data.events || []).reduce((acc: number, e: any) => acc + (Number(e.Fees) || 0), 0);
                            setEditingRecord({ ...editingRecord, selectedEvents: allEvtNos, totalFees: calcFees });
                          }}
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-bold px-2 py-1 rounded bg-blue-100/60 hover:bg-blue-100 transition-colors cursor-pointer"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRecord({ ...editingRecord, selectedEvents: [], totalFees: 0 })}
                          className="text-[10px] text-slate-600 hover:text-slate-900 font-bold px-2 py-1 rounded bg-slate-200/70 hover:bg-slate-200 transition-colors cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1.5 border border-slate-200 rounded-xl bg-white">
                      {(data.events || []).length === 0 ? (
                        <div className="col-span-2 p-3 text-center text-xs text-slate-500">
                          No events registered in database.
                        </div>
                      ) : (
                        (data.events || []).map((evt: any) => {
                          const evtNo = Number(evt.Evt_No);
                          const isSelected = (editingRecord.selectedEvents || []).includes(evtNo);
                          return (
                            <label
                              key={evtNo}
                              className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50/80 border-blue-300 text-blue-950 font-bold shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  const currentSelected: number[] = editingRecord.selectedEvents ? [...editingRecord.selectedEvents] : [];
                                  let updatedEvents: number[];
                                  if (isSelected) {
                                    updatedEvents = currentSelected.filter((n) => n !== evtNo);
                                  } else {
                                    updatedEvents = [...currentSelected, evtNo].sort((a, b) => a - b);
                                  }
                                  // Auto-calculate fees
                                  const newTotalFees = (data.events || [])
                                    .filter((e: any) => updatedEvents.includes(Number(e.Evt_No)))
                                    .reduce((sum: number, e: any) => sum + (Number(e.Fees) || 0), 0);
                                  setEditingRecord({
                                    ...editingRecord,
                                    selectedEvents: updatedEvents,
                                    totalFees: newTotalFees,
                                  });
                                }}
                                className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-extrabold text-[11px] text-blue-700">Evt #{evtNo}</span>
                                  <span className="text-[10px] text-emerald-700 font-bold">₹{evt.Fees || 0}</span>
                                </div>
                                <div className="truncate text-slate-900 font-semibold">{evt.Evt_Name}</div>
                                <div className="text-[10px] text-slate-500 font-normal">
                                  {evt.Height || 'ALL'} &bull; {evt.Gender || 'ALL'}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* System & Sync Status */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">System &amp; Sync Status</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(editingRecord.synced)}
                          onChange={(e) => setEditingRecord({ ...editingRecord, synced: e.target.checked })}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Synced</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(editingRecord.merged)}
                          onChange={(e) => setEditingRecord({ ...editingRecord, merged: e.target.checked })}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Merged</span>
                      </label>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-bold mb-0.5">Status</span>
                        <select
                          value={editingRecord.status ?? 'pending'}
                          onChange={(e) => setEditingRecord({ ...editingRecord, status: e.target.value })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                        >
                          <option value="pending">Pending</option>
                          <option value="merged">Merged</option>
                          <option value="rejected">Rejected</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-bold mb-0.5">Record ID</span>
                        <span className="text-xs font-mono text-slate-600 truncate block py-1 bg-white px-2 border border-slate-200 rounded-lg">
                          {editingRecord.id || 'cand_' + editingRecord.chestNo}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. EVENTS ENTRY FORM */}
              {activeTable === 'events' && editingRecord && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span>Event Specifications</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Event Number (Evt_No) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          value={editingRecord.Evt_No ?? ''}
                          onChange={(e) => setEditingRecord({ ...editingRecord, Evt_No: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-black text-blue-600"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Event Name (Evt_Name) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editingRecord.Evt_Name ?? ''}
                          onChange={(e) => setEditingRecord({ ...editingRecord, Evt_Name: e.target.value.toUpperCase() })}
                          placeholder="e.g. 100M RACE"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 uppercase"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Gender Group</label>
                        <select
                          value={editingRecord.Gender ?? 'BOYS'}
                          onChange={(e) => setEditingRecord({ ...editingRecord, Gender: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 cursor-pointer"
                        >
                          <option value="BOYS">BOYS</option>
                          <option value="GIRLS">GIRLS</option>
                          <option value="CHILDRENS">CHILDRENS</option>
                          <option value="ALL">ALL</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Height Specification</label>
                        <input
                          type="text"
                          value={editingRecord.Height ?? ''}
                          onChange={(e) => setEditingRecord({ ...editingRecord, Height: e.target.value })}
                          placeholder={"e.g. 4'-2\" or ALL"}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Entry Fee (₹)</label>
                        <input
                          type="number"
                          value={editingRecord.Fees ?? 0}
                          onChange={(e) => setEditingRecord({ ...editingRecord, Fees: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-800 mb-2">Round Qualifications</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex items-center gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingRecord.requiredHit ?? true}
                          onChange={(e) => setEditingRecord({ ...editingRecord, requiredHit: e.target.checked })}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-800">Hit Round Required</div>
                          <div className="text-[11px] text-slate-500">Enable qualification heat rounds</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingRecord.requiredFinal ?? true}
                          onChange={(e) => setEditingRecord({ ...editingRecord, requiredFinal: e.target.checked })}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-800">Final Round Required</div>
                          <div className="text-[11px] text-slate-500">Enable podium rankings</div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. CLUBS ENTRY FORM */}
              {activeTable === 'clubs' && editingRecord && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>Club Master Record</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Registered Club Name (Reg_Club) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editingRecord.Reg_Club ?? editingRecord.name ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setEditingRecord({ ...editingRecord, Reg_Club: val, name: val });
                        }}
                        placeholder="e.g. PROGRESSIVE UNION"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 uppercase"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Serial Number (Sl)
                      </label>
                      <input
                        type="number"
                        value={editingRecord.Sl ?? ''}
                        onChange={(e) => setEditingRecord({ ...editingRecord, Sl: Number(e.target.value) || 1 })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Mobile Number (Mob)
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={editingRecord.Mob ?? editingRecord.mobile ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setEditingRecord({ ...editingRecord, Mob: val, mobile: val });
                        }}
                        placeholder="10-digit mobile"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        1st Place Count (Count_1stPlace) &times; 7 pts
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={editingRecord.Count_1stPlace ?? 0}
                        onChange={(e) => {
                          const c1 = Number(e.target.value) || 0;
                          const c2 = Number(editingRecord.Count_2ndPlace) || 0;
                          const c3 = Number(editingRecord.Count_3rdPlace) || 0;
                          const isSelf = (editingRecord.Reg_Club || editingRecord.name || '').trim().toUpperCase() === 'SELF';
                          setEditingRecord({
                            ...editingRecord,
                            Count_1stPlace: c1,
                            TotPoints: isSelf ? 0 : (c1 * 7 + c2 * 5 + c3 * 4),
                          });
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        2nd Place Count (Count_2ndPlace) &times; 5 pts
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={editingRecord.Count_2ndPlace ?? 0}
                        onChange={(e) => {
                          const c1 = Number(editingRecord.Count_1stPlace) || 0;
                          const c2 = Number(e.target.value) || 0;
                          const c3 = Number(editingRecord.Count_3rdPlace) || 0;
                          const isSelf = (editingRecord.Reg_Club || editingRecord.name || '').trim().toUpperCase() === 'SELF';
                          setEditingRecord({
                            ...editingRecord,
                            Count_2ndPlace: c2,
                            TotPoints: isSelf ? 0 : (c1 * 7 + c2 * 5 + c3 * 4),
                          });
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        3rd Place Count (Count_3rdPlace) &times; 4 pts
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={editingRecord.Count_3rdPlace ?? 0}
                        onChange={(e) => {
                          const c1 = Number(editingRecord.Count_1stPlace) || 0;
                          const c2 = Number(editingRecord.Count_2ndPlace) || 0;
                          const c3 = Number(e.target.value) || 0;
                          const isSelf = (editingRecord.Reg_Club || editingRecord.name || '').trim().toUpperCase() === 'SELF';
                          setEditingRecord({
                            ...editingRecord,
                            Count_3rdPlace: c3,
                            TotPoints: isSelf ? 0 : (c1 * 7 + c2 * 5 + c3 * 4),
                          });
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Total Points (TotPoints)
                      </label>
                      <input
                        type="number"
                        readOnly
                        value={
                          (editingRecord.Reg_Club || editingRecord.name || '').trim().toUpperCase() === 'SELF'
                            ? 0
                            : (editingRecord.TotPoints ?? ((Number(editingRecord.Count_1stPlace) || 0) * 7 + (Number(editingRecord.Count_2ndPlace) || 0) * 5 + (Number(editingRecord.Count_3rdPlace) || 0) * 4))
                        }
                        className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl text-sm font-black text-blue-700 cursor-not-allowed"
                        title="Auto-calculated: 1st*7 + 2nd*5 + 3rd*4 (0 for SELF)"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 4. HEATS (HIT LIST) ENTRY FORM */}
              {activeTable === 'heats' && editingRecord && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span>Heat Setup</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Event</label>
                        <select
                          value={editingRecord.eventNo ?? ''}
                          onChange={(e) => setEditingRecord({ ...editingRecord, eventNo: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 cursor-pointer"
                        >
                          <option value="">-- Select Event --</option>
                          {data.events?.map((evt: any) => (
                            <option key={evt.Evt_No} value={evt.Evt_No}>
                              Evt #{evt.Evt_No}: {evt.Evt_Name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Heat Number</label>
                        <input
                          type="number"
                          value={editingRecord.heatNumber ?? 1}
                          onChange={(e) => setEditingRecord({ ...editingRecord, heatNumber: Number(e.target.value) || 1 })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                        <select
                          value={editingRecord.status ?? 'scheduled'}
                          onChange={(e) => setEditingRecord({ ...editingRecord, status: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 cursor-pointer"
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="running">Running</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Heat Participants List (User Friendly Table - NO JSON!) */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span>Heat Participants</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-700 font-bold">
                          {(editingRecord.participants || []).length} Athletes
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const currentP = Array.isArray(editingRecord.participants) ? [...editingRecord.participants] : [];
                          currentP.push({
                            lane: currentP.length + 1,
                            chestNo: '',
                            candidateName: '',
                            club: '',
                            heatNumber: editingRecord.heatNumber || 1,
                            qualified: false,
                            timeRecord: '',
                            remarks: '',
                          });
                          setEditingRecord({ ...editingRecord, participants: currentP });
                        }}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Participant</span>
                      </button>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(editingRecord.participants || []).length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500 bg-white rounded-lg border border-slate-200">
                          No participants in this heat. Click "Add Participant" above.
                        </div>
                      ) : (
                        (editingRecord.participants || []).map((p: any, idx: number) => (
                          <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-200 grid grid-cols-12 gap-2 items-center text-xs">
                            <div className="col-span-1">
                              <span className="text-[10px] text-slate-400 block font-bold">Lane</span>
                              <input
                                type="number"
                                value={p.lane ?? idx + 1}
                                onChange={(e) => {
                                  const updated = [...editingRecord.participants];
                                  updated[idx] = { ...p, lane: Number(e.target.value) || 1 };
                                  setEditingRecord({ ...editingRecord, participants: updated });
                                }}
                                className="w-full px-1.5 py-1 bg-slate-50 border border-slate-300 rounded font-bold text-center"
                              />
                            </div>
                            <div className="col-span-2">
                              <span className="text-[10px] text-slate-400 block font-bold">Chest #</span>
                              <input
                                type="number"
                                value={p.chestNo ?? ''}
                                onChange={(e) => {
                                  const cNo = Number(e.target.value) || '';
                                  const cand = data.candidates?.find((c) => Number(c.chestNo) === Number(cNo));
                                  const updated = [...editingRecord.participants];
                                  updated[idx] = {
                                    ...p,
                                    chestNo: cNo,
                                    candidateName: cand ? cand.name : p.candidateName,
                                    club: cand ? cand.club : p.club,
                                  };
                                  setEditingRecord({ ...editingRecord, participants: updated });
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-bold text-blue-600"
                              />
                            </div>
                            <div className="col-span-4">
                              <span className="text-[10px] text-slate-400 block font-bold">Candidate Name</span>
                              <input
                                type="text"
                                value={p.candidateName ?? ''}
                                onChange={(e) => {
                                  const updated = [...editingRecord.participants];
                                  updated[idx] = { ...p, candidateName: e.target.value.toUpperCase() };
                                  setEditingRecord({ ...editingRecord, participants: updated });
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-semibold uppercase"
                              />
                            </div>
                            <div className="col-span-3">
                              <span className="text-[10px] text-slate-400 block font-bold">Club</span>
                              <input
                                type="text"
                                value={p.club ?? ''}
                                onChange={(e) => {
                                  const updated = [...editingRecord.participants];
                                  updated[idx] = { ...p, club: e.target.value };
                                  setEditingRecord({ ...editingRecord, participants: updated });
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-slate-700"
                              />
                            </div>
                            <div className="col-span-1 flex flex-col items-center">
                              <span className="text-[10px] text-slate-400 block font-bold">Qual</span>
                              <input
                                type="checkbox"
                                checked={Boolean(p.qualified)}
                                onChange={(e) => {
                                  const updated = [...editingRecord.participants];
                                  updated[idx] = { ...p, qualified: e.target.checked };
                                  setEditingRecord({ ...editingRecord, participants: updated });
                                }}
                                className="w-4 h-4 rounded text-emerald-600 cursor-pointer mt-1"
                              />
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = editingRecord.participants.filter((_: any, i: number) => i !== idx);
                                  setEditingRecord({ ...editingRecord, participants: updated });
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 5. RESULTS & RANKINGS ENTRY FORM */}
              {activeTable === 'results' && editingRecord && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                      <Award className="w-4 h-4 text-amber-600" />
                      <span>Event Results Overview</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Event</label>
                        <select
                          value={editingRecord.eventNo ?? ''}
                          onChange={(e) => setEditingRecord({ ...editingRecord, eventNo: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 cursor-pointer"
                        >
                          <option value="">-- Select Event --</option>
                          {data.events?.map((evt: any) => (
                            <option key={evt.Evt_No} value={evt.Evt_No}>
                              Evt #{evt.Evt_No}: {evt.Evt_Name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                          <input
                            type="checkbox"
                            checked={Boolean(editingRecord.completed)}
                            onChange={(e) => setEditingRecord({ ...editingRecord, completed: e.target.checked })}
                            className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                          />
                          <span>Event Completed</span>
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Recorded At</label>
                        <input
                          type="text"
                          value={editingRecord.recordedAt ?? ''}
                          onChange={(e) => setEditingRecord({ ...editingRecord, recordedAt: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                          placeholder="ISO or date string"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Finalists Table / List (NO JSON!) */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span>Ranked Finalists</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-700 font-bold">
                          {(editingRecord.finalists || []).length} Athletes
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const currentF = Array.isArray(editingRecord.finalists) ? [...editingRecord.finalists] : [];
                          currentF.push({
                            position: currentF.length + 1,
                            chestNo: '',
                            candidateName: '',
                            club: '',
                            lane: currentF.length + 1,
                            resultValue: '',
                            points: currentF.length === 0 ? 5 : currentF.length === 1 ? 3 : currentF.length === 2 ? 1 : 0,
                            remarks: '',
                          });
                          setEditingRecord({ ...editingRecord, finalists: currentF });
                        }}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Finalist</span>
                      </button>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(editingRecord.finalists || []).length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500 bg-white rounded-lg border border-slate-200">
                          No finalists recorded. Click "Add Finalist" above.
                        </div>
                      ) : (
                        (editingRecord.finalists || []).map((f: any, idx: number) => (
                          <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-200 grid grid-cols-12 gap-2 items-center text-xs">
                            <div className="col-span-1">
                              <span className="text-[10px] text-slate-400 block font-bold">Pos</span>
                              <input
                                type="number"
                                value={f.position ?? idx + 1}
                                onChange={(e) => {
                                  const updated = [...editingRecord.finalists];
                                  updated[idx] = { ...f, position: Number(e.target.value) || 1 };
                                  setEditingRecord({ ...editingRecord, finalists: updated });
                                }}
                                className="w-full px-1 py-1 bg-slate-50 border border-slate-300 rounded font-bold text-center"
                              />
                            </div>
                            <div className="col-span-2">
                              <span className="text-[10px] text-slate-400 block font-bold">Chest #</span>
                              <input
                                type="number"
                                value={f.chestNo ?? ''}
                                onChange={(e) => {
                                  const cNo = Number(e.target.value) || '';
                                  const cand = data.candidates?.find((c) => Number(c.chestNo) === Number(cNo));
                                  const updated = [...editingRecord.finalists];
                                  updated[idx] = {
                                    ...f,
                                    chestNo: cNo,
                                    candidateName: cand ? cand.name : f.candidateName,
                                    club: cand ? cand.club : f.club,
                                  };
                                  setEditingRecord({ ...editingRecord, finalists: updated });
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-bold text-blue-600"
                              />
                            </div>
                            <div className="col-span-3">
                              <span className="text-[10px] text-slate-400 block font-bold">Candidate</span>
                              <input
                                type="text"
                                value={f.candidateName ?? ''}
                                onChange={(e) => {
                                  const updated = [...editingRecord.finalists];
                                  updated[idx] = { ...f, candidateName: e.target.value.toUpperCase() };
                                  setEditingRecord({ ...editingRecord, finalists: updated });
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-semibold uppercase"
                              />
                            </div>
                            <div className="col-span-3">
                              <span className="text-[10px] text-slate-400 block font-bold">Club</span>
                              <input
                                type="text"
                                value={f.club ?? ''}
                                onChange={(e) => {
                                  const updated = [...editingRecord.finalists];
                                  updated[idx] = { ...f, club: e.target.value };
                                  setEditingRecord({ ...editingRecord, finalists: updated });
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-slate-700"
                              />
                            </div>
                            <div className="col-span-2">
                              <span className="text-[10px] text-slate-400 block font-bold">Jump/Record</span>
                              <input
                                type="text"
                                value={f.jumpRecord || f.resultValue || ''}
                                onChange={(e) => {
                                  const updated = [...editingRecord.finalists];
                                  updated[idx] = { ...f, jumpRecord: e.target.value, resultValue: e.target.value };
                                  setEditingRecord({ ...editingRecord, finalists: updated });
                                }}
                                placeholder={"e.g. 14' 5\""}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-semibold text-emerald-700"
                              />
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = editingRecord.finalists.filter((_: any, i: number) => i !== idx);
                                  setEditingRecord({ ...editingRecord, finalists: updated });
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 6. CLIENT UPLOADS ENTRY FORM */}
              {activeTable === 'clientUploads' && editingRecord && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>Client Upload Entry</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Club Name</label>
                      <input
                        type="text"
                        value={editingRecord.club ?? ''}
                        onChange={(e) => setEditingRecord({ ...editingRecord, club: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Client Device / Name</label>
                      <input
                        type="text"
                        value={editingRecord.clientName ?? ''}
                        onChange={(e) => setEditingRecord({ ...editingRecord, clientName: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                      <select
                        value={editingRecord.status ?? 'pending'}
                        onChange={(e) => setEditingRecord({ ...editingRecord, status: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 cursor-pointer"
                      >
                        <option value="pending">Pending</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="merged">Merged</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Total Fees (₹)</label>
                      <input
                        type="number"
                        value={editingRecord.totalFees ?? 0}
                        onChange={(e) => setEditingRecord({ ...editingRecord, totalFees: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Review Notes</label>
                      <textarea
                        value={editingRecord.notes ?? ''}
                        onChange={(e) => setEditingRecord({ ...editingRecord, notes: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2 bg-white p-3 rounded-lg border border-slate-200 text-xs">
                      <span className="font-bold text-slate-700">Contained Candidates: </span>
                      <span className="font-semibold text-blue-600">
                        {(editingRecord.candidates || []).length} registered candidate records
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 7. FALLBACK GENERIC ENTRY FORM (FOR ANY OTHER TABLE - NO JSON!) */}
              {!['candidates', 'events', 'clubs', 'heats', 'results', 'clientUploads'].includes(activeTable) && editingRecord && (
                <div className="space-y-3">
                  {Object.entries(editingRecord).map(([key, val]) => {
                    const isBool = typeof val === 'boolean';
                    const isNumber = typeof val === 'number';
                    const isArray = Array.isArray(val);
                    const isObj = typeof val === 'object' && val !== null && !isArray;
                    const humanLabel = key
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/_/g, ' ')
                      .replace(/^\w/, (c) => c.toUpperCase())
                      .trim();

                    if (isBool) {
                      return (
                        <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-xs font-bold text-slate-700">{humanLabel}</span>
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(val)}
                              onChange={(e) => setEditingRecord({ ...editingRecord, [key]: e.target.checked })}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-xs font-semibold text-slate-600">{val ? 'Enabled (True)' : 'Disabled (False)'}</span>
                          </label>
                        </div>
                      );
                    }

                    if (isArray) {
                      return (
                        <div key={key} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                          <label className="block text-xs font-bold text-slate-700">{humanLabel} (List Items)</label>
                          <div className="flex flex-wrap gap-1.5 p-2 bg-white rounded-lg border border-slate-200 min-h-[40px]">
                            {val.length === 0 ? (
                              <span className="text-xs text-slate-400 italic">No items</span>
                            ) : (
                              val.map((item: any, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-semibold border border-blue-200">
                                  <span>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextArr = val.filter((_: any, idx: number) => idx !== i);
                                      setEditingRecord({ ...editingRecord, [key]: nextArr });
                                    }}
                                    className="hover:text-rose-600 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (isObj) {
                      return (
                        <div key={key} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                          <span className="block text-xs font-bold text-slate-700">{humanLabel}</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                            {Object.entries(val).map(([subKey, subVal]) => (
                              <div key={subKey}>
                                <label className="block text-[10px] font-bold text-slate-500">{subKey}</label>
                                <input
                                  type={typeof subVal === 'number' ? 'number' : 'text'}
                                  value={subVal !== undefined && subVal !== null ? String(subVal) : ''}
                                  onChange={(e) => {
                                    const nextSub = typeof subVal === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
                                    setEditingRecord({
                                      ...editingRecord,
                                      [key]: { ...val, [subKey]: nextSub },
                                    });
                                  }}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={key}>
                        <label className="block text-xs font-bold text-slate-700 mb-1">{humanLabel}</label>
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

      {/* In-app Confirmation Modal for Database Deletion & Factory Reset */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                  {confirmModal.title}
                </h3>
                <span className="text-[11px] text-rose-600 font-semibold">Irreversible action</span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-line leading-relaxed">
              {confirmModal.message}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={isExecutingAction}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteConfirmedAction}
                disabled={isExecutingAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isExecutingAction && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{confirmModal.confirmText}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};


import React, { useState, useMemo } from 'react';
import { 
  Database, 
  Table, 
  Code, 
  Search, 
  Download, 
  Copy, 
  Check, 
  RefreshCw,
  FileJson,
  Layers
} from 'lucide-react';

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
}

export const DbExplorer: React.FC<DbExplorerProps> = ({ data, onRefresh }) => {
  const [activeTable, setActiveTable] = useState<'candidates' | 'events' | 'clubs' | 'heats' | 'results' | 'settings' | 'clientUploads'>('candidates');
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const tables = [
    { id: 'candidates', label: 'Candidates', count: data.candidates?.length || 0 },
    { id: 'clientUploads', label: 'Client Uploads', count: data.clientUploads?.length || 0 },
    { id: 'events', label: 'Events Master', count: data.events?.length || 0 },
    { id: 'clubs', label: 'Clubs', count: data.clubs?.length || 0 },
    { id: 'heats', label: 'Heats (Hit List)', count: data.heats?.length || 0 },
    { id: 'results', label: 'Results & Rankings', count: data.results?.length || 0 },
    { id: 'settings', label: 'Settings', count: 1 },
  ] as const;

  const currentRecords = useMemo(() => {
    const raw = data[activeTable];
    if (!raw) return [];
    if (!Array.isArray(raw)) return [raw];

    if (!searchTerm.trim()) return raw;

    const term = searchTerm.toLowerCase();
    return raw.filter((item) => JSON.stringify(item).toLowerCase().includes(term));
  }, [data, activeTable, searchTerm]);

  // Copy JSON to clipboard
  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(currentRecords, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export JSON file
  const handleDownloadJson = () => {
    const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentRecords, null, 2));
    const a = document.createElement('a');
    a.href = jsonStr;
    a.download = `eSports_${activeTable}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">
            <Database className="w-4 h-4" />
            <span>Database Explorer &amp; Storage Inspector</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Server Database Schema &amp; Storage
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time inspection of server collections, active records, and JSON serialization.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleRefresh}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Refresh database"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleCopyJson}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
          </button>

          <button
            onClick={handleDownloadJson}
            className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Export Table</span>
          </button>
        </div>
      </div>

      {/* Collection Navigation Tabs */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs">
        <div className="flex flex-wrap gap-1.5">
          {tables.map((t) => {
            const isActive = activeTable === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTable(t.id);
                  setSearchTerm('');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-transparent text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{t.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-blue-800 text-blue-100' : 'bg-slate-100 text-slate-600'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls Bar: Search & Table/JSON View Toggle */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Filter ${activeTable}...`}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-xs font-semibold text-slate-500">
            {currentRecords.length} record(s) matching
          </span>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'table' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Grid View</span>
            </button>
            <button
              onClick={() => setViewMode('json')}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'json' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
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
        <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-inner overflow-hidden">
          <pre className="text-xs font-mono text-emerald-400 overflow-x-auto max-h-[500px] leading-relaxed select-all">
            {JSON.stringify(currentRecords, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          {currentRecords.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No records found in "{activeTable}".
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
                  <tr>
                    {Object.keys(currentRecords[0] || {}).map((col) => (
                      <th key={col} className="py-2.5 px-3 font-bold text-slate-700 uppercase tracking-wider">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {currentRecords.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      {Object.entries(item).map(([k, v], cellIdx) => (
                        <td key={cellIdx} className="py-2.5 px-3 text-slate-800 max-w-xs truncate">
                          {typeof v === 'object' && v !== null
                            ? JSON.stringify(v)
                            : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

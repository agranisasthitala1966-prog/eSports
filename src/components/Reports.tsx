import React, { useState, useMemo, useEffect } from 'react';
import { 
  Candidate, 
  SportEvent, 
  Club, 
  SportsMeetSettings, 
  EventHeat, 
  EventResult
} from '../types';
import { 
  Printer, 
  Users, 
  Building2, 
  FileText, 
  Trophy, 
  Flame, 
  Medal, 
  Receipt, 
  Sparkles
} from 'lucide-react';

interface ReportsProps {
  candidates: Candidate[];
  events: SportEvent[];
  clubs: Club[];
  settings: SportsMeetSettings;
  heats?: EventHeat[];
  results?: EventResult[];
}

export type ReportType = 'chest' | 'club' | 'hit' | 'final' | 'ranking' | 'championship';
export type PaperFormat = 'a4' | 'thermal';

export const Reports: React.FC<ReportsProps> = ({
  candidates = [],
  events = [],
  clubs = [],
  settings,
  heats = [],
  results = [],
}) => {
  // Navigation & format states
  const [reportType, setReportType] = useState<ReportType>('chest');
  const [paperFormat, setPaperFormat] = useState<PaperFormat>('a4');

  // Club selection filter for Club-wise report ('all' or specific club name)
  const [selectedClubFilter, setSelectedClubFilter] = useState<string>('all');

  // Event selection filters for Hit, Final, Ranking reports ('all' or specific event number)
  const [selectedHitEvtNo, setSelectedHitEvtNo] = useState<string>('all');
  const [selectedFinalEvtNo, setSelectedFinalEvtNo] = useState<string>('all');
  const [selectedRankingEvtNo, setSelectedRankingEvtNo] = useState<string>('all');

  // Live formatted timestamp for print footer
  const [currentTimestamp, setCurrentTimestamp] = useState<string>(() => {
    return new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  });

  useEffect(() => {
    const updateTime = () => {
      setCurrentTimestamp(new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Sorted candidates by chest number
  const chestWiseCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
  }, [candidates]);

  // Grouped candidates by club name
  const clubGroupedCandidates = useMemo(() => {
    const groups: Record<string, Candidate[]> = {};
    candidates.forEach((cand) => {
      const clubName = cand.club?.trim() || 'Independent / Unattached';
      if (!groups[clubName]) {
        groups[clubName] = [];
      }
      groups[clubName].push(cand);
    });

    Object.keys(groups).forEach((clubName) => {
      groups[clubName].sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
    });

    return groups;
  }, [candidates]);

  // Registered clubs list + clubs with candidates
  const allAvailableClubNames = useMemo(() => {
    const names = new Set<string>();
    clubs.forEach(c => { if (c.name) names.add(c.name.trim()); });
    candidates.forEach(c => { if (c.club) names.add(c.club.trim()); });
    return Array.from(names).sort();
  }, [clubs, candidates]);

  // Active clubs to display for Club Wise Report
  const displayedClubNames = useMemo(() => {
    if (selectedClubFilter === 'all') {
      return Object.keys(clubGroupedCandidates).sort();
    }
    return Object.keys(clubGroupedCandidates).filter(name => name === selectedClubFilter);
  }, [clubGroupedCandidates, selectedClubFilter]);

  // Events that have heats configured
  const eventsWithHeats = useMemo(() => {
    const evtNosWithHeats = new Set<number>(heats.map(h => Number(h.eventNo)));
    return events.filter(e => evtNosWithHeats.has(Number(e.Evt_No)));
  }, [events, heats]);

  // Events that have finalists configured
  const eventsWithFinalists = useMemo(() => {
    const evtNosWithFinals = new Set<number>(
      results.filter(r => (r.finalists || []).length > 0).map(r => Number(r.eventNo))
    );
    return events.filter(e => evtNosWithFinals.has(Number(e.Evt_No)));
  }, [events, results]);

  // Events that have completed rankings
  const eventsWithRankings = useMemo(() => {
    const evtNosWithRankings = new Set<number>(
      results.filter(r => (r.winners || r.finalists || []).some(f => (f.position || 0) > 0)).map(r => Number(r.eventNo))
    );
    return events.filter(e => evtNosWithRankings.has(Number(e.Evt_No)));
  }, [events, results]);

  // Top 3 clubs calculation for championship (Max 3 Clubs)
  const top3Clubs = useMemo(() => {
    const clubMap: Record<string, { 
      name: string; 
      shortCode?: string; 
      logoUrl?: string; 
      gold: number; 
      silver: number; 
      bronze: number; 
      points: number 
    }> = {};

    clubs.forEach((c) => {
      clubMap[c.name] = { 
        name: c.name, 
        shortCode: c.shortCode, 
        logoUrl: c.logoUrl, 
        gold: 0, 
        silver: 0, 
        bronze: 0, 
        points: 0 
      };
    });

    candidates.forEach((c) => {
      if (c.club && !clubMap[c.club]) {
        clubMap[c.club] = { 
          name: c.club, 
          shortCode: c.club.slice(0, 4).toUpperCase(), 
          logoUrl: '/icon.png', 
          gold: 0, 
          silver: 0, 
          bronze: 0, 
          points: 0 
        };
      }
    });

    results.forEach((res) => {
      const participants = res.winners && res.winners.length > 0 ? res.winners : (res.finalists || []);
      participants.forEach((f) => {
        if (!f.club) return;
        if (!clubMap[f.club]) {
          clubMap[f.club] = { 
            name: f.club, 
            shortCode: f.club.slice(0, 4).toUpperCase(), 
            logoUrl: '/icon.png', 
            gold: 0, 
            silver: 0, 
            bronze: 0, 
            points: 0 
          };
        }
        if (f.position === 1) {
          clubMap[f.club].gold += 1;
          clubMap[f.club].points += 7;
        } else if (f.position === 2) {
          clubMap[f.club].silver += 1;
          clubMap[f.club].points += 5;
        } else if (f.position === 3) {
          clubMap[f.club].bronze += 1;
          clubMap[f.club].points += 4;
        } else if (f.position === 4) {
          clubMap[f.club].points += 3;
        } else if (f.position === 5) {
          clubMap[f.club].points += 2;
        } else if (f.position === 6) {
          clubMap[f.club].points += 1;
        }
      });
    });

    const sorted = Object.values(clubMap)
      .filter((c) => c.points > 0 || c.gold > 0 || c.silver > 0 || c.bronze > 0)
      .sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);

    if (sorted.length === 0) {
      return clubs.slice(0, 3).map(c => ({
        name: c.name,
        shortCode: c.shortCode,
        logoUrl: c.logoUrl,
        gold: 0,
        silver: 0,
        bronze: 0,
        points: 0
      }));
    }

    return sorted.slice(0, 3); // Strictly Max 3 clubs
  }, [results, clubs, candidates]);

  // Helper to find club info
  const getClubInfo = (clubName: string) => {
    return clubs.find(c => c.name.toLowerCase() === clubName.toLowerCase());
  };

  // Helper to get club logo in B&W for thermal printer header
  const getThermalClubLogo = (clubName?: string) => {
    if (clubName) {
      const c = getClubInfo(clubName);
      if (c?.logoUrl) return c.logoUrl;
    }
    const organizerClub = clubs.find(c => c.name.toLowerCase().includes(settings.organizer?.toLowerCase() || ''));
    if (organizerClub?.logoUrl) return organizerClub.logoUrl;
    return '/icon.png';
  };

  // Helper to get organizer club name for thermal header
  const getThermalClubName = (clubName?: string) => {
    if (clubName && clubName !== 'all') return clubName;
    return settings.registeredClubName || settings.organizer || 'Agrani Sasthitala Sangha';
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Dynamic Print Stylesheet for exact Paper Format targeting */}
      <style>{`
        @media print {
          ${paperFormat === 'thermal' ? `
            @page {
              size: 58mm auto !important;
              margin: 0 !important;
            }
            html, body {
              width: 58mm !important;
              min-width: 58mm !important;
              max-width: 58mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-hidden-element {
              display: none !important;
            }
            .thermal-printable-wrapper {
              width: 48mm !important;
              max-width: 48mm !important;
              margin: 0 auto !important;
              padding: 1mm 0 4mm 0 !important;
              color: #000000 !important;
              background: #ffffff !important;
              font-size: 10px !important;
              line-height: 1.2 !important;
            }
            .thermal-printable-wrapper * {
              color: #000000 !important;
              border-color: #000000 !important;
              background-color: transparent !important;
              box-shadow: none !important;
              text-shadow: none !important;
            }
            .thermal-printable-wrapper img {
              filter: grayscale(100%) contrast(200%) !important;
              -webkit-filter: grayscale(100%) contrast(200%) !important;
            }
            .a4-printable-wrapper {
              display: none !important;
            }
          ` : `
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
            .print-hidden-element {
              display: none !important;
            }
            .a4-printable-wrapper {
              display: block !important;
              width: 100% !important;
              max-width: 100% !important;
              padding: 0 !important;
              margin: 0 !important;
              background: #ffffff !important;
              border: none !important;
              outline: none !important;
              box-shadow: none !important;
            }
            .thermal-printable-wrapper {
              display: none !important;
            }
          `}
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* ================= CONTROLS & CONFIGURATION PANEL ================= */}
      <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200 shadow-xs space-y-2.5 print-hidden-element">
        
        {/* Same-line: Title Label + Format Switcher ("Normal" & "Thermal") + Single "Print" Button */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-600 shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Reports &amp; Registers
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Format Switcher: "Normal" & "Thermal" */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setPaperFormat('a4')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  paperFormat === 'a4'
                    ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Normal Plain A4 Paper"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Normal</span>
              </button>
              
              <button
                type="button"
                onClick={() => setPaperFormat('thermal')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  paperFormat === 'thermal'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Thermal (2-inch Roll)"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Thermal</span>
              </button>
            </div>

            {/* Single Print Button (Prints according to selected option: Normal or Thermal) */}
            <button
              type="button"
              id="btn-execute-report-print"
              onClick={handlePrint}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-98 cursor-pointer ${
                paperFormat === 'thermal'
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title={`Print (${paperFormat === 'thermal' ? 'Thermal 2" Roll' : 'Normal Plain A4 Paper'})`}
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* 6 Report Types Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
          
          {/* 1. Candidate List */}
          <button
            type="button"
            onClick={() => setReportType('chest')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              reportType === 'chest'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Candidate List</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/10">
              {candidates.length}
            </span>
          </button>

          {/* 2. Club Wise Candidate List */}
          <button
            type="button"
            onClick={() => setReportType('club')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              reportType === 'club'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Club Wise Candidate List</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/10">
              {allAvailableClubNames.length}
            </span>
          </button>

          {/* 3. Hit List */}
          <button
            type="button"
            onClick={() => setReportType('hit')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              reportType === 'hit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Hit List</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/10">
              {heats.length}
            </span>
          </button>

          {/* 4. Final List */}
          <button
            type="button"
            onClick={() => setReportType('final')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              reportType === 'final'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Medal className="w-3.5 h-3.5" />
            <span>Final List</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/10">
              {eventsWithFinalists.length}
            </span>
          </button>

          {/* 5. Ranking Sheet */}
          <button
            type="button"
            onClick={() => setReportType('ranking')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              reportType === 'ranking'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Ranking Sheet</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/10">
              {eventsWithRankings.length}
            </span>
          </button>

          {/* 6. Club Championship (Max 3 Clubs) */}
          <button
            type="button"
            onClick={() => setReportType('championship')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              reportType === 'championship'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Club Championship (Top 3)</span>
          </button>
        </div>

        {/* ================= SECONDARY FILTERS & OPTIONS (Compact single row) ================= */}
        {(reportType === 'club' || reportType === 'hit' || reportType === 'final' || reportType === 'ranking') && (
          <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            
            {/* Sub-option 1: Club Wise filter */}
            {reportType === 'club' && (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Select Club:</span>
                </label>
                <select
                  value={selectedClubFilter}
                  onChange={(e) => setSelectedClubFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="all">★ All Registered Clubs (Print with Subtotals)</option>
                  {allAvailableClubNames.map((cName) => {
                    const count = clubGroupedCandidates[cName]?.length || 0;
                    return (
                      <option key={cName} value={cName}>
                        {cName} ({count} Athletes)
                      </option>
                    );
                  })}
                </select>
                
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  {selectedClubFilter === 'all' 
                    ? 'All clubs with subtotals' 
                    : `Only: ${selectedClubFilter}`}
                </span>
              </div>
            )}

            {/* Sub-option 2: Hit List event filter */}
            {reportType === 'hit' && (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-600" />
                  <span>Select Event Heats:</span>
                </label>
                <select
                  value={selectedHitEvtNo}
                  onChange={(e) => setSelectedHitEvtNo(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="all">★ All Events with Scheduled Heats</option>
                  {eventsWithHeats.map((ev) => (
                    <option key={ev.Evt_No} value={String(ev.Evt_No)}>
                      Event #{ev.Evt_No}: {ev.Evt_Name} ({ev.Gender} - {ev.Height})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sub-option 3: Final List event filter */}
            {reportType === 'final' && (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1">
                  <Medal className="w-3.5 h-3.5 text-blue-600" />
                  <span>Select Final Event:</span>
                </label>
                <select
                  value={selectedFinalEvtNo}
                  onChange={(e) => setSelectedFinalEvtNo(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="all">★ All Events with Finalists</option>
                  {eventsWithFinalists.map((ev) => (
                    <option key={ev.Evt_No} value={String(ev.Evt_No)}>
                      Event #{ev.Evt_No}: {ev.Evt_Name} ({ev.Gender} - {ev.Height})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sub-option 4: Ranking Sheet event filter */}
            {reportType === 'ranking' && (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-600" />
                  <span>Select Ranking Event:</span>
                </label>
                <select
                  value={selectedRankingEvtNo}
                  onChange={(e) => setSelectedRankingEvtNo(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="all">★ All Completed Event Rankings</option>
                  {eventsWithRankings.map((ev) => (
                    <option key={ev.Evt_No} value={String(ev.Evt_No)}>
                      Event #{ev.Evt_No}: {ev.Evt_Name} ({ev.Gender} - {ev.Height})
                    </option>
                  ))}
                </select>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ======================= RENDER DISPATCHER ============================== */}
      {/* ========================================================================= */}

      {paperFormat === 'thermal' ? (
        /* ================= THERMAL PRINTER 2-INCH ROLL PAPER VIEW (SAMPLE RECEIPT PREVIEW) ================= */
        <div className="flex justify-center p-4 sm:p-8 bg-[#cbd5e1] rounded-2xl border border-slate-300 print:bg-white print:p-0 print:border-none">
          <div 
            className="thermal-printable-wrapper w-full max-w-[320px] bg-white text-black p-4 shadow-[0_10px_35px_rgba(0,0,0,0.22)] rounded-xs font-mono text-[10px] leading-tight print:shadow-none print:p-0 print:max-w-[48mm] print:w-[48mm]"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
            }}
          >
            {renderThermalReport()}
          </div>
        </div>
      ) : (
        /* ================= PLAIN A4 PAPER VIEW (NO OUTLINE, BORDER, BACKGROUND GRAPHICS) ================= */
        <div className="a4-printable-wrapper bg-white max-w-[210mm] mx-auto p-4 sm:p-8 border-0 outline-none shadow-none rounded-none text-slate-900 print:p-0 print:max-w-none">
          {renderA4Report()}
        </div>
      )}

    </div>
  );

  // =========================================================================
  // ====================== THERMAL PRINTER RENDERING ========================
  // =========================================================================
  function renderThermalReport() {
    switch (reportType) {
      case 'chest':
        return renderThermalCandidateList();
      case 'club':
        return renderThermalClubWise();
      case 'hit':
        return renderThermalHitList();
      case 'final':
        return renderThermalFinalList();
      case 'ranking':
        return renderThermalRankingSheet();
      case 'championship':
        return renderThermalChampionship();
      default:
        return null;
    }
  }

  // Header: Place club logo at left of two lines (registered club name, next line ordinal number)
  function renderThermalHeader(specificClubName?: string) {
    const clubDisplayName = getThermalClubName(specificClubName);
    const clubLogo = getThermalClubLogo(specificClubName);

    return (
      <div className="text-center pb-1 mb-1 border-b border-dashed border-black">
        <div className="flex items-center justify-center gap-2 leading-tight">
          <img 
            src={clubLogo} 
            alt="Club Logo" 
            className="w-5 h-5 shrink-0 object-contain filter grayscale contrast-200"
            style={{ filter: 'grayscale(100%) contrast(200%)' }}
          />
          <div className="text-left leading-tight">
            <div className="font-bold text-[10.5px] uppercase tracking-tight text-black truncate max-w-[42mm]">
              {clubDisplayName}
            </div>
            <div className="text-[9px] font-semibold text-black leading-tight mt-0.5">
              {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Footer: Place app logo and app name in ONE LINE, minimum height possible
  function renderThermalFooter() {
    return (
      <div className="text-center pt-1 mt-1 border-t border-dashed border-black text-black">
        {/* App logo and app name in ONE LINE */}
        <div className="flex items-center justify-center gap-1 leading-none">
          <img 
            src="/icon.png" 
            alt="eSports Logo" 
            className="w-3.5 h-3.5 shrink-0 object-contain filter grayscale contrast-200"
            style={{ filter: 'grayscale(100%) contrast(200%)' }}
          />
          <span className="font-bold text-[8.5px] uppercase tracking-tight text-black">
            eSports (A Sports Management System)
          </span>
        </div>
        {/* Date & time stamp */}
        <div className="text-[8px] text-black leading-none mt-0.5">
          {currentTimestamp}
        </div>
      </div>
    );
  }

  // 1. Thermal Candidate List
  function renderThermalCandidateList() {
    return (
      <div>
        {renderThermalHeader()}

        <div className="text-center font-bold uppercase text-[10px] mb-1 tracking-wider leading-none">
          --- CANDIDATE LIST ---
        </div>

        {/* Minimal important info columns */}
        <div className="border-b border-black pb-0.5 mb-1 font-bold flex justify-between text-[9px] leading-tight">
          <span className="w-7">CH#</span>
          <span className="flex-1 text-left">NAME</span>
          <span className="w-10 text-center">EVTS</span>
          <span className="w-9 text-right">FEE</span>
        </div>

        <div className="space-y-0.5">
          {chestWiseCandidates.map((c) => (
            <div key={c.id} className="flex justify-between items-start text-[9.5px] leading-tight">
              <span className="w-7 font-bold">#{c.chestNo}</span>
              <span className="flex-1 text-left truncate pr-1">
                {c.name.slice(0, 14)}
              </span>
              <span className="w-10 text-center text-[8.5px]">
                {(c.selectedEvents || []).map(Number).sort((a,b)=>a-b).join(',')}
              </span>
              <span className="w-9 text-right font-bold">
                {settings.currencySymbol || '₹'}{Number(c.totalFees || 0).toFixed(0)}
              </span>
            </div>
          ))}
        </div>

        {/* Total Summary */}
        <div className="mt-1 pt-0.5 border-t border-dashed border-black text-[9.5px] flex justify-between font-bold leading-tight">
          <span>Total: {chestWiseCandidates.length}</span>
          <span>
            {settings.currencySymbol || '₹'}
            {chestWiseCandidates.reduce((s, c) => s + (Number(c.totalFees) || 0), 0).toFixed(0)}
          </span>
        </div>

        {renderThermalFooter()}
      </div>
    );
  }

  // 2. Thermal Club Wise Candidate List with Subtotal (One by One or All)
  function renderThermalClubWise() {
    return (
      <div className="space-y-2">
        {displayedClubNames.map((clubName) => {
          const athletes = clubGroupedCandidates[clubName] || [];
          const clubTotalFees = athletes.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0);
          const clubTotalPaid = athletes.reduce((sum, c) => {
            const st = (c.feeStatus || 'Paid').toUpperCase();
            if (!st.includes('UNPAID') && !st.includes('DUE') && !st.includes('EXEMPT') && !st.includes('FREE')) {
              return sum + (Number(c.totalFees) || 0);
            }
            return sum;
          }, 0);
          const clubTotalDue = athletes.reduce((sum, c) => {
            const st = (c.feeStatus || 'Paid').toUpperCase();
            if (st.includes('UNPAID') || st.includes('DUE')) {
              return sum + (Number(c.totalFees) || 0);
            }
            return sum;
          }, 0);

          return (
            <div key={clubName} className="avoid-break pb-1 border-b border-black last:border-b-0">
              {renderThermalHeader(clubName)}

              <div className="text-center font-bold uppercase text-[9.5px] mb-1 tracking-wider leading-none">
                CLUB ENTRY REGISTER
              </div>

              {/* Minimal important info columns */}
              <div className="border-b border-black pb-0.5 mb-1 font-bold flex justify-between text-[9px] leading-tight">
                <span className="w-7">CH#</span>
                <span className="flex-1 text-left">NAME</span>
                <span className="w-10 text-center">EVTS</span>
                <span className="w-9 text-right">FEE</span>
              </div>

              <div className="space-y-0.5">
                {athletes.map((c) => (
                  <div key={c.id} className="flex justify-between items-start text-[9.5px] leading-tight">
                    <span className="w-7 font-bold">#{c.chestNo}</span>
                    <span className="flex-1 text-left truncate pr-1">
                      {c.name.slice(0, 14)}
                    </span>
                    <span className="w-10 text-center text-[8.5px]">
                      {(c.selectedEvents || []).map(Number).sort((a,b)=>a-b).join(',')}
                    </span>
                    <span className="w-9 text-right font-bold">
                      {settings.currencySymbol || '₹'}{Number(c.totalFees || 0).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Subtotal Section */}
              <div className="mt-1 pt-0.5 border-t border-dashed border-black text-[9px] space-y-0.5 leading-tight">
                <div className="flex justify-between">
                  <span>Enrolled: {athletes.length}</span>
                  <span>Total: {settings.currencySymbol || '₹'}{clubTotalFees.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid: {settings.currencySymbol || '₹'}{clubTotalPaid.toFixed(0)}</span>
                  <span className="font-bold">DUE: {settings.currencySymbol || '₹'}{clubTotalDue.toFixed(0)}</span>
                </div>
                <div className="flex justify-between font-bold pt-0.5 border-t border-black text-[9.5px]">
                  <span>SUB TOTAL (DUE):</span>
                  <span>{settings.currencySymbol || '₹'}{clubTotalDue.toFixed(0)}</span>
                </div>
              </div>

              {renderThermalFooter()}
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Thermal Hit List (Heats)
  function renderThermalHitList() {
    const eventsToRender = selectedHitEvtNo === 'all' 
      ? eventsWithHeats 
      : events.filter(e => String(e.Evt_No) === selectedHitEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="text-center py-4">
          {renderThermalHeader()}
          <p className="font-bold my-2 text-[10px]">NO HEATS AVAILABLE</p>
          {renderThermalFooter()}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {eventsToRender.map((evt) => {
          const evtHeats = heats.filter(h => Number(h.eventNo) === Number(evt.Evt_No));

          return (
            <div key={evt.Evt_No} className="avoid-break pb-1 border-b border-black last:border-b-0">
              {renderThermalHeader()}

              <div className="text-center mb-1 leading-tight">
                <div className="font-bold text-[10px] uppercase">
                  HIT LIST: EVT #{evt.Evt_No}
                </div>
                <div className="text-[9px]">
                  {evt.Evt_Name} ({evt.Gender} • {evt.Height})
                </div>
              </div>

              {evtHeats.length === 0 ? (
                <div className="text-center py-1 text-[9px]">No heats scheduled yet</div>
              ) : (
                evtHeats.map((heat) => (
                  <div key={heat.id} className="mt-1 pt-0.5 border-t border-dashed border-black">
                    <div className="font-bold text-[9px] mb-0.5">
                      --- HEAT {heat.heatNumber} ---
                    </div>

                    <div className="border-b border-black pb-0.5 mb-0.5 font-bold flex justify-between text-[8.5px]">
                      <span className="w-5">LN</span>
                      <span className="w-7">CH#</span>
                      <span className="flex-1 text-left">NAME</span>
                      <span className="w-9 text-right">CLUB</span>
                    </div>

                    <div className="space-y-0.5">
                      {(heat.participants || []).map((p) => {
                        const club = getClubInfo(p.club || '');
                        const shortClub = club?.shortCode || (p.club ? p.club.slice(0, 4).toUpperCase() : '-');
                        return (
                          <div key={p.chestNo} className="flex justify-between items-center text-[9px] leading-tight">
                            <span className="w-5 font-bold">{p.lane || '-'}</span>
                            <span className="w-7 font-bold">#{p.chestNo}</span>
                            <span className="flex-1 text-left truncate pr-1">
                              {p.candidateName.slice(0, 13)}
                            </span>
                            <span className="w-9 text-right text-[8px] truncate">
                              {shortClub}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {renderThermalFooter()}
            </div>
          );
        })}
      </div>
    );
  }

  // 4. Thermal Final List
  function renderThermalFinalList() {
    const eventsToRender = selectedFinalEvtNo === 'all'
      ? eventsWithFinalists
      : events.filter(e => String(e.Evt_No) === selectedFinalEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="text-center py-4">
          {renderThermalHeader()}
          <p className="font-bold my-2 text-[10px]">NO FINAL LISTS PREPARED YET</p>
          {renderThermalFooter()}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {eventsToRender.map((evt) => {
          const res = results.find(r => Number(r.eventNo) === Number(evt.Evt_No));
          const finalists = res?.finalists || [];

          return (
            <div key={evt.Evt_No} className="avoid-break pb-1 border-b border-black last:border-b-0">
              {renderThermalHeader()}

              <div className="text-center mb-1 leading-tight">
                <div className="font-bold text-[10px] uppercase">
                  FINAL LIST: EVT #{evt.Evt_No}
                </div>
                <div className="text-[9px]">
                  {evt.Evt_Name} ({evt.Gender} • {evt.Height})
                </div>
              </div>

              <div className="border-b border-black pb-0.5 mb-0.5 font-bold flex justify-between text-[8.5px]">
                <span className="w-5">LN</span>
                <span className="w-7">CH#</span>
                <span className="flex-1 text-left">NAME</span>
                <span className="w-9 text-right">CLUB</span>
              </div>

              <div className="space-y-0.5">
                {finalists.map((f, idx) => {
                  const club = getClubInfo(f.club || '');
                  const shortClub = club?.shortCode || (f.club ? f.club.slice(0, 4).toUpperCase() : '-');
                  return (
                    <div key={f.chestNo} className="flex justify-between items-center text-[9px] leading-tight">
                      <span className="w-5 font-bold">{f.lane || idx + 1}</span>
                      <span className="w-7 font-bold">#{f.chestNo}</span>
                      <span className="flex-1 text-left truncate pr-1">
                        {f.candidateName.slice(0, 13)}
                      </span>
                      <span className="w-9 text-right text-[8px] truncate">
                        {shortClub}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-1 pt-0.5 border-t border-dashed border-black text-[9px] flex justify-between font-bold leading-tight">
                <span>Finalists: {finalists.length}</span>
                <span>CHAMPIONSHIP</span>
              </div>

              {renderThermalFooter()}
            </div>
          );
        })}
      </div>
    );
  }

  // 5. Thermal Ranking Sheet (Results & Points)
  function renderThermalRankingSheet() {
    const eventsToRender = selectedRankingEvtNo === 'all'
      ? eventsWithRankings
      : events.filter(e => String(e.Evt_No) === selectedRankingEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="text-center py-4">
          {renderThermalHeader()}
          <p className="font-bold my-2 text-[10px]">NO RANKINGS RECORDED YET</p>
          {renderThermalFooter()}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {eventsToRender.map((evt) => {
          const res = results.find(r => Number(r.eventNo) === Number(evt.Evt_No));
          const ranked = (res?.winners && res.winners.length > 0 ? res.winners : (res?.finalists || []))
            .filter(f => (f.position || 0) > 0)
            .sort((a, b) => (a.position || 0) - (b.position || 0));

          return (
            <div key={evt.Evt_No} className="avoid-break pb-1 border-b border-black last:border-b-0">
              {renderThermalHeader()}

              <div className="text-center mb-1 leading-tight">
                <div className="font-bold text-[10px] uppercase">
                  RANKING SHEET: EVT #{evt.Evt_No}
                </div>
                <div className="text-[9px]">
                  {evt.Evt_Name} ({evt.Gender} • {evt.Height})
                </div>
              </div>

              <div className="border-b border-black pb-0.5 mb-0.5 font-bold flex justify-between text-[8.5px]">
                <span className="w-6">POS</span>
                <span className="w-7">CH#</span>
                <span className="flex-1 text-left">NAME</span>
                <span className="w-6 text-center">PTS</span>
                <span className="w-9 text-right">PERF</span>
              </div>

              <div className="space-y-0.5">
                {ranked.map((r) => {
                  const pts = r.position === 1 ? 7 : r.position === 2 ? 5 : r.position === 3 ? 4 : r.position === 4 ? 3 : r.position === 5 ? 2 : r.position === 6 ? 1 : 0;
                  const posLabel = r.position === 1 ? '1ST' : r.position === 2 ? '2ND' : r.position === 3 ? '3RD' : `${r.position}TH`;
                  return (
                    <div key={r.chestNo} className="flex justify-between items-center text-[9px] leading-tight">
                      <span className="w-6 font-bold">{posLabel}</span>
                      <span className="w-7">#{r.chestNo}</span>
                      <span className="flex-1 text-left truncate pr-1">
                        {r.candidateName.slice(0, 11)}
                      </span>
                      <span className="w-6 text-center font-bold">{pts}</span>
                      <span className="w-9 text-right font-mono text-[8px]">
                        {r.jumpRecord || r.resultValue || '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {res?.highestRecord?.isRecordBroken && (
                <div className="mt-1 pt-0.5 border-t border-dashed border-black text-[8.5px] font-bold text-center leading-tight">
                  * RECORD: {res.highestRecord.recordValue} ({res.highestRecord.candidateName}) *
                </div>
              )}

              {renderThermalFooter()}
            </div>
          );
        })}
      </div>
    );
  }

  // 6. Thermal Club Championship Points (Max 3 Clubs)
  function renderThermalChampionship() {
    return (
      <div>
        {renderThermalHeader()}

        <div className="text-center mb-1 leading-tight">
          <div className="font-bold text-[10px] uppercase tracking-wider">
            TOP 3 CLUB CHAMPIONSHIP
          </div>
          <div className="text-[8.5px]">
            OFFICIAL TEAM STANDINGS
          </div>
        </div>

        {/* Minimal important info columns */}
        <div className="border-b border-black pb-0.5 mb-0.5 font-bold flex justify-between text-[8.5px]">
          <span className="w-5">RK</span>
          <span className="flex-1 text-left">CLUB</span>
          <span className="w-4 text-center">G</span>
          <span className="w-4 text-center">S</span>
          <span className="w-4 text-center">B</span>
          <span className="w-7 text-right">PTS</span>
        </div>

        <div className="space-y-0.5">
          {top3Clubs.map((team, idx) => {
            const rankLabel = idx === 0 ? '1ST' : idx === 1 ? '2ND' : '3RD';
            return (
              <div key={team.name} className="flex justify-between items-center text-[9.5px] leading-tight">
                <span className="w-5 font-bold">{rankLabel}</span>
                <span className="flex-1 text-left truncate font-bold pr-1">
                  {team.shortCode || team.name.slice(0, 10)}
                </span>
                <span className="w-4 text-center">{team.gold}</span>
                <span className="w-4 text-center">{team.silver}</span>
                <span className="w-4 text-center">{team.bronze}</span>
                <span className="w-7 text-right font-black">
                  {team.points}
                </span>
              </div>
            );
          })}
        </div>

        {top3Clubs.length > 0 && (
          <div className="mt-1 pt-0.5 border-t border-dashed border-black text-center leading-tight">
            <div className="font-bold text-[9.5px] uppercase">
              CHAMPION: {top3Clubs[0]?.name}
            </div>
          </div>
        )}

        {renderThermalFooter()}
      </div>
    );
  }

  // =========================================================================
  // =================== PLAIN A4 RENDERING (NO OUTLINE/GRAPHICS) =============
  // =========================================================================
  function renderA4Report() {
    switch (reportType) {
      case 'chest':
        return renderA4CandidateList();
      case 'club':
        return renderA4ClubWise();
      case 'hit':
        return renderA4HitList();
      case 'final':
        return renderA4FinalList();
      case 'ranking':
        return renderA4RankingSheet();
      case 'championship':
        return renderA4Championship();
      default:
        return null;
    }
  }

  // Common Official Plain A4 Header (No outlines, no borders, no background graphics)
  function renderA4Header(reportTitle: string, subtitle?: string, specificClubName?: string) {
    const clubDisplayName = specificClubName || settings.registeredClubName || settings.organizer || 'Agrani Sasthitala Sangha';
    const clubInfo = specificClubName ? getClubInfo(specificClubName) : null;
    const logoSrc = settings.registeredClubLogo || clubInfo?.logoUrl || '/icon.png';

    return (
      <div className="text-center pb-4 mb-4 border-b border-black">
        <div className="flex items-center justify-center gap-3.5 mb-1">
          <img 
            src={logoSrc} 
            alt="Club Logo" 
            className="w-11 h-11 object-contain shrink-0" 
          />
          <div className="text-left">
            <h1 className="text-lg sm:text-xl font-bold text-black tracking-tight uppercase leading-tight">
              {clubDisplayName}
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-black uppercase tracking-wide leading-tight mt-0.5">
              {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 text-xs text-black mt-2 font-medium">
          {settings.venue && <span>Venue: {settings.venue}</span>}
          {settings.venue && settings.dates && <span>•</span>}
          {settings.dates && <span>Dates: {settings.dates}</span>}
          <span>•</span>
          <span className="font-bold uppercase tracking-wider text-black">
            {reportTitle}
          </span>
        </div>

        {subtitle && (
          <p className="text-xs font-bold text-black mt-1 uppercase tracking-wide">
            {subtitle}
          </p>
        )}
      </div>
    );
  }

  // 1. Plain A4 Candidate List
  function renderA4CandidateList() {
    return (
      <div className="bg-white p-0 border-0 outline-none shadow-none text-black">
        {renderA4Header('CHEST NUMBER WISE REGISTRATION REPORT')}

        <table className="w-full text-left text-xs border-collapse border border-black">
          <thead>
            <tr className="border-b-2 border-black font-bold uppercase text-black">
              <th className="border border-black py-2 px-2.5 w-14 text-center">Chest #</th>
              <th className="border border-black py-2 px-2.5">Athlete Name</th>
              <th className="border border-black py-2 px-2.5">Club Name</th>
              <th className="border border-black py-2 px-2 text-center w-20">Category</th>
              <th className="border border-black py-2 px-2 text-center w-16">Height</th>
              <th className="border border-black py-2 px-2.5 w-24">Events</th>
              <th className="border border-black py-2 px-2 text-right w-16">Fees</th>
              <th className="border border-black py-2 px-2.5 w-20 text-center">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {chestWiseCandidates.map((cand) => (
              <tr key={cand.id} className="bg-white">
                <td className="border border-black py-1.5 px-2 text-center font-mono font-bold text-black text-xs">
                  #{cand.chestNo}
                </td>
                <td className="border border-black py-1.5 px-2 font-bold text-black">
                  {cand.name}
                </td>
                <td className="border border-black py-1.5 px-2 text-black">
                  {cand.club || 'Independent'}
                </td>
                <td className="border border-black py-1.5 px-2 text-center text-black">
                  {cand.gender}
                </td>
                <td className="border border-black py-1.5 px-2 text-center font-mono text-black">
                  {cand.height}
                </td>
                <td className="border border-black py-1.5 px-2 font-mono font-bold text-black text-xs">
                  {(cand.selectedEvents || []).map(Number).sort((a, b) => a - b).join(', ') || '—'}
                </td>
                <td className="border border-black py-1.5 px-2 text-right font-mono font-bold text-black">
                  {settings.currencySymbol || '₹'}{Number(cand.totalFees).toFixed(2)}
                </td>
                <td className="border border-black py-1.5 px-2 text-center h-7">
                  {/* Blank space for official manual verification remarks */}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-bold">
              <td colSpan={5} className="border border-black py-2 px-2.5 text-right uppercase text-black font-bold">
                Total Enrolled Candidates: {chestWiseCandidates.length}
              </td>
              <td className="border border-black py-2 px-2 text-right uppercase font-bold text-black">
                Total Fees:
              </td>
              <td className="border border-black py-2 px-2 text-right font-mono font-bold text-black">
                {settings.currencySymbol || '₹'}
                {chestWiseCandidates.reduce((s, c) => s + (Number(c.totalFees) || 0), 0).toFixed(2)}
              </td>
              <td className="border border-black py-2 px-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  // 2. Plain A4 Club Wise Candidate List with Subtotal (One by One or All)
  function renderA4ClubWise() {
    return (
      <div className="space-y-6 print:space-y-6 bg-white p-0 border-0 outline-none shadow-none text-black">
        {displayedClubNames.map((clubName) => {
          const clubInfo = getClubInfo(clubName);
          const athletes = clubGroupedCandidates[clubName] || [];
          const clubTotalFees = athletes.reduce((sum, c) => sum + (Number(c.totalFees) || 0), 0);
          const clubTotalDue = athletes.reduce((sum, c) => {
            const st = (c.feeStatus || 'Paid').toUpperCase();
            if (st.includes('UNPAID') || st.includes('DUE')) {
              return sum + (Number(c.totalFees) || 0);
            }
            return sum;
          }, 0);
          const clubTotalPaid = athletes.reduce((sum, c) => {
            const st = (c.feeStatus || 'Paid').toUpperCase();
            if (!st.includes('UNPAID') && !st.includes('DUE') && !st.includes('EXEMPT') && !st.includes('FREE')) {
              return sum + (Number(c.totalFees) || 0);
            }
            return sum;
          }, 0);

          return (
            <div
              key={clubName}
              className="bg-white border-0 outline-none shadow-none p-0 mb-6 avoid-break"
              style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              {/* Header for this Club */}
              <div className="border-b border-black pb-2 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img 
                      src={clubInfo?.logoUrl || '/icon.png'} 
                      alt="Club Logo" 
                      className="w-8 h-8 object-contain" 
                    />
                    <div>
                      <p className="text-[10px] uppercase font-bold text-black tracking-wider">
                        {settings.ordinalTitle} • OFFICIAL CLUB REGISTER
                      </p>
                      <h2 className="text-base font-bold text-black uppercase tracking-tight">
                        {clubName}
                      </h2>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-mono font-bold text-black">
                      {athletes.length} Athlete(s) Enrolled
                    </p>
                  </div>
                </div>
              </div>

              {/* Athletes Table */}
              <table className="w-full text-left text-xs border-collapse border border-black">
                <thead>
                  <tr className="border-b-2 border-black font-bold uppercase text-black">
                    <th className="border border-black py-2 px-2.5 w-14 text-center">Chest #</th>
                    <th className="border border-black py-2 px-2.5">Athlete Name</th>
                    <th className="border border-black py-2 px-2 text-center w-20">Gender</th>
                    <th className="border border-black py-2 px-2 text-center w-16">Height</th>
                    <th className="border border-black py-2 px-2.5 w-24">Events</th>
                    <th className="border border-black py-2 px-2 text-right w-16">Fees</th>
                    <th className="border border-black py-2 px-2.5 w-20 text-center">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {athletes.map((cand) => (
                    <tr key={cand.id} className="bg-white">
                      <td className="border border-black py-1.5 px-2 text-center font-mono font-bold text-black">
                        #{cand.chestNo}
                      </td>
                      <td className="border border-black py-1.5 px-2 font-bold text-black">
                        {cand.name}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-center text-black">
                        {cand.gender}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-center font-mono text-black">
                        {cand.height}
                      </td>
                      <td className="border border-black py-1.5 px-2 font-mono font-bold text-black text-xs">
                        {(cand.selectedEvents || []).map(Number).sort((a, b) => a - b).join(', ') || '—'}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-right font-mono font-bold text-black">
                        {settings.currencySymbol || '₹'}{Number(cand.totalFees).toFixed(2)}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-center h-7">
                        {/* Remarks */}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black font-bold text-black">
                    <td colSpan={4} className="border border-black py-1.5 px-2 text-right uppercase tracking-wider text-[11px] font-bold">
                      Sub Total ({athletes.length} Athletes):
                    </td>
                    <td className="border border-black py-1.5 px-2 text-right text-[11px] font-bold">
                      Total Fees:
                    </td>
                    <td className="border border-black py-1.5 px-2 text-right font-mono font-bold text-xs">
                      {settings.currencySymbol || '₹'}{clubTotalFees.toFixed(2)}
                    </td>
                    <td className="border border-black py-1.5 px-2 text-center text-xs font-mono font-bold">
                      Due: {settings.currencySymbol || '₹'}{clubTotalDue.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Clean Plain Subtotal Summary Line */}
              <div className="mt-2 pt-1 border-t border-black flex flex-wrap items-center justify-between text-xs text-black font-medium">
                <div>
                  Enrolled: <strong>{athletes.length}</strong> | Total Fees: <strong>{settings.currencySymbol || '₹'}{clubTotalFees.toFixed(2)}</strong> | Paid: <strong>{settings.currencySymbol || '₹'}{clubTotalPaid.toFixed(2)}</strong>
                </div>
                <div className="font-bold">
                  SUB TOTAL (AMOUNT DUE): {settings.currencySymbol || '₹'}{clubTotalDue.toFixed(2)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Plain A4 Hit List (Heats)
  function renderA4HitList() {
    const eventsToRender = selectedHitEvtNo === 'all'
      ? eventsWithHeats
      : events.filter(e => String(e.Evt_No) === selectedHitEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="bg-white p-6 border-0 outline-none text-center text-black">
          <p className="font-bold">No scheduled event heats found.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6 bg-white p-0 border-0 outline-none shadow-none text-black">
        {eventsToRender.map((evt) => {
          const evtHeats = heats.filter(h => Number(h.eventNo) === Number(evt.Evt_No));

          return (
            <div 
              key={evt.Evt_No} 
              className="bg-white p-0 border-0 outline-none shadow-none avoid-break mb-6"
              style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              {renderA4Header(
                `OFFICIAL HIT LIST • EVENT #${evt.Evt_No}`,
                `${evt.Evt_Name} • ${evt.Gender} • HEIGHT: ${evt.Height}`
              )}

              <div className="space-y-4">
                {evtHeats.map((heat) => (
                  <div key={heat.id}>
                    <div className="border-b border-black pb-1 mb-1 font-bold uppercase text-xs text-black flex justify-between">
                      <span>HEAT {heat.heatNumber}</span>
                      <span className="font-mono font-bold">
                        {heat.participants?.length || 0} Runners
                      </span>
                    </div>

                    <table className="w-full text-left text-xs border-collapse border border-black">
                      <thead>
                        <tr className="border-b border-black font-bold uppercase text-black">
                          <th className="border border-black py-1.5 px-2.5 w-12 text-center">Lane</th>
                          <th className="border border-black py-1.5 px-2.5 w-16 text-center">Chest #</th>
                          <th className="border border-black py-1.5 px-2.5">Athlete Name</th>
                          <th className="border border-black py-1.5 px-2.5">Club Name</th>
                          <th className="border border-black py-1.5 px-2.5 w-24 text-center">Timing / Mark</th>
                          <th className="border border-black py-1.5 px-2.5 w-20 text-center">Qualify</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(heat.participants || []).map((p, idx) => (
                          <tr key={p.chestNo} className="bg-white">
                            <td className="border border-black py-1.5 px-2 text-center font-bold font-mono">
                              {p.lane || idx + 1}
                            </td>
                            <td className="border border-black py-1.5 px-2 text-center font-mono font-bold text-black">
                              #{p.chestNo}
                            </td>
                            <td className="border border-black py-1.5 px-2 font-bold text-black">
                              {p.candidateName}
                            </td>
                            <td className="border border-black py-1.5 px-2 text-black">
                              {p.club || 'Independent'}
                            </td>
                            <td className="border border-black py-1.5 px-2 text-center font-mono font-bold">
                              {p.timeRecord || '—'}
                            </td>
                            <td className="border border-black py-1.5 px-2 text-center font-bold">
                              {p.qualified ? 'QUALIFIED' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 4. Plain A4 Final List
  function renderA4FinalList() {
    const eventsToRender = selectedFinalEvtNo === 'all'
      ? eventsWithFinalists
      : events.filter(e => String(e.Evt_No) === selectedFinalEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="bg-white p-6 border-0 outline-none text-center text-black">
          <p className="font-bold">No finalists prepared yet.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6 bg-white p-0 border-0 outline-none shadow-none text-black">
        {eventsToRender.map((evt) => {
          const res = results.find(r => Number(r.eventNo) === Number(evt.Evt_No));
          const finalists = res?.finalists || [];

          return (
            <div 
              key={evt.Evt_No} 
              className="bg-white p-0 border-0 outline-none shadow-none avoid-break mb-6"
              style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              {renderA4Header(
                `OFFICIAL FINALIST START LIST • EVENT #${evt.Evt_No}`,
                `${evt.Evt_Name} • ${evt.Gender} • HEIGHT: ${evt.Height}`
              )}

              <table className="w-full text-left text-xs border-collapse border border-black">
                <thead>
                  <tr className="border-b-2 border-black font-bold uppercase text-black">
                    <th className="border border-black py-2 px-2.5 w-14 text-center">Lane</th>
                    <th className="border border-black py-2 px-2.5 w-16 text-center">Chest #</th>
                    <th className="border border-black py-2 px-2.5">Finalist Athlete Name</th>
                    <th className="border border-black py-2 px-2.5">Club Name</th>
                    <th className="border border-black py-2 px-2.5 w-28 text-center">Heat Time</th>
                    <th className="border border-black py-2 px-2.5 w-24 text-center">Sign</th>
                  </tr>
                </thead>
                <tbody>
                  {finalists.map((f, idx) => (
                    <tr key={f.chestNo} className="bg-white">
                      <td className="border border-black py-1.5 px-2 text-center font-mono font-bold text-black">
                        {f.lane || idx + 1}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-center font-mono font-bold text-black">
                        #{f.chestNo}
                      </td>
                      <td className="border border-black py-1.5 px-2 font-bold text-black">
                        {f.candidateName}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-black">
                        {f.club || 'Independent'}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-center font-mono font-bold">
                        {f.resultValue || '—'}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-center h-7">
                        {/* Sign */}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  }

  // 5. Plain A4 Ranking Sheet
  function renderA4RankingSheet() {
    const eventsToRender = selectedRankingEvtNo === 'all'
      ? eventsWithRankings
      : events.filter(e => String(e.Evt_No) === selectedRankingEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="bg-white p-6 border-0 outline-none text-center text-black">
          <p className="font-bold">No event rankings completed yet.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6 bg-white p-0 border-0 outline-none shadow-none text-black">
        {eventsToRender.map((evt) => {
          const res = results.find(r => Number(r.eventNo) === Number(evt.Evt_No));
          const ranked = (res?.winners && res.winners.length > 0 ? res.winners : (res?.finalists || []))
            .filter(f => (f.position || 0) > 0)
            .sort((a, b) => (a.position || 0) - (b.position || 0));

          return (
            <div 
              key={evt.Evt_No} 
              className="bg-white p-0 border-0 outline-none shadow-none avoid-break mb-6"
              style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              {renderA4Header(
                `OFFICIAL EVENT RANKINGS &amp; WINNERS • EVENT #${evt.Evt_No}`,
                `${evt.Evt_Name} • ${evt.Gender} • HEIGHT: ${evt.Height}`
              )}

              <table className="w-full text-left text-xs border-collapse border border-black">
                <thead>
                  <tr className="border-b-2 border-black font-bold uppercase text-black">
                    <th className="border border-black py-2 px-2.5 w-16 text-center">Position</th>
                    <th className="border border-black py-2 px-2.5 w-16 text-center">Chest #</th>
                    <th className="border border-black py-2 px-2.5">Winner / Athlete Name</th>
                    <th className="border border-black py-2 px-2.5">Club Name</th>
                    <th className="border border-black py-2 px-2.5 w-24 text-center">Performance</th>
                    <th className="border border-black py-2 px-2.5 w-16 text-center">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((r) => {
                    const pts = r.position === 1 ? 7 : r.position === 2 ? 5 : r.position === 3 ? 4 : r.position === 4 ? 3 : r.position === 5 ? 2 : r.position === 6 ? 1 : 0;
                    return (
                      <tr key={r.chestNo} className="bg-white">
                        <td className="border border-black py-1.5 px-2 text-center font-bold text-black">
                          {r.position === 1 ? '1ST' : r.position === 2 ? '2ND' : r.position === 3 ? '3RD' : `${r.position}TH`}
                        </td>
                        <td className="border border-black py-1.5 px-2 text-center font-mono font-bold text-black">
                          #{r.chestNo}
                        </td>
                        <td className="border border-black py-1.5 px-2 font-bold text-black">
                          {r.candidateName}
                        </td>
                        <td className="border border-black py-1.5 px-2 text-black">
                          {r.club || 'Independent'}
                        </td>
                        <td className="border border-black py-1.5 px-2 text-center font-mono font-bold text-black">
                          {r.jumpRecord || r.resultValue || '—'}
                        </td>
                        <td className="border border-black py-1.5 px-2 text-center font-mono font-bold text-black">
                          {pts}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {res?.highestRecord?.isRecordBroken && (
                <div className="mt-2 text-xs font-bold text-black">
                  * RECORD BROKEN: {res.highestRecord.recordValue} by {res.highestRecord.candidateName} ({res.highestRecord.club})
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 6. Plain A4 Club Championship Points (Max 3 Clubs)
  function renderA4Championship() {
    return (
      <div className="bg-white p-0 border-0 outline-none shadow-none text-black">
        {renderA4Header('ANNUAL SPORTS MEET CLUB TEAM CHAMPIONSHIP', 'OFFICIAL PODIUM STANDINGS &amp; CERTIFICATION')}

        {/* Clean Plain 3-Club Championship Standings Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {top3Clubs.map((team, idx) => {
            const isFirst = idx === 0;
            const isSecond = idx === 1;

            return (
              <div 
                key={team.name}
                className="p-3 border border-black text-center bg-white rounded-none"
              >
                <div className="text-[11px] font-bold uppercase tracking-wider text-black border-b border-black pb-1 mb-2">
                  {isFirst ? '★ 1ST PLACE - CHAMPION TEAM' : isSecond ? '2ND PLACE - 1ST RUNNER UP' : '3RD PLACE - 2ND RUNNER UP'}
                </div>
                <h3 className="font-bold text-black text-sm uppercase">
                  {team.name}
                </h3>
                <p className="text-xs text-black font-mono mt-0.5">
                  Code: {team.shortCode || team.name.slice(0, 4)}
                </p>
                <div className="mt-2 pt-1 border-t border-black text-xs text-black">
                  <div className="flex justify-center gap-3 font-medium mb-1">
                    <span>Gold: {team.gold}</span>
                    <span>Silver: {team.silver}</span>
                    <span>Bronze: {team.bronze}</span>
                  </div>
                  <div className="text-base font-bold font-mono text-black">
                    {team.points} Points
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detailed Points Table */}
        <table className="w-full text-left text-xs border-collapse border border-black mb-8">
          <thead>
            <tr className="border-b-2 border-black font-bold uppercase text-black">
              <th className="border border-black py-2 px-2.5 w-14 text-center">Rank</th>
              <th className="border border-black py-2 px-2.5">Registered Club Name</th>
              <th className="border border-black py-2 px-2 w-16 text-center">Gold (7)</th>
              <th className="border border-black py-2 px-2 w-16 text-center">Silver (5)</th>
              <th className="border border-black py-2 px-2 w-16 text-center">Bronze (4)</th>
              <th className="border border-black py-2 px-2.5 w-24 text-center">Total Points</th>
            </tr>
          </thead>
          <tbody>
            {top3Clubs.map((team, idx) => (
              <tr key={team.name} className="bg-white">
                <td className="border border-black py-2 px-2 text-center font-bold text-black text-xs">
                  {idx === 0 ? '1ST' : idx === 1 ? '2ND' : '3RD'}
                </td>
                <td className="border border-black py-2 px-2 font-bold text-black">
                  {team.name}
                </td>
                <td className="border border-black py-2 px-2 text-center font-mono font-bold text-black">
                  {team.gold}
                </td>
                <td className="border border-black py-2 px-2 text-center font-mono font-bold text-black">
                  {team.silver}
                </td>
                <td className="border border-black py-2 px-2 text-center font-mono font-bold text-black">
                  {team.bronze}
                </td>
                <td className="border border-black py-2 px-2 text-center font-mono font-bold text-black">
                  {team.points} pts
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Authorization Signatures */}
        <div className="grid grid-cols-3 gap-6 text-center text-xs font-bold text-black pt-6 border-t border-black">
          <div>
            <div className="h-8 border-b border-dashed border-black mb-1" />
            <p className="uppercase">{settings.president || 'Dr. B. K. Sengupta'}</p>
            <p className="text-[10px] text-black font-normal">President, Organizing Committee</p>
          </div>
          <div>
            <div className="h-8 border-b border-dashed border-black mb-1" />
            <p className="uppercase">{settings.secretary || 'Shri Tapas Ghosh'}</p>
            <p className="text-[10px] text-black font-normal">General Secretary</p>
          </div>
          <div>
            <div className="h-8 border-b border-dashed border-black mb-1" />
            <p className="uppercase">Meet Director / Chief Judge</p>
            <p className="text-[10px] text-black font-normal">Athletic Technical Committee</p>
          </div>
        </div>
      </div>
    );
  }
};

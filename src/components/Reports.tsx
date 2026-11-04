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
  Sparkles,
  FileSpreadsheet,
  Sliders
} from 'lucide-react';
import { downloadSportsMeetExcel } from '../services/excelExport';
import { parseJumpToInches, formatJumpBenchmark } from './RankingList';
import { ThermalPageSetupModal } from './ThermalPageSetupModal';
import { 
  ThermalPrintSettings, 
  getThermalSettings, 
  generateThermalPrintCSS 
} from '../utils/thermalSettings';

function formatA4ClubTimestamp(date: Date = new Date()): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const hr = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${d}-${m}-${y}: ${hr}:${min}:${sec}`;
}

function getPositionWord(pos?: number, idx?: number): string {
  const p = (pos && pos > 0) ? pos : ((idx !== undefined) ? idx + 1 : 1);
  switch (p) {
    case 1: return 'First';
    case 2: return 'Second';
    case 3: return 'Third';
    case 4: return 'Fourth';
    case 5: return 'Fifth';
    case 6: return 'Sixth';
    default: return `${p}th`;
  }
}

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

  // Events that have heats configured or candidates enrolled
  const eventsWithHeats = useMemo(() => {
    const relevantNos = new Set<number>();
    heats.forEach(h => relevantNos.add(Number(h.eventNo)));
    candidates.forEach(c => {
      (c.selectedEvents || []).forEach(no => relevantNos.add(Number(no)));
    });
    if (relevantNos.size === 0) return events;
    return events.filter(e => relevantNos.has(Number(e.Evt_No)));
  }, [events, heats, candidates]);

  // Events that have finalists configured (for requiredHit=Yes events, must have prepared final list; for requiredHit=No, candidates enrolled or prepared finals)
  const eventsWithFinalists = useMemo(() => {
    const evtNosWithPreparedFinals = new Set<number>(
      results
        .filter(r => Array.isArray(r.finalists) && r.finalists.length > 0)
        .map(r => Number(r.eventNo))
    );

    return events.filter(e => {
      const evtNo = Number(e.Evt_No);
      const isHitRequired = e.requiredHit !== false && String(e.requiredHit).toLowerCase() !== 'no';

      if (isHitRequired) {
        // requiredHit=Yes: MUST have a prepared final list in results to appear
        return evtNosWithPreparedFinals.has(evtNo);
      } else {
        // requiredHit=No: Direct final event. Appears if final list is prepared OR candidates are enrolled
        const hasPreparedFinals = evtNosWithPreparedFinals.has(evtNo);
        const hasEnrolledCandidates = candidates.some(c => 
          (c.selectedEvents || []).map(Number).includes(evtNo)
        );
        return hasPreparedFinals || hasEnrolledCandidates;
      }
    });
  }, [events, results, candidates]);

  // Events that have completed rankings or finalists
  const eventsWithRankings = useMemo(() => {
    const evtNosWithRankings = new Set<number>(
      results.filter(r => (r.winners || r.finalists || []).some(f => (f.position || 0) > 0)).map(r => Number(r.eventNo))
    );
    if (evtNosWithRankings.size === 0) {
      results.filter(r => (r.finalists || []).length > 0).forEach(r => evtNosWithRankings.add(Number(r.eventNo)));
    }
    if (evtNosWithRankings.size === 0) return events;
    return events.filter(e => evtNosWithRankings.has(Number(e.Evt_No)));
  }, [events, results]);

  // Helper for ordinal rank display (1ST, 2ND, 3RD, 4TH, etc.)
  const getOrdinalRank = (n: number): string => {
    const s = ['TH', 'ST', 'ND', 'RD'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // All clubs ranked calculation for championship (as per attached Club Report.jpeg)
  const allRankedClubs = useMemo(() => {
    const clubMap: Record<string, { 
      name: string; 
      shortCode?: string; 
      logoUrl?: string; 
      mobile?: string;
      phone?: string;
      gold: number; 
      silver: number; 
      bronze: number; 
      points: number 
    }> = {};

    clubs.forEach((c) => {
      if (!c.name) return;
      const cleanName = c.name.trim();
      if (!cleanName || cleanName.toUpperCase() === 'SELF' || cleanName === 'Independent' || cleanName === 'Independent / Unattached') return;
      clubMap[cleanName] = { 
        name: cleanName, 
        shortCode: c.shortCode || cleanName.slice(0, 4).toUpperCase(), 
        logoUrl: c.logoUrl, 
        mobile: c.mobile || c.phone || '',
        phone: c.phone || c.mobile || '',
        gold: 0, 
        silver: 0, 
        bronze: 0, 
        points: 0 
      };
    });

    candidates.forEach((c) => {
      const cClub = (c.club || '').trim();
      if (!cClub || cClub.toUpperCase() === 'SELF' || cClub === 'Independent' || cClub === 'Independent / Unattached') return;
      const cMobile = (c as any).clubMobile || '';
      if (!clubMap[cClub]) {
        const existing = clubs.find(cl => cl.name.trim().toLowerCase() === cClub.toLowerCase());
        clubMap[cClub] = { 
          name: existing?.name || cClub, 
          shortCode: existing?.shortCode || cClub.slice(0, 4).toUpperCase(), 
          logoUrl: existing?.logoUrl || '/icon.png', 
          mobile: existing?.mobile || existing?.phone || cMobile, 
          phone: existing?.phone || existing?.mobile || cMobile, 
          gold: 0, 
          silver: 0, 
          bronze: 0, 
          points: 0 
        };
      } else {
        if (!clubMap[cClub].mobile && cMobile) {
          clubMap[cClub].mobile = cMobile;
        }
      }
    });

    results.forEach((res) => {
      const participants = res.winners && res.winners.length > 0 ? res.winners : (res.finalists || []);
      participants.forEach((f) => {
        const fClub = (f.club || '').trim();
        if (!fClub || fClub.toUpperCase() === 'SELF' || fClub === 'Independent' || fClub === 'Independent / Unattached') return;
        if (!clubMap[fClub]) {
          const existing = clubs.find(cl => cl.name.trim().toLowerCase() === fClub.toLowerCase());
          clubMap[fClub] = { 
            name: existing?.name || fClub, 
            shortCode: existing?.shortCode || fClub.slice(0, 4).toUpperCase(), 
            logoUrl: existing?.logoUrl || '/icon.png', 
            mobile: existing?.mobile || existing?.phone || '',
            phone: existing?.phone || existing?.mobile || '',
            gold: 0, 
            silver: 0, 
            bronze: 0, 
            points: 0 
          };
        }
        if (f.position === 1) {
          clubMap[fClub].gold += 1;
          clubMap[fClub].points += 7;
        } else if (f.position === 2) {
          clubMap[fClub].silver += 1;
          clubMap[fClub].points += 5;
        } else if (f.position === 3) {
          clubMap[fClub].bronze += 1;
          clubMap[fClub].points += 4;
        } else if (f.position === 4) {
          clubMap[fClub].points += 3;
        } else if (f.position === 5) {
          clubMap[fClub].points += 2;
        } else if (f.position === 6) {
          clubMap[fClub].points += 1;
        }
      });
    });

    // Ensure mobile numbers are populated from clubs registry if available
    Object.values(clubMap).forEach(team => {
      if (!team.mobile) {
        const found = clubs.find(cl => cl.name.trim().toLowerCase() === team.name.toLowerCase());
        if (found?.mobile || found?.phone) {
          team.mobile = found.mobile || found.phone || '';
          team.phone = found.phone || found.mobile || '';
        }
      }
    });

    const sorted = Object.values(clubMap)
      .sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.name.localeCompare(b.name));

    return sorted;
  }, [results, clubs, candidates]);

  // Top 3 clubs calculation for championship podium boxes
  const top3Clubs = useMemo(() => {
    return allRankedClubs.slice(0, 3);
  }, [allRankedClubs]);

  // Helper to find club info
  const getClubInfo = (clubName: string) => {
    return clubs.find(c => c.name.toLowerCase() === clubName.toLowerCase());
  };

  // Helper to get registered club's logo uploaded from server side
  const getRegisteredClubLogo = () => {
    if (settings.registeredClubLogo && settings.registeredClubLogo.trim() !== '') {
      return settings.registeredClubLogo;
    }
    const hostClub = clubs.find(c => 
      c.name.toLowerCase().includes((settings.registeredClubName || settings.organizer || 'agrani').toLowerCase())
    ) || clubs[0];
    if (hostClub?.logoUrl && hostClub.logoUrl.trim() !== '') {
      return hostClub.logoUrl;
    }
    return '/icon.png';
  };

  // Helper to get club logo in B&W for thermal printer header
  const getThermalClubLogo = (clubName?: string) => {
    if (clubName && clubName.toLowerCase() !== 'all') {
      const c = getClubInfo(clubName);
      if (c?.logoUrl && c.logoUrl.trim() !== '') return c.logoUrl;
    }
    return getRegisteredClubLogo();
  };

  // Helper to get organizer club name for thermal header
  const getThermalClubName = (clubName?: string) => {
    if (clubName && clubName !== 'all') return clubName;
    return settings.registeredClubName || settings.organizer || 'Agrani Sasthitala Sangha';
  };

  const [thermalConfig, setThermalConfig] = useState<ThermalPrintSettings>(getThermalSettings());
  const [showThermalSetup, setShowThermalSetup] = useState<boolean>(false);

  useEffect(() => {
    const handleSettingsChange = (e: any) => {
      if (e.detail) {
        setThermalConfig(e.detail);
      }
    };
    window.addEventListener('thermal-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('thermal-settings-changed', handleSettingsChange);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Dynamic Print Stylesheet for exact Paper Format targeting */}
      {paperFormat === 'thermal' ? (
        <style>{generateThermalPrintCSS(thermalConfig)}</style>
      ) : (
        <style>{`
          @media print {
            header, nav, footer, .print-hidden-element {
              display: none !important;
            }
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
            .receipt,
            .thermal-printable-wrapper,
            .thermal-printable-sheet {
              display: none !important;
            }
            .avoid-break {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        `}</style>
      )}

      {/* ================= CONTROLS & CONFIGURATION PANEL ================= */}
      <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200 shadow-xs space-y-2.5 print-hidden-element">
        
        {/* Row 1: "Reports & Registers" Label on Left | Thermal Page Setup Button on Right (Disabled when Normal mode) */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <Printer className="w-5 h-5 text-blue-600 shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
              Reports &amp; Registers
            </h1>
          </div>

          {/* 58mm Thermal Page Setup Button on the same line at right side, disabled when Normal mode */}
          <button
            type="button"
            id="btn-thermal-page-setup"
            disabled={paperFormat === 'a4'}
            onClick={() => setShowThermalSetup(true)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-bold shrink-0 ${
              paperFormat === 'a4'
                ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100 border-slate-200 bg-white shadow-2xs active:scale-98 cursor-pointer'
            }`}
            title={
              paperFormat === 'a4'
                ? 'Thermal page setup only available in Thermal mode'
                : '58mm Thermal Printer Page Setup'
            }
            aria-label="58mm Thermal Printer Page Setup"
          >
            <Sliders className={`w-3.5 h-3.5 ${paperFormat === 'a4' ? 'text-slate-400' : 'text-amber-500'}`} />
            <span className="hidden xs:inline sm:inline">58mm Setup</span>
          </button>
        </div>

        {/* Row 2: Format Switcher (Normal/Thermal) on Left | "Print" and "Excel" Buttons (Icon Only) on Right */}
        <div className="flex items-center justify-between gap-2">
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
              title="Normal (A4 Plain Paper)"
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
              title="Thermal (58mm Roll Receipt)"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Thermal</span>
            </button>
          </div>

          {/* Action Buttons: "Print" and "Excel" (Icon Only) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Single Print Button (Icon Only) */}
            <button
              type="button"
              id="btn-execute-report-print"
              onClick={handlePrint}
              className={`p-2 rounded-lg text-xs font-bold flex items-center justify-center transition-all shadow-xs active:scale-98 cursor-pointer ${
                paperFormat === 'thermal'
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title={`Print Report (${paperFormat === 'thermal' ? '58mm Thermal' : 'A4 Normal'})`}
              aria-label="Print Report"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Option: Download Database & Data as Excel (Icon Only) */}
            <button
              type="button"
              id="btn-reports-download-excel"
              onClick={() => {
                downloadSportsMeetExcel({
                  candidates,
                  events,
                  clubs,
                  heats,
                  results,
                  settings,
                });
              }}
              className="p-2 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-600 active:scale-98 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
              title="Download database & data in Excel (.xlsx) format"
              aria-label="Download Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* 6 Report Types Navigation Tabs: Arranged in 2 Columns and 3 Rows with Justify Alignment */}
        <div className="grid grid-cols-2 gap-2 w-full pt-2 border-t border-slate-100">
          
          {/* Row 1, Col 1: 1. Candidate List */}
          <button
            type="button"
            onClick={() => setReportType('chest')}
            className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              reportType === 'chest'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Candidate List</span>
            </div>
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] shrink-0 font-bold ${
              reportType === 'chest' ? 'bg-white/20 text-white' : 'bg-black/10 text-slate-800'
            }`}>
              {candidates.length}
            </span>
          </button>

          {/* Row 1, Col 2: 2. Club Wise Candidate List */}
          <button
            type="button"
            onClick={() => setReportType('club')}
            className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              reportType === 'club'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Club Wise List</span>
            </div>
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] shrink-0 font-bold ${
              reportType === 'club' ? 'bg-white/20 text-white' : 'bg-black/10 text-slate-800'
            }`}>
              {allAvailableClubNames.length}
            </span>
          </button>

          {/* Row 2, Col 1: 3. Hit List */}
          <button
            type="button"
            onClick={() => setReportType('hit')}
            className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              reportType === 'hit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Flame className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Hit List</span>
            </div>
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] shrink-0 font-bold ${
              reportType === 'hit' ? 'bg-white/20 text-white' : 'bg-black/10 text-slate-800'
            }`}>
              {heats.length}
            </span>
          </button>

          {/* Row 2, Col 2: 4. Final List */}
          <button
            type="button"
            onClick={() => setReportType('final')}
            className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              reportType === 'final'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Medal className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Final List</span>
            </div>
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] shrink-0 font-bold ${
              reportType === 'final' ? 'bg-white/20 text-white' : 'bg-black/10 text-slate-800'
            }`}>
              {eventsWithFinalists.length}
            </span>
          </button>

          {/* Row 3, Col 1: 5. Ranking Sheet */}
          <button
            type="button"
            onClick={() => setReportType('ranking')}
            className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              reportType === 'ranking'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Ranking Sheet</span>
            </div>
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] shrink-0 font-bold ${
              reportType === 'ranking' ? 'bg-white/20 text-white' : 'bg-black/10 text-slate-800'
            }`}>
              {eventsWithRankings.length}
            </span>
          </button>

          {/* Row 3, Col 2: 6. Club Championship (Top 3) */}
          <button
            type="button"
            onClick={() => setReportType('championship')}
            className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              reportType === 'championship'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">Championship</span>
            </div>
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] shrink-0 font-bold ${
              reportType === 'championship' ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-900'
            }`}>
              Top 3
            </span>
          </button>
        </div>

        {/* ================= SECONDARY FILTERS & OPTIONS: Mobile-friendly Full Width Justified Alignment ================= */}
        {(reportType === 'club' || reportType === 'hit' || reportType === 'final' || reportType === 'ranking') && (
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 w-full text-xs">
            
            {/* Sub-option 1: Club Wise filter */}
            {reportType === 'club' && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 shrink-0">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Select Club:</span>
                </label>
                <select
                  value={selectedClubFilter}
                  onChange={(e) => setSelectedClubFilter(e.target.value)}
                  className="w-full sm:w-auto sm:flex-1 sm:max-w-md bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
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
              </div>
            )}

            {/* Sub-option 2: Hit List event filter */}
            {reportType === 'hit' && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 shrink-0">
                  <Flame className="w-3.5 h-3.5 text-orange-600" />
                  <span>Select Event Heats:</span>
                </label>
                <select
                  value={selectedHitEvtNo}
                  onChange={(e) => setSelectedHitEvtNo(e.target.value)}
                  className="w-full sm:w-auto sm:flex-1 sm:max-w-md bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 shrink-0">
                  <Medal className="w-3.5 h-3.5 text-blue-600" />
                  <span>Select Final Event:</span>
                </label>
                <select
                  value={selectedFinalEvtNo}
                  onChange={(e) => setSelectedFinalEvtNo(e.target.value)}
                  className="w-full sm:w-auto sm:flex-1 sm:max-w-md bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
                >
                  {eventsWithFinalists.length > 0 ? (
                    <>
                      <option value="all">★ All Events with Finalists ({eventsWithFinalists.length})</option>
                      {eventsWithFinalists.map((ev) => (
                        <option key={ev.Evt_No} value={String(ev.Evt_No)}>
                          Event #{ev.Evt_No}: {ev.Evt_Name} ({ev.Gender} - {ev.Height})
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value="all">No Final Lists Prepared Yet</option>
                  )}
                </select>
              </div>
            )}

            {/* Sub-option 4: Ranking Sheet event filter */}
            {reportType === 'ranking' && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 shrink-0">
                  <Trophy className="w-3.5 h-3.5 text-amber-600" />
                  <span>Select Ranking Event:</span>
                </label>
                <select
                  value={selectedRankingEvtNo}
                  onChange={(e) => setSelectedRankingEvtNo(e.target.value)}
                  className="w-full sm:w-auto sm:flex-1 sm:max-w-md bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
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
        /* ================= THERMAL PRINTER 58MM ROLL PAPER VIEW (EXACT PREVIEW MATCHING PRINT OUTPUT) ================= */
        <div className="flex flex-col items-center justify-center p-4 sm:p-8 bg-slate-300 rounded-2xl border border-slate-300 print:bg-white print:p-0 print:border-none">
          <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5 print:hidden">
            <Receipt className="w-3.5 h-3.5 text-amber-600" />
            <span>58mm Roll Preview ({thermalConfig.printableWidth}mm net printable)</span>
          </div>
          <div 
            className="receipt thermal-printable-wrapper bg-white text-black p-3 shadow-2xl rounded-xs select-none print:shadow-none print:p-0"
            style={{
              width: `${thermalConfig.printableWidth}mm`,
              maxWidth: `${thermalConfig.printableWidth}mm`,
              paddingLeft: `${thermalConfig.marginHorizontal}mm`,
              paddingRight: `${thermalConfig.marginHorizontal}mm`,
              paddingTop: `${thermalConfig.topMargin || 5}mm`,
              paddingBottom: `${thermalConfig.feedBeforeCut}mm`,
              fontSize: `${thermalConfig.fontSize}px`,
              lineHeight: thermalConfig.lineSpacing,
              fontFamily: 'Consolas, "Courier New", monospace'
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

      {/* 58mm Thermal Printer Page Setup Modal */}
      <ThermalPageSetupModal 
        isOpen={showThermalSetup} 
        onClose={() => setShowThermalSetup(false)} 
        settings={settings} 
      />

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

  // Header: Registered club logo placed beside left of registered club name, meet ordinal centered below (same as Candidate list)
  function renderThermalHeader(specificClubName?: string, topMargin?: string) {
    const clubDisplayName = getThermalClubName(specificClubName);
    const clubLogo = specificClubName ? getThermalClubLogo(specificClubName) : getRegisteredClubLogo();

    return (
      <div 
        className="pb-1 mb-1 border-b border-dashed border-black pt-1"
        style={topMargin ? { paddingTop: topMargin } : undefined}
      >
        <div className="flex items-center justify-center gap-1.5 leading-tight">
          <img 
            src={clubLogo} 
            alt="Club Logo" 
            className="w-5 h-5 shrink-0 object-contain filter grayscale contrast-200"
            style={{ filter: 'grayscale(100%) contrast(200%)' }}
          />
          <span className="font-bold text-[10.5px] uppercase tracking-tight text-black truncate max-w-[36mm]">
            {clubDisplayName}
          </span>
        </div>
        <div className="text-[8.5px] font-semibold text-black leading-tight mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[46mm] mx-auto text-center">
          {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
        </div>
      </div>
    );
  }

  // Footer: Place app logo and app name in ONE LINE within 48mm width
  function renderThermalFooter() {
    return (
      <div className="text-center pt-1 mt-1 border-t border-dashed border-black text-black">
        {/* App logo and app name in ONE LINE strictly within 48mm */}
        <div className="flex items-center justify-center gap-1 leading-none max-w-[46mm] mx-auto whitespace-nowrap overflow-hidden">
          <img 
            src="/icon.png" 
            alt="eSports Logo" 
            className="w-3.5 h-3.5 shrink-0 object-contain filter grayscale contrast-200"
            style={{ filter: 'grayscale(100%) contrast(200%)' }}
          />
          <span className="font-semibold text-[8px] tracking-tight text-black whitespace-nowrap truncate">
            eSports (Sport Management System)
          </span>
        </div>
        {/* Date & time stamp */}
        <div className="text-[7.5px] text-black leading-none mt-0.5 font-mono whitespace-nowrap">
          {currentTimestamp}
        </div>
      </div>
    );
  }

  // 1. Thermal Candidate List (Chest no. wise)
  function renderThermalCandidateList() {
    const totalFees = chestWiseCandidates.reduce((s, c) => s + (Number(c.totalFees) || 0), 0);
    const totalPaid = chestWiseCandidates.reduce((s, c) => {
      const st = (c.feeStatus || 'Paid').toUpperCase();
      if (!st.includes('UNPAID') && !st.includes('DUE') && !st.includes('EXEMPT') && !st.includes('FREE')) {
        return s + (Number(c.totalFees) || 0);
      }
      return s;
    }, 0);
    const totalDue = chestWiseCandidates.reduce((s, c) => {
      const st = (c.feeStatus || 'Paid').toUpperCase();
      if (st.includes('UNPAID') || st.includes('DUE')) {
        return s + (Number(c.totalFees) || 0);
      }
      return s;
    }, 0);

    const clubDisplayName = getThermalClubName();
    const clubLogo = getRegisteredClubLogo();

    return (
      <div style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
        {renderThermalHeader()}

        <div className="text-center font-bold uppercase text-[10px] mb-1 tracking-wider leading-none">
          --- Name list ---
        </div>

        {/* Minimal important info columns: SL, CH, NAME, EVTS, FEE */}
        <div className="border-b border-black pb-0.5 mb-1 font-bold flex items-center justify-between text-[10px] leading-tight text-black">
          <span className="w-5 text-center shrink-0 font-bold">SL</span>
          <span className="w-7 text-center shrink-0 font-bold">CH</span>
          <span className="flex-1 text-left px-1 font-bold">NAME</span>
          <span className="w-7 text-center shrink-0 font-bold">EVTS</span>
          <span className="w-13 text-right shrink-0 font-bold">FEE</span>
        </div>

        <div className="space-y-0 text-black">
          {chestWiseCandidates.map((c, idx) => {
            const isDue = (c.feeStatus || '').toUpperCase().includes('DUE') || (c.feeStatus || '').toUpperCase().includes('UNPAID');
            const clubText = c.club ? `(${c.club})` : '';
            return (
              <div key={c.id || c.chestNo}>
                <div className="flex justify-between items-center text-[10px] py-0.5 leading-tight">
                  <span className="w-5 text-center font-normal shrink-0">{idx + 1}</span>
                  <span className="w-7 text-center font-bold shrink-0">{c.chestNo}</span>
                  <span className="flex-1 text-left truncate px-1 uppercase font-normal">
                    {c.name} {clubText}
                  </span>
                  <span className="w-7 text-center text-[9px] font-normal shrink-0">
                    {(c.selectedEvents || []).map(Number).sort((a,b)=>a-b).join(',')}
                  </span>
                  <span className="w-13 text-right font-normal shrink-0">
                    {settings.currencySymbol || '₹'}{Number(c.totalFees || 0).toFixed(0)} ({isDue ? 'D' : 'P'})
                  </span>
                </div>
                <div className="border-b border-dotted border-black/80"></div>
              </div>
            );
          })}
        </div>

        {/* Total Summary: Amt:₹x | P: ₹y | D: ₹z all in one line, no "Total Candidates:" */}
        <div className="mt-1 pt-0.5 border-t border-dashed border-black text-[10px] font-normal leading-tight text-center text-black">
          <span>Amt:{settings.currencySymbol || '₹'}{totalFees.toFixed(0)} | P: {settings.currencySymbol || '₹'}{totalPaid.toFixed(0)} | D: {settings.currencySymbol || '₹'}{totalDue.toFixed(0)}</span>
        </div>

        {renderThermalFooter()}
      </div>
    );
  }

  // 2. Thermal Club Wise Candidate List with Subtotal (One by One or All)
  function renderThermalClubWise() {
    return (
      <div className="space-y-3" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
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
            <div key={clubName} className="avoid-break pb-2 border-b border-dashed border-black last:border-b-0">
              {/* Header: same as Candidate list */}
              {renderThermalHeader()}

              {/* Participating club name */}
              <div className="font-normal text-[10.5px] mb-1 leading-tight text-black truncate">
                CLUB: &lt;{clubName}&gt;
              </div>

              {/* Column Headers */}
              <div className="border-b border-black pb-0.5 mb-1 font-bold flex justify-between text-[10px] leading-tight text-black">
                <span className="w-8 text-left">CH#</span>
                <span className="flex-1 text-left px-1">NAME</span>
                <span className="w-10 text-center">EVTS</span>
                <span className="w-8 text-right">FEE</span>
              </div>

              {/* Athletes: Bold only chest numbers and due amount, NO # prefix before chest number */}
              <div className="space-y-0.5 text-black">
                {athletes.map((c) => (
                  <div key={c.id || c.chestNo} className="flex justify-between items-start text-[10px] leading-tight font-normal">
                    <span className="w-8 text-left font-bold shrink-0">{c.chestNo}</span>
                    <span className="flex-1 text-left truncate px-1 uppercase font-normal">{c.name}</span>
                    <span className="w-10 text-center font-normal text-[9px] shrink-0">
                      {(c.selectedEvents || []).map(Number).sort((a,b)=>a-b).join(',')}
                    </span>
                    <span className="w-8 text-right font-normal shrink-0">
                      ₹{Number(c.totalFees || 0).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Dashed Line */}
              <div className="border-b border-dashed border-black my-1"></div>

              {/* Subtotal Section */}
              <div className="text-[10px] text-black font-normal flex justify-between leading-tight">
                <span>Enrolled: {athletes.length}</span>
                <span>Total: ₹{clubTotalFees.toFixed(0)}</span>
              </div>

              <div className="text-[10px] text-black font-normal flex justify-between leading-tight mt-0.5">
                <span>Paid: ₹{clubTotalPaid.toFixed(0)}</span>
                <span>DUE: <span className="font-bold">₹{clubTotalDue.toFixed(0)}</span></span>
              </div>

              {/* Solid Horizontal Line */}
              <div className="border-b border-black my-1"></div>

              {/* SUB TOTAL (DUE) */}
              <div className="text-[10.5px] text-black flex justify-between leading-tight">
                <span className="font-normal">SUB TOTAL (DUE):</span>
                <span className="font-bold">₹{clubTotalDue.toFixed(0)}</span>
              </div>

              {/* Footer: same as Candidate list */}
              {renderThermalFooter()}
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Thermal Hit List (Field Recording Sheet as per HitListThermal Report.jpg)
  function renderThermalHitList() {
    const eventsToRender = selectedHitEvtNo === 'all' 
      ? (eventsWithHeats.length > 0 ? eventsWithHeats : events.filter(e => candidates.some(c => (c.selectedEvents || []).map(Number).includes(Number(e.Evt_No)))))
      : events.filter(e => String(e.Evt_No) === selectedHitEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="text-center py-4">
          {renderThermalHeader()}
          <p className="font-bold my-2 text-[10px]">NO HIT LISTS AVAILABLE</p>
          {renderThermalFooter()}
        </div>
      );
    }

    const formatThermalHeight = (hStr?: string) => {
      if (!hStr) return 'ALL';
      const clean = hStr.trim().toUpperCase();
      if (clean === 'ALL') return 'ALL';
      return clean.replace(/[`']/g, "'").replace(/''|``|"/g, "''");
    };

    const getThermalGenderAbbr = (gender?: string) => {
      if (!gender) return 'ALL';
      const g = gender.trim().toUpperCase();
      if (g.startsWith('BOY') || g === 'B') return 'B';
      if (g.startsWith('GIRL') || g === 'G') return 'G';
      if (g.startsWith('CHILD') || g === 'C') return 'C';
      return 'ALL';
    };

    const clubDisplayName = (settings.registeredClubName || settings.organizer || 'SASTHITALA AGRANI').toUpperCase();
    const meetTitle = settings.ordinalTitle || '47th Annual Sports Meet 2027';
    const clubLogo = settings.registeredClubLogo || '/icon.png';

    return (
      <div className="space-y-4" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
        {eventsToRender.map((evt) => {
          const evtHeats = heats.filter(h => Number(h.eventNo) === Number(evt.Evt_No));
          const enrolled = candidates.filter(c => (c.selectedEvents || []).map(Number).includes(Number(evt.Evt_No)))
            .sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));

          const heightDisp = formatThermalHeight(evt.Height);
          const genderAbbr = getThermalGenderAbbr(evt.Gender);

          return (
            <div 
              key={evt.Evt_No} 
              className="avoid-break pt-2 pb-2 border-b border-dashed border-black last:border-b-0 text-black leading-tight"
            >
              {/* Header: same as Candidate list */}
              {renderThermalHeader()}

              {/* Two-line Report Name and Event Details */}
              <div className="text-center font-bold text-[10px] uppercase tracking-wider text-black">
                HIT LIST
              </div>
              <div className="text-center font-bold text-[9px] uppercase pb-0.5 tracking-tight text-black break-words leading-tight">
                EVT #{evt.Evt_No}: {evt.Evt_Name} ({heightDisp} • {genderAbbr})
              </div>

              {/* Dashed Line */}
              <div className="border-b border-dashed border-black my-1"></div>

              {/* Table Column Headers */}
              <div className="flex items-center text-[9px] font-bold text-black uppercase pt-1">
                <span className="w-6 text-center">SL</span>
                <span className="w-8 text-center">CH#</span>
                <span className="flex-1 text-left pl-2">ATHLETE (CLUB)</span>
              </div>
              <div className="border-b-2 border-black mb-1 mt-0.5"></div>

              {/* Athletes List */}
              {evtHeats.length > 0 ? (
                <div className="space-y-2">
                  {evtHeats.map((heat) => (
                    <div key={heat.id}>
                      {evtHeats.length > 1 && (
                        <div className="font-bold text-[8.5px] uppercase text-black py-0.5">
                          --- HEAT {heat.heatNumber} ---
                        </div>
                      )}
                      <div className="space-y-0 text-black">
                        {(heat.participants || []).map((p, idx) => {
                          const club = getClubInfo(p.club || '');
                          const clubNameStr = club?.name || p.club || 'BANDIPUR';
                          return (
                            <div key={p.chestNo}>
                              <div className="flex items-center text-[9.5px] py-1 text-black leading-tight">
                                <span className="w-6 text-center font-normal shrink-0">{idx + 1}</span>
                                <span className="w-8 text-center font-bold shrink-0">{p.chestNo}</span>
                                <span className="flex-1 text-left font-normal uppercase truncate pl-2">
                                  {p.candidateName} ({clubNameStr})
                                </span>
                              </div>
                              <div className="border-b border-dotted border-black/80"></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-0 text-black">
                  {enrolled.map((p, idx) => {
                    const club = getClubInfo(p.club || '');
                    const clubNameStr = club?.name || p.club || 'BANDIPUR';
                    return (
                      <div key={p.id || p.chestNo}>
                        <div className="flex items-center text-[9.5px] py-1 text-black leading-tight">
                          <span className="w-6 text-center font-normal shrink-0">{idx + 1}</span>
                          <span className="w-8 text-center font-bold shrink-0">{p.chestNo}</span>
                          <span className="flex-1 text-left font-normal uppercase truncate pl-2">
                            {p.name} ({clubNameStr})
                          </span>
                        </div>
                        <div className="border-b border-dotted border-black/80"></div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer: same as Candidate list */}
              {renderThermalFooter()}
            </div>
          );
        })}
      </div>
    );
  }

  // 4. Thermal Final List (Redesigned as per FinalListThermal Report.jpg)
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

    const formatThermalHeight = (hStr?: string) => {
      if (!hStr) return 'ALL';
      const clean = hStr.trim().toUpperCase();
      if (clean === 'ALL') return 'ALL';
      return clean.replace(/[`']/g, "'").replace(/''|``|"/g, "''");
    };

    const getThermalGenderAbbr = (gender?: string) => {
      if (!gender) return 'ALL';
      const g = gender.trim().toUpperCase();
      if (g.startsWith('BOY') || g === 'B') return 'B';
      if (g.startsWith('GIRL') || g === 'G') return 'G';
      if (g.startsWith('CHILD') || g === 'C') return 'C';
      return 'ALL';
    };

    const clubDisplayName = (settings.registeredClubName || settings.organizer || 'SASTHITALA AGRANI').toUpperCase();
    const meetTitle = settings.ordinalTitle || '47th Annual Sports Meet 2027';
    const clubLogo = settings.registeredClubLogo || '/icon.png';

    return (
      <div className="space-y-4" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
        {eventsToRender.map((evt) => {
          const res = results.find(r => Number(r.eventNo) === Number(evt.Evt_No));
          const directFinalists = res?.finalists || [];
          const isHitRequired = evt.requiredHit !== false && String(evt.requiredHit).toLowerCase() !== 'no';

          const finalistsList = directFinalists.length > 0
            ? directFinalists
            : (!isHitRequired
                ? candidates
                    .filter(c => (c.selectedEvents || []).map(Number).includes(Number(evt.Evt_No)))
                    .sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0))
                    .map(c => ({
                      chestNo: c.chestNo,
                      candidateName: c.name,
                      club: c.club,
                    }))
                : []);

          const heightDisp = formatThermalHeight(evt.Height);
          const genderAbbr = getThermalGenderAbbr(evt.Gender);

          return (
            <div 
              key={evt.Evt_No} 
              className="avoid-break pt-2 pb-2 border-b border-dashed border-black last:border-b-0 text-black leading-tight"
            >
              {/* Header: same as Candidate list */}
              {renderThermalHeader()}

              {/* Two-line Report Name and Event Details */}
              <div className="text-center font-bold text-[10px] uppercase tracking-wider text-black">
                FINAL LIST
              </div>
              <div className="text-center font-bold text-[9px] uppercase pb-0.5 tracking-tight text-black break-words leading-tight">
                EVT #{evt.Evt_No}: {evt.Evt_Name} ({heightDisp} • {genderAbbr})
              </div>

              {/* Dashed Line */}
              <div className="border-b border-dashed border-black my-1"></div>

              {/* Table Column Headers */}
              <div className="flex items-center text-[9px] font-bold text-black uppercase pt-1">
                <span className="w-6 text-center">SL</span>
                <span className="w-8 text-center">CH#</span>
                <span className="flex-1 text-left pl-2">ATHLETE (CLUB)</span>
              </div>
              <div className="border-b-2 border-black mb-1 mt-0.5"></div>

              {/* Athletes List with dotted separators */}
              <div className="space-y-0 text-black">
                {finalistsList.map((f, idx) => {
                  const club = getClubInfo(f.club || '');
                  const clubNameStr = club?.name || f.club || 'BANDIPUR';
                  return (
                    <div key={f.chestNo}>
                      <div className="flex items-center text-[9.5px] py-1 text-black leading-tight">
                        <span className="w-6 text-center font-normal shrink-0">{idx + 1}</span>
                        <span className="w-8 text-center font-bold shrink-0">{f.chestNo}</span>
                        <span className="flex-1 text-left font-normal uppercase truncate pl-2">
                          {f.candidateName} ({clubNameStr})
                        </span>
                      </div>
                      <div className="border-b border-dotted border-black/80"></div>
                    </div>
                  );
                })}
              </div>

              {/* Footer: same as Candidate list */}
              {renderThermalFooter()}
            </div>
          );
        })}
      </div>
    );
  }

  // 5. Thermal Ranking Sheet (Redesigned as per thermal ranking specifications)
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

    const formatThermalHeight = (hStr?: string) => {
      if (!hStr) return 'ALL';
      const clean = hStr.trim().toUpperCase();
      if (clean === 'ALL') return 'ALL';
      return clean.replace(/[`']/g, "'").replace(/''|``|"/g, "''");
    };

    const getThermalGenderAbbr = (gender?: string) => {
      if (!gender) return 'ALL';
      const g = gender.trim().toUpperCase();
      if (g.startsWith('BOY') || g === 'B') return 'B';
      if (g.startsWith('GIRL') || g === 'G') return 'G';
      if (g.startsWith('CHILD') || g === 'C') return 'C';
      return 'ALL';
    };

    const getRankPosLabel = (pos?: number, fallbackIdx?: number) => {
      const p = (pos && pos > 0) ? pos : ((fallbackIdx !== undefined) ? fallbackIdx + 1 : 1);
      if (p === 1) return '1st';
      if (p === 2) return '2nd';
      if (p === 3) return '3rd';
      return `${p}th`;
    };

    const clubDisplayName = (settings.registeredClubName || settings.organizer || 'SASTHITALA AGRANI').toUpperCase();
    const meetTitle = settings.ordinalTitle || '47th Annual Sports Meet 2027';
    const clubLogo = settings.registeredClubLogo || '/icon.png';

    return (
      <div className="space-y-4" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
        {eventsToRender.map((evt) => {
          const res = results.find(r => Number(r.eventNo) === Number(evt.Evt_No));
          const ranked = (res?.winners && res.winners.length > 0 ? res.winners : (res?.finalists || []))
            .filter(f => (f.position || 0) > 0)
            .sort((a, b) => (a.position || 0) - (b.position || 0));

          const heightDisp = formatThermalHeight(evt.Height);
          const genderAbbr = getThermalGenderAbbr(evt.Gender);
          const isBroadJump = (evt.Evt_Name || '').toUpperCase().includes('BROAD JUMP');

          return (
            <div 
              key={evt.Evt_No} 
              className="avoid-break pt-2 pb-2 border-b border-dashed border-black last:border-b-0 text-black leading-tight"
            >
              {/* Header: same as Candidate list */}
              {renderThermalHeader()}

              {/* Two-line Report Name and Event Details */}
              <div className="text-center font-bold text-[10px] uppercase tracking-wider text-black">
                RANKING LIST
              </div>
              <div className="text-center font-bold text-[9px] uppercase pb-0.5 tracking-tight text-black break-words leading-tight">
                EVT #{evt.Evt_No}: {evt.Evt_Name} ({heightDisp} • {genderAbbr})
              </div>

              {/* Dashed Line */}
              <div className="border-b border-dashed border-black my-1"></div>

              {/* Table Column Headers */}
              <div className="flex items-center text-[9px] font-bold text-black uppercase pt-1">
                <span className={isBroadJump ? "w-7 text-center shrink-0" : "w-8 text-center shrink-0"}>Rank</span>
                <span className={isBroadJump ? "w-7 text-center shrink-0" : "w-8 text-center shrink-0"}>CH#</span>
                <span className={isBroadJump ? "flex-1 text-left pl-1" : "flex-1 text-left pl-2"}>ATHLETE (CLUB)</span>
                {isBroadJump && (
                  <span className="w-14 text-right pr-0.5 shrink-0">Jump</span>
                )}
              </div>
              <div className="border-b-2 border-black mb-1 mt-0.5"></div>

              {/* Ranked Athletes List with dotted separators */}
              <div className="space-y-0 text-black">
                {ranked.length === 0 ? (
                  <div className="py-2 text-center text-[9px] italic text-slate-600">
                    No rankings declared yet for this event.
                  </div>
                ) : (
                  ranked.map((r, idx) => {
                    const club = getClubInfo(r.club || '');
                    const isSelf = (r.club || '').trim().toUpperCase() === 'SELF';
                    const clubNameStr = isSelf ? '' : (club?.name || r.club || '');
                    const athleteDisplay = clubNameStr ? `${r.candidateName} (${clubNameStr})` : r.candidateName;
                    return (
                      <div key={r.chestNo}>
                        <div className="flex items-center text-[9.5px] py-1 text-black leading-tight">
                          <span className={isBroadJump ? "w-7 text-center font-normal shrink-0" : "w-8 text-center font-normal shrink-0"}>
                            {getRankPosLabel(r.position, idx)}
                          </span>
                          <span className={isBroadJump ? "w-7 text-center font-bold shrink-0" : "w-8 text-center font-bold shrink-0"}>
                            {r.chestNo}
                          </span>
                          <span className={isBroadJump ? "flex-1 text-left font-normal uppercase truncate pl-1" : "flex-1 text-left font-normal uppercase truncate pl-2"}>
                            {athleteDisplay}
                          </span>
                          {isBroadJump && (
                            <span className="w-14 text-right font-mono text-[8.5px] font-normal shrink-0">
                              {r.jumpRecord || r.resultValue || '—'}
                            </span>
                          )}
                        </div>
                        <div className="border-b border-dotted border-black/80"></div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Broad Jump Record Callout for Thermal Print */}
              {isBroadJump && (() => {
                const prevRecord = settings.broadJumpPreviousRecords?.[Number(evt.Evt_No)] ||
                  (res?.highestRecord?.previousRecordValue ? {
                    recordValue: res.highestRecord.previousRecordValue,
                    recordHolderName: res.highestRecord.previousRecordHolder || 'Record Holder',
                    recordHolderClub: '',
                    recordYear: res.highestRecord.previousRecordYear || '',
                  } : null);

                if (!prevRecord) return null;

                const prevInches = parseJumpToInches(prevRecord.recordValue);
                let maxJumpInches = 0;
                ranked.forEach(r => {
                  const jInches = parseJumpToInches(r.jumpRecord || (r as any).resultValue);
                  if (jInches > maxJumpInches) maxJumpInches = jInches;
                });
                if (res?.highestRecord?.recordValue) {
                  const hrInches = parseJumpToInches(res.highestRecord.recordValue);
                  if (hrInches > maxJumpInches) maxJumpInches = hrInches;
                }
                const isBroken = prevInches > 0 ? (maxJumpInches > prevInches) : (maxJumpInches > 0);
                const recFlag = isBroken ? 'Y' : 'N';
                const formattedPrev = formatJumpBenchmark(prevRecord.recordValue) || prevRecord.recordValue;
                const holderClub = prevRecord.recordHolderClub ? ` (${prevRecord.recordHolderClub})` : '';
                const holderYear = prevRecord.recordYear ? `, ${prevRecord.recordYear}` : '';

                return (
                  <div className="py-1 text-[8.5px] font-bold text-center text-black leading-tight border-b border-dotted border-black/80">
                    New record: {recFlag} | Prev: {formattedPrev} by {prevRecord.recordHolderName}{holderClub}{holderYear}
                  </div>
                );
              })()}

              {/* Footer: same as Candidate list */}
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
      <div style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
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
        <div className="border-b border-black pb-0.5 mb-0.5 font-bold flex justify-between items-center text-[8.5px]">
          <span className="w-5 shrink-0">RK</span>
          <span className="flex-1 text-left pr-1">CLUB</span>
          <div className="flex items-center gap-1 shrink-0 text-center">
            <span className="w-3">G</span>
            <span className="w-3">S</span>
            <span className="w-3">B</span>
            <span className="w-4 text-right font-bold">T</span>
          </div>
        </div>

        <div className="space-y-1">
          {top3Clubs.map((team, idx) => {
            const rankLabel = idx === 0 ? '1ST' : idx === 1 ? '2ND' : '3RD';
            return (
              <div key={team.name} className="flex justify-between items-start text-[9.5px] leading-tight pb-0.5 border-b border-dotted border-black/50 last:border-b-0">
                <span className="w-5 font-bold shrink-0">{rankLabel}</span>
                <span className="flex-1 text-left font-bold pr-1 break-words uppercase">
                  {team.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="w-3 text-center shrink-0 font-normal">{team.gold}</span>
                  <span className="w-3 text-center shrink-0 font-normal">{team.silver}</span>
                  <span className="w-3 text-center shrink-0 font-normal">{team.bronze}</span>
                  <span className="w-4 text-right font-bold shrink-0">{team.points}</span>
                </div>
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
  function renderA4Header(reportTitle: string, subtitle?: string, specificClubName?: string, hideVenueDates = false) {
    const organizerName = settings.registeredClubName || settings.organizer || 'Agrani Sasthitala Sangha';
    const logoSrc = settings.registeredClubLogo || '/icon.png';

    return (
      <div className="text-center pb-3 mb-3 border-b-2 border-black">
        <div className="flex items-center justify-center gap-3.5 mb-1">
          <img 
            src={logoSrc} 
            alt="Club Logo" 
            className="w-12 h-12 object-contain shrink-0" 
          />
          <div className="text-left">
            <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight uppercase leading-tight font-serif">
              {organizerName}
            </h1>
            <p className="text-xs sm:text-sm font-bold text-black uppercase tracking-wide leading-tight mt-0.5">
              {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
            </p>
          </div>
        </div>

        {!hideVenueDates && (
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-black mt-2 font-medium">
            {settings.venue && <span><strong>Venue:</strong> {settings.venue}</span>}
            {settings.venue && settings.dates && <span>•</span>}
            {settings.dates && <span><strong>Dates:</strong> {settings.dates}</span>}
            {settings.organizer && settings.organizer !== organizerName && (
              <>
                <span>•</span>
                <span><strong>Organized by:</strong> {settings.organizer}</span>
              </>
            )}
          </div>
        )}

        <div className="mt-2 pt-1 border-t border-black/40">
          <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-black">
            {reportTitle}
          </h2>
          {subtitle && (
            <p className="text-xs font-bold text-black mt-0.5 uppercase tracking-wide">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    );
  }

  // 1. Plain A4 Candidate List (Chest no. wise) - Redesigned with reduced height between records
  function renderA4CandidateList() {
    const clubDisplayName = settings.registeredClubName || settings.organizer || 'Sasthitala Agrani';
    const meetTitle = settings.ordinalTitle || '47th Annual Sports Meet 2027';
    const logoSrc = settings.registeredClubLogo || clubs[0]?.logoUrl || '/icon.png';

    return (
      <div 
        className="bg-white p-0 border-0 outline-none shadow-none text-black"
        style={{ fontFamily: 'Consolas, "Courier New", monospace' }}
      >
        {/* Top Header: Logo + Club / Meet Title on Left | "Name list (Chest No. wise)" on Right */}
        <div className="flex items-center justify-between mb-4 pb-1 text-black font-bold">
          <div className="flex items-center gap-2">
            <img
              src={logoSrc}
              alt="Club Logo"
              className="w-6 h-6 object-contain rounded-full shrink-0"
            />
            <span className="font-bold text-sm sm:text-base text-black tracking-tight">
              {clubDisplayName} / {meetTitle}
            </span>
          </div>
          <div className="font-bold text-sm sm:text-base text-black tracking-tight">
            Name list (Chest No. wise)
          </div>
        </div>

        {/* Clean Table: Reduced height between records, Consolas font, bold headers and only chest number in bold */}
        <table className="w-full text-left border-collapse bg-white text-black" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
          <thead>
            <tr className="border-b border-gray-300 text-sm text-black font-bold">
              <th className="py-1 px-2 text-center w-12 font-bold">Sl.</th>
              <th className="py-1 px-3 text-center w-16 font-bold">Ch#</th>
              <th className="py-1 px-3 text-left font-bold">Name (Club)</th>
              <th className="py-1 px-3 text-left w-32 font-bold">Events</th>
              <th className="py-1 px-3 text-left w-36 font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {chestWiseCandidates.map((cand, idx) => {
              const isDue = (cand.feeStatus || '').toUpperCase().includes('DUE') || (cand.feeStatus || '').toUpperCase().includes('UNPAID');
              const eventsStr = (cand.selectedEvents || []).map(Number).sort((a, b) => a - b).join(',');
              const clubStr = cand.club ? `(${cand.club})` : '';
              const amountStr = `₹ ${Number(cand.totalFees || 0).toFixed(2)} (${isDue ? 'D' : 'P'})`;

              return (
                <tr key={cand.id || cand.chestNo} className="border-b border-gray-200 text-sm text-black">
                  <td className="py-0.5 px-2 text-center font-normal text-black w-12 leading-tight">
                    {idx + 1}
                  </td>
                  <td className="py-0.5 px-3 text-center font-bold text-black w-16 leading-tight">
                    {cand.chestNo}
                  </td>
                  <td className="py-0.5 px-3 text-left font-normal text-black leading-tight">
                    <span className="uppercase font-normal">{cand.name}</span>
                    {clubStr && <span className="ml-2 font-normal"> {clubStr}</span>}
                  </td>
                  <td className="py-0.5 px-3 text-left font-normal text-black w-32 leading-tight">
                    {eventsStr || '—'}
                  </td>
                  <td className="py-0.5 px-3 text-left font-normal text-black w-36 whitespace-nowrap leading-tight">
                    {amountStr}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // 2. Plain A4 Club Wise Candidate List (Redesigned as per Candidate List (Club wise)A4_001.png)
  function renderA4ClubWise() {
    const clubDisplayName = settings.registeredClubName || settings.organizer || 'Organizing club name...';
    const meetTitle = settings.ordinalTitle || 'Meet ordinal...';
    const logoSrc = settings.registeredClubLogo || clubs[0]?.logoUrl || '/icon.png';

    return (
      <div className="bg-white p-0 border-0 outline-none shadow-none text-black font-sans">
        {displayedClubNames.map((clubName) => {
          const athletes = clubGroupedCandidates[clubName] || [];
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
            >
              {/* Top Header: Logo + Organizing club / Meet ordinal on Left, Timestamp on Right */}
              <div className="flex items-center justify-between text-xs text-black pb-1">
                <div className="flex items-center gap-2">
                  <img
                    src={logoSrc}
                    alt="Club Logo"
                    className="w-5 h-5 object-contain rounded-full"
                  />
                  <span className="font-bold text-black text-xs sm:text-sm">
                    {clubDisplayName} / {meetTitle}
                  </span>
                </div>
                <div className="text-[11px] text-black font-normal">
                  {formatA4ClubTimestamp()}
                </div>
              </div>

              {/* Horizontal line under header */}
              <div className="border-b border-black mb-2"></div>

              {/* Participated Club: <Club Name> with bold underlined club name */}
              <div className="text-xs sm:text-sm text-black mb-3">
                <span>Participated Club: </span>
                <span className="font-bold underline">{clubName}</span>
              </div>

              {/* Table without box/grid borders, underlined column headers */}
              <table className="w-full text-left text-xs border-collapse text-black mb-2 font-sans">
                <thead>
                  <tr className="text-black font-bold">
                    <th className="py-1 px-2 text-center w-12 font-bold underline">Sl.</th>
                    <th className="py-1 px-3 text-center w-16 font-bold underline">Ch#</th>
                    <th className="py-1 px-3 text-left font-bold underline">Name</th>
                    <th className="py-1 px-3 text-left w-32 font-bold underline">Events</th>
                    <th className="py-1 px-3 text-right w-28 font-bold underline">Amount</th>
                    <th className="py-1 px-3 text-center w-24 font-bold underline">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {athletes.map((cand, aIdx) => {
                    const isDue = (cand.feeStatus || '').toUpperCase().includes('DUE') || (cand.feeStatus || '').toUpperCase().includes('UNPAID');
                    const eventsStr = (cand.selectedEvents || []).map(Number).sort((a, b) => a - b).join(',');
                    return (
                      <tr key={cand.id || cand.chestNo} className="text-xs text-black">
                        <td className="py-1 px-2 text-center font-normal text-black w-12">{aIdx + 1}</td>
                        <td className="py-1 px-3 text-center font-bold text-black w-16">{cand.chestNo}</td>
                        <td className="py-1 px-3 text-left font-normal uppercase text-black">{cand.name}</td>
                        <td className="py-1 px-3 text-left font-normal text-black w-32">{eventsStr || '—'}</td>
                        <td className="py-1 px-3 text-right font-normal text-black w-28">₹ {Number(cand.totalFees || 0).toFixed(2)}</td>
                        <td className="py-1 px-3 text-center font-normal text-black w-24">{isDue ? 'Due' : 'Paid'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Paid: ₹ x.xx   Due ₹ y.yy (with gray background highlight on Due) */}
              <div className="flex justify-end text-xs text-black mb-2 font-normal">
                <div className="flex items-center gap-3">
                  <span>Paid: ₹ {clubTotalPaid.toFixed(2)}</span>
                  <span className="bg-slate-300 px-2 py-0.5 font-bold text-black">
                    Due ₹ {clubTotalDue.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* eSports (Sports Management System) Footer */}
              <div className="flex items-center gap-1.5 text-xs font-semibold text-black mb-2">
                <img src="/icon.png" alt="eSports" className="w-4 h-4 object-contain" />
                <span>eSports (Sports Management System)</span>
              </div>

              {/* Dotted horizontal line separator between clubs */}
              <div className="border-b-2 border-dotted border-black/80 my-3"></div>
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Plain A4 Hit List (Field Recording Sheet as per HitListA4Reports.jpg)
  function renderA4HitList() {
    const eventsToRender = selectedHitEvtNo === 'all'
      ? (eventsWithHeats.length > 0 ? eventsWithHeats : events.filter(e => candidates.some(c => (c.selectedEvents || []).map(Number).includes(Number(e.Evt_No)))))
      : events.filter(e => String(e.Evt_No) === selectedHitEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="bg-white p-6 border-0 outline-none text-center text-black">
          <p className="font-bold">No event hit lists or candidate enrollments found.</p>
        </div>
      );
    }

    const clubDisplayName = (settings.registeredClubName || settings.organizer || 'SASHTITALA AGRANI').toUpperCase();
    const meetTitle = (settings.ordinalTitle || '47TH ANNUAL SPORTS MEET 2027').toUpperCase();
    const logoSrc = settings.registeredClubLogo || '/icon.png';

    const formatHeightClean = (hStr?: string) => {
      if (!hStr) return 'ALL';
      const clean = hStr.trim().toUpperCase();
      if (clean === 'ALL') return 'ALL';
      return clean.replace(/[`']/g, "'").replace(/''|``|"/g, '"');
    };

    return (
      <div className="space-y-10 bg-white p-0 border-0 outline-none shadow-none text-black">
        {eventsToRender.map((evt, evtIdx) => {
          const evtHeats = heats.filter(h => Number(h.eventNo) === Number(evt.Evt_No));
          const enrolled = candidates.filter(c => (c.selectedEvents || []).map(Number).includes(Number(evt.Evt_No)))
            .sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));

          const cleanHeight = formatHeightClean(evt.Height);
          const isLastEvent = evtIdx === eventsToRender.length - 1;

          return (
            <div 
              key={evt.Evt_No} 
              className="bg-white p-0 border-0 outline-none shadow-none text-black font-sans"
              style={{
                pageBreakAfter: isLastEvent ? 'auto' : 'always',
                breakAfter: isLastEvent ? 'auto' : 'page',
              }}
            >
              {/* Top Header: Logo on Left + Centered Club Name & Meet Title */}
              <div className="relative mb-2">
                <div className="absolute left-0 top-0">
                  <img 
                    src={logoSrc} 
                    alt="Club Logo" 
                    className="w-14 h-14 object-contain"
                  />
                </div>
                <div className="text-center pt-0.5 pb-2">
                  <h1 className="text-xl sm:text-2xl font-black text-black uppercase tracking-wide leading-tight">
                    {clubDisplayName}
                  </h1>
                  <h2 className="text-xs sm:text-sm font-bold text-black uppercase tracking-wide leading-tight mt-1">
                    {meetTitle}
                  </h2>
                </div>
              </div>

              {/* Horizontal Divider Line */}
              <div className="border-b border-black mb-3"></div>

              {/* Event Header Bar (Thick border above and below) */}
              <div className="border-t-2 border-b-2 border-black py-1.5 px-0.5 mb-3 flex items-center justify-between">
                <div className="font-bold text-sm sm:text-base text-black uppercase tracking-wide">
                  EVENT #{evt.Evt_No} : {evt.Evt_Name} / {cleanHeight} / {evt.Gender}
                </div>
                <div className="font-bold text-sm sm:text-base text-black uppercase tracking-wider">
                  HIT LIST
                </div>
              </div>

              {/* Table rendering: Heats or Enrolled Participants */}
              {evtHeats.length > 0 ? (
                <div className="space-y-6">
                  {evtHeats.map((heat) => (
                    <div key={heat.id}>
                      {evtHeats.length > 1 && (
                        <div className="text-xs font-black uppercase text-black mb-1">
                          HEAT {heat.heatNumber} ({heat.participants?.length || 0} Runners)
                        </div>
                      )}
                      <table className="w-full text-left border-collapse border border-black bg-white">
                        <thead>
                          <tr className="bg-white text-black font-bold">
                            <th rowSpan={2} className="border border-black py-2 px-1 text-center text-xs uppercase" style={{ width: '40px' }}>
                              SL.
                            </th>
                            <th rowSpan={2} className="border border-black py-2 px-1 text-center text-xs uppercase font-bold" style={{ width: '60px', minWidth: '60px' }}>
                              CHEST NO.
                            </th>
                            <th rowSpan={2} className="border border-black py-2 px-3 text-left text-xs uppercase font-bold">
                              NAME (CLUB NAME)
                            </th>
                            <th colSpan={4} className="border border-black py-1 px-1 text-center text-xs uppercase font-bold">
                              POSITION / CHANCE
                            </th>
                          </tr>
                          <tr className="bg-white text-black font-bold">
                            <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>1</th>
                            <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>2</th>
                            <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>3</th>
                            <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>4</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(heat.participants || []).map((p, idx) => {
                            const club = getClubInfo(p.club || '');
                            const clubNameStr = club?.name || p.club || 'BANDIPUR';
                            return (
                              <tr key={p.chestNo} className="bg-white">
                                <td className="border border-black py-2.5 px-1 text-center text-sm font-normal text-black" style={{ width: '40px' }}>
                                  {idx + 1}
                                </td>
                                <td className="border border-black py-2.5 px-1 text-center text-sm font-bold text-black" style={{ width: '60px', minWidth: '60px' }}>
                                  {p.chestNo}
                                </td>
                                <td className="border border-black py-2.5 px-3 text-left text-sm font-normal text-black uppercase">
                                  {p.candidateName} ({clubNameStr})
                                </td>
                                <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                                <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                                <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                                <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <table className="w-full text-left border-collapse border border-black bg-white">
                    <thead>
                      <tr className="bg-white text-black font-bold">
                        <th rowSpan={2} className="border border-black py-2 px-1 text-center text-xs uppercase" style={{ width: '40px' }}>
                          SL.
                        </th>
                        <th rowSpan={2} className="border border-black py-2 px-1 text-center text-xs uppercase font-bold" style={{ width: '60px', minWidth: '60px' }}>
                          CHEST NO.
                        </th>
                        <th rowSpan={2} className="border border-black py-2 px-3 text-left text-xs uppercase font-bold">
                          NAME (CLUB NAME)
                        </th>
                        <th colSpan={4} className="border border-black py-1 px-1 text-center text-xs uppercase font-bold">
                          POSITION / CHANCE
                        </th>
                      </tr>
                      <tr className="bg-white text-black font-bold">
                        <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>1</th>
                        <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>2</th>
                        <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>3</th>
                        <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>4</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolled.map((cand, idx) => (
                        <tr key={cand.id || cand.chestNo} className="bg-white">
                          <td className="border border-black py-2.5 px-1 text-center text-sm font-normal text-black" style={{ width: '40px' }}>
                            {idx + 1}
                          </td>
                          <td className="border border-black py-2.5 px-1 text-center text-sm font-bold text-black" style={{ width: '60px', minWidth: '60px' }}>
                            {cand.chestNo}
                          </td>
                          <td className="border border-black py-2.5 px-3 text-left text-sm font-normal text-black uppercase">
                            {cand.name} ({cand.club || 'BANDIPUR'})
                          </td>
                          <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                          <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                          <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                          <td className="border border-black py-2.5 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer as per HitListA4Reports.jpg */}
              <div className="flex items-center justify-between mt-2.5 pt-1 text-black">
                <div className="flex items-center gap-1.5 text-xs text-black font-medium">
                  <img src="/icon.png" alt="eSports" className="w-4 h-4 object-contain" />
                  <span>eSports (Sport Management System)</span>
                </div>
                <div className="text-[11px] text-black font-normal">
                  {currentTimestamp}
                </div>
              </div>

              {/* Bottom dashed line separator */}
              <div className="border-b border-dashed border-slate-300 mt-2"></div>
            </div>
          );
        })}
      </div>
    );
  }

  // 4. Plain A4 Final List (Redesigned as per FinalListA4Reports.JPG without signatures)
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

    const clubDisplayName = (settings.registeredClubName || settings.organizer || 'SASHTITALA AGRANI').toUpperCase();
    const meetTitle = (settings.ordinalTitle || '47TH ANNUAL SPORTS MEET 2027').toUpperCase();
    const logoSrc = settings.registeredClubLogo || '/icon.png';

    const formatHeightClean = (hStr?: string) => {
      if (!hStr) return 'ALL';
      const clean = hStr.trim().toUpperCase();
      if (clean === 'ALL') return 'ALL';
      return clean.replace(/[`']/g, "'").replace(/''|``|"/g, '"');
    };

    return (
      <div className="space-y-10 bg-white p-0 border-0 outline-none shadow-none text-black">
        {eventsToRender.map((evt, evtIdx) => {
          const res = results.find(r => Number(r.eventNo) === Number(evt.Evt_No));
          const directFinalists = res?.finalists || [];
          const isHitRequired = evt.requiredHit !== false && String(evt.requiredHit).toLowerCase() !== 'no';
          
          const finalistsList = directFinalists.length > 0
            ? directFinalists
            : (!isHitRequired
                ? candidates
                    .filter(c => (c.selectedEvents || []).map(Number).includes(Number(evt.Evt_No)))
                    .sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0))
                    .map(c => ({
                      chestNo: c.chestNo,
                      candidateName: c.name,
                      club: c.club,
                    }))
                : []);

          const cleanHeight = formatHeightClean(evt.Height);
          const isLastEvent = evtIdx === eventsToRender.length - 1;

          return (
            <div 
              key={evt.Evt_No} 
              className="bg-white p-0 border-0 outline-none shadow-none text-black font-sans"
              style={{
                pageBreakAfter: isLastEvent ? 'auto' : 'always',
                breakAfter: isLastEvent ? 'auto' : 'page',
              }}
            >
              {/* Top Header: Logo on Left + Centered Club Name & Meet Title */}
              <div className="relative mb-2">
                <div className="absolute left-0 top-0">
                  <img 
                    src={logoSrc} 
                    alt="Club Logo" 
                    className="w-14 h-14 object-contain rounded-full"
                  />
                </div>
                <div className="text-center pt-0.5 pb-2">
                  <h1 className="text-xl sm:text-2xl font-black text-black uppercase tracking-wide leading-tight">
                    {clubDisplayName}
                  </h1>
                  <h2 className="text-xs sm:text-sm font-bold text-black uppercase tracking-wide leading-tight mt-1">
                    {meetTitle}
                  </h2>
                </div>
              </div>

              {/* Horizontal Divider Line */}
              <div className="border-b-2 border-black mb-1"></div>

              {/* Event Header Bar */}
              <div className="py-1 px-0.5 mb-2 flex items-center justify-between text-black font-bold uppercase text-sm sm:text-base">
                <div>
                  EVENT #{evt.Evt_No} : {evt.Evt_Name} / {cleanHeight} / {evt.Gender}
                </div>
                <div className="tracking-wider">
                  FINAL LIST
                </div>
              </div>

              {/* Finalists Table: Matches FinalListA4Reports.JPG exactly */}
              <table className="w-full text-left border-collapse border border-black bg-white">
                <thead>
                  <tr className="bg-white text-black font-bold">
                    <th 
                      rowSpan={2} 
                      className="border border-black py-2 px-1 text-center text-xs uppercase font-bold"
                      style={{ width: '48px' }}
                    >
                      SL.
                    </th>
                    <th 
                      rowSpan={2} 
                      className="border border-black py-2 px-1 text-center text-xs uppercase font-bold"
                      style={{ width: '70px', minWidth: '70px' }}
                    >
                      CHEST NO.
                    </th>
                    <th 
                      rowSpan={2} 
                      className="border border-black py-2 px-3 text-left text-xs uppercase font-bold"
                    >
                      NAME (CLUB NAME)
                    </th>
                    <th 
                      colSpan={4} 
                      className="border border-black py-1 px-1 text-center text-xs uppercase font-bold"
                    >
                      POSITION / CHANCE
                    </th>
                  </tr>
                  <tr className="bg-white text-black font-bold">
                    <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>1</th>
                    <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>2</th>
                    <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>3</th>
                    <th className="border border-black py-1 px-1 text-center text-xs font-bold" style={{ width: '85px', minWidth: '85px' }}>4</th>
                  </tr>
                </thead>
                <tbody>
                  {finalistsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-black py-4 text-center font-normal text-slate-500">
                        Finalist list not generated yet for this event.
                      </td>
                    </tr>
                  ) : (
                    finalistsList.map((f, idx) => {
                      const club = getClubInfo(f.club || '');
                      const clubNameStr = club?.name || f.club || 'BANDIPUR';
                      return (
                        <tr key={f.chestNo} className="bg-white">
                          <td 
                            className="border border-black py-3 px-1 text-center text-sm font-normal text-black"
                            style={{ width: '48px' }}
                          >
                            {idx + 1}
                          </td>
                          <td 
                            className="border border-black py-3 px-1 text-center text-sm font-bold text-black"
                            style={{ width: '70px', minWidth: '70px' }}
                          >
                            {f.chestNo}
                          </td>
                          <td className="border border-black py-3 px-3 text-left text-sm font-normal text-black uppercase">
                            {f.candidateName} ({clubNameStr})
                          </td>
                          <td className="border border-black py-3 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                          <td className="border border-black py-3 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                          <td className="border border-black py-3 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                          <td className="border border-black py-3 px-1 text-center" style={{ width: '85px', minWidth: '85px' }}></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Footer as per FinalListA4Reports.JPG without signatures */}
              <div className="flex items-center justify-between mt-3 pt-1 text-black">
                <div className="flex items-center gap-1.5 text-xs text-black font-medium">
                  <img src="/icon.png" alt="eSports" className="w-4 h-4 object-contain" />
                  <span>eSports (Sports Management System)</span>
                </div>
                <div className="text-[11px] text-black font-normal">
                  {currentTimestamp}
                </div>
              </div>

              {/* Bottom dotted separator */}
              <div className="border-b border-dotted border-black/80 mt-1"></div>
            </div>
          );
        })}
      </div>
    );
  }

  // 5. Plain A4 Ranking Sheet (Redesigned as per RankingA4.png)
  function renderA4RankingSheet() {
    const eventsToRender = selectedRankingEvtNo === 'all'
      ? eventsWithRankings
      : events.filter(e => String(e.Evt_No) === selectedRankingEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="bg-white p-6 border-0 outline-none text-center text-black">
          <p className="font-bold">No event rankings recorded yet.</p>
        </div>
      );
    }

    const clubDisplayName = (settings.registeredClubName || settings.organizer || 'SASHTITALA AGRANI').toUpperCase();
    const meetTitle = (settings.ordinalTitle || '47TH ANNUAL SPORTS MEET 2027').toUpperCase();
    const logoSrc = settings.registeredClubLogo || '/icon.png';

    const formatHeightClean = (hStr?: string) => {
      if (!hStr) return 'ALL';
      const clean = hStr.trim().toUpperCase();
      if (clean === 'ALL') return 'ALL';
      return clean.replace(/[`']/g, "'").replace(/''|``|"/g, '"');
    };

    return (
      <div className="bg-white p-0 border-0 outline-none shadow-none text-black font-sans">
        {/* Top Header: Logo + Club & Meet Title on Left | FINAL RANKINGS on Right */}
        <div className="flex items-center justify-between pb-2 mb-1 text-black">
          <div className="flex items-center gap-3">
            <img 
              src={logoSrc} 
              alt="Club Logo" 
              className="w-12 h-12 object-contain rounded-full shrink-0"
            />
            <div className="text-left">
              <h1 className="text-xl sm:text-2xl font-black text-black uppercase tracking-tight leading-tight">
                {clubDisplayName}
              </h1>
              <h2 className="text-xs sm:text-sm font-bold text-black uppercase tracking-wide leading-tight mt-0.5">
                {meetTitle}
              </h2>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-black">
              FINAL RANKINGS
            </h2>
          </div>
        </div>

        {/* Thick Horizontal Divider */}
        <div className="border-b-2 border-black mb-4"></div>

        {/* Events Cards */}
        <div className="space-y-6">
          {eventsToRender.map((evt) => {
            const res = results.find(r => Number(r.eventNo) === Number(evt.Evt_No));
            const ranked = (res?.winners && res.winners.length > 0 ? res.winners : (res?.finalists || []))
              .filter(f => (f.position || 0) > 0)
              .sort((a, b) => (a.position || 0) - (b.position || 0));

            const cleanHeight = formatHeightClean(evt.Height);
            const isBroadJump = (evt.Evt_Name || '').toUpperCase().includes('BROAD JUMP');

            return (
              <div key={evt.Evt_No} className="avoid-break">
                {/* Event Header Box */}
                <div className="border border-slate-300 rounded-xs py-1.5 px-3 mb-2 flex items-center text-sm font-sans">
                  <span className="text-black font-normal mr-4">Event:</span>
                  <span className="font-bold text-black mr-6">{evt.Evt_No}</span>
                  <span className="font-bold text-black uppercase">
                    {evt.Evt_Name} / {cleanHeight} / {evt.Gender}
                  </span>
                </div>

                {/* Rankings Table as per RankingA4.png without box borders and with underlined headers */}
                <table className="w-full text-left text-sm border-collapse text-black mb-3 font-sans">
                  <thead>
                    <tr className="text-black font-bold">
                      <th className="pb-1 text-left w-24 font-bold underline">Position</th>
                      <th className="pb-1 text-left w-24 font-bold underline">Chest No</th>
                      <th className="pb-1 text-left font-bold underline">Name (Club name)</th>
                      {isBroadJump && (
                        <th className="pb-1 text-left w-28 font-bold underline">Jump</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.length === 0 ? (
                      <tr>
                        <td colSpan={isBroadJump ? 4 : 3} className="py-2 text-slate-500 italic text-xs">
                          No rankings recorded yet for this event.
                        </td>
                      </tr>
                    ) : (
                      ranked.map((r, idx) => {
                        const club = getClubInfo(r.club || '');
                        const isSelf = (r.club || '').trim().toUpperCase() === 'SELF';
                        const clubNameStr = isSelf ? '' : (club?.name || r.club || '');
                        const clubText = clubNameStr ? `(${clubNameStr})` : '';
                        const posLabel = getPositionWord(r.position, idx);

                        return (
                          <tr key={r.chestNo} className="text-sm text-black">
                            <td className="py-1 text-left font-normal text-black w-24">
                              {posLabel}
                            </td>
                            <td className="py-1 text-left font-bold text-black w-24">
                              {r.chestNo}
                            </td>
                            <td className="py-1 text-left font-normal text-black uppercase">
                              {r.candidateName} {clubText}
                            </td>
                            {isBroadJump && (
                              <td className="py-1 text-left font-normal text-black w-28 font-mono">
                                {formatJumpBenchmark(r.jumpRecord || r.resultValue) || r.jumpRecord || r.resultValue || '—'}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 6. Plain A4 Club Championship Points (Top 3 Boxes + All Club Standings Table)
  function renderA4Championship() {
    return (
      <div className="bg-white p-0 border-0 outline-none shadow-none text-black">
        {/* Top Header without Venue, Dates, and Organized By line */}
        {renderA4Header('ANNUAL SPORTS MEET CLUB TEAM CHAMPIONSHIP', 'OFFICIAL PODIUM STANDINGS & CERTIFICATION', undefined, true)}

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

        {/* All Club Details Table as per attached format Club Report.jpeg */}
        <table className="w-full text-left text-xs border-collapse border border-black mb-6">
          <thead>
            <tr className="border-b border-black font-bold uppercase text-black bg-white">
              <th className="border border-black py-2.5 px-3 w-16 text-center font-bold text-xs uppercase">
                RANK
              </th>
              <th className="border border-black py-2.5 px-3 font-bold text-xs uppercase text-left">
                CLUB NAME
              </th>
              <th className="border border-black py-2.5 px-3 w-44 text-center font-bold text-xs uppercase">
                MOBILE
              </th>
              <th className="border border-black py-2.5 px-2 w-20 text-center font-bold text-xs uppercase leading-tight">
                <div>GOLD</div>
                <div>(7)</div>
              </th>
              <th className="border border-black py-2.5 px-2 w-20 text-center font-bold text-xs uppercase leading-tight">
                <div>SILVER</div>
                <div>(5)</div>
              </th>
              <th className="border border-black py-2.5 px-2 w-20 text-center font-bold text-xs uppercase leading-tight">
                <div>BRONZE</div>
                <div>(4)</div>
              </th>
              <th className="border border-black py-2.5 px-3 w-28 text-center font-bold text-xs uppercase leading-tight">
                <div>TOTAL</div>
                <div>POINTS</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {allRankedClubs.map((team, idx) => (
              <tr key={team.name} className="border-b border-black bg-white">
                <td className="border border-black py-2.5 px-3 text-center font-bold text-black text-xs">
                  {getOrdinalRank(idx + 1)}
                </td>
                <td className="border border-black py-2.5 px-3 font-bold text-black text-xs">
                  {team.name}
                </td>
                <td className="border border-black py-2.5 px-3 text-center font-medium text-black text-xs">
                  {team.mobile || team.phone || ''}
                </td>
                <td className="border border-black py-2.5 px-2 text-center font-bold text-black text-xs">
                  {team.gold}
                </td>
                <td className="border border-black py-2.5 px-2 text-center font-bold text-black text-xs">
                  {team.silver}
                </td>
                <td className="border border-black py-2.5 px-2 text-center font-bold text-black text-xs">
                  {team.bronze}
                </td>
                <td className="border border-black py-2.5 px-3 text-center font-bold text-black text-xs whitespace-nowrap">
                  {team.points} pts
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
};

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Sliders,
  Bluetooth,
  RefreshCw
} from 'lucide-react';
import { parseJumpToInches, formatJumpBenchmark } from './RankingList';
import { ThermalPageSetupModal } from './ThermalPageSetupModal';
import { 
  ThermalPrintSettings, 
  getThermalSettings, 
  generateThermalPrintCSS,
  formatThermalEventSuffix 
} from '../utils/thermalSettings';
import { 
  printDirectlyToThermalPrinter, 
  isWebBluetoothSupported, 
  isMobileClient 
} from '../utils/thermalBluetoothPrint';
import { ThermalLogo } from './ThermalLogo';
import { ThermalTwoLineRecord } from './ThermalTwoLineRecord';
import { receiptDomToOfflineHtmlBlob } from '../utils/thermalLogo';
import {
  WhatsAppIcon,
  buildServerReportFileName,
  shareThermalHtmlBlob,
  shareA4PdfBlob,
} from '../utils/whatsappThermalReport';
import { generateNameListA4PdfBlob } from '../utils/nameListA4Pdf';
import { isExcludedClubForRanking } from '../utils/clubRankingFilter';
import { ClubEchoPrintModal } from './ClubEchoPrintModal';
import {
  FirstPrintCategory,
  isEventHitRequired,
  hasWarnedFirstPrint,
  markFirstPrintWarned,
} from '../utils/qualificationRules';

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
  onSaveSettings?: (settings: SportsMeetSettings) => Promise<void> | void;
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
  onSaveSettings,
}) => {
  // Navigation & format states
  const [reportType, setReportType] = useState<ReportType>('chest');
  const [paperFormat, setPaperFormat] = useState<PaperFormat>('a4');

  // Club selection filter for Club-wise report ('' until selected, 'all' or specific club name)
  const [selectedClubFilter, setSelectedClubFilter] = useState<string>('');

  // Event selection filters for Hit, Final, Ranking reports ('' until selected, 'all' or specific event number)
  const [selectedHitEvtNo, setSelectedHitEvtNo] = useState<string>('');
  const [selectedFinalEvtNo, setSelectedFinalEvtNo] = useState<string>('');
  const [selectedRankingEvtNo, setSelectedRankingEvtNo] = useState<string>('');

  const isFilterRequiredAndMissing =
    (reportType === 'club' && !selectedClubFilter) ||
    (reportType === 'hit' && !selectedHitEvtNo) ||
    (reportType === 'final' && !selectedFinalEvtNo) ||
    (reportType === 'ranking' && !selectedRankingEvtNo);

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
      if (isExcludedClubForRanking(cleanName)) return;
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
      if (isExcludedClubForRanking(cClub)) return;
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
        if (isExcludedClubForRanking(fClub)) return;
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
  const [isPrintingDirect, setIsPrintingDirect] = useState<boolean>(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState<boolean>(false);
  const [directPrintStatus, setDirectPrintStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [echoPrintModalState, setEchoPrintModalState] = useState<{
    category: FirstPrintCategory;
    evtNos: number[];
    contextLabel: string;
  } | null>(null);
  const thermalReceiptRef = useRef<HTMLDivElement | null>(null);
  const offscreenThermalShareRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleSettingsChange = (e: any) => {
      if (e.detail) {
        setThermalConfig(e.detail);
      }
    };
    window.addEventListener('thermal-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('thermal-settings-changed', handleSettingsChange);
  }, []);

  const executeActualPrint = async () => {
    if (paperFormat === 'thermal' && (isMobileClient() || isWebBluetoothSupported())) {
      const receiptEl = document.querySelector('.receipt') as HTMLElement | null;
      setIsPrintingDirect(true);
      setDirectPrintStatus({ message: 'Sending to Bluetooth thermal printer...', type: 'info' });

      try {
        const result = await printDirectlyToThermalPrinter(receiptEl, thermalConfig);

        if (result.success) {
          setDirectPrintStatus({ message: 'Printed directly to thermal printer successfully!', type: 'success' });
          setTimeout(() => setDirectPrintStatus(null), 4000);
        } else {
          setDirectPrintStatus({ message: result.message, type: 'error' });
        }
      } catch (err: any) {
        console.warn('Reports thermal print fallback:', err?.message || err);
        window.print();
        setDirectPrintStatus({ message: 'Printed via print dialog (Bluetooth unavailable in this frame)', type: 'info' });
        setTimeout(() => setDirectPrintStatus(null), 4000);
      } finally {
        setIsPrintingDirect(false);
      }
      return;
    }

    // Default desktop/standard print
    window.print();
  };

  const handlePrint = async () => {
    if (isFilterRequiredAndMissing) {
      setDirectPrintStatus({ message: 'Please select a specific club or event from the dropdown before printing.', type: 'error' });
      setTimeout(() => setDirectPrintStatus(null), 4000);
      return;
    }

    const isClubEchoOn = settings?.clientResponseEnabled !== false;
    if (isClubEchoOn) {
      if (reportType === 'hit') {
        const targetEvents = (selectedHitEvtNo === 'all'
          ? eventsWithHeats
          : eventsWithHeats.filter((e) => String(e.Evt_No) === String(selectedHitEvtNo))
        ).filter((e) => isEventHitRequired(e) && !hasWarnedFirstPrint('hit', e.Evt_No));

        if (targetEvents.length > 0) {
          const evtNos = targetEvents.map((e) => Number(e.Evt_No));
          const contextLabel =
            targetEvents.length === 1
              ? `Event #${targetEvents[0].Evt_No}: ${targetEvents[0].Evt_Name} — Hit List`
              : `Events #${evtNos.join(', #')} — Hit List`;
          setEchoPrintModalState({ category: 'hit', evtNos, contextLabel });
          return;
        }
      }

      if (reportType === 'final') {
        const targetEvents = (selectedFinalEvtNo === 'all'
          ? eventsWithFinalists
          : eventsWithFinalists.filter((e) => String(e.Evt_No) === String(selectedFinalEvtNo))
        ).filter((e) => !isEventHitRequired(e) && !hasWarnedFirstPrint('direct-final', e.Evt_No));

        if (targetEvents.length > 0) {
          const evtNos = targetEvents.map((e) => Number(e.Evt_No));
          const contextLabel =
            targetEvents.length === 1
              ? `Event #${targetEvents[0].Evt_No}: ${targetEvents[0].Evt_Name} — Direct Final List`
              : `Events #${evtNos.join(', #')} — Direct Final List`;
          setEchoPrintModalState({ category: 'direct-final', evtNos, contextLabel });
          return;
        }
      }
    }

    await executeActualPrint();
  };

  const handleShareWhatsApp = async () => {
    if (isFilterRequiredAndMissing) {
      setDirectPrintStatus({ message: 'Please select a specific club or event from the dropdown before sharing.', type: 'error' });
      setTimeout(() => setDirectPrintStatus(null), 4000);
      return;
    }

    const currentYear = new Date().getFullYear();

    // Name List in Normal (A4) mode: share as pure A4 PDF file
    if (reportType === 'chest' && paperFormat === 'a4') {
      if (chestWiseCandidates.length === 0) {
        setDirectPrintStatus({ message: 'No candidate records available to share.', type: 'error' });
        setTimeout(() => setDirectPrintStatus(null), 4000);
        return;
      }

      const fileName = buildServerReportFileName('chest', { year: currentYear, extension: 'pdf' });
      const docTitle = `Name List - ${currentYear}`;
      setIsSharingWhatsApp(true);
      setDirectPrintStatus({ message: 'Generating Name List A4 PDF...', type: 'info' });

      try {
        const pdfBlob = await generateNameListA4PdfBlob({
          candidates: chestWiseCandidates,
          settings,
          clubs,
        });
        if (!pdfBlob) {
          setDirectPrintStatus({ message: 'Failed to generate Name List A4 PDF.', type: 'error' });
          setTimeout(() => setDirectPrintStatus(null), 4000);
          return;
        }
        const res = await shareA4PdfBlob(pdfBlob, fileName, docTitle);
        if (!res.cancelled) {
          setDirectPrintStatus({ message: res.message, type: res.success ? 'success' : 'error' });
          setTimeout(() => setDirectPrintStatus(null), 5000);
        } else {
          setDirectPrintStatus(null);
        }
      } finally {
        setIsSharingWhatsApp(false);
      }
      return;
    }

    // Thermal reports (Name List, Hit List, Final List, Ranking List, Club Wise Candidate, Club Ranking):
    // share complete page data including white thermal paper in offline HTML format
    const targetEl =
      (paperFormat === 'thermal' ? thermalReceiptRef.current : offscreenThermalShareRef.current) ||
      (document.querySelector('.receipt') as HTMLElement | null);

    const reportLabelMap: Record<ReportType, string> = {
      chest: 'Name List',
      hit: 'Hit List',
      final: 'Final List',
      ranking: 'Ranking List',
      club: 'Club Wise Candidate Report',
      championship: 'Club Ranking Report',
    };
    const reportLabel = reportLabelMap[reportType];

    const fileName = buildServerReportFileName(reportType, {
      year: currentYear,
      extension: 'html',
      eventNo:
        reportType === 'hit'
          ? selectedHitEvtNo
          : reportType === 'final'
          ? selectedFinalEvtNo
          : reportType === 'ranking'
          ? selectedRankingEvtNo
          : undefined,
      clubName: reportType === 'club' ? selectedClubFilter : undefined,
    });
    const docTitle = fileName.replace(/\.html$/i, '');

    if (!targetEl) {
      setDirectPrintStatus({ message: `Unable to locate ${reportLabel} thermal sheet for offline HTML export.`, type: 'error' });
      setTimeout(() => setDirectPrintStatus(null), 4000);
      return;
    }

    setIsSharingWhatsApp(true);
    setDirectPrintStatus({ message: `Generating offline HTML for ${reportLabel}...`, type: 'info' });

    try {
      const htmlBlob = await receiptDomToOfflineHtmlBlob(targetEl, {
        title: docTitle,
        printableWidthMm: thermalConfig.printableWidth,
      });
      if (!htmlBlob) {
        setDirectPrintStatus({ message: `Failed to generate offline HTML for ${reportLabel}.`, type: 'error' });
        setTimeout(() => setDirectPrintStatus(null), 4000);
        return;
      }
      const res = await shareThermalHtmlBlob(htmlBlob, fileName, docTitle);
      if (!res.cancelled) {
        setDirectPrintStatus({ message: res.message, type: res.success ? 'success' : 'error' });
        setTimeout(() => setDirectPrintStatus(null), 5000);
      } else {
        setDirectPrintStatus(null);
      }
    } finally {
      setIsSharingWhatsApp(false);
    }
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
        
        {/* Row 1: "Reports & Registers" Label */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <Printer className="w-5 h-5 text-blue-600 shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
              Reports &amp; Registers
            </h1>
          </div>
        </div>

        {/* Row 2: Format Switcher (Normal/Thermal) on Left | Thermal Setup, Print & WhatsApp Buttons (Icon Only) on Right */}
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

          {/* Action Buttons: Thermal Setup (left of Print, disabled when Normal), Print, WhatsApp (right of Print) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Thermal Page Setup (Icon Only, disabled when toggled to Normal) */}
            <button
              type="button"
              id="btn-thermal-page-setup"
              disabled={paperFormat !== 'thermal'}
              onClick={() => setShowThermalSetup(true)}
              className={`p-2 rounded-lg border transition-all flex items-center justify-center shrink-0 shadow-2xs ${
                paperFormat === 'thermal'
                  ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 active:scale-98 cursor-pointer'
                  : 'border-slate-200 bg-slate-100 text-slate-400 opacity-45 cursor-not-allowed'
              }`}
              title={
                paperFormat === 'thermal'
                  ? 'Thermal Printer Setup'
                  : 'Switch to Thermal mode to configure thermal page setup'
              }
              aria-label="Thermal Printer Setup"
            >
              <Sliders className="w-4 h-4 shrink-0" />
            </button>

            {/* Single Print Button (Icon Only) */}
            <button
              type="button"
              id="btn-execute-report-print"
              disabled={isPrintingDirect || isFilterRequiredAndMissing}
              onClick={handlePrint}
              className={`p-2 rounded-lg text-xs font-bold flex items-center justify-center transition-all shadow-xs active:scale-98 cursor-pointer ${
                paperFormat === 'thermal'
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } ${isPrintingDirect ? 'opacity-60 cursor-wait' : isFilterRequiredAndMissing ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={
                isFilterRequiredAndMissing
                  ? 'Select a club or event first before printing'
                  : isPrintingDirect 
                  ? 'Sending directly to thermal printer...'
                  : `Print Report (${paperFormat === 'thermal' ? '58mm Thermal' : 'A4 Normal'})`
              }
              aria-label="Print Report"
            >
              {isPrintingDirect ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
            </button>

            {/* WhatsApp Share Button (Icon Only, right of Print) */}
            <button
              type="button"
              id="btn-reports-whatsapp-share"
              disabled={isSharingWhatsApp || isFilterRequiredAndMissing}
              onClick={handleShareWhatsApp}
              className={`p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center shrink-0 shadow-2xs active:scale-98 cursor-pointer ${
                isSharingWhatsApp ? 'opacity-60 cursor-wait' : isFilterRequiredAndMissing ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title={
                isFilterRequiredAndMissing
                  ? 'Select a club or event first before sharing'
                  : reportType === 'chest'
                  ? paperFormat === 'a4'
                    ? 'Share Name List A4 Report (PDF)'
                    : 'Share Name List Thermal Report (Offline HTML)'
                  : reportType === 'hit'
                  ? 'Share Hit List Thermal Report (Offline HTML)'
                  : reportType === 'final'
                  ? 'Share Final List Thermal Report (Offline HTML)'
                  : reportType === 'ranking'
                  ? 'Share Ranking List Thermal Report (Offline HTML)'
                  : reportType === 'club'
                  ? 'Share Club Wise Bill Thermal Report (Offline HTML)'
                  : 'Share Club Ranking Thermal Report (Offline HTML)'
              }
              aria-label="Share via WhatsApp"
            >
              {isSharingWhatsApp ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white shrink-0" />
              ) : (
                <WhatsAppIcon className="w-4 h-4 text-white shrink-0" />
              )}
            </button>
          </div>
        </div>

        {directPrintStatus && (
          <div className={`p-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 border transition-all ${
            directPrintStatus.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : directPrintStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900 animate-pulse'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <Bluetooth className={`w-4 h-4 shrink-0 ${
                directPrintStatus.type === 'error' ? 'text-rose-600' : directPrintStatus.type === 'success' ? 'text-emerald-600' : 'text-amber-600'
              }`} />
              <span className="truncate">{directPrintStatus.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setDirectPrintStatus(null)}
              className="text-[11px] px-1.5 py-0.5 rounded font-bold hover:bg-black/10 shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

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
            onClick={() => {
              setSelectedClubFilter('');
              setReportType('club');
            }}
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
            onClick={() => {
              setSelectedHitEvtNo('');
              setReportType('hit');
            }}
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
            onClick={() => {
              setSelectedFinalEvtNo('');
              setReportType('final');
            }}
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
            onClick={() => {
              setSelectedRankingEvtNo('');
              setReportType('ranking');
            }}
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
                  <option value="">-- Select a Club --</option>
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
                  <option value="">-- Select an Event --</option>
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
                  <option value="">-- Select an Event --</option>
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
                  <option value="">-- Select an Event --</option>
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

      {isFilterRequiredAndMissing ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 sm:p-12 text-center shadow-2xs print:hidden">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
            {reportType === 'club' ? (
              <Building2 className="w-6 h-6 text-blue-600" />
            ) : reportType === 'hit' ? (
              <Flame className="w-6 h-6 text-orange-500" />
            ) : reportType === 'final' ? (
              <Medal className="w-6 h-6 text-blue-600" />
            ) : (
              <Trophy className="w-6 h-6 text-amber-500" />
            )}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-800">
            {reportType === 'club'
              ? 'Select a Club to Preview Report'
              : 'Select an Event to Preview Report'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {reportType === 'club'
              ? 'Choose a club from the dropdown above to preview and print its candidate report.'
              : 'Choose a specific event from the dropdown above to preview and print without accidentally printing all pages.'}
          </p>
        </div>
      ) : paperFormat === 'thermal' ? (
        /* ================= THERMAL PRINTER 58MM ROLL PAPER VIEW (EXACT PREVIEW MATCHING PRINT OUTPUT) ================= */
        <div className="flex flex-col items-center justify-center p-3 sm:p-8 bg-slate-300 rounded-2xl border border-slate-300 print:bg-white print:p-0 print:border-none">
          <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5 print:hidden">
            <Receipt className="w-3.5 h-3.5 text-amber-600" />
            <span>58mm Roll Preview ({thermalConfig.printableWidth}mm • {thermalConfig.fontSize}pt)</span>
          </div>
          <div 
            ref={thermalReceiptRef}
            className="receipt thermal-printable-wrapper bg-white text-black p-0 shadow-2xl rounded-xs select-none print:shadow-none print:p-0"
            style={{
              width: `${thermalConfig.printableWidth}mm`,
              maxWidth: `${thermalConfig.printableWidth}mm`,
              boxSizing: 'border-box',
              paddingLeft: `${thermalConfig.marginHorizontal}mm`,
              paddingRight: `${thermalConfig.marginHorizontal}mm`,
              paddingTop: `${thermalConfig.topMargin ?? 5}mm`,
              paddingBottom: `${thermalConfig.feedBeforeCut}mm`,
              fontSize: `${thermalConfig.fontSize}pt`,
              lineHeight: thermalConfig.lineSpacing,
              fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif'
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

      {/* Offscreen Thermal sheet for Club Wise, Hit List, Final List, Ranking List & Club Ranking so offline HTML share works even while Normal (A4) view is active */}
      {reportType !== 'chest' && paperFormat !== 'thermal' && !isFilterRequiredAndMissing && (
        <div
          aria-hidden="true"
          className="fixed -left-[99999px] top-0 pointer-events-none opacity-0 print:hidden"
        >
          <div
            ref={offscreenThermalShareRef}
            className="thermal-printable-wrapper bg-white text-black p-0"
            style={{
              width: `${thermalConfig.printableWidth}mm`,
              maxWidth: `${thermalConfig.printableWidth}mm`,
              boxSizing: 'border-box',
              paddingLeft: `${thermalConfig.marginHorizontal}mm`,
              paddingRight: `${thermalConfig.marginHorizontal}mm`,
              paddingTop: `${thermalConfig.topMargin ?? 5}mm`,
              paddingBottom: `${thermalConfig.feedBeforeCut}mm`,
              fontSize: `${thermalConfig.fontSize}pt`,
              lineHeight: thermalConfig.lineSpacing,
              fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif',
            }}
          >
            {reportType === 'club'
              ? renderThermalClubWise()
              : reportType === 'hit'
              ? renderThermalHitList()
              : reportType === 'final'
              ? renderThermalFinalList()
              : reportType === 'ranking'
              ? renderThermalRankingSheet()
              : renderThermalChampionship()}
          </div>
        </div>
      )}

      {/* 58mm Thermal Printer Page Setup Modal */}
      <ThermalPageSetupModal 
        isOpen={showThermalSetup} 
        onClose={() => setShowThermalSetup(false)} 
        settings={settings} 
      />

      {/* Club Echo ON Warning Flash Modal on First Print */}
      <ClubEchoPrintModal
        isOpen={Boolean(echoPrintModalState)}
        contextLabel={echoPrintModalState?.contextLabel}
        canTurnOffEcho={Boolean(onSaveSettings)}
        onTurnOffAndPrint={async () => {
          if (!echoPrintModalState) return;
          markFirstPrintWarned(echoPrintModalState.category, echoPrintModalState.evtNos);
          setEchoPrintModalState(null);
          if (onSaveSettings) {
            await onSaveSettings({ ...settings, clientResponseEnabled: false });
          }
          setTimeout(() => {
            executeActualPrint();
          }, 60);
        }}
        onContinuePrint={() => {
          if (!echoPrintModalState) return;
          markFirstPrintWarned(echoPrintModalState.category, echoPrintModalState.evtNos);
          setEchoPrintModalState(null);
          setTimeout(() => {
            executeActualPrint();
          }, 60);
        }}
        onCancel={() => setEchoPrintModalState(null)}
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

  // Header: Registered club logo placed beside left of registered club name, meet ordinal centered below
  function renderThermalHeader(specificClubName?: string, topMargin?: string) {
    const clubDisplayName = getThermalClubName(specificClubName);
    const clubLogo = specificClubName ? getThermalClubLogo(specificClubName) : getRegisteredClubLogo();

    return (
      <div 
        className="w-full pb-1 mb-1 border-b border-dashed border-black pt-1"
        style={topMargin ? { paddingTop: topMargin } : undefined}
      >
        <div className="flex items-center justify-center gap-1.5 leading-tight flex-wrap text-center">
          <ThermalLogo 
            src={clubLogo} 
            alt="Club Logo" 
            className="thermal-header-logo w-5 h-5 shrink-0 object-contain"
            rasterSizePx={64}
          />
          <span className="thermal-header-club font-bold uppercase tracking-tight text-black break-words">
            {clubDisplayName}
          </span>
        </div>
        <div className="thermal-ordinal-title font-normal text-black leading-tight mt-0.5 break-words text-center">
          {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
        </div>
      </div>
    );
  }

  // Footer: Brand logo and brand name "eSports-Sport Management" + timestamp (no top dashed border)
  function renderThermalFooter() {
    return (
      <div className="w-full text-center pt-1.5 mt-1 text-black">
        <div className="flex items-center justify-center gap-1 leading-tight flex-wrap">
          <ThermalLogo 
            src="/icon.png" 
            alt="eSports Logo" 
            className="thermal-footer-logo w-3.5 h-3.5 shrink-0 object-contain"
            rasterSizePx={48}
          />
          <span className="thermal-footer-brand font-semibold tracking-tight text-black break-words">
            eSports-Sport Management
          </span>
        </div>
        <div className="thermal-footer-time text-black leading-tight mt-0.5 break-words">
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

    return (
      <div style={{ fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif' }}>
        {renderThermalHeader()}

        <div className="text-center font-bold uppercase mb-1 tracking-wider leading-tight">
          NAME LIST
        </div>

        {/* Columns: SL, CH, NAME, EVTS */}
        <div className="flex items-center font-normal leading-tight text-black pb-0.5">
          <span className="w-[2.4em] pr-0.5 text-left shrink-0 font-normal">SL</span>
          <span className="w-[2.3em] text-left shrink-0 font-normal">CH</span>
          <span className="flex-1 text-left pl-0.5 font-normal">NAME</span>
          <span className="text-right pl-1 shrink-0 font-normal">EVTS</span>
        </div>
        <div className="w-full border-b border-black mb-1"></div>

        <div className="space-y-0 text-black">
          {chestWiseCandidates.map((c, idx) => {
            const clubText = c.club ? `(${c.club})` : '';
            const evtsText = (c.selectedEvents || []).map(Number).sort((a,b)=>a-b).join(',');
            return (
              <div key={c.id || c.chestNo}>
                <div className="flex items-start py-0.5 leading-tight">
                  <span className="w-[2.4em] pr-0.5 text-left font-normal shrink-0">{idx + 1}</span>
                  <span className="w-[2.3em] text-left font-normal shrink-0 thermal-chest-no">{c.chestNo}</span>
                  <div className="flex-1 min-w-0 text-left pl-0.5">
                    <ThermalTwoLineRecord
                      text={`${c.name} ${clubText}`.trim()}
                      rightText={evtsText}
                      rightClassName="max-w-[26%] !pl-1 thermal-record-clamp-2 thermal-evts-col font-normal"
                      deps={[thermalConfig.printableWidth, thermalConfig.fontSize, thermalConfig.lineSpacing, thermalConfig.marginHorizontal]}
                    />
                  </div>
                </div>
                <div className="w-full border-b border-dotted border-black/80"></div>
              </div>
            );
          })}
        </div>

        {/* Total Summary */}
        <div className="w-full mt-1 pt-0.5 font-normal leading-tight text-center text-black break-words">
          <span>Amt:{settings.currencySymbol || '₹'}{totalFees.toFixed(0)} | P:{settings.currencySymbol || '₹'}{totalPaid.toFixed(0)} | D:{settings.currencySymbol || '₹'}{totalDue.toFixed(0)}</span>
        </div>

        {renderThermalFooter()}
      </div>
    );
  }

  // 2. Thermal Club Wise Candidate List with Subtotal (One by One or All)
  function renderThermalClubWise() {
    return (
      <div className="space-y-3" style={{ fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif' }}>
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
              {renderThermalHeader()}

              <div className="font-normal mb-1 leading-tight text-black break-words thermal-club-banner">
                CLUB: [<span className="font-bold">{clubName}</span>]
              </div>

              <div className="pb-0.5 font-normal flex items-center leading-tight text-black">
                <span className="w-[2.6em] text-left shrink-0">CH</span>
                <span className="flex-1 text-left pl-1">NAME</span>
                <span className="text-right pl-1 shrink-0">EVTS</span>
              </div>
              <div className="w-full border-b border-black mb-1"></div>

              <div className="space-y-0.5 text-black">
                {athletes.map((c) => {
                  const evtsStr = (c.selectedEvents || []).map(Number).sort((a,b)=>a-b).join(',');
                  return (
                    <div key={c.id || c.chestNo} className="flex items-start leading-tight font-normal py-0.5 border-b border-dotted border-black/50 last:border-b-0">
                      <span className="w-[2.6em] text-left font-normal shrink-0 thermal-chest-no">{c.chestNo}</span>
                      <div className="flex-1 min-w-0 text-left pl-1">
                        <ThermalTwoLineRecord
                          text={c.name}
                          rightText={evtsStr}
                          rightClassName="max-w-[32%] thermal-record-clamp-2 thermal-evts-col font-normal"
                          deps={[thermalConfig.printableWidth, thermalConfig.fontSize, thermalConfig.lineSpacing, thermalConfig.marginHorizontal]}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="w-full border-b border-dashed border-black my-1"></div>

              <div className="club-subtotal-section text-black font-normal space-y-0.5">
                <div className="flex justify-between items-center leading-tight flex-wrap gap-1">
                  <span className="text-left font-normal">Enrolled: {athletes.length}</span>
                  <span className="text-right font-normal">Total: ₹{clubTotalFees.toFixed(0)}</span>
                </div>

                <div className="flex justify-between items-center leading-tight flex-wrap gap-1">
                  <span className="text-left font-normal">Paid: ₹{clubTotalPaid.toFixed(0)}</span>
                  <span className="text-right font-normal">Due: ₹{clubTotalDue.toFixed(0)}</span>
                </div>

                <div className="w-full border-b border-black my-1"></div>

                <div className="text-right font-bold text-black leading-tight">
                  <span className="font-bold thermal-due-amount">Net Payable: ₹{clubTotalDue.toFixed(0)}</span>
                </div>
              </div>

              {renderThermalFooter()}
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Thermal Hit List
  function renderThermalHitList() {
    const eventsToRender = selectedHitEvtNo === 'all' 
      ? (eventsWithHeats.length > 0 ? eventsWithHeats : events.filter(e => candidates.some(c => (c.selectedEvents || []).map(Number).includes(Number(e.Evt_No)))))
      : events.filter(e => String(e.Evt_No) === selectedHitEvtNo);

    if (eventsToRender.length === 0) {
      return (
        <div className="text-center py-4">
          {renderThermalHeader()}
          <p className="font-bold my-2">NO HIT LISTS AVAILABLE</p>
          {renderThermalFooter()}
        </div>
      );
    }

    return (
      <div className="space-y-4" style={{ fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif' }}>
        {eventsToRender.map((evt) => {
          const evtHeats = heats.filter(h => Number(h.eventNo) === Number(evt.Evt_No));
          const enrolled = candidates.filter(c => (c.selectedEvents || []).map(Number).includes(Number(evt.Evt_No)))
            .sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));

          const continuousHitParticipants = evtHeats.length > 0
            ? evtHeats
                .slice()
                .sort((a, b) => (a.heatNumber || 0) - (b.heatNumber || 0))
                .flatMap((heat) => heat.participants || [])
            : enrolled.map((p) => ({
                chestNo: p.chestNo,
                candidateName: p.name,
                club: p.club,
              }));

          return (
            <div 
              key={evt.Evt_No} 
              className="avoid-break pt-2 pb-2 border-b border-dashed border-black last:border-b-0 text-black leading-tight"
            >
              {renderThermalHeader()}

              <div className="text-center font-bold uppercase tracking-wider text-black">
                HIT LIST
              </div>
              <div className="thermal-event-details text-center font-normal uppercase pb-0.5 tracking-tight text-black break-words leading-tight">
                <span className="thermal-event-no font-bold">EVT {evt.Evt_No}</span>{formatThermalEventSuffix(evt.Evt_Name, evt.Height, evt.Gender)}
              </div>

              <div className="w-full border-b border-dashed border-black my-1"></div>

              <div className="flex items-center font-normal text-black uppercase pt-1">
                <span className="w-[1.8em] text-left shrink-0">SL</span>
                <span className="w-[2.6em] text-left shrink-0">CH</span>
                <span className="flex-1 text-left pl-1">ATHLETE (CLUB)</span>
              </div>
              <div className="w-full border-b-2 border-black mb-1 mt-0.5"></div>

              <div className="space-y-0 text-black">
                {continuousHitParticipants.map((p, idx) => {
                  const club = getClubInfo(p.club || '');
                  const clubNameStr = club?.name || p.club || 'BANDIPUR';
                  return (
                    <div key={`${p.chestNo}-${idx}`}>
                      <div className="flex items-start py-1 text-black leading-tight">
                        <span className="w-[1.8em] text-left font-normal shrink-0">{idx + 1}</span>
                        <span className="w-[2.6em] text-left font-normal shrink-0 thermal-chest-no">{p.chestNo}</span>
                        <div className="flex-1 min-w-0 text-left pl-1">
                          <div className="font-normal uppercase thermal-record-clamp-1 thermal-athlete-name">
                            {p.candidateName} ({clubNameStr})
                          </div>
                        </div>
                      </div>
                      <div className="w-full border-b border-dotted border-black/80"></div>
                    </div>
                  );
                })}
              </div>

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
          <p className="font-bold my-2">NO FINAL LISTS PREPARED YET</p>
          {renderThermalFooter()}
        </div>
      );
    }

    return (
      <div className="space-y-4" style={{ fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif' }}>
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

          return (
            <div 
              key={evt.Evt_No} 
              className="avoid-break pt-2 pb-2 border-b border-dashed border-black last:border-b-0 text-black leading-tight"
            >
              {renderThermalHeader()}

              <div className="text-center font-bold uppercase tracking-wider text-black">
                FINAL LIST
              </div>
              <div className="thermal-event-details text-center font-normal uppercase pb-0.5 tracking-tight text-black break-words leading-tight">
                <span className="thermal-event-no font-bold">EVT {evt.Evt_No}</span>{formatThermalEventSuffix(evt.Evt_Name, evt.Height, evt.Gender)}
              </div>

              <div className="w-full border-b border-dashed border-black my-1"></div>

              <div className="flex items-center font-normal text-black uppercase pt-1">
                <span className="w-[1.8em] text-left shrink-0">SL</span>
                <span className="w-[2.6em] text-left shrink-0">CH</span>
                <span className="flex-1 text-left pl-1">ATHLETE (CLUB)</span>
              </div>
              <div className="w-full border-b-2 border-black mb-1 mt-0.5"></div>

              <div className="space-y-0 text-black">
                {finalistsList.map((f, idx) => {
                  const club = getClubInfo(f.club || '');
                  const clubNameStr = club?.name || f.club || 'BANDIPUR';
                  return (
                    <div key={f.chestNo}>
                      <div className="flex items-start py-1 text-black leading-tight">
                        <span className="w-[1.8em] text-left font-normal shrink-0">{idx + 1}</span>
                        <span className="w-[2.6em] text-left font-normal shrink-0 thermal-chest-no">{f.chestNo}</span>
                        <div className="flex-1 min-w-0 text-left pl-1">
                          <div className="font-normal uppercase thermal-record-clamp-1 thermal-athlete-name">
                            {f.candidateName} ({clubNameStr})
                          </div>
                        </div>
                      </div>
                      <div className="w-full border-b border-dotted border-black/80"></div>
                    </div>
                  );
                })}
              </div>

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
          <p className="font-bold my-2">NO RANKINGS RECORDED YET</p>
          {renderThermalFooter()}
        </div>
      );
    }

    const getRankPosLabel = (pos?: number, fallbackIdx?: number) => {
      const p = (pos && pos > 0) ? pos : ((fallbackIdx !== undefined) ? fallbackIdx + 1 : 1);
      if (p === 1) return '1st';
      if (p === 2) return '2nd';
      if (p === 3) return '3rd';
      return `${p}th`;
    };

    return (
      <div className="space-y-4" style={{ fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif' }}>
        {eventsToRender.map((evt) => {
          const res = results.find(r => Number(r.eventNo) === Number(evt.Evt_No));
          const ranked = (res?.winners && res.winners.length > 0 ? res.winners : (res?.finalists || []))
            .filter(f => (f.position || 0) > 0)
            .sort((a, b) => (a.position || 0) - (b.position || 0));

          const isBroadJump = (evt.Evt_Name || '').toUpperCase().includes('BROAD JUMP');

          return (
            <div 
              key={evt.Evt_No} 
              className="avoid-break pt-2 pb-2 border-b border-dashed border-black last:border-b-0 text-black leading-tight"
            >
              {renderThermalHeader()}

              <div className="text-center font-bold uppercase tracking-wider text-black">
                RANKING LIST
              </div>
              <div className="thermal-event-details text-center font-normal uppercase pb-0.5 tracking-tight text-black break-words leading-tight">
                <span className="thermal-event-no font-bold">EVT {evt.Evt_No}</span>{formatThermalEventSuffix(evt.Evt_Name, evt.Height, evt.Gender)}
              </div>

              <div className="w-full border-b border-dashed border-black my-1"></div>

              <div className="flex items-center font-normal text-black uppercase pt-1">
                <span className="w-[2.2em] text-left shrink-0">RK</span>
                <span className="w-[2.6em] text-left shrink-0">CH</span>
                <span className="flex-1 text-left pl-1">ATHLETE (CLUB)</span>
                {isBroadJump && (
                  <span className="text-right pl-1 shrink-0">JMP</span>
                )}
              </div>
              <div className="w-full border-b-2 border-black mb-1 mt-0.5"></div>

              <div className="space-y-0 text-black">
                {ranked.length === 0 ? (
                  <div className="py-2 text-center italic text-slate-600">
                    No rankings declared yet for this event.
                  </div>
                ) : (
                  ranked.map((r, idx) => {
                    const club = getClubInfo(r.club || '');
                    const isSelf = (r.club || '').trim().toUpperCase() === 'SELF';
                    const clubNameStr = isSelf ? '' : (club?.name || r.club || '').trim();
                    const athleteDisplay = clubNameStr ? `${r.candidateName} (${clubNameStr})` : r.candidateName;
                    const jumpVal = isBroadJump ? (r.jumpRecord || r.resultValue || '—') : undefined;
                    return (
                      <div key={r.chestNo}>
                        <div className="flex items-start py-1 text-black leading-tight">
                          <span className="w-[2.2em] text-left font-normal shrink-0">
                            {getRankPosLabel(r.position, idx)}
                          </span>
                          <span className="w-[2.6em] text-left font-normal shrink-0 thermal-chest-no">
                            {r.chestNo}
                          </span>
                          <div className="flex-1 min-w-0 text-left font-normal uppercase pl-1">
                            <ThermalTwoLineRecord
                              text={athleteDisplay}
                              rightText={jumpVal}
                              rightClassName="thermal-jump-record whitespace-nowrap"
                              deps={[thermalConfig.printableWidth, thermalConfig.fontSize, thermalConfig.lineSpacing, thermalConfig.marginHorizontal]}
                            />
                          </div>
                        </div>
                        <div className="w-full border-b border-dotted border-black/80"></div>
                      </div>
                    );
                  })
                )}
              </div>

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
                const formattedPrev = formatJumpBenchmark(prevRecord.recordValue) || prevRecord.recordValue;
                const holderClub = prevRecord.recordHolderClub ? ` (${prevRecord.recordHolderClub})` : '';
                const holderYear = prevRecord.recordYear ? `, ${prevRecord.recordYear}` : '';

                if (!isBroken) {
                  return (
                    <div className="thermal-new-record-callout py-1 font-normal text-center text-black leading-tight border-b border-dotted border-black/80 break-words">
                      New Record: N
                    </div>
                  );
                }

                return (
                  <div className="thermal-new-record-callout py-1 font-normal text-center text-black leading-tight border-b border-dotted border-black/80 break-words">
                    <span className="font-bold">New Record: Y</span>
                    <span> | Prev: {formattedPrev} by {prevRecord.recordHolderName}{holderClub}{holderYear}</span>
                  </div>
                );
              })()}

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
      <div style={{ fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif' }}>
        {renderThermalHeader()}

        <div className="text-center mb-1 leading-tight">
          <div className="font-bold tracking-wider">
            Top 3 Clubs
          </div>
        </div>

        <div className="pb-0.5 font-normal flex items-center">
          <span className="w-[2.7em] text-left shrink-0">RK</span>
          <span className="flex-1 text-left pl-1 pr-1">CLUB</span>
          <span className="w-[1.6em] text-center shrink-0">G</span>
          <span className="w-[1.6em] text-center shrink-0">S</span>
          <span className="w-[1.6em] text-center shrink-0">B</span>
          <span className="w-[2.2em] text-right shrink-0">T</span>
        </div>
        <div className="w-full border-b border-black mb-0.5"></div>

        <div className="space-y-1">
          {top3Clubs.map((team, idx) => {
            const rankLabel = idx === 0 ? '1ST' : idx === 1 ? '2ND' : '3RD';
            const rowWeight = idx === 0 ? 'font-bold' : 'font-normal';
            return (
              <div key={team.name} className="flex items-start leading-tight pb-0.5 border-b border-dotted border-black/50 last:border-b-0">
                <span className={`w-[2.7em] text-left ${rowWeight} shrink-0`}>{rankLabel}</span>
                <div className="flex-1 min-w-0 text-left pl-1 pr-1">
                  <div className={`${rowWeight} uppercase thermal-record-clamp-2`}>
                    {team.name}
                  </div>
                </div>
                <span className={`w-[1.6em] text-center ${rowWeight} shrink-0 thermal-champ-g`}>{team.gold}</span>
                <span className={`w-[1.6em] text-center ${rowWeight} shrink-0 thermal-champ-s`}>{team.silver}</span>
                <span className={`w-[1.6em] text-center ${rowWeight} shrink-0 thermal-champ-b`}>{team.bronze}</span>
                <span className={`w-[2.2em] text-right ${rowWeight} shrink-0 thermal-champ-t`}>{team.points}</span>
              </div>
            );
          })}
        </div>

        {top3Clubs.length > 0 && (
          <div className="w-full mt-1 pt-0.5 text-center leading-tight">
            <div className="font-bold uppercase break-words">
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

              {/* Continuous Table rendering (no heat segregation) */}
              {(() => {
                const continuousA4Participants = evtHeats.length > 0
                  ? evtHeats
                      .slice()
                      .sort((a, b) => (a.heatNumber || 0) - (b.heatNumber || 0))
                      .flatMap((heat) => heat.participants || [])
                  : enrolled.map((cand) => ({
                      chestNo: cand.chestNo,
                      candidateName: cand.name,
                      club: cand.club,
                    }));

                return (
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
                        {continuousA4Participants.map((p, idx) => {
                          const club = getClubInfo(p.club || '');
                          const clubNameStr = club?.name || p.club || 'BANDIPUR';
                          return (
                            <tr key={`${p.chestNo}-${idx}`} className="bg-white">
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
                );
              })()}

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

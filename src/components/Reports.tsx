import React, { useState, useMemo } from 'react';
import { Candidate, SportEvent, Club, SportsMeetSettings } from '../types';
import { 
  Printer, 
  Users, 
  Building2, 
  FileText, 
  Download, 
  Check, 
  Hash, 
  Coins, 
  ShieldCheck 
} from 'lucide-react';

interface ReportsProps {
  candidates: Candidate[];
  events: SportEvent[];
  clubs: Club[];
  settings: SportsMeetSettings;
}

export const Reports: React.FC<ReportsProps> = ({
  candidates,
  events,
  clubs,
  settings,
}) => {
  const [reportType, setReportType] = useState<'chest' | 'club'>('chest');

  // Sorted by chest number for Chest Number Wise Report
  const chestWiseCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
  }, [candidates]);

  // Grouped by club name for Club Name Wise Grouped Report
  const clubGroupedCandidates = useMemo(() => {
    const groups: Record<string, Candidate[]> = {};
    candidates.forEach((cand) => {
      const clubName = cand.club?.trim() || 'Independent / Unattached';
      if (!groups[clubName]) {
        groups[clubName] = [];
      }
      groups[clubName].push(cand);
    });

    // Sort athletes inside each club by chest number
    Object.keys(groups).forEach((clubName) => {
      groups[clubName].sort((a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0));
    });

    return groups;
  }, [candidates]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Top Controls (Hidden during print) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">
            <Printer className="w-4 h-4" />
            <span>Official Meet Documentation</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Printable Reports &amp; Registers
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Formatted specifically for A4 print output, call-room registries, and club managers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Report Type Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setReportType('chest')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                reportType === 'chest'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chest Number Wise
            </button>
            <button
              onClick={() => setReportType('club')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                reportType === 'club'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Club Name Wise Grouped
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-md active:scale-98"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Info notice about club page-break rule */}
      {reportType === 'club' && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium flex items-center gap-2.5 print:hidden">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>Print Engine Notice:</strong> "Club Name Wise Grouped Report" enforces CSS page-break separation so each club is kept intact on its own dedicated page during print or PDF saving!
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PRINTABLE REPORT CONTAINER (Styled for both screen and print) */}
      {/* ------------------------------------------------------------- */}

      {reportType === 'chest' ? (
        /* ================= CHEST NUMBER WISE REPORT ================= */
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs print:border-none print:shadow-none print:p-0">
          
          {/* Print Header */}
          <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-center justify-center gap-3 mb-1">
              <img src="/icon.svg" alt="Meet Logo" className="w-12 h-12 rounded-full object-cover" />
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                  {settings.ordinalTitle || '47th Annual Sports Meet 2027'}
                </h1>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Organized by: {settings.organizer}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 text-xs font-medium text-slate-600 mt-2">
              <span><strong>Venue:</strong> {settings.venue}</span>
              <span>•</span>
              <span><strong>Dates:</strong> {settings.dates}</span>
              <span>•</span>
              <span className="bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-900">
                CHEST NUMBER WISE OFFICIAL REGISTRATION REPORT
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-900 font-black uppercase border-b-2 border-slate-300">
                  <th className="border border-slate-300 py-2.5 px-3 w-16 text-center">Chest #</th>
                  <th className="border border-slate-300 py-2.5 px-3">Athlete Name</th>
                  <th className="border border-slate-300 py-2.5 px-3">Club Name</th>
                  <th className="border border-slate-300 py-2.5 px-2 text-center w-20">Category</th>
                  <th className="border border-slate-300 py-2.5 px-2 text-center w-16">Height</th>
                  <th className="border border-slate-300 py-2.5 px-3">Enrolled Events</th>
                  <th className="border border-slate-300 py-2.5 px-2 text-right w-16">Fees</th>
                  <th className="border border-slate-300 py-2.5 px-3 w-24 text-center print:table-cell">Signature</th>
                </tr>
              </thead>
              <tbody>
                {chestWiseCandidates.map((cand, idx) => (
                  <tr key={cand.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="border border-slate-300 py-2 px-3 text-center font-mono font-bold text-slate-900 text-sm">
                      #{cand.chestNo}
                    </td>
                    <td className="border border-slate-300 py-2 px-3 font-bold text-slate-900">
                      {cand.name}
                    </td>
                    <td className="border border-slate-300 py-2 px-3 font-medium text-slate-700">
                      {cand.club || 'Independent'}
                    </td>
                    <td className="border border-slate-300 py-2 px-2 text-center font-semibold text-slate-700">
                      {cand.gender}
                    </td>
                    <td className="border border-slate-300 py-2 px-2 text-center font-mono text-slate-700">
                      {cand.height}
                    </td>
                    <td className="border border-slate-300 py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {(cand.selectedEvents || []).map((evtNo) => {
                          const ev = events.find((e) => Number(e.Evt_No) === Number(evtNo));
                          return (
                            <span
                              key={evtNo}
                              className="inline-block bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-semibold border border-slate-200"
                            >
                              #{evtNo} {ev?.Evt_Name}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="border border-slate-300 py-2 px-2 text-right font-mono font-bold">
                      {settings.currencySymbol || '₹'}{Number(cand.totalFees).toFixed(2)}
                    </td>
                    <td className="border border-slate-300 py-2 px-3 text-center h-10 print:h-8">
                      {/* Blank space for athlete/official physical signature */}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Report Footer */}
          <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              <p>Total Registered Athletes: <strong>{chestWiseCandidates.length}</strong></p>
              <p>Total Entry Fees Collected: <strong>{settings.currencySymbol || '₹'}{chestWiseCandidates.reduce((acc, c) => acc + (Number(c.totalFees) || 0), 0).toFixed(2)}</strong></p>
            </div>
            <div className="flex gap-12 text-center">
              <div className="border-t border-slate-800 pt-1 w-32">
                <span>Sports Secretary</span>
              </div>
              <div className="border-t border-slate-800 pt-1 w-32">
                <span>President</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= CLUB NAME WISE GROUPED REPORT ================= */
        /* Requirement: (keep same group in one page) */
        <div className="space-y-8">
          {Object.entries(clubGroupedCandidates).map(([clubName, athletes]) => {
            const clubInfo = clubs.find((c) => c.name === clubName);
            const totalClubFees = athletes.reduce((acc, a) => acc + (Number(a.totalFees) || 0), 0);

            return (
              <div
                key={clubName}
                className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs print:border-none print:shadow-none print:p-0 print:mb-0"
                style={{
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                  pageBreakAfter: 'always',
                  breakAfter: 'page',
                }}
              >
                {/* Header for this specific Club page */}
                <div className="text-center border-b-2 border-slate-900 pb-3 mb-5">
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        {settings.ordinalTitle}
                      </p>
                      <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight">
                        {clubName}
                      </h2>
                      {clubInfo?.address && (
                        <p className="text-[11px] text-slate-500">{clubInfo.address}</p>
                      )}
                    </div>

                    <div className="text-right flex items-center gap-3">
                      {clubInfo?.logoUrl && (
                        <img
                          src={clubInfo.logoUrl}
                          alt={clubName}
                          className="w-10 h-10 object-contain rounded-full border border-slate-200 bg-white"
                        />
                      )}
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                          Club Entry Register
                        </span>
                        <p className="text-xs font-mono font-bold text-slate-700 mt-0.5">
                          {athletes.length} Athlete(s)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Club Athletes Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900 font-bold uppercase border-b border-slate-300">
                        <th className="border border-slate-300 py-2 px-3 w-16 text-center">Chest #</th>
                        <th className="border border-slate-300 py-2 px-3">Athlete Name</th>
                        <th className="border border-slate-300 py-2 px-2 text-center w-24">Gender</th>
                        <th className="border border-slate-300 py-2 px-2 text-center w-20">Height</th>
                        <th className="border border-slate-300 py-2 px-3">Enrolled Events</th>
                        <th className="border border-slate-300 py-2 px-2 text-right w-20">Fees</th>
                        <th className="border border-slate-300 py-2 px-3 w-28 text-center print:table-cell">Check-in Sign</th>
                      </tr>
                    </thead>
                    <tbody>
                      {athletes.map((cand, i) => (
                        <tr key={cand.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="border border-slate-300 py-2 px-3 text-center font-mono font-bold text-blue-900">
                            #{cand.chestNo}
                          </td>
                          <td className="border border-slate-300 py-2 px-3 font-bold text-slate-900">
                            {cand.name}
                          </td>
                          <td className="border border-slate-300 py-2 px-2 text-center font-medium text-slate-700">
                            {cand.gender}
                          </td>
                          <td className="border border-slate-300 py-2 px-2 text-center font-mono text-slate-700">
                            {cand.height}
                          </td>
                          <td className="border border-slate-300 py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {(cand.selectedEvents || []).map((evtNo) => {
                                const ev = events.find((e) => Number(e.Evt_No) === Number(evtNo));
                                return (
                                  <span
                                    key={evtNo}
                                    className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-slate-200"
                                  >
                                    #{evtNo} {ev?.Evt_Name}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="border border-slate-300 py-2 px-2 text-right font-mono font-bold">
                            {settings.currencySymbol || '₹'}{Number(cand.totalFees).toFixed(2)}
                          </td>
                          <td className="border border-slate-300 py-2 px-3 text-center h-9">
                            {/* Physical signature block */}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Club Page Summary & Signatures */}
                <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <div>
                    <p>Total Enrolled for <strong>{clubName}</strong>: {athletes.length} athlete(s)</p>
                    <p>Club Total Entry Fees: <strong>{settings.currencySymbol || '₹'}{totalClubFees.toFixed(2)}</strong></p>
                  </div>
                  <div className="flex gap-8 text-center">
                    <div className="border-t border-slate-800 pt-1 w-28">
                      <span>Club Manager Sign</span>
                    </div>
                    <div className="border-t border-slate-800 pt-1 w-28">
                      <span>Meet Registrar</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

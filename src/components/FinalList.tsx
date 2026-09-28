import React, { useState, useMemo } from 'react';
import { SportEvent, Candidate, EventResult, FinalParticipant, SportsMeetSettings } from '../types';
import { 
  Medal, 
  Trophy, 
  Users, 
  ArrowRight, 
  Check, 
  Trash2, 
  Plus, 
  Printer 
} from 'lucide-react';

interface FinalListProps {
  events: SportEvent[];
  candidates: Candidate[];
  results: EventResult[];
  settings: SportsMeetSettings;
  onSaveResult: (result: Partial<EventResult>) => Promise<void>;
  onNavigateToRanking: (evtNo: number) => void;
}

export const FinalList: React.FC<FinalListProps> = ({
  events,
  candidates,
  results,
  settings,
  onSaveResult,
  onNavigateToRanking,
}) => {
  const [selectedEvtNo, setSelectedEvtNo] = useState<number>(events[0]?.Evt_No || 0);

  const currentEvent = useMemo(() => {
    return events.find((e) => Number(e.Evt_No) === Number(selectedEvtNo)) || events[0];
  }, [events, selectedEvtNo]);

  // Current result / finalists record for this event
  const currentResult = useMemo(() => {
    return results.find((r) => Number(r.eventNo) === Number(selectedEvtNo));
  }, [results, selectedEvtNo]);

  const finalists: FinalParticipant[] = currentResult?.finalists || [];

  // Add athlete manually to finalists
  const handleAddFinalist = async (cand: Candidate) => {
    if (finalists.some(f => f.chestNo === cand.chestNo)) return;

    const nextLane = finalists.length + 1;
    const newFinalist: FinalParticipant = {
      chestNo: cand.chestNo,
      candidateName: cand.name,
      club: cand.club,
      lane: nextLane,
    };

    await onSaveResult({
      eventNo: selectedEvtNo,
      finalists: [...finalists, newFinalist],
      completed: false,
    });
  };

  const handleRemoveFinalist = async (chestNo: number) => {
    const updated = finalists.filter(f => f.chestNo !== chestNo);
    await onSaveResult({
      eventNo: selectedEvtNo,
      finalists: updated,
      completed: currentResult?.completed || false,
    });
  };

  const updateFinalistLane = async (chestNo: number, lane: number) => {
    const updated = finalists.map(f => (f.chestNo === chestNo ? { ...f, lane } : f));
    await onSaveResult({
      eventNo: selectedEvtNo,
      finalists: updated,
      completed: currentResult?.completed || false,
    });
  };

  // Enrolled candidates not yet in finalists
  const availableCandidates = useMemo(() => {
    const finalistChestSet = new Set(finalists.map(f => f.chestNo));
    return candidates
      .filter(c => (c.selectedEvents || []).includes(selectedEvtNo))
      .filter(c => !finalistChestSet.has(c.chestNo));
  }, [candidates, selectedEvtNo, finalists]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600 mb-1">
            <Medal className="w-4 h-4" />
            <span>Championship Rounds</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Event Finalists Start List
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Final starting lineup, lane allocations, and direct handoff to the podium ranking list.
          </p>
        </div>

        {finalists.length > 0 && (
          <button
            onClick={() => onNavigateToRanking(selectedEvtNo)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs"
          >
            <Trophy className="w-4 h-4 text-amber-300" />
            <span>Enter Podium Rankings</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Event Selection */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
          Select Event Final
        </label>
        <div className="flex flex-wrap gap-2">
          {events.map((evt) => {
            const hasFinalists = (results.find(r => Number(r.eventNo) === Number(evt.Evt_No))?.finalists || []).length;
            const isSelected = selectedEvtNo === evt.Evt_No;
            return (
              <button
                key={evt.Evt_No}
                onClick={() => setSelectedEvtNo(evt.Evt_No)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>#{evt.Evt_No} {evt.Evt_Name}</span>
                {hasFinalists > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isSelected ? 'bg-purple-800 text-purple-100' : 'bg-purple-100 text-purple-800'}`}>
                    {hasFinalists}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {currentEvent && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <div>
              <strong className="text-slate-900 text-sm">#{currentEvent.Evt_No} {currentEvent.Evt_Name}</strong>
              <span className="ml-2 bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-semibold">{currentEvent.Gender}</span>
              <span className="ml-1 bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-semibold">{currentEvent.Height}</span>
            </div>
            <span className="font-bold text-purple-900">{finalists.length} Finalist(s) in Grid</span>
          </div>
        )}
      </div>

      {/* Finalists Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="bg-slate-50 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Medal className="w-4 h-4 text-purple-600" />
            <span>Final Starting Grid • {finalists.length} Competitors</span>
          </h3>
          <span className="text-xs text-slate-500">Lanes 1 to 8</span>
        </div>

        {finalists.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-bold text-slate-700">No Finalists Added Yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Promote qualifiers from the "Hit List (Heats)" tab or manually pick registered athletes below.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-100">
                  <th className="py-2.5 px-4 w-20 text-center">Lane</th>
                  <th className="py-2.5 px-4 w-24">Chest #</th>
                  <th className="py-2.5 px-4">Athlete Name</th>
                  <th className="py-2.5 px-4">Representing Club</th>
                  <th className="py-2.5 px-4 text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {finalists
                  .sort((a, b) => (a.lane || 0) - (b.lane || 0))
                  .map((f) => (
                    <tr key={f.chestNo} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-4 text-center">
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={f.lane || 1}
                          onChange={(e) => updateFinalistLane(f.chestNo, parseInt(e.target.value, 10) || 1)}
                          className="w-12 text-center py-1 rounded border border-slate-300 font-bold text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-blue-900">
                        #{f.chestNo}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {f.candidateName}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 text-xs">
                        {f.club}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => handleRemoveFinalist(f.chestNo)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                          title="Remove from Final"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Quick Add from Enrolled Pool */}
      {availableCandidates.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-600" />
            <span>Add Other Enrolled Participants to Final</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {availableCandidates.map((cand) => (
              <button
                key={cand.id}
                onClick={() => handleAddFinalist(cand)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-all"
              >
                <span className="font-mono text-blue-700 font-bold">#{cand.chestNo}</span>
                <span>{cand.name}</span>
                <span className="text-[10px] text-slate-400">({cand.club})</span>
                <Plus className="w-3 h-3 text-blue-600" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

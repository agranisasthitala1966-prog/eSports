import React, { useState } from 'react';
import { SportEvent, SportsMeetSettings } from '../types';
import { 
  Calendar, 
  Plus, 
  Edit3, 
  Trash2, 
  RotateCcw, 
  Check, 
  X, 
  Coins, 
  AlertTriangle 
} from 'lucide-react';

interface EventMasterProps {
  events: SportEvent[];
  settings: SportsMeetSettings;
  onSaveEvent: (event: SportEvent) => Promise<void>;
  onDeleteEvent: (evtNo: number) => Promise<void>;
  onResetEvents: () => Promise<void>;
}

export const EventMaster: React.FC<EventMasterProps> = ({
  events,
  settings,
  onSaveEvent,
  onDeleteEvent,
  onResetEvents,
}) => {
  const [editingEvt, setEditingEvt] = useState<SportEvent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const startAddNew = () => {
    const nextNo = events.length > 0 ? Math.max(...events.map((e) => Number(e.Evt_No) || 0)) + 1 : 0;
    setEditingEvt({
      Evt_No: nextNo,
      Evt_Name: '',
      Height: '4`-2``',
      Gender: 'BOYS',
      Fees: 10.0,
    });
    setIsNew(true);
    setErrorMsg(null);
  };

  const handleEdit = (evt: SportEvent) => {
    setEditingEvt({ ...evt });
    setIsNew(false);
    setErrorMsg(null);
  };

  const handleCancel = () => {
    setEditingEvt(null);
    setIsNew(false);
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvt) return;
    if (!editingEvt.Evt_Name.trim()) {
      setErrorMsg('Event name is required');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onSaveEvent({
        ...editingEvt,
        Evt_No: Number(editingEvt.Evt_No),
        Fees: Number(editingEvt.Fees) || 0,
      });
      setSuccessMsg(`Event #${editingEvt.Evt_No} saved successfully!`);
      setEditingEvt(null);
      setIsNew(false);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save event');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">
            <Calendar className="w-4 h-4" />
            <span>Server Operations</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Event Master List Registry
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Configure athletic meet disciplines, standard height brackets, categories, and entry fees.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={startAddNew}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Event</span>
          </button>
          
          <button
            onClick={async () => {
              if (window.confirm('Reset all events back to the default 16 standard meet events?')) {
                await onResetEvents();
              }
            }}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors"
            title="Reset to 16 standard events"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Reset Defaults</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Edit / Add Modal or Inline Form */}
      {editingEvt && (
        <div className="bg-blue-50/70 border-2 border-blue-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
            <h3 className="text-base font-bold text-blue-950 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-600" />
              <span>{isNew ? 'Create New Event' : `Edit Event #${editingEvt.Evt_No}`}</span>
            </h3>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Event No (Evt_No)</label>
              <input
                type="number"
                required
                value={editingEvt.Evt_No}
                onChange={(e) => setEditingEvt({ ...editingEvt, Evt_No: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono font-bold bg-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Event Name (Evt_Name)</label>
              <input
                type="text"
                required
                value={editingEvt.Evt_Name}
                onChange={(e) => setEditingEvt({ ...editingEvt, Evt_Name: e.target.value.toUpperCase() })}
                placeholder="e.g. 100 MTS. RUN"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold uppercase bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Height</label>
              <input
                type="text"
                required
                value={editingEvt.Height}
                onChange={(e) => setEditingEvt({ ...editingEvt, Height: e.target.value })}
                placeholder="e.g. 4`-2`` or ALL"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
              <select
                value={editingEvt.Gender}
                onChange={(e) => setEditingEvt({ ...editingEvt, Gender: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
              >
                <option value="CHILDRENS">CHILDRENS</option>
                <option value="BOYS">BOYS</option>
                <option value="GIRLS">GIRLS</option>
                <option value="ALL">ALL</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fees ({settings.currencySymbol || '₹'})</label>
              <input
                type="number"
                step="0.5"
                min="0"
                required
                value={editingEvt.Fees}
                onChange={(e) => setEditingEvt({ ...editingEvt, Fees: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono font-bold bg-white"
              />
            </div>

            <div className="lg:col-span-4 flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
              >
                {isSaving ? 'Saving...' : 'Save Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Events Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4 w-20">Evt_No</th>
                <th className="py-3.5 px-4">Evt_Name</th>
                <th className="py-3.5 px-4">Height</th>
                <th className="py-3.5 px-4">Gender</th>
                <th className="py-3.5 px-4 text-right">Fees</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((evt) => (
                <tr key={evt.Evt_No} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-blue-900">
                    <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-md text-xs">
                      #{evt.Evt_No}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-bold text-slate-900 uppercase">
                    {evt.Evt_Name}
                  </td>

                  <td className="py-3 px-4 font-semibold text-slate-700">
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">
                      {evt.Height}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        evt.Gender === 'BOYS'
                          ? 'bg-blue-100 text-blue-800'
                          : evt.Gender === 'GIRLS'
                          ? 'bg-rose-100 text-rose-800'
                          : evt.Gender === 'CHILDRENS'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {evt.Gender}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right font-bold text-slate-900 font-mono">
                    {settings.currencySymbol || '₹'}{Number(evt.Fees).toFixed(2)}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleEdit(evt)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Event"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm(`Delete Event #${evt.Evt_No} (${evt.Evt_Name})?`)) {
                            await onDeleteEvent(evt.Evt_No);
                          }
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

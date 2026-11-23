import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, X, Shield } from 'lucide-react';
import { api } from '../services/api';

interface ResetPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessNotice: (msg: string) => void;
}

export const ResetPinModal: React.FC<ResetPinModalProps> = ({
  isOpen,
  onClose,
  onSuccessNotice,
}) => {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPin.trim()) {
      setError('Current PIN is required.');
      return;
    }
    if (!newPin.trim() || newPin.trim().length < 4) {
      setError('New PIN must be at least 4 digits/characters.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PIN and Confirm PIN do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.resetPin(currentPin.trim(), newPin.trim());
      onSuccessNotice(res.message || 'Server PIN has been reset successfully!');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to reset PIN. Make sure current PIN is correct.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div className="bg-[#0b1120] border-2 border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl text-slate-100 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">
              Reset Server Login PIN
            </h2>
            <p className="text-xs text-slate-400">
              Change the security PIN used to log into Server Control
            </p>
          </div>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-700/60 text-rose-200 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Current PIN
            </label>
            <div className="relative">
              <input
                type={showPins ? 'text' : 'password'}
                maxLength={8}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter current PIN"
                className="w-full py-2.5 px-3 rounded-xl bg-[#070b14] border border-slate-700 focus:border-amber-400 text-white font-mono text-sm focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              New PIN (Min 4 digits)
            </label>
            <input
              type={showPins ? 'text' : 'password'}
              maxLength={8}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 5678"
              className="w-full py-2.5 px-3 rounded-xl bg-[#070b14] border border-slate-700 focus:border-amber-400 text-white font-mono text-sm focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Confirm New PIN
            </label>
            <input
              type={showPins ? 'text' : 'password'}
              maxLength={8}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Re-enter new PIN"
              className="w-full py-2.5 px-3 rounded-xl bg-[#070b14] border border-slate-700 focus:border-amber-400 text-white font-mono text-sm focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <button
              type="button"
              onClick={() => setShowPins(!showPins)}
              className="flex items-center gap-1.5 hover:text-slate-200"
            >
              {showPins ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPins ? 'Hide numbers' : 'Show numbers'}</span>
            </button>
            <span className="text-[11px] text-slate-500">Max 8 digits</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !currentPin || !newPin || !confirmPin}
              className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Updating...' : 'Update PIN'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

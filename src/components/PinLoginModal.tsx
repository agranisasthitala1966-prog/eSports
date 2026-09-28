import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, X, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

interface PinLoginModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PinLoginModal: React.FC<PinLoginModalProps> = ({
  isOpen,
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setError('Please enter your PIN');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.verifyPin(pin.trim());
      // Remember in session
      sessionStorage.setItem('esports_server_auth', 'true');
      setPin('');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Incorrect PIN. Default is 1234.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeypadPress = (val: string) => {
    if (val === 'backspace') {
      setPin((prev) => prev.slice(0, -1));
    } else if (val === 'clear') {
      setPin('');
    } else if (pin.length < 8) {
      setPin((prev) => prev + val);
    }
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div className="bg-[#0b1120] border-2 border-slate-700 rounded-3xl max-w-sm w-full p-6 shadow-2xl text-slate-100 relative">
        
        {/* Close Button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          title="Back to Client Portal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-amber-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-wide">
            Server Access PIN
          </h2>
          <p className="text-xs text-slate-400">
            Enter the 4-digit security PIN to access Server Control from any browser or device.
          </p>
          <div className="inline-block px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-semibold text-amber-400">
            Default PIN: 1234
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-700/60 text-rose-200 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* PIN Input form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              maxLength={8}
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError(null);
              }}
              placeholder="••••"
              className="w-full text-center text-3xl font-mono tracking-widest py-3 px-4 rounded-2xl bg-[#070b14] border-2 border-slate-700 focus:border-amber-400 text-amber-400 focus:outline-hidden transition-all shadow-inner"
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-200"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Numeric Keypad for fast touchscreen or mouse access */}
          <div className="grid grid-cols-3 gap-2 py-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (k === 'C') handleKeypadPress('clear');
                  else if (k === '⌫') handleKeypadPress('backspace');
                  else handleKeypadPress(k);
                }}
                className={`py-3 rounded-xl text-base font-extrabold transition-all active:scale-95 shadow-xs ${
                  k === 'C' || k === '⌫'
                    ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                    : 'bg-[#121c33] hover:bg-[#1a2848] text-white border border-slate-700/60'
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !pin}
              className="py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{loading ? 'Verifying...' : 'Unlock Server'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

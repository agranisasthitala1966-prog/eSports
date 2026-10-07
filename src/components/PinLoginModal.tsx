import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, AlertCircle, Loader2, Smartphone, ShieldAlert, ArrowRight } from 'lucide-react';
import { api } from '../services/api';

interface PinLoginModalProps {
  isOpen: boolean;
  onSuccess: (sessionData?: any) => void;
  onCancel: () => void;
}

export const PinLoginModal: React.FC<PinLoginModalProps> = ({
  isOpen,
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionConflict, setSessionConflict] = useState<{
    deviceLabel: string;
    loggedInAt?: string;
  } | null>(null);
  const [activeSessionNotice, setActiveSessionNotice] = useState<{
    label: string;
    since?: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check active server session status on open
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setLoading(false);
      setSessionConflict(null);
      setActiveSessionNotice(null);

      api.getSessionStatus().then((status) => {
        if (status.isServerLoggedIn && !status.isCurrentDevice && status.activeDevice) {
          setActiveSessionNotice({
            label: status.activeDevice.label,
            since: status.activeDevice.loggedInAt,
          });
        }
      }).catch(() => {});

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Handle ESC key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleVerify = async (pinToVerify: string, forceTakeover = false) => {
    if (!pinToVerify.trim() || loading) return;

    setLoading(true);
    setError(null);
    setSessionConflict(null);

    try {
      const res = await api.verifyPin(pinToVerify.trim(), forceTakeover);
      sessionStorage.setItem('esports_server_auth', 'true');
      if (res.sessionId) {
        sessionStorage.setItem('esports_server_session_id', res.sessionId);
      }
      setPin('');
      onSuccess(res);
    } catch (err: any) {
      if (err.isAlreadyLoggedIn) {
        setSessionConflict({
          deviceLabel: err.activeDevice?.label || 'Another Device',
          loggedInAt: err.activeDevice?.loggedInAt,
        });
        setError(`Server is active on ${err.activeDevice?.label || 'another device'}. Concurrent logins restricted.`);
      } else {
        setError(err.message || 'Incorrect PIN. Default is 1234.');
        setPin('');
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(rawVal);
    setError(null);
    setSessionConflict(null);

    // Auto-verify as soon as 4 digits are entered
    if (rawVal.length === 4) {
      handleVerify(rawVal, false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length > 0) {
      handleVerify(pin, false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-[#0b1120] border-2 border-slate-700/80 rounded-3xl max-w-sm w-full p-7 shadow-2xl text-slate-100 relative">
        {/* Dismiss Icon */}
        <button
          onClick={onCancel}
          type="button"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2 mb-5">
          <div className="w-13 h-13 mx-auto rounded-2xl bg-gradient-to-tr from-amber-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            {loading ? (
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            ) : (
              <Lock className="w-6 h-6 text-white" />
            )}
          </div>
          <h2 className="text-xl font-black text-white tracking-wide">
            Server Access
          </h2>
          <p className="text-xs text-slate-400">
            Enter 4-digit PIN to access Server Control
          </p>
        </div>

        {/* Notice if another device currently holds active server session */}
        {activeSessionNotice && !sessionConflict && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-950/50 border border-amber-600/40 text-amber-200 text-xs flex items-start gap-2.5">
            <Smartphone className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300">Single Server Device Rule</p>
              <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                Server is active on <strong className="text-white">{activeSessionNotice.label}</strong>. Logging in here will restrict concurrent server access.
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && !sessionConflict && (
          <div className="mb-4 p-2.5 rounded-xl bg-rose-950/80 border border-rose-700/60 text-rose-200 text-xs font-semibold flex items-center justify-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Session Conflict Takeover Dialog */}
        {sessionConflict && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-950/80 border border-rose-600/70 text-rose-100 text-xs space-y-3 animate-in fade-in">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-300">Concurrent Login Restricted</p>
                <p className="text-[11px] text-rose-200/90 mt-1 leading-normal">
                  Server is currently logged in on <strong className="text-white">{sessionConflict.deviceLabel}</strong>. To protect database integrity, only one server device is permitted at a time.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleVerify(pin, true)}
              disabled={loading}
              className="w-full py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Take Over &amp; Login on this Device</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* PIN Input */}
        <form onSubmit={handleFormSubmit} className="space-y-5">
          <div
            className="relative cursor-text"
            onClick={() => inputRef.current?.focus()}
          >
            {/* Real hidden/covered numeric input */}
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={4}
              disabled={loading}
              value={pin}
              onChange={handleInputChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-text z-10"
              aria-label="Server PIN"
            />

            {/* 4 Visual Digit Slots */}
            <div className="flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((idx) => {
                const isFilled = pin.length > idx;
                const isCurrent = pin.length === idx;
                return (
                  <div
                    key={idx}
                    className={`w-13 h-14 sm:w-14 sm:h-15 rounded-2xl flex items-center justify-center text-2xl font-mono font-black transition-all border-2 ${
                      error
                        ? 'border-rose-500 bg-rose-950/30 text-rose-400'
                        : isCurrent
                        ? 'border-amber-400 bg-amber-400/10 text-amber-400 ring-2 ring-amber-400/40 shadow-lg shadow-amber-400/10 scale-105'
                        : isFilled
                        ? 'border-slate-600 bg-slate-900 text-white shadow-inner'
                        : 'border-slate-800 bg-[#070b14] text-slate-600'
                    }`}
                  >
                    {isFilled ? (
                      <span className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-sm" />
                    ) : isCurrent ? (
                      <span className="w-2 h-0.5 bg-amber-400/80 animate-pulse" />
                    ) : (
                      <span className="text-slate-700 text-sm">•</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Loading status or hint */}
          <div className="text-center pt-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying PIN...</span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-500 font-medium">
                Default PIN: <strong className="text-slate-400 font-mono">1234</strong>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

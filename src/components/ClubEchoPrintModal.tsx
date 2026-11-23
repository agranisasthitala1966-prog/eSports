import React, { useEffect } from 'react';
import { AlertTriangle, Printer, PowerOff, X } from 'lucide-react';

interface ClubEchoPrintModalProps {
  isOpen: boolean;
  contextLabel?: string;
  canTurnOffEcho?: boolean;
  onTurnOffAndPrint: () => void;
  onContinuePrint: () => void;
  onCancel: () => void;
}

export const ClubEchoPrintModal: React.FC<ClubEchoPrintModalProps> = ({
  isOpen,
  contextLabel,
  canTurnOffEcho = false,
  onTurnOffAndPrint,
  onContinuePrint,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="club-echo-print-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white border-2 border-amber-500 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-900">
        {/* Top Alert Bar */}
        <div className="bg-amber-500 px-4 py-3 flex items-center justify-between gap-2 text-slate-950">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-5 h-5 shrink-0 stroke-[2.5]" />
            <h3 id="club-echo-print-modal-title" className="font-black text-sm sm:text-base tracking-tight truncate">
              Club Echo Notice
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-black/15 text-slate-950 transition-colors cursor-pointer shrink-0"
            aria-label="Close notice"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Message Content */}
        <div className="p-5 space-y-3">
          {contextLabel && (
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {contextLabel}
            </div>
          )}

          <p className="text-sm sm:text-base font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3.5 leading-snug">
            Still receiving club responses i.e. Club Echo=ON. Recomended that set Club Echo=OFF.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
            {canTurnOffEcho && (
              <button
                type="button"
                id="btn-echo-modal-turn-off-print"
                onClick={onTurnOffAndPrint}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <PowerOff className="w-4 h-4 shrink-0" />
                <span>Set Club Echo=OFF &amp; Print</span>
              </button>
            )}
            <button
              type="button"
              id="btn-echo-modal-continue-print"
              onClick={onContinuePrint}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Continue Print</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

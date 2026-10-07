import React, { useState, useMemo } from 'react';
import { QrCode, X, Copy, Check, ExternalLink } from 'lucide-react';

interface QrLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QrLinkModal: React.FC<QrLinkModalProps> = ({ isOpen, onClose }) => {
  const [qrTargetMode, setQrTargetMode] = useState<'desktop' | 'dev' | 'shared'>('desktop');
  const [copiedLink, setCopiedLink] = useState(false);

  const clientClubName = typeof window !== 'undefined' 
    ? localStorage.getItem('esports_client_club_name') || '' 
    : '';

  const appUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/?mode=client';
    const origin = window.location.origin || '';
    const pathname = window.location.pathname || '/';

    if (qrTargetMode === 'desktop') {
      return `${origin}${pathname}?mode=server`;
    }

    if (qrTargetMode === 'shared') {
      const sharedOrigin = origin.includes('ais-dev-')
        ? origin.replace('ais-dev-', 'ais-pre-')
        : origin.includes('ais-dev.')
        ? origin.replace('ais-dev.', 'ais-pre.')
        : origin;
      return `${sharedOrigin}${pathname}?mode=client`;
    }

    // Default: Mobile dev
    const clientOrigin = origin.includes('ais-dev-')
      ? origin.replace('ais-dev-', 'ais-pre-')
      : origin.includes('ais-dev.')
      ? origin.replace('ais-dev.', 'ais-pre.')
      : origin;
    return `${clientOrigin}${pathname}?mode=client`;
  }, [qrTargetMode]);

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(appUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#0e172e] border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base text-amber-400">
              QR Link & Access
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#070b15] rounded-xl border border-slate-800 mb-3 text-xs font-bold">
          <button
            type="button"
            onClick={() => setQrTargetMode('desktop')}
            className={`py-1.5 px-1.5 rounded-lg transition-all cursor-pointer text-center truncate ${
              qrTargetMode === 'desktop'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Desktop Browser URL for Server Operations"
          >
            🖥️ Desktop Site
          </button>
          <button
            type="button"
            onClick={() => setQrTargetMode('dev')}
            className={`py-1.5 px-1.5 rounded-lg transition-all cursor-pointer text-center truncate ${
              qrTargetMode === 'dev'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Mobile Live Dev Link"
          >
            📱 Mobile Dev
          </button>
          <button
            type="button"
            onClick={() => setQrTargetMode('shared')}
            className={`py-1.5 px-1.5 rounded-lg transition-all cursor-pointer text-center truncate ${
              qrTargetMode === 'shared'
                ? 'bg-emerald-400 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Mobile Public Shared Link (No login required)"
          >
            🌐 Mobile Public
          </button>
        </div>

        <div className="flex flex-col items-center text-center space-y-3">
          {/* Scalable High Contrast QR Code Display */}
          <div className="p-3 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center border-4 border-amber-400">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(appUrl)}`}
              alt="QR Code"
              className="w-48 h-48 object-contain"
              loading="lazy"
            />
          </div>

          {/* Simple subtitle for mobile/public scan if applicable */}
          {qrTargetMode !== 'desktop' && (
            <div className="space-y-0.5 text-center">
              <p className="text-xs font-semibold text-slate-300">
                Scan this QR code with any smartphone camera to open the Public portal.
              </p>
              {clientClubName && (
                <p className="text-[11px] text-amber-400 font-bold">
                  Club: {clientClubName}
                </p>
              )}
            </div>
          )}

          {/* URL Box + Copy Button */}
          <div className="w-full flex items-center gap-2 bg-[#0b1326] p-2 rounded-xl border border-slate-800">
            <input
              type="text"
              readOnly
              value={appUrl}
              className="bg-transparent text-xs font-mono text-slate-300 w-full focus:outline-hidden px-2 truncate select-all"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-slate-950" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-950" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <div className="w-full grid grid-cols-2 gap-2 pt-1">
            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Link</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

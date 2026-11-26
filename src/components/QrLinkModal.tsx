import React, { useState, useMemo, useRef, useEffect } from 'react';
import { QrCode, X, Copy, Check, ExternalLink } from 'lucide-react';

interface QrLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'client' | 'server';
}

async function copyTextReliably(
  text: string,
  inputEl?: HTMLInputElement | null,
): Promise<boolean> {
  // 1. Modern Clipboard API (may reject inside sandboxed iframes without clipboard-write permission)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  // 2. Fallback via offscreen textarea + document.execCommand('copy')
  if (typeof document !== 'undefined') {
    let textarea: HTMLTextAreaElement | null = null;
    try {
      textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '2em';
      textarea.style.height = '2em';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const copied = document.execCommand('copy');
      if (copied) return true;
    } catch {
      // Fall through to input selection fallback
    } finally {
      if (textarea && textarea.parentNode) {
        textarea.parentNode.removeChild(textarea);
      }
    }

    // 3. Fallback directly on the visible readonly URL input
    if (inputEl) {
      try {
        inputEl.focus({ preventScroll: true });
        inputEl.select();
        inputEl.setSelectionRange(0, text.length);
        if (document.execCommand('copy')) {
          return true;
        }
      } catch {
        // Ignore
      }
    }
  }

  return false;
}

export const QrLinkModal: React.FC<QrLinkModalProps> = ({ isOpen, onClose, mode = 'server' }) => {
  const [qrTargetMode, setQrTargetMode] = useState<'desktop' | 'shared'>('shared');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [popupBlockedNotice, setPopupBlockedNotice] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const popupCheckTimerRef = useRef<number | null>(null);

  const isClientOnly = mode === 'client';

  // Reset modal transient states when opened or closed
  useEffect(() => {
    if (isOpen) {
      setQrTargetMode('shared');
      setCopiedLink(false);
      setCopyFailed(false);
      setPopupBlockedNotice(false);
    }
    return () => {
      if (popupCheckTimerRef.current !== null) {
        window.clearTimeout(popupCheckTimerRef.current);
        popupCheckTimerRef.current = null;
      }
    };
  }, [isOpen]);

  const clientClubName = typeof window !== 'undefined' 
    ? localStorage.getItem('esports_client_club_name') || '' 
    : '';

  const appUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/?mode=client';
    const origin = window.location.origin || '';

    const sharedOrigin = origin.includes('ais-dev-')
      ? origin.replace('ais-dev-', 'ais-pre-')
      : origin.includes('ais-dev.')
      ? origin.replace('ais-dev.', 'ais-pre.')
      : origin;

    // For client enroll page QR code, strictly link to client mode
    if (isClientOnly || qrTargetMode === 'shared') {
      return `${sharedOrigin}/?mode=client`;
    }

    return `${origin}/?mode=server`;
  }, [qrTargetMode, isClientOnly]);

  const handleCopyLink = async () => {
    const ok = await copyTextReliably(appUrl, urlInputRef.current);
    if (ok) {
      setCopyFailed(false);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } else {
      setCopiedLink(false);
      setCopyFailed(true);
      if (urlInputRef.current) {
        urlInputRef.current.focus();
        urlInputRef.current.select();
        urlInputRef.current.setSelectionRange(0, appUrl.length);
      }
      window.setTimeout(() => setCopyFailed(false), 3500);
    }
  };

  const handleOpenLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === 'undefined') return;

    const isStandalonePwa =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    const ua = window.navigator?.userAgent || '';
    const isEmbeddedWebView = /;\s*wv\)|FBAN|FBAV|Instagram|Line\/|MicroMessenger/i.test(ua);
    const isInIframe = window.self !== window.top;

    // Standalone PWAs and embedded mobile WebViews often drop target="_blank"
    if (!isInIframe && (isStandalonePwa || isEmbeddedWebView)) {
      e.preventDefault();
      onClose();
      window.location.assign(appUrl);
      return;
    }

    // Inside an iframe (or desktop browser with popup blocker), detect if new tab stayed blocked
    if (popupCheckTimerRef.current !== null) {
      window.clearTimeout(popupCheckTimerRef.current);
    }
    const handleWindowBlur = () => {
      if (popupCheckTimerRef.current !== null) {
        window.clearTimeout(popupCheckTimerRef.current);
        popupCheckTimerRef.current = null;
      }
      window.removeEventListener('blur', handleWindowBlur);
    };
    window.addEventListener('blur', handleWindowBlur, { once: true });

    popupCheckTimerRef.current = window.setTimeout(async () => {
      window.removeEventListener('blur', handleWindowBlur);
      popupCheckTimerRef.current = null;
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        await copyTextReliably(appUrl, urlInputRef.current);
        setPopupBlockedNotice(true);
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 2500);
      }
    }, 450);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#0e172e] border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-base text-amber-400 leading-tight">
                {isClientOnly ? 'Client Enroll QR Code' : 'QR Link & Access'}
              </h3>
              {isClientOnly && (
                <p className="text-[11px] text-slate-400">
                  Client Candidate Enrollment Portal
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs: Shown only in server mode, hidden for client enroll page */}
        {!isClientOnly && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#070b15] rounded-xl border border-slate-800 mb-3 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setQrTargetMode('shared');
                setPopupBlockedNotice(false);
              }}
              className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer text-center truncate ${
                qrTargetMode === 'shared'
                  ? 'bg-emerald-400 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Mobile Public Shared Link (No login required)"
            >
              🌐 Mobile Public
            </button>
            <button
              type="button"
              onClick={() => {
                setQrTargetMode('desktop');
                setPopupBlockedNotice(false);
              }}
              className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer text-center truncate ${
                qrTargetMode === 'desktop'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Desktop Browser URL for Server Operations"
            >
              🖥️ Desktop Site
            </button>
          </div>
        )}

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

          {/* Subtitle for scan */}
          <div className="space-y-0.5 text-center">
            <p className="text-xs font-semibold text-slate-300">
              {isClientOnly
                ? 'Scan this QR code with any smartphone camera to open the Client Candidate Enrollment portal.'
                : qrTargetMode !== 'desktop'
                ? 'Scan this QR code with any smartphone camera to open the Public portal.'
                : 'Use this QR code / link to open Server Operations on a desktop browser.'}
            </p>
            {clientClubName && (
              <p className="text-[11px] text-amber-400 font-bold">
                Club: {clientClubName}
              </p>
            )}
          </div>

          {/* URL Box + Copy Button */}
          <div className="w-full flex items-center gap-2 bg-[#0b1326] p-2 rounded-xl border border-slate-800">
            <input
              ref={urlInputRef}
              type="text"
              readOnly
              value={appUrl}
              onClick={(e) => {
                const input = e.currentTarget;
                input.select();
                input.setSelectionRange(0, appUrl.length);
              }}
              aria-label="Portal Link URL"
              className="bg-transparent text-xs font-mono text-slate-300 w-full focus:outline-hidden px-2 overflow-x-auto select-all"
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
              ) : copyFailed ? (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-950" />
                  <span>Ctrl+C</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-950" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {popupBlockedNotice && (
            <div className="w-full px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-[11px] flex items-center justify-between gap-2 text-left">
              <span>
                New tab blocked by preview frame — link copied! Paste in a browser tab or open here.
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  window.location.assign(appUrl);
                }}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold cursor-pointer"
              >
                Open Here
              </button>
            </div>
          )}

          <div className="w-full grid grid-cols-2 gap-2 pt-1">
            <a
              href={appUrl}
              target="_blank"
              rel="noopener"
              onClick={handleOpenLinkClick}
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

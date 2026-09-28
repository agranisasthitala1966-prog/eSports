import React, { useState } from 'react';
import { 
  Users, 
  Calendar, 
  Trophy, 
  Printer, 
  Settings as SettingsIcon, 
  Database, 
  Flame, 
  Medal, 
  CloudUpload, 
  CheckCircle2, 
  AlertCircle,
  Menu,
  X,
  UserPlus,
  Server,
  Smartphone,
  ShieldAlert,
  KeyRound,
  Lock,
  Unlock,
  Monitor,
  Copy,
  Check
} from 'lucide-react';
import { SportsMeetSettings } from '../types';

interface NavbarProps {
  currentMode: 'client' | 'server';
  setMode: (mode: 'client' | 'server') => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  settings: SportsMeetSettings;
  unsyncedCount: number;
  onSyncTrigger: () => void;
  isSyncing: boolean;
  serverOnline: boolean;
  isServerAuthenticated: boolean;
  onPromptPin: () => void;
  onOpenResetPin: () => void;
  onLockServer: () => void;
  pendingUploadsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentMode,
  setMode,
  activeTab,
  setActiveTab,
  settings,
  unsyncedCount,
  onSyncTrigger,
  isSyncing,
  serverOnline,
  isServerAuthenticated,
  onPromptPin,
  onOpenResetPin,
  onLockServer,
  pendingUploadsCount,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedDesktopLink, setCopiedDesktopLink] = useState(false);

  const getDesktopUrl = () => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return `${window.location.origin}/?mode=server`;
    }
    return 'https://ais-dev-g4v5u3ijukxjajvttmnfdk-944293067646.asia-southeast1.run.app/?mode=server';
  };

  const handleCopyDesktopUrl = () => {
    const url = getDesktopUrl();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedDesktopLink(true);
      setTimeout(() => setCopiedDesktopLink(false), 2500);
    }
  };

  const clientTabs = [
    { id: 'enroll', label: 'Enroll Candidate', icon: UserPlus },
    { id: 'candidates', label: 'View / Edit Candidates', icon: Users },
  ];

  const serverTabs = [
    { 
      id: 'uploads', 
      label: 'Review & Approve', 
      icon: CloudUpload, 
      badge: pendingUploadsCount > 0 ? pendingUploadsCount : undefined 
    },
    { id: 'enroll', label: 'Enroll Candidate', icon: UserPlus },
    { id: 'candidates', label: 'All Candidates', icon: Users },
    { id: 'events', label: 'Event Master List', icon: Calendar },
    { id: 'heats', label: 'Hit / Final List', icon: Flame },
    { id: 'rankings', label: 'Ranking & Points', icon: Trophy },
    { id: 'reports', label: 'Print Reports', icon: Printer },
    { id: 'admin', label: 'Admin Panel', icon: SettingsIcon },
    { id: 'db', label: 'DB Explorer', icon: Database },
  ];

  const currentTabs = currentMode === 'client' ? clientTabs : serverTabs;

  const handleServerModeClick = () => {
    if (!isServerAuthenticated) {
      onPromptPin();
    } else {
      setMode('server');
      if (!serverTabs.some(t => t.id === activeTab)) {
        setActiveTab('uploads');
      }
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs print:hidden">
      {/* Top Bar with Meet Info & Mode Switcher */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-2 sm:gap-4">
          
          {/* Brand & Logo */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-11 h-11 sm:w-13 sm:h-13 shrink-0 rounded-full p-0.5 bg-gradient-to-tr from-amber-400 via-blue-600 to-amber-300 shadow-md">
              <img 
                src="/icon.svg" 
                alt="eSports Logo" 
                className="w-full h-full object-cover rounded-full bg-blue-900"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-blue-950 font-serif">
                  e<span className="text-blue-600">Sports</span>
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                  Sports Management System
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-600 truncate flex items-center gap-1.5">
                <span className="text-amber-600 font-bold">{settings.ordinalTitle || '47th Annual Sports Meet 2027'}</span>
              </p>
            </div>
          </div>

          {/* Center / Right controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Server Online/Offline Indicator */}
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 border border-slate-200 text-slate-700">
              <span className={`w-2 h-2 rounded-full ${serverOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>{serverOnline ? 'Server Online' : 'Offline Mode'}</span>
            </div>

            {/* Sync / Send Button (in client mode) */}
            {currentMode === 'client' && (
              <button
                id="header-sync-btn"
                onClick={onSyncTrigger}
                disabled={isSyncing || unsyncedCount === 0}
                title={unsyncedCount > 0 ? `${unsyncedCount} new/updated entries ready to upload to server` : 'All entries synced'}
                className={`flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer ${
                  unsyncedCount > 0
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
              >
                <CloudUpload className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">
                  {isSyncing ? 'Uploading...' : unsyncedCount > 0 ? `Upload to Server (${unsyncedCount})` : 'Uploaded'}
                </span>
                <span className="sm:hidden">
                  {unsyncedCount > 0 ? `${unsyncedCount}` : '✓'}
                </span>
              </button>
            )}

            {/* Desktop Link Button (Quick Copy for Desktop Browser) */}
            <button
              type="button"
              onClick={handleCopyDesktopUrl}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all cursor-pointer shadow-2xs"
              title="Copy Desktop Browser Link (Server Operations)"
            >
              <Monitor className="w-3.5 h-3.5 text-blue-600" />
              <span>{copiedDesktopLink ? 'Copied Desktop Link!' : 'Desktop Link'}</span>
              {copiedDesktopLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-blue-500" />
              )}
            </button>

            {/* Mode Switcher Toggle: Client Portal vs Server Operations */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                id="toggle-client-mode"
                onClick={() => {
                  setMode('client');
                  if (!clientTabs.some(t => t.id === activeTab)) {
                    setActiveTab('enroll');
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentMode === 'client'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Client Portal</span>
                <span className="sm:hidden">Client</span>
              </button>

              <button
                id="toggle-server-mode"
                onClick={handleServerModeClick}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentMode === 'server'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={!isServerAuthenticated ? 'PIN Protected - Click to authenticate' : 'Server Control'}
              >
                {isServerAuthenticated ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-amber-500" />}
                <span className="hidden sm:inline">Server Control</span>
                <span className="sm:hidden">Server</span>
                {pendingUploadsCount > 0 && currentMode !== 'server' && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </button>
            </div>

            {/* Server Mode Tools: Reset PIN and Lock */}
            {currentMode === 'server' && isServerAuthenticated && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onOpenResetPin}
                  className="p-2 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer border border-slate-200"
                  title="Reset / Change Server Login PIN"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onLockServer}
                  className="p-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-slate-200"
                  title="Lock Server Control"
                >
                  <Lock className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mobile / Tablet menu button */}
            <button
              id="navbar-hamburger-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 border border-slate-200 lg:hidden flex items-center justify-center transition-colors"
              aria-label="Toggle navigation menu"
              title="Menu navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Desktop Tab Navigation */}
        <nav className="hidden lg:flex space-x-1 overflow-x-auto py-2 border-t border-slate-100 no-scrollbar">
          {currentTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = (tab as any).badge;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer relative ${
                  isActive
                    ? currentMode === 'server'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? (currentMode === 'server' ? 'text-white' : 'text-blue-600') : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {badge !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-amber-400 text-slate-950' : 'bg-amber-500 text-white'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-4 space-y-1 shadow-lg">
          <div className="px-2 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>{currentMode === 'client' ? 'Client Operations' : 'Server Operations'}</span>
            {currentMode === 'server' && (
              <button
                onClick={onOpenResetPin}
                className="text-amber-600 hover:underline text-[11px] font-semibold"
              >
                Reset PIN
              </button>
            )}
          </div>
          {currentTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = (tab as any).badge;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </div>
                {badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-400 text-slate-950">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};


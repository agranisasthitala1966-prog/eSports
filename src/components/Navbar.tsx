import React, { useState, useRef, useEffect } from 'react';
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
  QrCode,
  Globe,
  ChevronDown
} from 'lucide-react';
import { SportsMeetSettings } from '../types';
import { QrLinkModal } from './QrLinkModal';

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
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // Position calculation so popup floats over scrolling page section with no scrollbars
  const updateMenuPosition = () => {
    if (settingsButtonRef.current) {
      const rect = settingsButtonRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 8,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }
  };

  useEffect(() => {
    if (showSettingsMenu) {
      updateMenuPosition();
      window.addEventListener('resize', updateMenuPosition);
      window.addEventListener('scroll', updateMenuPosition, true);
    }
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [showSettingsMenu]);

  // Close context menu on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        settingsMenuRef.current && 
        !settingsMenuRef.current.contains(target) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(target)
      ) {
        setShowSettingsMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettingsMenu(false);
      }
    };
    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSettingsMenu]);

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
    { id: 'heats', label: 'Hit / Final List', icon: Flame },
    { id: 'rankings', label: 'Ranking & Points', icon: Trophy },
    { id: 'reports', label: 'Print Reports', icon: Printer },
  ];

  const currentTabs = currentMode === 'client' ? clientTabs : serverTabs;

  const handleServerModeClick = () => {
    if (!isServerAuthenticated) {
      onPromptPin();
    } else {
      setMode('server');
      const allServerTabs = [...serverTabs.map(t => t.id), 'admin', 'db'];
      if (!allServerTabs.includes(activeTab)) {
        setActiveTab('uploads');
      }
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs print:hidden">
      {/* Top Bar with Meet Info & Mode Switcher */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
          
          {/* Brand & Logo (shrink-0 so never squeezed or overlapped) */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
            <img 
              src="/icon.png" 
              alt="eSports Logo" 
              className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 object-contain"
            />
            <div className="shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-2xl font-black tracking-tight font-serif">
                  <span style={{ color: '#ff0000' }} className="text-[#ff0000]">e</span><span className="text-blue-600">Sports</span>
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                  Sports Management System
                </span>
              </div>
            </div>
          </div>

          {/* Desktop / Tablet Controls (sm and up) */}
          <div className="hidden sm:flex items-center gap-2 sm:gap-3 shrink-0">
            
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
                <span>
                  {isSyncing ? 'Uploading...' : unsyncedCount > 0 ? `Upload to Server (${unsyncedCount})` : 'Uploaded'}
                </span>
              </button>
            )}

            {/* QR Link Button */}
            <button
              type="button"
              id="header-qr-link-btn"
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-all cursor-pointer shadow-2xs active:scale-98"
              title="View & Share QR Link"
            >
              <QrCode className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>QR Link</span>
            </button>

            {/* Mode Switcher Toggle: Public vs Server */}
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
                <span>Public</span>
              </button>

              <button
                id="toggle-server-mode"
                onClick={handleServerModeClick}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentMode === 'server'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={!isServerAuthenticated ? 'PIN Protected - Click to authenticate' : 'Server Operations'}
              >
                {isServerAuthenticated ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-amber-500" />}
                <span>Server</span>
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

            {/* Tablet menu button (sm to lg) */}
            <button
              id="navbar-tablet-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 border border-slate-200 lg:hidden flex items-center justify-center transition-colors"
              aria-label="Toggle navigation menu"
              title="Menu navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile Right Controls: Mode Toggle & Hamburger Button (sm:hidden) */}
          <div className="flex sm:hidden items-center gap-1.5 shrink-0">
            {/* Mode Switcher Toggle: Compact for mobile */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                id="toggle-client-mode-mobile"
                onClick={() => {
                  setMode('client');
                  if (!clientTabs.some(t => t.id === activeTab)) {
                    setActiveTab('enroll');
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  currentMode === 'client'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span>Public</span>
              </button>

              <button
                id="toggle-server-mode-mobile"
                onClick={handleServerModeClick}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  currentMode === 'server'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={!isServerAuthenticated ? 'PIN Protected - Click to authenticate' : 'Server Operations'}
              >
                {isServerAuthenticated ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3 text-amber-500" />}
                <span>Server</span>
                {pendingUploadsCount > 0 && currentMode !== 'server' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                )}
              </button>
            </div>

            {/* Mobile Hamburger menu button */}
            <button
              id="navbar-hamburger-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 border border-slate-200 flex items-center justify-center transition-colors"
              aria-label="Toggle navigation menu"
              title="Menu navigation"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Desktop Tab Navigation */}
        <nav className="hidden lg:flex items-center space-x-1 py-2 border-t border-slate-100 overflow-visible relative">
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

          {/* Clubbed Settings Menu (Admin Panel & DB Explorer) in Server Mode */}
          {currentMode === 'server' && (
            <div className="relative inline-block ml-1">
              <button
                ref={settingsButtonRef}
                type="button"
                id="tab-settings-clubbed"
                onClick={() => {
                  updateMenuPosition();
                  setShowSettingsMenu((prev) => !prev);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer relative ${
                  activeTab === 'admin' || activeTab === 'db'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : showSettingsMenu
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Settings &amp; Database Administration"
                aria-expanded={showSettingsMenu}
              >
                <SettingsIcon className={`w-4 h-4 ${activeTab === 'admin' || activeTab === 'db' ? 'text-white' : 'text-slate-400'}`} />
                <span>Settings</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showSettingsMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Context-menu like Popup: Overlapped directly on scrolling section of the page without any parent scrollbar */}
              {showSettingsMenu && (
                <div 
                  ref={settingsMenuRef}
                  className="fixed w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-3 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
                  style={{
                    top: `${menuCoords.top}px`,
                    right: `${menuCoords.right}px`,
                    boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.22), 0 10px 20px -5px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  {/* Header Row */}
                  <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100 px-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      SYSTEM SETTINGS &amp; DB
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                      SERVER
                    </span>
                  </div>

                  {/* Menu Options */}
                  <div className="space-y-1 mt-1">
                    {/* 1. Admin Panel */}
                    <button
                      type="button"
                      id="menu-admin-panel"
                      onClick={() => {
                        setActiveTab('admin');
                        setShowSettingsMenu(false);
                      }}
                      className={`w-full flex items-start gap-3 p-2.5 rounded-xl transition-all text-left cursor-pointer group ${
                        activeTab === 'admin'
                          ? 'bg-blue-50/70 border border-blue-200/60'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-700 group-hover:bg-slate-200/80 transition-colors">
                        <SettingsIcon className="w-4 h-4 text-slate-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs sm:text-sm text-slate-900 leading-tight">
                          Admin Panel
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium leading-normal mt-0.5">
                          Manage meet rules, clubs &amp; backups
                        </p>
                      </div>
                    </button>

                    {/* 2. DB Explorer */}
                    <button
                      type="button"
                      id="menu-db-explorer"
                      onClick={() => {
                        setActiveTab('db');
                        setShowSettingsMenu(false);
                      }}
                      className={`w-full flex items-start gap-3 p-2.5 rounded-xl transition-all text-left cursor-pointer group ${
                        activeTab === 'db'
                          ? 'bg-blue-50/70 border border-blue-200/60'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-700 group-hover:bg-slate-200/80 transition-colors">
                        <Database className="w-4 h-4 text-slate-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs sm:text-sm text-slate-900 leading-tight">
                          DB Explorer
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium leading-normal mt-0.5">
                          Inspect &amp; live edit raw database records
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>

      {/* Mobile Screen Friendly Secondary Action Bar (sm:hidden) */}
      <div className="sm:hidden bg-slate-50/95 border-t border-slate-200/80 px-3 py-1.5 flex items-center justify-between gap-2 shadow-2xs">
        {/* Left Side Actions */}
        <div className="flex items-center gap-1.5 min-w-0">
          {currentMode === 'client' ? (
            <button
              id="mobile-header-sync-btn"
              onClick={onSyncTrigger}
              disabled={isSyncing || unsyncedCount === 0}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                unsyncedCount > 0
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              <CloudUpload className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="truncate">
                {isSyncing ? 'Uploading...' : unsyncedCount > 0 ? `Upload (${unsyncedCount})` : 'All Uploaded'}
              </span>
            </button>
          ) : (
            currentMode === 'server' && isServerAuthenticated && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="mobile-server-pin-btn"
                  onClick={onOpenResetPin}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-lg text-xs font-bold text-slate-700 hover:text-amber-800 shadow-2xs transition-colors cursor-pointer"
                  title="Reset / Change Server Login PIN"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>PIN</span>
                </button>
                <button
                  type="button"
                  id="mobile-server-lock-btn"
                  onClick={onLockServer}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-lg text-xs font-bold text-slate-700 hover:text-rose-700 shadow-2xs transition-colors cursor-pointer"
                  title="Lock Server Control"
                >
                  <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>Lock</span>
                </button>
              </div>
            )
          )}
        </div>

        {/* Right Side Actions: QR Link & Status */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            id="mobile-header-qr-link-btn"
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-all cursor-pointer shadow-2xs"
            title="View & Share QR Link"
          >
            <QrCode className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>QR Link</span>
          </button>

          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <span className={`w-2 h-2 rounded-full ${serverOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span>{serverOnline ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-4 space-y-1 shadow-lg">
          <div className="px-2 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>{currentMode === 'client' ? 'Public Operations' : 'Server Operations'}</span>
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

          {/* Settings Group for Mobile in Server Mode */}
          {currentMode === 'server' && (
            <div className="pt-2 mt-2 border-t border-slate-100 space-y-1">
              <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <SettingsIcon className="w-3.5 h-3.5" />
                <span>Settings &amp; Tools</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('admin');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <SettingsIcon className="w-4 h-4" />
                <span>Admin Panel</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('db');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'db' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>DB Explorer</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* QR Link Modal */}
      <QrLinkModal isOpen={showQrModal} onClose={() => setShowQrModal(false)} />
    </header>
  );
};


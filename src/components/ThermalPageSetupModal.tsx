import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Sliders, 
  RotateCcw, 
  Save, 
  X, 
  Check, 
  Maximize2, 
  Type, 
  AlignJustify, 
  Scissors, 
  HelpCircle,
  FileCheck
} from 'lucide-react';
import { 
  ThermalPrintSettings, 
  DEFAULT_THERMAL_SETTINGS, 
  getThermalSettings, 
  saveThermalSettings,
  generateThermalPrintCSS 
} from '../utils/thermalSettings';
import { SportsMeetSettings } from '../types';

interface ThermalPageSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings?: SportsMeetSettings;
}

export const ThermalPageSetupModal: React.FC<ThermalPageSetupModalProps> = ({
  isOpen,
  onClose,
  settings,
}) => {
  const [config, setConfig] = useState<ThermalPrintSettings>(getThermalSettings());
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [isTestPrinting, setIsTestPrinting] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'settings' | 'preview'>('settings');

  useEffect(() => {
    if (isOpen) {
      setConfig(getThermalSettings());
      setSavedSuccess(false);
      setIsTestPrinting(false);
      setMobileTab('settings');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveThermalSettings(config);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 2000);
  };

  const handleReset = () => {
    setConfig({ ...DEFAULT_THERMAL_SETTINGS });
    setSavedSuccess(false);
  };

  const handleTestPrint = () => {
    setIsTestPrinting(true);
    // Allow React state to update before calling print
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setIsTestPrinting(false);
      }, 500);
    }, 150);
  };

  const orgName = settings?.registeredClubName || settings?.organizer || 'Agrani Sasthitala Sangha';
  const orgVenue = settings?.venue || 'Sasthitala Agrani Club Ground, Hooghly';
  const orgPhone = settings?.registeredClubPhone ? `Ph: ${settings.registeredClubPhone}` : 'Ph: +91 98300 00000';
  const eventTitle = settings?.ordinalTitle || '47th Annual Sports Meet 2027';

  // Current timestamp formatted for receipt
  const currentTimestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      
      {/* Dynamic Thermal Print Stylesheet */}
      <style>{generateThermalPrintCSS(config)}</style>

      {/* When isTestPrinting is active, provide special rules to hide everything except the test receipt */}
      {isTestPrinting && (
        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #thermal-test-print-receipt,
            #thermal-test-print-receipt * {
              visibility: visible !important;
            }
            #thermal-test-print-receipt {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: ${config.printableWidth}mm !important;
              margin: 0 auto !important;
              padding: ${config.topMargin || 5}mm ${config.marginHorizontal}mm ${config.feedBeforeCut}mm ${config.marginHorizontal}mm !important;
              display: block !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
          }
        `}</style>
      )}

      {/* Main Modal Card */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[94vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 print:hidden">
        
        {/* Modal Header: Responsive and mobile-friendly */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-850 border-b border-slate-750 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              <Sliders className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h2 className="text-sm sm:text-lg font-bold text-white tracking-tight truncate">
                  58mm Thermal Printer Setup
                </h2>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ESC/POS 203 DPI
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate hidden xs:block sm:block">
                Configure roll dimensions, printable width, margins, font sizing, and test print.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-rose-600 transition-colors cursor-pointer shrink-0"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Mobile Tab Switcher (Visible on mobile only, hidden on lg screens) */}
        <div className="lg:hidden flex bg-slate-800/90 p-1 mx-3 mt-2.5 rounded-xl border border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('settings')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              mobileTab === 'settings'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Setup Settings</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('preview')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              mobileTab === 'preview'
                ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Live Receipt Preview</span>
          </button>
        </div>

        {/* Modal Body: Responsive grid (Controls on Left, Live Preview on Right) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6">
          
          {/* Controls Column (7 cols on lg, toggleable on mobile) */}
          <div className={`lg:col-span-7 space-y-2.5 sm:space-y-4 ${mobileTab === 'settings' ? 'block' : 'hidden lg:block'}`}>
            
            {/* Paper Width (Locked Standard 58mm) */}
            <div className="bg-slate-800/80 p-2.5 sm:p-3.5 rounded-xl border border-slate-700/80 space-y-1 sm:space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                  Paper Roll Width
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-700 text-xs font-mono font-bold text-amber-400 border border-slate-600">
                  58 mm (2.28 in)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Standard 58mm direct thermal receipt paper roll. Height automatically expands based on receipt length without page breaks.
              </p>
            </div>

            {/* Printable Width Adjustment (40mm to 54mm) */}
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <label 
                  htmlFor="input-printable-width"
                  className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  Printable Width
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-blue-400">
                    {config.printableWidth} mm
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({Math.round(config.printableWidth * 8)} dots)
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="input-printable-width"
                  type="range"
                  min="40"
                  max="54"
                  step="1"
                  value={config.printableWidth}
                  onChange={(e) => setConfig({ ...config, printableWidth: Number(e.target.value) })}
                  className="flex-1 accent-blue-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                />
                <input
                  type="number"
                  min="40"
                  max="54"
                  value={config.printableWidth}
                  onChange={(e) => setConfig({ ...config, printableWidth: Number(e.target.value) })}
                  className="w-14 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-xs text-center font-mono text-white font-bold"
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Narrow (40mm)</span>
                <span className="text-emerald-400 font-semibold">Recommended: 48mm</span>
                <span>Wide (54mm)</span>
              </div>
            </div>

            {/* Left & Right Margins (0mm to 6mm) */}
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <label 
                  htmlFor="input-margin-h"
                  className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <AlignJustify className="w-3.5 h-3.5 text-cyan-400" />
                  Left &amp; Right Margin
                </label>
                <span className="text-xs font-mono font-bold text-cyan-400">
                  {config.marginHorizontal} mm
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="input-margin-h"
                  type="range"
                  min="0"
                  max="6"
                  step="0.5"
                  value={config.marginHorizontal}
                  onChange={(e) => setConfig({ ...config, marginHorizontal: Number(e.target.value) })}
                  className="flex-1 accent-cyan-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                />
                <input
                  type="number"
                  min="0"
                  max="6"
                  step="0.5"
                  value={config.marginHorizontal}
                  onChange={(e) => setConfig({ ...config, marginHorizontal: Number(e.target.value) })}
                  className="w-14 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-xs text-center font-mono text-white font-bold"
                />
              </div>
              <p className="text-[10.5px] text-slate-400">
                Adjust if printed text touches or clips the paper roll edges.
              </p>
            </div>

            {/* Page Top Margin (0mm to 15mm) */}
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <label 
                  htmlFor="input-margin-top"
                  className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  Page Top Margin (Feed Before Print)
                </label>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {config.topMargin || 5} mm
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="input-margin-top"
                  type="range"
                  min="0"
                  max="15"
                  step="1"
                  value={config.topMargin || 5}
                  onChange={(e) => setConfig({ ...config, topMargin: Number(e.target.value) })}
                  className="flex-1 accent-emerald-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                />
                <input
                  type="number"
                  min="0"
                  max="15"
                  step="1"
                  value={config.topMargin || 5}
                  onChange={(e) => setConfig({ ...config, topMargin: Number(e.target.value) })}
                  className="w-14 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-xs text-center font-mono text-white font-bold"
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0mm (No feed)</span>
                <span className="text-emerald-400 font-semibold">Recommended: 5mm</span>
                <span>15mm</span>
              </div>
            </div>

            {/* Font Size & Line Spacing Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* Font Size (8px to 13px) */}
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label 
                    htmlFor="input-font-size"
                    className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                  >
                    <Type className="w-3.5 h-3.5 text-amber-400" />
                    Font Size
                  </label>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {config.fontSize} px
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="input-font-size"
                    type="range"
                    min="8"
                    max="13"
                    step="0.5"
                    value={config.fontSize}
                    onChange={(e) => setConfig({ ...config, fontSize: Number(e.target.value) })}
                    className="flex-1 accent-amber-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                  />
                  <input
                    type="number"
                    min="8"
                    max="13"
                    step="0.5"
                    value={config.fontSize}
                    onChange={(e) => setConfig({ ...config, fontSize: Number(e.target.value) })}
                    className="w-13 px-1.5 py-1 rounded bg-slate-900 border border-slate-600 text-xs text-center font-mono text-white font-bold"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>8px</span>
                  <span className="text-emerald-400">Default: 9.5px</span>
                  <span>13px</span>
                </div>
              </div>

              {/* Line Spacing (1.05 to 1.50) */}
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label 
                    htmlFor="input-line-spacing"
                    className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                  >
                    <AlignJustify className="w-3.5 h-3.5 text-purple-400" />
                    Line Spacing
                  </label>
                  <span className="text-xs font-mono font-bold text-purple-400">
                    {config.lineSpacing}x
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="input-line-spacing"
                    type="range"
                    min="1.05"
                    max="1.50"
                    step="0.05"
                    value={config.lineSpacing}
                    onChange={(e) => setConfig({ ...config, lineSpacing: Number(e.target.value) })}
                    className="flex-1 accent-purple-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                  />
                  <input
                    type="number"
                    min="1.05"
                    max="1.50"
                    step="0.05"
                    value={config.lineSpacing}
                    onChange={(e) => setConfig({ ...config, lineSpacing: Number(e.target.value) })}
                    className="w-13 px-1.5 py-1 rounded bg-slate-900 border border-slate-600 text-xs text-center font-mono text-white font-bold"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Compact</span>
                  <span className="text-emerald-400">Default: 1.25x</span>
                  <span>Spaced</span>
                </div>
              </div>

            </div>

            {/* Bottom Feed / Cutter Spacing (2mm to 10mm) */}
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <label 
                  htmlFor="input-feed-cut"
                  className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <Scissors className="w-3.5 h-3.5 text-rose-400" />
                  Feed Before Cut (Bottom Margin)
                </label>
                <span className="text-xs font-mono font-bold text-rose-400">
                  {config.feedBeforeCut} mm
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="input-feed-cut"
                  type="range"
                  min="2"
                  max="12"
                  step="1"
                  value={config.feedBeforeCut}
                  onChange={(e) => setConfig({ ...config, feedBeforeCut: Number(e.target.value) })}
                  className="flex-1 accent-rose-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                />
                <input
                  type="number"
                  min="2"
                  max="12"
                  value={config.feedBeforeCut}
                  onChange={(e) => setConfig({ ...config, feedBeforeCut: Number(e.target.value) })}
                  className="w-14 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-xs text-center font-mono text-white font-bold"
                />
              </div>
              <p className="text-[10.5px] text-slate-400">
                Feeds extra paper at receipt end so the manual tear bar or auto-cutter does not chop off the footer.
              </p>
            </div>

            {/* Action Buttons: Reset, Test Print, Save (Responsive Grid) */}
            <div className="grid grid-cols-12 gap-1.5 sm:gap-2 pt-2.5 border-t border-slate-750">
              <button
                type="button"
                onClick={handleReset}
                className="col-span-3 px-2 sm:px-3 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-98"
                title="Restore standard 58mm recommended settings"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Defaults</span>
              </button>

              <button
                type="button"
                onClick={handleTestPrint}
                className="col-span-4 px-2 sm:px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-750 border border-slate-650 hover:border-amber-400/50 flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer active:scale-98"
                title="Print test calibration receipt on 58mm thermal printer"
              >
                <Printer className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">Test Print</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                className={`col-span-5 px-3 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-98 ${
                  savedSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3] shrink-0" />
                    <span className="truncate">Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 shrink-0" />
                    <span className="truncate">Save Settings</span>
                  </>
                )}
              </button>
            </div>

          </div>

          {/* Right Column: Live Simulated 58mm Thermal Receipt Preview (5 cols on lg, toggleable on mobile) */}
          <div className={`lg:col-span-5 flex-col items-center ${mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'}`}>
            
            <div className="w-full flex items-center justify-between mb-2 px-1">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>Live 58mm Print Preview</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                58mm Roll / {config.printableWidth}mm Net
              </span>
            </div>

            {/* Paper Container Roll with Realistic Thermal Paper Mockup */}
            <div className="w-full bg-slate-950 p-2 sm:p-4 rounded-xl border border-slate-800 flex justify-center overflow-x-auto shadow-inner">
              
              {/* Simulated 58mm paper roll (rendered at exact physical width ratio) */}
              <div 
                className="bg-white text-black shadow-2xl relative select-none"
                style={{
                  width: `${config.printableWidth}mm`,
                  paddingLeft: `${config.marginHorizontal}mm`,
                  paddingRight: `${config.marginHorizontal}mm`,
                  paddingTop: `${config.topMargin || 5}mm`,
                  paddingBottom: `${config.feedBeforeCut}mm`,
                  fontSize: `${config.fontSize}px`,
                  lineHeight: config.lineSpacing,
                  fontFamily: 'Consolas, "Courier New", monospace',
                }}
              >
                {/* Visual Top Serrated Tear Guide */}
                <div className="text-center text-[7.5px] text-gray-500 border-b border-dashed border-gray-400 pb-1 mb-1 tracking-widest font-mono">
                  - - - 58MM THERMAL ROLL - - -
                </div>

                {/* Receipt Header: Business Name Centered and Bold */}
                <div className="text-center pb-1 mb-1 border-b border-dashed border-black">
                  <div className="font-extrabold uppercase text-[1.08em] tracking-tight leading-tight">
                    {orgName}
                  </div>
                  {/* Address & contact details centered */}
                  <div className="text-[0.9em] leading-tight text-gray-800 mt-0.5">
                    {orgVenue}
                  </div>
                  <div className="text-[0.88em] leading-tight text-gray-800">
                    {orgPhone}
                  </div>
                  <div className="text-[0.88em] font-bold text-black mt-0.5">
                    {eventTitle}
                  </div>
                </div>

                {/* Invoice / Reference Number and Date */}
                <div className="text-[0.9em] pb-1 mb-1 border-b border-dashed border-black leading-tight">
                  <div className="flex justify-between font-bold">
                    <span>REF: #ESM-2027</span>
                    <span>58MM ESC/POS</span>
                  </div>
                  <div className="flex justify-between text-gray-800">
                    <span>DATE: 26/01/2027</span>
                    <span>10:30 AM</span>
                  </div>
                </div>

                {/* Product / Event Descriptions Wrap & Align Table */}
                <div className="pb-1 mb-1 border-b border-dashed border-black">
                  <div className="flex justify-between font-bold border-b border-black pb-0.5 mb-0.5 text-[0.92em]">
                    <span className="w-7 text-left">CH#</span>
                    <span className="flex-1 px-1 text-left">ITEM / EVENT</span>
                    <span className="w-10 text-right">FEES</span>
                  </div>
                  
                  {/* Row 1 with text wrap */}
                  <div className="flex justify-between py-0.5 leading-tight text-[0.9em]">
                    <span className="w-7 font-bold">101</span>
                    <span className="flex-1 px-1 break-words">100M SPRINT (BOYS U-14)</span>
                    <span className="w-10 text-right font-mono">₹100</span>
                  </div>

                  {/* Row 2 */}
                  <div className="flex justify-between py-0.5 leading-tight text-[0.9em]">
                    <span className="w-7 font-bold">102</span>
                    <span className="flex-1 px-1 break-words">LONG JUMP (BOYS U-14)</span>
                    <span className="w-10 text-right font-mono">₹100</span>
                  </div>

                  {/* Row 3 */}
                  <div className="flex justify-between py-0.5 leading-tight text-[0.9em]">
                    <span className="w-7 font-bold">103</span>
                    <span className="flex-1 px-1 break-words">HIGH JUMP (GIRLS U-16)</span>
                    <span className="w-10 text-right font-mono">₹100</span>
                  </div>
                </div>

                {/* Subtotal, Discount, Tax, Grand Total, Payment Method */}
                <div className="pb-1 mb-1 border-b border-dashed border-black text-[0.9em] leading-tight space-y-0.5">
                  <div className="flex justify-between">
                    <span>SUBTOTAL:</span>
                    <span className="font-mono">₹300.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DISCOUNT:</span>
                    <span className="font-mono">₹0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>TAX:</span>
                    <span className="font-mono">₹0.00</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-[1.05em] pt-0.5 border-t border-dotted border-black">
                    <span>GRAND TOTAL:</span>
                    <span className="font-mono">₹300.00</span>
                  </div>
                  <div className="flex justify-between text-gray-800 pt-0.5">
                    <span>PAID VIA:</span>
                    <span className="font-bold">CASH [PAID]</span>
                  </div>
                </div>

                {/* Event Ranking Sample */}
                <div className="pb-1 mb-1 border-b border-dashed border-black text-[0.88em] leading-tight">
                  <div className="font-bold text-center uppercase tracking-tight mb-0.5">
                    -- RESULTS PREVIEW --
                  </div>
                  <div className="flex justify-between font-bold text-[0.92em] pb-0.5 border-b border-black">
                    <span className="w-7">POS</span>
                    <span className="flex-1 px-1">NAME / CLUB</span>
                    <span className="w-8 text-right">PTS</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="w-7 font-bold">1ST</span>
                    <span className="flex-1 px-1 truncate">Rahul Ghosh (Sasthitala)</span>
                    <span className="w-8 text-right font-mono font-bold">7</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="w-7 font-bold">2ND</span>
                    <span className="flex-1 px-1 truncate">Sourav Das (Progressive)</span>
                    <span className="w-8 text-right font-mono font-bold">5</span>
                  </div>
                </div>

                {/* Alignment & Calibration Ruler Test */}
                <div className="text-[7px] font-mono text-center text-gray-600 pb-1 mb-1 border-b border-dashed border-black leading-none">
                  |&lt;--- 48mm PRINT HEAD (384 DOTS) ---&gt;|
                  <div className="mt-0.5 tracking-tighter">
                    12345678901234567890123456789012
                  </div>
                </div>

                {/* Footer Message */}
                <div className="text-center pt-0.5 text-black">
                  <div className="font-bold text-[0.92em] uppercase tracking-tight">
                    *** THANK YOU ***
                  </div>
                  <div className="text-[0.85em] text-gray-800">
                    eSports Meet Management System
                  </div>
                  <div className="text-[0.78em] text-gray-600 mt-0.5">
                    {currentTimestamp}
                  </div>
                </div>

                {/* Bottom Cut Line */}
                <div className="mt-2 text-center text-[7.5px] text-gray-500 border-t border-dashed border-gray-400 pt-1 font-mono">
                  - - - [ TEAR / CUT HERE ] - - -
                </div>

              </div>

            </div>

            <div className="text-[11px] text-slate-400 mt-2 text-center flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Preview updates instantly as you adjust sliders.</span>
            </div>

            {/* Quick Actions under preview on mobile */}
            <div className="flex lg:hidden items-center justify-between gap-2 w-full mt-2.5 pt-2 border-t border-slate-750">
              <button
                type="button"
                onClick={() => setMobileTab('settings')}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-1 active:scale-98 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={handleTestPrint}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-1 active:scale-98 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400" />
                <span>Test</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 shadow-md cursor-pointer active:scale-98 ${
                  savedSuccess ? 'bg-emerald-600 text-white' : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* Dedicated Hidden 58mm Test Receipt for Direct Physical Print */}
      <div 
        id="thermal-test-print-receipt" 
        className="receipt hidden"
        style={{
          width: `${config.printableWidth}mm`,
          maxWidth: `${config.printableWidth}mm`,
          paddingLeft: `${config.marginHorizontal}mm`,
          paddingRight: `${config.marginHorizontal}mm`,
          paddingTop: '2mm',
          paddingBottom: `${config.feedBeforeCut}mm`,
          fontSize: `${config.fontSize}px`,
          lineHeight: config.lineSpacing,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        }}
      >
        {/* Receipt Header */}
        <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '3px', marginBottom: '3px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.1em', textTransform: 'uppercase' }}>
            {orgName}
          </div>
          <div style={{ fontSize: '0.9em' }}>{orgVenue}</div>
          <div style={{ fontSize: '0.88em' }}>{orgPhone}</div>
          <div style={{ fontWeight: 'bold', fontSize: '0.92em', marginTop: '2px' }}>
            {eventTitle}
          </div>
        </div>

        {/* Invoice / Reference */}
        <div style={{ borderBottom: '1px dashed #000', paddingBottom: '3px', marginBottom: '3px', fontSize: '0.9em' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>TEST RECEIPT #: 001</span>
            <span>58MM USB</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>DATE: {currentTimestamp}</span>
            <span>203 DPI</span>
          </div>
        </div>

        {/* Items Table with Wrapping */}
        <div style={{ borderBottom: '1px dashed #000', paddingBottom: '3px', marginBottom: '3px', fontSize: '0.9em' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '2px' }}>
            <span style={{ width: '28px' }}>CH#</span>
            <span style={{ flex: 1, padding: '0 4px' }}>EVENT / ITEM</span>
            <span style={{ width: '45px', textAlign: 'right' }}>FEES</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ width: '28px', fontWeight: 'bold' }}>101</span>
            <span style={{ flex: 1, padding: '0 4px', wordBreak: 'break-word' }}>100M SPRINT (BOYS U-14)</span>
            <span style={{ width: '45px', textAlign: 'right' }}>₹100.00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ width: '28px', fontWeight: 'bold' }}>102</span>
            <span style={{ flex: 1, padding: '0 4px', wordBreak: 'break-word' }}>HIGH JUMP (GIRLS U-16)</span>
            <span style={{ width: '45px', textAlign: 'right' }}>₹100.00</span>
          </div>
        </div>

        {/* Totals */}
        <div style={{ borderBottom: '1px dashed #000', paddingBottom: '3px', marginBottom: '3px', fontSize: '0.9em' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>SUBTOTAL:</span>
            <span>₹200.00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>DISCOUNT:</span>
            <span>₹0.00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.05em', borderTop: '1px dotted #000', paddingTop: '2px' }}>
            <span>GRAND TOTAL:</span>
            <span>₹200.00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span>PAID VIA:</span>
            <span style={{ fontWeight: 'bold' }}>CASH [PAID]</span>
          </div>
        </div>

        {/* 32-Character Ruler */}
        <div style={{ fontSize: '7.5px', textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '3px', marginBottom: '3px' }}>
          <div>|&lt;--- 48mm PRINT HEAD (384 DOTS) ---&gt;|</div>
          <div>12345678901234567890123456789012</div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', paddingTop: '2px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '0.95em' }}>*** TEST PRINT SUCCESSFUL ***</div>
          <div style={{ fontSize: '0.85em' }}>eSports Meet Management System</div>
          <div style={{ fontSize: '0.8em', marginTop: '2px' }}>{currentTimestamp}</div>
        </div>

        {/* Tear Indicator */}
        <div style={{ textAlign: 'center', fontSize: '7.5px', borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '3px' }}>
          --- [ CUT / TEAR HERE ] ---
        </div>
      </div>

    </div>
  );
};

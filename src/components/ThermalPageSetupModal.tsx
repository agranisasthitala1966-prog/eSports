import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Sliders, 
  RotateCcw, 
  Save, 
  X, 
  Check, 
  Type, 
  AlignJustify, 
  Scissors, 
  HelpCircle,
  FileCheck,
  Bluetooth,
  Smartphone,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Usb,
  Info
} from 'lucide-react';
import { 
  ThermalPrintSettings, 
  DEFAULT_THERMAL_SETTINGS, 
  getThermalSettings, 
  saveThermalSettings,
  generateThermalPrintCSS,
  THERMAL_PRINTER_DRIVERS,
  getSelectedDriverInfo
} from '../utils/thermalSettings';
import { 
  printDirectlyToThermalPrinter, 
  isWebBluetoothSupported, 
  isMobileClient 
} from '../utils/thermalBluetoothPrint';
import { SportsMeetSettings } from '../types';
import { ThermalLogo } from './ThermalLogo';

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
  const [bluetoothStatus, setBluetoothStatus] = useState<string>('');
  const [isScanningBluetooth, setIsScanningBluetooth] = useState<boolean>(false);

  const activeDriver = getSelectedDriverInfo(config.printerDriver);
  const activeDriverDisplayName = config.printerDriver === 'custom' && config.customDriverName
    ? config.customDriverName
    : activeDriver.name;

  useEffect(() => {
    if (isOpen) {
      setConfig(getThermalSettings());
      setSavedSuccess(false);
      setIsTestPrinting(false);
      setMobileTab('settings');
      setBluetoothStatus('');
      setIsScanningBluetooth(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDriverChange = (driverId: string) => {
    const driver = getSelectedDriverInfo(driverId);
    setConfig((prev) => ({
      ...prev,
      printerDriver: driverId,
      connectionType: driver.category,
      printableWidth: driver.recommendedWidth || prev.printableWidth,
    }));
    setBluetoothStatus('');
  };

  const handleScanBluetooth = async () => {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      setBluetoothStatus("Web Bluetooth is not supported in this browser. On mobile devices, pair your Bluetooth thermal printer in your phone's Bluetooth settings, then select the matching mobile Bluetooth driver from the combobox.");
      return;
    }
    try {
      setIsScanningBluetooth(true);
      setBluetoothStatus('Searching for nearby Bluetooth thermal printers...');
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS UUID
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '0000180a-0000-1000-8000-00805f9b34fb',
        ],
      });
      if (device && device.name) {
        setConfig((prev) => ({
          ...prev,
          printerDriver: 'bt-generic-58',
          connectionType: 'bluetooth',
          bluetoothDeviceName: device.name,
        }));
        setBluetoothStatus(`Paired with "${device.name}"! Configured for Bluetooth mobile thermal printing.`);
      } else {
        setBluetoothStatus('Device connected.');
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setBluetoothStatus(`Bluetooth scan: ${err.message || 'Cancelled or unavailable'}`);
      } else {
        setBluetoothStatus('Scan cancelled. You can select your Bluetooth driver directly from the combobox.');
      }
    } finally {
      setIsScanningBluetooth(false);
    }
  };

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
    setBluetoothStatus('');
  };

  const handleTestPrint = async () => {
    const testReceiptEl = document.getElementById('thermal-test-print-receipt');
    if (isWebBluetoothSupported() || isMobileClient()) {
      try {
        setIsTestPrinting(true);
        setBluetoothStatus('Sending test receipt directly to thermal printer...');
        const res = await printDirectlyToThermalPrinter(testReceiptEl, config);
        setBluetoothStatus(res.message);
        setTimeout(() => setBluetoothStatus(''), 4000);
      } catch (err: any) {
        console.warn('Test print fallback:', err?.message || err);
        window.print();
        setBluetoothStatus('Test receipt sent to print dialog.');
        setTimeout(() => setBluetoothStatus(''), 4000);
      } finally {
        setIsTestPrinting(false);
      }
      return;
    }

    setIsTestPrinting(true);
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
              padding: ${config.topMargin ?? 5}mm ${config.marginHorizontal}mm ${config.feedBeforeCut}mm ${config.marginHorizontal}mm !important;
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
                  Thermal Printer Setup
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
            
            {/* Available Printer Driver & Mobile Bluetooth Selection Combobox */}
            <div className="bg-slate-800/90 p-3 sm:p-4 rounded-xl border border-slate-750 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <label 
                  htmlFor="select-printer-driver"
                  className="text-xs font-bold text-slate-100 flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4 text-amber-400" />
                  <span>Select Printer Driver</span>
                </label>
                
                {/* Connection Profile Badge */}
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0 ${
                  activeDriver.category === 'bluetooth'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : activeDriver.category === 'usb'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : activeDriver.category === 'pos'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'bg-slate-750 text-slate-300 border border-slate-650'
                }`}>
                  {activeDriver.category === 'bluetooth' ? (
                    <Bluetooth className="w-3 h-3 text-blue-400" />
                  ) : activeDriver.category === 'usb' ? (
                    <Usb className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Cpu className="w-3 h-3 text-purple-400" />
                  )}
                  <span>{activeDriver.connection}</span>
                </span>
              </div>

              {/* Combobox Dropdown */}
              <div className="relative">
                <select
                  id="select-printer-driver"
                  value={config.printerDriver || 'system-default'}
                  onChange={(e) => handleDriverChange(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-650 text-xs sm:text-sm font-semibold text-white focus:border-amber-400 focus:outline-hidden cursor-pointer"
                >
                  <optgroup label="📱 Bluetooth Mobile Thermal Printers (Android / iOS / Mobile Printing)">
                    {THERMAL_PRINTER_DRIVERS.filter((d) => d.category === 'bluetooth').map((d) => (
                      <option key={d.id} value={d.id} className="bg-slate-900 text-white py-1">
                        {d.name}
                      </option>
                    ))}
                  </optgroup>

                  <optgroup label="🔌 USB & Desktop 58mm Thermal Printers">
                    {THERMAL_PRINTER_DRIVERS.filter((d) => d.category === 'usb').map((d) => (
                      <option key={d.id} value={d.id} className="bg-slate-900 text-white py-1">
                        {d.name}
                      </option>
                    ))}
                  </optgroup>

                  <optgroup label="🏢 Commercial POS & Receipt Printers">
                    {THERMAL_PRINTER_DRIVERS.filter((d) => d.category === 'pos').map((d) => (
                      <option key={d.id} value={d.id} className="bg-slate-900 text-white py-1">
                        {d.name}
                      </option>
                    ))}
                  </optgroup>

                  <optgroup label="💻 System & Spooler Drivers">
                    {THERMAL_PRINTER_DRIVERS.filter((d) => d.category === 'system').map((d) => (
                      <option key={d.id} value={d.id} className="bg-slate-900 text-white py-1">
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Custom Driver Name Input if custom is selected */}
              {config.printerDriver === 'custom' && (
                <div className="pt-1">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Enter Custom Driver or Hardware Model Name:
                  </label>
                  <input
                    type="text"
                    value={config.customDriverName || ''}
                    onChange={(e) => setConfig({ ...config, customDriverName: e.target.value })}
                    placeholder="e.g. Zebra ZQ210, Sunmi V2 Pro Bluetooth, POS-80..."
                    className="w-full py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-650 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-hidden font-mono"
                  />
                </div>
              )}

              {/* Bluetooth Mobile Printing Pairing Panel */}
              {(activeDriver.category === 'bluetooth' || config.connectionType === 'bluetooth') && (
                <div className="p-2.5 sm:p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-200">
                      <Bluetooth className="w-4 h-4 text-blue-400" />
                      <span>Bluetooth Mobile Thermal Printing</span>
                    </div>
                    {/* Paired printer driver name placed directly under Bluetooth Mobile Thermal Printing label */}
                    <div className="text-[11px] font-semibold text-emerald-400 pl-5.5 flex items-center gap-1">
                      {config.bluetoothDeviceName ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Paired Device: <strong className="text-white">{config.bluetoothDeviceName}</strong> {config.bluetoothDeviceName !== activeDriver.name && <span className="text-blue-300 font-normal">({activeDriver.name})</span>}</span>
                        </>
                      ) : (
                        <span className="text-slate-400 font-normal">Driver: {activeDriverDisplayName}</span>
                      )}
                    </div>
                  </div>

                  {/* Scan button and unlink button on the exact same line */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      disabled={isScanningBluetooth}
                      onClick={handleScanBluetooth}
                      className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-xs whitespace-nowrap"
                      title="Discover and link Bluetooth thermal printer"
                    >
                      {isScanningBluetooth ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Bluetooth className="w-3.5 h-3.5" />
                      )}
                      <span>{isScanningBluetooth ? 'Searching...' : 'Scan / Pair'}</span>
                    </button>

                    {config.bluetoothDeviceName && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfig({ ...config, bluetoothDeviceName: '' });
                          setBluetoothStatus('Cleared Bluetooth device linkage.');
                        }}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 hover:text-rose-200 hover:border-rose-500/50 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        Unlink Device
                      </button>
                    )}
                  </div>

                  {bluetoothStatus && (
                    <div className="text-[11px] font-medium text-amber-200 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/30 flex items-start gap-1.5 mt-1">
                      <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{bluetoothStatus}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Printable Width Adjustment (38mm to 58mm, Default 52mm) */}
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
                  min="38"
                  max="58"
                  step="1"
                  value={config.printableWidth}
                  onChange={(e) => setConfig({ ...config, printableWidth: Number(e.target.value) })}
                  className="flex-1 accent-blue-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                />
                <input
                  type="number"
                  min="38"
                  max="58"
                  value={config.printableWidth}
                  onChange={(e) => setConfig({ ...config, printableWidth: Number(e.target.value) })}
                  className="w-14 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-xs text-center font-mono text-white font-bold"
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Narrow (38mm)</span>
                <span className="text-emerald-400 font-semibold">Default: 52mm</span>
                <span>Full (58mm)</span>
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
                  {config.topMargin ?? 5} mm
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="input-margin-top"
                  type="range"
                  min="0"
                  max="15"
                  step="1"
                  value={config.topMargin ?? 5}
                  onChange={(e) => setConfig({ ...config, topMargin: Number(e.target.value) })}
                  className="flex-1 accent-emerald-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                />
                <input
                  type="number"
                  min="0"
                  max="15"
                  step="1"
                  value={config.topMargin ?? 5}
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
              
              {/* Font Size (8pt to 16pt, Default 12pt) */}
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
                    {config.fontSize} pt
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="input-font-size"
                    type="range"
                    min="8"
                    max="16"
                    step="0.5"
                    value={config.fontSize}
                    onChange={(e) => setConfig({ ...config, fontSize: Number(e.target.value) })}
                    className="flex-1 accent-amber-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                  />
                  <input
                    type="number"
                    min="8"
                    max="16"
                    step="0.5"
                    value={config.fontSize}
                    onChange={(e) => setConfig({ ...config, fontSize: Number(e.target.value) })}
                    className="w-14 px-1.5 py-1 rounded bg-slate-900 border border-slate-600 text-xs text-center font-mono text-white font-bold"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>8pt</span>
                  <span className="text-emerald-400 font-semibold">Default: 10.5pt</span>
                  <span>16pt</span>
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
              
              {/* Simulated 58mm paper roll (rendered at exact physical width & pt size) */}
              <div 
                className="receipt bg-white text-black shadow-2xl relative select-none"
                style={{
                  width: `${config.printableWidth}mm`,
                  maxWidth: `${config.printableWidth}mm`,
                  paddingLeft: `${config.marginHorizontal}mm`,
                  paddingRight: `${config.marginHorizontal}mm`,
                  paddingTop: `${config.topMargin ?? 5}mm`,
                  paddingBottom: `${config.feedBeforeCut}mm`,
                  fontSize: `${config.fontSize}pt`,
                  lineHeight: config.lineSpacing,
                  fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif',
                }}
              >
                {/* Visual Top Serrated Tear Guide */}
                <div className="text-center text-gray-500 border-b border-dashed border-gray-400 pb-1 mb-1 break-words">
                  - - 58MM ROLL ({config.printableWidth}mm) - -
                </div>

                {/* Receipt Header: Registered Club Logo & Business Name Centered and Bold */}
                <div className="text-center pb-1 mb-1 border-b border-dashed border-black">
                  <div className="flex items-center justify-center gap-1.5 leading-tight flex-wrap">
                    <ThermalLogo
                      src={settings?.registeredClubLogo || '/icon.png'}
                      alt="Club Logo"
                      className="thermal-header-logo w-5 h-5 shrink-0 object-contain"
                      rasterSizePx={64}
                    />
                    <span className="thermal-header-club font-extrabold uppercase tracking-tight leading-tight break-words">
                      {orgName}
                    </span>
                  </div>
                  <div className="leading-tight text-gray-800 mt-0.5 break-words">
                    {orgVenue}
                  </div>
                  <div className="leading-tight text-gray-800 break-words">
                    {orgPhone}
                  </div>
                  <div className="thermal-ordinal-title font-normal text-black mt-0.5 break-words">
                    {eventTitle}
                  </div>
                </div>

                {/* Invoice / Reference Number and Date */}
                <div className="pb-1 mb-1 border-b border-dashed border-black leading-tight">
                  <div className="flex justify-between font-bold gap-1 flex-wrap">
                    <span>REF: #ESM-2027</span>
                    <span>{activeDriver.connection}</span>
                  </div>
                  <div className="text-gray-800 my-0.5 break-words">
                    <span className="font-semibold text-black">
                      {config.bluetoothDeviceName ? `BT: ${config.bluetoothDeviceName}` : activeDriverDisplayName}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-700 gap-1">
                    <span>26/01/2027</span>
                    <span>203 DPI</span>
                  </div>
                </div>

                {/* Event Descriptions Wrap & Align Table */}
                <div className="w-full pb-1 mb-1 border-b border-dashed border-black">
                  <div className="flex justify-between font-normal border-b border-black pb-0.5 mb-0.5">
                    <span className="w-[2.5em] text-left shrink-0">CH</span>
                    <span className="flex-1 px-1 text-left">EVENT</span>
                    <span className="text-right shrink-0">FEE</span>
                  </div>
                  
                  <div className="flex items-start justify-between py-0.5 leading-tight">
                    <span className="w-[2.5em] font-normal thermal-chest-no shrink-0">101</span>
                    <div className="flex-1 min-w-0 px-1">
                      <div className="thermal-record-clamp-2">100M SPRINT</div>
                    </div>
                    <span className="text-right shrink-0">₹100</span>
                  </div>

                  <div className="flex items-start justify-between py-0.5 leading-tight">
                    <span className="w-[2.5em] font-normal thermal-chest-no shrink-0">102</span>
                    <div className="flex-1 min-w-0 px-1">
                      <div className="thermal-record-clamp-2">LONG JUMP</div>
                    </div>
                    <span className="text-right shrink-0">₹100</span>
                  </div>
                </div>

                {/* Totals */}
                <div className="w-full pb-1 mb-1 leading-tight space-y-0.5">
                  <div className="flex justify-between">
                    <span>TOTAL:</span>
                    <span className="font-bold">₹200</span>
                  </div>
                  <div className="flex justify-between text-gray-800">
                    <span>STATUS:</span>
                    <span className="font-bold">PAID</span>
                  </div>
                </div>

                {/* Alignment & Calibration Info */}
                <div className="w-full text-center text-gray-600 pb-1 mb-1 leading-tight break-words">
                  {config.printableWidth}mm / {config.fontSize}pt ({Math.round(config.printableWidth * 8)} DOTS)
                </div>

                {/* Footer Message */}
                <div className="text-center pt-0.5 text-black">
                  <div className="font-bold uppercase tracking-tight">
                    *** THANK YOU ***
                  </div>
                  <div className="flex items-center justify-center gap-1 text-gray-800 mt-0.5 flex-wrap thermal-footer-brand">
                    <ThermalLogo
                      src="/icon.png"
                      alt="eSports Logo"
                      className="thermal-footer-logo w-3.5 h-3.5 shrink-0 object-contain"
                      rasterSizePx={48}
                    />
                    <span className="break-words">eSports-Sport Management</span>
                  </div>
                  <div className="text-gray-600 mt-0.5 break-words thermal-footer-time">
                    {currentTimestamp}
                  </div>
                </div>

                {/* Bottom Cut Line */}
                <div className="mt-2 text-center text-gray-500 border-t border-dashed border-gray-400 pt-1 font-mono">
                  - - [ CUT HERE ] - -
                </div>

              </div>

            </div>

            <div className="text-[11px] text-slate-400 mt-2 text-center flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Preview updates instantly as you adjust sliders.</span>
            </div>

          </div>

        </div>

        {/* Sticky Mobile-Friendly Modal Action Footer: Always reachable in thumb zone without scrolling */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-3 bg-slate-900/95 border-t border-slate-750 shrink-0 grid grid-cols-12 gap-1.5 sm:gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            className="col-span-3 px-2 sm:px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-98"
            title="Restore default 52mm printable width & 12pt font settings"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Defaults</span>
          </button>

          <button
            type="button"
            onClick={handleTestPrint}
            className="col-span-4 px-2 sm:px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-750 border border-slate-650 hover:border-amber-400/50 flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer active:scale-98"
            title="Print test calibration receipt on 58mm thermal printer"
          >
            <Printer className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">Test Print</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className={`col-span-5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-98 ${
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

      {/* Dedicated Hidden 58mm Test Receipt for Direct Physical Print */}
      <div 
        id="thermal-test-print-receipt" 
        className="receipt hidden"
        style={{
          width: `${config.printableWidth}mm`,
          maxWidth: `${config.printableWidth}mm`,
          paddingLeft: `${config.marginHorizontal}mm`,
          paddingRight: `${config.marginHorizontal}mm`,
          paddingTop: `${config.topMargin ?? 5}mm`,
          paddingBottom: `${config.feedBeforeCut}mm`,
          fontSize: `${config.fontSize}pt`,
          lineHeight: config.lineSpacing,
          fontFamily: 'Arial, "Segoe UI", Helvetica, sans-serif',
        }}
      >
        {/* Receipt Header */}
        <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '3px', marginBottom: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <ThermalLogo
              src={settings?.registeredClubLogo || '/icon.png'}
              alt="Club Logo"
              className="thermal-header-logo w-5 h-5 shrink-0 object-contain"
              rasterSizePx={64}
            />
            <span className="thermal-header-club" style={{ fontWeight: 'bold', textTransform: 'uppercase', wordBreak: 'break-word' }}>
              {orgName}
            </span>
          </div>
          <div style={{ wordBreak: 'break-word' }}>{orgVenue}</div>
          <div style={{ wordBreak: 'break-word' }}>{orgPhone}</div>
          <div className="thermal-ordinal-title" style={{ fontWeight: 'normal', marginTop: '2px', wordBreak: 'break-word' }}>
            {eventTitle}
          </div>
        </div>

        {/* Invoice / Reference */}
        <div style={{ borderBottom: '1px dashed #000', paddingBottom: '3px', marginBottom: '3px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', flexWrap: 'wrap' }}>
            <span>TEST #: 001</span>
            <span>{activeDriver.connection}</span>
          </div>
          <div style={{ margin: '2px 0', wordBreak: 'break-word' }}>
            <span>DRIVER: {config.bluetoothDeviceName ? `${config.bluetoothDeviceName} (BT)` : activeDriverDisplayName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{config.printableWidth}mm / {config.fontSize}pt</span>
            <span>203 DPI</span>
          </div>
        </div>

        {/* Items Table with Wrapping */}
        <div style={{ borderBottom: '1px dashed #000', paddingBottom: '3px', marginBottom: '3px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'normal', borderBottom: '1px solid #000', paddingBottom: '2px' }}>
            <span style={{ width: '2.5em' }}>CH</span>
            <span style={{ flex: 1, padding: '0 4px' }}>EVENT</span>
            <span>FEE</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', alignItems: 'flex-start' }}>
            <span style={{ width: '2.5em', fontWeight: 'normal' }} className="thermal-chest-no">101</span>
            <div style={{ flex: 1, minWidth: 0, padding: '0 4px' }}>
              <div className="thermal-record-clamp-2">100M SPRINT</div>
            </div>
            <span>₹100</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', alignItems: 'flex-start' }}>
            <span style={{ width: '2.5em', fontWeight: 'normal' }} className="thermal-chest-no">102</span>
            <div style={{ flex: 1, minWidth: 0, padding: '0 4px' }}>
              <div className="thermal-record-clamp-2">HIGH JUMP</div>
            </div>
            <span>₹100</span>
          </div>
        </div>

        {/* Totals */}
        <div style={{ borderBottom: '1px dashed #000', paddingBottom: '3px', marginBottom: '3px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>GRAND TOTAL:</span>
            <span>₹200</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span>PAID VIA:</span>
            <span style={{ fontWeight: 'bold' }}>CASH [PAID]</span>
          </div>
        </div>

        {/* Calibration Summary */}
        <div style={{ textAlign: 'center', paddingBottom: '3px', marginBottom: '3px' }}>
          <div>{config.printableWidth}mm MAX ({Math.round(config.printableWidth * 8)} DOTS) • {config.fontSize}pt</div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', paddingTop: '2px' }}>
          <div style={{ fontWeight: 'bold' }}>*** TEST PRINT OK ***</div>
          <div className="thermal-footer-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
            <ThermalLogo
              src="/icon.png"
              alt="eSports Logo"
              className="thermal-footer-logo w-3.5 h-3.5 shrink-0 object-contain"
              rasterSizePx={48}
            />
            <span style={{ wordBreak: 'break-word' }}>eSports-Sport Management</span>
          </div>
          <div className="thermal-footer-time" style={{ marginTop: '2px', wordBreak: 'break-word' }}>{currentTimestamp}</div>
        </div>

        {/* Tear Indicator */}
        <div style={{ textAlign: 'center', borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '3px' }}>
          --- [ CUT HERE ] ---
        </div>
      </div>

    </div>
  );
};

/**
 * 58mm Thermal Receipt Printer Setup & Persistence Utility
 * Supports standard 58mm USB, Bluetooth Mobile (Android/iOS), ESC/POS and OS spooler drivers (203 DPI, B&W).
 */

export interface ThermalPrinterDriverInfo {
  id: string;
  name: string;
  category: 'bluetooth' | 'usb' | 'pos' | 'system';
  connection: string;
  recommendedWidth: number;
  dots: number;
  description: string;
  isMobileBluetooth?: boolean;
}

export const THERMAL_PRINTER_DRIVERS: ThermalPrinterDriverInfo[] = [
  // 1. Bluetooth Connected Thermal Printers (Mobile Printing / Handheld)
  {
    id: 'bt-generic-58',
    name: 'Generic 58mm Bluetooth Thermal (ESC/POS SPP - Android/iOS)',
    category: 'bluetooth',
    connection: 'Bluetooth SPP / BLE',
    recommendedWidth: 52,
    dots: 384,
    description: 'Universal mobile Bluetooth thermal receipt printer for smartphones, tablets & handheld terminals.',
    isMobileBluetooth: true,
  },
  {
    id: 'bt-pt210',
    name: 'PT-210 / GOOJPRT Portable 58mm Bluetooth Mini Printer',
    category: 'bluetooth',
    connection: 'Bluetooth 4.0 / BLE',
    recommendedWidth: 52,
    dots: 384,
    description: 'Popular handheld pocket printer with rechargeable battery for on-field outdoor mobile printing.',
    isMobileBluetooth: true,
  },
  {
    id: 'bt-mpt2',
    name: 'MPT-II / MPT-III Mobile Bluetooth Thermal Printer',
    category: 'bluetooth',
    connection: 'Bluetooth SPP / BLE',
    recommendedWidth: 52,
    dots: 384,
    description: 'Rugged portable mobile thermal printer widely used for field ticketing and sports registration receipts.',
    isMobileBluetooth: true,
  },
  {
    id: 'bt-rpp02n',
    name: 'Rongta RPP02N / RPP200 Mobile Bluetooth POS Printer',
    category: 'bluetooth',
    connection: 'Bluetooth & USB Dual',
    recommendedWidth: 52,
    dots: 384,
    description: 'High-speed 80mm/s mobile Bluetooth printer with high-density 203 DPI thermal head.',
    isMobileBluetooth: true,
  },
  {
    id: 'bt-zj5805',
    name: 'ZJiang ZJ-5802 / ZJ-5805 Handheld Bluetooth Receipt Printer',
    category: 'bluetooth',
    connection: 'Bluetooth SPP / USB',
    recommendedWidth: 52,
    dots: 384,
    description: 'Compact wireless thermal printer compatible with Android print services & iOS.',
    isMobileBluetooth: true,
  },
  {
    id: 'bt-netum',
    name: 'Netum / Milestone Portable Handheld Bluetooth Printer',
    category: 'bluetooth',
    connection: 'Bluetooth Wireless',
    recommendedWidth: 52,
    dots: 384,
    description: 'Portable mini wireless thermal receipt printer for mobile sports registration desks.',
    isMobileBluetooth: true,
  },
  {
    id: 'bt-ble-escpos',
    name: 'Web Bluetooth BLE Raw ESC/POS Thermal Head',
    category: 'bluetooth',
    connection: 'Web Bluetooth API (Direct)',
    recommendedWidth: 52,
    dots: 384,
    description: 'Direct browser-to-printer wireless Bluetooth Low Energy communication without OS driver installation.',
    isMobileBluetooth: true,
  },

  // 2. USB & Desktop ESC/POS 58mm Thermal Printers
  {
    id: 'usb-pos58',
    name: 'POS-58 Series 58mm Thermal Receipt Printer (USB / Serial)',
    category: 'usb',
    connection: 'USB / Virtual COM',
    recommendedWidth: 52,
    dots: 384,
    description: 'Standard desktop 58mm POS receipt printer found in clubs, sports offices, and ticketing counters.',
  },
  {
    id: 'usb-xprinter58',
    name: 'Xprinter XP-58 / XP-Q90EC 58mm Thermal Driver',
    category: 'usb',
    connection: 'USB Direct',
    recommendedWidth: 52,
    dots: 384,
    description: 'High-speed 90mm/s ESC/POS thermal printer with auto-cutter / tear bar.',
  },
  {
    id: 'usb-everycom58',
    name: 'Everycom EC-58 / EC-5801 58mm Desktop POS Printer',
    category: 'usb',
    connection: 'USB Interface',
    recommendedWidth: 52,
    dots: 384,
    description: 'Reliable thermal head supporting continuous roll paper and high-contrast B&W receipts.',
  },
  {
    id: 'usb-rongta58',
    name: 'Rongta RP58A / RP203 58mm Desktop Thermal Driver',
    category: 'usb',
    connection: 'USB / RS-232',
    recommendedWidth: 52,
    dots: 384,
    description: 'Desktop thermal receipt driver with fast print response and high print clarity.',
  },

  // 3. Commercial & POS Thermal Printers
  {
    id: 'pos-epson-tm',
    name: 'Epson TM-T20 / TM-T88 Series (58mm Emulation Mode)',
    category: 'pos',
    connection: 'USB / Ethernet / BT',
    recommendedWidth: 52,
    dots: 384,
    description: 'Enterprise Epson ESC/POS driver with 58mm paper roll partition installed.',
  },
  {
    id: 'pos-star-tsp',
    name: 'Star Micronics TSP100 / TSP650 (58mm Roll Mode)',
    category: 'pos',
    connection: 'USB / Bluetooth',
    recommendedWidth: 52,
    dots: 384,
    description: 'Star Line Mode / ESC/POS thermal driver configured for 58mm receipt rolls.',
  },
  {
    id: 'pos-tvs-rp',
    name: 'TVS RP-3150 / RP-3200 Star ESC/POS Driver',
    category: 'pos',
    connection: 'USB / Serial',
    recommendedWidth: 52,
    dots: 384,
    description: 'Commercial point-of-sale thermal receipt printer commonly used in India.',
  },
  {
    id: 'pos-citizen',
    name: 'Citizen CT-S310II / CMP-20 Mobile Thermal',
    category: 'pos',
    connection: 'USB / Bluetooth',
    recommendedWidth: 52,
    dots: 384,
    description: 'Heavy duty high-efficiency thermal receipt printer for high-volume ticket issuance.',
  },

  // 4. System & Spooler Drivers
  {
    id: 'system-default',
    name: 'System Default Print Spooler (OS / Browser Print Dialog)',
    category: 'system',
    connection: 'OS Spooler (Auto)',
    recommendedWidth: 52,
    dots: 384,
    description: 'Routes print jobs through your operating system or mobile print manager to any installed driver.',
  },
  {
    id: 'win-generic-text',
    name: 'Generic / Text Only Windows Driver (203 DPI Raw)',
    category: 'system',
    connection: 'Windows Print Spooler',
    recommendedWidth: 52,
    dots: 384,
    description: 'Standard built-in Microsoft Generic / Text Only driver for raw thermal printer output.',
  },
  {
    id: 'cups-raw-thermal',
    name: 'CUPS Raw Thermal Spooler (macOS / Linux)',
    category: 'system',
    connection: 'CUPS lp / lpr',
    recommendedWidth: 52,
    dots: 384,
    description: 'Direct raw thermal queuing on Apple macOS and Linux distributions.',
  },
  {
    id: 'custom',
    name: 'Custom / Other Thermal Printer Driver...',
    category: 'system',
    connection: 'Custom Driver',
    recommendedWidth: 52,
    dots: 384,
    description: 'Specify your own thermal printer driver name or custom hardware profile.',
  },
];

export function getSelectedDriverInfo(driverId?: string): ThermalPrinterDriverInfo {
  const found = THERMAL_PRINTER_DRIVERS.find((d) => d.id === driverId);
  return found || THERMAL_PRINTER_DRIVERS[0];
}

/**
 * Formats event line with full information in one line as:
 * "Evt <no>: <name> : <gender>" (e.g. "Evt 3: 100 MTS RUN : G")
 * or with height if specified: "Evt <no>: <name> (<height> • <gender>)"
 */
export function formatThermalEventLine(
  evtNo: string | number,
  evtName: string,
  height?: string,
  gender?: string
): string {
  const cleanHeight = (height || '').trim().toUpperCase();
  const hasHeight = cleanHeight && cleanHeight !== 'ALL';
  const heightDisp = hasHeight
    ? cleanHeight.replace(/[`']/g, "'").replace(/''|``|"/g, "''")
    : '';

  const g = (gender || '').trim().toUpperCase();
  const genderAbbr = g.startsWith('BOY') || g === 'B'
    ? 'B'
    : g.startsWith('GIRL') || g === 'G'
    ? 'G'
    : g.startsWith('CHILD') || g === 'C'
    ? 'C'
    : (g || 'ALL');

  const nameUpper = (evtName || '').trim().toUpperCase();

  if (hasHeight) {
    return `Evt ${evtNo}: ${nameUpper} (${heightDisp} • ${genderAbbr})`;
  } else {
    return `Evt ${evtNo}: ${nameUpper} : ${genderAbbr}`;
  }
}

/**
 * Returns the suffix portion after "Evt <evtNo>" so <evtNo> can be styled consistently.
 */
export function formatThermalEventSuffix(
  evtName: string,
  height?: string,
  gender?: string
): string {
  const cleanHeight = (height || '').trim().toUpperCase();
  const hasHeight = cleanHeight && cleanHeight !== 'ALL';
  const heightDisp = hasHeight
    ? cleanHeight.replace(/[`']/g, "'").replace(/''|``|"/g, "''")
    : '';

  const g = (gender || '').trim().toUpperCase();
  const genderAbbr = g.startsWith('BOY') || g === 'B'
    ? 'B'
    : g.startsWith('GIRL') || g === 'G'
    ? 'G'
    : g.startsWith('CHILD') || g === 'C'
    ? 'C'
    : (g || 'ALL');

  const nameUpper = (evtName || '').trim().toUpperCase();

  if (hasHeight) {
    return `: ${nameUpper} (${heightDisp} • ${genderAbbr})`;
  } else {
    return `: ${nameUpper} : ${genderAbbr}`;
  }
}

export interface ThermalPrintSettings {
  paperWidth: number;        // Fixed at 58mm (2.28")
  printableWidth: number;    // Default 52mm horizontal max printable area (adjustable 38-54mm)
  marginHorizontal: number;  // Left & Right margin in mm (adjustable 0-6mm)
  topMargin: number;         // Top margin in mm (adjustable 0-15mm, default 5mm)
  fontSize: number;          // Base font size in pt (default 10.5pt, adjustable 8-16pt)
  lineSpacing: number;       // Line height multiplier (adjustable 1.05-1.50)
  feedBeforeCut: number;     // Feed spacing at receipt end before cut in mm (2-12mm)
  highContrast: boolean;     // Pure black & white for 203 DPI thermal heads
  printerDriver?: string;    // Selected printer driver ID (e.g. 'bt-generic-58', 'usb-pos58', etc.)
  customDriverName?: string; // If 'custom' is selected
  connectionType?: 'bluetooth' | 'usb' | 'pos' | 'system'; // Connection category
  bluetoothDeviceName?: string; // Paired or discovered Bluetooth printer device name
  settingsVersion?: number;  // Schema version (3 = readable 10.5pt base + 12pt Lucida Console chest/jump, 52-58mm width)
}

export const DEFAULT_THERMAL_SETTINGS: ThermalPrintSettings = {
  paperWidth: 58,
  printableWidth: 52,
  marginHorizontal: 0,
  topMargin: 5,
  fontSize: 10.5,
  lineSpacing: 1.25,
  feedBeforeCut: 4,
  highContrast: true,
  printerDriver: 'system-default',
  customDriverName: '',
  connectionType: 'system',
  bluetoothDeviceName: '',
  settingsVersion: 3,
};

const STORAGE_KEY = 'esports_58mm_thermal_settings';

/**
 * Loads persisted thermal printer settings with fallback to readable 52mm / 10.5pt (+1.5pt Lucida Console) defaults
 */
export function getThermalSettings(): ThermalPrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THERMAL_SETTINGS };
    const parsed = JSON.parse(raw);
    const isV3 = parsed.settingsVersion === 3;
    const isV2 = parsed.settingsVersion === 2;
    // Upgrade uncustomized v2 12pt default to cleaner 10.5pt while preserving custom v2 sizes other than 12
    const resolvedFont = isV3
      ? Math.max(8, Math.min(16, Number(parsed.fontSize) || 10.5))
      : isV2 && Number(parsed.fontSize) && Number(parsed.fontSize) !== 12
      ? Math.max(8, Math.min(16, Number(parsed.fontSize)))
      : 10.5;
    return {
      paperWidth: 58, // Always enforce 58mm roll
      printableWidth: (isV3 || isV2)
        ? Math.max(38, Math.min(58, Number(parsed.printableWidth) || 52))
        : 52,
      marginHorizontal: Math.max(0, Math.min(6, Number(parsed.marginHorizontal) ?? 0)),
      topMargin: Math.max(0, Math.min(15, parsed.topMargin !== undefined ? Number(parsed.topMargin) : 5)),
      fontSize: resolvedFont,
      lineSpacing: Math.max(1.05, Math.min(1.5, Number(parsed.lineSpacing) || 1.25)),
      feedBeforeCut: Math.max(2, Math.min(12, Number(parsed.feedBeforeCut) || 4)),
      highContrast: parsed.highContrast !== false,
      printerDriver: typeof parsed.printerDriver === 'string' ? parsed.printerDriver : 'system-default',
      customDriverName: typeof parsed.customDriverName === 'string' ? parsed.customDriverName : '',
      connectionType: parsed.connectionType || 'system',
      bluetoothDeviceName: typeof parsed.bluetoothDeviceName === 'string' ? parsed.bluetoothDeviceName : '',
      settingsVersion: 3,
    };
  } catch {
    return { ...DEFAULT_THERMAL_SETTINGS };
  }
}

/**
 * Saves thermal printer settings to localStorage and dispatches change notification
 */
export function saveThermalSettings(settings: ThermalPrintSettings): void {
  try {
    const sanitized: ThermalPrintSettings = {
      paperWidth: 58,
      printableWidth: Math.max(38, Math.min(58, Number(settings.printableWidth) || 52)),
      marginHorizontal: Math.max(0, Math.min(6, Number(settings.marginHorizontal) ?? 0)),
      topMargin: Math.max(0, Math.min(15, settings.topMargin !== undefined ? Number(settings.topMargin) : 5)),
      fontSize: Math.max(8, Math.min(16, Number(settings.fontSize) || 10.5)),
      lineSpacing: Math.max(1.05, Math.min(1.5, Number(settings.lineSpacing) || 1.25)),
      feedBeforeCut: Math.max(2, Math.min(12, Number(settings.feedBeforeCut) || 4)),
      highContrast: settings.highContrast !== false,
      printerDriver: settings.printerDriver || 'system-default',
      customDriverName: settings.customDriverName || '',
      connectionType: settings.connectionType || 'system',
      bluetoothDeviceName: settings.bluetoothDeviceName || '',
      settingsVersion: 3,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent('thermal-settings-changed', { detail: sanitized }));
  } catch (err) {
    console.error('Failed to save thermal settings:', err);
  }
}

/**
 * Generates dynamic scoped print CSS for 58mm thermal receipts using maximum paper width and readable typography
 */
export function generateThermalPrintCSS(settings: ThermalPrintSettings): string {
  const fontPt = Math.max(8, Math.min(16, Number(settings.fontSize) || 10.5));
  const widthMm = Math.max(38, Math.min(58, Number(settings.printableWidth) || 52));
  const topMm = settings.topMargin !== undefined ? Number(settings.topMargin) : 5;
  const emphPt = Number((fontPt + 1.5).toFixed(1));
  const headerPt = Number((fontPt + 0.5).toFixed(1));
  const footerPt = Math.max(8, Number((fontPt - 1.5).toFixed(1)));

  return `
    @page {
      size: 58mm auto !important;
      margin: 0 !important;
    }

    @media print {
      html, body, main {
        width: 58mm !important;
        min-width: 58mm !important;
        max-width: 58mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        font-family: Arial, "Segoe UI", Helvetica, sans-serif !important;
        font-size: ${fontPt}pt !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .receipt,
      .thermal-printable-wrapper,
      .thermal-printable-sheet {
        display: block !important;
        width: ${widthMm}mm !important;
        max-width: ${widthMm}mm !important;
        margin: 0 auto !important;
        padding-left: ${settings.marginHorizontal}mm !important;
        padding-right: ${settings.marginHorizontal}mm !important;
        padding-top: ${topMm}mm !important;
        padding-bottom: ${settings.feedBeforeCut}mm !important;
        box-sizing: border-box !important;
        overflow: visible !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        font-family: Arial, "Segoe UI", Helvetica, sans-serif !important;
        font-size: ${fontPt}pt !important;
        line-height: ${settings.lineSpacing} !important;
        color: #000000 !important;
        background: #ffffff !important;
      }

      * {
        box-sizing: border-box !important;
      }

      /* Hide web shell, headers, navigation and non-printable elements */
      .no-print,
      .print-hidden,
      .print\\:hidden,
      .print-hidden-element,
      header,
      nav,
      footer,
      aside {
        display: none !important;
      }

      .a4-printable-wrapper,
      .a4-printable-sheet {
        display: none !important;
      }

      .avoid-break {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* High contrast black and white + readable configurable pt font size */
      .receipt *,
      .thermal-printable-wrapper *,
      .thermal-printable-sheet * {
        color: #000000 !important;
        border-color: #000000 !important;
        background-color: transparent !important;
        box-shadow: none !important;
        text-shadow: none !important;
        font-family: Arial, "Segoe UI", Helvetica, sans-serif !important;
        font-size: ${fontPt}pt !important;
      }

      .receipt .thermal-header-club,
      .thermal-printable-wrapper .thermal-header-club,
      .thermal-printable-sheet .thermal-header-club {
        font-size: ${headerPt}pt !important;
        font-weight: 700 !important;
      }

      .receipt .thermal-ordinal-title,
      .thermal-printable-wrapper .thermal-ordinal-title,
      .thermal-printable-sheet .thermal-ordinal-title {
        font-weight: 400 !important;
      }

      /* Wrap-safe Event Details inside maximum printable width (only EVT <no> is bold) */
      .thermal-event-details,
      .receipt .thermal-event-details,
      .thermal-printable-sheet .thermal-event-details {
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        overflow: visible !important;
        text-overflow: clip !important;
        font-weight: 400 !important;
        font-size: ${fontPt}pt !important;
        letter-spacing: -0.01em !important;
        line-height: ${settings.lineSpacing} !important;
      }

      .thermal-event-no,
      .receipt .thermal-event-no,
      .thermal-printable-sheet .thermal-event-no {
        font-size: ${fontPt}pt !important;
        font-weight: 700 !important;
        display: inline !important;
      }

      /* Lucida Console regular/normal & emphasized readable size for Chest Number */
      .thermal-chest-no,
      .receipt .thermal-chest-no,
      .thermal-printable-wrapper .thermal-chest-no,
      .thermal-printable-sheet .thermal-chest-no {
        font-family: "Lucida Console", Monaco, monospace !important;
        font-size: ${emphPt}pt !important;
        font-weight: 400 !important;
        display: inline-block !important;
      }

      /* Narrow condensed bold & emphasized readable size for Jump Records */
      .thermal-jump-record,
      .receipt .thermal-jump-record,
      .thermal-printable-wrapper .thermal-jump-record,
      .thermal-printable-sheet .thermal-jump-record {
        font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue Condensed Bold", "Liberation Sans Narrow", "Nimbus Sans Narrow", sans-serif !important;
        font-size: ${emphPt}pt !important;
        font-weight: 700 !important;
        font-stretch: condensed !important;
        display: inline-block !important;
      }

      .receipt .float-right,
      .thermal-printable-wrapper .float-right,
      .thermal-printable-sheet .float-right {
        float: right !important;
        display: block !important;
      }

      .receipt .thermal-jump-record.float-right,
      .thermal-printable-wrapper .thermal-jump-record.float-right,
      .thermal-printable-sheet .thermal-jump-record.float-right {
        line-height: 1 !important;
      }

      .thermal-due-amount,
      .receipt .thermal-due-amount,
      .thermal-printable-sheet .thermal-due-amount {
        font-size: ${fontPt}pt !important;
        font-weight: 700 !important;
        display: inline-block !important;
      }

      .receipt .thermal-footer-brand,
      .thermal-printable-wrapper .thermal-footer-brand,
      .thermal-printable-sheet .thermal-footer-brand,
      .receipt .thermal-footer-time,
      .thermal-printable-wrapper .thermal-footer-time,
      .thermal-printable-sheet .thermal-footer-time {
        font-size: ${footerPt}pt !important;
      }

      .receipt .thermal-record-clamp-1,
      .thermal-printable-wrapper .thermal-record-clamp-1,
      .thermal-printable-sheet .thermal-record-clamp-1 {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      .receipt .thermal-record-clamp-2,
      .thermal-printable-wrapper .thermal-record-clamp-2,
      .thermal-printable-sheet .thermal-record-clamp-2 {
        display: -webkit-box !important;
        -webkit-box-orient: vertical !important;
        -webkit-line-clamp: 2 !important;
        line-clamp: 2 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        white-space: normal !important;
      }

      .receipt img,
      .thermal-printable-wrapper img,
      .thermal-printable-sheet img {
        image-rendering: pixelated !important;
        filter: grayscale(100%) contrast(150%) !important;
        -webkit-filter: grayscale(100%) contrast(150%) !important;
      }

      /* Use full 100% of available paper width for divider lines */
      .thermal-printable-sheet .border-b:not(.flex):not(.avoid-break):not(tr):not(td),
      .thermal-printable-sheet .border-t:not(.flex):not(.avoid-break):not(tr):not(td),
      .thermal-printable-sheet .border-dashed:not(.avoid-break),
      .thermal-printable-sheet .border-dotted:not(.avoid-break),
      .thermal-printable-sheet .border-b-2:not(.avoid-break),
      .receipt .border-b:not(.flex):not(.avoid-break):not(tr):not(td),
      .receipt .border-t:not(.flex):not(.avoid-break):not(tr):not(td),
      .receipt .border-dashed:not(.avoid-break),
      .receipt .border-dotted:not(.avoid-break),
      .receipt .border-b-2:not(.avoid-break) {
        width: 100% !important;
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }

      /* Prevent blank trailing page on continuous roll paper */
      .receipt:last-child,
      .thermal-printable-wrapper:last-child,
      .thermal-printable-sheet:last-child {
        margin-bottom: 0 !important;
      }
    }
  `;
}

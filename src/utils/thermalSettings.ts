/**
 * 58mm Thermal Receipt Printer Setup & Persistence Utility
 * Supports standard 58mm USB and ESC/POS thermal printers (203 DPI, B&W).
 */

export interface ThermalPrintSettings {
  paperWidth: number;        // Fixed at 58mm (2.28")
  printableWidth: number;    // Approx 48mm (adjustable 40-54mm)
  marginHorizontal: number;  // Left & Right margin in mm (adjustable 0-6mm)
  topMargin: number;         // Top margin in mm (adjustable 2-10mm, default 5mm)
  fontSize: number;          // Base font size in px (adjustable 8.0-13.0px)
  lineSpacing: number;       // Line height multiplier (adjustable 1.05-1.50)
  feedBeforeCut: number;     // Feed spacing at receipt end before cut in mm (2-12mm)
  highContrast: boolean;     // Pure black & white for 203 DPI thermal heads
}

export const DEFAULT_THERMAL_SETTINGS: ThermalPrintSettings = {
  paperWidth: 58,
  printableWidth: 48,
  marginHorizontal: 0,
  topMargin: 5,
  fontSize: 9.5,
  lineSpacing: 1.25,
  feedBeforeCut: 4,
  highContrast: true,
};

const STORAGE_KEY = 'esports_58mm_thermal_settings';

/**
 * Loads persisted thermal printer settings with fallback to standard 58mm defaults
 */
export function getThermalSettings(): ThermalPrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THERMAL_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      paperWidth: 58, // Always enforce 58mm
      printableWidth: Math.max(40, Math.min(54, Number(parsed.printableWidth) || 48)),
      marginHorizontal: Math.max(0, Math.min(6, Number(parsed.marginHorizontal) ?? 0)),
      topMargin: Math.max(2, Math.min(10, Number(parsed.topMargin) || 5)),
      fontSize: Math.max(8, Math.min(13, Number(parsed.fontSize) || 9.5)),
      lineSpacing: Math.max(1.05, Math.min(1.5, Number(parsed.lineSpacing) || 1.25)),
      feedBeforeCut: Math.max(2, Math.min(12, Number(parsed.feedBeforeCut) || 4)),
      highContrast: parsed.highContrast !== false,
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
      printableWidth: Math.max(40, Math.min(54, Number(settings.printableWidth) || 48)),
      marginHorizontal: Math.max(0, Math.min(6, Number(settings.marginHorizontal) ?? 0)),
      topMargin: Math.max(2, Math.min(10, Number(settings.topMargin) || 5)),
      fontSize: Math.max(8, Math.min(13, Number(settings.fontSize) || 9.5)),
      lineSpacing: Math.max(1.05, Math.min(1.5, Number(settings.lineSpacing) || 1.25)),
      feedBeforeCut: Math.max(2, Math.min(12, Number(settings.feedBeforeCut) || 4)),
      highContrast: settings.highContrast !== false,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent('thermal-settings-changed', { detail: sanitized }));
  } catch (err) {
    console.error('Failed to save thermal settings:', err);
  }
}

/**
 * Generates dynamic scoped print CSS for 58mm thermal receipts
 * based on the user's starting point:
 * 
 * @page {
 *   size: 58mm auto;
 *   margin: 0;
 * }
 * @media print {
 *   html, body { width: 58mm; margin: 0; padding: 0; }
 *   .receipt { width: 48mm; margin: 0 auto; padding: 2mm 0; box-sizing: border-box; overflow: visible; }
 *   * { box-sizing: border-box; }
 *   .no-print { display: none !important; }
 * }
 */
export function generateThermalPrintCSS(settings: ThermalPrintSettings): string {
  return `
    @page {
      size: 58mm auto !important;
      margin: 0 !important;
    }

    @media print {
      html, body {
        width: 58mm !important;
        min-width: 58mm !important;
        max-width: 58mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        font-family: Consolas, "Courier New", monospace !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .receipt,
      .thermal-printable-wrapper,
      .thermal-printable-sheet {
        display: block !important;
        width: ${settings.printableWidth}mm !important;
        max-width: ${settings.printableWidth}mm !important;
        margin: 0 auto !important;
        padding-left: ${settings.marginHorizontal}mm !important;
        padding-right: ${settings.marginHorizontal}mm !important;
        padding-top: ${settings.topMargin || 5}mm !important;
        padding-bottom: ${settings.feedBeforeCut}mm !important;
        box-sizing: border-box !important;
        overflow: visible !important;
        font-family: Consolas, "Courier New", monospace !important;
        font-size: ${settings.fontSize}px !important;
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

      /* High contrast black and white for 203 DPI thermal paper */
      .receipt *,
      .thermal-printable-wrapper *,
      .thermal-printable-sheet * {
        color: #000000 !important;
        border-color: #000000 !important;
        background-color: transparent !important;
        box-shadow: none !important;
        text-shadow: none !important;
        font-family: Consolas, "Courier New", monospace !important;
      }

      .receipt img,
      .thermal-printable-wrapper img,
      .thermal-printable-sheet img {
        filter: grayscale(100%) contrast(200%) !important;
        -webkit-filter: grayscale(100%) contrast(200%) !important;
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

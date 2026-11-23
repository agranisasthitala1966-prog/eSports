/**
 * Direct Mobile Bluetooth ESC/POS Thermal Printing Utility
 * Sends print jobs directly from the browser to portable/desktop Bluetooth thermal printers
 * (e.g., PT-210, MPT-II, POS-58, GOOJPRT, Rongta, ZJiang) via the Web Bluetooth API.
 * 
 * Ensures NO external mobile apps (like RawBT, Print Service plugins, or PDF dialogs)
 * are opened when printing from mobile devices.
 */

import { ThermalPrintSettings, getThermalSettings } from './thermalSettings';
import { imageToEscPosRaster, imageWithTextToEscPosRaster, receiptDomToEscPosRaster } from './thermalLogo';

// Known Bluetooth Thermal Printer GATT Service UUIDs
const KNOWN_THERMAL_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // ISSC / Microchip transparent serial
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Common Chinese OEM BLE Serial (Goojprt, PT-210, MPT-II)
  '0000ff00-0000-1000-8000-00805f9b34fb', // Alternative OEM ESC/POS
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / OEM POS Service
  '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
];

// Singleton active Bluetooth connection
let cachedDevice: any = null;
let cachedCharacteristic: any = null;

/**
 * Checks if the Web Bluetooth API is supported in the current browser
 */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && typeof (navigator as any).bluetooth?.requestDevice === 'function';
}

/**
 * Checks if Bluetooth feature is permitted by document Permissions Policy
 */
export function isBluetoothAllowed(): boolean {
  if (!isWebBluetoothSupported()) return false;
  try {
    const doc = document as any;
    if (doc.permissionsPolicy && typeof doc.permissionsPolicy.allowsFeature === 'function') {
      return doc.permissionsPolicy.allowsFeature('bluetooth');
    }
    if (doc.featurePolicy && typeof doc.featurePolicy.allowsFeature === 'function') {
      return doc.featurePolicy.allowsFeature('bluetooth');
    }
  } catch {
    // ignore
  }
  return true;
}

/**
 * Checks if the app is currently running inside an iframe (e.g., preview pane)
 */
export function isRunningInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Detects if the current user is running on a mobile device (Android, iOS, tablet)
 */
export function isMobileClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
  const hasTouch = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0;
  return isMobileUA || (hasTouch && window.innerWidth <= 1024);
}

/**
 * Gets the name of the currently connected or paired Bluetooth device
 */
export function getConnectedBluetoothDeviceName(): string | null {
  if (cachedDevice && cachedDevice.gatt?.connected) {
    return cachedDevice.name || 'Bluetooth Printer';
  }
  const settings = getThermalSettings();
  return settings.bluetoothDeviceName || null;
}

/**
 * Connects to a Bluetooth thermal printer via Web Bluetooth GATT
 */
export async function connectBluetoothPrinter(): Promise<{ device: any; characteristic: any }> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome on Android for direct mobile thermal printing.');
  }

  // If Permissions Policy explicitly disallows bluetooth (e.g. inside an embedded iframe preview)
  if (!isBluetoothAllowed()) {
    const err = new DOMException('Access to Bluetooth is disallowed by permissions policy in this embedded preview frame.', 'SecurityError');
    throw err;
  }

  // If already connected and characteristic is ready, reuse it
  if (cachedDevice && cachedDevice.gatt?.connected && cachedCharacteristic) {
    return { device: cachedDevice, characteristic: cachedCharacteristic };
  }

  // Request Bluetooth device using Chrome's built-in chooser modal
  const bluetooth = (navigator as any).bluetooth;
  if (!bluetooth?.requestDevice) {
    throw new Error('Bluetooth device request is not supported in this browser environment.');
  }

  let device: any;
  try {
    device = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_THERMAL_SERVICES,
    });
  } catch (err: any) {
    if (err.name === 'SecurityError' || err.message?.includes('permissions policy') || err.message?.includes('disallowed')) {
      const secErr = new DOMException('Access to Bluetooth is disallowed by permissions policy in this embedded view.', 'SecurityError');
      throw secErr;
    }
    throw err;
  }

  if (!device) {
    throw new Error('No Bluetooth device selected.');
  }

  device.addEventListener('gattserverdisconnected', () => {
    cachedDevice = null;
    cachedCharacteristic = null;
    window.dispatchEvent(new CustomEvent('thermal-bluetooth-status', {
      detail: { connected: false, message: 'Printer disconnected' }
    }));
  });

  const server = await device.gatt.connect();

  // Search for the writable characteristic across primary services
  let writeChar: any = null;

  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const c of characteristics) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            writeChar = c;
            break;
          }
        }
        if (writeChar) break;
      } catch {
        // Continue searching next service
      }
    }
  } catch {
    // Fallback: try individual known services
    for (const sUuid of KNOWN_THERMAL_SERVICES) {
      try {
        const service = await server.getPrimaryService(sUuid);
        const characteristics = await service.getCharacteristics();
        for (const c of characteristics) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            writeChar = c;
            break;
          }
        }
        if (writeChar) break;
      } catch {
        // Try next service
      }
    }
  }

  if (!writeChar) {
    throw new Error(`Connected to "${device.name || 'Device'}", but could not locate an ESC/POS write channel. Ensure the thermal printer is powered on and in ESC/POS mode.`);
  }

  cachedDevice = device;
  cachedCharacteristic = writeChar;

  // Persist device name in thermal settings
  const currentSettings = getThermalSettings();
  if (device.name && device.name !== currentSettings.bluetoothDeviceName) {
    currentSettings.bluetoothDeviceName = device.name;
    currentSettings.connectionType = 'bluetooth';
    try {
      localStorage.setItem('esports_58mm_thermal_settings', JSON.stringify(currentSettings));
    } catch {
      // Ignore storage error
    }
  }

  window.dispatchEvent(new CustomEvent('thermal-bluetooth-status', {
    detail: { connected: true, deviceName: device.name || 'Bluetooth Printer' }
  }));

  return { device, characteristic: writeChar };
}

/**
 * ESC/POS Command Encoder Helper
 */
class EscPosEncoder {
  private buffer: number[] = [];
  private lineWidth: number = 32; // Default 32 characters for 58mm standard font

  constructor(lineWidth: number = 32) {
    this.lineWidth = lineWidth;
    this.init();
  }

  init(): this {
    // ESC @ - Initialize printer
    this.buffer.push(0x1B, 0x40);
    // ESC t 0 - Select character code table 0 (PC437 / Standard)
    this.buffer.push(0x1B, 0x74, 0x00);
    return this;
  }

  setLineSpacing(multiplier: number): this {
    // ESC 3 n - Set line spacing (default is 30 dots at 203 DPI)
    const n = Math.max(18, Math.min(60, Math.round(24 * multiplier)));
    this.buffer.push(0x1B, 0x33, n);
    return this;
  }

  setAlign(align: 'left' | 'center' | 'right'): this {
    // ESC a n - Select justification (0: left, 1: center, 2: right)
    const n = align === 'center' ? 1 : align === 'right' ? 2 : 0;
    this.buffer.push(0x1B, 0x61, n);
    return this;
  }

  setBold(bold: boolean): this {
    // ESC E n - Turn emphasized mode on/off
    this.buffer.push(0x1B, 0x45, bold ? 1 : 0);
    return this;
  }

  setTextSize(widthMultiplier: number = 1, heightMultiplier: number = 1): this {
    // GS ! n - Select character size
    const w = Math.max(1, Math.min(4, widthMultiplier)) - 1;
    const h = Math.max(1, Math.min(4, heightMultiplier)) - 1;
    const n = (w << 4) | h;
    this.buffer.push(0x1D, 0x21, n);
    return this;
  }

  setFont(font: 'A' | 'B'): this {
    // ESC M n - Select font (0: Font A 12x24, 1: Font B 9x17 compressed)
    this.buffer.push(0x1B, 0x4D, font === 'B' ? 1 : 0);
    return this;
  }

  text(str: string): this {
    // Clean and encode characters
    const clean = str
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/•/g, '-')
      .replace(/—/g, '-')
      .replace(/₹/g, 'Rs.');

    for (let i = 0; i < clean.length; i++) {
      const code = clean.charCodeAt(i);
      this.buffer.push(code <= 0x7F ? code : 0x3F); // ASCII or '?'
    }
    return this;
  }

  line(str: string = ''): this {
    if (str) {
      this.text(str);
    }
    this.buffer.push(0x0A); // LF
    return this;
  }

  dashedLine(len?: number): this {
    const count = len || Math.min(26, this.lineWidth - 4);
    const dashes = '-'.repeat(count);
    this.setAlign('center');
    this.setBold(false);
    this.line(dashes);
    return this;
  }

  solidLine(len?: number): this {
    const count = len || Math.min(26, this.lineWidth - 4);
    const solids = '-'.repeat(count);
    this.setAlign('center');
    this.setBold(false);
    this.line(solids);
    return this;
  }

  doubleLine(len?: number): this {
    const count = len || Math.min(26, this.lineWidth - 4);
    const equals = '='.repeat(count);
    this.setAlign('center');
    this.setBold(false);
    this.line(equals);
    return this;
  }

  dottedLine(len?: number): this {
    const count = len || Math.min(26, this.lineWidth - 4);
    const dots = '- '.repeat(Math.floor(count / 2)).trimEnd();
    this.setAlign('center');
    this.setBold(false);
    this.line(dots);
    return this;
  }

  tableRow(col1: string, col2: string, col3: string, boldCol2: boolean = false, maxLines: 1 | 2 = 2): this {
    // Tighter 30-col layout safe for 58mm printer matching HTML preview:
    // col1: SL or RK (3 chars + ' ' = 4 cols, e.g. "1  " or "1st")
    // col2: CH (4 chars + ' ' = 5 cols, e.g. "101 ")
    // col3: ATHLETE (CLUB) (1 or up to 2 lines, truncated with '...' if longer)
    const c1 = (col1.trim() + '   ').slice(0, 3);
    const c2 = (col2.trim() + '    ').slice(0, 4);
    const maxC3 = Math.max(10, this.lineWidth - 9);
    const rawC3 = col3.replace(/\s+/g, ' ').trim();

    let line1 = rawC3;
    let line2 = '';
    if (maxLines === 1) {
      if (rawC3.length > maxC3) {
        line1 = rawC3.slice(0, Math.max(1, maxC3 - 3)).trimEnd() + '...';
      }
    } else if (rawC3.length > maxC3) {
      let splitIdx = rawC3.lastIndexOf(' ', maxC3);
      if (splitIdx <= 2) splitIdx = maxC3;
      line1 = rawC3.slice(0, splitIdx).trimEnd();
      const rest = rawC3.slice(splitIdx).trimStart();
      if (rest) {
        line2 = rest.length > maxC3
          ? rest.slice(0, Math.max(1, maxC3 - 3)).trimEnd() + '...'
          : rest;
      }
    }

    this.setAlign('left');
    if (boldCol2) {
      this.text(`${c1} `);
      this.setBold(true);
      this.text(`${c2} `);
      this.setBold(false);
      this.line(line1);
    } else {
      this.line(`${c1} ${c2} ${line1}`);
    }
    if (line2) {
      this.line(`         ${line2}`);
    }
    return this;
  }

  feed(lines: number = 2): this {
    // ESC d n - Print and feed n lines
    const n = Math.max(1, Math.min(15, lines));
    this.buffer.push(0x1B, 0x64, n);
    return this;
  }

  cut(feedMm: number = 4): this {
    // Feed extra space before cut
    const feedLines = Math.max(2, Math.round(feedMm / 2.5));
    this.feed(feedLines);
    // GS V 66 0 - Partial cut
    this.buffer.push(0x1D, 0x56, 0x42, 0x00);
    return this;
  }

  rasterBytes(bytes: number[]): this {
    if (bytes && bytes.length > 0) {
      // Full-width 384-dot centered raster expects left offset 0
      this.setAlign('left');
      for (let i = 0; i < bytes.length; i++) {
        this.buffer.push(bytes[i]);
      }
      this.buffer.push(0x0A); // LF
    }
    return this;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Wraps long event details so no information (e.g. height, gender) is truncated on 58mm thermal receipts.
 */
function wrapEventTitle(title: string, maxLen: number = 30): string[] {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  // Try splitting before parenthesis if present and fits well
  const parenIdx = clean.indexOf('(');
  if (parenIdx > 4 && parenIdx <= maxLen) {
    const part1 = clean.slice(0, parenIdx).trim();
    const part2 = clean.slice(parenIdx).trim();
    if (part2.length <= maxLen) {
      return [part1, part2];
    }
  }

  // Word-wrap using word boundaries
  const words = clean.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if ((currentLine + ' ' + word).length <= maxLen) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Builds ESC/POS bytes from a `.receipt` DOM element or raw data
 * formatted precisely according to the user's 58mm thermal printer settings.
 */
export async function buildEscPosFromReceiptElement(
  receiptElement: HTMLElement,
  settings: ThermalPrintSettings
): Promise<Uint8Array> {
  // Compute safe line width from configured printableWidth (52mm = ~32 chars, narrower = fewer)
  const configuredWidthMm = settings.printableWidth || 52;
  const lineWidth = Math.max(24, Math.min(34, Math.round((configuredWidthMm / 52) * 32)));
  const encoder = new EscPosEncoder(lineWidth);

  // Apply Line Spacing from settings
  encoder.setLineSpacing(settings.lineSpacing || 1.25);

  // Apply Top Margin Feed from settings
  if (settings.topMargin && settings.topMargin > 0) {
    const topLines = Math.max(1, Math.round(settings.topMargin / 3));
    encoder.feed(topLines);
  }

  // Primary exact-match path: Render the exact `.receipt` DOM preview at 203 DPI (384 dots)
  // so the thermal printer outputs the identical 12pt font, bold chest/event numbers,
  // column gaps, borders, logos, and formatting shown in print preview.
  const exactRasterBytes = await receiptDomToEscPosRaster(receiptElement, configuredWidthMm, 384);
  if (exactRasterBytes && exactRasterBytes.length > 0) {
    encoder.setAlign('left');
    const prefix = encoder.getBytes();
    const feedLines = Math.max(1, Math.min(15, Math.max(2, Math.round((settings.feedBeforeCut || 4) / 2.5))));
    const suffix = [0x1B, 0x64, feedLines, 0x1D, 0x56, 0x42, 0x00];
    const result = new Uint8Array(prefix.length + exactRasterBytes.length + suffix.length);
    result.set(prefix, 0);
    result.set(exactRasterBytes, prefix.length);
    result.set(suffix, prefix.length + exactRasterBytes.length);
    return result;
  }

  // Fallback path if SVG foreignObject rasterization is unavailable or blocked
  const receiptText = receiptElement.textContent || '';

  // 1. Header ([Club Logo] CLUB NAME on one line matching preview + Ordinal Meet Title)
  const headerLogoEl = receiptElement.querySelector('.thermal-header-logo, img[alt="Club Logo"]') as HTMLImageElement | null;
  const headerLogoSrc = headerLogoEl?.getAttribute('data-original-src') || headerLogoEl?.getAttribute('src') || '/icon.png';
  const clubNameEl = receiptElement.querySelector('.font-bold.uppercase.truncate, .font-extrabold.uppercase, .text-center .font-bold.uppercase');
  const ordinalEl = receiptElement.querySelector('.thermal-ordinal-title, .whitespace-nowrap.overflow-hidden.text-ellipsis, .text-center div:nth-child(2), .text-center .text-\\[8\\.5px\\]');

  let headerClubName = '';
  if (clubNameEl && clubNameEl.textContent) {
    const rawClub = clubNameEl.textContent.trim().toUpperCase();
    if (!rawClub.includes('TOP 3') && !rawClub.includes('HIT LIST') && !rawClub.includes('RANKING LIST') && !rawClub.includes('FINAL LIST')) {
      headerClubName = rawClub;
    }
  }

  let headerCompositePrinted = false;
  if (headerLogoSrc && headerClubName) {
    const headerRowRaster = await imageWithTextToEscPosRaster(headerLogoSrc, headerClubName, 32, 18, 384, 6, true);
    if (headerRowRaster.length > 0) {
      encoder.rasterBytes(headerRowRaster);
      headerCompositePrinted = true;
    }
  } else if (headerLogoSrc) {
    const headerRaster = await imageToEscPosRaster(headerLogoSrc, 48, 384);
    if (headerRaster.length > 0) {
      encoder.rasterBytes(headerRaster);
    }
  }

  encoder.setAlign('center');
  encoder.setBold(true);

  if (!headerCompositePrinted && headerClubName) {
    encoder.setTextSize(1, 1);
    encoder.line(headerClubName.slice(0, lineWidth));
  }

  if (ordinalEl && ordinalEl.textContent) {
    const ord = ordinalEl.textContent.trim();
    const ordUpper = ord.toUpperCase();
    if (ordinalEl.classList.contains('thermal-ordinal-title') || ordUpper.includes('SPORTS') || ordUpper.includes('MEET') || ordUpper.includes('ANNUAL') || ordUpper.includes('ATHLETIC')) {
      encoder.setBold(false);
      encoder.setTextSize(1, 1);
      encoder.line(ord.slice(0, lineWidth));
    }
  }

  encoder.dashedLine();

  // =========================================================================
  // CASE A: TOP 3 CLUBS / CHAMPIONSHIP
  // =========================================================================
  if (receiptText.includes('Top 3 Clubs') || receiptText.includes('TOP 3 CLUBS') || receiptText.includes('TOP 3 CLUB CHAMPIONSHIP') || receiptText.includes('OFFICIAL TEAM STANDINGS')) {
    encoder.setAlign('center');
    encoder.setBold(true);
    encoder.line('Top 3 Clubs');
    encoder.dashedLine();

    // Table Column Headers: RK, CLUB, G, S, B, T
    encoder.setAlign('left');
    encoder.setBold(false);
    encoder.line('RK   CLUB           G  S  B   T');
    encoder.doubleLine();

    // Team Rows (matches space-y-1)
    const teamRows = receiptElement.querySelectorAll('.space-y-1 > div, [class*="space-y-1"] > div');
    teamRows.forEach((row, idx) => {
      const rk = row.querySelector('span:first-child')?.textContent?.trim() || '1ST';
      const club = row.querySelector('.flex-1')?.textContent?.trim() || '';
      const g = row.querySelector('.thermal-champ-g')?.textContent?.trim() || '0';
      const s = row.querySelector('.thermal-champ-s')?.textContent?.trim() || '0';
      const b = row.querySelector('.thermal-champ-b')?.textContent?.trim() || '0';
      const pts = row.querySelector('.thermal-champ-t')?.textContent?.trim() || '0';

      const rkCol = (rk + '     ').slice(0, 5);
      const rawClub = club.replace(/\s+/g, ' ').trim().toUpperCase();
      const clubCol = (rawClub.length > 14 ? rawClub.slice(0, 11).trimEnd() + '...' : rawClub).padEnd(14, ' ');
      const medalsCol = `${g.padStart(2, ' ')} ${s.padStart(2, ' ')} ${b.padStart(2, ' ')} ${pts.padStart(3, ' ')}`;

      encoder.setAlign('left');
      encoder.setBold(idx === 0);
      encoder.text(rkCol);
      encoder.text(`${clubCol} ${medalsCol}`);
      encoder.line();
      encoder.setBold(false);
      encoder.dottedLine();
    });

    // Champion callout
    const champEl = receiptElement.querySelector('.mt-1.pt-0\\.5, [class*="CHAMPION:"]');
    if (champEl && champEl.textContent && champEl.textContent.includes('CHAMPION:')) {
      encoder.dashedLine();
      encoder.setAlign('center');
      encoder.setBold(true);
      encoder.line(champEl.textContent.trim().toUpperCase());
      encoder.setBold(false);
    }
  }

  // =========================================================================
  // CASE B: CLUB WISE CANDIDATE LIST (CLUB: <...>)
  // =========================================================================
  else if (receiptText.includes('CLUB:') || receiptText.includes('Net Payable') || receiptText.includes('NET PAYABLE') || receiptText.includes('SUB TOTAL') || receiptText.includes('Enrolled:')) {
    const clubBlocks = receiptElement.querySelectorAll('.avoid-break, .space-y-3 > div');
    const blocksToProcess = clubBlocks.length > 0 ? Array.from(clubBlocks) : [receiptElement];

    blocksToProcess.forEach((block, bIdx) => {
      if (bIdx > 0) {
        encoder.feed(1);
        encoder.dashedLine();
      }

      // Club Banner: CLUB: [bold club name]
      const clubBannerEl = block.querySelector('.thermal-club-banner, .font-normal.text-\\[10\\.5px\\], [class*="CLUB:"]');
      let clubNameOnly = '';
      const bannerText = clubBannerEl?.textContent?.trim() || '';
      const bannerBracketMatch = bannerText.match(/CLUB:\s*[\[|<]([^\]|>]+)[\]|>]/i) || (block.textContent || '').match(/CLUB:\s*[\[|<]([^\]|>]+)[\]|>]/i);
      if (bannerBracketMatch) {
        clubNameOnly = bannerBracketMatch[1].trim();
      } else if (bannerText) {
        clubNameOnly = bannerText.replace(/^CLUB:\s*/i, '').trim();
      }

      if (clubNameOnly) {
        encoder.setAlign('left');
        encoder.setBold(false);
        encoder.text('CLUB: [');
        encoder.setBold(true);
        encoder.text(clubNameOnly.slice(0, Math.max(8, lineWidth - 8)));
        encoder.setBold(false);
        encoder.line(']');
        encoder.dashedLine();
      }

      // Column Headers: CH, NAME, EVTS
      encoder.setAlign('left');
      encoder.setBold(false);
      encoder.line('CH   NAME              EVTS');
      encoder.doubleLine();

      // Athlete Rows inside space-y-0.5 or space-y-0
      const athleteRows = block.querySelectorAll('.space-y-0\\.5 > div, [class*="space-y-0.5"] > div, .space-y-0 > div');
      athleteRows.forEach((row) => {
        const chEl = row.querySelector('.thermal-chest-no, .w-8, .w-7, span:first-child');
        const nameEl = row.querySelector('.thermal-athlete-name') || row.querySelector('.flex-1');
        const evtsEl = row.querySelector('.thermal-evts-col, .w-10, .w-7');

        const ch = (chEl?.textContent?.trim() || '---').padEnd(4, ' ').slice(0, 4) + ' ';
        const rawNameText = (nameEl?.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
        const rawEv = (evtsEl?.textContent?.trim() || '').replace(/\s+/g, ' ');
        const evSlotWidth = Math.min(10, Math.max(6, rawEv.length));
        const maxNameLine1 = Math.max(8, lineWidth - 5 - evSlotWidth - 1);

        let evLine1 = rawEv;
        let evLine2 = '';
        if (rawEv.length > evSlotWidth) {
          evLine1 = rawEv.slice(0, evSlotWidth);
          const evRest = rawEv.slice(evSlotWidth);
          evLine2 = evRest.length > evSlotWidth
            ? evRest.slice(0, Math.max(1, evSlotWidth - 3)) + '...'
            : evRest;
        }

        const maxNameLine2 = evLine2 ? maxNameLine1 : Math.max(10, lineWidth - 5);
        let nameLine1 = rawNameText;
        let nameLine2 = '';
        if (rawNameText.length > maxNameLine1) {
          let splitIdx = rawNameText.lastIndexOf(' ', maxNameLine1);
          if (splitIdx <= 2) splitIdx = maxNameLine1;
          nameLine1 = rawNameText.slice(0, splitIdx).trimEnd();
          const rest = rawNameText.slice(splitIdx).trimStart();
          if (rest) {
            nameLine2 = rest.length > maxNameLine2
              ? rest.slice(0, Math.max(1, maxNameLine2 - 3)).trimEnd() + '...'
              : rest;
          }
        }

        encoder.setAlign('left');
        encoder.setBold(false);
        encoder.text(ch);
        encoder.line(`${nameLine1.padEnd(maxNameLine1, ' ')} ${evLine1}`.trimEnd());
        if (nameLine2 || evLine2) {
          encoder.line(
            evLine2
              ? `     ${nameLine2.padEnd(maxNameLine1, ' ')} ${evLine2}`.trimEnd()
              : `     ${nameLine2}`
          );
        }
        encoder.dottedLine();
      });

      // Subtotals: Enrolled (left) & Total (right); Paid (left) & Due (right, normal); Net Payable: (right, bold)
      const blockText = block.textContent || '';
      const enrolledMatch = blockText.match(/Enrolled:\s*(\d+)/i);
      const totalMatch = blockText.match(/Total:\s*(?:Rs\.|₹)?\s*([0-9.]+)/i);
      const paidMatch = blockText.match(/Paid:\s*(?:Rs\.|₹)?\s*([0-9.]+)/i);
      const dueMatch = blockText.match(/(?:Net Payable|Due|DUE|SUB TOTAL)[^0-9:]*:\s*(?:Rs\.|₹)?\s*([0-9.]+)/i);

      if (enrolledMatch || totalMatch || paidMatch || dueMatch || athleteRows.length > 0) {
        const enrolledCount = enrolledMatch ? enrolledMatch[1] : `${athleteRows.length}`;
        const totalAmount = totalMatch ? Math.round(Number(totalMatch[1])) : '0';
        const paidAmount = paidMatch ? Math.round(Number(paidMatch[1])) : '0';
        const dueAmount = dueMatch ? Math.round(Number(dueMatch[1])) : `${Math.max(0, Number(totalAmount) - Number(paidAmount))}`;

        encoder.dashedLine();

        // Line 1: Enrolled: (left align) and Total: (right align)
        const left1 = `Enrolled: ${enrolledCount}`;
        const right1 = `Total: Rs.${totalAmount}`;
        const spaces1 = Math.max(1, lineWidth - left1.length - right1.length);
        encoder.setAlign('left');
        encoder.setBold(false);
        encoder.line(left1 + ' '.repeat(spaces1) + right1);

        // Line 2: Paid: (left align) and Due: (right align) with normal font
        const left2 = `Paid: Rs.${paidAmount}`;
        const right2 = `Due: Rs.${dueAmount}`;
        const spaces2 = Math.max(1, lineWidth - left2.length - right2.length);
        encoder.setAlign('left');
        encoder.setBold(false);
        encoder.line(left2 + ' '.repeat(spaces2) + right2);

        // Solid divider
        encoder.solidLine();

        // Line 3: Net Payable: right align and bold
        encoder.setAlign('right');
        encoder.setBold(true);
        encoder.line(`Net Payable: Rs.${dueAmount}`);
        encoder.setBold(false);
      }
    });
  }

  // =========================================================================
  // CASE C: CANDIDATE LIST (Name list)
  // =========================================================================
  else if (receiptText.includes('Name list') || receiptText.includes('--- Name list ---')) {
    encoder.setAlign('center');
    encoder.setBold(true);
    encoder.line('--- Name list ---');
    encoder.dashedLine();

    encoder.setAlign('left');
    encoder.setBold(false);
    encoder.line('SL   CH  NAME           EVTS');
    encoder.doubleLine();

    const rows = receiptElement.querySelectorAll('.space-y-0 > div, [class*="space-y-0"] > div');
    rows.forEach((row, idx) => {
      const slEl = row.querySelector('.w-5, span:first-child');
      const chEl = row.querySelector('.thermal-chest-no, .w-7, .w-9');
      const nameEl = row.querySelector('.thermal-athlete-name') || row.querySelector('.flex-1');
      const evEl = row.querySelector('.thermal-evts-col') || row.querySelector('.min-w-\\[40px\\], .w-11, .w-7, span:last-child');

      const sl = (slEl?.textContent?.trim() || `${idx + 1}`).padEnd(3, ' ').slice(0, 3) + '  ';
      const ch = (chEl?.textContent?.trim() || '---').padEnd(3, ' ').slice(0, 3) + ' ';
      const rawEv = (evEl?.textContent?.trim() || '').replace(/\s+/g, ' ');
      const evSlotWidth = Math.min(8, Math.max(4, rawEv.length));
      const maxNameLine1 = Math.max(8, lineWidth - 9 - evSlotWidth - 1);
      const rawName = (nameEl?.textContent?.trim() || '').replace(/\s+/g, ' ').toUpperCase();

      let evLine1 = rawEv;
      let evLine2 = '';
      if (rawEv.length > evSlotWidth) {
        evLine1 = rawEv.slice(0, evSlotWidth);
        const evRest = rawEv.slice(evSlotWidth);
        evLine2 = evRest.length > evSlotWidth
          ? evRest.slice(0, Math.max(1, evSlotWidth - 3)) + '...'
          : evRest;
      }

      const maxNameLine2 = evLine2 ? maxNameLine1 : Math.max(10, lineWidth - 9);
      let nameLine1 = rawName;
      let nameLine2 = '';
      if (rawName.length > maxNameLine1) {
        let splitIdx = rawName.lastIndexOf(' ', maxNameLine1);
        if (splitIdx <= 2) splitIdx = maxNameLine1;
        nameLine1 = rawName.slice(0, splitIdx).trimEnd();
        const rest = rawName.slice(splitIdx).trimStart();
        if (rest) {
          nameLine2 = rest.length > maxNameLine2
            ? rest.slice(0, Math.max(1, maxNameLine2 - 3)).trimEnd() + '...'
            : rest;
        }
      }

      encoder.setAlign('left');
      encoder.setBold(false);
      encoder.text(sl);
      encoder.text(ch);
      encoder.line(`${nameLine1.padEnd(maxNameLine1, ' ')} ${evLine1}`);
      if (nameLine2 || evLine2) {
        encoder.line(
          evLine2
            ? `         ${nameLine2.padEnd(maxNameLine1, ' ')} ${evLine2}`.trimEnd()
            : `         ${nameLine2}`
        );
      }
      encoder.dottedLine();
    });

    const summaryEl = receiptElement.querySelector('.mt-1.pt-0\\.5, [class*="Amt:"]');
    if (summaryEl && summaryEl.textContent) {
      encoder.dashedLine();
      encoder.setAlign('center');
      encoder.line(summaryEl.textContent.trim().replace(/₹/g, 'Rs.').slice(0, lineWidth));
    }
  }

  // =========================================================================
  // CASE D: RANKING LIST / EVENT RESULTS
  // =========================================================================
  else if (receiptText.includes('RANKING LIST') || receiptText.includes('RESULTS')) {
    encoder.setAlign('center');
    encoder.setBold(true);
    encoder.line('RANKING LIST');

    // Event title line (clean duplicate 'RANKING LIST' or 'RESULTS')
    const evtEl = receiptElement.querySelector('.thermal-event-details') ||
                  receiptElement.querySelector('.text-center.py-0\\.5 .font-semibold') ||
                  receiptElement.querySelector('.text-center.font-bold.text-\\[9px\\]');
    let evtLine = evtEl?.textContent?.trim() || '';
    if (!evtLine) {
      const titleBlock = receiptElement.querySelector('.text-center:has(.uppercase)');
      evtLine = titleBlock?.textContent?.trim() || '';
    }

    // Strip redundant "RANKING LIST" so it is never printed twice on the second line
    evtLine = evtLine.replace(/^(?:RANKING\s*LIST|RESULTS|HIT\s*LIST|FINAL\s*LIST)\s*/i, '').trim();
    evtLine = evtLine.replace(/(?:EVT|EVENT)\s*#?\s*(\d+)/gi, 'Evt $1');
    evtLine = evtLine.replace(/^#?\s*(\d+)\s*:/i, 'Evt $1:');
    evtLine = evtLine.replace(/\(\s*ALL\s*[•\-–]\s*([A-Z]+)\s*\)/i, ': $1');
    evtLine = evtLine.replace(/\(\s*ALL\s*\)/i, '');
    evtLine = evtLine.replace(/\s+/g, ' ').trim();

    if (evtLine) {
      encoder.setAlign('center');
      encoder.setFont('A');
      const wrappedEvt = wrapEventTitle(evtLine, lineWidth);
      wrappedEvt.forEach((wLine, idx) => {
        if (idx === 0) {
          const m = wLine.match(/^(Evt\s+\d+)(.*)$/i);
          if (m) {
            encoder.setBold(true);
            encoder.text(m[1].toUpperCase());
            encoder.setBold(false);
            encoder.line(m[2].toUpperCase());
            return;
          }
        }
        encoder.setBold(false);
        encoder.line(wLine.toUpperCase());
      });
    }
    encoder.dashedLine();

    const isBroadJump = receiptText.toUpperCase().includes('BROAD JUMP');
    encoder.setAlign('left');
    encoder.setBold(false);
    if (isBroadJump) {
      encoder.line('RK  CH   ATHLETE (CLUB)   JUMP');
    } else {
      encoder.line('RK  CH   ATHLETE (CLUB)');
    }
    encoder.doubleLine();

    const rows = receiptElement.querySelectorAll('.space-y-0 > div, [class*="space-y-0"] > div');
    rows.forEach((row, idx) => {
      // 1. Explicitly extract chest number from .thermal-chest-no class!
      const chEl = row.querySelector('.thermal-chest-no');
      const ch = chEl?.textContent?.trim() || '';

      // 2. Rank is the first span in the row (e.g. "1st", "2nd", "3rd")
      const spans = row.querySelectorAll('span');
      const rank = spans[0]?.textContent?.trim() || `${idx + 1}`;

      // 3. Athlete name & club combined as <name> (club)
      const nameEl = row.querySelector('.thermal-athlete-name') || row.querySelector('.flex-1');
      const name = nameEl?.textContent?.trim() || '';
      const clubEl = row.querySelector('.thermal-athlete-club');
      const clubName = clubEl?.textContent?.trim() || '';
      const combinedAthlete = (clubName ? `${name} (${clubName})` : name).replace(/\s+/g, ' ').trim();

      // 4. Jump record (if Broad Jump)
      const jumpEl = row.querySelector('.thermal-jump-record, .w-14.text-right, .w-13.text-right');
      const jump = jumpEl?.textContent?.trim() || '';

      if (isBroadJump && jump) {
        const rkStr = (rank + '   ').slice(0, 3) + ' ';
        const chStr = (ch + '    ').slice(0, 4) + ' ';
        const jmWidth = Math.max(6, Math.min(10, jump.length));
        const jmStr = jump.slice(0, jmWidth).padStart(jmWidth, ' ');
        const maxLine1 = Math.max(6, lineWidth - 9 - jmWidth - 1);
        const maxLine2 = Math.max(10, lineWidth - 9);

        let line1 = combinedAthlete;
        let line2 = '';
        if (combinedAthlete.length > maxLine1) {
          let splitIdx = combinedAthlete.lastIndexOf(' ', maxLine1);
          if (splitIdx <= 2) splitIdx = maxLine1;
          line1 = combinedAthlete.slice(0, splitIdx).trimEnd();
          const rest = combinedAthlete.slice(splitIdx).trimStart();
          if (rest) {
            line2 = rest.length > maxLine2
              ? rest.slice(0, Math.max(1, maxLine2 - 3)).trimEnd() + '...'
              : rest;
          }
        }

        encoder.setAlign('left');
        encoder.setBold(false);
        encoder.text(rkStr);
        encoder.text(chStr);
        encoder.line(`${line1.padEnd(maxLine1, ' ')} ${jmStr}`);
        if (line2) {
          encoder.line(`         ${line2}`);
        }
      } else {
        encoder.tableRow(rank, ch, combinedAthlete, false);
      }
      encoder.dottedLine();
    });

    const newRecordEl = receiptElement.querySelector('.thermal-new-record-callout');
    if (newRecordEl && newRecordEl.textContent) {
      const recText = newRecordEl.textContent.replace(/\s+/g, ' ').trim();
      if (/^New Record:\s*N$/i.test(recText)) {
        encoder.setAlign('center');
        encoder.setBold(false);
        encoder.line('New Record: N');
      } else if (recText) {
        const splitMatch = recText.match(/^(New Record:\s*Y)(.*)$/i);
        if (splitMatch) {
          encoder.setAlign('center');
          encoder.setBold(true);
          encoder.text(splitMatch[1]);
          encoder.setBold(false);
          const restText = splitMatch[2] || '';
          if (splitMatch[1].length + restText.length <= lineWidth) {
            encoder.line(restText);
          } else {
            const firstChunkLen = Math.max(0, lineWidth - splitMatch[1].length);
            encoder.line(restText.slice(0, firstChunkLen));
            const remaining = restText.slice(firstChunkLen).trimStart();
            if (remaining) {
              wrapEventTitle(remaining, lineWidth).forEach((wLine) => {
                encoder.line(wLine);
              });
            }
          }
        } else {
          encoder.setAlign('center');
          encoder.setBold(false);
          wrapEventTitle(recText, lineWidth).forEach((wLine) => {
            encoder.line(wLine);
          });
        }
      }
    }
  }

  // =========================================================================
  // CASE E: HIT LIST / FINAL LIST / OTHER EVENT SHEETS
  // =========================================================================
  else {
    let docType = 'HIT LIST';
    if (receiptText.toUpperCase().includes('FINAL LIST')) {
      docType = 'FINAL LIST';
    } else if (receiptText.toUpperCase().includes('HIT LIST')) {
      docType = 'HIT LIST';
    } else {
      const docTypeEl = receiptElement.querySelector('.font-bold.uppercase, .tracking-wider');
      if (docTypeEl?.textContent) docType = docTypeEl.textContent.trim().toUpperCase();
    }

    const evtEl = receiptElement.querySelector('.thermal-event-details') ||
                  receiptElement.querySelector('.text-center.py-0\\.5 .font-semibold') ||
                  receiptElement.querySelector('.break-words, .text-\\[9px\\], .text-\\[8\\.5px\\]');
    let evtLine = evtEl?.textContent?.trim() || '';
    if (evtLine) {
      evtLine = evtLine.replace(new RegExp(`^(?:${docType}|HIT\\s*LIST|FINAL\\s*LIST|RANKING\\s*LIST)\\s*`, 'i'), '').trim();
      evtLine = evtLine.replace(/(?:EVT|EVENT)\s*#?\s*(\d+)/gi, 'Evt $1');
      evtLine = evtLine.replace(/^#?\s*(\d+)\s*:/i, 'Evt $1:');
      evtLine = evtLine.replace(/\(\s*ALL\s*[•\-–]\s*([A-Z]+)\s*\)/i, ': $1');
      evtLine = evtLine.replace(/\(\s*ALL\s*\)/i, '');
      evtLine = evtLine.replace(/\s+/g, ' ').trim();
    }

    encoder.setAlign('center');
    encoder.setBold(true);
    encoder.line(docType);

    if (evtLine) {
      encoder.setAlign('center');
      encoder.setFont('A');
      const wrappedEvt = wrapEventTitle(evtLine, lineWidth);
      wrappedEvt.forEach((wLine, idx) => {
        if (idx === 0) {
          const m = wLine.match(/^(Evt\s+\d+)(.*)$/i);
          if (m) {
            encoder.setBold(true);
            encoder.text(m[1].toUpperCase());
            encoder.setBold(false);
            encoder.line(m[2].toUpperCase());
            return;
          }
        }
        encoder.setBold(false);
        encoder.line(wLine.toUpperCase());
      });
    }
    encoder.dashedLine();

    encoder.setAlign('left');
    encoder.setBold(false);
    encoder.tableRow('SL', 'CH', 'ATHLETE (CLUB)', false);
    encoder.doubleLine();

    const rows = receiptElement.querySelectorAll('.space-y-0 > div, .space-y-0.text-black > div, [class*="space-y-0"] > div');
    if (rows && rows.length > 0) {
      rows.forEach((row, idx) => {
        const chEl = row.querySelector('.thermal-chest-no');
        const slEl = row.querySelector('span:first-child');
        const nameEl = row.querySelector('.flex-1');

        const sl = slEl?.textContent?.trim() || `${idx + 1}`;
        const ch = chEl?.textContent?.trim() || '';
        const name = nameEl?.textContent?.trim() || '';

        encoder.tableRow(sl, ch, name, false, docType === 'HIT LIST' || docType === 'FINAL LIST' ? 1 : 2);
        encoder.dottedLine();
      });
    } else {
      // Fallback for custom or test receipt (e.g. in setup modal)
      const testRows = receiptElement.querySelectorAll('.flex.justify-between.py-0\\.5, [style*="justify-content: space-between"]');
      testRows.forEach((item) => {
        const text = item.textContent?.trim().replace(/\s+/g, ' ') || '';
        if (text && !text.startsWith('CH ') && !text.includes('CH#') && !text.includes('FEES') && !text.includes('TOTAL')) {
          encoder.setAlign('left');
          encoder.line(text.slice(0, lineWidth));
        }
      });
    }
  }

  // =========================================================================
  // FOOTER ([Brand Logo] eSports-Sport Management in ONE LINE + Timestamp)
  // =========================================================================
  encoder.dashedLine();

  const footerLogoEl = receiptElement.querySelector('.thermal-footer-logo, img[alt="eSports Logo"]') as HTMLImageElement | null;
  const footerLogoSrc = footerLogoEl?.getAttribute('data-original-src') || footerLogoEl?.getAttribute('src') || '/icon.png';
  let footerCompositePrinted = false;
  if (footerLogoSrc) {
    const footerRowRaster = await imageWithTextToEscPosRaster(footerLogoSrc, 'eSports-Sport Management', 26, 17, 384, 6, false);
    if (footerRowRaster.length > 0) {
      encoder.rasterBytes(footerRowRaster);
      footerCompositePrinted = true;
    }
  }

  encoder.setAlign('center');
  encoder.setBold(false);

  if (!footerCompositePrinted) {
    encoder.line('eSports-Sport Management');
  }

  const footerEl = receiptElement.querySelector('.text-center.pt-1.mt-1, .text-center.pt-0\\.5');
  const timeEl = footerEl?.querySelector('.font-mono, .text-gray-600');
  const timeStr = timeEl?.textContent?.trim() || new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  encoder.line(timeStr);

  // Feed Before Cut & Cut Command from settings
  encoder.cut(settings.feedBeforeCut || 4);

  return encoder.getBytes();
}

/**
 * Sends a raw ESC/POS byte array directly to the connected Bluetooth thermal printer
 * using fast, flow-controlled BLE chunks that keep the print head fed smoothly without pauses.
 */
export async function sendEscPosToBluetooth(
  characteristic: any,
  data: Uint8Array,
  onProgress?: (sent: number, total: number) => void
): Promise<void> {
  const canWriteWithoutResponse = Boolean(characteristic?.properties?.writeWithoutResponse);
  // 120 bytes stays safely inside standard 128-512 BLE MTUs while maximizing UART bridge throughput
  let activeChunkSize = canWriteWithoutResponse ? 120 : 100;
  // Write-with-response already waits for hardware BLE ACK; write-without-response paces at ~13-15 KB/s
  let interChunkDelayMs = canWriteWithoutResponse ? 6 : 2;
  const total = data.length;

  const writeChunk = async (chunk: Uint8Array) => {
    if (canWriteWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function') {
      await characteristic.writeValueWithoutResponse(chunk);
    } else if (typeof characteristic.writeValueWithResponse === 'function') {
      await characteristic.writeValueWithResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
  };

  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + activeChunkSize, total);
    const chunk = data.slice(offset, end);

    let sent = false;
    let steppedDownMtu = false;
    let lastErr: any = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await writeChunk(chunk);
        sent = true;
        break;
      } catch (err: any) {
        lastErr = err;
        const errMsg = String(err?.message || '');
        const isMtuError =
          err?.name === 'NotSupportedError' ||
          err?.name === 'InvalidModificationError' ||
          /length|size|mtu|exceed/i.test(errMsg);

        if (activeChunkSize > 20 && isMtuError) {
          activeChunkSize = activeChunkSize > 100 ? 100 : activeChunkSize > 64 ? 64 : 20;
          steppedDownMtu = true;
          break;
        }

        // Transient buffer busy: ease pacing slightly and retry
        interChunkDelayMs = Math.min(20, interChunkDelayMs + 3);
        await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
      }
    }

    if (!sent) {
      if (steppedDownMtu) {
        continue;
      }
      throw lastErr || new Error('Failed to write ESC/POS data to Bluetooth thermal printer.');
    }

    offset = end;

    if (onProgress) {
      onProgress(offset, total);
    }

    if (offset < total && interChunkDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, interChunkDelayMs));
    }
  }
}

/**
 * High-level printing controller:
 * Directly prints the receipt to the thermal printer without opening ANY other mobile app!
 * 
 * Returns { success: boolean, message: string }
 */
export async function printDirectlyToThermalPrinter(
  receiptElement: HTMLElement | null,
  customSettings?: ThermalPrintSettings
): Promise<{ success: boolean; message: string; method: 'bluetooth' | 'system' }> {
  const settings = customSettings || getThermalSettings();

  // If receipt element is provided, generate ESC/POS bytes
  if (!receiptElement) {
    // If no element found, attempt query
    receiptElement = document.querySelector('.receipt');
  }

  // If receipt element is missing, still attempt fallback print so user isn't blocked
  if (!receiptElement) {
    window.print();
    return {
      success: true,
      message: 'Printed via system print service.',
      method: 'system'
    };
  }

  // Check if Web Bluetooth is available AND allowed by permissions policy
  if (isWebBluetoothSupported() && isBluetoothAllowed()) {
    try {
      const escPosData = await buildEscPosFromReceiptElement(receiptElement, settings);
      const { device, characteristic } = await connectBluetoothPrinter();
      await sendEscPosToBluetooth(characteristic, escPosData);
      return {
        success: true,
        message: `Printed directly to "${device.name || 'Thermal Printer'}" via Bluetooth!`,
        method: 'bluetooth'
      };
    } catch (err: any) {
      // 1. If user deliberately cancelled the Bluetooth picker
      if (err.name === 'NotFoundError' || err.message?.includes('cancelled') || err.message?.includes('canceled')) {
        return {
          success: false,
          message: 'Bluetooth printer selection was cancelled.',
          method: 'bluetooth'
        };
      }

      // 2. SecurityError: Access to bluetooth is disallowed by permissions policy (e.g. inside an embedded iframe preview)
      if (err.name === 'SecurityError' || err.message?.includes('permissions policy') || err.message?.includes('disallowed')) {
        console.warn('Bluetooth disallowed by permissions policy in embedded iframe. Gracefully falling back to thermal print layout.');
        window.print();
        return {
          success: true,
          message: 'Printed via thermal print dialog (Preview iframe restricts Bluetooth; active on standalone mobile tab).',
          method: 'system'
        };
      }

      // 3. Any other hardware/GATT error: gracefully execute window.print() so the print job NEVER fails!
      console.warn('Bluetooth print encountered an issue, falling back to print dialog:', err.message || err);
      window.print();
      return {
        success: true,
        message: `Printed via print dialog (${err.message || 'Bluetooth connection issue'}).`,
        method: 'system'
      };
    }
  }

  // Fallback: Web Bluetooth not supported or disallowed by permissions policy in iframe
  window.print();
  return {
    success: true,
    message: isRunningInIframe()
      ? 'Printed via thermal print dialog (Preview iframe restricts Bluetooth; active on standalone mobile tab).'
      : 'Sent to system print service.',
    method: 'system'
  };
}

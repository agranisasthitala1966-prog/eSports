import { jsPDF } from 'jspdf';
import { Candidate, Club, SportsMeetSettings } from '../types';

let cachedRupeeDataUrl: string | null = null;

function getRupeeGlyphDataUrl(): string {
  if (cachedRupeeDataUrl) return cachedRupeeDataUrl;
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#000000';
  ctx.font = '48px Arial, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('₹', 32, 34);
  cachedRupeeDataUrl = canvas.toDataURL('image/png');
  return cachedRupeeDataUrl;
}

async function loadImageAsDataUrl(src: string): Promise<string> {
  if (!src) return '';
  if (src.startsWith('data:')) return src;
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';

  return new Promise<string>((resolve) => {
    const img = new Image();
    if (!src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve('');
      }
    }, 2000);

    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const size = 96;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('');
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        const nw = img.naturalWidth || img.width || size;
        const nh = img.naturalHeight || img.height || size;
        const scale = Math.min(size / nw, size / nh);
        const dw = Math.max(1, Math.round(nw * scale));
        const dh = Math.max(1, Math.round(nh * scale));
        const dx = Math.floor((size - dw) / 2);
        const dy = Math.floor((size - dh) / 2);
        ctx.drawImage(img, dx, dy, dw, dh);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve('');
      }
    };

    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve('');
      }
    };

    img.src = src;
  });
}

function drawRasterTextLine(
  doc: jsPDF,
  text: string,
  xMm: number,
  baselineYMm: number,
  options: {
    fontPx?: number;
    bold?: boolean;
    maxWidthMm?: number;
    align?: 'left' | 'center' | 'right';
  } = {}
) {
  if (typeof document === 'undefined' || !text) return;
  const { fontPx = 28, bold = false, maxWidthMm = 90, align = 'left' } = options;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const fontSpec = `${bold ? 'bold ' : ''}${fontPx}px Consolas, "Courier New", Arial, sans-serif`;
  ctx.font = fontSpec;
  const measuredW = Math.ceil(ctx.measureText(text).width) + 8;
  const h = Math.ceil(fontPx * 1.35);
  canvas.width = Math.max(16, measuredW);
  canvas.height = Math.max(16, h);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.font = fontSpec;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, 2, Math.round(h / 2));

  const pxPerMm = 300 / 25.4;
  let wMm = canvas.width / pxPerMm;
  let hMm = canvas.height / pxPerMm;
  if (wMm > maxWidthMm) {
    const ratio = maxWidthMm / wMm;
    wMm = maxWidthMm;
    hMm *= ratio;
  }

  let drawX = xMm;
  if (align === 'center') drawX = xMm - wMm / 2;
  else if (align === 'right') drawX = xMm - wMm;

  const dataUrl = canvas.toDataURL('image/png');
  doc.addImage(dataUrl, 'PNG', drawX, baselineYMm - hMm * 0.72, wMm, hMm);
}

function drawSafeVectorOrRaster(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: {
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    fontSizePt?: number;
    maxWidthMm?: number;
  } = {}
) {
  const { align = 'left', bold = false, fontSizePt = 9.5, maxWidthMm = 95 } = options;
  if (/[^\x00-\x7F]/.test(text)) {
    drawRasterTextLine(doc, text, x, y, {
      fontPx: Math.round(fontSizePt * 3.1),
      bold,
      maxWidthMm,
      align,
    });
    return;
  }
  doc.setFont('courier', bold ? 'bold' : 'normal');
  doc.setFontSize(fontSizePt);
  doc.setTextColor(0, 0, 0);
  doc.text(text, x, y, { align });
}

/**
 * Generates an official A4 Portrait PDF Blob for the Name List (Chest No. wise) report,
 * matching the layout, columns, and styling of the A4 Name List preview.
 */
export async function generateNameListA4PdfBlob(params: {
  candidates: Candidate[];
  settings: SportsMeetSettings;
  clubs?: Club[];
}): Promise<Blob | null> {
  try {
    const { candidates, settings, clubs = [] } = params;
    const sortedCandidates = [...(candidates || [])].sort(
      (a, b) => (Number(a.chestNo) || 0) - (Number(b.chestNo) || 0)
    );

    const clubDisplayName = (settings.registeredClubName || settings.organizer || 'Sasthitala Agrani').trim();
    const meetTitle = (settings.ordinalTitle || '47th Annual Sports Meet 2027').trim();
    const logoSrc = settings.registeredClubLogo || clubs[0]?.logoUrl || '/icon.png';
    const currencySymbol = settings.currencySymbol || '₹';
    const logoDataUrl = await loadImageAsDataUrl(logoSrc);
    const rupeeDataUrl = currencySymbol.includes('₹') ? getRupeeGlyphDataUrl() : '';

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageW = 210;
    const pageH = 297;
    const marginX = 9;
    const marginTop = 10;
    const marginBottom = 11;
    const contentW = pageW - marginX * 2; // 192mm

    // Column layout matching A4 Name List: Sl., Ch#, Name (Club), Events, Amount
    const colSlCenter = marginX + 6;      // width ~12mm
    const colChCenter = marginX + 20;     // width ~16mm
    const colNameX = marginX + 30;        // width ~94mm
    const colNameMaxW = 91;
    const colEvtsX = marginX + 126;       // width ~30mm
    const colEvtsMaxW = 29;
    const colAmtX = marginX + 158;        // width ~34mm

    const drawPageHeader = (): number => {
      let y = marginTop;

      // Top bar: Logo + Club / Meet Title on Left | "Name list (Chest No. wise)" on Right
      const rightLabel = 'Name list (Chest No. wise)';
      doc.setFont('courier', 'bold');
      doc.setFontSize(10);
      const rightLabelW = doc.getTextWidth(rightLabel);

      let textStartX = marginX;
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', marginX, y - 1.2, 6.2, 6.2);
        textStartX = marginX + 8;
      }

      const leftMaxW = contentW - (textStartX - marginX) - rightLabelW - 4;
      const leftTitle = `${clubDisplayName} / ${meetTitle}`;
      let leftFontSize = 10;
      doc.setFont('courier', 'bold');
      doc.setFontSize(leftFontSize);
      while (doc.getTextWidth(leftTitle) > leftMaxW && leftFontSize > 7.2) {
        leftFontSize -= 0.4;
        doc.setFontSize(leftFontSize);
      }

      drawSafeVectorOrRaster(doc, leftTitle, textStartX, y + 3, {
        bold: true,
        fontSizePt: leftFontSize,
        maxWidthMm: Math.max(40, leftMaxW),
      });
      drawSafeVectorOrRaster(doc, rightLabel, pageW - marginX, y + 3, {
        align: 'right',
        bold: true,
        fontSizePt: 10,
        maxWidthMm: 60,
      });

      y += 9.5;

      // Table column headers
      doc.setFont('courier', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);
      doc.text('Sl.', colSlCenter, y, { align: 'center' });
      doc.text('Ch#', colChCenter, y, { align: 'center' });
      doc.text('Name (Club)', colNameX, y);
      doc.text('Events', colEvtsX, y);
      doc.text('Amount', colAmtX, y);

      y += 2;
      doc.setDrawColor(180, 185, 192);
      doc.setLineWidth(0.35);
      doc.line(marginX, y, pageW - marginX, y);

      return y + 4;
    };

    let y = drawPageHeader();
    const rowFontSize = 9;
    const lineStepMm = 3.8;

    for (let idx = 0; idx < sortedCandidates.length; idx++) {
      const cand = sortedCandidates[idx];
      const feeSt = (cand.feeStatus || '').toUpperCase();
      const isDue = feeSt.includes('DUE') || feeSt.includes('UNPAID');
      const eventsStr = (cand.selectedEvents || [])
        .map(Number)
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b)
        .join(',');

      const cleanName = (cand.name || '').trim().toUpperCase();
      const clubStr = cand.club ? ` (${cand.club.trim()})` : '';
      const fullNameClub = `${cleanName}${clubStr}`.trim();

      doc.setFont('courier', 'normal');
      doc.setFontSize(rowFontSize);

      const nameLines: string[] = doc.splitTextToSize(fullNameClub || '-', colNameMaxW);
      const evtsLines: string[] = doc.splitTextToSize(eventsStr || '—', colEvtsMaxW);
      const lineCount = Math.max(1, nameLines.length, evtsLines.length);
      const rowHeight = lineCount * lineStepMm + 2.2;

      if (y + rowHeight > pageH - marginBottom) {
        doc.addPage();
        y = drawPageHeader();
      }

      // Sl.
      doc.setFont('courier', 'normal');
      doc.setFontSize(rowFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(String(idx + 1), colSlCenter, y, { align: 'center' });

      // Ch# (bold)
      doc.setFont('courier', 'bold');
      doc.setFontSize(rowFontSize);
      doc.text(String(cand.chestNo ?? ''), colChCenter, y, { align: 'center' });

      // Name (Club)
      nameLines.forEach((line, lIdx) => {
        drawSafeVectorOrRaster(doc, line, colNameX, y + lIdx * lineStepMm, {
          bold: false,
          fontSizePt: rowFontSize,
          maxWidthMm: colNameMaxW,
        });
      });

      // Events
      doc.setFont('courier', 'normal');
      doc.setFontSize(rowFontSize);
      evtsLines.forEach((line, lIdx) => {
        doc.text(line, colEvtsX, y + lIdx * lineStepMm);
      });

      // Amount
      const amtFormatted = `${Number(cand.totalFees || 0).toFixed(2)} (${isDue ? 'D' : 'P'})`;
      if (currencySymbol.includes('₹') && rupeeDataUrl) {
        doc.addImage(rupeeDataUrl, 'PNG', colAmtX, y - 2.65, 2.8, 2.8);
        doc.text(` ${amtFormatted}`, colAmtX + 2.4, y);
      } else {
        const prefix = /[^\x00-\x7F]/.test(currencySymbol) ? 'Rs.' : currencySymbol;
        doc.text(`${prefix} ${amtFormatted}`, colAmtX, y);
      }

      const lineY = y + (lineCount - 1) * lineStepMm + 1.9;
      doc.setDrawColor(224, 228, 232);
      doc.setLineWidth(0.2);
      doc.line(marginX, lineY, pageW - marginX, lineY);

      y = lineY + 3.6;
    }

    // Add subtle page numbering footer on all pages
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${p} of ${totalPages}`, pageW - marginX, pageH - 5.5, { align: 'right' });
    }

    return doc.output('blob');
  } catch {
    return null;
  }
}

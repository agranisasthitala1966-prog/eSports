/**
 * Thermal Printable Monochrome Logo Converter
 * Converts RGB/RGBA club and brand logos into pure 1-bit high-contrast Black & White
 * bitmaps (Atkinson dithering) optimized for 203 DPI (58mm) thermal receipt printers.
 */

const monoDataUrlCache = new Map<string, string>();
const escPosRasterCache = new Map<string, number[]>();

/**
 * Loads an image safely with timeout fallback so printing never hangs.
 */
function loadHtmlImage(src: string, timeoutMs: number = 2500): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Image load timeout'));
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    };

    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to load image: ${src.slice(0, 60)}`));
      }
    };

    img.src = src;
  });
}

/**
 * Applies high-contrast normalization and 1-bit Atkinson dithering onto grayscale pixel data.
 * Transparent or near-white backgrounds remain pure white (0 bit / #FFFFFF).
 * Returns a Uint8Array where 1 = black dot (#000000) and 0 = white dot (#FFFFFF).
 */
function ditherTo1BitBitmap(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number = 135
): Uint8Array {
  const lum = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const a = rgba[idx + 3] / 255;

    // Composite over pure white background
    const cr = r * a + 255 * (1 - a);
    const cg = g * a + 255 * (1 - a);
    const cb = b * a + 255 * (1 - a);

    // Perceived luminance
    let gray = 0.299 * cr + 0.587 * cg + 0.114 * cb;

    // Keep clean white backgrounds crisp (prevent stray dots on white paper)
    if (gray >= 242) {
      gray = 255;
    } else {
      // Gentle thermal contrast boost around midpoint 128
      gray = Math.max(0, Math.min(255, (gray - 128) * 1.25 + 128));
    }
    lum[i] = gray;
  }

  const bits = new Uint8Array(width * height);

  // 1-bit Atkinson dithering (diffuses 6/8 of quantization error for crisp thermal edges)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldPixel = lum[idx];
      const newPixel = oldPixel < threshold ? 0 : 255;
      bits[idx] = newPixel === 0 ? 1 : 0; // 1 = black dot, 0 = white

      const err = (oldPixel - newPixel) / 8;
      if (err === 0) continue;

      if (x + 1 < width) lum[idx + 1] += err;
      if (x + 2 < width) lum[idx + 2] += err;
      if (y + 1 < height) {
        const row1 = (y + 1) * width;
        if (x - 1 >= 0) lum[row1 + x - 1] += err;
        lum[row1 + x] += err;
        if (x + 1 < width) lum[row1 + x + 1] += err;
      }
      if (y + 2 < height) {
        lum[(y + 2) * width + x] += err;
      }
    }
  }

  return bits;
}

/**
 * Converts any club or brand logo URL/DataURL into a pure 1-bit monochrome thermal printable PNG DataURL
 * for crisp thermal preview and browser thermal printing.
 */
export async function convertImageToThermalMonoDataUrl(
  src: string,
  sizePx: number = 96
): Promise<string> {
  if (!src) return '';
  const cacheKey = `${src}__${sizePx}`;
  const cached = monoDataUrlCache.get(cacheKey);
  if (cached) return cached;

  try {
    const img = await loadHtmlImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;

    // Pure white thermal paper base
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, sizePx, sizePx);

    // Draw image preserving aspect ratio centered inside box
    const nw = img.naturalWidth || img.width || sizePx;
    const nh = img.naturalHeight || img.height || sizePx;
    const scale = Math.min(sizePx / nw, sizePx / nh);
    const dw = Math.max(1, Math.round(nw * scale));
    const dh = Math.max(1, Math.round(nh * scale));
    const dx = Math.floor((sizePx - dw) / 2);
    const dy = Math.floor((sizePx - dh) / 2);

    ctx.drawImage(img, dx, dy, dw, dh);

    const imgData = ctx.getImageData(0, 0, sizePx, sizePx);
    const bits = ditherTo1BitBitmap(imgData.data, sizePx, sizePx);

    // Write back pure #000000 and #FFFFFF pixels
    for (let i = 0; i < sizePx * sizePx; i++) {
      const val = bits[i] === 1 ? 0 : 255;
      const idx = i * 4;
      imgData.data[idx] = val;
      imgData.data[idx + 1] = val;
      imgData.data[idx + 2] = val;
      imgData.data[idx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    const resultUrl = canvas.toDataURL('image/png');
    monoDataUrlCache.set(cacheKey, resultUrl);
    return resultUrl;
  } catch {
    return src;
  }
}

/**
 * Converts an image URL/DataURL into an ESC/POS GS v 0 1-bit monochrome raster command byte array,
 * centered horizontally across the 58mm thermal print head (384 dots).
 */
export async function imageToEscPosRaster(
  src: string,
  logoSizeDots: number = 56,
  paperDotsWide: number = 384
): Promise<number[]> {
  if (!src) return [];
  const cacheKey = `${src}__${logoSizeDots}x${paperDotsWide}`;
  const cached = escPosRasterCache.get(cacheKey);
  if (cached) return cached;

  try {
    const img = await loadHtmlImage(src);
    const width = paperDotsWide; // Must be divisible by 8 (384 / 8 = 48 bytes)
    const height = logoSizeDots;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    // Pure white thermal paper base
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Draw image preserving aspect ratio, centered horizontally on the 384-dot head
    const nw = img.naturalWidth || img.width || logoSizeDots;
    const nh = img.naturalHeight || img.height || logoSizeDots;
    const scale = Math.min(logoSizeDots / nw, logoSizeDots / nh);
    const dw = Math.max(1, Math.round(nw * scale));
    const dh = Math.max(1, Math.round(nh * scale));
    const dx = Math.floor((width - dw) / 2);
    const dy = Math.floor((height - dh) / 2);

    ctx.drawImage(img, dx, dy, dw, dh);

    const imgData = ctx.getImageData(0, 0, width, height);
    const bits = ditherTo1BitBitmap(imgData.data, width, height);

    // Trim top & bottom completely white rows to minimize BLE transfer size
    let minY = 0;
    let maxY = height - 1;
    while (minY < height) {
      let hasDot = false;
      for (let x = 0; x < width; x++) {
        if (bits[minY * width + x] === 1) {
          hasDot = true;
          break;
        }
      }
      if (hasDot) break;
      minY++;
    }
    while (maxY > minY) {
      let hasDot = false;
      for (let x = 0; x < width; x++) {
        if (bits[maxY * width + x] === 1) {
          hasDot = true;
          break;
        }
      }
      if (hasDot) break;
      maxY--;
    }

    const trimmedHeight = maxY >= minY ? maxY - minY + 1 : 0;
    if (trimmedHeight <= 0) return [];

    const bytesPerRow = Math.ceil(width / 8);
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = trimmedHeight & 0xff;
    const yH = (trimmedHeight >> 8) & 0xff;

    // GS v 0 m xL xH yL yH d1...dk (m = 0: normal 203 DPI mode)
    const cmd: number[] = [0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH];

    for (let y = minY; y <= maxY; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < width && bits[y * width + x] === 1) {
            byteVal |= 1 << (7 - bit);
          }
        }
        cmd.push(byteVal);
      }
    }

    escPosRasterCache.set(cacheKey, cmd);
    return cmd;
  } catch {
    return [];
  }
}

/**
 * Composites a monochrome 1-bit logo beside single-line text, horizontally centered
 * across the 58mm thermal print head (384 dots), matching the HTML print preview layout.
 */
export async function imageWithTextToEscPosRaster(
  src: string,
  text: string,
  logoSizeDots: number = 28,
  fontSizePx: number = 17,
  paperDotsWide: number = 384,
  gapDots: number = 6,
  bold: boolean = true
): Promise<number[]> {
  const cleanText = (text || '').trim();
  if (!cleanText && !src) return [];

  const cacheKey = `row__${src}__${cleanText}__${logoSizeDots}__${fontSizePx}__${paperDotsWide}__${bold}`;
  const cached = escPosRasterCache.get(cacheKey);
  if (cached) return cached;

  try {
    let img: HTMLImageElement | null = null;
    if (src) {
      try {
        img = await loadHtmlImage(src);
      } catch {
        img = null;
      }
    }

    const rowHeight = Math.max(logoSizeDots + 2, fontSizePx + 8);
    const canvas = document.createElement('canvas');
    canvas.width = paperDotsWide;
    canvas.height = rowHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    // Pure white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, paperDotsWide, rowHeight);

    const fontWeight = bold ? 'bold' : 'normal';
    let currentFontSize = fontSizePx;
    const activeLogoWidth = img ? logoSizeDots : 0;
    const activeGap = img && cleanText ? gapDots : 0;

    ctx.font = `${fontWeight} ${currentFontSize}px Consolas, "Courier New", monospace`;
    let textWidth = cleanText ? ctx.measureText(cleanText).width : 0;

    // Fit cleanly on a single line within 376 dots
    while (activeLogoWidth + activeGap + textWidth > paperDotsWide - 8 && currentFontSize > 12) {
      currentFontSize -= 1;
      ctx.font = `${fontWeight} ${currentFontSize}px Consolas, "Courier New", monospace`;
      textWidth = cleanText ? ctx.measureText(cleanText).width : 0;
    }

    const totalWidth = Math.min(paperDotsWide - 4, Math.ceil(activeLogoWidth + activeGap + textWidth));
    const startX = Math.max(2, Math.floor((paperDotsWide - totalWidth) / 2));

    const bits = new Uint8Array(paperDotsWide * rowHeight);

    // 1. Render logo with Atkinson 1-bit dithering
    if (img && activeLogoWidth > 0) {
      const logoCanvas = document.createElement('canvas');
      logoCanvas.width = logoSizeDots;
      logoCanvas.height = logoSizeDots;
      const lCtx = logoCanvas.getContext('2d');
      if (lCtx) {
        lCtx.fillStyle = '#FFFFFF';
        lCtx.fillRect(0, 0, logoSizeDots, logoSizeDots);

        const nw = img.naturalWidth || img.width || logoSizeDots;
        const nh = img.naturalHeight || img.height || logoSizeDots;
        const scale = Math.min(logoSizeDots / nw, logoSizeDots / nh);
        const dw = Math.max(1, Math.round(nw * scale));
        const dh = Math.max(1, Math.round(nh * scale));
        const dx = Math.floor((logoSizeDots - dw) / 2);
        const dy = Math.floor((logoSizeDots - dh) / 2);

        lCtx.drawImage(img, dx, dy, dw, dh);
        const lData = lCtx.getImageData(0, 0, logoSizeDots, logoSizeDots);
        const logoBits = ditherTo1BitBitmap(lData.data, logoSizeDots, logoSizeDots);

        const logoOffsetY = Math.floor((rowHeight - logoSizeDots) / 2);
        for (let ly = 0; ly < logoSizeDots; ly++) {
          const destY = logoOffsetY + ly;
          if (destY < 0 || destY >= rowHeight) continue;
          for (let lx = 0; lx < logoSizeDots; lx++) {
            const destX = startX + lx;
            if (destX >= 0 && destX < paperDotsWide && logoBits[ly * logoSizeDots + lx] === 1) {
              bits[destY * paperDotsWide + destX] = 1;
            }
          }
        }
      }
    }

    // 2. Render crisp single-line text onto separate clean canvas and threshold
    if (cleanText) {
      const textStartX = startX + activeLogoWidth + activeGap;
      ctx.fillStyle = '#000000';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = `${fontWeight} ${currentFontSize}px Consolas, "Courier New", monospace`;
      ctx.fillText(cleanText, textStartX, Math.round(rowHeight / 2));

      const tData = ctx.getImageData(0, 0, paperDotsWide, rowHeight).data;
      for (let y = 0; y < rowHeight; y++) {
        for (let x = textStartX; x < paperDotsWide; x++) {
          const pIdx = (y * paperDotsWide + x) * 4;
          const lum = 0.299 * tData[pIdx] + 0.587 * tData[pIdx + 1] + 0.114 * tData[pIdx + 2];
          if (lum < 175) {
            bits[y * paperDotsWide + x] = 1;
          }
        }
      }
    }

    // Trim completely white rows top & bottom
    let minY = 0;
    let maxY = rowHeight - 1;
    while (minY < rowHeight) {
      let hasDot = false;
      for (let x = 0; x < paperDotsWide; x++) {
        if (bits[minY * paperDotsWide + x] === 1) {
          hasDot = true;
          break;
        }
      }
      if (hasDot) break;
      minY++;
    }
    while (maxY > minY) {
      let hasDot = false;
      for (let x = 0; x < paperDotsWide; x++) {
        if (bits[maxY * paperDotsWide + x] === 1) {
          hasDot = true;
          break;
        }
      }
      if (hasDot) break;
      maxY--;
    }

    const trimmedHeight = maxY >= minY ? maxY - minY + 1 : 0;
    if (trimmedHeight <= 0) return [];

    const bytesPerRow = Math.ceil(paperDotsWide / 8);
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = trimmedHeight & 0xff;
    const yH = (trimmedHeight >> 8) & 0xff;

    const cmd: number[] = [0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH];
    for (let y = minY; y <= maxY; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < paperDotsWide && bits[y * paperDotsWide + x] === 1) {
            byteVal |= 1 << (7 - bit);
          }
        }
        cmd.push(byteVal);
      }
    }

    escPosRasterCache.set(cacheKey, cmd);
    return cmd;
  } catch {
    return [];
  }
}

const RECEIPT_COMPUTED_STYLE_PROPS: Array<keyof CSSStyleDeclaration> = [
  'boxSizing', 'display', 'position', 'top', 'right', 'bottom', 'left', 'cssFloat', 'clear',
  'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignContent', 'alignSelf',
  'gap', 'rowGap', 'columnGap', 'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderTopStyle', 'borderTopColor',
  'borderRightWidth', 'borderRightStyle', 'borderRightColor',
  'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor',
  'borderLeftWidth', 'borderLeftStyle', 'borderLeftColor',
  'borderRadius', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign', 'textTransform',
  'textDecoration', 'whiteSpace', 'overflow', 'overflowX', 'overflowY',
  'textOverflow', 'wordBreak', 'overflowWrap', 'verticalAlign',
  'color', 'backgroundColor', 'objectFit', 'imageRendering'
];

async function imageUrlToInlineDataUrl(src: string): Promise<string> {
  if (!src) return '';
  if (src.startsWith('data:')) return src;
  try {
    const img = await loadHtmlImage(src, 2000);
    const w = img.naturalWidth || img.width || 64;
    const h = img.naturalHeight || img.height || 64;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

async function cloneReceiptWithInlinedStyles(
  receiptElement: HTMLElement,
  printableWidthMm: number = 52
): Promise<{ cloneRoot: HTMLElement; srcW: number; srcH: number } | null> {
  if (!receiptElement || typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  let offscreenHost: HTMLDivElement | null = null;

  try {
    // If element is currently hidden (e.g. #thermal-test-print-receipt), render an offscreen clone so CSS computes
    const initialRect = receiptElement.getBoundingClientRect();
    const initialDisplay = window.getComputedStyle(receiptElement).display;
    let measureRoot = receiptElement;

    if (initialRect.width < 20 || initialDisplay === 'none') {
      offscreenHost = document.createElement('div');
      offscreenHost.style.position = 'fixed';
      offscreenHost.style.left = '-99999px';
      offscreenHost.style.top = '0';
      offscreenHost.style.width = `${printableWidthMm}mm`;
      offscreenHost.style.visibility = 'hidden';
      offscreenHost.style.pointerEvents = 'none';
      offscreenHost.style.zIndex = '-1';

      const tempClone = receiptElement.cloneNode(true) as HTMLElement;
      tempClone.classList.remove('hidden');
      tempClone.style.display = 'block';
      tempClone.style.width = `${printableWidthMm}mm`;
      tempClone.style.maxWidth = `${printableWidthMm}mm`;
      offscreenHost.appendChild(tempClone);
      document.body.appendChild(offscreenHost);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      measureRoot = tempClone;
    }

    const rect = measureRoot.getBoundingClientRect();
    const srcW = Math.ceil(rect.width);
    const srcH = Math.ceil(Math.max(rect.height, measureRoot.scrollHeight));
    if (srcW < 20 || srcH < 10) {
      return null;
    }

    const cloneRoot = measureRoot.cloneNode(true) as HTMLElement;

    // Walk source and cloned trees together to inline computed styles & data-URI images
    const imgTasks: Promise<void>[] = [];
    const syncNodePair = (srcEl: Element, dstEl: Element) => {
      if (dstEl.classList?.contains('protected-logo-overlay')) {
        dstEl.parentNode?.removeChild(dstEl);
        return;
      }

      const cs = window.getComputedStyle(srcEl);
      const dstHtml = dstEl as HTMLElement;

      if (dstHtml.style) {
        for (const prop of RECEIPT_COMPUTED_STYLE_PROPS) {
          const val = cs[prop];
          if (typeof val === 'string' && val !== '') {
            (dstHtml.style as any)[prop] = val;
          }
        }
        // Force pure crisp monochrome thermal typography matching preview (preserve Lucida Console, floats & line clamps)
        dstHtml.style.fontFamily = cs.fontFamily || 'Arial, "Segoe UI", Helvetica, sans-serif';
        if (cs.cssFloat && cs.cssFloat !== 'none') {
          dstHtml.style.cssFloat = cs.cssFloat;
        }
        if ((cs as any).webkitBoxOrient) {
          (dstHtml.style as any).webkitBoxOrient = (cs as any).webkitBoxOrient;
        }
        if ((cs as any).webkitLineClamp && (cs as any).webkitLineClamp !== 'none') {
          (dstHtml.style as any).webkitLineClamp = (cs as any).webkitLineClamp;
        }
        if ((cs as any).lineClamp && (cs as any).lineClamp !== 'none') {
          (dstHtml.style as any).lineClamp = (cs as any).lineClamp;
        }
        dstHtml.style.color = '#000000';
        dstHtml.style.textShadow = 'none';
        dstHtml.style.boxShadow = 'none';

        if (srcEl !== measureRoot) {
          const bg = cs.backgroundColor;
          if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
            dstHtml.style.backgroundColor = 'transparent';
          }
        }
      }

      if (srcEl.tagName === 'IMG' && dstEl.tagName === 'IMG') {
        const srcImg = srcEl as HTMLImageElement;
        const dstImg = dstEl as HTMLImageElement;
        const rawSrc = srcImg.currentSrc || srcImg.getAttribute('src') || srcImg.getAttribute('data-original-src') || '';
        if (rawSrc && !rawSrc.startsWith('data:')) {
          imgTasks.push(
            imageUrlToInlineDataUrl(rawSrc).then((dataUrl) => {
              if (dataUrl) {
                dstImg.setAttribute('src', dataUrl);
              } else {
                dstImg.removeAttribute('src');
              }
            })
          );
        } else if (rawSrc) {
          dstImg.setAttribute('src', rawSrc);
        }
      }

      const srcChildren = Array.from(srcEl.children);
      const dstChildren = Array.from(dstEl.children);
      for (let i = 0; i < srcChildren.length && i < dstChildren.length; i++) {
        syncNodePair(srcChildren[i], dstChildren[i]);
      }
    };

    syncNodePair(measureRoot, cloneRoot);
    await Promise.all(imgTasks);

    // Normalize clone root container so it renders cleanly with full white paper background
    cloneRoot.style.position = 'static';
    cloneRoot.style.left = 'auto';
    cloneRoot.style.top = 'auto';
    cloneRoot.style.right = 'auto';
    cloneRoot.style.bottom = 'auto';
    cloneRoot.style.opacity = '1';
    cloneRoot.style.visibility = 'visible';
    cloneRoot.style.width = `${srcW}px`;
    cloneRoot.style.maxWidth = `${srcW}px`;
    cloneRoot.style.margin = '0';
    cloneRoot.style.backgroundColor = '#ffffff';
    cloneRoot.style.borderRadius = '0';
    cloneRoot.style.boxShadow = 'none';
    cloneRoot.style.overflow = 'visible';

    return { cloneRoot, srcW, srcH };
  } catch {
    return null;
  } finally {
    if (offscreenHost && offscreenHost.parentNode) {
      offscreenHost.parentNode.removeChild(offscreenHost);
    }
  }
}

async function renderReceiptDomToCanvas(
  receiptElement: HTMLElement,
  options: {
    targetWidthPx: number;
    paperWidthPx?: number;
    centerHorizontally?: boolean;
    printableWidthMm?: number;
  }
): Promise<HTMLCanvasElement | null> {
  const {
    targetWidthPx,
    paperWidthPx = targetWidthPx,
    centerHorizontally = false,
    printableWidthMm = 52,
  } = options;

  try {
    const cloned = await cloneReceiptWithInlinedStyles(receiptElement, printableWidthMm);
    if (!cloned) return null;
    const { cloneRoot, srcW, srcH } = cloned;

    const serializedHtml = new XMLSerializer().serializeToString(cloneRoot);
    const svgMarkup =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${srcW}" height="${srcH}" viewBox="0 0 ${srcW} ${srcH}">` +
      `<foreignObject x="0" y="0" width="${srcW}" height="${srcH}">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;width:${srcW}px;height:${srcH}px;background:#ffffff;color:#000000;font-family:Arial,'Segoe UI',Helvetica,sans-serif;overflow:visible;">` +
      `<style>*{box-sizing:border-box;}img{image-rendering:pixelated;}.thermal-ordinal-title{font-weight:400!important;}.thermal-record-clamp-1{display:block!important;width:100%!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}.thermal-record-clamp-2{display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;line-clamp:2!important;overflow:hidden!important;text-overflow:ellipsis!important;word-break:break-word!important;overflow-wrap:anywhere!important;white-space:normal!important;}</style>` +
      serializedHtml +
      `</div>` +
      `</foreignObject>` +
      `</svg>`;

    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    const svgImg = await loadHtmlImage(svgDataUrl, 4500);

    let effectiveScale = targetWidthPx / srcW;
    // Clamp total pixel area to avoid hitting mobile browser canvas limits on very long lists
    const projectedW = Math.max(1, Math.round(paperWidthPx));
    const projectedH = Math.max(1, Math.ceil(srcH * effectiveScale));
    const maxPixels = 12_000_000;
    if (projectedW * projectedH > maxPixels) {
      const shrink = Math.sqrt(maxPixels / (projectedW * projectedH));
      effectiveScale *= shrink;
    }

    const drawnW = Math.max(1, Math.round(srcW * effectiveScale));
    const canvasW = centerHorizontally ? paperWidthPx : drawnW;
    const canvasH = Math.max(1, Math.ceil(srcH * effectiveScale));
    const offsetX = centerHorizontally ? Math.max(0, Math.floor((canvasW - drawnW) / 2)) : 0;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(svgImg, offsetX, 0, drawnW, canvasH);

    return canvas;
  } catch {
    return null;
  }
}

/**
 * Exports the complete thermal receipt DOM element (including its full white paper sheet,
 * margins, inlined computed styles, and base64 images) into a standalone 100% offline HTML Blob.
 */
export async function receiptDomToOfflineHtmlBlob(
  receiptElement: HTMLElement,
  options: {
    title?: string;
    printableWidthMm?: number;
  } = {}
): Promise<Blob | null> {
  const { title = 'Thermal Report', printableWidthMm = 52 } = options;

  try {
    const cloned = await cloneReceiptWithInlinedStyles(receiptElement, printableWidthMm);
    if (!cloned) return null;
    const { cloneRoot, srcW } = cloned;

    cloneRoot.style.width = `${srcW}px`;
    cloneRoot.style.maxWidth = '100%';
    cloneRoot.style.height = 'auto';
    cloneRoot.style.margin = '0 auto';
    cloneRoot.style.backgroundColor = '#ffffff';
    cloneRoot.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.16)';
    cloneRoot.setAttribute('data-thermal-sheet', 'true');

    const safeTitle = title
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const sheetHtml = cloneRoot.outerHTML;
    const offlineHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: #e2e8f0;
      color: #000000;
      font-family: Arial, "Segoe UI", Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 16px 8px;
    }
    img { image-rendering: pixelated; }
    .thermal-ordinal-title { font-weight: 400 !important; }
    .thermal-jump-record.float-right { line-height: 1 !important; }
    .thermal-chest-no { font-family: "Lucida Console", Monaco, monospace !important; font-weight: 400 !important; }
    .thermal-jump-record { font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue Condensed Bold", "Liberation Sans Narrow", "Nimbus Sans Narrow", sans-serif !important; font-stretch: condensed !important; }
    .thermal-record-clamp-1 {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    .thermal-record-clamp-2 {
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
    @media print {
      @page { size: auto; margin: 0; }
      html, body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      [data-thermal-sheet="true"] {
        box-shadow: none !important;
        margin: 0 auto !important;
      }
    }
  </style>
</head>
<body>
  ${sheetHtml}
</body>
</html>`;

    return new Blob([offlineHtml], { type: 'text/html;charset=utf-8' });
  } catch {
    return null;
  }
}

/**
 * Renders the complete thermal receipt DOM element (including its full white page and margins)
 * into a crisp high-resolution PNG Blob for image sharing (e.g. WhatsApp / Web Share).
 */
export async function receiptDomToPngBlob(
  receiptElement: HTMLElement,
  printableWidthMm: number = 52
): Promise<Blob | null> {
  try {
    const rect = receiptElement.getBoundingClientRect();
    const srcW = Math.max(180, Math.ceil(rect.width) || Math.round((printableWidthMm * 96) / 25.4));
    const targetWidthPx = Math.max(580, Math.min(800, Math.round(srcW * 3)));

    const canvas = await renderReceiptDomToCanvas(receiptElement, {
      targetWidthPx,
      printableWidthMm,
      centerHorizontally: false,
    });
    if (!canvas) return null;

    return await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/**
 * Renders the live `.receipt` DOM preview element directly at 203 DPI (384 dots wide)
 * into chunked 1-bit ESC/POS `GS v 0` raster commands so Bluetooth thermal output
 * matches the Print Preview font, font sizes, column widths, borders, and formatting 1:1.
 * Returns null if SVG foreignObject rasterization is unavailable or blank (allowing safe fallback).
 */
export async function receiptDomToEscPosRaster(
  receiptElement: HTMLElement,
  printableWidthMm: number = 52,
  paperDotsWide: number = 384
): Promise<number[] | null> {
  if (!receiptElement || typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  try {
    // Map configured printableWidthMm (38-54mm) onto 384-dot thermal print head (52mm max printable = 384 dots)
    const targetDots = Math.min(paperDotsWide, Math.max(240, Math.round((printableWidthMm / 52) * paperDotsWide)));
    const canvas = await renderReceiptDomToCanvas(receiptElement, {
      targetWidthPx: targetDots,
      paperWidthPx: paperDotsWide,
      centerHorizontally: true,
      printableWidthMm,
    });
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const destH = canvas.height;

    // Extract pixels (throws SecurityError if canvas was tainted)
    const rgba = ctx.getImageData(0, 0, paperDotsWide, destH).data;
    const bits = new Uint8Array(paperDotsWide * destH);
    let blackDotCount = 0;

    for (let i = 0; i < paperDotsWide * destH; i++) {
      const p = i * 4;
      const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
      if (lum < 185) {
        bits[i] = 1;
        blackDotCount++;
      }
    }

    if (blackDotCount < 20) {
      return null;
    }

    // Trim trailing/leading pure-white blank rows (topMargin & feedBeforeCut are applied by ESC/POS feed commands)
    let minY = 0;
    let maxY = destH - 1;
    while (minY < destH) {
      let hasDot = false;
      for (let x = 0; x < paperDotsWide; x++) {
        if (bits[minY * paperDotsWide + x] === 1) {
          hasDot = true;
          break;
        }
      }
      if (hasDot) break;
      minY++;
    }
    while (maxY > minY) {
      let hasDot = false;
      for (let x = 0; x < paperDotsWide; x++) {
        if (bits[maxY * paperDotsWide + x] === 1) {
          hasDot = true;
          break;
        }
      }
      if (hasDot) break;
      maxY--;
    }

    if (maxY < minY) return null;

    // Stream fine-grained 16-row GS v 0 raster strips (~776 bytes each) so printer SRAM never overflows
    // and the print head prints continuously instead of stalling for seconds between large blocks.
    const bytesPerRow = Math.ceil(paperDotsWide / 8); // 48 bytes
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const STRIP_ROWS = 16;
    const cmd: number[] = [];

    for (let stripStart = minY; stripStart <= maxY; stripStart += STRIP_ROWS) {
      const stripEnd = Math.min(maxY, stripStart + STRIP_ROWS - 1);
      const stripHeight = stripEnd - stripStart + 1;
      const yL = stripHeight & 0xff;
      const yH = (stripHeight >> 8) & 0xff;

      // GS v 0 m xL xH yL yH
      cmd.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

      for (let y = stripStart; y <= stripEnd; y++) {
        for (let bx = 0; bx < bytesPerRow; bx++) {
          let byteVal = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = bx * 8 + bit;
            if (x < paperDotsWide && bits[y * paperDotsWide + x] === 1) {
              byteVal |= 1 << (7 - bit);
            }
          }
          cmd.push(byteVal);
        }
      }
    }

    return cmd;
  } catch {
    return null;
  }
}



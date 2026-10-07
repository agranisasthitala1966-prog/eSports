/**
 * Utility to resize and compress uploaded club logo to strictly under/within 50 KB.
 */
export async function resizeImageToMax50KB(file: File): Promise<{ dataUrl: string; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file (PNG, JPG, SVG, WebP)'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        // Initial bounding box (320x320 is crisp for logos and compact)
        let width = img.width;
        let height = img.height;
        const maxInitialDim = 320;

        if (width > maxInitialDim || height > maxInitialDim) {
          if (width > height) {
            height = Math.round((height * maxInitialDim) / width);
            width = maxInitialDim;
          } else {
            width = Math.round((width * maxInitialDim) / height);
            height = maxInitialDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(width, 1);
        canvas.height = Math.max(height, 1);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }

        // Preserve transparent PNG if transparent, or render with high quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const MAX_BYTES = 50 * 1024; // 50 KB = 51,200 bytes

        const getByteSize = (dataUrl: string): number => {
          const base64Index = dataUrl.indexOf(',');
          const base64Str = base64Index !== -1 ? dataUrl.substring(base64Index + 1) : dataUrl;
          return Math.round((base64Str.length * 3) / 4);
        };

        // Try PNG first if file was PNG and small
        let mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        let quality = 0.9;
        let resultDataUrl = canvas.toDataURL(mimeType, quality);

        // If PNG exceeds 50 KB, switch to JPEG for better compression
        if (getByteSize(resultDataUrl) > MAX_BYTES && mimeType === 'image/png') {
          // Fill background white for JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          mimeType = 'image/jpeg';
          resultDataUrl = canvas.toDataURL(mimeType, quality);
        }

        // Iteratively scale down or reduce quality until strictly <= 50 KB
        let iterations = 0;
        while (getByteSize(resultDataUrl) > MAX_BYTES && iterations < 20) {
          iterations++;
          if (quality > 0.45) {
            quality -= 0.1;
          } else {
            width = Math.round(width * 0.85);
            height = Math.round(height * 0.85);
            canvas.width = Math.max(width, 1);
            canvas.height = Math.max(height, 1);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
          }
          resultDataUrl = canvas.toDataURL(mimeType, quality);
        }

        const finalBytes = getByteSize(resultDataUrl);
        const finalKB = Math.round((finalBytes / 1024) * 10) / 10;
        resolve({ dataUrl: resultDataUrl, sizeKB: finalKB });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

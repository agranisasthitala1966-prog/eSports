import React, { useEffect, useState } from 'react';
import { convertImageToThermalMonoDataUrl } from '../utils/thermalLogo';

interface ThermalLogoProps {
  src: string;
  alt: string;
  className?: string;
  rasterSizePx?: number;
}

/**
 * Renders any club or brand logo in crisp 1-bit pure Black & White thermal printable format
 * (Atkinson monochrome dithering) so thermal previews and browser prints match 203 DPI thermal output.
 */
export const ThermalLogo: React.FC<ThermalLogoProps> = ({
  src,
  alt,
  className = '',
  rasterSizePx = 96,
}) => {
  const [monoSrc, setMonoSrc] = useState<string>(src);

  useEffect(() => {
    let active = true;
    if (!src) {
      setMonoSrc('');
      return;
    }

    convertImageToThermalMonoDataUrl(src, rasterSizePx).then((converted) => {
      if (active && converted) {
        setMonoSrc(converted);
      }
    });

    return () => {
      active = false;
    };
  }, [src, rasterSizePx]);

  return (
    <img
      src={monoSrc || src}
      data-original-src={src}
      alt={alt}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

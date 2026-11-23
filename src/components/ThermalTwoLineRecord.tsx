import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';

interface ThermalTwoLineRecordProps {
  text: string;
  rightText?: string;
  rightClassName?: string;
  textClassName?: string;
  className?: string;
  deps?: unknown[];
}

/**
 * Renders athlete/detail text capped at maximum 2 visual lines, truncating overflow with "...".
 * When `rightText` (e.g. broad jump distance or event list) is present, it floats right on line 1
 * while allowing line 2 to expand all the way to the right margin underneath `rightText`.
 */
export const ThermalTwoLineRecord: React.FC<ThermalTwoLineRecordProps> = ({
  text,
  rightText,
  rightClassName = '',
  textClassName = '',
  className = '',
  deps = [],
}) => {
  const cleanText = (text || '').replace(/\s+/g, ' ').trim();
  const cleanRight = (rightText || '').trim();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [displayText, setDisplayText] = useState<string>(cleanText);
  const [measureTick, setMeasureTick] = useState<number>(0);

  const countVisualLines = useCallback((): number => {
    const textEl = textRef.current;
    const rightEl = rightRef.current;
    if (!textEl) return 1;

    const range = document.createRange();
    range.selectNodeContents(textEl);
    const textRects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 0.5 && r.height > 0.5
    );

    const lineTops: number[] = [];
    if (rightEl) {
      const rr = rightEl.getBoundingClientRect();
      if (rr.width > 0.5 && rr.height > 0.5) {
        lineTops.push(rr.top);
      }
    }

    for (const r of textRects) {
      if (!lineTops.some((t) => Math.abs(t - r.top) <= 5)) {
        lineTops.push(r.top);
      }
    }

    return Math.max(1, lineTops.length);
  }, []);

  useLayoutEffect(() => {
    if (!cleanRight) {
      if (displayText !== cleanText) setDisplayText(cleanText);
      return;
    }

    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    if (!cleanText) {
      if (displayText !== '') setDisplayText('');
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width < 10) {
      if (displayText !== cleanText) setDisplayText(cleanText);
      return;
    }

    textEl.textContent = cleanText;
    if (countVisualLines() <= 2) {
      if (displayText !== cleanText) setDisplayText(cleanText);
      return;
    }

    let low = 1;
    let high = cleanText.length - 1;
    let best = cleanText.slice(0, 1) + '...';

    while (low <= high) {
      const mid = (low + high) >> 1;
      const candidate = cleanText.slice(0, mid).trimEnd() + '...';
      textEl.textContent = candidate;
      if (countVisualLines() <= 2) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    textEl.textContent = best;
    if (displayText !== best) {
      setDisplayText(best);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanText, cleanRight, measureTick, countVisualLines, ...deps]);

  useLayoutEffect(() => {
    if (!cleanRight || !containerRef.current || typeof ResizeObserver === 'undefined') return;
    let lastW = Math.round(containerRef.current.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextW = Math.round(entry.contentRect.width);
      if (nextW > 10 && Math.abs(nextW - lastW) > 1) {
        lastW = nextW;
        setMeasureTick((t) => t + 1);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [cleanRight]);

  if (!cleanRight) {
    return (
      <div className={`font-normal uppercase thermal-record-clamp-2 thermal-athlete-name ${textClassName}`}>
        {cleanText}
      </div>
    );
  }

  const isJumpRight = rightClassName.includes('thermal-jump-record');

  return (
    <div
      ref={containerRef}
      className={`block w-full overflow-hidden leading-tight ${className}`}
    >
      <span
        ref={rightRef}
        className={`float-right text-right pl-1.5 ${isJumpRight ? 'leading-none' : 'leading-tight'} ${rightClassName}`}
        style={{ float: 'right', ...(isJumpRight ? { lineHeight: 1 } : {}) }}
      >
        {cleanRight}
      </span>
      <span
        ref={textRef}
        className={`uppercase font-normal break-words thermal-athlete-name ${textClassName}`}
        style={{ overflowWrap: 'anywhere' }}
      >
        {displayText}
      </span>
    </div>
  );
};

import React from 'react';

/**
 * Clean Official WhatsApp Vector Icon Component
 */
export const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg 
    viewBox="0 0 24 24" 
    width="24" 
    height="24" 
    stroke="currentColor" 
    fill="currentColor" 
    strokeWidth="0" 
    className={className}
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
);

const centerText = (text: string, width = 32): string => {
  const trimmed = text.trim();
  if (trimmed.length >= width) return trimmed;
  const totalPad = width - trimmed.length;
  const leftPad = Math.floor(totalPad / 2);
  const rightPad = totalPad - leftPad;
  return ' '.repeat(leftPad) + trimmed + ' '.repeat(rightPad);
};

const getTimestamp = (): string => {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatEventTitle = (evt: { Evt_No: string | number; Evt_Name: string; Height?: string; Gender?: string }): string => {
  const cleanHeight = (evt.Height || '').trim().toUpperCase();
  const hasHeight = cleanHeight && cleanHeight !== 'ALL';
  const heightStr = hasHeight
    ? evt.Height!.replace(/[`']/g, "'").replace(/''|``|"/g, "''")
    : '';
  const g = (evt.Gender || '').trim().toUpperCase();
  const genderAbbr = g.startsWith('BOY') || g === 'B'
    ? 'B'
    : g.startsWith('GIRL') || g === 'G'
    ? 'G'
    : g.startsWith('CHILD') || g === 'C'
    ? 'C'
    : (g || 'ALL');

  if (hasHeight) {
    return `Evt ${evt.Evt_No}: ${evt.Evt_Name.toUpperCase()} (${heightStr} • ${genderAbbr})`;
  } else {
    return `Evt ${evt.Evt_No}: ${evt.Evt_Name.toUpperCase()} : ${genderAbbr}`;
  }
};

/**
 * Formats Hit List thermal receipt data for WhatsApp with name as (Event: <event_no> Hit)
 */
export const generateHitListWhatsAppText = (
  event: { Evt_No: string | number; Evt_Name: string; Height?: string; Gender?: string },
  candidates: Array<{ chestNo: string | number; name: string; club?: string }>,
  settings?: { registeredClubName?: string; organizer?: string; ordinalTitle?: string }
): string => {
  const org = (settings?.registeredClubName || settings?.organizer || 'Agrani Sasthitala Sangha').toUpperCase();
  const meet = settings?.ordinalTitle || '47th Annual Sports Meet 2027';
  const evtTitle = formatEventTitle(event);
  const divider = '--------------------------------';
  const time = getTimestamp();

  const lines: string[] = [];
  lines.push(`(Event: ${event.Evt_No} Hit)`);
  lines.push('```');
  lines.push(divider);
  lines.push(centerText(org, 32));
  lines.push(centerText(meet, 32));
  lines.push(divider);
  lines.push(centerText('HIT LIST', 32));
  lines.push(centerText(evtTitle, 32));
  lines.push(divider);
  lines.push('SL  CH   ATHLETE (CLUB)');
  lines.push(divider);

  candidates.forEach((c, idx) => {
    const sl = String(idx + 1).padEnd(4, ' ');
    const ch = String(c.chestNo).padEnd(5, ' ');
    const club = c.club ? ` (${c.club})` : '';
    const athlete = `${c.name}${club}`.toUpperCase();
    const row = `${sl}${ch}${athlete}`;
    lines.push(row.length > 32 ? row.slice(0, 29).trimEnd() + '...' : row);
  });

  lines.push(divider);
  lines.push(centerText('eSports-Sport Management', 32));
  lines.push(centerText(time, 32));
  lines.push(divider);
  lines.push('```');

  return lines.join('\n');
};

/**
 * Formats Final List thermal receipt data for WhatsApp with name as (Event: <event_no> Final)
 */
export const generateFinalListWhatsAppText = (
  event: { Evt_No: string | number; Evt_Name: string; Height?: string; Gender?: string },
  finalists: Array<{ chestNo: string | number; candidateName: string; club?: string }>,
  settings?: { registeredClubName?: string; organizer?: string; ordinalTitle?: string }
): string => {
  const org = (settings?.registeredClubName || settings?.organizer || 'Agrani Sasthitala Sangha').toUpperCase();
  const meet = settings?.ordinalTitle || '47th Annual Sports Meet 2027';
  const evtTitle = formatEventTitle(event);
  const divider = '--------------------------------';
  const time = getTimestamp();

  const lines: string[] = [];
  lines.push(`(Event: ${event.Evt_No} Final)`);
  lines.push('```');
  lines.push(divider);
  lines.push(centerText(org, 32));
  lines.push(centerText(meet, 32));
  lines.push(divider);
  lines.push(centerText('FINAL LIST', 32));
  lines.push(centerText(evtTitle, 32));
  lines.push(divider);
  lines.push('SL  CH   ATHLETE (CLUB)');
  lines.push(divider);

  finalists.forEach((f, idx) => {
    const sl = String(idx + 1).padEnd(4, ' ');
    const ch = String(f.chestNo).padEnd(5, ' ');
    const club = f.club ? ` (${f.club})` : '';
    const athlete = `${f.candidateName}${club}`.toUpperCase();
    const row = `${sl}${ch}${athlete}`;
    lines.push(row.length > 32 ? row.slice(0, 29).trimEnd() + '...' : row);
  });

  lines.push(divider);
  lines.push(centerText('eSports-Sport Management', 32));
  lines.push(centerText(time, 32));
  lines.push(divider);
  lines.push('```');

  return lines.join('\n');
};

/**
 * Formats Ranking List thermal receipt data for WhatsApp with name as (Event: <event_no> Rank)
 */
export const generateRankListWhatsAppText = (
  event: { Evt_No: string | number; Evt_Name: string; Height?: string; Gender?: string },
  winners: Array<{ chestNo: string | number; candidateName: string; club?: string; position?: number; jumpRecord?: string; resultValue?: string }>,
  settings?: { registeredClubName?: string; organizer?: string; ordinalTitle?: string }
): string => {
  const org = (settings?.registeredClubName || settings?.organizer || 'Agrani Sasthitala Sangha').toUpperCase();
  const meet = settings?.ordinalTitle || '47th Annual Sports Meet 2027';
  const evtTitle = formatEventTitle(event);
  const divider = '--------------------------------';
  const time = getTimestamp();
  const isBroadJump = (event.Evt_Name || '').toUpperCase().includes('BROAD JUMP');

  const lines: string[] = [];
  lines.push(`(Event: ${event.Evt_No} Rank)`);
  lines.push('```');
  lines.push(divider);
  lines.push(centerText(org, 32));
  lines.push(centerText(meet, 32));
  lines.push(divider);
  lines.push(centerText('RANKING LIST', 32));
  lines.push(centerText(evtTitle, 32));
  lines.push(divider);

  if (isBroadJump) {
    lines.push('RANK CH   ATHLETE (CLUB)   JUMP');
  } else {
    lines.push('RANK CH   ATHLETE (CLUB)');
  }
  lines.push(divider);

  if (winners.length === 0) {
    lines.push(centerText('No rankings declared yet.', 32));
  } else {
    winners.forEach((w, idx) => {
      const p = (w.position && w.position > 0) ? w.position : (idx + 1);
      const rankLabel = (p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`).padEnd(5, ' ');
      const ch = String(w.chestNo).padEnd(5, ' ');
      const isSelf = (w.club || '').trim().toUpperCase() === 'SELF';
      const clubStr = (!isSelf && w.club) ? w.club.trim().toUpperCase() : '';
      const athlete = `${w.candidateName}${clubStr ? ` (${clubStr})` : ''}`.toUpperCase();
      if (isBroadJump) {
        const jump = w.jumpRecord || w.resultValue || '—';
        lines.push(`${rankLabel}${ch}${athlete}  ${jump}`);
      } else {
        lines.push(`${rankLabel}${ch}${athlete}`);
      }
    });
  }

  lines.push(divider);
  lines.push(centerText('eSports-Sport Management', 32));
  lines.push(centerText(time, 32));
  lines.push(divider);
  lines.push('```');

  return lines.join('\n');
};

/**
 * Shares formatted thermal report text to WhatsApp
 */
export const openWhatsAppWithText = (text: string): { success: boolean; message: string } => {
  try {
    // Copy to clipboard as safe backup so user has it immediately
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    const encoded = encodeURIComponent(text);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encoded}`;

    // Create and trigger link click without window.open
    const link = document.createElement('a');
    link.href = whatsappUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return {
      success: true,
      message: 'Opening WhatsApp... Thermal report copied to clipboard!'
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Could not open WhatsApp link automatically. Data is copied to clipboard.'
    };
  }
};

/**
 * Compact WhatsApp formatter for Hit List, Final List, and Ranking List on Reports page:
 * Line 1: Report Title
 * Line 2: Event Details
 * Line 3: Dashed line matching WhatsApp width
 * Line 4+: Two columns "SL" and "CH-NO" with data aligned identically under columns.
 * No other additional text is sent.
 */
export const generateCompactEventWhatsAppText = (
  reportTitle: 'HIT LIST' | 'FINAL LIST' | 'RANKING LIST',
  event: { Evt_No: string | number; Evt_Name: string; Height?: string; Gender?: string },
  rows: Array<{ sl: number | string; chestNo: number | string }>
): string => {
  const divider = '--------------------------------';
  const cleanHeight = (event.Height || '').trim().toUpperCase();
  const hasHeight = cleanHeight && cleanHeight !== 'ALL';
  const heightStr = hasHeight
    ? event.Height!.replace(/[`']/g, "'").replace(/''|``|"/g, "''")
    : '';
  const g = (event.Gender || '').trim().toUpperCase();
  const genderAbbr = g.startsWith('BOY') || g === 'B'
    ? 'B'
    : g.startsWith('GIRL') || g === 'G'
    ? 'G'
    : g.startsWith('CHILD') || g === 'C'
    ? 'C'
    : (g || 'ALL');

  const evtDetails = hasHeight
    ? `EVT ${event.Evt_No}: ${event.Evt_Name.toUpperCase()} (${heightStr} • ${genderAbbr})`
    : `EVT ${event.Evt_No}: ${event.Evt_Name.toUpperCase()} : ${genderAbbr}`;

  const lines: string[] = [];
  lines.push('```');
  lines.push(reportTitle);
  lines.push(evtDetails);
  lines.push(divider);
  lines.push(`${'SL'.padEnd(6, ' ')}CH-NO`);

  rows.forEach((row) => {
    const slCol = String(row.sl).trim().padEnd(6, ' ');
    const chCol = String(row.chestNo).trim();
    lines.push(`${slCol}${chCol}`);
  });

  lines.push('```');
  return lines.join('\n');
};

/**
 * Formats Club Wise thermal list for WhatsApp sharing from Reports page
 */
export const generateClubWiseWhatsAppText = (
  clubName: string,
  athletes: Array<{ chestNo: string | number; name: string; selectedEvents?: Array<number | string> }>
): string => {
  const divider = '--------------------------------';
  const lines: string[] = [];
  lines.push('```');
  lines.push(`CLUB: [${clubName.toUpperCase()}]`);
  lines.push(divider);
  lines.push('CH   NAME                 EVTS');
  lines.push(divider);
  athletes.forEach((c) => {
    const ch = String(c.chestNo).padEnd(5, ' ');
    const evts = (c.selectedEvents || []).map(Number).sort((a, b) => a - b).join(',');
    const maxName = Math.max(8, 32 - 5 - 1 - evts.length);
    const cleanName = c.name.toUpperCase();
    const nm = (cleanName.length > maxName ? cleanName.slice(0, Math.max(1, maxName - 3)).trimEnd() + '...' : cleanName).padEnd(maxName + 1, ' ');
    lines.push(`${ch}${nm}${evts}`);
  });
  lines.push('```');
  return lines.join('\n');
};

/**
 * Formats Top 3 Clubs championship thermal list for WhatsApp sharing from Reports page
 */
export const generateChampionshipWhatsAppText = (
  top3Clubs: Array<{ name: string; gold: number; silver: number; bronze: number; points: number }>
): string => {
  const divider = '--------------------------------';
  const lines: string[] = [];
  lines.push('```');
  lines.push('TOP 3 CLUBS');
  lines.push(divider);
  lines.push('RK  CLUB            G  S  B   T');
  lines.push(divider);
  top3Clubs.forEach((team, idx) => {
    const rk = (idx === 0 ? '1ST' : idx === 1 ? '2ND' : '3RD').padEnd(4, ' ');
    const nm = team.name.toUpperCase();
    const clubCol = (nm.length > 15 ? nm.slice(0, 12).trimEnd() + '...' : nm).padEnd(16, ' ');
    const g = String(team.gold).padStart(1, ' ').padEnd(3, ' ');
    const s = String(team.silver).padStart(1, ' ').padEnd(3, ' ');
    const b = String(team.bronze).padStart(1, ' ').padEnd(3, ' ');
    const t = String(team.points).padStart(2, ' ');
    lines.push(`${rk}${clubCol}${g}${s}${b}${t}`);
  });
  lines.push('```');
  return lines.join('\n');
};

/**
 * Shares a PNG image Blob via Web Share API (opening WhatsApp on mobile),
 * falling back to downloading the PNG file and copying to clipboard on desktop.
 */
export const shareThermalImageBlob = async (
  blob: Blob,
  fileName: string = 'Name_List_Thermal.png'
): Promise<{ success: boolean; cancelled?: boolean; message: string }> => {
  try {
    const file = new File([blob], fileName, { type: 'image/png' });
    const canShareFiles =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      (!navigator.canShare || navigator.canShare({ files: [file] }));

    if (canShareFiles) {
      try {
        await navigator.share({
          files: [file],
          title: 'Name List Thermal Report',
        });
        return {
          success: true,
          message: 'Name List image shared successfully!',
        };
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') {
          return {
            success: false,
            cancelled: true,
            message: 'Share cancelled.',
          };
        }
        // Fall through to download/clipboard fallback if share failed (e.g. iframe policy)
      }
    }

    // Fallback: Copy image to clipboard (if supported) + trigger PNG download
    let copiedToClipboard = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copiedToClipboard = true;
      }
    } catch {
      copiedToClipboard = false;
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    return {
      success: true,
      message: copiedToClipboard
        ? 'Name List image downloaded & copied to clipboard — attach or paste in WhatsApp!'
        : 'Name List image downloaded — attach the PNG in WhatsApp!',
    };
  } catch {
    return {
      success: false,
      message: 'Unable to export Name List image.',
    };
  }
};

/**
 * Shares an offline HTML report Blob via Web Share API (opening WhatsApp/share sheet on mobile),
 * falling back cleanly to downloading the `.html` file on desktop or restricted frames.
 */
export const shareThermalHtmlBlob = async (
  blob: Blob,
  fileName: string = 'Thermal_Report.html',
  title: string = 'Thermal Report'
): Promise<{ success: boolean; cancelled?: boolean; message: string }> => {
  try {
    const file = new File([blob], fileName, { type: 'text/html' });
    const canShareFiles =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      (!navigator.canShare || navigator.canShare({ files: [file] }));

    if (canShareFiles) {
      try {
        await navigator.share({
          files: [file],
          title,
        });
        return {
          success: true,
          message: `${title} shared as offline HTML!`,
        };
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') {
          return {
            success: false,
            cancelled: true,
            message: 'Share cancelled.',
          };
        }
        // Fall through to clean file download if Web Share rejects text/html or iframe blocks it
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    return {
      success: true,
      message: `Offline HTML saved (${fileName}) — attach and share in WhatsApp!`,
    };
  } catch {
    return {
      success: false,
      message: 'Unable to export offline HTML report.',
    };
  }
};

function sanitizeReportNameSegment(value: string): string {
  return String(value || '')
    .replace(/[\\/*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ServerShareReportKind = 'chest' | 'hit' | 'final' | 'ranking' | 'club' | 'championship';

export function buildServerReportFileName(
  kind: ServerShareReportKind,
  options: {
    eventNo?: string | number;
    clubName?: string;
    year?: number;
    extension?: 'html' | 'pdf';
  } = {}
): string {
  const year = options.year ?? new Date().getFullYear();
  const ext = options.extension ?? 'html';

  switch (kind) {
    case 'chest':
      return `Name List - ${year}.${ext}`;
    case 'hit': {
      const evtPart = sanitizeReportNameSegment(
        options.eventNo !== undefined && String(options.eventNo).trim() !== '' && String(options.eventNo) !== 'all'
          ? String(options.eventNo)
          : 'All'
      );
      return `Event: ${evtPart} (Hit List) - ${year}.${ext}`;
    }
    case 'final': {
      const evtPart = sanitizeReportNameSegment(
        options.eventNo !== undefined && String(options.eventNo).trim() !== '' && String(options.eventNo) !== 'all'
          ? String(options.eventNo)
          : 'All'
      );
      return `Event: ${evtPart} (Final List) - ${year}.${ext}`;
    }
    case 'ranking': {
      const evtPart = sanitizeReportNameSegment(
        options.eventNo !== undefined && String(options.eventNo).trim() !== '' && String(options.eventNo) !== 'all'
          ? String(options.eventNo)
          : 'All'
      );
      return `Event: ${evtPart} (Ranking List) - ${year}.${ext}`;
    }
    case 'club': {
      const clubPart = sanitizeReportNameSegment(
        options.clubName && options.clubName !== 'all' ? options.clubName : 'All Clubs'
      );
      return `Bill: ${clubPart} - ${year}.${ext}`;
    }
    case 'championship':
      return `Club Ranking - ${year}.${ext}`;
  }
}

/**
 * Shares an A4 PDF Blob via Web Share API (opening WhatsApp/share sheet on mobile),
 * falling back cleanly to downloading the `.pdf` file on desktop or restricted frames.
 */
export const shareA4PdfBlob = async (
  blob: Blob,
  fileName: string = `Name List - ${new Date().getFullYear()}.pdf`,
  title: string = 'Name List A4 Report'
): Promise<{ success: boolean; cancelled?: boolean; message: string }> => {
  try {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const canShareFiles =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      (!navigator.canShare || navigator.canShare({ files: [file] }));

    if (canShareFiles) {
      try {
        await navigator.share({
          files: [file],
          title,
        });
        return {
          success: true,
          message: `${title} shared as A4 PDF!`,
        };
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') {
          return {
            success: false,
            cancelled: true,
            message: 'Share cancelled.',
          };
        }
        // Fall through to clean PDF download if Web Share is blocked in iframe/browser
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    return {
      success: true,
      message: `A4 PDF saved (${fileName}) — attach and share in WhatsApp!`,
    };
  } catch {
    return {
      success: false,
      message: 'Unable to export A4 PDF report.',
    };
  }
};


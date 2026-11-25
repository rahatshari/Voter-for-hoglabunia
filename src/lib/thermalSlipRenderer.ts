import { CandidateProfile, SlipCustomSettings, Voter } from '../types';
import { DEFAULT_SLIP_FOOTER_TEXT } from './voterSlipUtils';

export const DEFAULT_SLIP_CUSTOM_SETTINGS: Required<SlipCustomSettings> = {
  orientation: 'portrait',
  paperWidthMm: 58,
  headerFontScale: 1,
  candidateFontScale: 1,
  voterFontScale: 1,
  photoScale: 1,
  symbolScale: 1,
  lineSpacingScale: 1,
  paddingMm: 2,
  borderStyle: 'solid',
  swapPhotoSymbol: false,
  thermalDarkness: 'normal',
  showReligiousHeader: true,
  showElectionTitle: true,
  showCandidatePhoto: true,
  showSymbolPhoto: true,
  showSlogan: true,
  showPollingCenter: true,
  showWardAndArea: true,
  showSerial: true,
  showVoterId: true,
  showFather: true,
  showMother: true,
  showDob: true,
  showProfession: true,
  showAddress: true,
  showFooter: true,
};

export function resolveSlipCustomSettings(
  config?: CandidateProfile | null
): Required<SlipCustomSettings> {
  return {
    ...DEFAULT_SLIP_CUSTOM_SETTINGS,
    ...(config?.customSettings || {}),
  };
}

export function getThermalDarknessThreshold(
  darkness: 'light' | 'normal' | 'dark' = 'normal'
): number {
  if (darkness === 'light') return 118;
  if (darkness === 'dark') return 178;
  return 145;
}

export interface ThermalSlipMetrics {
  orientation: 'portrait' | 'landscape';
  paperWidthMm: 58 | 80;
  printableRollDots: number;
  viewWidthPx: number;
  viewHeightPx: number;
  viewWidthMm: number;
  viewHeightMm: number;
  rollFeedLengthMm: number;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawImageCoverTop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = 0;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];
  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawOuterBorder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  style: 'solid' | 'double' | 'dashed' | 'none',
  inset = 3
) {
  if (style === 'none') return;
  ctx.save();
  ctx.strokeStyle = '#000000';
  if (style === 'dashed') {
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  } else if (style === 'double') {
    ctx.lineWidth = 2.2;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(inset + 4, inset + 4, w - (inset + 4) * 2, h - (inset + 4) * 2);
  } else {
    ctx.lineWidth = 2;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  }
  ctx.restore();
}

function drawHorizontalRule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  dashed = false
) {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = dashed ? 1.4 : 2;
  if (dashed) ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the Voter Slip onto a canvas in exact 203-DPI thermal pixel units (8 px = 1 mm)
 * supporting both Portrait & Landscape orientations, 58mm & 80mm widths, and all custom settings.
 */
export async function drawThermalSlipToCanvas(
  canvas: HTMLCanvasElement,
  voter: Voter,
  config: CandidateProfile
): Promise<ThermalSlipMetrics> {
  const cs = resolveSlipCustomSettings(config);
  const rollDots = cs.paperWidthMm === 80 ? 576 : 384; // 8 dots/mm printable area
  const baseScale = cs.paperWidthMm === 80 ? 1.32 : 1.0;

  const [candImg, symImg] = await Promise.all([
    cs.showCandidatePhoto
      ? loadImage(config.candidatePhotoUrl || './candidate-ataur.jpg')
      : Promise.resolve(null),
    cs.showSymbolPhoto
      ? loadImage(config.symbolPhotoUrl || './symbol-horse.png')
      : Promise.resolve(null),
  ]);

  const padPx = Math.max(8, Math.round(cs.paddingMm * 8));
  const spacing = cs.lineSpacingScale;
  const hScale = cs.headerFontScale * baseScale;
  const cScale = cs.candidateFontScale * baseScale;
  const vScale = cs.voterFontScale * baseScale;
  const fillMode = config.voterInfoMode || 'auto';

  if (cs.orientation === 'landscape') {
    // =========================================================================
    // LANDSCAPE THERMAL CARD (Horizontal card whose height = roll printable dots)
    // =========================================================================
    const cardHeight = rollDots; // 384px (48mm printable on 58mm roll) or 576px (72mm on 80mm roll)
    // Compute landscape length dynamically so all text fits cleanly
    const baseLandscapeWidth = cs.paperWidthMm === 80 ? 832 : 576; // 104mm or 72mm
    const extraScale = Math.max(1, (vScale + spacing - 1) * 0.65);
    const cardWidth = Math.ceil((baseLandscapeWidth * extraScale) / 8) * 8;

    canvas.width = cardWidth;
    canvas.height = cardHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cardWidth, cardHeight);
      ctx.fillStyle = '#000000';
      ctx.textBaseline = 'top';

      drawOuterBorder(ctx, cardWidth, cardHeight, cs.borderStyle, 3);

      const innerPad = cs.borderStyle === 'double' ? Math.max(padPx, 12) : Math.max(padPx, 9);
      const hasMediaCol = cs.showCandidatePhoto || cs.showSymbolPhoto;
      const sideColW = hasMediaCol
        ? Math.round((cs.paperWidthMm === 80 ? 185 : 132) * Math.max(0.8, (cs.photoScale + cs.symbolScale) / 2))
        : 0;

      const mediaOnRight = cs.swapPhotoSymbol;
      const mediaX = mediaOnRight ? cardWidth - innerPad - sideColW : innerPad;
      const mainX = mediaOnRight ? innerPad : innerPad + (hasMediaCol ? sideColW + 10 : 0);
      const mainW = cardWidth - innerPad * 2 - (hasMediaCol ? sideColW + 10 : 0);

      // Vertical dashed separator between media column and content column
      if (hasMediaCol) {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        const sepX = mediaOnRight ? mediaX - 5 : mediaX + sideColW + 5;
        ctx.beginPath();
        ctx.moveTo(sepX, innerPad);
        ctx.lineTo(sepX, cardHeight - innerPad);
        ctx.stroke();
        ctx.restore();

        // Draw Candidate Photo + Symbol inside Media Column
        let my = innerPad + 2;
        const availH = cardHeight - innerPad * 2 - 4;
        if (cs.showCandidatePhoto && candImg) {
          const phH = cs.showSymbolPhoto
            ? Math.min(Math.round(availH * 0.52 * cs.photoScale), Math.round(availH * 0.62))
            : Math.min(Math.round(availH * 0.78 * cs.photoScale), availH - 28);
          const phW = Math.min(sideColW - 6, Math.round(phH * 0.88));
          const phX = mediaX + Math.round((sideColW - phW) / 2);
          drawImageCoverTop(ctx, candImg, phX, my, phW, phH);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(phX, my, phW, phH);
          my += phH + 5;
        }
        if (cs.showSymbolPhoto && symImg) {
          const remH = Math.max(40, cardHeight - innerPad - my - (cs.showSlogan ? 34 : 18));
          const symH = Math.min(Math.round(68 * baseScale * cs.symbolScale), remH);
          const symW = Math.min(sideColW - 8, Math.round(86 * baseScale * cs.symbolScale));
          const symX = mediaX + Math.round((sideColW - symW) / 2);
          drawImageContain(ctx, symImg, symX, my, symW, symH);
          my += symH + 3;
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000000';
        ctx.font = `900 ${Math.round(11.5 * baseScale)}px "Noto Sans Bengali", sans-serif`;
        ctx.fillText(
          (config.symbolCallout || `${config.symbolName} মার্কায় ভোট দিন`).slice(0, 24),
          mediaX + sideColW / 2,
          my,
          sideColW - 4
        );
        my += Math.round(15 * baseScale);

        if (cs.showSlogan && config.sloganText && my + 14 < cardHeight - innerPad) {
          ctx.font = `bold ${Math.round(9 * baseScale)}px "Noto Sans Bengali", sans-serif`;
          const sLines = wrapCanvasText(ctx, config.sloganText, sideColW - 4).slice(0, 2);
          for (const sl of sLines) {
            if (my + 11 > cardHeight - innerPad) break;
            ctx.fillText(sl, mediaX + sideColW / 2, my, sideColW - 4);
            my += Math.round(11 * baseScale);
          }
        }
      }

      // Draw Right/Main Column Content
      let y = innerPad;
      const bottomLimit = cardHeight - innerPad - (cs.showFooter ? Math.round(22 * baseScale) : 0);

      if (cs.showReligiousHeader && config.religiousHeader) {
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(10.5 * hScale)}px "Noto Sans Bengali", sans-serif`;
        ctx.fillText(config.religiousHeader, mainX + mainW / 2, y, mainW);
        y += Math.round(14 * hScale * spacing);
      }

      if (cs.showElectionTitle && (config.electionTitle || config.constituencyText)) {
        ctx.textAlign = 'left';
        ctx.font = `800 ${Math.round(11.5 * hScale)}px "Noto Sans Bengali", sans-serif`;
        const titleLine = [config.electionTitle, config.constituencyText]
          .filter(Boolean)
          .join(' — ');
        ctx.fillText(titleLine, mainX, y, mainW);
        y += Math.round(15 * hScale * spacing);
      }

      // Candidate Badge + Big Name Banner
      const badgeTxt = config.candidateBadge || config.postTitle || 'পদপ্রার্থী';
      const candFull = `${config.candidateName || config.name} ${config.candidateSuffix || ''}`.trim();
      const bannerH = Math.round(23 * cScale);
      ctx.fillStyle = '#000000';
      ctx.fillRect(mainX, y, mainW, bannerH);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.font = `900 ${Math.round(13 * cScale)}px "Noto Sans Bengali", sans-serif`;
      ctx.fillText(`${badgeTxt}: ${candFull}`, mainX + 6, y + Math.round(4 * cScale), mainW - 12);
      ctx.fillStyle = '#000000';
      y += bannerH + Math.round(5 * spacing);

      // Polling Center & Ward Strip
      if (cs.showPollingCenter || cs.showWardAndArea) {
        ctx.font = `bold ${Math.round(11 * vScale)}px "Noto Sans Bengali", sans-serif`;
        const parts: string[] = [];
        if (cs.showPollingCenter && config.pollingCenter) {
          parts.push(`কেন্দ্র: ${config.pollingCenter}`);
        }
        if (cs.showWardAndArea) {
          parts.push(`এলাকা: ${voter.villageName || config.voterArea || '-'} (ওয়ার্ড: ${config.wardNo || '-'})`);
        }
        ctx.fillText(parts.join('  |  '), mainX, y, mainW);
        y += Math.round(15 * vScale * spacing);
        drawHorizontalRule(ctx, mainX, mainX + mainW, y, true);
        y += Math.round(5 * spacing);
      }

      // Voter Fields (2-column compact landscape grid so everything fits cleanly)
      const rowStep = Math.round(16.5 * vScale * spacing);
      if (fillMode === 'blank') {
        ctx.font = `bold ${Math.round(11 * vScale)}px "Noto Sans Bengali", sans-serif`;
        const blankRows = [
          'নাম: ..............................................  ক্রমিক: ............',
          'পিতা/স্বামী: ......................................  মাতা: ......................',
          'ভোটার আইডি: ....................................  জন্ম: ......................',
        ];
        for (const br of blankRows) {
          if (y + rowStep > bottomLimit) break;
          ctx.fillText(br, mainX, y, mainW);
          y += rowStep;
        }
      } else {
        // Name + Serial
        ctx.font = `900 ${Math.round(13.5 * vScale)}px "Noto Sans Bengali", sans-serif`;
        const namePart = cs.showSerial
          ? `ক্রমিক: ${voter.serialNo || '-'}  |  নাম: ${voter.name || '-'}`
          : `নাম: ${voter.name || '-'}`;
        ctx.fillText(namePart, mainX, y, mainW);
        y += Math.round(18 * vScale * spacing);

        ctx.font = `bold ${Math.round(11.5 * vScale)}px "Noto Sans Bengali", sans-serif`;
        if (cs.showVoterId && y + 12 <= bottomLimit) {
          const idDob = [
            `ভোটার আইডি: ${voter.voterId || '-'}`,
            cs.showDob && voter.dob ? `জন্ম: ${voter.dob}` : '',
          ]
            .filter(Boolean)
            .join('   |   ');
          ctx.fillText(idDob, mainX, y, mainW);
          y += rowStep;
        }

        if ((cs.showFather || cs.showMother) && y + 12 <= bottomLimit) {
          const parents = [
            cs.showFather ? `পিতা/স্বামী: ${voter.fatherName || '-'}` : '',
            cs.showMother ? `মাতা: ${voter.motherName || '-'}` : '',
          ]
            .filter(Boolean)
            .join('   |   ');
          ctx.fillText(parents, mainX, y, mainW);
          y += rowStep;
        }

        if ((cs.showProfession || cs.showAddress) && y + 12 <= bottomLimit) {
          const addrProf = [
            cs.showProfession && voter.profession ? `পেশা: ${voter.profession}` : '',
            cs.showAddress ? `ঠিকানা: ${voter.address || voter.villageName || '-'}` : '',
          ]
            .filter(Boolean)
            .join('   |   ');
          if (addrProf) {
            ctx.fillText(addrProf, mainX, y, mainW);
          }
        }
      }

      // Footer Strip
      if (cs.showFooter) {
        const fy = cardHeight - innerPad - Math.round(17 * baseScale);
        ctx.fillStyle = '#000000';
        ctx.fillRect(mainX, fy, mainW, Math.round(17 * baseScale));
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(10 * baseScale)}px "Noto Sans Bengali", sans-serif`;
        ctx.fillText(
          config.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT,
          mainX + mainW / 2,
          fy + 3,
          mainW - 8
        );
      }
    }

    const viewWidthMm = Math.round(cardWidth / 8);
    const viewHeightMm = cs.paperWidthMm;
    return {
      orientation: 'landscape',
      paperWidthMm: cs.paperWidthMm,
      printableRollDots: rollDots,
      viewWidthPx: cardWidth,
      viewHeightPx: cardHeight,
      viewWidthMm,
      viewHeightMm,
      rollFeedLengthMm: viewWidthMm,
    };
  }

  // ===========================================================================
  // PORTRAIT THERMAL SLIP (Exact width = 384px for 58mm or 576px for 80mm,
  // dynamic two-pass exact height measurement!)
  // ===========================================================================
  const width = rollDots;
  const innerPad = cs.borderStyle === 'double' ? Math.max(padPx, 12) : Math.max(padPx, 10);
  const contentW = width - innerPad * 2;

  const renderPortraitPass = (ctx: CanvasRenderingContext2D, dryRun: boolean): number => {
    let y = innerPad;

    if (!dryRun) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.textBaseline = 'top';
    }

    // 1. Religious Header
    if (cs.showReligiousHeader && config.religiousHeader) {
      ctx.font = `bold ${Math.round(12.5 * hScale)}px "Noto Sans Bengali", sans-serif`;
      if (!dryRun) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000000';
        ctx.fillText(config.religiousHeader, width / 2, y, contentW);
      }
      y += Math.round(18 * hScale * spacing);
    }

    // 2. Election Title & Constituency
    if (cs.showElectionTitle) {
      if (config.electionTitle) {
        ctx.font = `900 ${Math.round(14.5 * hScale)}px "Noto Sans Bengali", sans-serif`;
        const lines = wrapCanvasText(ctx, config.electionTitle, contentW);
        for (const ln of lines) {
          if (!dryRun) {
            ctx.textAlign = 'center';
            ctx.fillText(ln, width / 2, y, contentW);
          }
          y += Math.round(18 * hScale * spacing);
        }
      }
      const subText = config.constituencyText || config.electionSubtitle || '';
      if (subText) {
        ctx.font = `bold ${Math.round(11 * hScale)}px "Noto Sans Bengali", sans-serif`;
        const lines = wrapCanvasText(ctx, subText, contentW);
        for (const ln of lines) {
          if (!dryRun) {
            ctx.textAlign = 'center';
            ctx.fillText(ln, width / 2, y, contentW);
          }
          y += Math.round(15 * hScale * spacing);
        }
      }
    }

    if (cs.showReligiousHeader || cs.showElectionTitle) {
      y += 3;
      if (!dryRun) drawHorizontalRule(ctx, innerPad, width - innerPad, y, true);
      y += Math.round(7 * spacing);
    }

    // 3. Candidate Hero Row (Symbol + Center Name/Badge + Candidate Photo, swappable!)
    const symW = cs.showSymbolPhoto ? Math.round(80 * baseScale * cs.symbolScale) : 0;
    const symH = cs.showSymbolPhoto ? Math.round(76 * baseScale * cs.symbolScale) : 0;
    const photoW = cs.showCandidatePhoto ? Math.round(108 * baseScale * cs.photoScale) : 0;
    const photoH = cs.showCandidatePhoto ? Math.round(130 * baseScale * cs.photoScale) : 0;

    const leftBoxW = cs.swapPhotoSymbol ? photoW : symW;
    const rightBoxW = cs.swapPhotoSymbol ? symW : photoW;
    const centerXStart = innerPad + (leftBoxW > 0 ? leftBoxW + 6 : 0);
    const centerW = Math.max(
      90,
      contentW - (leftBoxW > 0 ? leftBoxW + 6 : 0) - (rightBoxW > 0 ? rightBoxW + 6 : 0)
    );
    const centerXMid = centerXStart + centerW / 2;

    // Measure center column height
    let centerY = y + 4;
    const badgeH = Math.round(21 * cScale);
    if (!dryRun) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(centerXStart, centerY, centerW, badgeH);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(11 * cScale)}px "Noto Sans Bengali", sans-serif`;
      ctx.fillText(
        config.candidateBadge || config.postTitle || 'পদপ্রার্থী',
        centerXMid,
        centerY + Math.round(4 * cScale),
        centerW - 6
      );
      ctx.fillStyle = '#000000';
    }
    centerY += badgeH + Math.round(6 * spacing);

    ctx.font = `900 ${Math.round(15.5 * cScale)}px "Noto Sans Bengali", sans-serif`;
    const fullName = `${config.candidateName || config.name} ${config.candidateSuffix || 'কে'}`.trim();
    const nameLines = wrapCanvasText(ctx, fullName, centerW);
    for (const nl of nameLines) {
      if (!dryRun) {
        ctx.textAlign = 'center';
        ctx.fillText(nl, centerXMid, centerY, centerW);
      }
      centerY += Math.round(19 * cScale * spacing);
    }

    // Vote Callout pill in center if symbol hidden, or subtitle
    const calloutStr = config.symbolCallout || `${config.symbolName} মার্কায় ভোট দিন`;
    ctx.font = `800 ${Math.round(11 * cScale)}px "Noto Sans Bengali", sans-serif`;
    const callLines = wrapCanvasText(ctx, calloutStr, centerW);
    for (const cl of callLines) {
      if (!dryRun) {
        ctx.textAlign = 'center';
        ctx.fillText(cl, centerXMid, centerY + 2, centerW);
      }
      centerY += Math.round(15 * cScale * spacing);
    }

    if (cs.showSlogan && config.sloganText) {
      ctx.font = `bold ${Math.round(9.5 * baseScale)}px "Noto Sans Bengali", sans-serif`;
      const slLines = wrapCanvasText(ctx, config.sloganText, centerW).slice(0, 2);
      for (const sl of slLines) {
        if (!dryRun) {
          ctx.textAlign = 'center';
          ctx.fillText(sl, centerXMid, centerY + 2, centerW);
        }
        centerY += Math.round(13 * baseScale * spacing);
      }
    }

    // Draw Symbol & Candidate Photo on their chosen sides
    const symBlockH = cs.showSymbolPhoto ? symH + Math.round(20 * baseScale) : 0;
    const photoBlockH = cs.showCandidatePhoto ? photoH + Math.round(16 * baseScale) : 0;

    if (!dryRun) {
      if (cs.showSymbolPhoto) {
        const sx = cs.swapPhotoSymbol ? width - innerPad - symW : innerPad;
        if (symImg) {
          drawImageContain(ctx, symImg, sx, y + 2, symW, symH);
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${Math.round(10.5 * baseScale)}px "Noto Sans Bengali", sans-serif`;
        ctx.fillText(
          `মার্কা: ${config.symbolName || ''}`,
          sx + symW / 2,
          y + symH + 4,
          symW
        );
      }

      if (cs.showCandidatePhoto) {
        const px = cs.swapPhotoSymbol ? innerPad : width - innerPad - photoW;
        if (candImg) {
          drawImageCoverTop(ctx, candImg, px, y + 2, photoW, photoH);
        }
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(px, y + 2, photoW, photoH);
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(10 * baseScale)}px "Noto Sans Bengali", sans-serif`;
        ctx.fillText('প্রার্থী', px + photoW / 2, y + photoH + 4, photoW);
      }
    }

    const heroHeight = Math.max(centerY - y, symBlockH, photoBlockH);
    y += heroHeight + Math.round(6 * spacing);

    if (!dryRun) drawHorizontalRule(ctx, innerPad, width - innerPad, y, false);
    y += Math.round(7 * spacing);

    // 4. Polling Center & Ward / Area
    if (cs.showPollingCenter && config.pollingCenter) {
      ctx.font = `bold ${Math.round(12.5 * vScale)}px "Noto Sans Bengali", sans-serif`;
      const cLines = wrapCanvasText(ctx, `ভোট কেন্দ্র: ${config.pollingCenter}`, contentW);
      for (const cl of cLines) {
        if (!dryRun) {
          ctx.textAlign = 'left';
          ctx.fillText(cl, innerPad, y, contentW);
        }
        y += Math.round(17 * vScale * spacing);
      }
    }

    if (cs.showWardAndArea) {
      ctx.font = `bold ${Math.round(12 * vScale)}px "Noto Sans Bengali", sans-serif`;
      if (!dryRun) {
        ctx.textAlign = 'left';
        ctx.fillText(
          `এলাকা: ${voter.villageName || config.voterArea || '-'}`,
          innerPad,
          y,
          contentW * 0.65
        );
        ctx.textAlign = 'right';
        ctx.fillText(`ওয়ার্ড নং: ${config.wardNo || '-'}`, width - innerPad, y, contentW * 0.35);
      }
      y += Math.round(17 * vScale * spacing);
    }

    if (cs.showPollingCenter || cs.showWardAndArea) {
      y += 2;
      if (!dryRun) drawHorizontalRule(ctx, innerPad, width - innerPad, y, true);
      y += Math.round(7 * spacing);
    }

    // 5. Voter Details Section
    const vStep = Math.round(20 * vScale * spacing);
    if (fillMode === 'blank') {
      ctx.font = `bold ${Math.round(12 * vScale)}px "Noto Sans Bengali", sans-serif`;
      const blankFields = [
        'ভোটারের নাম : ..........................................',
        'ক্রমিক নং : ...................  ওয়ার্ড : ...............',
        'পিতা/স্বামী : .............................................',
        'মাতার নাম : .............................................',
        'ভোটার আইডি : ..........................................',
      ];
      for (const bf of blankFields) {
        if (!dryRun) {
          ctx.textAlign = 'left';
          ctx.fillText(bf, innerPad, y, contentW);
        }
        y += vStep;
      }
    } else {
      // Highlighted Serial + Name Box
      ctx.font = `900 ${Math.round(15 * vScale)}px "Noto Sans Bengali", sans-serif`;
      const headVoter = cs.showSerial
        ? `ক্রমিক: ${voter.serialNo || '-'} | ${voter.name || '-'}`
        : `নাম: ${voter.name || '-'}`;
      const vNameLines = wrapCanvasText(ctx, headVoter, contentW - 10);
      const boxH = vNameLines.length * Math.round(19 * vScale) + 8;
      if (!dryRun) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(innerPad, y, contentW, boxH);
        ctx.textAlign = 'left';
        let ny = y + 4;
        for (const nl of vNameLines) {
          ctx.fillText(nl, innerPad + 5, ny, contentW - 10);
          ny += Math.round(19 * vScale);
        }
      }
      y += boxH + Math.round(6 * spacing);

      if (cs.showVoterId) {
        ctx.font = `bold ${Math.round(13.5 * vScale)}px monospace`;
        if (!dryRun) {
          ctx.textAlign = 'left';
          ctx.fillText(`ভোটার আইডি: ${voter.voterId || '-'}`, innerPad, y, contentW);
        }
        y += vStep;
      }

      ctx.font = `bold ${Math.round(12.5 * vScale)}px "Noto Sans Bengali", sans-serif`;
      if (cs.showFather) {
        if (!dryRun) {
          ctx.textAlign = 'left';
          ctx.fillText(`পিতা/স্বামী: ${voter.fatherName || '-'}`, innerPad, y, contentW);
        }
        y += vStep;
      }

      if (cs.showMother) {
        if (!dryRun) {
          ctx.textAlign = 'left';
          ctx.fillText(`মাতা: ${voter.motherName || '-'}`, innerPad, y, contentW);
        }
        y += vStep;
      }

      const dobProf = [
        cs.showDob && voter.dob ? `জন্ম: ${voter.dob}` : '',
        cs.showProfession && voter.profession ? `পেশা: ${voter.profession}` : '',
      ]
        .filter(Boolean)
        .join('  |  ');
      if (dobProf) {
        ctx.font = `bold ${Math.round(12 * vScale)}px "Noto Sans Bengali", sans-serif`;
        if (!dryRun) {
          ctx.textAlign = 'left';
          ctx.fillText(dobProf, innerPad, y, contentW);
        }
        y += Math.round(18 * vScale * spacing);
      }

      if (cs.showAddress) {
        ctx.font = `bold ${Math.round(12 * vScale)}px "Noto Sans Bengali", sans-serif`;
        const addrLines = wrapCanvasText(
          ctx,
          `ঠিকানা: ${voter.address || voter.villageName || '-'}`,
          contentW
        );
        for (const al of addrLines) {
          if (!dryRun) {
            ctx.textAlign = 'left';
            ctx.fillText(al, innerPad, y, contentW);
          }
          y += Math.round(17 * vScale * spacing);
        }
      }
    }

    // 6. Footer
    if (cs.showFooter) {
      y += 3;
      if (!dryRun) drawHorizontalRule(ctx, innerPad, width - innerPad, y, true);
      y += Math.round(6 * spacing);
      ctx.font = `800 ${Math.round(11.5 * baseScale)}px "Noto Sans Bengali", sans-serif`;
      const fLines = wrapCanvasText(
        ctx,
        config.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT,
        contentW
      );
      for (const fl of fLines) {
        if (!dryRun) {
          ctx.textAlign = 'center';
          ctx.fillText(fl, width / 2, y, contentW);
        }
        y += Math.round(16 * baseScale * spacing);
      }
    }

    y += innerPad;
    return Math.ceil(y / 8) * 8;
  };

  // Pass 1: Measure exact height
  canvas.width = width;
  canvas.height = 800;
  const measureCtx = canvas.getContext('2d');
  const exactHeight = measureCtx ? renderPortraitPass(measureCtx, true) : 512;

  // Pass 2: Resize to exact height & draw cleanly
  canvas.width = width;
  canvas.height = exactHeight;
  const drawCtx = canvas.getContext('2d');
  if (drawCtx) {
    renderPortraitPass(drawCtx, false);
    drawOuterBorder(drawCtx, width, exactHeight, cs.borderStyle, 3);
  }

  const lengthMm = Math.round(exactHeight / 8);
  return {
    orientation: 'portrait',
    paperWidthMm: cs.paperWidthMm,
    printableRollDots: rollDots,
    viewWidthPx: width,
    viewHeightPx: exactHeight,
    viewWidthMm: cs.paperWidthMm,
    viewHeightMm: lengthMm,
    rollFeedLengthMm: lengthMm,
  };
}

/**
 * Prepares the canvas for physical ESC/POS printing:
 * - In Portrait mode: returns `viewCanvas` as-is (`384 × H` or `576 × H`).
 * - In Landscape mode: rotates the horizontal card 90° clockwise onto a `rollDots × cardWidth` canvas
 *   so it feeds smoothly along the 58mm/80mm thermal paper roll at exact 1:1 dimensions!
 */
export function prepareCanvasForThermalPrinter(
  viewCanvas: HTMLCanvasElement,
  orientation: 'portrait' | 'landscape'
): HTMLCanvasElement {
  if (orientation !== 'landscape') {
    return viewCanvas;
  }
  const rotated = document.createElement('canvas');
  // viewCanvas.height is already printableRollDots (384 or 576)!
  rotated.width = viewCanvas.height;
  rotated.height = viewCanvas.width;
  const rCtx = rotated.getContext('2d');
  if (rCtx) {
    rCtx.fillStyle = '#FFFFFF';
    rCtx.fillRect(0, 0, rotated.width, rotated.height);
    rCtx.save();
    rCtx.translate(rotated.width, 0);
    rCtx.rotate(Math.PI / 2);
    rCtx.drawImage(viewCanvas, 0, 0);
    rCtx.restore();
  }
  return rotated;
}

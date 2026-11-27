import { CandidateProfile, SlipCustomSettings, Voter } from '../types';
import { DEFAULT_SLIP_FOOTER_TEXT } from './voterSlipUtils';

export const DEFAULT_SLIP_CUSTOM_SETTINGS: Required<SlipCustomSettings> = {
  orientation: 'portrait',
  paperWidthMm: 58,
  thermalColorMode: 'bw',
  voterOnlyMode: false,
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

export interface ThermalSlipRenderOptions {
  /**
   * Supersampling multiplier for crisp HD rendering on Retina / mobile screens.
   * - Use `1` (default) for physical ESC/POS thermal printer dot output (`384px` / `576px`).
   * - Use `3` for razor-sharp HD screen preview and high-res PNG downloads.
   */
  pixelScale?: number;
  /**
   * When true, renders subtle ink/paper fidelity suitable for HD preview
   * without altering physical layout metrics.
   */
  previewQuality?: boolean;
}

const MAX_IMAGE_CACHE_SIZE = 32;
const resolvedImageCache = new Map<string, HTMLImageElement | null>();
const inflightImageCache = new Map<string, Promise<HTMLImageElement | null>>();
const grayscaleImageCache = new Map<string, HTMLCanvasElement>();

function rememberResolvedImage(src: string, img: HTMLImageElement | null) {
  if (resolvedImageCache.size >= MAX_IMAGE_CACHE_SIZE && !resolvedImageCache.has(src)) {
    const oldestKey = resolvedImageCache.keys().next().value;
    if (oldestKey !== undefined) {
      resolvedImageCache.delete(oldestKey);
    }
  }
  resolvedImageCache.set(src, img);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  if (resolvedImageCache.has(src)) {
    const cached = resolvedImageCache.get(src) ?? null;
    return Promise.resolve(cached);
  }
  const existing = inflightImageCache.get(src);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      inflightImageCache.delete(src);
      rememberResolvedImage(src, img);
      resolve(img);
    };
    img.onerror = () => {
      inflightImageCache.delete(src);
      rememberResolvedImage(src, null);
      resolve(null);
    };
    img.src = src;
  });

  inflightImageCache.set(src, promise);
  return promise;
}

/**
 * Converts an HTMLImageElement into a crisp, high-clarity Black & White canvas source
 * (cached so 60 FPS slider redraws take 0ms).
 */
function getRenderableMediaSource(
  img: HTMLImageElement,
  colorMode: 'bw' | 'color',
  darkness: 'light' | 'normal' | 'dark'
): CanvasImageSource {
  if (colorMode === 'color' || typeof document === 'undefined') {
    return img;
  }
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return img;

  const cacheKey = `${img.src.slice(0, 180)}_${img.src.length}_${w}x${h}_${darkness}`;
  const cached = grayscaleImageCache.get(cacheKey);
  if (cached) return cached;

  try {
    const off = document.createElement('canvas');
    const maxDim = 420;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    off.width = Math.max(1, Math.round(w * scale));
    off.height = Math.max(1, Math.round(h * scale));
    const octx = off.getContext('2d');
    if (!octx) return img;
    octx.drawImage(img, 0, 0, off.width, off.height);
    const imgData = octx.getImageData(0, 0, off.width, off.height);
    const d = imgData.data;
    const contrast = darkness === 'dark' ? 1.24 : darkness === 'light' ? 1.05 : 1.15;
    const bias = darkness === 'dark' ? -10 : darkness === 'light' ? 8 : -2;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 12) continue;
      let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      lum = (lum - 128) * contrast + 128 + bias;
      const v = lum < 0 ? 0 : lum > 255 ? 255 : Math.round(lum);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    octx.putImageData(imgData, 0, 0);

    if (grayscaleImageCache.size >= 24) {
      const oldest = grayscaleImageCache.keys().next().value;
      if (oldest !== undefined) grayscaleImageCache.delete(oldest);
    }
    grayscaleImageCache.set(cacheKey, off);
    return off;
  } catch {
    return img;
  }
}

let sharedMeasureCanvas: HTMLCanvasElement | null = null;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!sharedMeasureCanvas) {
    sharedMeasureCanvas = document.createElement('canvas');
    sharedMeasureCanvas.width = 600;
    sharedMeasureCanvas.height = 200;
  }
  return sharedMeasureCanvas.getContext('2d');
}

function configureHighQualityContext(
  ctx: CanvasRenderingContext2D,
  pixelScale: number
) {
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = 'high';
  }
}

function getSourceDims(src: CanvasImageSource, fallbackImg: HTMLImageElement): { w: number; h: number } {
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) {
    return { w: src.width, h: src.height };
  }
  return {
    w: fallbackImg.naturalWidth || fallbackImg.width,
    h: fallbackImg.naturalHeight || fallbackImg.height,
  };
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  sourceOverride?: CanvasImageSource
) {
  const src = sourceOverride || img;
  const dims = getSourceDims(src, img);
  if (!dims.w || !dims.h) return;
  const scale = Math.min(w / dims.w, h / dims.h);
  const dw = dims.w * scale;
  const dh = dims.h * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(src, dx, dy, dw, dh);
}

function drawImageCoverTop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  sourceOverride?: CanvasImageSource
) {
  const src = sourceOverride || img;
  const dims = getSourceDims(src, img);
  if (!dims.w || !dims.h) return;
  const imgRatio = dims.w / dims.h;
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = dims.w;
  let sh = dims.h;
  if (imgRatio > boxRatio) {
    sw = dims.h * boxRatio;
    sx = (dims.w - sw) / 2;
  } else {
    sh = dims.w / boxRatio;
    sy = 0;
  }
  ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
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
  inkColor: string,
  inset = 3
) {
  if (style === 'none') return;
  ctx.save();
  ctx.strokeStyle = inkColor;
  if (style === 'dashed') {
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  } else if (style === 'double') {
    ctx.lineWidth = 2;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    ctx.lineWidth = 1;
    ctx.strokeRect(inset + 4, inset + 4, w - (inset + 4) * 2, h - (inset + 4) * 2);
  } else {
    ctx.lineWidth = 1.8;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  }
  ctx.restore();
}

function drawHorizontalRule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  inkColor: string,
  dashed = false
) {
  ctx.save();
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = dashed ? 1.2 : 1.7;
  if (dashed) ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function drawLinedGuide(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  inkColor: string
) {
  ctx.save();
  ctx.strokeStyle = inkColor;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 0.9;
  ctx.setLineDash([2, 2.5]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

const BENGALI_FONT_STACK = '"Noto Sans Bengali", "Hind Siliguri", system-ui, sans-serif';

/**
 * Draws the Voter Slip onto a canvas in exact 203-DPI thermal pixel units (8 px = 1 mm)
 * supporting both Portrait & Landscape orientations, 58mm & 80mm widths, and all custom settings.
 * Supports high-DPI supersampling (`options.pixelScale = 3`) for crystal-clear HD previews!
 */
export async function drawThermalSlipToCanvas(
  canvas: HTMLCanvasElement,
  voter: Voter,
  config: CandidateProfile,
  options?: ThermalSlipRenderOptions
): Promise<ThermalSlipMetrics> {
  const pixelScale = Math.max(1, Math.min(4, options?.pixelScale ?? 1));
  const previewQuality = Boolean(options?.previewQuality);
  const cs = resolveSlipCustomSettings(config);
  const rollDots = cs.paperWidthMm === 80 ? 576 : 384; // 8 dots/mm printable area
  const baseScale = cs.paperWidthMm === 80 ? 1.32 : 1.0;

  // Subtle ink tone for HD screen preview depending on darkness setting, pure black for printer
  const inkColor = previewQuality
    ? cs.thermalDarkness === 'light'
      ? '#334155'
      : cs.thermalDarkness === 'dark'
      ? '#000000'
      : '#0f172a'
    : '#000000';

  const effectiveColorMode: 'bw' | 'color' = previewQuality ? cs.thermalColorMode : 'bw';

  const [candImg, symImg] = cs.voterOnlyMode
    ? [null, null]
    : await Promise.all([
        cs.showCandidatePhoto
          ? loadImage(config.candidatePhotoUrl || './candidate-ataur.jpg')
          : Promise.resolve(null),
        cs.showSymbolPhoto
          ? loadImage(config.symbolPhotoUrl || './symbol-horse.png')
          : Promise.resolve(null),
      ]);

  const candMediaSrc = candImg
    ? getRenderableMediaSource(candImg, effectiveColorMode, cs.thermalDarkness)
    : undefined;
  const symMediaSrc = symImg
    ? getRenderableMediaSource(symImg, effectiveColorMode, cs.thermalDarkness)
    : undefined;

  const padPx = Math.max(8, Math.round(cs.paddingMm * 8));
  const spacing = cs.lineSpacingScale;
  const hScale = cs.headerFontScale * baseScale;
  const cScale = cs.candidateFontScale * baseScale;
  const vScale = cs.voterFontScale * baseScale;
  const fillMode = config.voterInfoMode || 'auto';

  // ===========================================================================
  // VOTER-ONLY FULL-PAGE EXTRA-LARGE LANDSCAPE MODE (প্রার্থীর তথ্য ছাড়া বড় ফুল-পেজ প্রিন্ট)
  // ===========================================================================
  if (cs.voterOnlyMode && cs.orientation === 'landscape') {
    const cardHeight = rollDots; // 384px (58mm) or 576px (80mm)
    const baseLandscapeWidth = cs.paperWidthMm === 80 ? 896 : 624; // 112mm or 78mm wide full page
    const extraScale = Math.max(1, (cs.voterFontScale + spacing - 1) * 0.52);
    const cardWidth = Math.ceil((baseLandscapeWidth * extraScale) / 8) * 8;

    const targetPhysW = Math.round(cardWidth * pixelScale);
    const targetPhysH = Math.round(cardHeight * pixelScale);
    if (canvas.width !== targetPhysW) canvas.width = targetPhysW;
    if (canvas.height !== targetPhysH) canvas.height = targetPhysH;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      configureHighQualityContext(ctx, pixelScale);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cardWidth, cardHeight);
      ctx.fillStyle = inkColor;
      ctx.textBaseline = 'top';

      drawOuterBorder(ctx, cardWidth, cardHeight, cs.borderStyle, inkColor, 3);

      const innerPad = cs.borderStyle === 'double' ? Math.max(padPx, 12) : Math.max(padPx, 10);
      const mainX = innerPad;
      const mainW = cardWidth - innerPad * 2;
      let y = innerPad;

      // 1. Bold Full-Width Header Bar with Big Serial Badge (No Candidate Info!)
      const headerBarH = Math.round(42 * baseScale);
      ctx.fillStyle = inkColor;
      ctx.fillRect(mainX, y, mainW, headerBarH);

      // Right side crisp white Serial Pill inside Header Bar
      let serialPillW = 0;
      if (cs.showSerial && fillMode !== 'blank') {
        const serialLabel = `ক্রমিক: ${voter.serialNo || '-'}`;
        ctx.font = `900 ${Math.round(18.5 * baseScale)}px ${BENGALI_FONT_STACK}`;
        serialPillW = Math.min(
          Math.round(mainW * 0.42),
          Math.ceil(ctx.measureText(serialLabel).width) + Math.round(22 * baseScale)
        );
        const pillH = headerBarH - 8;
        const pillX = mainX + mainW - serialPillW - 4;
        const pillY = y + 4;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(pillX, pillY, serialPillW, pillH);
        ctx.fillStyle = inkColor;
        ctx.textAlign = 'center';
        ctx.fillText(
          serialLabel,
          pillX + serialPillW / 2,
          pillY + Math.max(2, Math.round((pillH - 21 * baseScale) / 2)),
          serialPillW - 8
        );
      }

      // Left side Title inside Header Bar
      const headerTitle =
        cs.showElectionTitle && config.electionTitle
          ? config.electionTitle
          : 'ভোটার তথ্য স্লিপ';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.font = `900 ${Math.round(16 * hScale)}px ${BENGALI_FONT_STACK}`;
      const availHeaderW = mainW - serialPillW - 18;
      ctx.fillText(
        headerTitle,
        mainX + 8,
        y + Math.max(4, Math.round((headerBarH - 19 * hScale) / 2)),
        Math.max(120, availHeaderW)
      );
      ctx.fillStyle = inkColor;
      y += headerBarH + 5;

      // 2. Polling Center & Ward / Area Strip
      if (cs.showPollingCenter || cs.showWardAndArea) {
        const stripParts: string[] = [];
        if (cs.showPollingCenter && config.pollingCenter) {
          stripParts.push(`ভোট কেন্দ্র: ${config.pollingCenter}`);
        }
        if (cs.showWardAndArea) {
          stripParts.push(
            `এলাকা: ${voter.villageName || config.voterArea || '-'} (ওয়ার্ড: ${config.wardNo || '-'})`
          );
        }
        if (stripParts.length > 0) {
          ctx.font = `800 ${Math.round(13.5 * vScale)}px ${BENGALI_FONT_STACK}`;
          const stripLines = wrapCanvasText(ctx, stripParts.join('   •   '), mainW).slice(0, 2);
          ctx.textAlign = 'left';
          ctx.fillStyle = inkColor;
          for (const sl of stripLines) {
            ctx.fillText(sl, mainX, y);
            y += Math.round(17.5 * vScale);
          }
          drawHorizontalRule(ctx, mainX, mainX + mainW, y + 2, inkColor, false);
          y += 7;
        }
      }

      const footerH = cs.showFooter ? Math.round(20 * baseScale) : 0;
      const bottomLimit = cardHeight - innerPad - (footerH > 0 ? footerH + 5 : 0);
      const availBodyH = Math.max(80, bottomLimit - y);

      // 3. Extra-Large Full-Page Voter Rows Auto-Distributed Across Entire Page Height
      interface BigVoterRow {
        text: string;
        basePx: number;
        weight: number;
        maxLines: number;
      }
      const rawRows: BigVoterRow[] = [];

      if (fillMode === 'blank') {
        rawRows.push(
          { text: 'ভোটারের নাম: ..................................................................', basePx: 19, weight: 900, maxLines: 1 },
          { text: 'ভোটার আইডি: ....................................   ক্রমিক: ....................', basePx: 16.5, weight: 800, maxLines: 1 },
          { text: 'পিতা / স্বামী: ...................................................................', basePx: 16.5, weight: 800, maxLines: 1 },
          { text: 'মাতার নাম: .....................................................................', basePx: 16.5, weight: 800, maxLines: 1 },
          { text: 'জন্ম তারিখ: ..............................   ঠিকানা: ............................', basePx: 16, weight: 700, maxLines: 1 }
        );
      } else {
        rawRows.push({
          text: `ভোটারের নাম: ${voter.name || '-'}`,
          basePx: 21.5,
          weight: 900,
          maxLines: 2,
        });
        if (cs.showVoterId) {
          rawRows.push({
            text: `ভোটার নং: ${voter.voterId || '-'}`,
            basePx: 18,
            weight: 800,
            maxLines: 1,
          });
        }
        if (cs.showFather) {
          rawRows.push({
            text: `পিতা/স্বামী: ${voter.fatherName || '-'}`,
            basePx: 17.5,
            weight: 800,
            maxLines: 2,
          });
        }
        if (cs.showMother) {
          rawRows.push({
            text: `মাতার নাম: ${voter.motherName || '-'}`,
            basePx: 17.5,
            weight: 800,
            maxLines: 2,
          });
        }
        const dobProfParts = [
          cs.showDob && voter.dob ? `জন্ম তারিখ: ${voter.dob}` : '',
          cs.showProfession && voter.profession ? `পেশা: ${voter.profession}` : '',
        ].filter(Boolean);
        if (dobProfParts.length > 0) {
          rawRows.push({
            text: dobProfParts.join('     |     '),
            basePx: 16.5,
            weight: 800,
            maxLines: 1,
          });
        }
        if (cs.showAddress) {
          rawRows.push({
            text: `ঠিকানা: ${voter.address || voter.villageName || '-'}`,
            basePx: 16,
            weight: 700,
            maxLines: 1,
          });
        }
      }

      const measureRowsAtScale = (scaleMul: number) => {
        const prepared: Array<{
          lines: string[];
          fontPx: number;
          lineH: number;
          weight: number;
          blockH: number;
        }> = [];
        let sumH = 0;
        for (const r of rawRows) {
          const fontPx = Math.max(12, Math.round(r.basePx * vScale * scaleMul));
          const lineH = Math.round(fontPx * 1.24);
          ctx.font = `${r.weight} ${fontPx}px ${BENGALI_FONT_STACK}`;
          const lines = wrapCanvasText(ctx, r.text, mainW - 4).slice(0, r.maxLines);
          const blockH = lines.length * lineH;
          prepared.push({ lines, fontPx, lineH, weight: r.weight, blockH });
          sumH += blockH;
        }
        return { prepared, sumH };
      };

      let measured = measureRowsAtScale(1);
      const minGapTotal = Math.max(0, measured.prepared.length - 1) * 4;
      if (measured.sumH + minGapTotal > availBodyH) {
        const shrink = Math.max(0.68, (availBodyH - minGapTotal) / Math.max(1, measured.sumH));
        measured = measureRowsAtScale(shrink);
      }

      const extraSpace = Math.max(0, availBodyH - measured.sumH);
      const gapBetweenRows =
        measured.prepared.length > 1
          ? Math.floor(extraSpace / measured.prepared.length)
          : 0;
      let curY = y + Math.floor(gapBetweenRows * 0.35);

      ctx.textAlign = 'left';
      ctx.fillStyle = inkColor;

      measured.prepared.forEach((item, idx) => {
        ctx.font = `${item.weight} ${item.fontPx}px ${BENGALI_FONT_STACK}`;
        for (const ln of item.lines) {
          if (curY + item.fontPx * 0.85 > bottomLimit + 4) break;
          ctx.fillText(ln, mainX + 2, curY);
          curY += item.lineH;
        }
        if (idx < measured.prepared.length - 1) {
          const ruleY = curY + Math.floor(gapBetweenRows / 2);
          if (ruleY < bottomLimit - 4 && gapBetweenRows >= 6) {
            drawLinedGuide(ctx, mainX, mainX + mainW, ruleY, inkColor);
          }
          curY += gapBetweenRows;
        }
      });

      // 4. Optional Bottom Footer Bar
      if (cs.showFooter && footerH > 0) {
        const fy = cardHeight - innerPad - footerH;
        ctx.fillStyle = inkColor;
        ctx.fillRect(mainX, fy, mainW, footerH);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = `800 ${Math.round(11 * baseScale)}px ${BENGALI_FONT_STACK}`;
        ctx.fillText(
          config.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT,
          mainX + mainW / 2,
          fy + Math.max(2, Math.round(3 * baseScale)),
          mainW - 10
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

  if (cs.orientation === 'landscape') {
    // =========================================================================
    // LANDSCAPE THERMAL CARD (Horizontal card whose height = roll printable dots)
    // =========================================================================
    const cardHeight = rollDots; // 384px (48mm printable on 58mm roll) or 576px (72mm on 80mm roll)
    const baseLandscapeWidth = cs.paperWidthMm === 80 ? 832 : 576; // 104mm or 72mm
    const extraScale = Math.max(1, (vScale + spacing - 1) * 0.68);
    const cardWidth = Math.ceil((baseLandscapeWidth * extraScale) / 8) * 8;

    const targetPhysW = Math.round(cardWidth * pixelScale);
    const targetPhysH = Math.round(cardHeight * pixelScale);
    if (canvas.width !== targetPhysW) canvas.width = targetPhysW;
    if (canvas.height !== targetPhysH) canvas.height = targetPhysH;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      configureHighQualityContext(ctx, pixelScale);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cardWidth, cardHeight);
      ctx.fillStyle = inkColor;
      ctx.textBaseline = 'top';

      drawOuterBorder(ctx, cardWidth, cardHeight, cs.borderStyle, inkColor, 3);

      const innerPad = cs.borderStyle === 'double' ? Math.max(padPx, 12) : Math.max(padPx, 9);
      const hasMediaCol = cs.showCandidatePhoto || cs.showSymbolPhoto;
      const sideColW = hasMediaCol
        ? Math.round(
            (cs.paperWidthMm === 80 ? 184 : 132) *
              Math.max(0.8, Math.min(1.25, (cs.photoScale + cs.symbolScale) / 2))
          )
        : 0;

      const mediaOnRight = cs.swapPhotoSymbol;
      const mediaX = mediaOnRight ? cardWidth - innerPad - sideColW : innerPad;
      const mainX = mediaOnRight ? innerPad : innerPad + (hasMediaCol ? sideColW + 10 : 0);
      const mainW = cardWidth - innerPad * 2 - (hasMediaCol ? sideColW + 10 : 0);

      // Vertical dashed separator between media column and content column
      if (hasMediaCol) {
        ctx.save();
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = 1.4;
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
            ? Math.min(Math.round(availH * 0.52 * cs.photoScale), Math.round(availH * 0.6))
            : Math.min(Math.round(availH * 0.78 * cs.photoScale), availH - 28);
          const phW = Math.min(sideColW - 6, Math.round(phH * 0.86));
          const phX = mediaX + Math.round((sideColW - phW) / 2);
          drawImageCoverTop(ctx, candImg, phX, my, phW, phH, candMediaSrc);
          ctx.strokeStyle = inkColor;
          ctx.lineWidth = 1.3;
          ctx.strokeRect(phX, my, phW, phH);
          my += phH + 5;
        }
        if (cs.showSymbolPhoto && symImg) {
          const remH = Math.max(36, cardHeight - innerPad - my - (cs.showSlogan ? 34 : 18));
          const symH = Math.min(Math.round(66 * baseScale * cs.symbolScale), remH);
          const symW = Math.min(sideColW - 8, Math.round(84 * baseScale * cs.symbolScale));
          const symX = mediaX + Math.round((sideColW - symW) / 2);
          drawImageContain(ctx, symImg, symX, my, symW, symH, symMediaSrc);
          my += symH + 3;
        }

        ctx.textAlign = 'center';
        ctx.fillStyle = inkColor;
        ctx.font = `800 ${Math.round(11 * baseScale)}px ${BENGALI_FONT_STACK}`;
        const calloutLines = wrapCanvasText(
          ctx,
          config.symbolCallout || `${config.symbolName} মার্কায় ভোট দিন`,
          sideColW - 2
        ).slice(0, 2);
        for (const cl of calloutLines) {
          if (my + 12 > cardHeight - innerPad) break;
          ctx.fillText(cl, mediaX + sideColW / 2, my);
          my += Math.round(13.5 * baseScale);
        }

        if (cs.showSlogan && config.sloganText && my + 12 < cardHeight - innerPad) {
          ctx.font = `600 ${Math.round(9 * baseScale)}px ${BENGALI_FONT_STACK}`;
          const sLines = wrapCanvasText(ctx, config.sloganText, sideColW - 2).slice(0, 2);
          for (const sl of sLines) {
            if (my + 11 > cardHeight - innerPad) break;
            ctx.fillText(sl, mediaX + sideColW / 2, my);
            my += Math.round(11.5 * baseScale);
          }
        }
      }

      // Draw Right/Main Column Content cleanly without horizontal glyph squishing
      let y = innerPad;
      const footerH = cs.showFooter ? Math.round(18 * baseScale) : 0;
      const bottomLimit = cardHeight - innerPad - (footerH > 0 ? footerH + 4 : 0);

      if (cs.showReligiousHeader && config.religiousHeader) {
        ctx.textAlign = 'center';
        ctx.fillStyle = inkColor;
        ctx.font = `700 ${Math.round(10.5 * hScale)}px ${BENGALI_FONT_STACK}`;
        const rLines = wrapCanvasText(ctx, config.religiousHeader, mainW).slice(0, 1);
        if (rLines[0]) {
          ctx.fillText(rLines[0], mainX + mainW / 2, y);
        }
        y += Math.round(14 * hScale * spacing);
      }

      if (cs.showElectionTitle && (config.electionTitle || config.constituencyText)) {
        ctx.textAlign = 'left';
        ctx.fillStyle = inkColor;
        ctx.font = `800 ${Math.round(11.5 * hScale)}px ${BENGALI_FONT_STACK}`;
        const titleLine = [config.electionTitle, config.constituencyText]
          .filter(Boolean)
          .join(' — ');
        const tLines = wrapCanvasText(ctx, titleLine, mainW).slice(0, 2);
        for (const tl of tLines) {
          ctx.fillText(tl, mainX, y);
          y += Math.round(14.5 * hScale * spacing);
        }
      }

      // Candidate Badge + Big Name Banner
      const badgeTxt = config.candidateBadge || config.postTitle || 'পদপ্রার্থী';
      const candFull = `${config.candidateName || config.name} ${config.candidateSuffix || ''}`.trim();
      const bannerText = `${badgeTxt}: ${candFull}`;
      ctx.font = `800 ${Math.round(12.5 * cScale)}px ${BENGALI_FONT_STACK}`;
      const bannerLines = wrapCanvasText(ctx, bannerText, mainW - 12).slice(0, 2);
      const bannerLineH = Math.round(16 * cScale);
      const bannerH = Math.max(Math.round(22 * cScale), bannerLines.length * bannerLineH + 6);
      ctx.fillStyle = inkColor;
      ctx.fillRect(mainX, y, mainW, bannerH);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      let by = y + 3;
      for (const bl of bannerLines) {
        ctx.fillText(bl, mainX + 6, by);
        by += bannerLineH;
      }
      ctx.fillStyle = inkColor;
      y += bannerH + Math.round(5 * spacing);

      // Polling Center & Ward Strip
      if (cs.showPollingCenter || cs.showWardAndArea) {
        ctx.font = `700 ${Math.round(10.8 * vScale)}px ${BENGALI_FONT_STACK}`;
        const parts: string[] = [];
        if (cs.showPollingCenter && config.pollingCenter) {
          parts.push(`কেন্দ্র: ${config.pollingCenter}`);
        }
        if (cs.showWardAndArea) {
          parts.push(
            `এলাকা: ${voter.villageName || config.voterArea || '-'} (ওয়ার্ড: ${config.wardNo || '-'})`
          );
        }
        const metaLines = wrapCanvasText(ctx, parts.join('  •  '), mainW).slice(0, 2);
        for (const ml of metaLines) {
          if (y + 13 > bottomLimit) break;
          ctx.fillText(ml, mainX, y);
          y += Math.round(14 * vScale * spacing);
        }
        drawHorizontalRule(ctx, mainX, mainX + mainW, y + 1, inkColor, true);
        y += Math.round(5 * spacing);
      }

      // Voter Fields (cleanly wrapped so Bengali letters are never squished!)
      const rowStep = Math.round(16 * vScale * spacing);
      const drawLandscapeField = (text: string, bold = false, maxLines = 1) => {
        if (!text || y + 12 > bottomLimit) return;
        ctx.font = `${bold ? 800 : 700} ${Math.round((bold ? 13 : 11.2) * vScale)}px ${BENGALI_FONT_STACK}`;
        const lines = wrapCanvasText(ctx, text, mainW).slice(0, maxLines);
        for (const ln of lines) {
          if (y + 12 > bottomLimit) break;
          ctx.fillText(ln, mainX, y);
          if (fillMode === 'lined') {
            drawLinedGuide(ctx, mainX, mainX + mainW, y + Math.round(14.5 * vScale), inkColor);
          }
          y += bold ? Math.round(17.5 * vScale * spacing) : rowStep;
        }
      };

      if (fillMode === 'blank') {
        ctx.font = `700 ${Math.round(11 * vScale)}px ${BENGALI_FONT_STACK}`;
        const blankRows = [
          'নাম: ............................................  ক্রমিক: ............',
          'পিতা/স্বামী: ....................................  মাতা: ....................',
          'ভোটার আইডি: ..................................  জন্ম: ....................',
        ];
        for (const br of blankRows) {
          if (y + rowStep > bottomLimit) break;
          ctx.fillText(br, mainX, y, mainW);
          y += rowStep;
        }
      } else {
        const namePart = cs.showSerial
          ? `ক্রমিক: ${voter.serialNo || '-'}  |  নাম: ${voter.name || '-'}`
          : `নাম: ${voter.name || '-'}`;
        drawLandscapeField(namePart, true, 2);

        if (cs.showVoterId) {
          const idDob = [
            `ভোটার আইডি: ${voter.voterId || '-'}`,
            cs.showDob && voter.dob ? `জন্ম: ${voter.dob}` : '',
          ]
            .filter(Boolean)
            .join('   |   ');
          drawLandscapeField(idDob, false, 1);
        }

        if (cs.showFather || cs.showMother) {
          const parents = [
            cs.showFather ? `পিতা/স্বামী: ${voter.fatherName || '-'}` : '',
            cs.showMother ? `মাতা: ${voter.motherName || '-'}` : '',
          ]
            .filter(Boolean)
            .join('   |   ');
          drawLandscapeField(parents, false, 2);
        }

        if (cs.showProfession || cs.showAddress) {
          const addrProf = [
            cs.showProfession && voter.profession ? `পেশা: ${voter.profession}` : '',
            cs.showAddress ? `ঠিকানা: ${voter.address || voter.villageName || '-'}` : '',
          ]
            .filter(Boolean)
            .join('   |   ');
          drawLandscapeField(addrProf, false, 1);
        }
      }

      // Footer Strip
      if (cs.showFooter) {
        const fy = cardHeight - innerPad - footerH;
        ctx.fillStyle = inkColor;
        ctx.fillRect(mainX, fy, mainW, footerH);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = `700 ${Math.round(10 * baseScale)}px ${BENGALI_FONT_STACK}`;
        ctx.fillText(
          config.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT,
          mainX + mainW / 2,
          fy + Math.max(2, Math.round(2.5 * baseScale)),
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
  // dynamic two-pass exact height measurement with zero GPU reallocation thrash!)
  // ===========================================================================
  const width = rollDots;
  const innerPad = cs.borderStyle === 'double' ? Math.max(padPx, 12) : Math.max(padPx, 10);
  const contentW = width - innerPad * 2;

  const renderPortraitPass = (
    ctx: CanvasRenderingContext2D,
    dryRun: boolean,
    logicalHeight = 800
  ): number => {
    let y = innerPad;

    if (!dryRun) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, logicalHeight);
      ctx.fillStyle = inkColor;
      ctx.textBaseline = 'top';
    }

    // 1. Religious Header
    if (cs.showReligiousHeader && config.religiousHeader) {
      ctx.font = `700 ${Math.round(12 * hScale)}px ${BENGALI_FONT_STACK}`;
      const rLines = wrapCanvasText(ctx, config.religiousHeader, contentW);
      for (const rl of rLines) {
        if (!dryRun) {
          ctx.textAlign = 'center';
          ctx.fillStyle = inkColor;
          ctx.fillText(rl, width / 2, y);
        }
        y += Math.round(17 * hScale * spacing);
      }
    }

    // 2. Election Title & Constituency
    if (cs.showElectionTitle) {
      if (config.electionTitle) {
        ctx.font = `800 ${Math.round(14.5 * hScale)}px ${BENGALI_FONT_STACK}`;
        const lines = wrapCanvasText(ctx, config.electionTitle, contentW);
        for (const ln of lines) {
          if (!dryRun) {
            ctx.textAlign = 'center';
            ctx.fillStyle = inkColor;
            ctx.fillText(ln, width / 2, y);
          }
          y += Math.round(18.5 * hScale * spacing);
        }
      }
      const subText = config.constituencyText || config.electionSubtitle || '';
      if (subText) {
        ctx.font = `700 ${Math.round(11.2 * hScale)}px ${BENGALI_FONT_STACK}`;
        const lines = wrapCanvasText(ctx, subText, contentW);
        for (const ln of lines) {
          if (!dryRun) {
            ctx.textAlign = 'center';
            ctx.fillStyle = inkColor;
            ctx.fillText(ln, width / 2, y);
          }
          y += Math.round(15.5 * hScale * spacing);
        }
      }
    }

    if (cs.showReligiousHeader || cs.showElectionTitle) {
      y += 3;
      if (!dryRun) drawHorizontalRule(ctx, innerPad, width - innerPad, y, inkColor, true);
      y += Math.round(7 * spacing);
    }

    // 3. Candidate Hero Row (Skipped completely when cs.voterOnlyMode === true!)
    if (cs.voterOnlyMode) {
      const voBannerH = Math.round(28 * baseScale);
      if (!dryRun) {
        ctx.fillStyle = inkColor;
        ctx.fillRect(innerPad, y, contentW, voBannerH);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = `900 ${Math.round(14 * baseScale)}px ${BENGALI_FONT_STACK}`;
        ctx.fillText(
          'ভোটার তথ্য স্লিপ',
          width / 2,
          y + Math.max(3, Math.round((voBannerH - 17 * baseScale) / 2)),
          contentW - 10
        );
        ctx.fillStyle = inkColor;
      }
      y += voBannerH + Math.round(7 * spacing);
    } else {
      const symW = cs.showSymbolPhoto ? Math.round(78 * baseScale * cs.symbolScale) : 0;
      const symH = cs.showSymbolPhoto ? Math.round(74 * baseScale * cs.symbolScale) : 0;
      const photoW = cs.showCandidatePhoto ? Math.round(104 * baseScale * cs.photoScale) : 0;
      const photoH = cs.showCandidatePhoto ? Math.round(126 * baseScale * cs.photoScale) : 0;

      const leftBoxW = cs.swapPhotoSymbol ? photoW : symW;
      const rightBoxW = cs.swapPhotoSymbol ? symW : photoW;
      const centerXStart = innerPad + (leftBoxW > 0 ? leftBoxW + 7 : 0);
      const centerW = Math.max(
        92,
        contentW - (leftBoxW > 0 ? leftBoxW + 7 : 0) - (rightBoxW > 0 ? rightBoxW + 7 : 0)
      );
      const centerXMid = centerXStart + centerW / 2;

      // Measure & draw center column
      let centerY = y + 3;
      const badgeLabel = config.candidateBadge || config.postTitle || 'পদপ্রার্থী';
      ctx.font = `700 ${Math.round(10.8 * cScale)}px ${BENGALI_FONT_STACK}`;
      const badgeLines = wrapCanvasText(ctx, badgeLabel, centerW - 8).slice(0, 2);
      const badgeLineH = Math.round(14.5 * cScale);
      const badgeH = Math.max(Math.round(20 * cScale), badgeLines.length * badgeLineH + 5);

      if (!dryRun) {
        ctx.fillStyle = inkColor;
        ctx.fillRect(centerXStart, centerY, centerW, badgeH);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        let by = centerY + 3;
        for (const bl of badgeLines) {
          ctx.fillText(bl, centerXMid, by);
          by += badgeLineH;
        }
        ctx.fillStyle = inkColor;
      }
      centerY += badgeH + Math.round(6 * spacing);

      ctx.font = `800 ${Math.round(15 * cScale)}px ${BENGALI_FONT_STACK}`;
      const fullName = `${config.candidateName || config.name} ${config.candidateSuffix || 'কে'}`.trim();
      const nameLines = wrapCanvasText(ctx, fullName, centerW);
      for (const nl of nameLines) {
        if (!dryRun) {
          ctx.textAlign = 'center';
          ctx.fillStyle = inkColor;
          ctx.fillText(nl, centerXMid, centerY);
        }
        centerY += Math.round(19 * cScale * spacing);
      }

      const calloutStr = config.symbolCallout || `${config.symbolName} মার্কায় ভোট দিন`;
      ctx.font = `800 ${Math.round(11 * cScale)}px ${BENGALI_FONT_STACK}`;
      const callLines = wrapCanvasText(ctx, calloutStr, centerW);
      for (const cl of callLines) {
        if (!dryRun) {
          ctx.textAlign = 'center';
          ctx.fillStyle = inkColor;
          ctx.fillText(cl, centerXMid, centerY + 1);
        }
        centerY += Math.round(15 * cScale * spacing);
      }

      if (cs.showSlogan && config.sloganText) {
        ctx.font = `600 ${Math.round(9.5 * baseScale)}px ${BENGALI_FONT_STACK}`;
        const slLines = wrapCanvasText(ctx, config.sloganText, centerW).slice(0, 2);
        for (const sl of slLines) {
          if (!dryRun) {
            ctx.textAlign = 'center';
            ctx.fillStyle = inkColor;
            ctx.fillText(sl, centerXMid, centerY + 1);
          }
          centerY += Math.round(13 * baseScale * spacing);
        }
      }

      // Draw Symbol & Candidate Photo on their chosen sides
      const symBlockH = cs.showSymbolPhoto ? symH + Math.round(20 * baseScale) : 0;
      const photoBlockH = cs.showCandidatePhoto ? photoH + Math.round(18 * baseScale) : 0;

      if (!dryRun) {
        if (cs.showSymbolPhoto) {
          const sx = cs.swapPhotoSymbol ? width - innerPad - symW : innerPad;
          if (symImg) {
            drawImageContain(ctx, symImg, sx, y + 2, symW, symH, symMediaSrc);
          }
          ctx.textAlign = 'center';
          ctx.fillStyle = inkColor;
          ctx.font = `700 ${Math.round(10.2 * baseScale)}px ${BENGALI_FONT_STACK}`;
          ctx.fillText(`মার্কা: ${config.symbolName || ''}`, sx + symW / 2, y + symH + 4, symW + 4);
        }

        if (cs.showCandidatePhoto) {
          const px = cs.swapPhotoSymbol ? innerPad : width - innerPad - photoW;
          if (candImg) {
            drawImageCoverTop(ctx, candImg, px, y + 2, photoW, photoH, candMediaSrc);
          }
          ctx.lineWidth = 1.3;
          ctx.strokeStyle = inkColor;
          ctx.strokeRect(px, y + 2, photoW, photoH);
          ctx.textAlign = 'center';
          ctx.fillStyle = inkColor;
          ctx.font = `700 ${Math.round(10 * baseScale)}px ${BENGALI_FONT_STACK}`;
          ctx.fillText('প্রার্থী', px + photoW / 2, y + photoH + 4, photoW);
        }
      }

      const heroHeight = Math.max(centerY - y, symBlockH, photoBlockH);
      y += heroHeight + Math.round(6 * spacing);

      if (!dryRun) drawHorizontalRule(ctx, innerPad, width - innerPad, y, inkColor, false);
      y += Math.round(7 * spacing);
    }

    // 4. Polling Center & Ward / Area
    if (cs.showPollingCenter && config.pollingCenter) {
      ctx.font = `700 ${Math.round(12.2 * vScale)}px ${BENGALI_FONT_STACK}`;
      const cLines = wrapCanvasText(ctx, `ভোট কেন্দ্র: ${config.pollingCenter}`, contentW);
      for (const cl of cLines) {
        if (!dryRun) {
          ctx.textAlign = 'left';
          ctx.fillStyle = inkColor;
          ctx.fillText(cl, innerPad, y);
        }
        y += Math.round(17 * vScale * spacing);
      }
    }

    if (cs.showWardAndArea) {
      ctx.font = `700 ${Math.round(11.8 * vScale)}px ${BENGALI_FONT_STACK}`;
      const areaLabel = `এলাকা: ${voter.villageName || config.voterArea || '-'}`;
      const wardLabel = `ওয়ার্ড নং: ${config.wardNo || '-'}`;
      const combinedWidth =
        ctx.measureText(areaLabel).width + ctx.measureText(wardLabel).width + 16;
      if (combinedWidth <= contentW) {
        if (!dryRun) {
          ctx.fillStyle = inkColor;
          ctx.textAlign = 'left';
          ctx.fillText(areaLabel, innerPad, y);
          ctx.textAlign = 'right';
          ctx.fillText(wardLabel, width - innerPad, y);
        }
        y += Math.round(17 * vScale * spacing);
      } else {
        const awLines = wrapCanvasText(ctx, `${areaLabel}  •  ${wardLabel}`, contentW);
        for (const al of awLines) {
          if (!dryRun) {
            ctx.fillStyle = inkColor;
            ctx.textAlign = 'left';
            ctx.fillText(al, innerPad, y);
          }
          y += Math.round(16.5 * vScale * spacing);
        }
      }
    }

    if (cs.showPollingCenter || cs.showWardAndArea) {
      y += 2;
      if (!dryRun) drawHorizontalRule(ctx, innerPad, width - innerPad, y, inkColor, true);
      y += Math.round(7 * spacing);
    }

    // 5. Voter Details Section (cleanly wrapped, enlarged when voterOnlyMode is active)
    const pVoterScale = vScale * (cs.voterOnlyMode ? 1.18 : 1);
    const vStep = Math.round(19.5 * pVoterScale * spacing);
    const drawWrappedVoterField = (labelAndVal: string) => {
      ctx.font = `700 ${Math.round(12.5 * pVoterScale)}px ${BENGALI_FONT_STACK}`;
      const lines = wrapCanvasText(ctx, labelAndVal, contentW);
      for (const ln of lines) {
        if (!dryRun) {
          ctx.textAlign = 'left';
          ctx.fillStyle = inkColor;
          ctx.fillText(ln, innerPad, y);
          if (fillMode === 'lined') {
            drawLinedGuide(
              ctx,
              innerPad,
              width - innerPad,
              y + Math.round(16.5 * pVoterScale),
              inkColor
            );
          }
        }
        y += vStep;
      }
    };

    if (fillMode === 'blank') {
      ctx.font = `700 ${Math.round(12 * pVoterScale)}px ${BENGALI_FONT_STACK}`;
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
          ctx.fillStyle = inkColor;
          ctx.fillText(bf, innerPad, y, contentW);
        }
        y += vStep;
      }
    } else {
      // Highlighted Serial + Name Box
      ctx.font = `800 ${Math.round(14.5 * pVoterScale)}px ${BENGALI_FONT_STACK}`;
      const headVoter = cs.showSerial
        ? `ক্রমিক: ${voter.serialNo || '-'}  |  ${voter.name || '-'}`
        : `নাম: ${voter.name || '-'}`;
      const vNameLines = wrapCanvasText(ctx, headVoter, contentW - 12);
      const lineH = Math.round(19 * pVoterScale);
      const boxH = vNameLines.length * lineH + 9;
      if (!dryRun) {
        if (previewQuality) {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(innerPad, y, contentW, boxH);
        }
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(innerPad, y, contentW, boxH);
        ctx.fillStyle = inkColor;
        ctx.textAlign = 'left';
        let ny = y + 4.5;
        for (const nl of vNameLines) {
          ctx.fillText(nl, innerPad + 6, ny);
          ny += lineH;
        }
      }
      y += boxH + Math.round(7 * spacing);

      if (cs.showVoterId) {
        drawWrappedVoterField(`ভোটার আইডি: ${voter.voterId || '-'}`);
      }

      if (cs.showFather) {
        drawWrappedVoterField(`পিতা/স্বামী: ${voter.fatherName || '-'}`);
      }

      if (cs.showMother) {
        drawWrappedVoterField(`মাতা: ${voter.motherName || '-'}`);
      }

      const dobProf = [
        cs.showDob && voter.dob ? `জন্ম: ${voter.dob}` : '',
        cs.showProfession && voter.profession ? `পেশা: ${voter.profession}` : '',
      ]
        .filter(Boolean)
        .join('   |   ');
      if (dobProf) {
        drawWrappedVoterField(dobProf);
      }

      if (cs.showAddress) {
        drawWrappedVoterField(`ঠিকানা: ${voter.address || voter.villageName || '-'}`);
      }
    }

    // 6. Footer
    if (cs.showFooter) {
      y += 3;
      if (!dryRun) drawHorizontalRule(ctx, innerPad, width - innerPad, y, inkColor, true);
      y += Math.round(6 * spacing);
      ctx.font = `800 ${Math.round(11.2 * baseScale)}px ${BENGALI_FONT_STACK}`;
      const fLines = wrapCanvasText(
        ctx,
        config.footerCenterText || DEFAULT_SLIP_FOOTER_TEXT,
        contentW
      );
      for (const fl of fLines) {
        if (!dryRun) {
          ctx.textAlign = 'center';
          ctx.fillStyle = inkColor;
          ctx.fillText(fl, width / 2, y);
        }
        y += Math.round(16 * baseScale * spacing);
      }
    }

    y += innerPad;
    return Math.ceil(y / 8) * 8;
  };

  // Pass 1: Measure exact height on offscreen context (no visible canvas flicker!)
  const measureCtx = getMeasureContext() || canvas.getContext('2d');
  const exactHeight = measureCtx ? renderPortraitPass(measureCtx, true) : 512;

  // Pass 2: Resize visible canvas ONLY if physical dimensions changed & draw at HD pixelScale
  const targetPhysW = Math.round(width * pixelScale);
  const targetPhysH = Math.round(exactHeight * pixelScale);
  if (canvas.width !== targetPhysW) canvas.width = targetPhysW;
  if (canvas.height !== targetPhysH) canvas.height = targetPhysH;

  const drawCtx = canvas.getContext('2d');
  if (drawCtx) {
    configureHighQualityContext(drawCtx, pixelScale);
    renderPortraitPass(drawCtx, false, exactHeight);
    drawOuterBorder(drawCtx, width, exactHeight, cs.borderStyle, inkColor, 3);
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

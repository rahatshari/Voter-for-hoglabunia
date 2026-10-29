import QRCode from 'qrcode';
import { CandidateProfile, Voter } from '../types';

export const DEFAULT_CANDIDATES: CandidateProfile[] = [
  {
    id: 'cand_ismail_pathamara',
    name: 'মাওলানা মোঃ ইসমাইল',
    postTitle: 'মেম্বার পদপ্রার্থী',
    religiousHeader: 'বিসমিল্লাহির রাহমানির রাহিম',
    electionTitle: 'আসন্ন ইউনিয়ন পরিষদ নির্বাচনে',
    electionSubtitle: 'সততা ও নিষ্ঠার সাথে গণমানুষের প্রিয় মেম্বার প্রার্থী',
    candidateBadge: 'মেম্বার প্রার্থী',
    candidateName: 'মাওলানা মোঃ ইসমাইল',
    candidatePhotoUrl: './candidate-default.jpg',
    symbolName: 'তালা',
    symbolPhotoUrl: './symbol-default.png',
    symbolCallout: 'তালা মার্কায় ভোট দিন',
    pollingCenter: 'দারুল কোরআন সিনিয়র মাদ্রাসা',
    voterArea: 'পাঠামারা',
    wardNo: '০৭',
    isCustom: false,
  },
];

export const DEFAULT_SLIP_CONFIG = DEFAULT_CANDIDATES[0];

const CANDIDATES_STORAGE_KEY = 'union_candidates_list_v3';
const ACTIVE_CANDIDATE_ID_KEY = 'union_active_candidate_id_v3';

export function getAllCandidates(): CandidateProfile[] {
  try {
    const raw = localStorage.getItem(CANDIDATES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Ensure old dummy candidate records are cleared
      const hasOldDummy = Array.isArray(parsed) && parsed.some((c) =>
        ['cand_sohrab_eagle', 'cand_rafiq_pineapple', 'cand_delwar_motorcycle', 'cand_shafiq_football'].includes(c.id)
      );
      if (Array.isArray(parsed) && parsed.length > 0 && !hasOldDummy) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse candidates list:', e);
  }
  // Initialize storage with Maulana Md. Ismail
  localStorage.setItem(CANDIDATES_STORAGE_KEY, JSON.stringify(DEFAULT_CANDIDATES));
  localStorage.setItem(ACTIVE_CANDIDATE_ID_KEY, DEFAULT_CANDIDATES[0].id);
  return DEFAULT_CANDIDATES;
}

export function saveAllCandidates(candidates: CandidateProfile[]): void {
  try {
    localStorage.setItem(CANDIDATES_STORAGE_KEY, JSON.stringify(candidates));
  } catch (e) {
    console.warn('Failed to save candidates list:', e);
  }
}

export function getActiveCandidate(): CandidateProfile {
  const all = getAllCandidates();
  try {
    const activeId = localStorage.getItem(ACTIVE_CANDIDATE_ID_KEY);
    if (activeId) {
      const found = all.find((c) => c.id === activeId);
      if (found) return found;
    }
  } catch (e) {}
  return all[0] || DEFAULT_SLIP_CONFIG;
}

export function setActiveCandidateId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_CANDIDATE_ID_KEY, id);
  } catch (e) {}
}

export function saveCandidateProfile(candidate: CandidateProfile): CandidateProfile[] {
  const all = getAllCandidates();
  const index = all.findIndex((c) => c.id === candidate.id);
  let updated: CandidateProfile[];
  if (index >= 0) {
    updated = [...all];
    updated[index] = candidate;
  } else {
    updated = [candidate, ...all];
  }
  saveAllCandidates(updated);
  setActiveCandidateId(candidate.id);
  return updated;
}

export function deleteCandidateProfile(id: string): CandidateProfile[] {
  const all = getAllCandidates();
  const updated = all.filter((c) => c.id !== id);
  const finalUpdated = updated.length > 0 ? updated : DEFAULT_CANDIDATES;
  saveAllCandidates(finalUpdated);
  setActiveCandidateId(finalUpdated[0].id);
  return finalUpdated;
}

// Generate QR Code data URL synchronously or with fallback
export async function generateVoterQrCode(voter: Voter, config: CandidateProfile): Promise<string> {
  const text = `SL: ${voter.serialNo || '-'}\nNAME: ${voter.name || '-'}\nNID: ${
    voter.voterId || '-'
  }\nFATHER: ${voter.fatherName || '-'}\nCENTER: ${config.pollingCenter || '-'}\nWARD: ${
    config.wardNo || '-'
  }`;
  try {
    return await QRCode.toDataURL(text, {
      width: 130,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch (e) {
    return '';
  }
}

export type PrintLayoutMode = 'single' | 'sheet6' | 'thermal58' | 'thermal80';

export async function printVoterSlips(
  voters: Voter[],
  config: CandidateProfile,
  mode: PrintLayoutMode = 'single',
  colorMode: 'color' | 'bw' = 'bw'
) {
  const isThermal = mode === 'thermal58' || mode === 'thermal80';
  const thermalWidth = mode === 'thermal80' ? '80mm' : '58mm';
  const isSheet = mode === 'sheet6';
  const slipVoters = isSheet && voters.length === 1 ? Array(6).fill(voters[0]) : voters;

  // Render for Mini Bluetooth POS Thermal Printer (58mm / 80mm)
  if (isThermal) {
    const thermalSlipsHTML = slipVoters
      .map((voter) => {
        return `
        <div class="thermal-ticket">
          <!-- Religious Header -->
          <div class="th-religious">${config.religiousHeader || 'আল্লাহ সর্বশক্তিমান'}</div>

          <!-- Election Header -->
          <div class="th-election">${config.electionTitle}</div>
          <div class="th-subtitle">${config.electionSubtitle}</div>

          <!-- Cut / separator -->
          <div class="th-dashed">--------------------------------</div>

          <!-- Candidate & Symbol Headline with Photo and Symbol -->
          <div class="th-candidate-box">
            <div class="th-cand-row">
              <div class="th-symbol-col">
                <img src="${config.symbolPhotoUrl || '/symbol-default.png'}" alt="মার্কা" class="th-symbol-img" />
                <div class="th-symbol-name">${config.symbolName}</div>
                <div class="th-symbol-btn">${config.symbolCallout || 'ভোট দিন'}</div>
              </div>

              <div class="th-cand-center">
                <div class="th-badge">${config.candidateBadge || 'স্বতন্ত্র প্রার্থী'}</div>
                <div class="th-candidate-name">${config.candidateName}-কে</div>
                <div class="th-post-title">${config.postTitle || 'চেয়ারম্যান পদপ্রার্থী'}</div>
              </div>

              <div class="th-photo-col">
                <img src="${config.candidatePhotoUrl || '/candidate-default.jpg'}" alt="প্রার্থী" class="th-cand-img" />
                <div class="th-photo-label">প্রার্থী</div>
              </div>
            </div>
          </div>

          <div class="th-dashed">================================</div>

          <!-- Polling Center Info -->
          <div class="th-center-box">
            <div><b>কেন্দ্র:</b> ${config.pollingCenter}</div>
            <div class="th-flex">
              <div><b>এলাকা:</b> ${voter.villageName || config.voterArea}</div>
              <div><b>ওয়ার্ড:</b> ${config.wardNo}</div>
            </div>
          </div>

          <div class="th-dashed">--------------------------------</div>

          <!-- Voter Information (High-Contrast for 58mm Thermal paper) -->
          <div class="th-voter-info">
            <div class="th-name-row">
              <span class="th-serial">${voter.serialNo || '-'}.</span>
              <span class="th-name">${voter.name || '-'}</span>
            </div>
            <div><b>ভোটার নং:</b> <span class="th-mono">${voter.voterId || '-'}</span></div>
            <div><b>পিতা:</b> ${voter.fatherName || '-'}</div>
            <div><b>মাতা:</b> ${voter.motherName || '-'}</div>
            <div><b>পেশা:</b> ${voter.profession || '-'} | <b>জন্ম:</b> ${voter.dob || '-'}</div>
            <div class="th-address"><b>ঠিকানা:</b> ${voter.address || voter.villageName || '-'}</div>
          </div>

          <div class="th-dashed">================================</div>
          <div class="th-footer">ভোট আপনার নাগরিক অধিকার ও পবিত্র আমানত</div>
          <div class="th-cut-space">.</div>
        </div>
      `;
      })
      .join('<div class="thermal-page-break"></div>');

    const thermalDoc = `
      <!DOCTYPE html>
      <html lang="bn">
      <head>
        <meta charset="UTF-8">
        <title>থার্মাল স্লিপ - ${voters[0]?.name || 'স্লিপ'}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@500;700;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Noto Sans Bengali', monospace, -apple-system, sans-serif;
            background: #fff;
            color: #000;
            width: ${thermalWidth};
            margin: 0 auto;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: ${thermalWidth} auto;
            margin: 0;
          }
          .thermal-ticket {
            width: ${thermalWidth};
            padding: 2mm 3mm 4mm 3mm;
            text-align: center;
            font-size: 11px;
            line-height: 1.25;
            color: #000;
            background: #fff;
          }
          .thermal-page-break {
            page-break-after: always;
            border-bottom: 2px dashed #000;
            margin: 4mm 0;
          }
          .th-religious {
            font-size: 10px;
            font-weight: 700;
            margin-bottom: 2px;
          }
          .th-election {
            font-size: 11.5px;
            font-weight: 900;
            line-height: 1.15;
          }
          .th-subtitle {
            font-size: 9.5px;
            font-weight: 700;
            line-height: 1.15;
            margin-top: 1px;
          }
          .th-dashed {
            font-family: monospace;
            font-size: 10px;
            font-weight: bold;
            overflow: hidden;
            white-space: nowrap;
            margin: 2px 0;
          }
          .th-candidate-box {
            padding: 3px 0;
          }
          .th-cand-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 4px;
            padding: 2px 0;
          }
          .th-symbol-col {
            width: 58px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            flex-shrink: 0;
          }
          .th-symbol-img {
            width: 48px;
            height: 48px;
            object-fit: contain;
            filter: contrast(140%) grayscale(100%);
          }
          .th-symbol-name {
            font-size: 10px;
            font-weight: 900;
            line-height: 1.1;
            margin-top: 1px;
          }
          .th-symbol-btn {
            border: 1px solid #000;
            font-size: 8px;
            font-weight: 800;
            padding: 1px 3px;
            margin-top: 1px;
            line-height: 1;
          }
          .th-cand-center {
            flex: 1;
            text-align: center;
            min-width: 0;
            padding: 0 2px;
          }
          .th-badge {
            display: inline-block;
            border: 1px solid #000;
            border-radius: 9999px;
            padding: 0 6px;
            font-size: 8.5px;
            font-weight: 800;
            background: #000;
            color: #fff;
          }
          .th-candidate-name {
            font-size: 15px;
            font-weight: 900;
            margin: 2px 0;
            letter-spacing: -0.2px;
            line-height: 1.15;
          }
          .th-post-title {
            font-size: 9.5px;
            font-weight: 700;
            color: #111;
          }
          .th-photo-col {
            width: 54px;
            display: flex;
            flex-direction: column;
            align-items: center;
            flex-shrink: 0;
          }
          .th-cand-img {
            width: 50px;
            height: 60px;
            object-fit: cover;
            border: 1.2px solid #000;
            border-radius: 2px;
            filter: contrast(130%) grayscale(100%);
          }
          .th-photo-label {
            font-size: 8px;
            font-weight: 700;
            margin-top: 1px;
          }
          .th-center-box {
            text-align: left;
            font-size: 10px;
            line-height: 1.25;
          }
          .th-flex {
            display: flex;
            justify-content: space-between;
            margin-top: 1px;
          }
          .th-voter-info {
            text-align: left;
            font-size: 10.5px;
            line-height: 1.3;
          }
          .th-name-row {
            font-size: 12px;
            font-weight: 900;
            margin-bottom: 2px;
          }
          .th-serial {
            font-size: 13px;
            margin-right: 2px;
          }
          .th-mono {
            font-family: monospace;
            font-weight: 900;
            font-size: 11px;
          }
          .th-address {
            font-size: 9.5px;
            line-height: 1.2;
          }
          .th-qr-box {
            margin: 4px auto 2px auto;
            text-align: center;
          }
          .th-qr-img {
            width: 78px;
            height: 78px;
            margin: 0 auto;
            display: block;
          }
          .th-qr-label {
            font-size: 8.5px;
            font-weight: 700;
            margin-top: 1px;
          }
          .th-footer {
            font-size: 9px;
            font-weight: 800;
            margin-top: 2px;
          }
          .th-cut-space {
            color: transparent;
            height: 12mm;
          }
        </style>
      </head>
      <body>
        ${thermalSlipsHTML}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        <\/script>
      </body>
      </html>
    `;

    openPrintWindow(thermalDoc);
    return;
  }

  // Standard A4 / Card Render
  const renderSingleSlipHTML = (voter: Voter) => {
    const candidateImg = config.candidatePhotoUrl || '/candidate-default.jpg';
    const symbolImg = config.symbolPhotoUrl || '/symbol-default.png';
    const serial = voter.serialNo || '-';
    const name = voter.name || '-';
    const voterId = voter.voterId || '-';
    const father = voter.fatherName || '-';
    const mother = voter.motherName || '-';
    const profession = voter.profession || '-';
    const dob = voter.dob || '-';
    const address = voter.address || voter.villageName || '-';
    const area = voter.villageName || config.voterArea || '-';

    return `
      <div class="slip-card ${colorMode === 'bw' ? 'bw-filter' : ''}">
        <!-- Top Religious Header -->
        <div class="slip-top-header">
          ${config.religiousHeader || 'আল্লাহ সর্বশক্তিমান'}
        </div>

        <!-- Election Title & Candidate Badge -->
        <div class="slip-sub-row">
          <div class="slip-election-info">
            <div class="election-title">${config.electionTitle}</div>
            <div class="election-subtitle">${config.electionSubtitle}</div>
          </div>
          ${
            config.candidateBadge
              ? `<div class="candidate-badge">${config.candidateBadge}</div>`
              : ''
          }
        </div>

        <!-- Big Candidate Name Heading -->
        <div class="candidate-heading">
          ${config.candidateName}-কে
        </div>

        <!-- Main Body: Symbol (Left) | Voter Details (Center) | Candidate Photo (Right) -->
        <div class="slip-body">
          <!-- Left: Symbol Box -->
          <div class="symbol-box">
            <div class="symbol-img-wrap">
              <img src="${symbolImg}" alt="প্রতীক" class="symbol-img" />
            </div>
            <div class="symbol-name">${config.symbolName}</div>
            <div class="symbol-callout">${config.symbolCallout}</div>
          </div>

          <!-- Middle: Polling info & Voter Info Table -->
          <div class="details-box">
            <!-- Center, Area, Ward Top Header -->
            <div class="center-header-box">
              <div class="center-row">
                <span class="label">ভোট কেন্দ্র:</span>
                <span class="val">${config.pollingCenter}</span>
              </div>
              <div class="area-ward-row">
                <div>
                  <span class="label">ভোটার এলাকা:</span>
                  <span class="val">${area}</span>
                </div>
                <div>
                  <span class="label">ওয়ার্ড নং:</span>
                  <span class="val">${config.wardNo}</span>
                </div>
              </div>
            </div>

            <!-- Voter Specific Details -->
            <div class="voter-info-table">
              <div class="voter-line voter-name-line">
                <span class="voter-serial">${serial}.</span>
                <span class="label">নাম:</span>
                <span class="val name-val">${name}</span>
              </div>
              <div class="voter-line">
                <span class="label">ভোটার নং:</span>
                <span class="val font-mono-id">${voterId}</span>
              </div>
              <div class="voter-line">
                <span class="label">পিতা:</span>
                <span class="val">${father}</span>
              </div>
              <div class="voter-line">
                <span class="label">মাতা:</span>
                <span class="val">${mother}</span>
              </div>
              <div class="voter-line">
                <span class="label">পেশা:</span>
                <span class="val">${profession}</span>
              </div>
              <div class="voter-line">
                <span class="label">জন্ম তারিখ:</span>
                <span class="val">${dob}</span>
              </div>
              <div class="voter-line address-line">
                <span class="label">ঠিকানা:</span>
                <span class="val">${address}</span>
              </div>
            </div>
          </div>

          <!-- Right: Candidate Photo -->
          <div class="candidate-photo-box">
            <img src="${candidateImg}" alt="প্রার্থী" class="candidate-photo" />
          </div>
        </div>
      </div>
    `;
  };

  const slipsHTML = slipVoters.map((v) => renderSingleSlipHTML(v)).join('');

  const printDocument = `
    <!DOCTYPE html>
    <html lang="bn">
    <head>
      <meta charset="UTF-8">
      <title>ভোটার স্লিপ - ${voters[0]?.name || 'নির্বাচনী স্লিপ'}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Noto Sans Bengali', system-ui, -apple-system, sans-serif;
          background: #fff;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @page {
          size: A4 portrait;
          margin: 8mm 6mm;
        }
        .slips-container {
          display: ${isSheet ? 'grid' : 'flex'};
          ${
            isSheet
              ? `
            grid-template-columns: 1fr 1fr;
            grid-gap: 5mm 4mm;
            width: 100%;
          `
              : `
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
          `
          }
        }
        .slip-card {
          border: 1.8px solid #000;
          border-radius: 4px;
          padding: 6px 8px 8px 8px;
          background: #fff;
          width: 100%;
          max-width: ${isSheet ? '100%' : '480px'};
          font-size: 11px;
          line-height: 1.25;
          position: relative;
          page-break-inside: avoid;
        }
        .bw-filter {
          filter: grayscale(100%) contrast(120%);
        }
        .slip-top-header {
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
          border-bottom: 0.5px dotted #666;
          padding-bottom: 1px;
        }
        .slip-sub-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          margin-bottom: 3px;
        }
        .slip-election-info { flex: 1; }
        .election-title {
          font-size: 10.5px;
          font-weight: 800;
          line-height: 1.15;
          color: #000;
        }
        .election-subtitle {
          font-size: 9px;
          font-weight: 600;
          color: #111;
          line-height: 1.15;
        }
        .candidate-badge {
          border: 1.5px solid #000;
          border-radius: 9999px;
          padding: 1px 7px;
          font-size: 9.5px;
          font-weight: 900;
          background: #000;
          color: #fff;
          white-space: nowrap;
          text-align: center;
          line-height: 1.3;
        }
        .candidate-heading {
          font-size: 17px;
          font-weight: 900;
          text-align: left;
          letter-spacing: -0.2px;
          color: #000;
          margin-bottom: 5px;
          line-height: 1.1;
          border-bottom: 1.5px solid #000;
          padding-bottom: 3px;
        }
        .slip-body {
          display: flex;
          gap: 6px;
          align-items: stretch;
        }
        .symbol-box {
          width: 78px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
          text-align: center;
        }
        .symbol-img-wrap {
          width: 74px;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 2px;
        }
        .symbol-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        .symbol-name {
          font-size: 12.5px;
          font-weight: 900;
          color: #000;
          line-height: 1.1;
          margin-top: 1px;
        }
        .symbol-callout {
          border: 1.5px solid #000;
          font-size: 9.5px;
          font-weight: 800;
          padding: 2px 3px;
          margin-top: 3px;
          width: 100%;
          background: #fff;
          line-height: 1.1;
        }
        .details-box {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .center-header-box {
          border: 1.2px solid #000;
          border-radius: 4px;
          padding: 3px 5px;
          margin-bottom: 4px;
          background: #fafafa;
          font-size: 9.5px;
          line-height: 1.2;
        }
        .center-row {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .area-ward-row {
          display: flex;
          justify-content: space-between;
          gap: 4px;
          margin-top: 1px;
        }
        .voter-info-table {
          font-size: 10px;
          line-height: 1.35;
        }
        .voter-line {
          display: flex;
          align-items: baseline;
          gap: 3px;
        }
        .voter-name-line {
          font-size: 11px;
          font-weight: 800;
          margin-bottom: 1px;
        }
        .voter-serial {
          font-weight: 900;
          font-size: 11.5px;
        }
        .name-val {
          font-size: 11.5px;
          font-weight: 800;
        }
        .label {
          font-weight: 700;
          color: #222;
          flex-shrink: 0;
        }
        .val {
          font-weight: 600;
          color: #000;
        }
        .font-mono-id {
          font-family: monospace, sans-serif;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.5px;
        }
        .address-line {
          margin-top: 1px;
          line-height: 1.2;
        }
        .candidate-photo-box {
          width: 90px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.2px solid #000;
          border-radius: 3px;
          overflow: hidden;
          background: #f1f5f9;
        }
        .candidate-photo {
          width: 100%;
          height: 100%;
          max-height: 145px;
          object-fit: cover;
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="slips-container">
        ${slipsHTML}
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 350);
        };
      <\/script>
    </body>
    </html>
  `;

  openPrintWindow(printDocument);
}

function openPrintWindow(html: string) {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 60000);
      }, 500);
    }
  }
}

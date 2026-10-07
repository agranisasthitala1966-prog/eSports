const fs = require('fs');

let code = fs.readFileSync('src/components/HitList.tsx', 'utf8');

// Fix the main container and style tag at lines 352-416
const oldContainerSearch = /<div className=\{[^}]*\}>\s*\{\/\* Scoped Print Styles: Hide web page completely on print \*\/\}[\s\S]*?<\/style>/;
const newContainerBlock = `<div className={\`max-w-6xl mx-auto space-y-4 sm:space-y-6 px-1 sm:px-0 hitlist-web-content \${printModalType ? 'print:hidden' : ''}\`}>
      {/* Scoped Print Styles: Hide web page completely on print */}
      <style>{\`
        @media print {
          header, nav, footer, .hitlist-web-content {
            display: none !important;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          \${modalFormat === 'thermal' ? \`
            @page {
              size: 58mm auto !important;
              margin: 0 !important;
            }
            body {
              width: 58mm !important;
              min-width: 58mm !important;
              max-width: 58mm !important;
              color: #000000 !important;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .thermal-printable-sheet {
              width: 48mm !important;
              max-width: 48mm !important;
              margin: 0 auto !important;
              padding: 1mm 0 4mm 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
            .thermal-printable-sheet * {
              color: #000000 !important;
              border-color: #000000 !important;
              background: transparent !important;
              box-shadow: none !important;
            }
            .thermal-printable-sheet img {
              filter: grayscale(100%) contrast(200%) !important;
              -webkit-filter: grayscale(100%) contrast(200%) !important;
            }
            .a4-printable-sheet {
              display: none !important;
            }
          \` : \`
            @page {
              size: A4 portrait !important;
              margin: 8mm 8mm !important;
            }
            body {
              width: 100% !important;
              color: #000000 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .a4-printable-sheet {
              display: block !important;
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              border: none !important;
              outline: none !important;
              box-shadow: none !important;
            }
            .thermal-printable-sheet {
              display: none !important;
            }
          \`}
        }
      \`}</style>`;

code = code.replace(oldContainerSearch, newContainerBlock);

// Update print buttons in top bar to set modalFormat and add thermal icon buttons
// 1. Button 0: Print Results
code = code.replace(
  `onClick={() => setPrintModalType('results')}`,
  `onClick={() => { setModalFormat('a4'); setPrintModalType('results'); }}`
);

const resultsBtnSearch = /(id="btn-print-results"[\s\S]*?<\/button>\s*\)\})/;
const resultsBtnReplacement = `$1
            {isRankingPrepared && (
              <button
                type="button"
                id="btn-thermal-results"
                onClick={() => {
                  setModalFormat('thermal');
                  setPrintModalType('results');
                }}
                className="p-1.5 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1 transition-all shadow-md cursor-pointer whitespace-nowrap"
                title="Print Results on 2-inch Thermal Printer"
              >
                <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden xl:inline text-[11px]">2" Thermal</span>
              </button>
            )}`;

code = code.replace(resultsBtnSearch, resultsBtnReplacement);

// 2. Button 1: Print Hit List
code = code.replace(
  `if (enrolledCandidates.length > 0 && !isAlreadyPromoted && !isRankingPrepared) {
                  setPrintModalType('hit');
                }`,
  `if (enrolledCandidates.length > 0 && !isAlreadyPromoted && !isRankingPrepared) {
                  setModalFormat('a4');
                  setPrintModalType('hit');
                }`
);

const hitBtnSearch = /(id="btn-print-hit-list"[\s\S]*?<\/button>)/;
const hitBtnReplacement = `$1
            <button
              type="button"
              id="btn-thermal-hit-list"
              onClick={() => {
                if (enrolledCandidates.length > 0 && !isAlreadyPromoted && !isRankingPrepared) {
                  setModalFormat('thermal');
                  setPrintModalType('hit');
                }
              }}
              disabled={enrolledCandidates.length === 0 || isAlreadyPromoted || isRankingPrepared}
              className={\`p-1.5 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1 transition-all shadow-md whitespace-nowrap \${
                isRankingPrepared || isAlreadyPromoted || enrolledCandidates.length === 0
                  ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-40'
                  : 'bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 cursor-pointer'
              }\`}
              title="Print Hit List on 2-inch Thermal Printer"
            >
              <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden xl:inline text-[11px]">2" Thermal</span>
            </button>`;

code = code.replace(hitBtnSearch, hitBtnReplacement);

// 3. Button 3: Print Final List
code = code.replace(
  `if (isAlreadyPromoted && !isRankingPrepared) {
                  setPrintModalType('final');
                }`,
  `if (isAlreadyPromoted && !isRankingPrepared) {
                  setModalFormat('a4');
                  setPrintModalType('final');
                }`
);

const finalBtnSearch = /(id="btn-print-final-list"[\s\S]*?<\/button>)/;
const finalBtnReplacement = `$1
            <button
              type="button"
              id="btn-thermal-final-list"
              onClick={() => {
                if (isAlreadyPromoted && !isRankingPrepared) {
                  setModalFormat('thermal');
                  setPrintModalType('final');
                }
              }}
              disabled={!isAlreadyPromoted || isRankingPrepared}
              className={\`p-1.5 sm:px-2.5 sm:py-2 rounded-lg sm:rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1 transition-all shadow-md whitespace-nowrap \${
                isRankingPrepared || !isAlreadyPromoted
                  ? 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-40'
                  : 'bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 cursor-pointer'
              }\`}
              title="Print Final List on 2-inch Thermal Printer"
            >
              <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden xl:inline text-[11px]">2" Thermal</span>
            </button>`;

code = code.replace(finalBtnSearch, finalBtnReplacement);

fs.writeFileSync('src/components/HitList.tsx', code, 'utf8');
console.log('Top bar buttons and container updated successfully');

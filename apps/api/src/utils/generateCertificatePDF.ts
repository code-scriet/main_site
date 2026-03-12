import React from 'react';
import {
  Document, Page, View, Text, Image,
  Svg, Path, Circle, Rect, Polygon, Line,
  Defs, LinearGradient, RadialGradient, Stop,
  Font,
  renderToBuffer,
} from '@react-pdf/renderer';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.join(__dirname, '..', '..', 'public', 'logos');

// ── CUSTOM FONTS (local TTF — no network at render time) ──────────────────────
const GREAT_VIBES_PATH       = path.join(LOGOS_DIR, 'GreatVibes.ttf');
const CINZEL_PATH            = path.join(LOGOS_DIR, 'Cinzel.ttf');
const CORMORANT_PATH         = path.join(LOGOS_DIR, 'CormorantGaramond.ttf');
const CORMORANT_ITALIC_PATH  = path.join(LOGOS_DIR, 'CormorantGaramond-Italic.ttf');

try { Font.register({ family: 'GreatVibes', src: GREAT_VIBES_PATH }); }
catch { /* fallback: Times-BoldItalic */ }

try { Font.register({ family: 'Cinzel', src: CINZEL_PATH }); }
catch { /* fallback: Helvetica-Bold */ }

try {
  Font.register({
    family: 'CormorantGaramond',
    fonts: [
      { src: CORMORANT_PATH },
      { src: CORMORANT_ITALIC_PATH, fontStyle: 'italic' },
    ],
  });
} catch { /* fallback: Times-Roman */ }

Font.registerHyphenationCallback((word: string) => [word]);

// ── LEGACY TEMPLATE TYPE (kept for API backwards compat — ignored in rendering) ──
export type CertTemplate = 'gold' | 'dark' | 'white' | 'emerald';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://codescriet.dev';

export interface CertData {
  recipientName:     string;
  eventName:         string;
  type:              string;
  position?:         string;
  domain?:           string;
  description?:      string;
  certId:            string;
  issuedAt:          Date;
  signatoryName:     string;
  facultyName?:      string;
  template?:         CertTemplate;   // accepted but ignored in rendering
  codescrietLogoUrl?: string;        // base64 data URI
  ccsuLogoUrl?:       string;        // base64 data URI
}

// A4 Landscape dimensions (points)
const W = 841.89;
const H = 595.28;

// ── COLOUR PALETTE ─────────────────────────────────────────────────────────────
const C = {
  bg:         '#0a0905',
  gold:       '#c9a84c',
  goldBright: '#f0d080',
  goldDark:   '#7a5a1c',
  goldMid:    '#9a7a2c',
  goldRibbon: '#b8922e',
  white:      '#ffffff',
  certIdGray: '#8a7a5a',
};

// ── HELPERS ────────────────────────────────────────────────────────────────────
function formatDateOrdinal(date: Date): string {
  const day = date.getDate();
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  const ord = suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0];
  return `${day}${ord} of ${date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
}

const subtitleMap: Record<string, string> = {
  PARTICIPATION: 'of Participation',
  COMPLETION:    'of Achievement',
  WINNER:        'of Excellence',
  SPEAKER:       'of Recognition',
};

const recognitionMap: Record<string, string> = {
  PARTICIPATION: 'for actively participating and contributing their talents to',
  COMPLETION:    'for successfully completing and demonstrating mastery in',
  WINNER:        'in recognition of outstanding performance and exceptional skill demonstrated at',
  SPEAKER:       'for sharing knowledge and expertise as a distinguished speaker at',
};

function getPosShort(position?: string): string {
  if (!position) return '1st';
  return position
    .replace(/\s?[Pp]lace/, '')
    .replace('Runners Up', 'R/U')
    .trim();
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────────
export async function generateCertificatePDF(data: CertData): Promise<Buffer> {
  const type       = data.type.toUpperCase();
  const isWinner   = type === 'WINNER';
  const verifyUrl  = `${FRONTEND_URL}/verify/${data.certId}`;
  const qrDataUrl  = await QRCode.toDataURL(verifyUrl, {
    width: 160, margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
  const dateStr    = formatDateOrdinal(data.issuedAt);
  const subtitle   = subtitleMap[type] ?? 'of Participation';
  const recogText  = data.description || recognitionMap[type] || 'for contributing to';
  const hasFaculty = Boolean(data.facultyName);
  const posShort   = getPosShort(data.position);

  return renderToBuffer(
    React.createElement(Document, null,
      React.createElement(Page, {
        size: [W, H],
        style: { backgroundColor: C.bg, position: 'relative', overflow: 'hidden' },
      },

        // ── L1: BASE BACKGROUND ────────────────────────────────────────────
        React.createElement(View, {
          style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg },
        }),

        // ── L2: RADIAL CENTER GLOW ─────────────────────────────────────────
        React.createElement(Svg, {
          style: { position: 'absolute', top: 0, left: 0 }, width: W, height: H,
        },
          React.createElement(Defs, null,
            React.createElement(RadialGradient as React.ElementType, {
              id: 'centerGlow', cx: '50%', cy: '48%', r: '50%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.gold, stopOpacity: 0.06 }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.bg,   stopOpacity: 0    }),
            ),
          ),
          React.createElement(Rect, { x: 0, y: 0, width: W, height: H, fill: 'url(#centerGlow)' }),
        ),

        // ── L3: RIBBON SWOOSHES (top-right + bottom-left) ─────────────────
        React.createElement(Svg, {
          style: { position: 'absolute', top: 0, left: 0 }, width: W, height: H,
        },
          React.createElement(Defs, null,
            React.createElement(LinearGradient as React.ElementType, {
              id: 'rib1', x1: '0%', y1: '0%', x2: '100%', y2: '100%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.goldDark,   stopOpacity: 0.9  }),
              React.createElement(Stop as React.ElementType, { offset: '30%',  stopColor: C.gold,       stopOpacity: 0.95 }),
              React.createElement(Stop as React.ElementType, { offset: '55%',  stopColor: C.goldBright, stopOpacity: 1    }),
              React.createElement(Stop as React.ElementType, { offset: '75%',  stopColor: C.gold,       stopOpacity: 0.95 }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.goldMid,    stopOpacity: 0.9  }),
            ),
            React.createElement(LinearGradient as React.ElementType, {
              id: 'rib2', x1: '0%', y1: '0%', x2: '100%', y2: '100%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.gold,       stopOpacity: 0.5  }),
              React.createElement(Stop as React.ElementType, { offset: '50%',  stopColor: C.goldBright, stopOpacity: 0.65 }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.gold,       stopOpacity: 0.5  }),
            ),
            React.createElement(LinearGradient as React.ElementType, {
              id: 'rib3', x1: '100%', y1: '100%', x2: '0%', y2: '0%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.goldDark,   stopOpacity: 0.9  }),
              React.createElement(Stop as React.ElementType, { offset: '30%',  stopColor: C.gold,       stopOpacity: 0.95 }),
              React.createElement(Stop as React.ElementType, { offset: '55%',  stopColor: C.goldBright, stopOpacity: 1    }),
              React.createElement(Stop as React.ElementType, { offset: '75%',  stopColor: C.gold,       stopOpacity: 0.95 }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.goldMid,    stopOpacity: 0.9  }),
            ),
          ),
          // TOP-RIGHT: main ribbon
          React.createElement(Path, {
            d: 'M580,0 Q720,0 841.89,0 L841.89,210 Q820,160 720,80 Q650,30 580,0 Z',
            fill: 'url(#rib1)', opacity: 0.85,
          }),
          // TOP-RIGHT: inner highlight
          React.createElement(Path, {
            d: 'M645,0 Q755,0 841.89,0 L841.89,135 Q820,100 730,42 Q692,18 645,0 Z',
            fill: 'url(#rib2)', opacity: 0.55,
          }),
          // TOP-RIGHT: edge shimmer
          React.createElement(Path, {
            d: 'M580,0 Q650,30 720,80 Q820,160 841.89,210',
            fill: 'none', stroke: C.goldBright, strokeWidth: 1, opacity: 0.5,
          }),
          // TOP-RIGHT: inner shimmer
          React.createElement(Path, {
            d: 'M645,0 Q692,18 730,42 Q820,100 841.89,135',
            fill: 'none', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 0.5, opacity: 0.6,
          }),
          // TOP-RIGHT: accent dots
          React.createElement(Circle, { cx: 668, cy: 14,  r: 2,   fill: C.goldBright, opacity: 0.7 }),
          React.createElement(Circle, { cx: 724, cy: 46,  r: 1.5, fill: C.goldBright, opacity: 0.5 }),
          React.createElement(Circle, { cx: 793, cy: 96,  r: 2,   fill: C.goldBright, opacity: 0.7 }),
          React.createElement(Circle, { cx: 841, cy: 152, r: 1.5, fill: C.goldBright, opacity: 0.5 }),
          // BOTTOM-LEFT: main ribbon
          React.createElement(Path, {
            d: 'M0,430 Q0,550 0,595.28 L320,595.28 Q270,560 178,480 Q98,418 0,430 Z',
            fill: 'url(#rib3)', opacity: 0.85,
          }),
          // BOTTOM-LEFT: inner highlight
          React.createElement(Path, {
            d: 'M0,492 Q0,580 0,595.28 L198,595.28 Q162,574 98,520 Q54,484 0,492 Z',
            fill: 'url(#rib2)', opacity: 0.55,
          }),
          // BOTTOM-LEFT: edge shimmer
          React.createElement(Path, {
            d: 'M0,430 Q98,418 178,480 Q270,560 320,595.28',
            fill: 'none', stroke: C.goldBright, strokeWidth: 1, opacity: 0.5,
          }),
          // BOTTOM-LEFT: inner shimmer
          React.createElement(Path, {
            d: 'M0,492 Q54,484 98,520 Q162,574 198,595.28',
            fill: 'none', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 0.5, opacity: 0.6,
          }),
          // BOTTOM-LEFT: accent dots
          React.createElement(Circle, { cx: 28,  cy: 585, r: 2,   fill: C.goldBright, opacity: 0.7 }),
          React.createElement(Circle, { cx: 92,  cy: 568, r: 1.5, fill: C.goldBright, opacity: 0.5 }),
          React.createElement(Circle, { cx: 162, cy: 532, r: 2,   fill: C.goldBright, opacity: 0.7 }),
          React.createElement(Circle, { cx: 244, cy: 595, r: 1.5, fill: C.goldBright, opacity: 0.5 }),
        ),

        // ── L4: HEADER GOLD BAND ───────────────────────────────────────────
        React.createElement(Svg, {
          style: { position: 'absolute', top: 0, left: 0 }, width: W, height: 6,
        },
          React.createElement(Defs, null,
            React.createElement(LinearGradient as React.ElementType, {
              id: 'topBand', x1: '0%', y1: '0%', x2: '100%', y2: '0%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.gold,       stopOpacity: 0 }),
              React.createElement(Stop as React.ElementType, { offset: '20%',  stopColor: C.gold,       stopOpacity: 1 }),
              React.createElement(Stop as React.ElementType, { offset: '50%',  stopColor: C.goldBright, stopOpacity: 1 }),
              React.createElement(Stop as React.ElementType, { offset: '80%',  stopColor: C.gold,       stopOpacity: 1 }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.gold,       stopOpacity: 0 }),
            ),
          ),
          React.createElement(Rect, { x: 0, y: 0, width: W, height: 5, fill: 'url(#topBand)' }),
        ),

        // ── L4b: FOOTER GOLD BAND ──────────────────────────────────────────
        React.createElement(Svg, {
          style: { position: 'absolute', top: H - 6, left: 0 }, width: W, height: 6,
        },
          React.createElement(Defs, null,
            React.createElement(LinearGradient as React.ElementType, {
              id: 'botBand', x1: '0%', y1: '0%', x2: '100%', y2: '0%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.gold,       stopOpacity: 0 }),
              React.createElement(Stop as React.ElementType, { offset: '20%',  stopColor: C.gold,       stopOpacity: 1 }),
              React.createElement(Stop as React.ElementType, { offset: '50%',  stopColor: C.goldBright, stopOpacity: 1 }),
              React.createElement(Stop as React.ElementType, { offset: '80%',  stopColor: C.gold,       stopOpacity: 1 }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.gold,       stopOpacity: 0 }),
            ),
          ),
          React.createElement(Rect, { x: 0, y: 0, width: W, height: 5, fill: 'url(#botBand)' }),
        ),

        // ── L5: DOUBLE BORDER ──────────────────────────────────────────────
        React.createElement(View, {
          style: {
            position: 'absolute', top: 14, left: 14, right: 14, bottom: 14,
            borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.45)', borderStyle: 'solid',
          },
        }),
        React.createElement(View, {
          style: {
            position: 'absolute', top: 21, left: 21, right: 21, bottom: 21,
            borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.18)', borderStyle: 'solid',
          },
        }),

        // ── L6: CORNER ORNAMENTS ───────────────────────────────────────────
        // TOP-LEFT
        React.createElement(View, { style: { position: 'absolute', top: 8, left: 8 } },
          React.createElement(Svg, { width: 64, height: 64 },
            React.createElement(Path, { d: 'M4,36 Q4,4 36,4', fill: 'none', stroke: C.gold, strokeWidth: 1.5, opacity: 0.7 }),
            React.createElement(Path, { d: 'M4,20 Q4,4 20,4', fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.4 }),
            React.createElement(Circle, { cx: 4,  cy: 4,  r: 3,   fill: C.gold, opacity: 0.85 }),
            React.createElement(Circle, { cx: 36, cy: 4,  r: 1.5, fill: C.gold, opacity: 0.5  }),
            React.createElement(Circle, { cx: 4,  cy: 36, r: 1.5, fill: C.gold, opacity: 0.5  }),
            React.createElement(Path, { d: 'M12,4 L16,8 L12,12 L8,8 Z', fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.5 }),
            React.createElement(Path, { d: 'M4,12 L8,16 L4,20 L0,16 Z', fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.5 }),
          )
        ),
        // TOP-RIGHT
        React.createElement(View, { style: { position: 'absolute', top: 8, right: 8 } },
          React.createElement(Svg, { width: 64, height: 64 },
            React.createElement(Path, { d: 'M60,36 Q60,4 28,4',  fill: 'none', stroke: C.gold, strokeWidth: 1.5, opacity: 0.7 }),
            React.createElement(Path, { d: 'M60,20 Q60,4 44,4',  fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.4 }),
            React.createElement(Circle, { cx: 60, cy: 4,  r: 3,   fill: C.gold, opacity: 0.85 }),
            React.createElement(Circle, { cx: 28, cy: 4,  r: 1.5, fill: C.gold, opacity: 0.5  }),
            React.createElement(Circle, { cx: 60, cy: 36, r: 1.5, fill: C.gold, opacity: 0.5  }),
            React.createElement(Path, { d: 'M52,4 L48,8 L52,12 L56,8 Z',    fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.5 }),
            React.createElement(Path, { d: 'M60,12 L56,16 L60,20 L64,16 Z', fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.5 }),
          )
        ),
        // BOTTOM-LEFT
        React.createElement(View, { style: { position: 'absolute', bottom: 8, left: 8 } },
          React.createElement(Svg, { width: 64, height: 64 },
            React.createElement(Path, { d: 'M4,28 Q4,60 36,60', fill: 'none', stroke: C.gold, strokeWidth: 1.5, opacity: 0.7 }),
            React.createElement(Path, { d: 'M4,44 Q4,60 20,60', fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.4 }),
            React.createElement(Circle, { cx: 4,  cy: 60, r: 3,   fill: C.gold, opacity: 0.85 }),
            React.createElement(Circle, { cx: 36, cy: 60, r: 1.5, fill: C.gold, opacity: 0.5  }),
            React.createElement(Circle, { cx: 4,  cy: 28, r: 1.5, fill: C.gold, opacity: 0.5  }),
            React.createElement(Path, { d: 'M12,60 L16,56 L12,52 L8,56 Z',  fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.5 }),
            React.createElement(Path, { d: 'M4,52 L8,48 L4,44 L0,48 Z',     fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.5 }),
          )
        ),
        // BOTTOM-RIGHT
        React.createElement(View, { style: { position: 'absolute', bottom: 8, right: 8 } },
          React.createElement(Svg, { width: 64, height: 64 },
            React.createElement(Path, { d: 'M60,28 Q60,60 28,60', fill: 'none', stroke: C.gold, strokeWidth: 1.5, opacity: 0.7 }),
            React.createElement(Path, { d: 'M60,44 Q60,60 44,60', fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.4 }),
            React.createElement(Circle, { cx: 60, cy: 60, r: 3,   fill: C.gold, opacity: 0.85 }),
            React.createElement(Circle, { cx: 28, cy: 60, r: 1.5, fill: C.gold, opacity: 0.5  }),
            React.createElement(Circle, { cx: 60, cy: 28, r: 1.5, fill: C.gold, opacity: 0.5  }),
            React.createElement(Path, { d: 'M52,60 L48,56 L52,52 L56,56 Z',   fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.5 }),
            React.createElement(Path, { d: 'M60,52 L56,48 L60,44 L64,48 Z',   fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.5 }),
          )
        ),

        // ── L7: WATERMARK (CodeScriet logo, 4% opacity) ────────────────────
        ...(data.codescrietLogoUrl ? [
          React.createElement(Image, {
            key: 'wm',
            style: { position: 'absolute', top: 207, left: 370, width: 100, height: 100, opacity: 0.04 },
            src: data.codescrietLogoUrl,
          }),
        ] : []),

        // ── L8: LOGO ROW (top centre) ──────────────────────────────────────
        React.createElement(View, {
          style: {
            position: 'absolute', top: 20, left: 0, right: 0,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          },
        },
          // CCSU logo
          ...(data.ccsuLogoUrl ? [
            React.createElement(Image, {
              key: 'ccsu',
              style: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
              src: data.ccsuLogoUrl,
            }),
          ] : []),
          // Left gold divider
          React.createElement(View, {
            key: 'ldiv',
            style: { width: 1, height: 32, backgroundColor: 'rgba(201,168,76,0.4)', marginRight: 14 },
          }),
          // Text block
          React.createElement(View, { key: 'tblock', style: { alignItems: 'center', marginRight: 14 } },
            React.createElement(Text, {
              style: { fontFamily: 'Cinzel', fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: 4 },
            }, 'CODESCRIET'),
            React.createElement(Text, {
              style: { fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, marginTop: 2 },
            }, 'Chaudhary Charan Singh University, Meerut'),
          ),
          // Right gold divider
          React.createElement(View, {
            key: 'rdiv',
            style: { width: 1, height: 32, backgroundColor: 'rgba(201,168,76,0.4)', marginRight: 12 },
          }),
          // CodeScriet logo
          ...(data.codescrietLogoUrl ? [
            React.createElement(Image, {
              key: 'cslogo',
              style: { width: 44, height: 44, borderRadius: 22 },
              src: data.codescrietLogoUrl,
            }),
          ] : []),
        ),

        // ── L9: DIVIDER UNDER LOGO ROW (gradient lines + centre diamond) ───
        React.createElement(Svg, {
          style: { position: 'absolute', top: 76, left: 170 },
          width: 502, height: 12,
        },
          React.createElement(Defs, null,
            React.createElement(LinearGradient as React.ElementType, {
              id: 'lhdivL', x1: '0%', y1: '0%', x2: '100%', y2: '0%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.gold, stopOpacity: 0   }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.gold, stopOpacity: 0.7 }),
            ),
            React.createElement(LinearGradient as React.ElementType, {
              id: 'lhdivR', x1: '0%', y1: '0%', x2: '100%', y2: '0%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.gold, stopOpacity: 0.7 }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.gold, stopOpacity: 0   }),
            ),
          ),
          React.createElement(Line, { x1: 0,   y1: 6, x2: 222, y2: 6, stroke: 'url(#lhdivL)', strokeWidth: 0.8 }),
          React.createElement(Path, { d: 'M242,6 L249,0 L256,6 L249,12 Z', fill: C.gold, opacity: 0.9 }),
          React.createElement(Line, { x1: 262, y1: 6, x2: 502, y2: 6, stroke: 'url(#lhdivR)', strokeWidth: 0.8 }),
        ),

        // ── L10: MEDAL BADGE (left side) ───────────────────────────────────
        React.createElement(View, { style: { position: 'absolute', top: 88, left: 38 } },
          React.createElement(Svg, { width: 108, height: 132 },
            React.createElement(Defs, null,
              React.createElement(RadialGradient as React.ElementType, {
                id: 'medalBg', cx: '50%', cy: '40%', r: '55%',
              },
                React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: '#2a1f08' }),
                React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: '#0f0c04' }),
              ),
              React.createElement(LinearGradient as React.ElementType, {
                id: 'medalRing', x1: '0%', y1: '0%', x2: '100%', y2: '100%',
              },
                React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.goldBright }),
                React.createElement(Stop as React.ElementType, { offset: '30%',  stopColor: C.gold       }),
                React.createElement(Stop as React.ElementType, { offset: '60%',  stopColor: C.goldBright }),
                React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.goldMid    }),
              ),
            ),
            // Outer glow halo
            React.createElement(Circle, { cx: 54, cy: 54, r: 51, fill: 'none', stroke: C.gold, strokeWidth: 0.5, opacity: 0.2 }),
            // Main medal body
            React.createElement(Circle, { cx: 54, cy: 54, r: 47, fill: 'url(#medalBg)', stroke: 'url(#medalRing)', strokeWidth: 3 }),
            // Concentric detail rings
            React.createElement(Circle, { cx: 54, cy: 54, r: 37, fill: 'none', stroke: C.gold, strokeWidth: 0.8, opacity: 0.4 }),
            React.createElement(Circle, { cx: 54, cy: 54, r: 32, fill: 'none', stroke: C.gold, strokeWidth: 0.3, opacity: 0.25 }),
            // 5-point star
            React.createElement(Path, {
              d: 'M54,22 L59.5,40 L79,40 L64,51.5 L69.5,70 L54,59 L38.5,70 L44,51.5 L29,40 L48.5,40 Z',
              fill: C.gold, stroke: C.goldBright, strokeWidth: 0.8,
            }),
            // Star inner highlight
            React.createElement(Path, {
              d: 'M54,30 L57.5,41 L68,41 L59.5,47.5 L62.5,58.5 L54,53 L45.5,58.5 L48.5,47.5 L40,41 L50.5,41 Z',
              fill: 'rgba(255,255,255,0.09)',
            }),
            // 3 accent circles below star
            React.createElement(Circle, { cx: 43, cy: 84, r: 2.5, fill: C.gold, opacity: 0.8 }),
            React.createElement(Circle, { cx: 54, cy: 84, r: 3,   fill: C.gold }),
            React.createElement(Circle, { cx: 65, cy: 84, r: 2.5, fill: C.gold, opacity: 0.8 }),
            // Medal ribbon tabs
            React.createElement(Rect, { x: 36, y: 97, width: 13, height: 30, rx: 1, fill: C.goldRibbon, opacity: 0.9 }),
            React.createElement(Rect, { x: 59, y: 97, width: 13, height: 30, rx: 1, fill: C.goldMid,    opacity: 0.9 }),
            React.createElement(Rect, { x: 45, y: 97, width: 16, height: 33, rx: 1, fill: C.gold }),
            // Ribbon shine stripe
            React.createElement(Rect, { x: 48, y: 99, width: 4, height: 29, rx: 1, fill: 'rgba(255,255,255,0.13)' }),
            // Ribbon V-cut at bottom
            React.createElement(Path, {
              d: 'M36,126 L43,132 L54,122 L65,132 L72,126 L72,127 L54,138 L36,127 Z',
              fill: C.bg,
            }),
          )
        ),

        // ── L11: WINNER OCTAGON BADGE (right, only when type = WINNER) ─────
        ...(isWinner ? [
          React.createElement(Svg, {
            key: 'winner-oct',
            style: { position: 'absolute', right: 52, top: 104 },
            width: 72, height: 72,
          },
            React.createElement(Defs, null,
              React.createElement(RadialGradient as React.ElementType, {
                id: 'badgeBg', cx: '50%', cy: '35%', r: '60%',
              },
                React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: '#2a1f08' }),
                React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.bg       }),
              ),
            ),
            // Octagon
            React.createElement(Path, {
              d: 'M22,5 L50,5 L67,22 L67,50 L50,67 L22,67 L5,50 L5,22 Z',
              fill: 'url(#badgeBg)', stroke: C.gold, strokeWidth: 2,
            }),
            // Inner octagon ring
            React.createElement(Path, {
              d: 'M24,9 L48,9 L63,24 L63,48 L48,63 L24,63 L9,48 L9,24 Z',
              fill: 'none', stroke: C.gold, strokeWidth: 0.5, opacity: 0.4,
            }),
          ),
          // Badge position text — absolute overlay on SVG
          React.createElement(Text, {
            key: 'badge-pos',
            style: {
              position: 'absolute', top: 118, right: 52, width: 72, textAlign: 'center',
              fontFamily: 'Cinzel', fontSize: 17, fontWeight: 900, color: C.goldBright,
            },
          }, posShort),
          React.createElement(Text, {
            key: 'badge-place',
            style: {
              position: 'absolute', top: 140, right: 52, width: 72, textAlign: 'center',
              fontFamily: 'Cinzel', fontSize: 7.5, color: C.gold, letterSpacing: 2,
            },
          }, 'PLACE'),
        ] : []),

        // ── L12: MAIN CERTIFICATE TEXT ─────────────────────────────────────
        // "CERTIFICATE" — shadow layer (+2pt offset for depth)
        React.createElement(Text, {
          key: 'cert-shadow',
          style: {
            position: 'absolute', top: 94, left: 170, right: 44,
            textAlign: 'center', fontFamily: 'Cinzel', fontSize: 52, fontWeight: 700,
            color: 'rgba(80,50,0,0.55)', letterSpacing: 10,
          },
        }, 'CERTIFICATE'),
        // "CERTIFICATE" — main gold
        React.createElement(Text, {
          key: 'cert-main',
          style: {
            position: 'absolute', top: 92, left: 168, right: 44,
            textAlign: 'center', fontFamily: 'Cinzel', fontSize: 52, fontWeight: 700,
            color: C.gold, letterSpacing: 10,
          },
        }, 'CERTIFICATE'),

        // Subtitle "of Excellence / of Participation …"
        React.createElement(Text, {
          key: 'subtitle',
          style: {
            position: 'absolute', top: 152, left: 168, right: 44, textAlign: 'center',
            fontFamily: 'CormorantGaramond', fontStyle: 'italic', fontSize: 17,
            color: 'rgba(255,255,255,0.62)', letterSpacing: 4,
          },
        }, subtitle),

        // ── L13: ORNATE DIVIDER (line – diamond – line) ────────────────────
        React.createElement(Svg, {
          key: 'ornate-div',
          style: { position: 'absolute', top: 178, left: (W - 260) / 2 },
          width: 260, height: 12,
        },
          React.createElement(Defs, null,
            React.createElement(LinearGradient as React.ElementType, {
              id: 'ornL', x1: '0%', y1: '0%', x2: '100%', y2: '0%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.gold, stopOpacity: 0   }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.gold, stopOpacity: 0.6 }),
            ),
            React.createElement(LinearGradient as React.ElementType, {
              id: 'ornR', x1: '0%', y1: '0%', x2: '100%', y2: '0%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.gold, stopOpacity: 0.6 }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.gold, stopOpacity: 0   }),
            ),
          ),
          React.createElement(Line, { x1: 0,   y1: 6, x2: 95,  y2: 6, stroke: 'url(#ornL)', strokeWidth: 0.5 }),
          React.createElement(Polygon, { points: '121,0 130,6 121,12 112,6', fill: C.gold }),
          React.createElement(Line, { x1: 139, y1: 6, x2: 260, y2: 6, stroke: 'url(#ornR)', strokeWidth: 0.5 }),
        ),

        // "THIS CERTIFICATE IS PROUDLY PRESENTED TO"
        React.createElement(Text, {
          key: 'presented-to',
          style: {
            position: 'absolute', top: 196, left: 168, right: 44, textAlign: 'center',
            fontFamily: 'CormorantGaramond', fontSize: 9.5,
            color: 'rgba(255,255,255,0.38)', letterSpacing: 3.5,
          },
        }, 'THIS CERTIFICATE IS PROUDLY PRESENTED TO'),

        // RECIPIENT NAME — GreatVibes calligraphic hero element
        React.createElement(Text, {
          key: 'name',
          style: {
            position: 'absolute', top: 208, left: 168, right: 44, textAlign: 'center',
            fontFamily: 'GreatVibes', fontSize: 62,
            color: C.goldBright,
          },
        }, data.recipientName),

        // Name underline — fading gold gradient line
        React.createElement(Svg, {
          key: 'name-ul',
          style: { position: 'absolute', top: 284, left: (W - 380) / 2 },
          width: 380, height: 4,
        },
          React.createElement(Defs, null,
            React.createElement(LinearGradient as React.ElementType, {
              id: 'nameUL', x1: '0%', y1: '0%', x2: '100%', y2: '0%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: C.gold, stopOpacity: 0   }),
              React.createElement(Stop as React.ElementType, { offset: '20%',  stopColor: C.gold, stopOpacity: 0.8 }),
              React.createElement(Stop as React.ElementType, { offset: '80%',  stopColor: C.gold, stopOpacity: 0.8 }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.gold, stopOpacity: 0   }),
            ),
          ),
          React.createElement(Line, { x1: 0, y1: 2, x2: 380, y2: 2, stroke: 'url(#nameUL)', strokeWidth: 1 }),
        ),

        // Recognition text (CormorantGaramond italic)
        React.createElement(Text, {
          key: 'recog',
          style: {
            position: 'absolute', top: 292, left: 220, right: 60, textAlign: 'center',
            fontFamily: 'CormorantGaramond', fontStyle: 'italic', fontSize: 10,
            color: 'rgba(255,255,255,0.48)', lineHeight: 1.65,
          },
        }, recogText),

        // Event name — Cinzel Bold, white
        React.createElement(Text, {
          key: 'event',
          style: {
            position: 'absolute', top: 320, left: 168, right: 44, textAlign: 'center',
            fontFamily: 'Cinzel', fontSize: 15, fontWeight: 700,
            color: C.white, letterSpacing: 2,
          },
        }, data.eventName),

        // Domain · Date meta line
        React.createElement(Text, {
          key: 'meta',
          style: {
            position: 'absolute', top: 342, left: 168, right: 44, textAlign: 'center',
            fontFamily: 'CormorantGaramond', fontSize: 10,
            color: C.gold, letterSpacing: 2,
          },
        }, data.domain ? `${data.domain}  ·  ${dateStr}` : dateStr),

        // ── L14: CIRCULAR WAX SEAL (centred, below text body) ─────────────
        React.createElement(Svg, {
          key: 'wax-seal',
          style: { position: 'absolute', top: 388, left: (W / 2) - 31 },
          width: 62, height: 62,
        },
          React.createElement(Defs, null,
            React.createElement(RadialGradient as React.ElementType, {
              id: 'sealBg', cx: '50%', cy: '40%', r: '55%',
            },
              React.createElement(Stop as React.ElementType, { offset: '0%',   stopColor: '#1e1608' }),
              React.createElement(Stop as React.ElementType, { offset: '100%', stopColor: C.bg       }),
            ),
          ),
          React.createElement(Circle, { cx: 31, cy: 31, r: 29, fill: 'url(#sealBg)', stroke: C.gold, strokeWidth: 1.5, opacity: 0.75 }),
          React.createElement(Circle, { cx: 31, cy: 31, r: 23, fill: 'none', stroke: C.gold, strokeWidth: 0.5, opacity: 0.35 }),
          // Cardinal accent dots
          React.createElement(Circle, { cx: 31, cy: 4,  r: 1, fill: C.gold, opacity: 0.5 }),
          React.createElement(Circle, { cx: 31, cy: 58, r: 1, fill: C.gold, opacity: 0.5 }),
          React.createElement(Circle, { cx: 4,  cy: 31, r: 1, fill: C.gold, opacity: 0.5 }),
          React.createElement(Circle, { cx: 58, cy: 31, r: 1, fill: C.gold, opacity: 0.5 }),
        ),
        // Wax seal text — absolute overlay
        React.createElement(Text, {
          key: 'seal-t1',
          style: {
            position: 'absolute', top: 406, left: (W / 2) - 31, width: 62,
            textAlign: 'center', fontFamily: 'Cinzel', fontSize: 5.5, letterSpacing: 1, color: C.gold,
          },
        }, 'CODESCRIET'),
        React.createElement(Text, {
          key: 'seal-t2',
          style: {
            position: 'absolute', top: 416, left: (W / 2) - 31, width: 62,
            textAlign: 'center', fontFamily: 'CormorantGaramond', fontSize: 4.5,
            letterSpacing: 1, color: 'rgba(201,168,76,0.5)',
          },
        }, 'EST. 2023'),

        // ── L15: BOTTOM SIGNATORIES ────────────────────────────────────────
        // LEFT — Club President
        React.createElement(View, {
          key: 'sig1',
          style: { position: 'absolute', bottom: 28, left: 68, alignItems: 'center', minWidth: 120 },
        },
          React.createElement(Text, {
            style: { fontFamily: 'GreatVibes', fontSize: 22, color: C.goldBright, marginBottom: 3 },
          }, data.signatoryName),
          React.createElement(View, {
            style: { width: 120, height: 0.8, backgroundColor: 'rgba(201,168,76,0.4)', marginBottom: 4 },
          }),
          React.createElement(Text, {
            style: { fontFamily: 'Cinzel', fontSize: 6.5, color: 'rgba(255,255,255,0.45)', letterSpacing: 2 },
          }, data.signatoryName.toUpperCase()),
          React.createElement(Text, {
            style: { fontFamily: 'CormorantGaramond', fontSize: 7.5, color: C.gold, letterSpacing: 1.5, marginTop: 1 },
          }, 'CLUB PRESIDENT'),
        ),

        // CENTRE — Date of issue
        React.createElement(View, {
          key: 'date-block',
          style: { position: 'absolute', left: 0, right: 0, bottom: 32, alignItems: 'center' },
        },
          React.createElement(Text, {
            style: { fontFamily: 'CormorantGaramond', fontSize: 7, color: 'rgba(255,255,255,0.3)', letterSpacing: 3 },
          }, 'DATE OF ISSUE'),
          React.createElement(Text, {
            style: { fontFamily: 'Cinzel', fontSize: 9.5, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, marginTop: 2 },
          }, dateStr),
        ),

        // RIGHT — Faculty Coordinator (optional)
        ...(hasFaculty ? [
          React.createElement(View, {
            key: 'sig2',
            style: { position: 'absolute', bottom: 28, right: 68, alignItems: 'center', minWidth: 120 },
          },
            React.createElement(Text, {
              style: { fontFamily: 'GreatVibes', fontSize: 22, color: C.goldBright, marginBottom: 3 },
            }, data.facultyName!),
            React.createElement(View, {
              style: { width: 120, height: 0.8, backgroundColor: 'rgba(201,168,76,0.4)', marginBottom: 4 },
            }),
            React.createElement(Text, {
              style: { fontFamily: 'Cinzel', fontSize: 6.5, color: 'rgba(255,255,255,0.45)', letterSpacing: 2 },
            }, data.facultyName!.toUpperCase()),
            React.createElement(Text, {
              style: { fontFamily: 'CormorantGaramond', fontSize: 7.5, color: C.gold, letterSpacing: 1.5, marginTop: 1 },
            }, 'FACULTY COORDINATOR'),
          ),
        ] : []),

        // ── L16: QR CODE ───────────────────────────────────────────────────
        React.createElement(View, {
          key: 'qr',
          style: { position: 'absolute', right: 28, bottom: 24, alignItems: 'center' },
        },
          React.createElement(View, {
            style: {
              backgroundColor: C.white, padding: 5, borderRadius: 5, marginBottom: 4,
              borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.3)', borderStyle: 'solid',
            },
          },
            React.createElement(Image, { src: qrDataUrl, style: { width: 68, height: 68 } }),
          ),
          React.createElement(Text, {
            style: { fontFamily: 'Courier', fontSize: 7, color: C.certIdGray, letterSpacing: 0.5 },
          }, data.certId),
          React.createElement(Text, {
            style: { fontFamily: 'Cinzel', fontSize: 5.5, color: C.gold, letterSpacing: 2, marginTop: 2 },
          }, 'SCAN TO VERIFY'),
        ),

        // ── L17: FINE PRINT ────────────────────────────────────────────────
        React.createElement(Text, {
          key: 'fine-print',
          style: {
            position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center',
            fontFamily: 'CormorantGaramond', fontSize: 6.5,
            color: 'rgba(255,255,255,0.15)', letterSpacing: 1.5,
          },
        }, `This certificate is digitally verified  ·  ${FRONTEND_URL.replace(/^https?:\/\//, '')}/verify/${data.certId}`),

      )
    )
  );
}

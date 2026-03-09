import React from 'react';
import {
  Document, Page, View, Text, Image,
  Svg, Path, Circle, Rect, Polygon, Line,
  Font,
  renderToBuffer,
} from '@react-pdf/renderer';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.join(__dirname, '..', '..', 'public', 'logos');

// ── CUSTOM FONTS ──────────────────────────────────────────────────────────────
// Load local font files (pre-downloaded at startup) — no network at render time.
const GREAT_VIBES_PATH = path.join(LOGOS_DIR, 'GreatVibes.ttf');
const CINZEL_PATH      = path.join(LOGOS_DIR, 'Cinzel.ttf');

try {
  Font.register({ family: 'GreatVibes', src: GREAT_VIBES_PATH });
} catch { /* fall back to Times-BoldItalic */ }

try {
  Font.register({ family: 'Cinzel', src: CINZEL_PATH });
} catch { /* fall back to Helvetica-Bold */ }

// Suppress hyphenation inside the PDF renderer
Font.registerHyphenationCallback((word: string) => [word]);

// ── LEGACY TEMPLATE TYPE (kept for backwards compat — now ignored in premium design) ──
export type CertTemplate = 'gold' | 'dark' | 'white' | 'emerald';

export interface CertData {
  recipientName: string;
  eventName: string;
  type: string;
  position?: string;
  domain?: string;
  description?: string;
  certId: string;
  issuedAt: Date;
  signatoryName: string;
  facultyName?: string;
  template: CertTemplate;        // kept for API compat — premium design ignores it
  codescrietLogoUrl?: string;
  ccsuLogoUrl?: string;
}

// A4 landscape dimensions
const W = 841.89;
const H = 595.28;

// ── COLOUR PALETTE ────────────────────────────────────────────────────────────
const C = {
  bg:         '#0a0905',
  gold:       '#c9a84c',
  goldBright: '#f0d080',
  goldDark:   '#7a5a1c',
  goldRibbon: '#b8922e',
  white:      '#ffffff',
  muted:      'rgba(255,255,255,0.55)',
  veryMuted:  'rgba(255,255,255,0.22)',
  certIdGray: '#8a7a5a',
};

// ── ORDINAL SUFFIX ─────────────────────────────────────────────────────────────
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function formatDate(d: Date): string {
  const day  = d.getDate();
  const month = d.toLocaleDateString('en-IN', { month: 'long' });
  const year  = d.getFullYear();
  return `${ordinal(day)} ${month}, ${year}`;
}

// ── TYPE-BASED COPY ────────────────────────────────────────────────────────────
function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    WINNER:        'of Excellence',
    PARTICIPATION: 'of Participation',
    COMPLETION:    'of Achievement',
    SPEAKER:       'of Recognition',
  };
  return map[type.toUpperCase()] ?? 'of Participation';
}

function getDescription(type: string, customDesc?: string): string {
  if (customDesc) return customDesc;
  const map: Record<string, string> = {
    WINNER:        'in recognition of outstanding performance and exceptional skill demonstrated at',
    PARTICIPATION: 'for actively participating and contributing to',
    COMPLETION:    'for successfully completing and demonstrating proficiency in',
    SPEAKER:       'for sharing knowledge and expertise as a distinguished speaker at',
  };
  return map[type.toUpperCase()] ?? 'for actively participating and contributing to';
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────────
export async function generateCertificatePDF(data: CertData): Promise<Buffer> {
  const type      = data.type.toUpperCase();
  const isWinner  = type === 'WINNER';
  const verifyUrl = `https://codescriet.dev/verify/${data.certId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 160, margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
  const dateStr = formatDate(data.issuedAt);

  // ── RIBBON SWOOSHES ─────────────────────────────────────────────────────────
  // Top-right ribbon (wide band, diagonal from top-right corner)
  const topRightRibbon = React.createElement(
    View,
    { style: { position: 'absolute', top: 0, left: 0 } },
    React.createElement(
      Svg, { width: W, height: H },
      // Main ribbon fill
      React.createElement(Path, {
        d: 'M 580 0 C 660 0 760 0 841 0 L 841 200 C 760 160 680 80 580 0 Z',
        fill: C.goldRibbon,
        opacity: 0.82,
      }),
      // Highlight stripe (lighter edge)
      React.createElement(Path, {
        d: 'M 620 0 C 700 0 800 0 841 0 L 841 90 C 780 60 700 20 620 0 Z',
        fill: C.goldBright,
        opacity: 0.22,
      }),
      // Inner refinement line
      React.createElement(Path, {
        d: 'M 600 0 L 841 0 L 841 170 C 750 130 660 60 600 0 Z',
        fill: 'none',
        stroke: C.goldBright,
        strokeWidth: 0.8,
        opacity: 0.5,
      }),
    )
  );

  // Bottom-left ribbon (mirror)
  const bottomLeftRibbon = React.createElement(
    View,
    { style: { position: 'absolute', top: 0, left: 0 } },
    React.createElement(
      Svg, { width: W, height: H },
      React.createElement(Path, {
        d: 'M 0 395 C 80 435 160 515 262 595 L 0 595 Z',
        fill: C.goldRibbon,
        opacity: 0.82,
      }),
      React.createElement(Path, {
        d: 'M 0 455 C 60 490 130 550 200 595 L 0 595 Z',
        fill: C.goldBright,
        opacity: 0.22,
      }),
      React.createElement(Path, {
        d: 'M 0 420 C 80 460 160 530 240 595 L 0 595 Z',
        fill: 'none',
        stroke: C.goldBright,
        strokeWidth: 0.8,
        opacity: 0.5,
      }),
    )
  );

  // ── CORNER FLOURISHES (SVG) ────────────────────────────────────────────────
  const mkFlourish = (flip: boolean) => {
    const sx = flip ? -1 : 1;
    return React.createElement(
      Svg, { width: 72, height: 72 },
      // Outer S-curve arc
      React.createElement(Path, {
        d: `M ${flip ? 72 : 0},0 C ${flip ? 50 : 22},0 ${flip ? 20 : 52},22 ${flip ? 20 : 52},42 C ${flip ? 20 : 52},62 ${flip ? 72 : 0},62 ${flip ? 72 : 0},72`,
        fill: 'none', stroke: C.gold, strokeWidth: 1.2, opacity: 0.7,
      }),
      // Inner parallel curve
      React.createElement(Path, {
        d: `M ${flip ? 72 : 0},8 C ${flip ? 57 : 15},8 ${flip ? 29 : 43},26 ${flip ? 29 : 43},44 C ${flip ? 29 : 43},64 ${flip ? 72 : 0},66 ${flip ? 72 : 0},72`,
        fill: 'none', stroke: C.gold, strokeWidth: 0.6, opacity: 0.4,
      }),
      // Tip diamond
      React.createElement(Polygon, {
        points: `${flip ? 72 : 0},2 ${flip ? 68 : 4},6 ${flip ? 72 : 0},10 ${flip ? 76 : -4},6`,
        fill: C.gold, opacity: 0.8,
      }),
      // Small accent circles
      React.createElement(Circle, { cx: flip ? 20 : 52, cy: 42, r: 2.5, fill: C.gold, opacity: 0.6 }),
    );
  };

  // ── MEDAL / BADGE (top-left) ───────────────────────────────────────────────
  const medal = React.createElement(
    Svg, { width: 110, height: 130 },
    // Outer ring
    React.createElement(Circle, { cx: 52, cy: 52, r: 48, stroke: C.gold, strokeWidth: 3, fill: '#1a1508' }),
    // Inner ring
    React.createElement(Circle, { cx: 52, cy: 52, r: 38, stroke: C.gold, strokeWidth: 1, fill: 'none', opacity: 0.5 }),
    // 5-point star
    React.createElement(Path, {
      d: 'M52,26 L56.5,39 L70,39 L59.5,47 L63.5,60 L52,52 L40.5,60 L44.5,47 L34,39 L47.5,39 Z',
      fill: C.gold, stroke: C.goldBright, strokeWidth: 0.5,
    }),
    // Ribbon tabs below
    React.createElement(Rect, { x: 37, y: 102, width: 12, height: 22, fill: C.gold }),
    React.createElement(Rect, { x: 55, y: 102, width: 12, height: 22, fill: '#9a7a2c' }),
    React.createElement(Rect, { x: 46, y: 102, width: 12, height: 24, fill: C.goldRibbon }),
    // Small dots at bottom of ribbon
    React.createElement(Circle, { cx: 42, cy: 127, r: 2.5, fill: C.gold }),
    React.createElement(Circle, { cx: 52, cy: 127, r: 2.5, fill: C.gold }),
    React.createElement(Circle, { cx: 62, cy: 127, r: 2.5, fill: C.gold }),
  );

  // ── CENTRE DIVIDER (diamond + lines) ──────────────────────────────────────
  const centreDivider = React.createElement(
    Svg, { width: 260, height: 12 },
    React.createElement(Line, { x1: 0, y1: 6, x2: 95, y2: 6, stroke: C.gold, strokeWidth: 0.5, opacity: 0.6 }),
    React.createElement(Polygon, { points: '121,0 130,6 121,12 112,6', fill: C.gold }),
    React.createElement(Line, { x1: 139, y1: 6, x2: 260, y2: 6, stroke: C.gold, strokeWidth: 0.5, opacity: 0.6 }),
  );

  // ── NAME UNDERLINE ─────────────────────────────────────────────────────────
  const nameUnderline = React.createElement(
    Svg, { width: 380, height: 4 },
    React.createElement(Line, { x1: 0, y1: 2, x2: 380, y2: 2, stroke: C.gold, strokeWidth: 1, opacity: 0.8 }),
  );

  // ── WINNER OCTAGON BADGE ───────────────────────────────────────────────────
  const winnerBadge = isWinner ? React.createElement(
    View, { style: { position: 'absolute', top: 108, right: 120 } },
    React.createElement(
      Svg, { width: 90, height: 90 },
      React.createElement(Polygon, {
        points: '27,5 63,5 85,27 85,63 63,85 27,85 5,63 5,27',
        fill: '#0a0905', stroke: C.gold, strokeWidth: 2,
      }),
      React.createElement(Polygon, {
        points: '30,10 60,10 80,30 80,60 60,80 30,80 10,60 10,30',
        fill: 'none', stroke: C.gold, strokeWidth: 0.5, opacity: 0.4,
      }),
      // Star inside badge
      React.createElement(Path, {
        d: 'M45,20 L48.5,30.5 L60,30.5 L51,37 L54,47.5 L45,41 L36,47.5 L39,37 L30,30.5 L41.5,30.5 Z',
        fill: C.gold,
      }),
      React.createElement(Text, {
        style: { position: 'absolute', top: 52, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: C.gold, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
      }, data.position ? data.position.toUpperCase() : '1ST PLACE'),
    )
  ) : null;

  // ── RADIAL GLOW OVERLAY (very subtle warm centre) ─────────────────────────
  // react-pdf doesn't support SVG radial-gradient natively; approximate with
  // a large semi-transparent gold ellipse at very low opacity.
  const radialGlow = React.createElement(
    View, { style: { position: 'absolute', top: H / 2 - 160, left: W / 2 - 200 } },
    React.createElement(
      Svg, { width: 400, height: 320 },
      React.createElement(Path, {
        d: 'M 200 160 m -180 0 a 180 140 0 1 0 360 0 a 180 140 0 1 0 -360 0',
        fill: C.gold, opacity: 0.025,
      }),
    )
  );

  // ── DETERMINE signatory vertical positions ─────────────────────────────────
  const hasFaculty = Boolean(data.facultyName);

  return renderToBuffer(
    React.createElement(
      Document, null,
      React.createElement(
        Page,
        { size: [W, H], style: { backgroundColor: C.bg, position: 'relative' } },

        // ── LAYER 1: GOLD RIBBON SWOOSHES ──────────────────────────────────
        topRightRibbon,
        bottomLeftRibbon,

        // ── LAYER 2: RADIAL GLOW ──────────────────────────────────────────
        radialGlow,

        // ── LAYER 3: WATERMARK ────────────────────────────────────────────
        ...(data.codescrietLogoUrl ? [
          React.createElement(View, {
            key: 'wm',
            style: { position: 'absolute', top: H / 2 - 90, left: W / 2 - 90, opacity: 0.04 },
          },
            React.createElement(Image, { src: data.codescrietLogoUrl, style: { width: 180, height: 180 } })
          ),
        ] : []),

        // ── CORNER FLOURISHES ─────────────────────────────────────────────
        // Top-left
        React.createElement(View, { key: 'fl-tl', style: { position: 'absolute', top: 8, left: 8 } }, mkFlourish(false)),
        // Top-right
        React.createElement(View, { key: 'fl-tr', style: { position: 'absolute', top: 8, right: 8, transform: 'rotate(90deg)' } }, mkFlourish(true)),
        // Bottom-right
        React.createElement(View, { key: 'fl-br', style: { position: 'absolute', bottom: 8, right: 8, transform: 'rotate(180deg)' } }, mkFlourish(false)),
        // Bottom-left
        React.createElement(View, { key: 'fl-bl', style: { position: 'absolute', bottom: 8, left: 8, transform: 'rotate(270deg)' } }, mkFlourish(true)),

        // ── MEDAL (top-left) ──────────────────────────────────────────────
        React.createElement(View, { key: 'medal', style: { position: 'absolute', top: 22, left: 32 } }, medal),

        // ── DUAL LOGO ROW (top-centre) ────────────────────────────────────
        React.createElement(View, {
          key: 'logo-row',
          style: {
            position: 'absolute', top: 18, left: 0, right: 0,
            flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
          },
        },
          // CCSU logo
          ...(data.ccsuLogoUrl ? [
            React.createElement(Image, { key: 'ccsu', src: data.ccsuLogoUrl, style: { width: 44, height: 44 } }),
            // Gold divider
            React.createElement(View, { key: 'div1', style: { width: 1, height: 32, backgroundColor: C.gold, opacity: 0.5 } }),
          ] : []),

          // Text block
          React.createElement(View, { key: 'title-block', style: { flexDirection: 'column', alignItems: 'center', gap: 2 } },
            React.createElement(Text, {
              style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.gold, letterSpacing: 4 },
            }, 'CODESCRIET'),
            React.createElement(Text, {
              style: { fontSize: 7, color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5 },
            }, 'Chaudhary Charan Singh University'),
          ),

          // Gold divider
          ...(data.codescrietLogoUrl ? [
            React.createElement(View, { key: 'div2', style: { width: 1, height: 32, backgroundColor: C.gold, opacity: 0.5 } }),
            // CodeScriet logo
            React.createElement(Image, { key: 'cslogo', src: data.codescrietLogoUrl, style: { width: 44, height: 44 } }),
          ] : []),
        ),

        // ── WINNER BADGE ──────────────────────────────────────────────────
        winnerBadge,

        // ── "CERTIFICATE" HEADING ─────────────────────────────────────────
        // Shadow layer (1pt offset)
        React.createElement(Text, {
          key: 'cert-shadow',
          style: {
            position: 'absolute', top: 121, left: 1, right: -1,
            textAlign: 'center', fontSize: 48,
            fontFamily: 'Cinzel',
            color: C.goldDark, letterSpacing: 12, opacity: 0.7,
          },
        }, 'CERTIFICATE'),
        // Main layer
        React.createElement(Text, {
          key: 'cert-heading',
          style: {
            position: 'absolute', top: 120, left: 0, right: 0,
            textAlign: 'center', fontSize: 48,
            fontFamily: 'Cinzel',
            color: C.gold, letterSpacing: 12,
          },
        }, 'CERTIFICATE'),

        // ── "of Achievement" subtitle ─────────────────────────────────────
        React.createElement(Text, {
          key: 'type-label',
          style: {
            position: 'absolute', top: 174, left: 0, right: 0,
            textAlign: 'center', fontSize: 15,
            fontFamily: 'Times-Italic',
            color: 'rgba(255,255,255,0.65)', letterSpacing: 3,
          },
        }, getTypeLabel(type)),

        // ── DECORATIVE DIVIDER ────────────────────────────────────────────
        React.createElement(View, {
          key: 'divider',
          style: { position: 'absolute', top: 198, left: (W - 260) / 2 },
        }, centreDivider),

        // ── "THIS CERTIFICATE IS PROUDLY PRESENTED TO" ────────────────────
        React.createElement(Text, {
          key: 'presented-to',
          style: {
            position: 'absolute', top: 218, left: 0, right: 0,
            textAlign: 'center', fontSize: 8.5,
            fontFamily: 'Helvetica',
            color: 'rgba(255,255,255,0.42)', letterSpacing: 2.5,
          },
        }, 'THIS CERTIFICATE IS PROUDLY PRESENTED TO'),

        // ── RECIPIENT NAME ────────────────────────────────────────────────
        React.createElement(Text, {
          key: 'name',
          style: {
            position: 'absolute', top: 232, left: 120, right: 120,
            textAlign: 'center', fontSize: 58,
            fontFamily: 'GreatVibes',
            color: C.goldBright, lineHeight: 1.1,
          },
        }, data.recipientName),

        // ── NAME UNDERLINE ────────────────────────────────────────────────
        React.createElement(View, {
          key: 'name-underline',
          style: { position: 'absolute', top: 298, left: (W - 380) / 2 },
        }, nameUnderline),

        // ── DESCRIPTION TEXT ──────────────────────────────────────────────
        React.createElement(Text, {
          key: 'desc',
          style: {
            position: 'absolute', top: 308, left: 150, right: 150,
            textAlign: 'center', fontSize: 9,
            fontFamily: 'Times-Italic',
            color: C.muted, lineHeight: 1.55,
          },
        }, getDescription(type, data.description)),

        // ── EVENT NAME ────────────────────────────────────────────────────
        React.createElement(Text, {
          key: 'event',
          style: {
            position: 'absolute', top: 342, left: 90, right: 90,
            textAlign: 'center', fontSize: 18,
            fontFamily: 'Helvetica-Bold',
            color: C.white, letterSpacing: 1,
          },
        }, data.domain ? `${data.eventName}  ·  ${data.domain}` : data.eventName),

        // ── DATE ──────────────────────────────────────────────────────────
        React.createElement(Text, {
          key: 'date',
          style: {
            position: 'absolute', top: 373, left: 0, right: 0,
            textAlign: 'center', fontSize: 9.5,
            fontFamily: 'Times-Roman',
            color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5,
          },
        }, dateStr),

        // ── SIGNATORY 1 — CLUB PRESIDENT ──────────────────────────────────
        React.createElement(View, {
          key: 'sig1',
          style: {
            position: 'absolute',
            bottom: hasFaculty ? 92 : 70,
            left: hasFaculty ? W / 2 - 200 : 0,
            right: hasFaculty ? W / 2 + 200 : 0,
            alignItems: 'center',
          },
        },
          React.createElement(Text, {
            style: { fontSize: 16, fontFamily: 'Times-BoldItalic', color: C.goldBright, textAlign: 'center' },
          }, data.signatoryName),
          React.createElement(View, { style: { width: 120, height: 0.5, backgroundColor: C.gold, opacity: 0.6, marginTop: 4 } }),
          React.createElement(Text, {
            style: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginTop: 4, textAlign: 'center' },
          }, data.signatoryName.toUpperCase()),
          React.createElement(Text, {
            style: { fontSize: 7, fontFamily: 'Helvetica', color: C.gold, letterSpacing: 2, marginTop: 2, textAlign: 'center' },
          }, 'CLUB PRESIDENT'),
        ),

        // ── SIGNATORY 2 — FACULTY COORDINATOR (optional) ─────────────────
        ...(hasFaculty ? [
          React.createElement(View, {
            key: 'sig2',
            style: {
              position: 'absolute',
              bottom: 92,
              left: W / 2 + 20,
              right: 0,
              alignItems: 'center',
            },
          },
            React.createElement(Text, {
              style: { fontSize: 16, fontFamily: 'Times-BoldItalic', color: C.goldBright, textAlign: 'center' },
            }, data.facultyName!),
            React.createElement(View, { style: { width: 120, height: 0.5, backgroundColor: C.gold, opacity: 0.6, marginTop: 4 } }),
            React.createElement(Text, {
              style: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginTop: 4, textAlign: 'center' },
            }, data.facultyName!.toUpperCase()),
            React.createElement(Text, {
              style: { fontSize: 7, fontFamily: 'Helvetica', color: C.gold, letterSpacing: 2, marginTop: 2, textAlign: 'center' },
            }, 'FACULTY COORDINATOR'),
          ),
        ] : []),

        // ── QR CODE ───────────────────────────────────────────────────────
        React.createElement(View, {
          key: 'qr',
          style: {
            position: 'absolute', bottom: 30, right: 48,
            backgroundColor: '#ffffff', padding: 6, borderRadius: 6,
          },
        },
          React.createElement(Image, { src: qrDataUrl, style: { width: 80, height: 80 } })
        ),
        React.createElement(Text, {
          key: 'cert-id',
          style: {
            position: 'absolute', bottom: 20, right: 48, width: 92,
            textAlign: 'center', fontSize: 6.5, fontFamily: 'Courier',
            color: C.certIdGray, letterSpacing: 0.5,
          },
        }, data.certId),
        React.createElement(Text, {
          key: 'scan-label',
          style: {
            position: 'absolute', bottom: 10, right: 48, width: 92,
            textAlign: 'center', fontSize: 6, fontFamily: 'Helvetica',
            color: C.gold, letterSpacing: 2,
          },
        }, 'SCAN TO VERIFY'),

        // ── BOTTOM VERIFICATION TEXT ──────────────────────────────────────
        React.createElement(Text, {
          key: 'verify',
          style: {
            position: 'absolute', bottom: 12, left: 0, right: 160,
            textAlign: 'center', fontSize: 6,
            fontFamily: 'Helvetica',
            color: 'rgba(255,255,255,0.2)', letterSpacing: 0.8,
          },
        }, `This certificate is digitally verified · codescriet.dev/verify/${data.certId}`),
      )
    )
  );
}

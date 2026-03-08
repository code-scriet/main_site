import React from 'react';
import {
  Document, Page, View, Text, Image,
  Svg, Path, Circle, Rect, Polygon,
  renderToBuffer,
} from '@react-pdf/renderer';
import QRCode from 'qrcode';

export type CertTemplate = 'gold' | 'dark' | 'white' | 'emerald';

interface Theme {
  bg: string;
  accent: string;
  nameColor: string;
  textColor: string;
  subtext: string;
}

const THEMES: Record<CertTemplate, Theme> = {
  gold:    { bg: '#0f0e0a', accent: '#c9a84c', nameColor: '#f0d080', textColor: '#e8dcc8', subtext: '#8a7a5a' },
  dark:    { bg: '#0a0a14', accent: '#6366f1', nameColor: '#e0e7ff', textColor: '#c7d2fe', subtext: '#818cf8' },
  white:   { bg: '#fafaf8', accent: '#1a1a2e', nameColor: '#1a1a2e', textColor: '#2d2d3e', subtext: '#555555' },
  emerald: { bg: '#0a1a12', accent: '#10b981', nameColor: '#6ee7b7', textColor: '#a7f3d0', subtext: '#34d399' },
};

export interface CertData {
  recipientName: string;
  eventName: string;
  type: string;
  position?: string;
  domain?: string;
  description?: string;        // italic event description line
  certId: string;
  issuedAt: Date;
  signatoryName: string;
  facultyName?: string;        // second signatory (Faculty Coordinator)
  template: CertTemplate;
  codescrietLogoUrl?: string;  // base64 data URL or https URL
  ccsuLogoUrl?: string;        // base64 data URL or https URL
}

// A4 landscape dimensions in points
const W = 841.89;
const H = 595.28;

export async function generateCertificatePDF(data: CertData): Promise<Buffer> {
  const T = THEMES[data.template] ?? THEMES.gold;
  const isWinner = data.type.toUpperCase() === 'WINNER';

  const typeVerb: Record<string, string> = {
    PARTICIPATION: 'PARTICIPATED IN',
    COMPLETION: 'SUCCESSFULLY COMPLETED',
    WINNER: 'WON',
    SPEAKER: 'SPOKEN AT',
  };
  const verb = typeVerb[data.type.toUpperCase()] ?? 'PARTICIPATED IN';

  const verifyUrl = `https://codescriet.dev/verify/${data.certId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 });

  const dateStr = data.issuedAt.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // Header text colors: white template has dark band at top, so use white text there
  const hTextColor = data.template === 'white' ? '#ffffff' : T.accent;
  const hSubColor  = data.template === 'white' ? 'rgba(255,255,255,0.72)' : T.subtext;

  // Footer tiny text on dark band (white template)
  const footerTinyColor = data.template === 'white' ? '#aaaaaa' : T.subtext;

  // ── DOT GRID (very subtle background texture) ──
  const dotCols = 14;
  const dotRows = 10;
  const dsx = W / dotCols;
  const dsy = H / dotRows;
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < dotRows; r++) {
    for (let c = 0; c < dotCols; c++) {
      dots.push(
        React.createElement(Circle, {
          key: `d${r}-${c}`,
          cx: dsx * (c + 0.5),
          cy: dsy * (r + 0.5),
          r: 1,
          fill: T.accent,
        })
      );
    }
  }

  // ── CORNER DIAMOND ──
  const mkDiamond = (size: number) =>
    React.createElement(
      Svg, { width: size, height: size },
      React.createElement(Polygon, {
        points: `${size / 2},1 ${size - 1},${size / 2} ${size / 2},${size - 1} 1,${size / 2}`,
        fill: '#c9a84c',  // universal gold — visible on any background
        opacity: 0.72,
      })
    );

  // ── HEADER/BODY DIVIDER (tapered, thick center → thin at edges) ──
  const headerDivider =
    React.createElement(Svg, { width: 500, height: 5 },
      React.createElement(Rect, { x: 0, y: 2, width: 500, height: 1, fill: T.accent, opacity: 0.22 }),
      React.createElement(Rect, { x: 65, y: 1, width: 370, height: 3, fill: T.accent, opacity: 0.55 }),
      React.createElement(Rect, { x: 190, y: 0, width: 120, height: 5, fill: T.accent, opacity: 0.95 }),
    );

  // ── NAME UNDERLINE (same tapered style) ──
  const nameUnderline =
    React.createElement(Svg, { width: 480, height: 3 },
      React.createElement(Rect, { x: 0, y: 1, width: 480, height: 0.5, fill: T.accent, opacity: 0.2 }),
      React.createElement(Rect, { x: 110, y: 0, width: 260, height: 3, fill: T.accent, opacity: 0.62 }),
    );

  // ── WINNER BADGE (circle + star) ──
  const winnerBadge =
    React.createElement(Svg, { width: 76, height: 76 },
      React.createElement(Circle, { cx: 38, cy: 38, r: 36, fill: '#c9a84c', opacity: 0.93 }),
      React.createElement(Circle, { cx: 38, cy: 38, r: 30, fill: 'none', stroke: '#ffffff', strokeWidth: 1.2, opacity: 0.5 }),
      // 5-point star
      React.createElement(Polygon, {
        points: '38,9 43,27 62,27 47,39 52,57 38,45 24,57 29,39 14,27 33,27',
        fill: '#ffffff', opacity: 0.95,
      }),
    );

  // ── TEMPLATE-SPECIFIC DECORATIONS ──
  const decorations: React.ReactNode[] = [];

  if (data.template === 'gold') {
    // Regal double-line border (outer 2pt, inner 0.5pt, 8pt gap)
    decorations.push(
      React.createElement(View, { key: 'g-outer', style: { position: 'absolute', top: 10, left: 10, right: 10, bottom: 10, border: '2pt solid #c9a84c', opacity: 0.78 } }),
      React.createElement(View, { key: 'g-inner', style: { position: 'absolute', top: 18, left: 18, right: 18, bottom: 18, border: '0.5pt solid #c9a84c', opacity: 0.35 } }),
    );
  } else if (data.template === 'dark') {
    // Glowing horizontal lines (simulated with thick semi-transparent bars)
    decorations.push(
      React.createElement(View, { key: 'd-top', style: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: '#6366f1', opacity: 0.42 } }),
      React.createElement(View, { key: 'd-bot', style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, backgroundColor: '#6366f1', opacity: 0.42 } }),
    );
  } else if (data.template === 'white') {
    // Solid header band (#1a1a2e, 84pt) and footer band (40pt)
    decorations.push(
      React.createElement(View, { key: 'w-head', style: { position: 'absolute', top: 0, left: 0, right: 0, height: 84, backgroundColor: '#1a1a2e' } }),
      React.createElement(View, { key: 'w-foot', style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, backgroundColor: '#1a1a2e' } }),
    );
  } else if (data.template === 'emerald') {
    // Curved decorative arcs in top corners
    decorations.push(
      React.createElement(View, { key: 'em-al', style: { position: 'absolute', top: 0, left: 0 } },
        React.createElement(Svg, { width: 155, height: 155 },
          React.createElement(Path, { d: 'M 0 155 Q 0 0 155 0', fill: 'none', stroke: '#10b981', strokeWidth: 2.5, opacity: 0.28 }),
          React.createElement(Path, { d: 'M 0 110 Q 0 0 110 0', fill: 'none', stroke: '#10b981', strokeWidth: 1.5, opacity: 0.18 }),
          React.createElement(Path, { d: 'M 0 68 Q 0 0 68 0', fill: 'none', stroke: '#10b981', strokeWidth: 1, opacity: 0.12 }),
        )
      ),
      React.createElement(View, { key: 'em-ar', style: { position: 'absolute', top: 0, right: 0 } },
        React.createElement(Svg, { width: 155, height: 155 },
          React.createElement(Path, { d: 'M 155 155 Q 155 0 0 0', fill: 'none', stroke: '#10b981', strokeWidth: 2.5, opacity: 0.28 }),
          React.createElement(Path, { d: 'M 155 110 Q 155 0 45 0', fill: 'none', stroke: '#10b981', strokeWidth: 1.5, opacity: 0.18 }),
          React.createElement(Path, { d: 'M 155 68 Q 155 0 87 0', fill: 'none', stroke: '#10b981', strokeWidth: 1, opacity: 0.12 }),
        )
      ),
    );
  }

  // ── SIGNATORY VERTICAL POSITIONS (from bottom) ──
  // Stack Club President above Faculty Coordinator when both present
  const fac = data.facultyName;
  const sig1NameBot  = fac ? 130 : 108;
  const sig1LineBot  = fac ? 123 : 101;
  const sig1LabelBot = fac ? 107 : 85;

  return renderToBuffer(
    React.createElement(
      Document, null,
      React.createElement(
        Page,
        { size: [W, H], style: { backgroundColor: T.bg, position: 'relative', fontFamily: 'Times-Roman' } },

        // ── DOT GRID BACKGROUND (3% opacity) ──
        React.createElement(View, { style: { position: 'absolute', top: 0, left: 0 } },
          React.createElement(Svg, { width: W, height: H, style: { opacity: 0.03 } },
            ...dots
          )
        ),

        // ── TEMPLATE DECORATIONS ──
        ...decorations,

        // ══ HEADER AREA (0–84pt) ══

        // CCSU logo — top-left (48×48, vertically centered in header)
        ...(data.ccsuLogoUrl ? [
          React.createElement(View, { key: 'ccsu', style: { position: 'absolute', top: 18, left: 28 } },
            React.createElement(Image, { src: data.ccsuLogoUrl, style: { width: 48, height: 48 } })
          ),
        ] : []),

        // CodeScriet logo — top-right (48×48)
        ...(data.codescrietLogoUrl ? [
          React.createElement(View, { key: 'cslogo', style: { position: 'absolute', top: 18, right: 28 } },
            React.createElement(Image, { src: data.codescrietLogoUrl, style: { width: 48, height: 48 } })
          ),
        ] : []),

        // Club name
        React.createElement(Text, {
          style: { position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center', fontSize: 13, fontFamily: 'Helvetica-Bold', color: hTextColor, letterSpacing: 5 },
        }, '\u26A1  CODESCRIET'),

        // University name (subtext below club name)
        React.createElement(Text, {
          style: { position: 'absolute', top: 42, left: 0, right: 0, textAlign: 'center', fontSize: 7.5, color: hSubColor, letterSpacing: 1.5 },
        }, 'CHAUDHARY CHARAN SINGH UNIVERSITY, MEERUT'),

        // Department subline
        React.createElement(Text, {
          style: { position: 'absolute', top: 60, left: 0, right: 0, textAlign: 'center', fontSize: 6, color: hSubColor, letterSpacing: 2, opacity: 0.75 },
        }, 'DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING'),

        // Header / body tapered divider
        React.createElement(View, { style: { position: 'absolute', top: 84, left: 171 } }, headerDivider),

        // ── WATERMARK (CodeScriet logo, centered, 5% opacity) ──
        ...(data.codescrietLogoUrl ? [
          React.createElement(View, { key: 'wm', style: { position: 'absolute', top: 197, left: 320, opacity: 0.05 } },
            React.createElement(Image, { src: data.codescrietLogoUrl, style: { width: 200, height: 200 } })
          ),
        ] : []),

        // ── CORNER DIAMOND ORNAMENTS ──
        React.createElement(View, { style: { position: 'absolute', top: 7, left: 7 } }, mkDiamond(18)),
        React.createElement(View, { style: { position: 'absolute', top: 7, right: 7 } }, mkDiamond(18)),
        React.createElement(View, { style: { position: 'absolute', bottom: 7, left: 7 } }, mkDiamond(18)),
        React.createElement(View, { style: { position: 'absolute', bottom: 7, right: 7 } }, mkDiamond(18)),

        // ══ CERTIFICATE BODY ══

        // "THIS IS TO CERTIFY THAT"
        React.createElement(Text, {
          style: { position: 'absolute', top: 103, left: 0, right: 0, textAlign: 'center', fontSize: 7.5, color: T.subtext, letterSpacing: 4 },
        }, 'THIS IS TO CERTIFY THAT'),

        // Recipient name (large italic)
        React.createElement(Text, {
          style: { position: 'absolute', top: 118, left: 70, right: 70, textAlign: 'center', fontSize: 44, fontFamily: 'Times-BoldItalic', color: T.nameColor, lineHeight: 1.1 },
        }, data.recipientName),

        // Name underline (tapered)
        React.createElement(View, { style: { position: 'absolute', top: 174, left: 181 } }, nameUnderline),

        // "HAS [VERB]"
        React.createElement(Text, {
          style: { position: 'absolute', top: 186, left: 0, right: 0, textAlign: 'center', fontSize: 7.5, color: T.subtext, letterSpacing: 4 },
        }, `HAS ${verb}`),

        // Event name
        React.createElement(Text, {
          style: { position: 'absolute', top: 204, left: 90, right: 90, textAlign: 'center', fontSize: 21, fontFamily: 'Times-Bold', color: T.textColor, lineHeight: 1.2 },
        }, data.eventName),

        // Event description (italic, optional)
        ...(data.description ? [
          React.createElement(Text, {
            key: 'desc',
            style: { position: 'absolute', top: 250, left: 95, right: 95, textAlign: 'center', fontSize: 9, fontFamily: 'Times-Italic', color: T.subtext, lineHeight: 1.35 },
          }, `\u201C${data.description}\u201D`),
        ] : []),

        // Domain badge (optional)
        ...(data.domain ? [
          React.createElement(Text, {
            key: 'domain',
            style: { position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: T.accent, letterSpacing: 2 },
          }, data.domain.toUpperCase()),
        ] : []),

        // WINNER badge (SVG, top-right body area)
        ...(isWinner ? [
          React.createElement(View, { key: 'wb', style: { position: 'absolute', top: 97, right: 86 } }, winnerBadge),
          ...(data.position ? [
            React.createElement(Text, {
              key: 'wp',
              style: { position: 'absolute', top: 178, right: 62, width: 124, textAlign: 'center', fontSize: 7.5, color: T.accent, letterSpacing: 1.5 },
            }, data.position.toUpperCase()),
          ] : []),
        ] : []),

        // ══ FOOTER ══

        // Department label (above date, left)
        React.createElement(Text, {
          style: { position: 'absolute', bottom: 122, left: 55, fontSize: 6, color: T.subtext, letterSpacing: 1.5 },
        }, 'DEPT. OF COMPUTER SCIENCE & ENGINEERING'),

        // Date label
        React.createElement(Text, {
          style: { position: 'absolute', bottom: 105, left: 55, fontSize: 7, color: T.subtext, letterSpacing: 2 },
        }, 'DATE ISSUED'),

        // Date value
        React.createElement(Text, {
          style: { position: 'absolute', bottom: 85, left: 55, fontSize: 11, fontFamily: 'Times-Bold', color: T.textColor },
        }, dateStr),

        // Date underline
        React.createElement(View, {
          style: { position: 'absolute', bottom: 80, left: 55, width: 108, height: 0.5, backgroundColor: T.subtext, opacity: 0.4 },
        }),

        // Signatory 1 — Club President
        React.createElement(Text, {
          style: { position: 'absolute', bottom: sig1NameBot, left: 0, right: 0, textAlign: 'center', fontSize: 13, fontFamily: 'Times-Italic', color: T.nameColor },
        }, data.signatoryName),
        React.createElement(View, {
          style: { position: 'absolute', bottom: sig1LineBot, left: 295, width: 250, height: 0.5, backgroundColor: T.subtext, opacity: 0.4 },
        }),
        React.createElement(Text, {
          style: { position: 'absolute', bottom: sig1LabelBot, left: 0, right: 0, textAlign: 'center', fontSize: 6.5, color: T.subtext, letterSpacing: 2 },
        }, 'CLUB PRESIDENT · CODE.SCRIET'),

        // Signatory 2 — Faculty Coordinator (optional)
        ...(fac ? [
          React.createElement(Text, {
            key: 'f-name',
            style: { position: 'absolute', bottom: 87, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontFamily: 'Times-Italic', color: T.nameColor },
          }, fac),
          React.createElement(View, {
            key: 'f-line',
            style: { position: 'absolute', bottom: 80, left: 303, width: 235, height: 0.5, backgroundColor: T.subtext, opacity: 0.4 },
          }),
          React.createElement(Text, {
            key: 'f-label',
            style: { position: 'absolute', bottom: 64, left: 0, right: 0, textAlign: 'center', fontSize: 6.5, color: T.subtext, letterSpacing: 2 },
          }, 'FACULTY COORDINATOR'),
        ] : []),

        // QR code (right side)
        React.createElement(View, {
          style: { position: 'absolute', bottom: 38, right: 50, backgroundColor: '#ffffff', padding: 4, borderRadius: 3 },
        },
          React.createElement(Image, { src: qrDataUrl, style: { width: 68, height: 68 } })
        ),

        // Certificate ID (below QR)
        React.createElement(Text, {
          style: { position: 'absolute', bottom: 24, right: 50, width: 76, fontSize: 6, color: footerTinyColor, fontFamily: 'Courier', letterSpacing: 0.5, textAlign: 'center' },
        }, data.certId),

        // Verify URL (very bottom center)
        React.createElement(Text, {
          style: { position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: 6.5, color: footerTinyColor, opacity: 0.65, fontFamily: 'Helvetica' },
        }, `This certificate is digitally verified. Scan QR or visit codescriet.dev/verify/${data.certId}`),
      )
    )
  );
}

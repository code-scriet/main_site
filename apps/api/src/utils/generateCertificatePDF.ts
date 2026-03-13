import React from 'react';
import {
  Document, Page, View, Text, Image,
  Svg, Polygon, Line,
  Font,
  renderToBuffer,
} from '@react-pdf/renderer';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

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

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://codescriet.dev').replace(/\/+$/, '');

export interface CertData {
  recipientName:            string;
  eventName:                string;
  type:                     string;
  position?:                string;
  domain?:                  string;
  description?:             string;
  certId:                   string;
  issuedAt:                 Date;
  // Signatory (rendered as cursive text in Great Vibes font)
  signatoryName:            string;
  signatoryTitle?:          string;          // e.g. "Club President"
  // Faculty signatory (optional)
  facultyName?:             string;
  facultyTitle?:            string;          // e.g. "Faculty Coordinator"
  codescrietLogoUrl?:       string;          // base64 data URI
  ccsuLogoUrl?:             string;          // base64 data URI
}

// A4 Landscape dimensions (points)
const W = 841.89;
const H = 595.28;

// ── COLOUR PALETTE (matching HTML design) ────────────────────────────────────
const C = {
  bg:       '#FAFAFA',
  maroon:   '#7A1B29',
  gold:     '#C9A84C',
  textMain: '#1A1A1A',
  textMuted:'#4A4A4A',
  white:    '#FFFFFF',
};

// ── HELPERS ────────────────────────────────────────────────────────────────────
function formatDateUpper(date: Date): string {
  const day = date.getDate();
  const suffix = ['TH', 'ST', 'ND', 'RD'];
  const v = day % 100;
  const ord = suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0];
  const month = date.toLocaleDateString('en-IN', { month: 'long' }).toUpperCase();
  const year = date.getFullYear();
  return `${day}${ord} OF ${month} ${year}`;
}

const subtitleMap: Record<string, string> = {
  PARTICIPATION: 'of Participation',
  COMPLETION:    'of Achievement',
  WINNER:        'of Excellence',
  SPEAKER:       'of Recognition',
};

// Scale name font size for long names (react-pdf has no clamp)
function nameFontSize(name: string): number {
  const len = name.length;
  if (len <= 18) return 52;
  if (len <= 26) return 46;
  if (len <= 34) return 42;
  return 38;
}

// ── DESCRIPTION BUILDER ────────────────────────────────────────────────────────
function buildDescription(data: CertData, type: string): React.ReactNode[] {
  if (data.description) {
    return [data.description];
  }

  const highlightStyle = {
    fontWeight: 700 as const,
    color: C.maroon,
    fontStyle: 'normal' as const,
  };

  switch (type) {
    case 'WINNER': {
      const posText = data.position || 'First Place';
      const elements: React.ReactNode[] = [
        'for outstanding performance\nand for securing ',
        React.createElement(Text, { key: 'hl', style: highlightStyle }, posText),
      ];
      if (data.domain) {
        elements.push(`\nin the ${data.domain} category at`);
      }
      return elements;
    }
    case 'PARTICIPATION':
      return ['for actively participating and contributing their talents to'];
    case 'COMPLETION':
      return ['for successfully completing and demonstrating mastery in'];
    case 'SPEAKER':
      return ['for sharing knowledge and expertise as a distinguished speaker at'];
    default:
      return ['for contributing to'];
  }
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────────
export async function generateCertificatePDF(data: CertData): Promise<Buffer> {
  const type       = data.type.toUpperCase();
  const verifyUrl  = `${FRONTEND_URL}/verify/${data.certId}`;
  const qrDataUrl  = await QRCode.toDataURL(verifyUrl, {
    width: 160, margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
  const dateStr     = formatDateUpper(data.issuedAt);
  const subtitle    = subtitleMap[type] ?? 'of Participation';
  const hasFaculty  = Boolean(data.facultyName);
  const verifyDomain = FRONTEND_URL.replace(/^https?:\/\//, '');
  const descElements = buildDescription(data, type);

  if (!data.codescrietLogoUrl) {
    logger.warn('Certificate PDF rendering without CodeScriet logo', { certId: data.certId });
  }
  if (!data.ccsuLogoUrl) {
    logger.warn('Certificate PDF rendering without CCSU logo', { certId: data.certId });
  }

  return renderToBuffer(
    React.createElement(Document, null,
      React.createElement(Page, {
        size: [W, H],
        style: { backgroundColor: C.bg, position: 'relative', overflow: 'hidden' },
      },

        // ── OUTER BORDER (maroon, 2px, 25px inset) ──────────────────────────
        React.createElement(View, {
          style: {
            position: 'absolute', top: 25, left: 25, right: 25, bottom: 25,
            borderWidth: 2, borderColor: C.maroon, borderStyle: 'solid',
          },
        }),

        // ── INNER BORDER (gold, 1px, 33px inset) ────────────────────────────
        React.createElement(View, {
          style: {
            position: 'absolute', top: 33, left: 33, right: 33, bottom: 33,
            borderWidth: 1, borderColor: C.gold, borderStyle: 'solid',
          },
        }),

        // ── WATERMARK (CodeScriet logo, 4% opacity, centred, 320px) ─────────
        ...(data.codescrietLogoUrl ? [
          React.createElement(Image, {
            key: 'wm',
            style: {
              position: 'absolute',
              top: (H - 320) / 2,
              left: (W - 320) / 2,
              width: 320, height: 320,
              opacity: 0.04,
            },
            src: data.codescrietLogoUrl,
          }),
        ] : []),

        // ── CONTENT WRAPPER (padding 45/45/55/45, flex column, space-between)
        React.createElement(View, {
          style: {
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            paddingTop: 45, paddingRight: 45, paddingBottom: 55, paddingLeft: 45,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
        },

          // ── HEADER ROW ──────────────────────────────────────────────────
          React.createElement(View, {
            style: {
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', paddingHorizontal: 10,
            },
          },
            // CCSU Logo
            React.createElement(View, {
              style: { width: 90, height: 80, justifyContent: 'center', alignItems: 'center' },
            },
              ...(data.ccsuLogoUrl ? [
                React.createElement(Image, {
                  key: 'ccsu-logo',
                  style: { height: 75, objectFit: 'contain' as const },
                  src: data.ccsuLogoUrl,
                }),
              ] : []),
            ),
            // Header text
            React.createElement(View, {
              style: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
            },
              React.createElement(Text, {
                style: {
                  fontFamily: 'Cinzel', fontSize: 15, fontWeight: 700,
                  color: C.textMain, letterSpacing: 1.5,
                },
              }, 'CHAUDHARY CHARAN SINGH UNIVERSITY, MEERUT'),
              React.createElement(Text, {
                style: {
                  fontFamily: 'CormorantGaramond', fontSize: 15, fontWeight: 600,
                  color: C.maroon, letterSpacing: 2, marginTop: 4,
                },
              }, 'CODE.SCRIET CODING CLUB'),
            ),
            // CodeScriet Logo
            React.createElement(View, {
              style: { width: 90, height: 80, justifyContent: 'center', alignItems: 'center' },
            },
              ...(data.codescrietLogoUrl ? [
                React.createElement(Image, {
                  key: 'cs-logo',
                  style: { height: 75, objectFit: 'contain' as const },
                  src: data.codescrietLogoUrl,
                }),
              ] : []),
            ),
          ),

          // ── TITLE GROUP (marginTop -5 tightens gap to header) ───────────
          React.createElement(View, {
            style: { alignItems: 'center', marginTop: -5 },
          },
            React.createElement(Text, {
              style: {
                fontFamily: 'Cinzel', fontSize: 44, fontWeight: 700,
                color: C.textMain, letterSpacing: 8, lineHeight: 1,
              },
            }, 'CERTIFICATE'),
            React.createElement(Text, {
              style: {
                fontFamily: 'CormorantGaramond', fontStyle: 'italic', fontSize: 22,
                color: C.gold, marginTop: 6,
              },
            }, subtitle),
          ),

          // ── DIVIDER (line — diamond — line) ─────────────────────────────
          React.createElement(Svg, { width: 300, height: 12 },
            React.createElement(Line, {
              x1: 0, y1: 6, x2: 130, y2: 6,
              stroke: C.gold, strokeWidth: 1, opacity: 0.6,
            }),
            React.createElement(Polygon, {
              points: '150,1 156,6 150,11 144,6',
              fill: C.maroon,
            }),
            React.createElement(Line, {
              x1: 170, y1: 6, x2: 300, y2: 6,
              stroke: C.gold, strokeWidth: 1, opacity: 0.6,
            }),
          ),

          // ── RECIPIENT GROUP (fixed height 115, centred) ─────────────────
          React.createElement(View, {
            style: {
              alignItems: 'center', justifyContent: 'center',
              height: 115, width: '100%',
            },
          },
            React.createElement(Text, {
              style: {
                fontFamily: 'Cinzel', fontSize: 11,
                color: C.textMuted, letterSpacing: 2, marginBottom: 8,
              },
            }, 'THIS CERTIFICATE IS PROUDLY PRESENTED TO'),
            // Use only bundled fonts that are verified to load on the server.
            React.createElement(Text, {
              style: {
                fontFamily: 'CormorantGaramond', fontSize: nameFontSize(data.recipientName),
                color: C.maroon,
                lineHeight: 1.1, letterSpacing: 0.5,
                textAlign: 'center', maxWidth: 680,
              },
            }, data.recipientName),
            React.createElement(View, {
              style: {
                width: 400, height: 1,
                backgroundColor: C.textMain, opacity: 0.2,
                marginTop: 8,
              },
            }),
          ),

          // ── EVENT GROUP ─────────────────────────────────────────────────
          React.createElement(View, {
            style: { alignItems: 'center', marginBottom: 5 },
          },
            // Description text (italic, 19px, with optional highlight)
            React.createElement(Text, {
              style: {
                fontFamily: 'CormorantGaramond', fontStyle: 'italic', fontSize: 19,
                color: C.textMain, maxWidth: 650, lineHeight: 1.4,
                textAlign: 'center', marginBottom: 10,
              },
            }, ...descElements),
            // Event name
            React.createElement(Text, {
              style: {
                fontFamily: 'Cinzel', fontWeight: 700, fontSize: 18,
                color: C.textMain, letterSpacing: 1.5, marginTop: 5,
              },
            }, data.eventName.toUpperCase()),
            // Date
            React.createElement(Text, {
              style: {
                fontFamily: 'Cinzel', fontSize: 11,
                color: C.gold, letterSpacing: 1.5, marginTop: 6,
              },
            }, dateStr),
          ),

          // ── BOTTOM ROW (signatures + verification) ──────────────────────
          React.createElement(View, {
            style: {
              flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'flex-end', width: '100%',
              paddingHorizontal: 35,
            },
          },
            // LEFT — Primary signatory signature
            React.createElement(View, {
              style: { alignItems: 'center', width: 190 },
            },
              React.createElement(Text, {
                style: {
                  fontFamily: 'GreatVibes', fontSize: 28,
                  color: C.textMain, opacity: 0.8, marginBottom: -5,
                },
              }, data.signatoryName),
              React.createElement(View, {
                style: {
                  width: '100%', height: 1,
                  backgroundColor: C.textMain, opacity: 0.5, marginBottom: 6,
                },
              }),
              React.createElement(Text, {
                style: {
                  fontFamily: 'Cinzel', fontSize: 11, fontWeight: 700,
                  color: C.textMain, letterSpacing: 1,
                },
              }, data.signatoryName.toUpperCase()),
              React.createElement(Text, {
                style: {
                  fontFamily: 'CormorantGaramond', fontSize: 12, fontStyle: 'italic',
                  color: C.textMuted, marginTop: 2,
                },
              }, data.signatoryTitle || 'Club President'),
            ),

            // CENTRE — Verification block (QR 52x52, no border box)
            React.createElement(View, {
              style: { alignItems: 'center', justifyContent: 'flex-end' },
            },
              React.createElement(Image, {
                src: qrDataUrl,
                style: { width: 52, height: 52, marginBottom: 10 },
              }),
              React.createElement(Text, {
                style: {
                  fontFamily: 'CormorantGaramond', fontSize: 13, fontWeight: 700,
                  color: C.textMain, letterSpacing: 0.5, marginBottom: 4,
                },
              }, `Certificate ID: ${data.certId}`),
              React.createElement(Text, {
                style: {
                  fontFamily: 'CormorantGaramond', fontSize: 11,
                  color: C.textMuted,
                },
              }, `Verify at ${verifyDomain}`),
            ),

            // RIGHT — Faculty signatory (or empty placeholder for symmetric layout)
            ...(hasFaculty ? [
              React.createElement(View, {
                key: 'faculty-sig',
                style: { alignItems: 'center', width: 190 },
              },
                React.createElement(Text, {
                  style: {
                    fontFamily: 'GreatVibes', fontSize: 28,
                    color: C.textMain, opacity: 0.8, marginBottom: -5,
                  },
                }, data.facultyName!),
                React.createElement(View, {
                  style: {
                    width: '100%', height: 1,
                    backgroundColor: C.textMain, opacity: 0.5, marginBottom: 6,
                  },
                }),
                React.createElement(Text, {
                  style: {
                    fontFamily: 'Cinzel', fontSize: 11, fontWeight: 700,
                    color: C.textMain, letterSpacing: 1,
                  },
                }, data.facultyName!.toUpperCase()),
                React.createElement(Text, {
                  style: {
                    fontFamily: 'CormorantGaramond', fontSize: 12, fontStyle: 'italic',
                    color: C.textMuted, marginTop: 2,
                  },
                }, data.facultyTitle || 'Faculty Coordinator'),
              ),
            ] : [
              React.createElement(View, { key: 'empty-sig', style: { width: 190 } }),
            ]),
          ),
        ),
      )
    )
  );
}

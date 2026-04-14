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
import { marked, type Token, type Tokens } from 'marked';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.join(__dirname, '..', '..', 'public', 'logos');

// ── CUSTOM FONTS ──────────────────────────────────────────────────────────────
const GREAT_VIBES_PATH       = path.join(LOGOS_DIR, 'GreatVibes.ttf');
const CINZEL_REG_PATH        = path.join(LOGOS_DIR, 'Cinzel-Regular.woff');
const CINZEL_BOLD_PATH       = path.join(LOGOS_DIR, 'Cinzel-Bold.woff');
const CORMORANT_PATH         = path.join(LOGOS_DIR, 'CormorantGaramond.ttf');
const CORMORANT_ITALIC_PATH  = path.join(LOGOS_DIR, 'CormorantGaramond-Italic.ttf');
const PLAYFAIR_BOLD_PATH     = path.join(LOGOS_DIR, 'PlayfairDisplay-Bold.woff');

let fontsInitialized = false;
let fontInitPromise: Promise<void> | null = null;
export async function initFonts(): Promise<void> {
  if (fontsInitialized) return;

  if (!fontInitPromise) {
    fontInitPromise = (async () => {
      const failures: string[] = [];

      const attemptRegistration = (
        name: string,
        register: () => void,
      ) => {
        try {
          register();
        } catch (err) {
          failures.push(name);
          logger.error(`Failed to register ${name}`, { error: err });
        }
      };

      attemptRegistration('GreatVibes', () => {
        Font.register({
          family: 'GreatVibes',
          src: GREAT_VIBES_PATH,
        });
      });

      attemptRegistration('Cinzel', () => {
        Font.register({
          family: 'Cinzel',
          fonts: [
            { src: CINZEL_REG_PATH, fontWeight: 400 },
            { src: CINZEL_BOLD_PATH, fontWeight: 700 },
          ],
        });
      });

      attemptRegistration('CormorantGaramond', () => {
        Font.register({
          family: 'CormorantGaramond',
          fonts: [
            { src: CORMORANT_PATH },
            { src: CORMORANT_ITALIC_PATH, fontStyle: 'italic' },
          ],
        });
      });

      attemptRegistration('PlayfairDisplay', () => {
        Font.register({
          family: 'PlayfairDisplay',
          fonts: [{ src: PLAYFAIR_BOLD_PATH, fontWeight: 700 }],
        });
      });

      if (failures.length > 0) {
        throw new Error(`Certificate font initialization failed for: ${failures.join(', ')}`);
      }

      Font.registerHyphenationCallback((word: string) => [word]);
      fontsInitialized = true;
      logger.info('Certificate fonts initialized from local assets');
    })().catch((error) => {
      fontInitPromise = null;
      fontsInitialized = false;
      throw error;
    });
  }

  await fontInitPromise;
}

export function resetFontInitializationForTests(): void {
  fontsInitialized = false;
  fontInitPromise = null;
}

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://codescriet.dev').replace(/\/+$/, '');

export interface CertData {
  recipientName:            string;
  teamName?:                string;
  eventName:                string;
  type:                     string;
  position?:                string;
  domain?:                  string;
  description?:             string;
  certId:                   string;
  issuedAt:                 Date;
  // Signatory — image preferred, typed name fallback (GreatVibes font)
  signatoryName:            string;
  signatoryTitle?:          string;          // e.g. "Club President"
  signatoryImageUrl?:       string;          // processed signature image (base64 data URI or URL)
  // Faculty signatory (optional) — same image-first, text-fallback logic
  facultyName?:             string;
  facultyTitle?:            string;          // e.g. "Faculty Coordinator"
  facultySignatoryImageUrl?: string;         // processed signature image (base64 data URI or URL)
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

export function formatPosition(pos: string): string {
  const p = pos.trim().toLowerCase();
  if (p === '1' || p === '1st' || p === '1st place' || p === 'first' || p === 'first place') return 'First Place';
  if (p === '2' || p === '2nd' || p === '2nd place' || p === 'second' || p === 'second place') return 'Second Place';
  if (p === '3' || p === '3rd' || p === '3rd place' || p === 'third' || p === 'third place') return 'Third Place';
  if (p === '4' || p === '4th' || p === 'fourth') return 'Fourth Place';
  if (p === '5' || p === '5th' || p === 'fifth') return 'Fifth Place';
  
  if (/^\d+(st|nd|rd|th)$/.test(p)) {
    return pos.trim() + ' Place';
  }
  return pos.trim();
}

type MarkdownInlineTextStyle = {
  fontWeight?: 700;
  fontStyle?: 'italic';
  textDecoration?: 'line-through';
};

function hasInlineTokens(token: Token): token is Token & { tokens: Token[] } {
  return Array.isArray((token as { tokens?: unknown }).tokens);
}

function hasInlineText(token: Token): token is Token & { text: string } {
  return typeof (token as { text?: unknown }).text === 'string';
}

function getNestedTokens(token: Token): Token[] {
  return hasInlineTokens(token) ? token.tokens : [];
}

function getListItems(token: Token): Tokens.ListItem[] {
  const rawItems = (token as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems.filter((item): item is Tokens.ListItem => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const candidate = item as { raw?: unknown; text?: unknown; tokens?: unknown };
    return (
      typeof candidate.raw === 'string'
      && typeof candidate.text === 'string'
      && Array.isArray(candidate.tokens)
    );
  });
}

function getListStart(token: Token): number {
  const start = (token as { start?: unknown }).start;
  return typeof start === 'number' ? start : 1;
}

function isOrderedList(token: Token): boolean {
  return (token as { ordered?: unknown }).ordered === true;
}

function pushStyledText(
  nodes: React.ReactNode[],
  text: string,
  key: string,
  style: MarkdownInlineTextStyle,
) {
  if (!text) {
    return;
  }

  const hasStyle = Boolean(style.fontWeight || style.fontStyle || style.textDecoration);
  if (!hasStyle) {
    nodes.push(text);
    return;
  }

  nodes.push(React.createElement(Text, { key, style }, text));
}

function renderMarkdownInlineTokens(
  tokens: Token[],
  keyPrefix: string,
  style: MarkdownInlineTextStyle = {},
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  tokens.forEach((token, tokenIndex) => {
    const tokenKey = `${keyPrefix}-${tokenIndex}`;

    switch (token.type) {
      case 'strong': {
        nodes.push(...renderMarkdownInlineTokens(getNestedTokens(token), tokenKey, { ...style, fontWeight: 700 }));
        break;
      }
      case 'em': {
        nodes.push(...renderMarkdownInlineTokens(getNestedTokens(token), tokenKey, { ...style, fontStyle: 'italic' }));
        break;
      }
      case 'del': {
        nodes.push(...renderMarkdownInlineTokens(getNestedTokens(token), tokenKey, { ...style, textDecoration: 'line-through' }));
        break;
      }
      case 'br': {
        nodes.push('\n');
        break;
      }
      case 'link': {
        nodes.push(...renderMarkdownInlineTokens(getNestedTokens(token), tokenKey, style));
        break;
      }
      case 'text': {
        const nestedTokens = getNestedTokens(token);
        if (nestedTokens.length > 0) {
          nodes.push(...renderMarkdownInlineTokens(nestedTokens, tokenKey, style));
          break;
        }
        pushStyledText(nodes, token.text, tokenKey, style);
        break;
      }
      case 'escape':
      case 'codespan': {
        pushStyledText(nodes, token.text, tokenKey, style);
        break;
      }
      default: {
        const nestedTokens = getNestedTokens(token);
        if (nestedTokens.length > 0) {
          nodes.push(...renderMarkdownInlineTokens(nestedTokens, tokenKey, style));
          break;
        }

        if (hasInlineText(token)) {
          pushStyledText(nodes, token.text, tokenKey, style);
        }
      }
    }
  });

  return nodes;
}

function parseMarkdownDescription(description: string): React.ReactNode[] {
  try {
    const blockTokens = marked.lexer(description, { gfm: true, breaks: true });
    const nodes: React.ReactNode[] = [];

    blockTokens.forEach((token, tokenIndex) => {
      const tokenKey = `md-block-${tokenIndex}`;

      switch (token.type) {
        case 'paragraph': {
          nodes.push(...renderMarkdownInlineTokens(getNestedTokens(token), tokenKey));
          break;
        }
        case 'heading': {
          nodes.push(...renderMarkdownInlineTokens(getNestedTokens(token), tokenKey, { fontWeight: 700 }));
          break;
        }
        case 'text': {
          const nestedTokens = getNestedTokens(token);
          if (nestedTokens.length > 0) {
            nodes.push(...renderMarkdownInlineTokens(nestedTokens, tokenKey));
          } else {
            nodes.push(token.text);
          }
          break;
        }
        case 'list': {
          const listItems = getListItems(token);
          const listStart = getListStart(token);
          listItems.forEach((item, itemIndex) => {
            const marker = isOrderedList(token) ? `${listStart + itemIndex}. ` : '• ';
            nodes.push(marker);
            nodes.push(...renderMarkdownInlineTokens(item.tokens, `${tokenKey}-item-${itemIndex}`));
            if (itemIndex < listItems.length - 1) {
              nodes.push('\n');
            }
          });
          break;
        }
        case 'blockquote': {
          nodes.push('"');
          nodes.push(...renderMarkdownInlineTokens(getNestedTokens(token), `${tokenKey}-quote`));
          nodes.push('"');
          break;
        }
        case 'code': {
          nodes.push(token.text);
          break;
        }
        case 'space': {
          nodes.push('\n');
          break;
        }
        default: {
          const nestedTokens = getNestedTokens(token);
          if (nestedTokens.length > 0) {
            nodes.push(...renderMarkdownInlineTokens(nestedTokens, tokenKey));
          } else if (hasInlineText(token)) {
            nodes.push(token.text);
          }
        }
      }

      if (tokenIndex < blockTokens.length - 1) {
        nodes.push('\n');
      }
    });

    while (nodes.length > 0 && nodes[nodes.length - 1] === '\n') {
      nodes.pop();
    }

    return nodes.length > 0 ? nodes : [description];
  } catch (error) {
    logger.warn('Failed to parse markdown description for certificate PDF; using plain text', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [description];
  }
}

// ── DESCRIPTION BUILDER ────────────────────────────────────────────────────────
export function buildDescription(data: CertData, type: string): React.ReactNode[] {
  if (data.description) {
    return parseMarkdownDescription(data.description);
  }

  const highlightStyle = {
    fontWeight: 700 as const,
    color: C.maroon,
    fontStyle: 'normal' as const,
  };

  switch (type) {
    case 'WINNER': {
      const posText = data.position ? formatPosition(data.position) : 'First Place';
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
      return ['for actively participating and contributing their efforts to'];
    case 'COMPLETION':
      return ['for successfully completing and demonstrating mastery in'];
    case 'SPEAKER':
      return ['for sharing their valuable knowledge and expertise as a speaker at'];
    default:
      return ['for their valuable contribution and participation at'];
  }
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────────
export async function generateCertificatePDF(data: CertData): Promise<Buffer> {
  // Ensure fonts are pre-fetched and registered before rendering
  await initFonts();

  const type       = data.type.toUpperCase();
  const verifyUrl  = `${FRONTEND_URL}/verify/${data.certId}`;
  const qrDataUrl  = await QRCode.toDataURL(verifyUrl, {
    width: 400, margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
  const dateStr     = formatDateUpper(data.issuedAt);
  const subtitle    = subtitleMap[type] ?? 'of Participation';
  const hasFaculty  = Boolean(data.facultyName);
  const verifyDomain = FRONTEND_URL.replace(/^https?:\/\//, '');
  const descElements = buildDescription(data, type);
  const teamLine = data.teamName ? `Member of Team ${data.teamName}` : null;

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
              }, 'CODE.SCRIET CODING COMMUNITY'),
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
                fontFamily: 'Cinzel', fontSize: 48, fontWeight: 700,
                color: C.textMain, lineHeight: 1, paddingBottom: 5,
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
              height: 140, width: '100%',
            },
          },
            React.createElement(Text, {
              style: {
                fontFamily: 'Cinzel', fontSize: 11,
                color: C.textMuted, letterSpacing: 2, marginBottom: 8,
              },
            }, 'THIS CERTIFICATE IS PROUDLY PRESENTED TO'),
            React.createElement(Text, {
              style: {
                fontFamily: 'PlayfairDisplay', fontWeight: 700,
                fontSize: nameFontSize(data.recipientName),
                color: C.maroon,
                lineHeight: 1.1, letterSpacing: 0.5,
                textAlign: 'center', maxWidth: 680,
              },
            }, data.recipientName),
            ...(teamLine
              ? [
                  React.createElement(Text, {
                    key: 'team-line',
                    style: {
                      fontFamily: 'CormorantGaramond',
                      fontSize: 18,
                      color: C.textMuted,
                      marginTop: 6,
                      textAlign: 'center',
                      maxWidth: 620,
                    },
                  }, teamLine),
                ]
              : []),
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
            React.createElement(View, { style: { width: 240 } }),

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

            React.createElement(View, { style: { width: 240 } }),
          ),
        ),

        // ── PRIMARY SIGNATORY (absolute-positioned, left) ──────────────
        React.createElement(View, {
          style: {
            position: 'absolute',
            left: 55,
            bottom: 58,
            width: 240,
            alignItems: 'center',
          },
        },
          // Signature: image if available, otherwise GreatVibes cursive text
          ...(data.signatoryImageUrl
            ? [
                React.createElement(Image, {
                  key: 'sig-img',
                  src: data.signatoryImageUrl,
                  style: {
                    width: 220,
                    maxHeight: 80,
                    objectFit: 'contain' as const,
                    marginBottom: -20,
                  },
                }),
              ]
            : [
                React.createElement(Text, {
                  key: 'sig-text',
                  style: {
                    fontFamily: 'GreatVibes',
                    fontSize: 28,
                    lineHeight: 1.1,
                    color: '#333333',
                    textAlign: 'center',
                    width: '100%',
                    marginBottom: 6,
                  },
                }, data.signatoryName),
              ]
          ),
          React.createElement(View, {
            style: {
              width: '100%',
              height: 1,
              backgroundColor: C.textMain,
              opacity: 0.5,
              marginBottom: 8,
            },
          }),
          React.createElement(Text, {
            style: {
              fontFamily: 'Cinzel',
              fontSize: 11,
              fontWeight: 700,
              color: C.textMain,
              letterSpacing: 1,
            },
          }, data.signatoryName.toUpperCase()),
          React.createElement(Text, {
            style: {
              fontFamily: 'CormorantGaramond',
              fontSize: 12,
              fontStyle: 'italic',
              color: C.textMuted,
              marginTop: 2,
            },
          }, data.signatoryTitle || 'Club President'),
        ),

        // ── FACULTY SIGNATORY (absolute-positioned, right) ──────────────
        ...(hasFaculty ? [
          React.createElement(View, {
            key: 'faculty-signature-absolute',
            style: {
              position: 'absolute',
              right: 55,
              bottom: 58,
              width: 240,
              alignItems: 'center',
            },
          },
            // Faculty signature: image if available, otherwise GreatVibes cursive text
            ...(data.facultySignatoryImageUrl
              ? [
                  React.createElement(Image, {
                    key: 'fac-sig-img',
                    src: data.facultySignatoryImageUrl,
                    style: {
                      width: 220,
                      maxHeight: 80,
                      objectFit: 'contain' as const,
                      marginBottom: -20,
                    },
                  }),
                ]
              : [
                  React.createElement(Text, {
                    key: 'fac-sig-text',
                    style: {
                      fontFamily: 'GreatVibes',
                      fontSize: 28,
                      lineHeight: 1.1,
                      color: '#333333',
                      textAlign: 'center',
                      width: '100%',
                      marginBottom: 6,
                    },
                  }, data.facultyName ?? ''),
                ]
            ),
            React.createElement(View, {
              style: {
                width: '100%',
                height: 1,
                backgroundColor: C.textMain,
                opacity: 0.5,
                marginBottom: 8,
              },
            }),
            React.createElement(Text, {
              style: {
                fontFamily: 'Cinzel',
                fontSize: 11,
                fontWeight: 700,
                color: C.textMain,
                letterSpacing: 1,
              },
            }, (data.facultyName ?? '').toUpperCase()),
            React.createElement(Text, {
              style: {
                fontFamily: 'CormorantGaramond',
                fontSize: 12,
                fontStyle: 'italic',
                color: C.textMuted,
                marginTop: 2,
              },
            }, data.facultyTitle || 'Faculty Coordinator'),
          ),
        ] : []),
      )
    )
  );
}

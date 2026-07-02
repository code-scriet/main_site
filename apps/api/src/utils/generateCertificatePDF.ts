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
const subtitleMap: Record<string, string> = {
  PARTICIPATION: 'of Participation',
  COMPLETION:    'of Achievement',
  WINNER:        'of Excellence',
  SPEAKER:       'of Recognition',
  APPRECIATION:  'of Appreciation',
};

// Scale name font size for long names (react-pdf has no clamp)
function nameFontSize(name: string): number {
  const len = name.length;
  if (len <= 18) return 50.5;
  if (len <= 26) return 44.5;
  if (len <= 34) return 40.5;
  return 36.5;
}

type DescriptionLayoutConfig = {
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  eventNameFontSize: number;
  eventNameMarginTop: number;
  eventGroupMarginBottom: number;
  recipientSectionHeight: number;
  recipientSectionNoNameHeight: number;
  contentTopPadding: number;
};

function getDescriptionLayoutConfig(description: string | undefined): DescriptionLayoutConfig {
  if (!description) {
    return {
      fontSize: 19,
      lineHeight: 1.4,
      maxWidth: 650,
      eventNameFontSize: 18,
      eventNameMarginTop: 5,
      eventGroupMarginBottom: 5,
      recipientSectionHeight: 140,
      recipientSectionNoNameHeight: 110,
      contentTopPadding: 45,
    };
  }

  const compactDescription = description.replace(/\s+/g, ' ').trim();
  const lineBreakCount = (description.match(/\n/g) ?? []).length;
  const sizeScore = compactDescription.length + (lineBreakCount * 28);

  if (sizeScore >= 700) {
    return {
      fontSize: 13,
      lineHeight: 1.2,
      maxWidth: 610,
      eventNameFontSize: 15,
      eventNameMarginTop: 2,
      eventGroupMarginBottom: 0,
      recipientSectionHeight: 124,
      recipientSectionNoNameHeight: 98,
      contentTopPadding: 38,
    };
  }

  if (sizeScore >= 520) {
    return {
      fontSize: 14.5,
      lineHeight: 1.24,
      maxWidth: 620,
      eventNameFontSize: 16,
      eventNameMarginTop: 3,
      eventGroupMarginBottom: 1,
      recipientSectionHeight: 128,
      recipientSectionNoNameHeight: 100,
      contentTopPadding: 40,
    };
  }

  if (sizeScore >= 380) {
    return {
      fontSize: 16,
      lineHeight: 1.28,
      maxWidth: 630,
      eventNameFontSize: 17,
      eventNameMarginTop: 4,
      eventGroupMarginBottom: 2,
      recipientSectionHeight: 132,
      recipientSectionNoNameHeight: 104,
      contentTopPadding: 42,
    };
  }

  return {
    fontSize: 17,
    lineHeight: 1.32,
    maxWidth: 640,
    eventNameFontSize: 18,
    eventNameMarginTop: 4,
    eventGroupMarginBottom: 4,
    recipientSectionHeight: 136,
    recipientSectionNoNameHeight: 108,
    contentTopPadding: 44,
  };
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

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

type MarkdownInlineTextStyle = {
  fontFamily?: 'Cinzel' | 'CormorantGaramond';
  fontWeight?: 700;
  fontStyle?: 'italic' | 'normal';
  textDecoration?: 'line-through';
  color?: string;
};

const POSITION_TEMPLATE_MARKER_PATTERN = /\[\[cert-position:([^\]]+)\]\]/g;

const POSITION_TEMPLATE_HIGHLIGHT_STYLE: MarkdownInlineTextStyle = {
  fontWeight: 700,
  color: C.maroon,
  fontStyle: 'normal',
};

function hasInlineTokens(token: Token): token is Token & { tokens: Token[] } {
  return Array.isArray((token as { tokens?: unknown }).tokens);
}

function hasInlineText(token: Token): token is Token & { text: string } {
  return typeof (token as { text?: unknown }).text === 'string';
}

function getTokenTextOrRaw(token: Token): string {
  if (hasInlineText(token)) {
    return token.text;
  }

  const raw = (token as { raw?: unknown }).raw;
  return typeof raw === 'string' ? raw : '';
}

function normalizeHtmlDescription(raw: string): string {
  return raw
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|h[1-6]|blockquote|pre|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<\s*\/\s*li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function renderTextWithTemplateMarkers(
  text: string,
  keyPrefix: string,
  style: MarkdownInlineTextStyle,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let markerIndex = 0;

  for (const match of text.matchAll(POSITION_TEMPLATE_MARKER_PATTERN)) {
    const [fullMatch, positionText] = match;
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      pushStyledText(nodes, text.slice(lastIndex, matchIndex), `${keyPrefix}-plain-${markerIndex}`, style);
    }

    nodes.push(React.createElement(Text, {
      key: `${keyPrefix}-position-${markerIndex}`,
      style: { ...style, ...POSITION_TEMPLATE_HIGHLIGHT_STYLE },
    }, positionText));

    lastIndex = matchIndex + fullMatch.length;
    markerIndex++;
  }

  if (lastIndex < text.length) {
    pushStyledText(nodes, text.slice(lastIndex), `${keyPrefix}-tail-${markerIndex}`, style);
  }

  return nodes;
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
        nodes.push(...renderMarkdownInlineTokens(getNestedTokens(token), tokenKey, {
          ...style,
          fontFamily: 'Cinzel',
          fontWeight: 700,
          fontStyle: 'normal',
        }));
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
        nodes.push(...renderTextWithTemplateMarkers(token.text, tokenKey, style));
        break;
      }
      case 'escape':
      case 'codespan': {
        nodes.push(...renderTextWithTemplateMarkers(token.text, tokenKey, style));
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
          nodes.push(...renderMarkdownInlineTokens(getNestedTokens(token), tokenKey, {
            fontFamily: 'Cinzel',
            fontWeight: 700,
            fontStyle: 'normal',
          }));
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
            const marker = isOrderedList(token) ? `${listStart + itemIndex}. ` : '- ';
            nodes.push(marker);
            nodes.push(...renderMarkdownInlineTokens(item.tokens, `${tokenKey}-item-${itemIndex}`));
            if (itemIndex < listItems.length - 1) {
              nodes.push('\n');
            }
          });
          break;
        }
        case 'html': {
          const normalized = normalizeHtmlDescription(getTokenTextOrRaw(token));
          if (normalized) {
            nodes.push(normalized);
          }
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
export function buildDescription(data: CertData, type: string, hasEventName = true): React.ReactNode[] {
  const customDescription = normalizeOptionalText(data.description);
  if (customDescription) {
    return parseMarkdownDescription(customDescription);
  }

  const highlightStyle = {
    fontWeight: 700 as const,
    color: C.maroon,
    fontStyle: 'normal' as const,
  };

  switch (type) {
    case 'WINNER': {
      const posText = data.position ? formatPosition(data.position) : 'First Place';
      const domain = normalizeOptionalText(data.domain);
      const elements: React.ReactNode[] = [
        'for outstanding performance\nand for securing ',
        React.createElement(Text, { key: 'hl', style: highlightStyle }, posText),
      ];
      if (domain) {
        elements.push(`\nin the ${domain} category${hasEventName ? ' at' : '.'}`);
      }
      return elements;
    }
    case 'PARTICIPATION':
      return [
        hasEventName
          ? 'for actively participating and contributing their efforts to'
          : 'for actively participating and contributing their efforts.',
      ];
    case 'COMPLETION':
      return [
        hasEventName
          ? 'for successfully completing and demonstrating mastery in'
          : 'for successfully completing and demonstrating mastery.',
      ];
    case 'SPEAKER':
      return [
        hasEventName
          ? 'for sharing their valuable knowledge and expertise as a speaker at'
          : 'for sharing their valuable knowledge and expertise as a speaker.',
      ];
    case 'APPRECIATION':
      return [
        hasEventName
          ? 'in sincere appreciation of their dedicated support and valuable contribution to'
          : 'in sincere appreciation of their dedicated support and valuable contribution.',
      ];
    default:
      return [
        hasEventName
          ? 'for their valuable contribution and participation at'
          : 'for their valuable contribution and participation.',
      ];
  }
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────────
export async function generateCertificatePDF(data: CertData): Promise<Buffer> {
  // Ensure fonts are pre-fetched and registered before rendering
  await initFonts();

  const type       = data.type.toUpperCase();
  const certId = normalizeOptionalText(data.certId);
  const verifyUrl = certId ? `${FRONTEND_URL}/verify/${encodeURIComponent(certId)}` : `${FRONTEND_URL}/verify`;
  const qrDataUrl  = await QRCode.toDataURL(verifyUrl, {
    width: 400, margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
  const subtitle = subtitleMap[type] ?? 'of Participation';
  const recipientName = normalizeOptionalText(data.recipientName);
  const teamName = normalizeOptionalText(data.teamName);
  const eventName = normalizeOptionalText(data.eventName);
  const hasEventName = Boolean(eventName);
  const signatoryName = normalizeOptionalText(data.signatoryName);
  const signatoryTitle = normalizeOptionalText(data.signatoryTitle);
  const signatoryImageUrl = normalizeOptionalText(data.signatoryImageUrl);
  const facultyName = normalizeOptionalText(data.facultyName);
  const facultyTitle = normalizeOptionalText(data.facultyTitle);
  const facultySignatoryImageUrl = normalizeOptionalText(data.facultySignatoryImageUrl);
  const hasPrimarySignatory = Boolean(signatoryImageUrl || signatoryName || signatoryTitle);
  const hasFacultySignatory = Boolean(facultySignatoryImageUrl || facultyName || facultyTitle);
  const sideReserveWidth = hasPrimarySignatory || hasFacultySignatory ? 240 : 0;
  const customDescription = normalizeOptionalText(data.description);
  const hasCustomDescription = Boolean(customDescription);
  const descriptionLayout = getDescriptionLayoutConfig(customDescription);
  const verifyDomain = FRONTEND_URL.replace(/^https?:\/\//, '');
  const descElements = buildDescription(data, type, hasEventName);
  const teamLine = teamName ? `Member of Team ${teamName}` : null;

  if (!data.codescrietLogoUrl) {
    logger.warn('Certificate PDF rendering without CodeScriet logo', { certId: certId ?? 'missing' });
  }
  if (!data.ccsuLogoUrl) {
    logger.warn('Certificate PDF rendering without CCSU logo', { certId: certId ?? 'missing' });
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
            paddingTop: descriptionLayout.contentTopPadding, paddingRight: 45, paddingBottom: 55, paddingLeft: 45,
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
                  fontFamily: 'Cinzel', fontSize: 11, fontWeight: 700,
                  color: C.maroon, letterSpacing: 0.6,
                },
              }, 'Sir Chhotu Ram Institute of Engineering Technology (SCRIET)'),
              React.createElement(Text, {
                style: {
                  fontFamily: 'Cinzel', fontSize: 12, fontWeight: 700,
                  color: C.textMain, letterSpacing: 0.8, marginTop: 3,
                },
              }, 'Chaudhary Charan Singh University Campus, Meerut'),
              React.createElement(Text, {
                style: {
                  fontFamily: 'CormorantGaramond', fontSize: 11,
                  color: C.textMain, letterSpacing: 1.1, marginTop: 2,
                },
              }, 'Approved by AICTE (NAAC A++ Accredited)'),
              React.createElement(Text, {
                style: {
                  fontFamily: 'CormorantGaramond', fontSize: 14, fontWeight: 700,
                  fontStyle: 'italic',
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

          // ── TITLE GROUP (slightly lower to add breathing room from header) ─
          React.createElement(View, {
            style: { alignItems: 'center', marginTop: 8 },
          },
            React.createElement(Text, {
              style: {
                fontFamily: 'Cinzel', fontSize: 46.5, fontWeight: 700,
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
              height: recipientName || teamLine ? descriptionLayout.recipientSectionHeight : descriptionLayout.recipientSectionNoNameHeight,
              width: '100%',
            },
          },
            React.createElement(Text, {
              style: {
                fontFamily: 'Cinzel', fontSize: 11,
                color: C.textMuted, letterSpacing: 2, marginBottom: 8,
              },
            }, 'THIS CERTIFICATE IS PROUDLY PRESENTED TO'),
            ...(recipientName
              ? [
                  React.createElement(Text, {
                    key: 'recipient-name',
                    style: {
                      fontFamily: 'PlayfairDisplay', fontWeight: 700,
                      fontSize: nameFontSize(recipientName),
                      color: C.maroon,
                      lineHeight: 1.1, letterSpacing: 0.5,
                      textAlign: 'center', maxWidth: 680,
                    },
                  }, recipientName),
                ]
              : []),
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
                marginTop: recipientName || teamLine ? 8 : 2,
              },
            }),
          ),

          // ── EVENT GROUP ─────────────────────────────────────────────────
          React.createElement(View, {
            style: { alignItems: 'center', marginBottom: descriptionLayout.eventGroupMarginBottom },
          },
            // Description text (italic, 19px, with optional highlight)
            React.createElement(Text, {
              style: {
                fontFamily: 'CormorantGaramond',
                fontStyle: hasCustomDescription ? 'normal' : 'italic',
                fontSize: descriptionLayout.fontSize,
                color: C.textMain,
                maxWidth: descriptionLayout.maxWidth,
                lineHeight: descriptionLayout.lineHeight,
                textAlign: 'center',
                marginBottom: hasEventName ? 8 : 4,
              },
            }, ...descElements),
            ...(hasEventName
              ? [
                  React.createElement(Text, {
                    key: 'event-name',
                    style: {
                      fontFamily: 'Cinzel', fontWeight: 700,
                      fontSize: descriptionLayout.eventNameFontSize,
                      color: C.textMain, letterSpacing: 1.5,
                      marginTop: descriptionLayout.eventNameMarginTop,
                    },
                  }, (eventName ?? '').toUpperCase()),
                ]
              : []),
          ),

          // ── BOTTOM ROW (signatures + verification) ──────────────────────
          React.createElement(View, {
            style: {
              flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'flex-end', width: '100%',
              paddingHorizontal: 35,
            },
          },
            React.createElement(View, { style: { width: sideReserveWidth } }),

            // CENTRE — Verification block (QR 52x52, no border box)
            React.createElement(View, {
              style: { alignItems: 'center', justifyContent: 'flex-end' },
            },
              React.createElement(Image, {
                src: qrDataUrl,
                style: { width: 52, height: 52, marginBottom: 10 },
              }),
              ...(certId
                ? [
                    React.createElement(Text, {
                      key: 'cert-id',
                      style: {
                        fontFamily: 'CormorantGaramond', fontSize: 13, fontWeight: 700,
                        color: C.textMain, letterSpacing: 0.5, marginBottom: 4,
                      },
                    }, `Certificate ID: ${certId}`),
                  ]
                : []),
              React.createElement(Text, {
                style: {
                  fontFamily: 'CormorantGaramond', fontSize: 11,
                  color: C.textMuted,
                },
              }, `Verify at ${verifyDomain}`),
            ),

            React.createElement(View, { style: { width: sideReserveWidth } }),
          ),
        ),

        // ── PRIMARY SIGNATORY (absolute-positioned, left) ──────────────
        ...(hasPrimarySignatory ? [
          React.createElement(View, {
            key: 'primary-signature-absolute',
            style: {
              position: 'absolute',
              left: 55,
              bottom: 58,
              width: 240,
              alignItems: 'center',
            },
          },
            // Signature: image if available, otherwise GreatVibes cursive text
            ...(signatoryImageUrl
              ? [
                  React.createElement(Image, {
                    key: 'sig-img',
                    src: signatoryImageUrl,
                    style: {
                      width: 220,
                      maxHeight: 80,
                      objectFit: 'contain' as const,
                      marginBottom: -20,
                    },
                  }),
                ]
              : signatoryName
                ? [
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
                    }, signatoryName),
                  ]
                : []
            ),
            ...(signatoryName || signatoryTitle
              ? [
                  React.createElement(View, {
                    key: 'primary-signature-line',
                    style: {
                      width: '100%',
                      height: 1,
                      backgroundColor: C.textMain,
                      opacity: 0.5,
                      marginBottom: 8,
                    },
                  }),
                ]
              : []),
            ...(signatoryName
              ? [
                  React.createElement(Text, {
                    key: 'primary-signature-name',
                    style: {
                      fontFamily: 'Cinzel',
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.textMain,
                      letterSpacing: 1,
                    },
                  }, signatoryName.toUpperCase()),
                ]
              : []),
            ...(signatoryTitle
              ? [
                  React.createElement(Text, {
                    key: 'primary-signature-title',
                    style: {
                      fontFamily: 'CormorantGaramond',
                      fontSize: 12,
                      fontStyle: 'italic',
                      color: C.textMuted,
                      marginTop: 2,
                    },
                  }, signatoryTitle),
                ]
              : []),
          ),
        ] : []),

        // ── FACULTY SIGNATORY (absolute-positioned, right) ──────────────
        ...(hasFacultySignatory ? [
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
              ...(facultySignatoryImageUrl
              ? [
                  React.createElement(Image, {
                    key: 'fac-sig-img',
                      src: facultySignatoryImageUrl,
                    style: {
                      width: 220,
                      maxHeight: 80,
                      objectFit: 'contain' as const,
                      marginBottom: -20,
                    },
                  }),
                ]
              : facultyName
                ? [
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
                    }, facultyName),
                  ]
                : []
            ),
            ...(facultyName || facultyTitle
              ? [
                  React.createElement(View, {
                    key: 'faculty-signature-line',
                    style: {
                      width: '100%',
                      height: 1,
                      backgroundColor: C.textMain,
                      opacity: 0.5,
                      marginBottom: 8,
                    },
                  }),
                ]
              : []),
            ...(facultyName
              ? [
                  React.createElement(Text, {
                    key: 'faculty-signature-name',
                    style: {
                      fontFamily: 'Cinzel',
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.textMain,
                      letterSpacing: 1,
                    },
                  }, facultyName.toUpperCase()),
                ]
              : []),
            ...(facultyTitle
              ? [
                  React.createElement(Text, {
                    key: 'faculty-signature-title',
                    style: {
                      fontFamily: 'CormorantGaramond',
                      fontSize: 12,
                      fontStyle: 'italic',
                      color: C.textMuted,
                      marginTop: 2,
                    },
                  }, facultyTitle),
                ]
              : []),
          ),
        ] : []),
      )
    )
  );
}

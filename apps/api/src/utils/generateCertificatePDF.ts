import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';

export type CertTemplate = 'gold' | 'dark' | 'white' | 'emerald';

const THEMES: Record<CertTemplate, {
  bg: string;
  accent: string;
  nameColor: string;
  textColor: string;
  subtext: string;
}> = {
  gold:    { bg: '#0f0e0a', accent: '#c9a84c', nameColor: '#f0d080', textColor: '#e8dcc8', subtext: '#8a7a5a' },
  dark:    { bg: '#0a0a14', accent: '#6366f1', nameColor: '#e0e7ff', textColor: '#c7d2fe', subtext: '#818cf8' },
  white:   { bg: '#fafaf8', accent: '#1a1a2e', nameColor: '#1a1a2e', textColor: '#2d2d3e', subtext: '#666'    },
  emerald: { bg: '#0a1a12', accent: '#10b981', nameColor: '#6ee7b7', textColor: '#a7f3d0', subtext: '#34d399' },
};

export interface CertData {
  recipientName: string;
  eventName: string;
  type: string;
  position?: string;
  domain?: string;
  certId: string;
  issuedAt: Date;
  signatoryName: string;
  template: CertTemplate;
}

export async function generateCertificatePDF(data: CertData): Promise<Buffer> {
  const T = THEMES[data.template] ?? THEMES.gold;
  const verifyUrl = `https://codescriet.dev/verify/${data.certId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 });

  const typeVerb: Record<string, string> = {
    PARTICIPATION: 'participated in',
    COMPLETION: 'successfully completed',
    WINNER: 'won',
    SPEAKER: 'spoken at',
  };
  const verb = (typeVerb[data.type.toUpperCase()] ?? 'participated in').toUpperCase();

  const dateStr = data.issuedAt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const styles = StyleSheet.create({
    page:        { backgroundColor: T.bg, width: 841.89, height: 595.28, position: 'relative', fontFamily: 'Times-Roman' },
    outerBorder: { position: 'absolute', top: 18, left: 18, right: 18, bottom: 18, border: `2pt solid ${T.accent}`, opacity: 0.5 },
    innerBorder: { position: 'absolute', top: 24, left: 24, right: 24, bottom: 24, border: `0.5pt solid ${T.accent}`, opacity: 0.2 },
    clubName:    { position: 'absolute', top: 38, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: T.accent, letterSpacing: 5 },
    certifyText: { position: 'absolute', top: 108, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: T.subtext, letterSpacing: 4 },
    name:        { position: 'absolute', top: 126, left: 60, right: 60, textAlign: 'center', fontSize: 46, fontFamily: 'Times-BoldItalic', color: T.nameColor },
    divider:     { position: 'absolute', top: 194, left: 310, right: 310, height: 1.5, backgroundColor: T.accent },
    typeText:    { position: 'absolute', top: 208, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: T.subtext, letterSpacing: 3 },
    eventName:   { position: 'absolute', top: 228, left: 80, right: 80, textAlign: 'center', fontSize: 24, fontFamily: 'Times-Bold', color: T.textColor },
    badge:       { position: 'absolute', top: 272, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: T.accent, letterSpacing: 2 },
    dateLabel:   { position: 'absolute', bottom: 72, left: 60, fontSize: 7, color: T.subtext, letterSpacing: 2 },
    dateValue:   { position: 'absolute', bottom: 55, left: 60, fontSize: 11, fontFamily: 'Times-Bold', color: T.textColor },
    dateLine:    { position: 'absolute', bottom: 50, left: 60, width: 80, height: 0.5, backgroundColor: T.subtext, opacity: 0.4 },
    sigName:     { position: 'absolute', bottom: 72, left: 0, right: 0, textAlign: 'center', fontSize: 13, fontFamily: 'Times-Italic', color: T.nameColor },
    sigLine:     { position: 'absolute', bottom: 55, left: '36%', right: '36%', height: 0.5, backgroundColor: T.subtext, opacity: 0.4 },
    sigLabel:    { position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', fontSize: 7, color: T.subtext, letterSpacing: 2 },
    qrWrap:      { position: 'absolute', bottom: 36, right: 52, backgroundColor: '#ffffff', padding: 5, borderRadius: 4 },
    qrImg:       { width: 68, height: 68 },
    certIdText:  { position: 'absolute', bottom: 22, right: 52, fontSize: 6.5, color: T.subtext, fontFamily: 'Courier', letterSpacing: 0.5, textAlign: 'center', width: 78 },
  });

  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: [841.89, 595.28], style: styles.page },
      React.createElement(View, { style: styles.outerBorder }),
      React.createElement(View, { style: styles.innerBorder }),
      React.createElement(Text, { style: styles.clubName }, '\u26A1  CODESCRIET'),
      React.createElement(Text, { style: styles.certifyText }, 'THIS IS TO CERTIFY THAT'),
      React.createElement(Text, { style: styles.name }, data.recipientName),
      React.createElement(View, { style: styles.divider }),
      React.createElement(Text, { style: styles.typeText }, `HAS ${verb}`),
      React.createElement(Text, { style: styles.eventName }, data.eventName),
      ...(data.type.toUpperCase() === 'WINNER' && data.position
        ? [React.createElement(Text, { style: styles.badge }, `\uD83C\uDFC6  ${data.position.toUpperCase()}`)]
        : []),
      React.createElement(Text, { style: styles.dateLabel }, 'DATE ISSUED'),
      React.createElement(Text, { style: styles.dateValue }, dateStr),
      React.createElement(View, { style: styles.dateLine }),
      React.createElement(Text, { style: styles.sigName }, data.signatoryName),
      React.createElement(View, { style: styles.sigLine }),
      React.createElement(Text, { style: styles.sigLabel }, 'AUTHORIZED SIGNATORY'),
      React.createElement(
        View,
        { style: styles.qrWrap },
        React.createElement(Image, { style: styles.qrImg, src: qrDataUrl }),
      ),
      React.createElement(Text, { style: styles.certIdText }, data.certId),
    ),
  );

  const pdfBuffer = await pdf(doc).toBuffer();
  return pdfBuffer as unknown as Buffer;
}

import type { CertificateTemplate } from '@/lib/api';
import { CERT_TYPES, type CertType } from '@/components/admin/certificates/CertTypeBadge';

export interface BulkEntry {
  name: string;
  email: string;
  position?: string;
  domain?: string;
  description?: string;
  teamName?: string;
  type?: CertType;
  template?: CertificateTemplate;
  userId?: string;
}

export const BULK_CSV_HEADER_ALIASES: Record<string, keyof BulkEntry> = {
  name: 'name',
  recipientname: 'name',
  email: 'email',
  recipientemail: 'email',
  position: 'position',
  rank: 'position',
  placement: 'position',
  domain: 'domain',
  track: 'domain',
  description: 'description',
  teamname: 'teamName',
  team: 'teamName',
  type: 'type',
  template: 'template',
  userid: 'userId',
  useridnumber: 'userId',
};

export function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < row.length; index++) {
    const char = row[index];

    if (char === '"') {
      if (inQuotes && row[index + 1] === '"') {
        current += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/\r$/, ''));
}

export function isHeaderRow(values: string[]): boolean {
  const normalized = values.slice(0, 3).map(normalizeCsvHeader);
  return normalized[0] === 'name' && normalized[1] === 'email';
}

export function normalizeTemplateValue(value: string | undefined | null): CertificateTemplate | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'gold' || normalized === 'dark' || normalized === 'white' || normalized === 'emerald'
    ? normalized
    : undefined;
}

export function normalizeCertTypeValue(value: string | undefined | null): CertType | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return CERT_TYPES.includes(normalized as CertType) ? (normalized as CertType) : undefined;
}

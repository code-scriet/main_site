export interface SignatoryDefaults {
  signatoryId: string;
  signatoryName: string;
  signatoryTitle: string;
  facultySignatoryId: string;
  facultyName: string;
  facultyTitle: string;
}

const SIGNATORY_STORAGE_KEY = 'cert_signatory_defaults';

export const DEFAULT_SIGNATORY_DEFAULTS: SignatoryDefaults = {
  signatoryId: '',
  signatoryName: '',
  signatoryTitle: 'Club President',
  facultySignatoryId: '',
  facultyName: '',
  facultyTitle: 'Faculty Coordinator',
};

export function loadSignatoryDefaults(): SignatoryDefaults {
  try {
    const saved = localStorage.getItem(SIGNATORY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        signatoryId: parsed.signatoryId || '',
        signatoryName: parsed.signatoryName || '',
        signatoryTitle: parsed.signatoryTitle || 'Club President',
        facultySignatoryId: parsed.facultySignatoryId || '',
        facultyName: parsed.facultyName || '',
        facultyTitle: parsed.facultyTitle || 'Faculty Coordinator',
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_SIGNATORY_DEFAULTS;
}

export function saveSignatoryDefaults(data: SignatoryDefaults): void {
  try { localStorage.setItem(SIGNATORY_STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

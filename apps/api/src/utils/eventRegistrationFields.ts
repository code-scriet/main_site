export const REGISTRATION_FIELD_TYPES = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'EMAIL',
  'PHONE',
  'URL',
] as const;

export type RegistrationFieldType = (typeof REGISTRATION_FIELD_TYPES)[number];

export interface EventRegistrationFieldDefinition {
  id: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface RegistrationFieldSubmission {
  fieldId: string;
  value: string;
}

export interface RegistrationFieldResponse {
  fieldId: string;
  label: string;
  value: string;
}

const FIELD_ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;

function asOptionalTrimmedString(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }
  const value = input.trim();
  if (!value) {
    return undefined;
  }
  if (value.length > maxLength) {
    throw new Error(`Text exceeds maximum length of ${maxLength}`);
  }
  return value;
}

function asOptionalInteger(
  input: unknown,
  fieldName: string,
  min: number,
  max: number
): number | undefined {
  if (input === undefined || input === null || input === '') {
    return undefined;
  }
  const numeric = Number(input);
  if (!Number.isInteger(numeric)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  if (numeric < min || numeric > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return numeric;
}

function asOptionalNumber(
  input: unknown,
  fieldName: string,
  min: number,
  max: number
): number | undefined {
  if (input === undefined || input === null || input === '') {
    return undefined;
  }
  const numeric = Number(input);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  if (numeric < min || numeric > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return numeric;
}

function buildFieldId(label: string, index: number): string {
  const slugBase = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safeBase = slugBase || `field_${index + 1}`;
  return `field_${safeBase}`.slice(0, 64);
}

export function sanitizeEventRegistrationFields(input: unknown): EventRegistrationFieldDefinition[] {
  if (input === undefined || input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    throw new Error('registrationFields must be an array');
  }
  if (input.length > 25) {
    throw new Error('You can add at most 25 registration fields');
  }

  const usedIds = new Set<string>();

  return input.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Invalid registration field at position ${index + 1}`);
    }

    const candidate = entry as Record<string, unknown>;
    const label = asOptionalTrimmedString(candidate.label, 80);
    if (!label) {
      throw new Error(`Field name is required for field ${index + 1}`);
    }

    // Backward compatibility for legacy events that stored SELECT fields.
    const rawTypeCandidate = typeof candidate.type === 'string' ? candidate.type.toUpperCase() : 'TEXT';
    const rawType = rawTypeCandidate === 'SELECT' ? 'TEXT' : rawTypeCandidate;
    if (!REGISTRATION_FIELD_TYPES.includes(rawType as RegistrationFieldType)) {
      throw new Error(`Unsupported field type "${String(candidate.type)}" for "${label}"`);
    }
    const type = rawType as RegistrationFieldType;

    const legacyKey = typeof candidate.key === 'string' ? candidate.key : undefined;
    let id = typeof candidate.id === 'string' && FIELD_ID_REGEX.test(candidate.id)
      ? candidate.id
      : legacyKey && FIELD_ID_REGEX.test(legacyKey)
        ? legacyKey
        : buildFieldId(label, index);

    while (usedIds.has(id)) {
      id = `${id}_${index + 1}`.slice(0, 64);
    }
    usedIds.add(id);

    const placeholder = asOptionalTrimmedString(candidate.placeholder, 120);
    const pattern = asOptionalTrimmedString(candidate.pattern, 200);
    if (pattern) {
      try {
        new RegExp(pattern);
      } catch {
        throw new Error(`Invalid regex pattern for "${label}"`);
      }
    }

    const minLength = asOptionalInteger(candidate.minLength, `${label} minLength`, 0, 5000);
    const maxLength = asOptionalInteger(candidate.maxLength, `${label} maxLength`, 1, 5000);
    const min = asOptionalNumber(candidate.min, `${label} min`, -1_000_000_000, 1_000_000_000);
    const max = asOptionalNumber(candidate.max, `${label} max`, -1_000_000_000, 1_000_000_000);

    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
      throw new Error(`minLength cannot be greater than maxLength for "${label}"`);
    }
    if (min !== undefined && max !== undefined && min > max) {
      throw new Error(`min cannot be greater than max for "${label}"`);
    }

    return {
      id,
      label,
      type,
      required: Boolean(candidate.required),
      ...(placeholder && { placeholder }),
      ...(minLength !== undefined && { minLength }),
      ...(maxLength !== undefined && { maxLength }),
      ...(min !== undefined && { min }),
      ...(max !== undefined && { max }),
      ...(pattern && { pattern }),
    };
  });
}

function normalizeSubmissionValue(raw: unknown): string {
  if (raw === undefined || raw === null) {
    return '';
  }
  return String(raw).trim();
}

export function validateRegistrationFieldSubmissions(
  fields: EventRegistrationFieldDefinition[],
  submissions: unknown
): { errors: string[]; responses: RegistrationFieldResponse[] } {
  const errors: string[] = [];
  const responses: RegistrationFieldResponse[] = [];
  const submissionMap = new Map<string, string>();

  if (Array.isArray(submissions)) {
    for (const entry of submissions) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const parsed = entry as Record<string, unknown>;
      if (typeof parsed.fieldId !== 'string' || !parsed.fieldId.trim()) {
        continue;
      }
      submissionMap.set(parsed.fieldId, normalizeSubmissionValue(parsed.value));
    }
  }

  for (const field of fields) {
    const value = submissionMap.get(field.id) ?? '';

    if (field.required && !value) {
      errors.push(`${field.label} is required`);
      continue;
    }

    if (!value) {
      continue;
    }

    if (field.minLength !== undefined && value.length < field.minLength) {
      errors.push(`${field.label} must be at least ${field.minLength} characters`);
    }

    if (field.maxLength !== undefined && value.length > field.maxLength) {
      errors.push(`${field.label} must be at most ${field.maxLength} characters`);
    }

    if (field.type === 'NUMBER') {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) {
        errors.push(`${field.label} must be a valid number`);
      } else {
        if (field.min !== undefined && numberValue < field.min) {
          errors.push(`${field.label} must be >= ${field.min}`);
        }
        if (field.max !== undefined && numberValue > field.max) {
          errors.push(`${field.label} must be <= ${field.max}`);
        }
      }
    }

    if (field.type === 'EMAIL' && !EMAIL_REGEX.test(value)) {
      errors.push(`${field.label} must be a valid email address`);
    }

    if (field.type === 'PHONE' && !PHONE_REGEX.test(value)) {
      errors.push(`${field.label} must be a valid phone number`);
    }

    if (field.type === 'URL') {
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push(`${field.label} must be a valid URL`);
        }
      } catch {
        errors.push(`${field.label} must be a valid URL`);
      }
    }

    if (field.pattern) {
      try {
        const regex = new RegExp(field.pattern);
        if (!regex.test(value)) {
          errors.push(`${field.label} does not match the required format`);
        }
      } catch {
        errors.push(`${field.label} has an invalid validation pattern`);
      }
    }

    responses.push({
      fieldId: field.id,
      label: field.label,
      value,
    });
  }

  return { errors, responses };
}

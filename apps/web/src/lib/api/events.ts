import { request, requestBlob } from './_internal';
import type {
  Event,
  EventAdminRegistration,
  EventRegistrationExportFilters,
  EventRegistrationField,
  EventRegistrationFieldType,
  Registration,
  RegistrationAdditionalFieldInput,
} from '../api';

const EVENT_REGISTRATION_FIELD_TYPES: EventRegistrationFieldType[] = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'EMAIL',
  'PHONE',
  'URL',
];

const isEventRegistrationFieldType = (value: string): value is EventRegistrationFieldType =>
  EVENT_REGISTRATION_FIELD_TYPES.includes(value as EventRegistrationFieldType);

function normalizeEventRegistrationFields(input: unknown): EventRegistrationField[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const usedIds = new Set<string>();
  const normalized: EventRegistrationField[] = [];

  input.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const raw = entry as Record<string, unknown>;

    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    if (!label) return;

    const rawId =
      (typeof raw.id === 'string' && raw.id.trim()) ||
      (typeof raw.key === 'string' && raw.key.trim()) ||
      `field_${index + 1}`;

    let id = rawId;
    while (usedIds.has(id)) {
      id = `${rawId}_${index + 1}`;
    }
    usedIds.add(id);

    const rawType = typeof raw.type === 'string' ? raw.type.toUpperCase() : 'TEXT';
    const type = isEventRegistrationFieldType(rawType) ? rawType : 'TEXT';

    const toOptionalNumber = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;

    normalized.push({
      id,
      label,
      type,
      required: Boolean(raw.required),
      placeholder: typeof raw.placeholder === 'string' ? raw.placeholder : undefined,
      minLength: toOptionalNumber(raw.minLength),
      maxLength: toOptionalNumber(raw.maxLength),
      min: toOptionalNumber(raw.min),
      max: toOptionalNumber(raw.max),
      pattern: typeof raw.pattern === 'string' ? raw.pattern : undefined,
    });
  });

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeEventPayload(event: Event): Event {
  return {
    ...event,
    registrationFields: normalizeEventRegistrationFields(
      (event as Event & { registrationFields?: unknown }).registrationFields,
    ),
  };
}

export const eventsApi = {
  getEvents: async (status?: string) => {
    const params = status ? `?status=${status}` : '';
    const events = await request<Event[]>(`/events${params}`);
    return events.map((event) => normalizeEventPayload(event));
  },
  getEvent: async (id: string, token?: string) =>
    normalizeEventPayload(await request<Event>(`/events/${id}`, token ? { token } : {})),
  createEvent: (data: Partial<Event>, token: string) =>
    request<Event>('/events', { method: 'POST', body: JSON.stringify(data), token }),
  updateEvent: (id: string, data: Partial<Event>, token: string) =>
    request<Event>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteEvent: (id: string, token: string) =>
    request(`/events/${id}`, { method: 'DELETE', token }),
  getEventRegistrations: (eventId: string, token: string) =>
    request<EventAdminRegistration[]>(`/events/${eventId}/registrations`, { token }),
  deleteEventRegistration: (eventId: string, registrationId: string, token: string) =>
    request(`/events/${eventId}/registrations/${registrationId}`, { method: 'DELETE', token }),
  exportEventRegistrations: async (
    eventId: string,
    token: string,
    options?: { format?: 'xlsx' | 'csv'; filters?: EventRegistrationExportFilters },
  ) => {
    const params = new URLSearchParams();
    if (options?.format) {
      params.set('format', options.format);
    }

    const filters = options?.filters;
    if (filters?.year) params.set('year', filters.year);
    if (filters?.branch) params.set('branch', filters.branch);
    if (filters?.course) params.set('course', filters.course);
    if (filters?.userRole) params.set('userRole', filters.userRole);
    if (filters?.registrationType) params.set('registrationType', filters.registrationType);
    if (filters?.search) params.set('search', filters.search);

    const queryString = params.toString();
    return requestBlob(
      `/events/${eventId}/registrations/export${queryString ? `?${queryString}` : ''}`,
      { token },
    );
  },

  // Registrations
  registerForEvent: (
    eventId: string,
    token: string,
    additionalFields?: RegistrationAdditionalFieldInput[],
  ) =>
    request<Registration>(`/registrations/events/${eventId}`, {
      method: 'POST',
      body: JSON.stringify({
        ...(additionalFields ? { additionalFields } : {}),
      }),
      token,
    }),
  cancelRegistration: (eventId: string, token: string) =>
    request(`/registrations/events/${eventId}`, { method: 'DELETE', token }),
  getMyRegistrations: (token: string) =>
    request<Registration[]>('/registrations/my', { token }),
} as const;

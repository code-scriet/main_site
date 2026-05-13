import type { EventRegistrationField, EventRegistrationFieldType } from '@/lib/api';

export const eventTypes = [
  'Workshop',
  'Hackathon',
  'Meetup',
  'Bootcamp',
  'Competition',
  'Webinar',
  'Social Event',
  'Other',
] as const;

export const resourceTypes: Array<{ value: string; label: string }> = [
  { value: 'pdf', label: 'PDF Document' },
  { value: 'video', label: 'Video' },
  { value: 'github', label: 'GitHub Repo' },
  { value: 'slides', label: 'Slides' },
  { value: 'link', label: 'External Link' },
  { value: 'other', label: 'Other' },
];

export const registrationFieldTypes: Array<{ value: EventRegistrationFieldType; label: string }> = [
  { value: 'TEXT', label: 'Text' },
  { value: 'TEXTAREA', label: 'Long Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'URL', label: 'URL' },
];

export const createNewRegistrationField = (): EventRegistrationField => ({
  id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  label: '',
  type: 'TEXT',
  required: true,
  placeholder: '',
});

export interface EventFormState {
  title: string;
  shortDescription: string;
  description: string;
  eventType: string;
  startDate: string;
  endDate: string;
  eventDays: string;
  registrationStartDate: string;
  registrationEndDate: string;
  location: string;
  venue: string;
  capacity: string;
  prerequisites: string;
  imageUrl: string;
  agenda: string;
  highlights: string;
  learningOutcomes: string;
  targetAudience: string;
  videoUrl: string;
  featured: boolean;
  allowLateRegistration: boolean;
  teamRegistration: boolean;
  teamMinSize: number;
  teamMaxSize: number;
}

export const emptyEventForm = (): EventFormState => ({
  title: '',
  shortDescription: '',
  description: '',
  eventType: 'Workshop',
  startDate: '',
  endDate: '',
  eventDays: '1',
  registrationStartDate: '',
  registrationEndDate: '',
  location: '',
  venue: '',
  capacity: '',
  prerequisites: '',
  imageUrl: '',
  agenda: '',
  highlights: '',
  learningOutcomes: '',
  targetAudience: '',
  videoUrl: '',
  featured: false,
  allowLateRegistration: false,
  teamRegistration: false,
  teamMinSize: 2,
  teamMaxSize: 4,
});

export interface EventFormDateChecks {
  startDate: Date;
  endDate: Date | null;
  regStartDate: Date | null;
  regEndDate: Date | null;
}

/**
 * Validates the common date/required-field rules shared between
 * CreateEvent and EditEvent. Returns the parsed dates (so the caller
 * can reuse them) or a string error message.
 */
export const validateEventFormDates = (
  form: EventFormState,
): { ok: true; dates: EventFormDateChecks } | { ok: false; error: string } => {
  if (!form.title.trim() || !form.description.trim() || !form.startDate) {
    return { ok: false, error: 'Please fill in all required fields (Title, Description, Event Start Date)' };
  }

  const startDate = new Date(form.startDate);
  const endDate = form.endDate ? new Date(form.endDate) : null;
  const regStartDate = form.registrationStartDate ? new Date(form.registrationStartDate) : null;
  const regEndDate = form.registrationEndDate ? new Date(form.registrationEndDate) : null;

  if (endDate && endDate < startDate) {
    return { ok: false, error: 'Event end date must be after start date' };
  }
  if (regStartDate && regEndDate && regEndDate < regStartDate) {
    return { ok: false, error: 'Registration end date must be after registration start date' };
  }
  return { ok: true, dates: { startDate, endDate, regStartDate, regEndDate } };
};

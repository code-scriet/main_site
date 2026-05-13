import { formatDateTime } from '@/lib/dateUtils';
import type { AdminPollDetail } from '@/lib/api';

export const formatCsvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const downloadCsvFile = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
  const csvRows = [
    headers.map(formatCsvCell).join(','),
    ...rows.map((row) => row.map(formatCsvCell).join(',')),
  ];
  const content = `\uFEFF${csvRows.join('\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

type PollResponse = AdminPollDetail['responses'][number];
type PollFeedback = AdminPollDetail['feedback'][number];

export const buildResponsesCsvRows = (responses: PollResponse[]): Array<Array<string | number>> =>
  responses.map((response) => [
    response.user.name,
    response.user.email,
    response.user.role.replace(/_/g, ' '),
    response.optionLabels.join(' | '),
    formatDateTime(response.updatedAt),
  ]);

export const RESPONSES_CSV_HEADERS = ['Name', 'Email', 'Role', 'Selected Options', 'Updated At'];

export const buildFeedbackCsvRows = (entries: PollFeedback[]): Array<Array<string | number>> =>
  entries.map((entry) => [
    entry.message,
    entry.user.name,
    entry.user.email,
    entry.user.role.replace(/_/g, ' '),
    entry.message.trim().length,
    formatDateTime(entry.updatedAt),
  ]);

export const FEEDBACK_CSV_HEADERS = ['Message', 'Name', 'Email', 'Role', 'Length', 'Updated At'];

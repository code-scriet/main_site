export type EventStatusBadgeValue = 'UPCOMING' | 'ONGOING' | 'PAST';

export const eventStatusLabels: Record<EventStatusBadgeValue, string> = {
  UPCOMING: 'Upcoming',
  ONGOING: 'Happening Now',
  PAST: 'Completed',
};

const eventStatusBadgeClasses: Record<EventStatusBadgeValue, string> = {
  UPCOMING: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ONGOING: 'bg-amber-100 text-amber-800 border-amber-200',
  PAST: 'bg-gray-100 text-gray-600 border-gray-200',
};

const eventStatusBadgeVariants: Record<EventStatusBadgeValue, 'success' | 'warning' | 'secondary'> = {
  UPCOMING: 'success',
  ONGOING: 'warning',
  PAST: 'secondary',
};

export function getEventStatusBadgeClasses(status: EventStatusBadgeValue) {
  return eventStatusBadgeClasses[status];
}

export function getEventStatusBadgeVariant(status: EventStatusBadgeValue) {
  return eventStatusBadgeVariants[status];
}

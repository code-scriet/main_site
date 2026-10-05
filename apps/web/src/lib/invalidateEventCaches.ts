import type { QueryClient } from '@tanstack/react-query';

// Single choke point for "an event or registration changed" cache purges.
//
// Call it after event create/update/delete AND after any registration
// mutation (solo register, team create/join/leave/dissolve, invite accept,
// cancel) so no surface keeps rendering stale rows — e.g. a deleted event
// lingering on /events, or the dashboard still showing 0 upcoming right
// after a successful registration.
//
// Prefix semantics: invalidating ['my-registrations'] also matches
// ['my-registrations', token]; invalidating ['events'] also matches
// ['events', 'attendance-picker'].
export function invalidateEventCaches(qc: QueryClient, eventId?: string): void {
  // Public event list + attendance picker (both live under ['events', ...]).
  qc.invalidateQueries({ queryKey: ['events'] });
  // Every my-registrations variant (dashboard, overview, coding, events page).
  qc.invalidateQueries({ queryKey: ['my-registrations'] });
  // Home + dashboard empty-state signals derived from event/registration data.
  qc.invalidateQueries({ queryKey: ['home-my-registrations'] });
  qc.invalidateQueries({ queryKey: ['home-page-data'] });
  qc.invalidateQueries({ queryKey: ['dashboard', 'joinable-upcoming'] });
  // Admin list surfaces that embed event rows.
  qc.invalidateQueries({ queryKey: ['admin-events', 'registrations'] });
  qc.invalidateQueries({ queryKey: ['admin-events-for-contest'] });
  qc.invalidateQueries({ queryKey: ['admin-events-for-poll'] });
  qc.invalidateQueries({ queryKey: ['admin', 'backdate', 'events'] });
  // Per-event admin detail screens (only meaningful when we know the id).
  if (eventId) {
    qc.invalidateQueries({ queryKey: ['admin-event-detail', eventId] });
    qc.invalidateQueries({ queryKey: ['admin-event-regs-detail', eventId] });
    qc.invalidateQueries({ queryKey: ['admin-event-regs-stats', eventId] });
    qc.invalidateQueries({ queryKey: ['admin-event-teams', eventId] });
  }
}

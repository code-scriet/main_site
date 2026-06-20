// Event-ops domain: certificates, attendance, invitations, teams, competition.
// Bundled because they all relate to operating an actual event — from the
// invite/registration phase through running it, taking attendance, awarding
// certificates, and timed competition rounds.

import { API_URL, request } from './_internal';
import type {
  AttendanceCertificateRecipientsResponse,
  AttendanceHistoryEvent,
  AttendanceLiveData,
  AttendanceQR,
  AttendanceRecord,
  AttendanceSearchResult,
  CertType,
  CertificateBulkGenerateInput,
  CertificateBulkGenerateResponse,
  CertificateDetail,
  CertificateUpdateInput,
  CompetitionMissingTeam,
  CompetitionResult,
  CompetitionResultsSummaryResponse,
  CompetitionRound,
  CompetitionRoundPreview,
  CompetitionSubmission,
  EventInvitation,
  EventTeam,
  EventTeamMemberInfo,
} from '../api';

export const eventOpsApi = {
  // Certificates
  getCertificates: (token: string, params?: { page?: number; limit?: number; search?: string; type?: string; eventId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.type) qs.set('type', params.type);
    if (params?.eventId) qs.set('eventId', params.eventId);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ certificates: unknown[]; total: number; page: number; totalPages: number }>(`/certificates${query}`, { token });
  },
  generateCertificate: (data: Record<string, unknown>, token: string) =>
    request<{ certId: string; pdfUrl: string; downloadUrl: string; verifyUrl: string }>('/certificates/generate', { method: 'POST', body: JSON.stringify(data), token }),
  bulkGenerateCertificates: (data: CertificateBulkGenerateInput, token: string) =>
    request<CertificateBulkGenerateResponse>('/certificates/bulk', { method: 'POST', body: JSON.stringify(data), token }),
  downloadCertificate: (certId: string, token: string) =>
    request<{ url: string }>(`/certificates/download/${certId}`, { token }),
  getMyCertificates: (token: string, params?: { page?: number; limit?: number; type?: string; sort?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.type) qs.set('type', params.type);
    if (params?.sort) qs.set('sort', params.sort);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ certificates: unknown[]; total: number; page: number; totalPages: number }>(`/certificates/mine${query}`, { token });
  },
  revokeCertificate: (certId: string, reason: string | undefined, token: string) =>
    request<{ certId: string }>(`/certificates/${certId}/revoke`, { method: 'PATCH', body: JSON.stringify({ reason }), token }),
  deleteCertificate: (certId: string, token: string) =>
    request<{ certId: string }>(`/certificates/${certId}`, { method: 'DELETE', token }),
  resendCertificateEmail: (certId: string, token: string) =>
    request<{ sent: boolean }>(`/certificates/${certId}/resend`, { method: 'POST', token }),
  getCertificate: (certId: string, token: string) =>
    request<CertificateDetail>(`/certificates/${certId}`, { token }),
  updateCertificate: (certId: string, data: CertificateUpdateInput, token: string) =>
    request<{ certId: string; regenerated: boolean }>(`/certificates/${certId}`, { method: 'PATCH', body: JSON.stringify(data), token }),

  // Attendance
  getMyQR: (eventId: string, token: string) =>
    request<AttendanceQR>(`/attendance/my-qr/${eventId}`, { token }),
  scanAttendance: (qrToken: string, token: string, dayNumber: number, bypassWindow?: boolean) =>
    request<{ userId: string; userName: string; scannedAt: string; dayNumber: number }>('/attendance/scan', { method: 'POST', body: JSON.stringify({ token: qrToken, dayNumber, bypassWindow }), token }),
  scanAttendanceBatch: (scans: Array<{ token: string; scannedAtLocal: string; localId: string; dayNumber?: number }>, eventId: string, token: string, bypassWindow?: boolean) =>
    request<{ results: Array<{ localId: string; status: 'ok' | 'duplicate' | 'error'; name?: string; message?: string }> }>('/attendance/scan-batch', { method: 'POST', body: JSON.stringify({ scans, eventId, bypassWindow }), token }),
  manualCheckin: (registrationId: string, token: string, dayNumber = 1) =>
    request<{ registrationId: string; dayNumber: number }>('/attendance/manual-checkin', { method: 'POST', body: JSON.stringify({ registrationId, dayNumber }), token }),
  unmarkAttendance: (registrationId: string, token: string, dayNumber = 1) =>
    request<{ registrationId: string; dayNumber: number }>('/attendance/unmark', { method: 'PATCH', body: JSON.stringify({ registrationId, dayNumber }), token }),
  bulkUpdateAttendance: (registrationIds: string[], action: 'mark' | 'unmark', token: string, dayNumber = 1) =>
    request<{ updated: number }>('/attendance/bulk-update', { method: 'PATCH', body: JSON.stringify({ registrationIds, action, dayNumber }), token }),
  editAttendance: (registrationId: string, data: { scannedAt?: string; manualOverride?: boolean; dayNumber?: number }, token: string) =>
    request<{ registrationId: string }>(`/attendance/edit/${registrationId}`, { method: 'PATCH', body: JSON.stringify(data), token }),
  regenerateAttendanceToken: (registrationId: string, token: string) =>
    request<{ attendanceToken: string }>(`/attendance/regenerate-token/${registrationId}`, { method: 'POST', token }),
  regenerateAttendanceTokensForEvent: (eventId: string, token: string) =>
    request<{ regenerated: number; total: number }>(`/attendance/regenerate-tokens/event/${eventId}`, { method: 'POST', token }),
  searchAttendance: (eventId: string, query: string, token: string, page?: number) =>
    request<{ results: AttendanceSearchResult[]; total: number; page: number; totalPages: number }>(`/attendance/search?eventId=${eventId}&q=${encodeURIComponent(query)}${page ? `&page=${page}` : ''}`, { token }),
  getAttendanceLive: (eventId: string, token: string) =>
    request<AttendanceLiveData>(`/attendance/live/${eventId}`, { token }),
  getAttendanceFull: (eventId: string, token: string) =>
    request<{ registrations: AttendanceRecord[]; eventDays?: number; dayLabels?: string[] }>(`/attendance/event/${eventId}/full`, { token }),
  exportAttendanceExcel: async (eventId: string, token: string, dayNumber?: number) => {
    const dayQuery = typeof dayNumber === 'number' ? `?dayNumber=${dayNumber}` : '';
    const res = await fetch(`${API_URL}/attendance/event/${eventId}/export${dayQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Export failed');
    try {
      return await res.blob();
    } catch {
      throw new Error('Failed to parse export file');
    }
  },
  emailAbsentees: (eventId: string, subject: string, body: string, token: string, dayNumber?: number) =>
    request<{ emailed: number; sent?: number; dayNumber?: number }>(`/attendance/email-absentees/${eventId}`, { method: 'POST', body: JSON.stringify({ subject, body, dayNumber }), token }),
  getAttendanceCertRecipients: (eventId: string, token: string, minDays?: number, includeGuestNonAttendees?: boolean) => {
    const params = new URLSearchParams();
    if (typeof minDays === 'number') params.set('minDays', String(minDays));
    if (includeGuestNonAttendees) params.set('includeGuestNonAttendees', 'true');
    const query = params.toString();
    return request<AttendanceCertificateRecipientsResponse>(`/attendance/event/${eventId}/certificate-recipients${query ? `?${query}` : ''}`, { token });
  },
  getMyAttendanceHistory: (token: string) =>
    request<{ events: AttendanceHistoryEvent[] }>('/attendance/my-history', { token }),
  getAttendanceSummary: (eventId: string, token: string) =>
    request<{ total: number; attended: number; eventDays?: number; dayLabels?: string[]; daySummary?: Array<{ dayNumber: number; attended: number }> }>(`/attendance/event/${eventId}/summary`, { token }),
  backfillAttendanceTokens: (token: string) =>
    request<{ backfilled: number }>('/attendance/backfill-tokens', { method: 'POST', token }),

  // Invitations
  getMyInvitations: (token: string) =>
    request<EventInvitation[]>('/invitations/my', { token }),
  acceptInvitation: (id: string, token: string) =>
    request<{ invitation: EventInvitation; registration: { id: string; attendanceToken: string; eventId: string } }>(`/invitations/${id}/accept`, { method: 'POST', token }),
  declineInvitation: (id: string, token: string) =>
    request<EventInvitation>(`/invitations/${id}/decline`, { method: 'POST', token }),
  claimInvitation: (invitationToken: string, token: string) =>
    request<EventInvitation>('/invitations/claim', { method: 'POST', body: JSON.stringify({ token: invitationToken }), token }),
  searchInvitees: (
    query: string,
    eventId: string,
    token: string,
  ) => request<Array<{ userId: string; name: string; designation: string; company: string; photo?: string | null }>>(
    `/invitations/search-invitees?q=${encodeURIComponent(query)}&eventId=${encodeURIComponent(eventId)}`,
    { token },
  ),
  createInvitations: (
    data: {
      eventId: string;
      invitees: Array<{
        userId?: string;
        email?: string;
        role?: string;
        certificateEnabled?: boolean;
        certificateType?: CertType;
      }>;
      customMessage?: string;
    },
    token: string,
  ) => request<{ created: EventInvitation[]; skipped: Array<{ identifier: string; reason: string }> }>(
    '/invitations',
    { method: 'POST', body: JSON.stringify(data), token },
  ),
  getEventInvitations: (eventId: string, token: string) =>
    request<EventInvitation[]>(`/invitations/event/${eventId}`, { token }),
  updateInvitation: (
    id: string,
    data: Partial<Pick<EventInvitation, 'role' | 'customMessage' | 'certificateEnabled' | 'certificateType'>>,
    token: string,
  ) => request<EventInvitation>(`/invitations/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
  revokeInvitation: (id: string, token: string) =>
    request(`/invitations/${id}`, { method: 'DELETE', token }),
  resendInvitationEmail: (id: string, token: string) =>
    request<EventInvitation>(`/invitations/${id}/resend`, { method: 'POST', token }),

  // Team registration
  createTeam: (data: { eventId: string; teamName: string; customFieldResponses?: Record<string, unknown> }, token: string) =>
    request<{ team: EventTeam; event: { teamMinSize: number; teamMaxSize: number }; message: string }>('/teams/create', { method: 'POST', body: JSON.stringify(data), token }),
  joinTeam: (data: { inviteCode: string; customFieldResponses?: Record<string, unknown> }, token: string) =>
    request<{ team: EventTeam; event: { teamMinSize: number; teamMaxSize: number }; message: string }>('/teams/join', { method: 'POST', body: JSON.stringify(data), token }),
  getCompetitionRounds: (eventId: string, token?: string) =>
    request<{ rounds: CompetitionRoundPreview[] }>(`/competition/event/${eventId}`, { ...(token ? { token } : {}) }),
  getMyTeam: async (eventId: string, token: string): Promise<EventTeam | null> => {
    try {
      return await request<EventTeam>(`/teams/my-team/${eventId}`, { token });
    } catch {
      // 404 means no team — return null instead of throwing
      return null;
    }
  },
  toggleTeamLock: (teamId: string, token: string) =>
    request<{ isLocked: boolean }>(`/teams/${teamId}/lock`, { method: 'PATCH', token }),
  removeTeamMember: (teamId: string, userId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE', token }),
  leaveTeam: (teamId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/leave`, { method: 'POST', token }),
  transferLeadership: (teamId: string, newLeaderId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/transfer-leadership`, { method: 'POST', body: JSON.stringify({ newLeaderId }), token }),
  dissolveTeam: (teamId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/dissolve`, { method: 'DELETE', token }),
  getEventTeams: (eventId: string, token: string) =>
    request<{
      teams: Array<EventTeam & {
        memberCount: number;
        leader: { id: string; name: string; email: string; avatar: string | null };
        members: Array<EventTeamMemberInfo & {
          registration: { id: string; timestamp: string; customFieldResponses: unknown };
        }>;
      }>;
      event: { teamMinSize: number; teamMaxSize: number };
    }>(`/teams/event/${eventId}`, { token }),
  adminToggleTeamLock: (teamId: string, token: string) =>
    request<{ isLocked: boolean }>(`/teams/${teamId}/admin-lock`, { method: 'PATCH', token }),
  adminDissolveTeam: (teamId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/admin-dissolve`, { method: 'DELETE', token }),

  // Competition
  createCompetitionRound: (data: {
    eventId: string;
    title: string;
    description?: string;
    duration: number;
    roundType?: 'IMAGE_TARGET' | 'DSA';
    participantScope?: 'ALL' | 'SELECTED_TEAMS';
    leadersOnly?: boolean;
    allowedTeamIds?: string[];
    targetImageUrl?: string;
    problemIds?: string[];
    problems?: Array<{ problemId: string; displayOrder?: number; points?: number }>;
  }, token: string) =>
    request<{ round: CompetitionRound }>('/competition', { method: 'POST', body: JSON.stringify(data), token }),
  getCompetitionRoundsAdmin: (eventId: string, token: string) =>
    request<{ rounds: CompetitionRound[] }>(`/competition/event/${eventId}`, { token }),
  getCompetitionRound: (roundId: string, token: string) =>
    request<CompetitionRound>(`/competition/${roundId}`, { token }),
  startCompetitionRound: (roundId: string, token: string) =>
    request<{ round: CompetitionRound }>(`/competition/${roundId}/start`, { method: 'PATCH', token }),
  lockCompetitionRound: (roundId: string, token: string) =>
    request<{ message: string }>(`/competition/${roundId}/lock`, { method: 'PATCH', token }),
  beginJudging: (roundId: string, token: string) =>
    request<{ round: CompetitionRound }>(`/competition/${roundId}/judging`, { method: 'PATCH', token }),
  finishCompetition: (roundId: string, token: string) =>
    request<{ round: CompetitionRound }>(`/competition/${roundId}/finish`, { method: 'PATCH', token }),
  saveCompetitionCode: (roundId: string, data: { code: string }, token: string) =>
    request<{ savedAt: string; serverTime: string }>(`/competition/${roundId}/save`, { method: 'POST', body: JSON.stringify(data), token }),
  // IMAGE_TARGET final submit. DSA rounds submit through the Problems judge
  // (`/api/problems/:id/submit`, CONTEST context) from the playground shell, not here.
  submitCompetitionCode: (roundId: string, data: { code: string }, token: string) =>
    request<{ submission: { id: string; submittedAt: string }; message: string }>(`/competition/${roundId}/submit`, { method: 'POST', body: JSON.stringify(data), token }),
  getMyCompetitionSubmission: (roundId: string, token: string) =>
    request<{
      submission: (CompetitionSubmission & { submittedAt: string }) | null;
      autoSave: { code: string; savedAt: string } | null;
    }>(`/competition/${roundId}/my-submission`, { token }),
  getCompetitionSubmissions: (roundId: string, token: string) =>
    request<{
      round: CompetitionRound;
      submissions: CompetitionSubmission[];
      missingTeams: CompetitionMissingTeam[];
    }>(`/competition/${roundId}/submissions`, { token }),
  scoreCompetitionSubmission: (roundId: string, submissionId: string, data: { score?: number; rank?: number; adminNotes?: string }, token: string) =>
    request<{ submission: CompetitionSubmission }>(`/competition/${roundId}/score/${submissionId}`, { method: 'PATCH', body: JSON.stringify(data), token }),
  getCompetitionResults: (roundId: string) =>
    request<{ round: CompetitionRound; results: CompetitionResult[] }>(`/competition/${roundId}/results`),
  getCompetitionResultsSummary: (eventId: string, token: string) =>
    request<CompetitionResultsSummaryResponse>(`/competition/event/${eventId}/results-summary`, { token }),
  deleteCompetitionRound: (roundId: string, token: string) =>
    request<{ message: string }>(`/competition/${roundId}`, { method: 'DELETE', token }),
  updateCompetitionRound: (roundId: string, data: {
    title?: string;
    description?: string;
    duration?: number;
    roundType?: 'IMAGE_TARGET' | 'DSA';
    participantScope?: 'ALL' | 'SELECTED_TEAMS';
    leadersOnly?: boolean;
    allowedTeamIds?: string[];
    targetImageUrl?: string | null;
    problemIds?: string[];
    problems?: Array<{ problemId: string; displayOrder?: number; points?: number }>;
  }, token: string) =>
    request<{ round: CompetitionRound }>(`/competition/${roundId}`, { method: 'PUT', body: JSON.stringify(data), token }),
  publishContestAsPractice: (roundId: string, token: string) =>
    request<{ success: boolean }>(`/competition/${roundId}/publish-as-practice`, { method: 'POST', token }),
  raiseContestCap: (roundId: string, input: { userId?: string; problemId?: string; newCap: number }, token: string) =>
    request<{ success: boolean; affected: number }>(`/competition/${roundId}/raise-cap`, { method: 'POST', body: JSON.stringify(input), token }),
  exportCompetitionResults: async (roundId: string, token: string) => {
    const res = await fetch(`${API_URL}/competition/${roundId}/results/export?format=xlsx`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Export failed');
    try {
      return await res.blob();
    } catch {
      throw new Error('Failed to parse export file');
    }
  },
} as const;

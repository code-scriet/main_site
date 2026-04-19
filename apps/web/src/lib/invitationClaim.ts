const PENDING_INVITATION_CLAIM_STORAGE_KEY = 'pending_invitation_claim_token';

export function storePendingInvitationClaimToken(token: string) {
  const normalized = token.trim();
  if (!normalized) return;
  localStorage.setItem(PENDING_INVITATION_CLAIM_STORAGE_KEY, normalized);
}

export function getPendingInvitationClaimToken() {
  return localStorage.getItem(PENDING_INVITATION_CLAIM_STORAGE_KEY);
}

export function clearPendingInvitationClaimToken() {
  localStorage.removeItem(PENDING_INVITATION_CLAIM_STORAGE_KEY);
}

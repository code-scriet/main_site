// S-03 — "Add to LinkedIn profile" deep link.
// LinkedIn exposes a free, no-API endpoint that opens its "Add licenses &
// certifications" form pre-filled. One click puts a code.scriet credential on a
// member's profile, with the verification URL pointing recruiters back to us.
// Docs: https://addtoprofile.linkedin.com/

const CERT_TYPE_LABEL: Record<string, string> = {
  PARTICIPATION: 'Participation',
  COMPLETION: 'Completion',
  WINNER: 'Achievement',
  SPEAKER: 'Speaker',
};

export function linkedInAddCertUrl(opts: {
  certId: string;
  type: string;
  eventName?: string | null;
  issuedAt?: string;
}): string {
  const typeLabel = CERT_TYPE_LABEL[opts.type] ?? 'Certificate';
  // The credential title shown on the profile, e.g. "DSA Contest — Achievement".
  const name = [opts.eventName?.trim(), typeLabel].filter(Boolean).join(' — ') || 'code.scriet Certificate';
  const certUrl = `${window.location.origin}/verify/${opts.certId}`;

  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name,
    organizationName: 'code.scriet',
    certUrl,
    certId: opts.certId,
  });

  // Pre-fill the issue month/year when we know it (LinkedIn expects 1-based month).
  if (opts.issuedAt) {
    const d = new Date(opts.issuedAt);
    if (!Number.isNaN(d.getTime())) {
      params.set('issueYear', String(d.getFullYear()));
      params.set('issueMonth', String(d.getMonth() + 1));
    }
  }

  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

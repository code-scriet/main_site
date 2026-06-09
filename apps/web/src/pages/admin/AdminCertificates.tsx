// Dashboard v2 — Admin · Certificates.
// V2 chrome (filter bar + table + signatories sub-section) wrapping the full HEAD
// feature set: single-recipient generate + bulk CSV generate + signatory CRUD.
// Design source: screen-admin2.jsx:456 (AdminCertificatesScreen) and brief §7.18.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Plus, Search, Download, Mail, Trash2, Ban, Loader2, ExternalLink, Pencil, FileUp, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type CertType, type CertificateEmailTemplate } from '@/lib/api';
import { Avatar, DSCard, EmptyState, Pill, SegmentedTabs, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Restored generate dialogs — orphaned by the v2 sweep, now re-wired.
import { type ActiveSignatory } from '@/components/admin/certificates/SignatoryPicker';
import {
  GenerateCertificateDialog,
  type GenerateFormData,
} from '@/components/admin/certificates/GenerateCertificateDialog';
import { BulkGenerateDialog } from '@/components/admin/certificates/BulkGenerateDialog';
import {
  DEFAULT_SIGNATORY_DEFAULTS,
  loadSignatoryDefaults,
  saveSignatoryDefaults,
  type SignatoryDefaults,
} from '@/lib/signatoryDefaults';
import {
  BULK_CSV_HEADER_ALIASES,
  isHeaderRow,
  normalizeCertTypeValue,
  normalizeCsvHeader,
  normalizeTemplateValue,
  parseCsvRow,
  type BulkEntry,
} from '@/lib/certificatesCsv';

interface SignatoryRow {
  id: string;
  name: string;
  title: string;
  signatureUrl: string | null;
  isActive: boolean;
}

interface CertRow {
  id: string;
  certId: string;
  recipientName: string;
  recipientEmail: string;
  eventName: string;
  type: CertType;
  template?: string;
  pdfUrl?: string;
  issuedAt: string;
  emailSent: boolean;
  isRevoked: boolean;
  viewCount?: number;
}

type StatusFilter = 'all' | 'active' | 'revoked';
type TypeFilter = 'all-type' | 'PARTICIPATION' | 'COMPLETION' | 'WINNER' | 'SPEAKER';

const TYPE_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'info'> = {
  PARTICIPATION: 'neutral',
  COMPLETION: 'success',
  WINNER: 'warning',
  SPEAKER: 'info',
};

function createDefaultForm(defaults: SignatoryDefaults = DEFAULT_SIGNATORY_DEFAULTS): GenerateFormData {
  return {
    recipientName: '',
    recipientEmail: '',
    eventName: '',
    type: 'PARTICIPATION',
    position: '',
    domain: '',
    teamName: '',
    description: '',
    signatoryId: defaults.signatoryId,
    signatoryName: defaults.signatoryName,
    signatoryTitle: defaults.signatoryTitle,
    signatoryImageUrl: '',
    facultySignatoryId: defaults.facultySignatoryId,
    facultyName: defaults.facultyName,
    facultyTitle: defaults.facultyTitle,
    facultyImageUrl: '',
    sendEmail: false,
    emailTemplate: 'default',
    emailSignerName: 'PRINCE GUPTA',
  };
}

export default function AdminCertificates() {
  const { token } = useAuth();
  const qc = useQueryClient();

  // Filters + pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all-type');
  const [page, setPage] = useState(1);

  // Dialogs
  const [revokeTarget, setRevokeTarget] = useState<CertRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CertRow | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Signatory inline modal (compact card-style — sub-section list uses this)
  const [sigOpen, setSigOpen] = useState(false);
  const [sigForm, setSigForm] = useState<{ id?: string; name: string; title: string; signatureUrl: string }>({ name: '', title: 'Club President', signatureUrl: '' });
  // Replaces the legacy window.confirm() for removing a signatory.
  const [sigDeleteTarget, setSigDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ─── Generate single (restored)
  const [showGenerate, setShowGenerate] = useState(false);
  const [form, setForm] = useState<GenerateFormData>(() => createDefaultForm());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // ─── Bulk generate (restored)
  const [showBulk, setShowBulk] = useState(false);
  const [bulkEventName, setBulkEventName] = useState('');
  const [bulkType, setBulkType] = useState<CertType>('PARTICIPATION');
  const [bulkSignatoryId, setBulkSignatoryId] = useState(DEFAULT_SIGNATORY_DEFAULTS.signatoryId);
  const [bulkSignatory, setBulkSignatory] = useState(DEFAULT_SIGNATORY_DEFAULTS.signatoryName);
  const [bulkSignatoryTitle, setBulkSignatoryTitle] = useState(DEFAULT_SIGNATORY_DEFAULTS.signatoryTitle);
  const [bulkFacultySignatoryId, setBulkFacultySignatoryId] = useState(DEFAULT_SIGNATORY_DEFAULTS.facultySignatoryId);
  const [bulkFacultyName, setBulkFacultyName] = useState(DEFAULT_SIGNATORY_DEFAULTS.facultyName);
  const [bulkFacultyTitle, setBulkFacultyTitle] = useState(DEFAULT_SIGNATORY_DEFAULTS.facultyTitle);
  const [bulkSignatoryImageUrl, setBulkSignatoryImageUrl] = useState('');
  const [bulkFacultyImageUrl, setBulkFacultyImageUrl] = useState('');
  const [bulkSendEmail, setBulkSendEmail] = useState(false);
  const [bulkEmailTemplate, setBulkEmailTemplate] = useState<CertificateEmailTemplate>('default');
  const [bulkEmailSignerName, setBulkEmailSignerName] = useState('PRINCE GUPTA');
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkDomain, setBulkDomain] = useState('');
  const [bulkCsv, setBulkCsv] = useState('');
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkEntry[] | null>(null);
  const [bulkParseErrors, setBulkParseErrors] = useState<string[]>([]);

  // Hydrate signatory defaults from localStorage once
  useEffect(() => {
    const defaults = loadSignatoryDefaults();
    setForm(createDefaultForm(defaults));
    setBulkSignatoryId(defaults.signatoryId);
    setBulkSignatory(defaults.signatoryName);
    setBulkSignatoryTitle(defaults.signatoryTitle);
    setBulkFacultySignatoryId(defaults.facultySignatoryId);
    setBulkFacultyName(defaults.facultyName);
    setBulkFacultyTitle(defaults.facultyTitle);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, status]);

  // ─── Queries
  const q = useQuery({
    queryKey: ['admin-certificates', { page, debouncedSearch, status, typeFilter }],
    queryFn: () => api.getCertificates(token!, {
      page,
      limit: 20,
      search: debouncedSearch || undefined,
      type: typeFilter !== 'all-type' ? typeFilter : undefined,
    }) as Promise<{ certificates: CertRow[]; total: number }>,
    enabled: Boolean(token),
  });

  const sigQ = useQuery({
    queryKey: ['signatories'],
    queryFn: () => api.getSignatories(token!) as Promise<SignatoryRow[]>,
    enabled: Boolean(token),
  });

  const all = q.data?.certificates ?? [];
  const filtered = useMemo(() => {
    return all.filter((c) => {
      if (status === 'active' && c.isRevoked) return false;
      if (status === 'revoked' && !c.isRevoked) return false;
      return true;
    });
  }, [all, status]);

  const activeSignatories: ActiveSignatory[] = useMemo(() => {
    return (sigQ.data ?? [])
      .filter((s) => s.isActive)
      .map((s) => ({ id: s.id, name: s.name, title: s.title, signatureUrl: s.signatureUrl }));
  }, [sigQ.data]);

  // ─── Mutations
  const revokeMut = useMutation({
    mutationFn: ({ certId, reason }: { certId: string; reason: string }) => api.revokeCertificate(certId, reason || undefined, token!),
    onSuccess: () => {
      toast.success('Certificate revoked');
      setRevokeTarget(null); setRevokeReason('');
      qc.invalidateQueries({ queryKey: ['admin-certificates'] });
    },
    onError: () => toast.error('Revoke failed'),
  });
  const deleteMut = useMutation({
    mutationFn: (certId: string) => api.deleteCertificate(certId, token!),
    onSuccess: () => {
      toast.success('Certificate deleted');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-certificates'] });
    },
    onError: () => toast.error('Delete failed'),
  });
  const resend = async (certId: string) => {
    if (!token) return;
    setResendingId(certId);
    try {
      await api.resendCertificateEmail(certId, token);
      toast.success('Email resent');
    } catch {
      toast.error('Resend failed');
    } finally {
      setResendingId(null);
    }
  };

  const saveSig = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Not authenticated');
      if (sigForm.id) {
        await api.updateSignatory(sigForm.id, {
          name: sigForm.name.trim(),
          title: sigForm.title.trim(),
          signatureImageUrl: sigForm.signatureUrl.trim() || null,
        }, token);
      } else {
        await api.createSignatory({
          name: sigForm.name.trim(),
          title: sigForm.title.trim(),
          signatureImageUrl: sigForm.signatureUrl.trim() || undefined,
        }, token);
      }
    },
    onSuccess: () => {
      toast.success(sigForm.id ? 'Signatory updated' : 'Signatory added');
      setSigOpen(false);
      setSigForm({ name: '', title: 'Club President', signatureUrl: '' });
      qc.invalidateQueries({ queryKey: ['signatories'] });
    },
    onError: () => toast.error('Save failed'),
  });
  const deleteSig = useMutation({
    mutationFn: (id: string) => api.deleteSignatory(id, token!),
    onSuccess: (data) => {
      // Server soft-deletes (deactivates) signatories that are referenced by existing certificates,
      // and hard-deletes otherwise. Surface the distinction to the admin.
      if (data && data.deactivated) {
        toast.success('Signature deactivated (referenced by existing certificates)');
      } else {
        toast.success('Signature deleted');
      }
      qc.invalidateQueries({ queryKey: ['signatories'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  // ─── Generate single handler
  const handleGenerate = useCallback(async () => {
    if (!token) return;
    if (!form.recipientName.trim()) { setGenerateError('Recipient name is required'); return; }
    if (!form.recipientEmail.trim()) { setGenerateError('Recipient email is required'); return; }
    if (!form.signatoryId && !form.signatoryName.trim()) {
      setGenerateError("Enter the signatory's name in the Signatory section below");
      return;
    }
    if (form.emailTemplate === 'faculty_distribution' && !form.eventName.trim()) {
      setGenerateError('Event name is required for the Faculty Certificate Distribution email');
      return;
    }
    setGenerateError('');
    setGenerating(true);
    try {
      const data = await api.generateCertificate({
        recipientName: form.recipientName,
        recipientEmail: form.recipientEmail,
        eventName: form.eventName || undefined,
        type: form.type,
        position: form.position || undefined,
        domain: form.domain || undefined,
        teamName: form.teamName || undefined,
        description: form.description || undefined,
        signatoryId: form.signatoryId || undefined,
        signatoryName: form.signatoryId ? undefined : form.signatoryName,
        signatoryTitle: form.signatoryId ? undefined : (form.signatoryTitle || undefined),
        signatoryCustomImageUrl: !form.signatoryId && form.signatoryImageUrl ? form.signatoryImageUrl : undefined,
        facultySignatoryId: form.facultySignatoryId || undefined,
        facultyName: form.facultySignatoryId ? undefined : (form.facultyName || undefined),
        facultyTitle: form.facultySignatoryId ? undefined : (form.facultyTitle || undefined),
        facultyCustomImageUrl: !form.facultySignatoryId && form.facultyImageUrl ? form.facultyImageUrl : undefined,
        sendEmail: form.sendEmail,
        emailTemplate: form.emailTemplate,
        emailSignerName: form.emailTemplate === 'faculty_distribution' ? (form.emailSignerName.trim() || undefined) : undefined,
      }, token);
      const nextDefaults: SignatoryDefaults = {
        signatoryId: form.signatoryId,
        signatoryName: form.signatoryName,
        signatoryTitle: form.signatoryTitle,
        facultySignatoryId: form.facultySignatoryId,
        facultyName: form.facultyName,
        facultyTitle: form.facultyTitle,
      };
      saveSignatoryDefaults(nextDefaults);
      toast.success(`Certificate generated · ${data.certId}`);
      setShowGenerate(false);
      setForm(createDefaultForm(nextDefaults));
      setGenerateError('');
      qc.invalidateQueries({ queryKey: ['admin-certificates'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setGenerateError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [form, token, qc]);

  // ─── Bulk CSV parser
  const parseBulkCsv = useCallback((): { recipients: BulkEntry[]; errors: string[] } => {
    const lines = bulkCsv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const recipients: BulkEntry[] = [];
    const parseErrors: string[] = [];
    if (lines.length === 0) return { recipients, errors: parseErrors };

    const firstRow = parseCsvRow(lines[0]);
    const hasHeader = isHeaderRow(firstRow);
    const headerLookup = hasHeader
      ? firstRow.map((h) => BULK_CSV_HEADER_ALIASES[normalizeCsvHeader(h)] ?? null)
      : [];
    const dataLines = hasHeader ? lines.slice(1) : lines;

    for (const line of dataLines) {
      const parts = parseCsvRow(line);
      if (parts.length < 2) { parseErrors.push(`Invalid line: ${line}`); continue; }
      const getValue = (field: keyof BulkEntry, fallbackIndex: number): string | undefined => {
        if (hasHeader) {
          const headerIndex = headerLookup.findIndex((entry) => entry === field);
          return headerIndex >= 0 ? parts[headerIndex]?.trim() || undefined : undefined;
        }
        return parts[fallbackIndex]?.trim() || undefined;
      };
      const name = getValue('name', 0) || '';
      const email = getValue('email', 1) || '';
      const position = getValue('position', 2);
      const domain = getValue('domain', 3);
      const description = getValue('description', 4);
      const teamName = getValue('teamName', 5);
      const type = normalizeCertTypeValue(getValue('type', 6));
      const template = normalizeTemplateValue(getValue('template', 7));
      const userId = getValue('userId', 8);

      if (!name) { parseErrors.push(`Missing name: ${line}`); continue; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        parseErrors.push(`Invalid email: ${email || '(empty)'}`);
        continue;
      }
      recipients.push({ name, email, position, domain, description, teamName, type, template, userId });
    }
    return { recipients, errors: parseErrors };
  }, [bulkCsv]);

  const handleBulkPreview = useCallback(() => {
    const { recipients, errors } = parseBulkCsv();
    setBulkParseErrors(errors);
    if (errors.length > 0) {
      toast.error(`CSV has ${errors.length} error(s). Fix them before generating.`);
      setBulkPreview(null);
      return;
    }
    if (recipients.length === 0) {
      toast.error('No valid recipients found');
      setBulkPreview(null);
      return;
    }
    setBulkPreview(recipients);
    toast.success(`${recipients.length} recipient(s) parsed`);
  }, [parseBulkCsv]);

  const downloadCsvTemplate = useCallback(() => {
    const csv = [
      'Name,Email,Position,Team Name,Domain',
      'Alice Johnson,alice@example.com,1st Place,Team Alpha,Web Development',
      'Bob Smith,bob@example.com,2nd Place,,',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'certificate-recipients-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleBulkGenerate = useCallback(async () => {
    if (!token) return;
    if (!bulkCsv.trim()) { toast.error('Paste the recipient list before generating'); return; }
    if (!bulkSignatoryId && !bulkSignatory.trim()) {
      toast.error("Enter the signatory's name in the Signatory section");
      return;
    }
    if (bulkEmailTemplate === 'faculty_distribution' && !bulkEventName.trim()) {
      toast.error('Event name is required for the Faculty Certificate Distribution email');
      return;
    }
    const { recipients, errors } = parseBulkCsv();
    if (errors.length) { toast.error(`CSV errors: ${errors.join('; ')}`); return; }
    if (recipients.length === 0) { toast.error('No valid recipients found'); return; }

    setBulkGenerating(true);
    try {
      const data = await api.bulkGenerateCertificates({
        recipients,
        eventName: bulkEventName || undefined,
        type: bulkType,
        signatoryId: bulkSignatoryId || undefined,
        signatoryName: bulkSignatoryId ? undefined : bulkSignatory,
        signatoryTitle: bulkSignatoryId ? undefined : (bulkSignatoryTitle || undefined),
        signatoryCustomImageUrl: !bulkSignatoryId && bulkSignatoryImageUrl ? bulkSignatoryImageUrl : undefined,
        facultySignatoryId: bulkFacultySignatoryId || undefined,
        facultyName: bulkFacultySignatoryId ? undefined : (bulkFacultyName || undefined),
        facultyTitle: bulkFacultySignatoryId ? undefined : (bulkFacultyTitle || undefined),
        facultyCustomImageUrl: !bulkFacultySignatoryId && bulkFacultyImageUrl ? bulkFacultyImageUrl : undefined,
        domain: bulkDomain || undefined,
        description: bulkDescription || undefined,
        sendEmail: bulkSendEmail,
        emailTemplate: bulkEmailTemplate,
        emailSignerName: bulkEmailTemplate === 'faculty_distribution' ? (bulkEmailSignerName.trim() || undefined) : undefined,
      }, token);
      const nextDefaults: SignatoryDefaults = {
        signatoryId: bulkSignatoryId,
        signatoryName: bulkSignatory,
        signatoryTitle: bulkSignatoryTitle,
        facultySignatoryId: bulkFacultySignatoryId,
        facultyName: bulkFacultyName,
        facultyTitle: bulkFacultyTitle,
      };
      saveSignatoryDefaults(nextDefaults);
      toast.success(`Generated ${data.generated} certificates`);
      if (data.failed > 0) toast.warning(`${data.failed} failed`);
      if (bulkSendEmail && data.emailsFailed) {
        toast.warning(`${data.emailsFailed} email(s) failed to send — certificates were still generated`);
      }
      setShowBulk(false);
      setBulkCsv('');
      setBulkEventName('');
      setBulkDomain('');
      setBulkDescription('');
      setBulkPreview(null);
      setBulkParseErrors([]);
      setBulkSignatoryImageUrl('');
      setBulkFacultyImageUrl('');
      setBulkEmailTemplate('default');
      setBulkEmailSignerName('PRINCE GUPTA');
      qc.invalidateQueries({ queryKey: ['admin-certificates'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk generation failed');
    } finally {
      setBulkGenerating(false);
    }
  }, [
    token, bulkCsv, bulkSignatoryId, bulkSignatory, bulkSignatoryTitle, bulkSignatoryImageUrl,
    bulkFacultySignatoryId, bulkFacultyName, bulkFacultyTitle, bulkFacultyImageUrl,
    bulkEventName, bulkType, bulkDomain, bulkDescription, bulkSendEmail,
    bulkEmailTemplate, bulkEmailSignerName, parseBulkCsv, qc,
  ]);

  // Primary/faculty signatory picker callbacks for the bulk dialog
  const onPrimarySignatorySelect = useCallback((id: string, name: string, title: string) => {
    setBulkSignatoryId(id);
    setBulkSignatory(name);
    setBulkSignatoryTitle(title);
  }, []);
  const onFacultySignatorySelect = useCallback((id: string, name: string, title: string) => {
    setBulkFacultySignatoryId(id);
    setBulkFacultyName(name);
    setBulkFacultyTitle(title);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Certificates</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">
            Issue, revoke, and verify certs. Each is verifiable at /verify/{`{certId}`}.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setShowBulk(true)}>
            <FileUp size={13} className="mr-1.5" />
            Bulk generate
          </Button>
          <Button size="sm" onClick={() => setShowGenerate(true)}>
            <Plus size={13} className="mr-1.5" />
            Generate certificate
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href="/admin/event-registrations">
              <Users size={13} className="mr-1.5" />
              From event
            </a>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-[280px] flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, cert ID…" className="pl-8 h-8 text-[13px]" />
        </div>
        <SegmentedTabs
          items={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'revoked', label: 'Revoked' },
          ]}
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
        />
        <SegmentedTabs
          items={[
            { value: 'all-type', label: 'All types' },
            { value: 'PARTICIPATION', label: 'Participation' },
            { value: 'WINNER', label: 'Winner' },
            { value: 'SPEAKER', label: 'Speaker' },
          ]}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as TypeFilter)}
        />
      </div>

      <DSCard padded={false}>
        {q.isLoading ? (
          <div className="p-6 animate-pulse space-y-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-[var(--surface-soft)] rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Award size={18} />}
            title="No certificates yet"
            body='Click "Generate certificate" for a single recipient, "Bulk generate" for a CSV batch, or run the per-event wizard from Event Registrations.'
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold">
                <tr>
                  <th className="px-4 py-2.5">Cert ID</th>
                  <th className="px-4 py-2.5">Recipient</th>
                  <th className="px-4 py-2.5">Event</th>
                  <th className="px-4 py-2.5 w-[120px]">Type</th>
                  <th className="px-4 py-2.5 w-[100px]">Issued</th>
                  <th className="px-4 py-2.5 w-[90px]">Status</th>
                  <th className="px-4 py-2.5 w-[140px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={cn('border-t border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]', c.isRevoked && 'opacity-60')}>
                    <td className="px-4 py-3 font-mono tabular-nums text-[var(--ds-text-2)]">{c.certId}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.recipientName} size={24} />
                        <div>
                          <div className="font-medium leading-tight">{c.recipientName}</div>
                          <div className="text-[11px] text-[var(--ds-text-3)] truncate">{c.recipientEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--ds-text-2)] truncate max-w-[200px]">{c.eventName}</td>
                    <td className="px-4 py-3"><Pill tone={TYPE_TONE[c.type] ?? 'neutral'} size="xs">{c.type}</Pill></td>
                    <td className="px-4 py-3 font-mono tabular-nums text-[var(--ds-text-3)]">
                      {new Date(c.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-4 py-3">
                      {c.isRevoked ? <Pill tone="danger" size="xs">Revoked</Pill> : <Pill tone="success" size="xs">Active</Pill>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {c.pdfUrl && (
                          <a href={c.pdfUrl} target="_blank" rel="noreferrer" title="Download" className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center">
                            <Download size={11} />
                          </a>
                        )}
                        <a href={`/verify/${c.certId}`} target="_blank" rel="noreferrer" title="Verify" className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center">
                          <ExternalLink size={11} />
                        </a>
                        {!c.isRevoked && (
                          <button onClick={() => resend(c.certId)} disabled={resendingId === c.certId} title="Resend email" className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center">
                            {resendingId === c.certId ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
                          </button>
                        )}
                        {!c.isRevoked && (
                          <button onClick={() => setRevokeTarget(c)} title="Revoke" className="size-7 rounded-[6px] hover:bg-[var(--warning-bg)] text-[var(--ds-text-3)] hover:text-[var(--warning)] flex items-center justify-center">
                            <Ban size={11} />
                          </button>
                        )}
                        <button onClick={() => setDeleteTarget(c)} title="Delete" className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DSCard>

      <Section
        eyebrow="Signatories"
        title="Saved signatures"
        action={
          <Button size="sm" variant="outline" onClick={() => { setSigForm({ name: '', title: 'Club President', signatureUrl: '' }); setSigOpen(true); }}>
            <Plus size={11} className="mr-1.5" />
            Add
          </Button>
        }
      >
        {sigQ.isLoading ? (
          <div className="h-32 bg-[var(--surface-soft)] rounded animate-pulse" />
        ) : (sigQ.data ?? []).length === 0 ? (
          <DSCard padded><EmptyState title="No signatories yet" body="Add signatures here, then pick one when generating certificates." /></DSCard>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            {(sigQ.data ?? []).map((s) => (
              <DSCard key={s.id} padded>
                <div className="h-[40px] flex items-center justify-center mb-3">
                  {s.signatureUrl ? (
                    <img src={s.signatureUrl} alt={s.name} className="h-full max-w-full object-contain opacity-90" loading="lazy" />
                  ) : (
                    <svg viewBox="0 0 120 40" className="h-full opacity-70 text-[var(--ds-text-2)]">
                      <path d="M5 30 Q 20 5, 35 25 T 65 22 Q 80 30, 95 15 T 115 25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <div className="text-[13px] font-medium">{s.name}</div>
                <div className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5">{s.title}</div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-subtle)]">
                  <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono">
                    {s.isActive ? 'Active' : 'Hidden'}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => { setSigForm({ id: s.id, name: s.name, title: s.title, signatureUrl: s.signatureUrl ?? '' }); setSigOpen(true); }} className="size-6 rounded-[5px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center" title="Edit"><Pencil size={11} /></button>
                    <button onClick={() => setSigDeleteTarget({ id: s.id, name: s.name })} className="size-6 rounded-[5px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center" title="Remove"><Trash2 size={11} /></button>
                  </div>
                </div>
              </DSCard>
            ))}
          </div>
        )}
      </Section>

      {/* Pagination */}
      {q.data && q.data.total > 20 && (
        <div className="flex items-center justify-between text-[12.5px] text-[var(--ds-text-3)]">
          <span>Page {page} · {q.data.total} total</span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Button size="sm" variant="ghost" disabled={page * 20 >= q.data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* ─── Generate single (restored from HEAD) */}
      {token && (
        <GenerateCertificateDialog
          open={showGenerate}
          onOpenChange={setShowGenerate}
          form={form}
          onFormChange={setForm}
          error={generateError}
          generating={generating}
          onGenerate={() => void handleGenerate()}
          token={token}
          activeSignatories={activeSignatories}
        />
      )}

      {/* ─── Bulk generate (restored from HEAD) */}
      {token && (
        <BulkGenerateDialog
          open={showBulk}
          onOpenChange={setShowBulk}
          token={token}
          activeSignatories={activeSignatories}
          eventName={bulkEventName}
          onEventNameChange={setBulkEventName}
          type={bulkType}
          onTypeChange={setBulkType}
          domain={bulkDomain}
          onDomainChange={setBulkDomain}
          description={bulkDescription}
          onDescriptionChange={setBulkDescription}
          signatoryId={bulkSignatoryId}
          signatoryName={bulkSignatory}
          signatoryTitle={bulkSignatoryTitle}
          signatoryImageUrl={bulkSignatoryImageUrl}
          onPrimarySignatorySelect={onPrimarySignatorySelect}
          onPrimarySignatoryImageUrlChange={setBulkSignatoryImageUrl}
          facultySignatoryId={bulkFacultySignatoryId}
          facultyName={bulkFacultyName}
          facultyTitle={bulkFacultyTitle}
          facultyImageUrl={bulkFacultyImageUrl}
          onFacultySignatorySelect={onFacultySignatorySelect}
          onFacultySignatoryImageUrlChange={setBulkFacultyImageUrl}
          csv={bulkCsv}
          onCsvChange={setBulkCsv}
          preview={bulkPreview}
          parseErrors={bulkParseErrors}
          sendEmail={bulkSendEmail}
          onSendEmailChange={setBulkSendEmail}
          emailTemplate={bulkEmailTemplate}
          onEmailTemplateChange={setBulkEmailTemplate}
          emailSignerName={bulkEmailSignerName}
          onEmailSignerNameChange={setBulkEmailSignerName}
          generating={bulkGenerating}
          onPreview={handleBulkPreview}
          onGenerate={() => void handleBulkGenerate()}
          onDownloadTemplate={downloadCsvTemplate}
        />
      )}

      {/* Revoke dialog */}
      <Dialog open={Boolean(revokeTarget)} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-md">
          <DialogHeader><DialogTitle>Revoke certificate</DialogTitle></DialogHeader>
          <div className="text-[13px] text-[var(--ds-text-2)]">
            <span className="font-medium">{revokeTarget?.recipientName}</span> — {revokeTarget?.eventName} ({revokeTarget?.type})
          </div>
          <Input value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="Reason (recommended)" />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button size="sm" onClick={() => revokeTarget && revokeMut.mutate({ certId: revokeTarget.certId, reason: revokeReason })} disabled={revokeMut.isPending} className="bg-[var(--warning)] hover:opacity-90 text-white">
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signatory remove confirm — replaces legacy window.confirm(). */}
      <AlertDialog open={Boolean(sigDeleteTarget)} onOpenChange={(o) => !o && setSigDeleteTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {sigDeleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The signatory is unlinked from any future certificates. If they are referenced by existing certificates, the server will deactivate (soft-delete) instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (sigDeleteTarget) {
                  deleteSig.mutate(sigDeleteTarget.id);
                  setSigDeleteTarget(null);
                }
              }}
              disabled={deleteSig.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {deleteSig.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete certificate {deleteTarget?.certId}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the row permanently — even from the verify page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.certId)} disabled={deleteMut.isPending} className="bg-[var(--danger)] hover:opacity-90 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Signatory inline dialog (compact) */}
      <Dialog open={sigOpen} onOpenChange={setSigOpen}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-md">
          <DialogHeader><DialogTitle>{sigForm.id ? 'Edit signatory' : 'Add signatory'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[12px] font-medium text-[var(--ds-text-2)] mb-1.5 block">Name</label>
              <Input value={sigForm.name} onChange={(e) => setSigForm({ ...sigForm, name: e.target.value })} placeholder="Priya Iyer" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-[var(--ds-text-2)] mb-1.5 block">Title</label>
              <Input value={sigForm.title} onChange={(e) => setSigForm({ ...sigForm, title: e.target.value })} placeholder="President" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-[var(--ds-text-2)] mb-1.5 block">Signature URL <span className="text-[var(--ds-text-3)]">(optional)</span></label>
              <Input value={sigForm.signatureUrl} onChange={(e) => setSigForm({ ...sigForm, signatureUrl: e.target.value })} placeholder="https://…/signature.png" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSigOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => saveSig.mutate()} disabled={saveSig.isPending || !sigForm.name.trim() || !sigForm.title.trim()}>
              {saveSig.isPending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              {sigForm.id ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

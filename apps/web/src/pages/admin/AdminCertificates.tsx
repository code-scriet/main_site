import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api } from '@/lib/api';
import { Award, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { type ActiveSignatory } from '@/components/admin/certificates/SignatoryPicker';
import { type CertType } from '@/components/admin/certificates/CertTypeBadge';
import { RevokeCertificateDialog } from '@/components/admin/certificates/RevokeCertificateDialog';
import { DeleteCertificateDialog } from '@/components/admin/certificates/DeleteCertificateDialog';
import { SignatureFormDialog } from '@/components/admin/certificates/SignatureFormDialog';
import { SavedSignaturesCard } from '@/components/admin/certificates/SavedSignaturesCard';
import { DeleteSignatoryDialog } from '@/components/admin/certificates/DeleteSignatoryDialog';
import { CertificateFiltersBar } from '@/components/admin/certificates/CertificateFiltersBar';
import { CertificateListCard } from '@/components/admin/certificates/CertificateListCard';
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

interface Certificate {
  id: string;
  certId: string;
  recipientName: string;
  recipientEmail: string;
  eventName: string;
  type: CertType;
  position?: string;
  domain?: string;
  template?: string;
  pdfUrl?: string;
  issuedAt: string;
  emailSent: boolean;
  isRevoked: boolean;
  viewCount: number;
}

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
  };
}

interface FullSignatory {
  id: string;
  name: string;
  title: string;
  signatureUrl: string | null;
  isActive: boolean;
  _count: { certificatesAsPrimary: number; certificatesAsFaculty: number };
}

export default function AdminCertificates() {
  const { token } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const navigate = useNavigate();

  // Redirect if certificates feature is disabled
  useEffect(() => {
    if (!settingsLoading && settings?.certificatesEnabled === false) {
      navigate('/admin/settings', { replace: true });
    }
  }, [settings, settingsLoading, navigate]);

  // Signatories — full list for management section + active subset for form dropdowns
  const [activeSignatories, setActiveSignatories] = useState<ActiveSignatory[]>([]);
  const [allSignatories, setAllSignatories] = useState<FullSignatory[]>([]);
  const [loadingAllSigs, setLoadingAllSigs] = useState(false);

  // Signature modal state (create / edit)
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [sigModalEdit, setSigModalEdit] = useState<FullSignatory | null>(null);
  const [sigModalName, setSigModalName] = useState('');
  const [sigModalTitle, setSigModalTitle] = useState('Club President');
  const [sigModalUploadedUrl, setSigModalUploadedUrl] = useState<string | null>(null);
  const [sigModalUploading, setSigModalUploading] = useState(false);
  const [sigModalSaving, setSigModalSaving] = useState(false);
  const [sigModalClearImg, setSigModalClearImg] = useState(false);
  const [signatoryToDelete, setSignatoryToDelete] = useState<FullSignatory | null>(null);

  const fetchAllSignatories = useCallback(async () => {
    if (!token) return;
    setLoadingAllSigs(true);
    try {
      const data = await api.getSignatories(token);
      setAllSignatories(data);
      setActiveSignatories(data.filter(s => s.isActive).map(s => ({ id: s.id, name: s.name, title: s.title, signatureUrl: s.signatureUrl })));
    } catch { /* non-fatal */ } finally {
      setLoadingAllSigs(false);
    }
  }, [token]);

  useEffect(() => { fetchAllSignatories(); }, [fetchAllSignatories]);

  function openSigModal(editTarget?: FullSignatory) {
    setSigModalEdit(editTarget ?? null);
    setSigModalName(editTarget?.name ?? '');
    setSigModalTitle(editTarget?.title ?? 'Club President');
    setSigModalUploadedUrl(null);
    setSigModalUploading(false);
    setSigModalClearImg(false);
    setSigModalOpen(true);
  }

  async function saveSigModal() {
    if (!sigModalName.trim()) return;
    setSigModalSaving(true);
    try {
      if (sigModalEdit) {
        await api.updateSignatory(sigModalEdit.id, {
          name: sigModalName,
          title: sigModalTitle,
          ...(sigModalClearImg ? { signatureImageBase64: null } :
              sigModalUploadedUrl ? { signatureImageUrl: sigModalUploadedUrl } : {}),
        }, token!);
        toast.success('Signature updated');
      } else {
        await api.createSignatory({
          name: sigModalName,
          title: sigModalTitle,
          ...(sigModalUploadedUrl ? { signatureImageUrl: sigModalUploadedUrl } : {}),
        }, token!);
        toast.success('Signature saved');
      }
      setSigModalOpen(false);
      fetchAllSignatories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSigModalSaving(false);
    }
  }

  async function deleteSig(id: string) {
    try {
      const result = await api.deleteSignatory(id, token!);
      if (result && (result as { deactivated?: boolean }).deactivated) {
        toast.success('Signature deactivated (referenced by existing certificates)');
      } else {
        toast.success('Signature deleted');
      }
      setSignatoryToDelete(null);
      fetchAllSignatories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = total > 0 ? Math.ceil(total / 20) : 0;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [form, setForm] = useState<GenerateFormData>(() => createDefaultForm());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Bulk generate modal
  const [showBulk, setShowBulk] = useState(false);
  const [bulkEventName, setBulkEventName] = useState('');
  const [bulkType, setBulkType] = useState<CertType>('PARTICIPATION');
  const [bulkSignatoryId, setBulkSignatoryId] = useState('');
  const [bulkSignatory, setBulkSignatory] = useState('');
  const [bulkSignatoryTitle, setBulkSignatoryTitle] = useState(DEFAULT_SIGNATORY_DEFAULTS.signatoryTitle);
  const [bulkFacultySignatoryId, setBulkFacultySignatoryId] = useState('');
  const [bulkSignatoryImageUrl, setBulkSignatoryImageUrl] = useState('');
  const [bulkFacultyImageUrl, setBulkFacultyImageUrl] = useState('');
  const [bulkSendEmail, setBulkSendEmail] = useState(false);
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkFacultyName, setBulkFacultyName] = useState('');
  const [bulkFacultyTitle, setBulkFacultyTitle] = useState(DEFAULT_SIGNATORY_DEFAULTS.facultyTitle);
  const [bulkDomain, setBulkDomain] = useState('');
  const [bulkCsv, setBulkCsv] = useState('');
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkEntry[] | null>(null);
  const [bulkParseErrors, setBulkParseErrors] = useState<string[]>([]);

  // Revoke modal
  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  
  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Certificate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchCerts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getCertificates(token!, { page, limit: 20, search: debouncedSearch || undefined, type: typeFilter || undefined }) as { certificates: Certificate[]; total: number };
      setCerts(data.certificates);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load certificates');
    } finally {
      setLoading(false);
    }
  }, [token, page, debouncedSearch, typeFilter]);

  useEffect(() => {
    fetchCerts();
  }, [fetchCerts]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter]);

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

  async function handleGenerate() {
    if (!form.recipientName.trim()) { setGenerateError('Recipient name is required'); return; }
    if (!form.recipientEmail.trim()) { setGenerateError('Recipient email is required'); return; }
    if (!form.signatoryId && !form.signatoryName.trim()) {
      setGenerateError('Enter the signatory\'s name in the Signatory section below');
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
      }, token!);
      const nextDefaults: SignatoryDefaults = {
        signatoryId: form.signatoryId,
        signatoryName: form.signatoryName,
        signatoryTitle: form.signatoryTitle,
        facultySignatoryId: form.facultySignatoryId,
        facultyName: form.facultyName,
        facultyTitle: form.facultyTitle,
      };
      saveSignatoryDefaults(nextDefaults);
      toast.success(`Certificate generated! ID: ${data.certId}`);
      setShowGenerate(false);
      setForm(createDefaultForm(nextDefaults));
      setGenerateError('');
      fetchCerts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setGenerateError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  function parseBulkCsv(): { recipients: BulkEntry[]; errors: string[] } {
    const lines = bulkCsv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const recipients: BulkEntry[] = [];
    const parseErrors: string[] = [];

    if (lines.length === 0) {
      return { recipients, errors: parseErrors };
    }

    const firstRow = parseCsvRow(lines[0]);
    const hasHeader = isHeaderRow(firstRow);
    const headerLookup = hasHeader
      ? firstRow.map((header) => BULK_CSV_HEADER_ALIASES[normalizeCsvHeader(header)] ?? null)
      : [];

    const dataLines = hasHeader ? lines.slice(1) : lines;

    for (const line of dataLines) {
      const parts = parseCsvRow(line);
      if (parts.length < 2) {
        parseErrors.push(`Invalid line: ${line}`);
        continue;
      }

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

      if (!name) {
        parseErrors.push(`Missing name: ${line}`);
        continue;
      }
      // Proper email validation
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        parseErrors.push(`Invalid email: ${email || '(empty)'}`);
        continue;
      }

      recipients.push({
        name,
        email,
        position,
        domain,
        description,
        teamName,
        type,
        template,
        userId,
      });
    }

    return { recipients, errors: parseErrors };
  }

  function handleBulkPreview() {
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
    toast.success(`${recipients.length} recipient(s) parsed successfully`);
  }

  function downloadCsvTemplate() {
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
  }

  async function handleBulkGenerate() {
    if (!bulkCsv.trim()) { toast.error('Paste the recipient list before generating'); return; }
    if (!bulkSignatoryId && !bulkSignatory.trim()) {
      toast.error('Enter the signatory\'s name in the Signatory section');
      return;
    }

    const { recipients, errors: parseErrors } = parseBulkCsv();

    if (parseErrors.length) {
      toast.error(`CSV errors: ${parseErrors.join('; ')}`);
      return;
    }

    if (recipients.length === 0) {
      toast.error('No valid recipients found');
      return;
    }

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
      }, token!);
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
      if (data.failed > 0) {
        toast.warning(`${data.failed} certificates failed to generate`);
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
      setBulkSignatoryId(nextDefaults.signatoryId);
      setBulkSignatory(nextDefaults.signatoryName);
      setBulkSignatoryTitle(nextDefaults.signatoryTitle);
      setBulkFacultySignatoryId(nextDefaults.facultySignatoryId);
      setBulkFacultyName(nextDefaults.facultyName);
      setBulkFacultyTitle(nextDefaults.facultyTitle);
      fetchCerts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk generation failed');
    } finally {
      setBulkGenerating(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api.revokeCertificate(revokeTarget.certId, revokeReason || undefined, token!);
      toast.success('Certificate revoked');
      setRevokeTarget(null);
      setRevokeReason('');
      fetchCerts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setRevoking(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCertificate(deleteTarget.certId, token!);
      toast.success('Certificate deleted successfully');
      setDeleteTarget(null);
      fetchCerts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function handleResend(certId: string) {
    setResendingId(certId);
    try {
      const data = await api.resendCertificateEmail(certId, token!);
      toast.success(data.sent ? 'Email sent' : 'Email service not configured');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resend failed');
    } finally {
      setResendingId(null);
    }
  }

  function copyVerifyLink(certId: string) {
    const url = `${window.location.origin}/verify/${certId}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Verify link copied!')).catch(() => toast.error('Copy failed'));
  }

  async function downloadPdf(certId: string) {
    if (!token) {
      toast.error('You need to be signed in to download certificates');
      return;
    }

    setDownloadingId(certId);
    try {
      const { url } = await api.downloadCertificate(certId, token);
      
      // Open the certificate PDF in a new tab natively
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-500" />
            Certificates
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} certificate{total !== 1 ? 's' : ''} total</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowBulk(true)} variant="outline" className="gap-2">
            <Users className="w-4 h-4" />
            Bulk Generate
          </Button>
          <Button onClick={() => setShowGenerate(true)} className="gap-2 bg-amber-500 hover:bg-amber-600 text-white">
            <Plus className="w-4 h-4" />
            Generate
          </Button>
        </div>
      </motion.div>

      <SavedSignaturesCard
        signatories={allSignatories}
        loading={loadingAllSigs}
        onAdd={() => openSigModal()}
        onEdit={(sig) => openSigModal(sig as FullSignatory)}
        onDelete={(sig) => setSignatoryToDelete(sig as FullSignatory)}
      />

      <DeleteSignatoryDialog
        target={signatoryToDelete}
        onCancel={() => setSignatoryToDelete(null)}
        onConfirm={(id) => { void deleteSig(id); }}
      />

      <CertificateFiltersBar
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={(value) => setTypeFilter(value)}
        onRefresh={fetchCerts}
      />

      <CertificateListCard
        certificates={certs}
        loading={loading}
        error={error}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        downloadingId={downloadingId}
        resendingId={resendingId}
        onDownload={(certId) => { void downloadPdf(certId); }}
        onCopyVerifyLink={copyVerifyLink}
        onResend={handleResend}
        onRevoke={(cert) => setRevokeTarget(cert as Certificate)}
        onDelete={(cert) => setDeleteTarget(cert as Certificate)}
      />

      <GenerateCertificateDialog
        open={showGenerate}
        onOpenChange={(open) => { setShowGenerate(open); if (!open) setGenerateError(''); }}
        form={form}
        onFormChange={setForm}
        error={generateError}
        generating={generating}
        onGenerate={handleGenerate}
        token={token!}
        activeSignatories={activeSignatories}
      />

      <BulkGenerateDialog
        open={showBulk}
        onOpenChange={setShowBulk}
        token={token!}
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
        onPrimarySignatorySelect={(id, name, title) => {
          setBulkSignatoryId(id);
          setBulkSignatory(name);
          setBulkSignatoryTitle(title || bulkSignatoryTitle);
          setBulkSignatoryImageUrl('');
        }}
        onPrimarySignatoryImageUrlChange={setBulkSignatoryImageUrl}
        facultySignatoryId={bulkFacultySignatoryId}
        facultyName={bulkFacultyName}
        facultyTitle={bulkFacultyTitle}
        facultyImageUrl={bulkFacultyImageUrl}
        onFacultySignatorySelect={(id, name, title) => {
          setBulkFacultySignatoryId(id);
          setBulkFacultyName(name);
          setBulkFacultyTitle(title || bulkFacultyTitle);
          setBulkFacultyImageUrl('');
        }}
        onFacultySignatoryImageUrlChange={setBulkFacultyImageUrl}
        csv={bulkCsv}
        onCsvChange={(value) => {
          setBulkCsv(value);
          setBulkPreview(null);
          setBulkParseErrors([]);
        }}
        preview={bulkPreview}
        parseErrors={bulkParseErrors}
        sendEmail={bulkSendEmail}
        onSendEmailChange={setBulkSendEmail}
        generating={bulkGenerating}
        onPreview={handleBulkPreview}
        onGenerate={handleBulkGenerate}
        onDownloadTemplate={downloadCsvTemplate}
      />

      <RevokeCertificateDialog
        target={revokeTarget}
        reason={revokeReason}
        onReasonChange={setRevokeReason}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        revoking={revoking}
      />

      <DeleteCertificateDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />

      <SignatureFormDialog
        open={sigModalOpen}
        onOpenChange={setSigModalOpen}
        editTarget={sigModalEdit}
        name={sigModalName}
        onNameChange={setSigModalName}
        title={sigModalTitle}
        onTitleChange={setSigModalTitle}
        uploadedUrl={sigModalUploadedUrl}
        onUploadedUrlChange={setSigModalUploadedUrl}
        uploading={sigModalUploading}
        onUploadingChange={setSigModalUploading}
        saving={sigModalSaving}
        clearImg={sigModalClearImg}
        onClearImgChange={setSigModalClearImg}
        onSave={saveSigModal}
        token={token}
      />

    </div>
  );
}

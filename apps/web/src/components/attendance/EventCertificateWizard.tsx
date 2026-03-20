import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, type CertificateRecipient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Award,
  CheckCircle,
  Users,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Download,
  Mail,
  Trash2,
  XCircle,
  Search,
  Eye,
  UserCheck,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventCertificateWizardProps {
  eventId: string;
  eventName: string;
  token: string;
}

interface Signatory {
  id: string;
  name: string;
  title: string;
  signatureUrl?: string | null;
  isActive: boolean;
}

interface GeneratedCert {
  certId: string;
  recipientName: string;
  recipientEmail: string;
  pdfUrl: string | null;
  emailSent: boolean;
  isRevoked?: boolean;
}

type CertType = 'PARTICIPATION' | 'COMPLETION' | 'WINNER' | 'SPEAKER';
type WizardStep = 1 | 2 | 3 | 'manage';
type RecipientFilter = 'all' | 'attended' | 'no_cert';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const CERT_TYPE_OPTIONS: { value: CertType; label: string }[] = [
  { value: 'PARTICIPATION', label: 'Participation' },
  { value: 'COMPLETION', label: 'Completion' },
  { value: 'WINNER', label: 'Winner' },
  { value: 'SPEAKER', label: 'Speaker' },
];

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EventCertificateWizard({
  eventId,
  eventName,
  token,
}: EventCertificateWizardProps) {
  // ---- wizard navigation ----
  const [step, setStep] = useState<WizardStep>(1);

  // ---- step 1 state ----
  const [recipients, setRecipients] = useState<CertificateRecipient[]>([]);
  const [stats, setStats] = useState({ totalRegistered: 0, totalAttended: 0, alreadyCertified: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('no_cert');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // ---- step 2 state ----
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [loadingSignatories, setLoadingSignatories] = useState(false);
  const [primarySignatoryId, setPrimarySignatoryId] = useState<string | null>(null);
  const [customPrimary, setCustomPrimary] = useState({ name: '', title: '', imageUrl: '' });
  const [useCustomPrimary, setUseCustomPrimary] = useState(false);
  const [facultySignatoryId, setFacultySignatoryId] = useState<string | null>(null);
  const [customFaculty, setCustomFaculty] = useState({ name: '', title: '', imageUrl: '' });
  const [useCustomFaculty, setUseCustomFaculty] = useState(false);
  const [facultyExistingMode, setFacultyExistingMode] = useState(false);
  const [certType, setCertType] = useState<CertType>('PARTICIPATION');

  // ---- step 3 / generate state ----
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ---- management mode state ----
  const [generatedCerts, setGeneratedCerts] = useState<GeneratedCert[]>([]);
  const [managementSearch, setManagementSearch] = useState('');
  const [managementSelected, setManagementSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: 'revoke' | 'delete';
    certId: string;
    recipientName: string;
  } | null>(null);
  const [bulkResending, setBulkResending] = useState(false);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchRecipients = useCallback(async () => {
    setLoadingRecipients(true);
    try {
      const data = await api.getAttendanceCertRecipients(eventId, token);
      setRecipients(data.recipients);
      setStats(data.stats);
      // Default selection: attended AND no certificate yet
      const defaultSelected = new Set(
        data.recipients
          .filter((r: CertificateRecipient) => r.attended && !r.hasCertificate)
          .map((r: CertificateRecipient) => r.registrationId),
      );
      setSelectedIds(defaultSelected);
    } catch {
      // silently handle – empty list will show
    } finally {
      setLoadingRecipients(false);
    }
  }, [eventId, token]);

  const fetchSignatories = useCallback(async () => {
    setLoadingSignatories(true);
    try {
      const res = await fetch(`${API_URL}/signatories`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const json = await res.json();
      setSignatories((json.data as Signatory[]) || []);
    } catch {
      setSignatories([]);
    } finally {
      setLoadingSignatories(false);
    }
  }, [token]);

  useEffect(() => {
    if (step === 1) fetchRecipients();
  }, [step, fetchRecipients]);

  useEffect(() => {
    if (step === 2 && signatories.length === 0) fetchSignatories();
  }, [step, signatories.length, fetchSignatories]);

  // -----------------------------------------------------------------------
  // Filtered / derived data
  // -----------------------------------------------------------------------

  const filteredRecipients = useMemo(() => {
    let list = recipients;
    if (recipientFilter === 'attended') list = list.filter((r) => r.attended);
    if (recipientFilter === 'no_cert') list = list.filter((r) => !r.hasCertificate);
    if (recipientSearch.trim()) {
      const q = recipientSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) || r.userEmail.toLowerCase().includes(q),
      );
    }
    return list;
  }, [recipients, recipientFilter, recipientSearch]);

  const filteredCerts = useMemo(() => {
    if (!managementSearch.trim()) return generatedCerts;
    const q = managementSearch.toLowerCase();
    return generatedCerts.filter(
      (c) =>
        c.recipientName.toLowerCase().includes(q) ||
        c.recipientEmail.toLowerCase().includes(q) ||
        c.certId.toLowerCase().includes(q),
    );
  }, [generatedCerts, managementSearch]);

  const selectedPrimarySignatory = signatories.find((s) => s.id === primarySignatoryId);
  const selectedFacultySignatory = signatories.find((s) => s.id === facultySignatoryId);

  const selectedRecipientEmails = useMemo(
    () =>
      recipients.filter((r) => selectedIds.has(r.registrationId)).map((r) => r.userEmail),
    [recipients, selectedIds],
  );

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function toggleRecipient(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const visibleIds = filteredRecipients.map((r) => r.registrationId);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visibleIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  // -----------------------------------------------------------------------
  // Generate certificates
  // -----------------------------------------------------------------------

  async function handleGenerate() {
    const confirmed = window.confirm(
      `Generate ${selectedIds.size} certificate${selectedIds.size !== 1 ? 's' : ''}? This will create PDF files and cannot be easily undone.`
    );
    if (!confirmed) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const selectedRecipients = recipients
        .filter((r) => selectedIds.has(r.registrationId))
        .map((r) => ({ name: r.userName, email: r.userEmail, userId: r.userId }));

      const body: Record<string, unknown> = {
        eventId,
        eventName,
        recipients: selectedRecipients,
        type: certType,
        sendEmail: true,
      };

      if (useCustomPrimary) {
        if (customPrimary.name) body.signatoryName = customPrimary.name;
        if (customPrimary.title) body.signatoryTitle = customPrimary.title;
        if (customPrimary.imageUrl) body.signatoryCustomImageUrl = customPrimary.imageUrl;
      } else if (primarySignatoryId) {
        body.signatoryId = primarySignatoryId;
      }

      if (useCustomFaculty) {
        if (customFaculty.name) body.facultyName = customFaculty.name;
        if (customFaculty.title) body.facultyTitle = customFaculty.title;
        if (customFaculty.imageUrl) body.facultyCustomImageUrl = customFaculty.imageUrl;
      } else if (facultySignatoryId) {
        body.facultySignatoryId = facultySignatoryId;
      }

      const result = await api.bulkGenerateCertificates(body, token);
      const certs: GeneratedCert[] = ((result as any).results ?? []).map((r: any) => ({
        certId: r.certId,
        recipientName: r.name,
        recipientEmail: r.email,
        pdfUrl: r.pdfUrl ?? null,
        emailSent: true,
      }));
      setGeneratedCerts(certs);
      setStep('manage');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Certificate generation failed.';
      setGenerateError(message);
    } finally {
      setGenerating(false);
    }
  }

  // -----------------------------------------------------------------------
  // Management actions
  // -----------------------------------------------------------------------

  async function handleDownload(certId: string) {
    setActionLoading((p) => ({ ...p, [`dl-${certId}`]: true }));
    try {
      const result = await api.downloadCertificate(certId, token);
      if (result?.url) window.open(result.url, '_blank');
    } catch {
      alert('Failed to download certificate');
    } finally {
      setActionLoading((p) => ({ ...p, [`dl-${certId}`]: false }));
    }
  }

  async function handleResendEmail(certId: string) {
    setActionLoading((p) => ({ ...p, [`mail-${certId}`]: true }));
    try {
      await api.resendCertificateEmail(certId, token);
      setGeneratedCerts((prev) =>
        prev.map((c) => (c.certId === certId ? { ...c, emailSent: true } : c)),
      );
    } catch {
      alert('Failed to resend email');
    } finally {
      setActionLoading((p) => ({ ...p, [`mail-${certId}`]: false }));
    }
  }

  async function handleConfirmAction() {
    if (!confirmDialog) return;
    const { action, certId } = confirmDialog;
    setActionLoading((p) => ({ ...p, [`confirm-${certId}`]: true }));
    try {
      if (action === 'revoke') {
        await api.revokeCertificate(certId, undefined, token);
        setGeneratedCerts((prev) =>
          prev.map((c) => (c.certId === certId ? { ...c, isRevoked: true } : c)),
        );
      } else {
        await api.deleteCertificate(certId, token);
        setGeneratedCerts((prev) => prev.filter((c) => c.certId !== certId));
      }
    } catch {
      alert(`Failed to ${action} certificate`);
    } finally {
      setActionLoading((p) => ({ ...p, [`confirm-${certId}`]: false }));
      setConfirmDialog(null);
    }
  }

  async function handleBulkResend() {
    setBulkResending(true);
    const ids = Array.from(managementSelected);
    for (const certId of ids) {
      try {
        await api.resendCertificateEmail(certId, token);
        setGeneratedCerts((prev) =>
          prev.map((c) => (c.certId === certId ? { ...c, emailSent: true } : c)),
        );
      } catch {
        // continue with remaining
      }
    }
    setBulkResending(false);
    setManagementSelected(new Set());
  }

  function toggleManagementCert(certId: string) {
    setManagementSelected((prev) => {
      const next = new Set(prev);
      if (next.has(certId)) next.delete(certId);
      else next.add(certId);
      return next;
    });
  }

  // -----------------------------------------------------------------------
  // Step indicator
  // -----------------------------------------------------------------------

  function StepIndicator() {
    const steps = [
      { num: 1, label: 'Select Recipients' },
      { num: 2, label: 'Configure Signatory' },
      { num: 3, label: 'Review & Generate' },
    ];
    const currentNum = step === 'manage' ? 4 : step;
    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                currentNum > s.num
                  ? 'bg-green-600 text-white'
                  : currentNum === s.num
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              {currentNum > s.num ? <CheckCircle className="w-4 h-4" /> : s.num}
            </div>
            <span
              className={`text-sm hidden sm:inline ${
                currentNum === s.num
                  ? 'font-semibold text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`w-8 h-px ${
                  currentNum > s.num
                    ? 'bg-green-400'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Step 1: Select Recipients
  // -----------------------------------------------------------------------

  function renderStep1() {
    if (loadingRecipients) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <p>Loading recipients...</p>
        </div>
      );
    }

    const filterOptions: { value: RecipientFilter; label: string }[] = [
      { value: 'all', label: `All (${recipients.length})` },
      {
        value: 'attended',
        label: `Attended (${recipients.filter((r) => r.attended).length})`,
      },
      {
        value: 'no_cert',
        label: `No Cert (${recipients.filter((r) => !r.hasCertificate).length})`,
      },
    ];

    return (
      <motion.div
        key="step1"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
      >
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">{/* responsive: stack on mobile */}
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-5 h-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{stats.totalRegistered}</p>
                <p className="text-xs text-gray-500">Registered</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="p-4 flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{stats.totalAttended}</p>
                <p className="text-xs text-gray-500">Attended</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Award className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{stats.alreadyCertified}</p>
                <p className="text-xs text-gray-500">Already Certified</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex gap-1">
            {filterOptions.map((f) => (
              <Button
                key={f.value}
                variant={recipientFilter === f.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRecipientFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name or email..."
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden dark:border-gray-700">
          <div className="max-h-80 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                <tr>
                  <th className="p-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredRecipients.length > 0 &&
                        filteredRecipients.every((r) =>
                          selectedIds.has(r.registrationId),
                        )
                      }
                      onChange={toggleAllVisible}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="p-3 text-left">Recipient</th>
                  <th className="p-3 text-left hidden sm:table-cell">Status</th>
                  <th className="p-3 text-left hidden md:table-cell">Certificate</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredRecipients.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-400">
                      No recipients match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredRecipients.map((r) => (
                    <tr
                      key={r.registrationId}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                        selectedIds.has(r.registrationId)
                          ? 'bg-blue-50/50 dark:bg-blue-900/10'
                          : ''
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.registrationId)}
                          onChange={() => toggleRecipient(r.registrationId)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          {r.userAvatar ? (
                            <img
                              src={r.userAvatar}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium shrink-0">
                              {r.userName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{r.userName}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {r.userEmail}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        {r.attended ? (
                          <Badge
                            variant="outline"
                            className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Attended
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-gray-300 text-gray-500"
                          >
                            Not Attended
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        {r.hasCertificate ? (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            <Award className="w-3 h-3 mr-1" />
                            {r.certificateId || 'Issued'}
                          </Badge>
                        ) : (
                          <span className="text-gray-400 text-xs">None</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-5">
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-900 dark:text-white">
              {selectedIds.size}
            </span>{' '}
            recipient{selectedIds.size !== 1 ? 's' : ''} selected
          </p>
          <Button onClick={() => setStep(2)} disabled={selectedIds.size === 0}>
            Next
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      </motion.div>
    );
  }

  // -----------------------------------------------------------------------
  // Step 2: Configure Signatory
  // -----------------------------------------------------------------------

  function renderStep2() {
    if (loadingSignatories) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <p>Loading signatories...</p>
        </div>
      );
    }

    const activeSignatories = signatories.filter((s) => s.isActive);

    return (
      <motion.div
        key="step2"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        {/* Certificate Type */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Certificate Type</Label>
          <div className="flex flex-wrap gap-2">
            {CERT_TYPE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={certType === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCertType(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Primary Signatory */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Primary Signatory</Label>
          <div className="flex gap-2 mb-3">
            <Button
              variant={!useCustomPrimary ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseCustomPrimary(false)}
            >
              Select Existing
            </Button>
            <Button
              variant={useCustomPrimary ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setUseCustomPrimary(true);
                setPrimarySignatoryId(null);
              }}
            >
              Custom
            </Button>
          </div>

          {!useCustomPrimary ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeSignatories.length === 0 ? (
                <p className="text-sm text-gray-400 col-span-2">
                  No active signatories found. Use a custom signatory instead.
                </p>
              ) : (
                activeSignatories.map((s) => (
                  <Card
                    key={s.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      primarySignatoryId === s.id
                        ? 'ring-2 ring-blue-500 border-blue-300 dark:border-blue-700'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                    onClick={() => setPrimarySignatoryId(s.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      {s.signatureUrl ? (
                        <img
                          src={s.signatureUrl}
                          alt={`${s.name} signature`}
                          className="w-16 h-10 object-contain bg-white rounded border dark:border-gray-600"
                        />
                      ) : (
                        <div className="w-16 h-10 bg-gray-100 dark:bg-gray-800 rounded border dark:border-gray-600 flex items-center justify-center">
                          <span className="text-xs text-gray-400">No image</span>{/* responsive: min 12px */}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.name}</p>
                        <p className="text-xs text-gray-500 truncate">{s.title}</p>
                      </div>
                      {primarySignatoryId === s.id && (
                        <CheckCircle className="w-5 h-5 text-blue-500 ml-auto shrink-0" />
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3 p-4 border rounded-lg dark:border-gray-700">
              <div>
                <Label htmlFor="custom-primary-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="custom-primary-name"
                  value={customPrimary.name}
                  onChange={(e) =>
                    setCustomPrimary((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g., Dr. Sharma"
                />
              </div>
              <div>
                <Label htmlFor="custom-primary-title" className="text-xs">
                  Title
                </Label>
                <Input
                  id="custom-primary-title"
                  value={customPrimary.title}
                  onChange={(e) =>
                    setCustomPrimary((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="e.g., Club President"
                />
              </div>
              <div>
                <Label htmlFor="custom-primary-img" className="text-xs">
                  Signature Image URL (optional)
                </Label>
                <Input
                  id="custom-primary-img"
                  value={customPrimary.imageUrl}
                  onChange={(e) =>
                    setCustomPrimary((p) => ({ ...p, imageUrl: e.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Faculty Signatory (optional) */}
        <div>
          <Label className="text-sm font-medium mb-2 block">
            Faculty Signatory{' '}
            <span className="text-gray-400 font-normal">(optional)</span>
          </Label>
          <div className="flex gap-2 mb-3">
            <Button
              variant={!useCustomFaculty && !facultyExistingMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setUseCustomFaculty(false);
                setFacultyExistingMode(false);
                setFacultySignatoryId(null);
                setCustomFaculty({ name: '', title: '', imageUrl: '' });
              }}
            >
              None
            </Button>
            <Button
              variant={
                !useCustomFaculty && facultyExistingMode ? 'default' : 'outline'
              }
              size="sm"
              onClick={() => {
                setUseCustomFaculty(false);
                setFacultyExistingMode(true);
              }}
              disabled={activeSignatories.length === 0}
            >
              Select Existing
            </Button>
            <Button
              variant={useCustomFaculty ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setUseCustomFaculty(true);
                setFacultyExistingMode(false);
                setFacultySignatoryId(null);
              }}
            >
              Custom
            </Button>
          </div>

          {!useCustomFaculty && !facultyExistingMode ? null : !useCustomFaculty ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeSignatories.map((s) => (
                <Card
                  key={s.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    facultySignatoryId === s.id
                      ? 'ring-2 ring-blue-500 border-blue-300 dark:border-blue-700'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                  onClick={() => setFacultySignatoryId(s.id)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    {s.signatureUrl ? (
                      <img
                        src={s.signatureUrl}
                        alt={`${s.name} signature`}
                        className="w-16 h-10 object-contain bg-white rounded border dark:border-gray-600"
                      />
                    ) : (
                      <div className="w-16 h-10 bg-gray-100 dark:bg-gray-800 rounded border dark:border-gray-600 flex items-center justify-center">
                        <span className="text-xs text-gray-400">No image</span>{/* responsive: min 12px */}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.name}</p>
                      <p className="text-xs text-gray-500 truncate">{s.title}</p>
                    </div>
                    {facultySignatoryId === s.id && (
                      <CheckCircle className="w-5 h-5 text-blue-500 ml-auto shrink-0" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3 p-4 border rounded-lg dark:border-gray-700">
              <div>
                <Label htmlFor="custom-faculty-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="custom-faculty-name"
                  value={customFaculty.name}
                  onChange={(e) =>
                    setCustomFaculty((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g., Prof. Gupta"
                />
              </div>
              <div>
                <Label htmlFor="custom-faculty-title" className="text-xs">
                  Title
                </Label>
                <Input
                  id="custom-faculty-title"
                  value={customFaculty.title}
                  onChange={(e) =>
                    setCustomFaculty((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="e.g., Faculty Advisor"
                />
              </div>
              <div>
                <Label htmlFor="custom-faculty-img" className="text-xs">
                  Signature Image URL (optional)
                </Label>
                <Input
                  id="custom-faculty-img"
                  value={customFaculty.imageUrl}
                  onChange={(e) =>
                    setCustomFaculty((p) => ({ ...p, imageUrl: e.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={() => setStep(1)}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Button>
          <Button
            onClick={() => setStep(3)}
            disabled={
              !useCustomPrimary && !primarySignatoryId
                ? true
                : useCustomPrimary && !customPrimary.name
                  ? true
                  : false
            }
          >
            Next
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      </motion.div>
    );
  }

  // -----------------------------------------------------------------------
  // Step 3: Review & Generate
  // -----------------------------------------------------------------------

  function renderStep3() {
    const primaryLabel = useCustomPrimary
      ? customPrimary.name
      : selectedPrimarySignatory?.name || 'Not selected';
    const primaryTitleLabel = useCustomPrimary
      ? customPrimary.title
      : selectedPrimarySignatory?.title || '';
    const facultyLabel = useCustomFaculty
      ? customFaculty.name || 'Not set'
      : selectedFacultySignatory?.name || 'None';

    return (
      <motion.div
        key="step3"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="space-y-5"
      >
        {/* Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Generation Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <span className="text-gray-500">Event</span>
              <span className="font-medium">{eventName}</span>

              <span className="text-gray-500">Recipients</span>
              <span className="font-medium">{selectedRecipientEmails.length}</span>

              <span className="text-gray-500">Certificate Type</span>
              <Badge variant="outline" className="w-fit">
                {certType}
              </Badge>

              <span className="text-gray-500">Primary Signatory</span>
              <span className="font-medium">
                {primaryLabel}
                {primaryTitleLabel ? (
                  <span className="text-gray-400 font-normal">
                    {' '}
                    - {primaryTitleLabel}
                  </span>
                ) : null}
              </span>

              <span className="text-gray-500">Faculty Signatory</span>
              <span className="font-medium">{facultyLabel}</span>
            </div>
          </CardContent>
        </Card>

        {/* Info panel */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 p-4 text-sm">
          <div className="flex gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-blue-800 dark:text-blue-300">
              <p className="font-medium">What will happen:</p>
              <ul className="list-disc list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
                <li>
                  {selectedRecipientEmails.length} PDF certificate
                  {selectedRecipientEmails.length !== 1 ? 's' : ''} will be generated
                </li>
                <li>Each certificate will be uploaded to cloud storage</li>
                <li>
                  Email notifications will be sent to all recipients with their
                  certificate attached
                </li>
                <li>
                  Recipients who already have a certificate for this event will be
                  skipped
                </li>
              </ul>
            </div>
          </div>
        </div>

        {selectedRecipientEmails.length > 20 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4 text-sm">
            <div className="flex gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-800 dark:text-amber-300">
                Generating {selectedRecipientEmails.length} certificates may take a few
                minutes. Please do not close this page during generation.
              </p>
            </div>
          </div>
        )}

        {generateError && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-4 text-sm">
            <div className="flex gap-2">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-800 dark:text-red-300">{generateError}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={() => setStep(2)} disabled={generating}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Award className="w-4 h-4 mr-1.5" />
                Generate Certificates
              </>
            )}
          </Button>
        </div>
      </motion.div>
    );
  }

  // -----------------------------------------------------------------------
  // Management Mode
  // -----------------------------------------------------------------------

  function renderManagement() {
    return (
      <motion.div
        key="manage"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              Generated Certificates ({generatedCerts.length})
            </h3>
            <p className="text-sm text-gray-500">
              Manage the certificates generated for {eventName}
            </p>
          </div>
          <div className="flex gap-2">
            {managementSelected.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkResend}
                disabled={bulkResending}
              >
                {bulkResending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                )}
                Resend Selected ({managementSelected.size})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStep(1);
                setGeneratedCerts([]);
                setManagementSelected(new Set());
              }}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Generate More
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, or cert ID..."
            value={managementSearch}
            onChange={(e) => setManagementSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden dark:border-gray-700">
          <div className="max-h-96 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                <tr>
                  <th className="p-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredCerts.length > 0 &&
                        filteredCerts.every((c) => managementSelected.has(c.certId))
                      }
                      onChange={() => {
                        const ids = filteredCerts.map((c) => c.certId);
                        const allSelected = ids.every((id) =>
                          managementSelected.has(id),
                        );
                        setManagementSelected((prev) => {
                          const next = new Set(prev);
                          ids.forEach((id) =>
                            allSelected ? next.delete(id) : next.add(id),
                          );
                          return next;
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="p-3 text-left">Recipient</th>
                  <th className="p-3 text-left hidden sm:table-cell">Cert ID</th>
                  <th className="p-3 text-left hidden md:table-cell">Email Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredCerts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400">
                      No certificates found.
                    </td>
                  </tr>
                ) : (
                  filteredCerts.map((cert) => (
                    <tr
                      key={cert.certId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={managementSelected.has(cert.certId)}
                          onChange={() => toggleManagementCert(cert.certId)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="p-3">
                        <p className="font-medium truncate">{cert.recipientName}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {cert.recipientEmail}
                        </p>
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                          {cert.certId}
                        </code>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        {cert.emailSent ? (
                          <Badge
                            variant="outline"
                            className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                          >
                            <Mail className="w-3 h-3 mr-1" />
                            Sent
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-gray-300 text-gray-500"
                          >
                            Not Sent
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          {cert.isRevoked && (
                            <Badge
                              variant="outline"
                              className="border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 mr-1"
                            >
                              Revoked
                            </Badge>
                          )}
                          {cert.pdfUrl && !cert.isRevoked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleDownload(cert.certId)}
                              disabled={actionLoading[`dl-${cert.certId}`]}
                              title="Download PDF"
                            >
                              {actionLoading[`dl-${cert.certId}`] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleResendEmail(cert.certId)}
                            disabled={actionLoading[`mail-${cert.certId}`]}
                            title="Resend Email"
                          >
                            {actionLoading[`mail-${cert.certId}`] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700"
                            onClick={() =>
                              setConfirmDialog({
                                open: true,
                                action: 'revoke',
                                certId: cert.certId,
                                recipientName: cert.recipientName,
                              })
                            }
                            title="Revoke"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() =>
                              setConfirmDialog({
                                open: true,
                                action: 'delete',
                                certId: cert.certId,
                                recipientName: cert.recipientName,
                              })
                            }
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    );
  }

  // -----------------------------------------------------------------------
  // Confirmation Dialog
  // -----------------------------------------------------------------------

  function renderConfirmDialog() {
    if (!confirmDialog) return null;
    const isRevoke = confirmDialog.action === 'revoke';
    const loading = actionLoading[`confirm-${confirmDialog.certId}`];

    return (
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open && !loading) setConfirmDialog(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isRevoke ? (
                <XCircle className="w-5 h-5 text-amber-500" />
              ) : (
                <Trash2 className="w-5 h-5 text-red-500" />
              )}
              {isRevoke ? 'Revoke Certificate' : 'Delete Certificate'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Are you sure you want to {isRevoke ? 'revoke' : 'permanently delete'} the
            certificate for{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {confirmDialog.recipientName}
            </span>
            ?
            {!isRevoke && ' This action cannot be undone.'}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDialog(null)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant={isRevoke ? 'default' : 'destructive'}
              size="sm"
              onClick={handleConfirmAction}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : null}
              {isRevoke ? 'Revoke' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          Certificate Wizard
        </CardTitle>
        <p className="text-sm text-gray-500">{eventName}</p>
      </CardHeader>
      <CardContent>
        {step !== 'manage' && <StepIndicator />}
        <AnimatePresence mode="wait">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 'manage' && renderManagement()}
        </AnimatePresence>
        {renderConfirmDialog()}
      </CardContent>
    </Card>
  );
}

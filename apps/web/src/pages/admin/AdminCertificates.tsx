import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api } from '@/lib/api';
import {
  Award,
  Loader2,
  AlertCircle,
  Search,
  Plus,
  Mail,
  Download,
  XCircle,
  RefreshCw,
  Copy,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Users,
  FileDown,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const CERT_TYPES = ['PARTICIPATION', 'COMPLETION', 'WINNER', 'SPEAKER'] as const;
const TEMPLATES = ['gold', 'dark', 'white', 'emerald'] as const;

type CertType = (typeof CERT_TYPES)[number];
type Template = (typeof TEMPLATES)[number];

interface Certificate {
  id: string;
  certId: string;
  recipientName: string;
  recipientEmail: string;
  eventName: string;
  type: CertType;
  position?: string;
  domain?: string;
  template: Template;
  pdfUrl?: string;
  issuedAt: string;
  emailSent: boolean;
  isRevoked: boolean;
  viewCount: number;
}

const typeColors: Record<CertType, string> = {
  PARTICIPATION: 'bg-blue-100 text-blue-700',
  COMPLETION: 'bg-green-100 text-green-700',
  WINNER: 'bg-amber-100 text-amber-700',
  SPEAKER: 'bg-purple-100 text-purple-700',
};

function CertTypeBadge({ type }: { type: CertType }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeColors[type]}`}>
      {type}
    </span>
  );
}

interface GenerateFormData {
  recipientName: string;
  recipientEmail: string;
  eventName: string;
  type: CertType;
  template: Template;
  position: string;
  domain: string;
  description: string;
  signatoryName: string;
  facultyName: string;
  sendEmail: boolean;
}

const defaultForm: GenerateFormData = {
  recipientName: '',
  recipientEmail: '',
  eventName: '',
  type: 'PARTICIPATION',
  template: 'gold',
  position: '',
  domain: '',
  description: '',
  signatoryName: 'Club President',
  facultyName: '',
  sendEmail: false,
};

interface BulkEntry {
  name: string;
  email: string;
  position: string;
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

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(total / 20);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [form, setForm] = useState<GenerateFormData>(defaultForm);
  const [generating, setGenerating] = useState(false);

  // Bulk generate modal
  const [showBulk, setShowBulk] = useState(false);
  const [bulkEventName, setBulkEventName] = useState('');
  const [bulkType, setBulkType] = useState<CertType>('PARTICIPATION');
  const [bulkTemplate, setBulkTemplate] = useState<Template>('dark');
  const [bulkSignatory, setBulkSignatory] = useState('Club President');
  const [bulkSendEmail, setBulkSendEmail] = useState(false);
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkFacultyName, setBulkFacultyName] = useState('');
  const [bulkCsv, setBulkCsv] = useState('');
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkEntry[] | null>(null);
  const [bulkParseErrors, setBulkParseErrors] = useState<string[]>([]);

  // Revoke modal
  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

  const [resendingId, setResendingId] = useState<string | null>(null);

  const fetchCerts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getCertificates(token!, { page, limit: 20, search: search || undefined, type: typeFilter || undefined }) as { certificates: Certificate[]; total: number };
      setCerts(data.certificates);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load certificates');
    } finally {
      setLoading(false);
    }
  }, [token, page, search, typeFilter]);

  useEffect(() => {
    fetchCerts();
  }, [fetchCerts]);

  // Debounce search
  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  async function handleGenerate() {
    if (!form.recipientName || !form.recipientEmail || !form.eventName) {
      toast.error('Please fill in all required fields');
      return;
    }
    setGenerating(true);
    try {
      const data = await api.generateCertificate({
        recipientName: form.recipientName,
        recipientEmail: form.recipientEmail,
        eventName: form.eventName,
        type: form.type,
        template: form.template,
        position: form.position || undefined,
        domain: form.domain || undefined,
        description: form.description || undefined,
        signatoryName: form.signatoryName,
        facultyName: form.facultyName || undefined,
        sendEmail: form.sendEmail,
      }, token!);
      toast.success(`Certificate generated! ID: ${data.certId}`);
      setShowGenerate(false);
      setForm(defaultForm);
      fetchCerts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  function parseBulkCsv(): { recipients: BulkEntry[]; errors: string[] } {
    const lines = bulkCsv.trim().split('\n').filter(Boolean);
    const recipients: BulkEntry[] = [];
    const parseErrors: string[] = [];

    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 2) {
        parseErrors.push(`Invalid line: ${line}`);
        continue;
      }
      const [name, email, position = ''] = parts;
      if (!name) {
        parseErrors.push(`Missing name: ${line}`);
        continue;
      }
      // Proper email validation
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        parseErrors.push(`Invalid email: ${email || '(empty)'}`);
        continue;
      }
      recipients.push({ name, email, position });
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
    const csv = 'Name,Email,Position (optional)\nAlice Johnson,alice@example.com,1st Place\nBob Smith,bob@example.com,\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'certificate-recipients-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkGenerate() {
    if (!bulkEventName || !bulkCsv.trim()) {
      toast.error('Please fill in event name and recipient list');
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
        eventName: bulkEventName,
        type: bulkType,
        template: bulkTemplate,
        signatoryName: bulkSignatory,
        facultyName: bulkFacultyName || undefined,
        description: bulkDescription || undefined,
        sendEmail: bulkSendEmail,
      }, token!);
      toast.success(`Generated ${data.generated} certificates`);
      if (data.failed > 0) {
        toast.warning(`${data.failed} certificates failed to generate`);
      }
      setShowBulk(false);
      setBulkCsv('');
      setBulkEventName('');
      setBulkPreview(null);
      setBulkParseErrors([]);
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

  function downloadPdf(storedPdfUrl: string, certId: string) {
    // The /download/:certId endpoint is public and handles both local files and
    // Cloudinary-stored PDFs server-side, responding with Content-Disposition: attachment.
    // Navigating to it triggers a browser download without any cross-origin blob issues.
    void storedPdfUrl; // resolved server-side
    const url = `${API_URL}/certificates/download/${certId}`;
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { if (document.body.contains(a)) document.body.removeChild(a); }, 1000);
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search name, email, event, or cert ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">All Types</option>
            {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={fetchCerts} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center h-48"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : certs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Award className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No certificates found</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cert ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Recipient</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Event</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Issued</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {certs.map(cert => (
                  <tr key={cert.certId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-amber-700 font-medium">{cert.certId}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{cert.recipientName}</p>
                      <p className="text-gray-400 text-xs">{cert.recipientEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">{cert.eventName}</td>
                    <td className="px-4 py-3"><CertTypeBadge type={cert.type} /></td>
                    <td className="px-4 py-3">
                      {cert.isRevoked ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                          <XCircle className="w-3.5 h-3.5" /> Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(cert.issuedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {cert.pdfUrl && (
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => downloadPdf(cert.pdfUrl!, cert.certId)} title="Download PDF">
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => copyVerifyLink(cert.certId)} title="Copy verify link">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        {!cert.isRevoked && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleResend(cert.certId)}
                              disabled={resendingId === cert.certId}
                              title="Resend email"
                            >
                              {resendingId === cert.certId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setRevokeTarget(cert)}
                              title="Revoke"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Generate Modal */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Generate Certificate
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Recipient Name *</label>
                <Input value={form.recipientName} onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))} placeholder="Full name" className="mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Recipient Email *</label>
                <Input type="email" value={form.recipientEmail} onChange={e => setForm(f => ({ ...f, recipientEmail: e.target.value }))} placeholder="email@example.com" className="mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Event Name *</label>
                <Input value={form.eventName} onChange={e => setForm(f => ({ ...f, eventName: e.target.value }))} placeholder="e.g. Hackathon 2026" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Certificate Type</label>
                <select
                  className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as CertType }))}
                >
                  {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Template</label>
                <select
                  className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.template}
                  onChange={e => setForm(f => ({ ...f, template: e.target.value as Template }))}
                >
                  {TEMPLATES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Position / Rank</label>
                <Input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="e.g. 1st Place" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Domain / Track</label>
                <Input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="e.g. Web Dev" className="mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Signatory Name</label>
                <Input value={form.signatoryName} onChange={e => setForm(f => ({ ...f, signatoryName: e.target.value }))} placeholder="Club President" className="mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Faculty Name</label>
                <Input value={form.facultyName} onChange={e => setForm(f => ({ ...f, facultyName: e.target.value }))} placeholder="e.g. Dr. Sharma" className="mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Custom recognition text (optional)" className="mt-1" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={form.sendEmail}
                  onChange={e => setForm(f => ({ ...f, sendEmail: e.target.checked }))}
                  className="w-4 h-4 rounded accent-amber-500"
                />
                <label htmlFor="sendEmail" className="text-sm text-gray-700">Send certificate via email</label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generating} className="bg-amber-500 hover:bg-amber-600 text-white">
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Award className="w-4 h-4 mr-2" />}
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Generate Modal */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              Bulk Generate Certificates
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Event Name *</label>
              <Input value={bulkEventName} onChange={e => setBulkEventName(e.target.value)} placeholder="Hackathon 2026" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Type</label>
                <select className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" value={bulkType} onChange={e => setBulkType(e.target.value as CertType)}>
                  {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Template</label>
                <select className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" value={bulkTemplate} onChange={e => setBulkTemplate(e.target.value as Template)}>
                  {TEMPLATES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Signatory Name</label>
              <Input value={bulkSignatory} onChange={e => setBulkSignatory(e.target.value)} placeholder="Club President" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Faculty Name</label>
              <Input value={bulkFacultyName} onChange={e => setBulkFacultyName(e.target.value)} placeholder="e.g. Dr. Sharma" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Description</label>
              <Input value={bulkDescription} onChange={e => setBulkDescription(e.target.value)} placeholder="Custom recognition text (optional)" className="mt-1" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">
                  Recipients (CSV) *
                </label>
                <Button variant="ghost" size="sm" onClick={downloadCsvTemplate} className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700">
                  <FileDown className="w-3 h-3" />
                  Download Template
                </Button>
              </div>
              <p className="text-xs text-gray-400 mb-1">One per line: <code>Name, Email, Position (optional)</code></p>
              <textarea
                value={bulkCsv}
                onChange={e => { setBulkCsv(e.target.value); setBulkPreview(null); setBulkParseErrors([]); }}
                rows={6}
                placeholder={"Alice, alice@example.com, 1st Place\nBob, bob@example.com"}
                className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
              {bulkParseErrors.length > 0 && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 space-y-0.5">
                  {bulkParseErrors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              {bulkPreview && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                  <p className="font-medium mb-1">{bulkPreview.length} recipient(s) ready:</p>
                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                    {bulkPreview.slice(0, 10).map((r, i) => (
                      <p key={i}>{r.name} — {r.email}{r.position ? ` (${r.position})` : ''}</p>
                    ))}
                    {bulkPreview.length > 10 && <p className="text-green-500">…and {bulkPreview.length - 10} more</p>}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="bulkSendEmail" checked={bulkSendEmail} onChange={e => setBulkSendEmail(e.target.checked)} className="w-4 h-4 rounded accent-amber-500" />
              <label htmlFor="bulkSendEmail" className="text-sm text-gray-700">Send certificate emails to all recipients</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulk(false)}>Cancel</Button>
            {!bulkPreview ? (
              <Button onClick={handleBulkPreview} className="bg-blue-500 hover:bg-blue-600 text-white">
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
            ) : (
              <Button onClick={handleBulkGenerate} disabled={bulkGenerating} className="bg-amber-500 hover:bg-amber-600 text-white">
                {bulkGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
                {bulkGenerating ? 'Generating…' : 'Generate All'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Modal */}
      <Dialog open={!!revokeTarget} onOpenChange={open => { if (!open) setRevokeTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Revoke Certificate
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">
              Are you sure you want to revoke certificate <strong className="font-mono">{revokeTarget?.certId}</strong> for <strong>{revokeTarget?.recipientName}</strong>?
              This action cannot be undone.
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700">Reason (optional)</label>
              <Input value={revokeReason} onChange={e => setRevokeReason(e.target.value)} placeholder="Reason for revocation" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button onClick={handleRevoke} disabled={revoking} className="bg-red-500 hover:bg-red-600 text-white">
              {revoking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
              {revoking ? 'Revoking…' : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

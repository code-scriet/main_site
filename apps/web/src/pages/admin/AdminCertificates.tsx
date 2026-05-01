import { useState, useEffect, useCallback, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InlineMarkdown } from '@/components/ui/inline-markdown';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as ConfirmDialogContent,
  AlertDialogDescription as ConfirmDialogDescription,
  AlertDialogFooter as ConfirmDialogFooter,
  AlertDialogHeader as ConfirmDialogHeader,
  AlertDialogTitle as ConfirmDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api, type CertificateTemplate } from '@/lib/api';
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
  Trash2,
  PenLine,
  ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/dateUtils';

const CERT_TYPES = ['PARTICIPATION', 'COMPLETION', 'WINNER', 'SPEAKER'] as const;

interface ActiveSignatory {
  id: string;
  name: string;
  title: string;
  signatureUrl: string | null;
}

// ── SignatoryPicker ──────────────────────────────────────────────────────────
// Dropdown of saved signatories. Selecting one uses its stored signature image.
// "Custom" mode lets admin type a name/title and optionally upload a signature
// image — which is uploaded to Cloudinary on the spot and stored as a URL.
interface SignatoryPickerProps {
  label: string;
  required?: boolean;
  token: string;
  signatories: ActiveSignatory[];
  selectedId: string;
  name: string;
  title: string;
  defaultTitle: string;
  imageUrl: string;           // Cloudinary URL of the uploaded signature image
  onSelect: (id: string, name: string, title: string) => void;
  onImageUrlChange: (url: string) => void;
}

function SignatoryPicker({
  label, required, token, signatories, selectedId, name, title, defaultTitle,
  imageUrl, onSelect, onImageUrlChange,
}: SignatoryPickerProps) {
  const pickerId = useId();
  const [uploading, setUploading] = useState(false);
  const selected = signatories.find(s => s.id === selectedId);
  const isCustom = !selectedId;

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const url = await api.uploadImage(file, token);
      onImageUrlChange(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      {/* Label */}
      <p className="text-sm font-semibold text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </p>

      {/* Dropdown */}
      <select
        id={`${pickerId}-select`}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        value={selectedId || '__custom__'}
        onChange={e => {
          const val = e.target.value;
          if (val === '__custom__') {
            onSelect('', '', '');
            onImageUrlChange('');
          } else {
            const sig = signatories.find(s => s.id === val);
            if (sig) { onSelect(sig.id, sig.name, sig.title); onImageUrlChange(''); }
          }
        }}
      >
        <option value="__custom__">✏ Custom (type manually)</option>
        {signatories.map(s => (
          <option key={s.id} value={s.id}>
            {s.signatureUrl ? '🖊 ' : ''}{s.name} — {s.title}
          </option>
        ))}
      </select>

      {/* Selected saved signatory preview */}
      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-100 bg-white p-2">
          <div>
            <p className="text-sm font-medium text-gray-800">{selected.name}</p>
            <p className="text-xs text-gray-500">{selected.title}</p>
          </div>
          {selected.signatureUrl ? (
            <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-2 py-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-green-600 shrink-0" />
              <span className="text-xs text-green-700 font-medium">Signature image</span>
              <img
                src={selected.signatureUrl}
                alt="Signature"
                className="h-8 max-w-[90px] object-contain opacity-80 ml-1"
                onError={e => { (e.target as HTMLImageElement).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
              <PenLine className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-xs text-amber-700">Cursive text fallback</span>
            </div>
          )}
        </div>
      )}

      {/* Custom mode: name + title + Cloudinary image upload */}
      {isCustom && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${pickerId}-name`} className="text-xs text-gray-500 block mb-0.5">Name{required && ' *'}</label>
              <Input
                id={`${pickerId}-name`}
                value={name}
                onChange={e => onSelect('', e.target.value, title)}
                placeholder="e.g. Aarav Mehta"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label htmlFor={`${pickerId}-title`} className="text-xs text-gray-500 block mb-0.5">Title</label>
              <Input
                id={`${pickerId}-title`}
                value={title}
                onChange={e => onSelect('', name, e.target.value)}
                placeholder={defaultTitle}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Signature image — Cloudinary upload */}
          {imageUrl ? (
            <div className="flex items-center gap-3 rounded-md border border-green-200 bg-white p-2">
              <img src={imageUrl} alt="Signature preview" className="h-10 max-w-[120px] object-contain shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-green-700">Signature uploaded</p>
                <p className="text-xs text-gray-400 truncate">{imageUrl.split('/').pop()}</p>
              </div>
              <button
                type="button"
                onClick={() => onImageUrlChange('')}
                className="text-xs text-red-500 hover:text-red-600 shrink-0 font-medium"
              >
                Remove
              </button>
            </div>
          ) : (
            <label htmlFor={`${pickerId}-signature-file`} className={`flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-2.5 text-sm transition-colors ${
              uploading
                ? 'border-amber-300 bg-amber-50 text-amber-600 cursor-not-allowed'
                : 'border-gray-300 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600'
            }`}>
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin shrink-0" /><span>Uploading to Cloudinary…</span></>
              ) : (
                <><ImageIcon className="w-4 h-4 shrink-0" /><span>Upload signature image <span className="text-xs text-gray-400">(PNG/JPG — optional)</span></span></>
              )}
              <input id={`${pickerId}-signature-file`} type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleImageFile} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

type CertType = (typeof CERT_TYPES)[number];

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
  position: string;
  domain: string;
  teamName: string;
  description: string;
  signatoryId: string;
  signatoryName: string;
  signatoryTitle: string;
  signatoryImageUrl: string;
  facultySignatoryId: string;
  facultyName: string;
  facultyTitle: string;
  facultyImageUrl: string;
  sendEmail: boolean;
}

const SIGNATORY_STORAGE_KEY = 'cert_signatory_defaults';

type SignatoryDefaults = Pick<
  GenerateFormData,
  'signatoryId' | 'signatoryName' | 'signatoryTitle' | 'facultySignatoryId' | 'facultyName' | 'facultyTitle'
>;

const DEFAULT_SIGNATORY_DEFAULTS: SignatoryDefaults = {
  signatoryId: '',
  signatoryName: '',
  signatoryTitle: 'Club President',
  facultySignatoryId: '',
  facultyName: '',
  facultyTitle: 'Faculty Coordinator',
};

function loadSignatoryDefaults(): SignatoryDefaults {
  try {
    const saved = localStorage.getItem(SIGNATORY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        signatoryId: parsed.signatoryId || '',
        signatoryName: parsed.signatoryName || '',
        signatoryTitle: parsed.signatoryTitle || 'Club President',
        facultySignatoryId: parsed.facultySignatoryId || '',
        facultyName: parsed.facultyName || '',
        facultyTitle: parsed.facultyTitle || 'Faculty Coordinator',
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_SIGNATORY_DEFAULTS;
}

function saveSignatoryDefaults(data: SignatoryDefaults) {
  try { localStorage.setItem(SIGNATORY_STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
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

interface BulkEntry {
  name: string;
  email: string;
  position?: string;
  domain?: string;
  description?: string;
  teamName?: string;
  type?: CertType;
  template?: CertificateTemplate;
  userId?: string;
}

const BULK_CSV_HEADER_ALIASES: Record<string, keyof BulkEntry> = {
  name: 'name',
  recipientname: 'name',
  email: 'email',
  recipientemail: 'email',
  position: 'position',
  rank: 'position',
  placement: 'position',
  domain: 'domain',
  track: 'domain',
  description: 'description',
  teamname: 'teamName',
  team: 'teamName',
  type: 'type',
  template: 'template',
  userid: 'userId',
  useridnumber: 'userId',
};

function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < row.length; index++) {
    const char = row[index];

    if (char === '"') {
      if (inQuotes && row[index + 1] === '"') {
        current += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/\r$/, ''));
}

function isHeaderRow(values: string[]): boolean {
  const normalized = values.slice(0, 3).map(normalizeCsvHeader);
  return normalized[0] === 'name' && normalized[1] === 'email';
}

function normalizeTemplateValue(value: string | undefined | null): CertificateTemplate | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'gold' || normalized === 'dark' || normalized === 'white' || normalized === 'emerald'
    ? normalized
    : undefined;
}

function normalizeCertTypeValue(value: string | undefined | null): CertType | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return CERT_TYPES.includes(normalized as CertType) ? (normalized as CertType) : undefined;
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

      {/* Saved Signatures */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <PenLine className="w-4 h-4 text-amber-500" />
              Saved Signatures
              <span className="text-xs text-gray-400 font-normal ml-1">
                ({allSignatories.length} {allSignatories.length === 1 ? 'entry' : 'entries'})
              </span>
            </h2>
            <Button size="sm" onClick={() => openSigModal()} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white h-8">
              <Plus className="w-3.5 h-3.5" />
              Add Signature
            </Button>
          </div>
          {loadingAllSigs ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /></div>
          ) : allSignatories.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No saved signatures yet. Add one to make it available in all certificate forms.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {allSignatories.map(sig => {
                const certCount = sig._count.certificatesAsPrimary + sig._count.certificatesAsFaculty;
                return (
                  <div key={sig.id} className="flex items-center gap-3 py-2.5">
                    {sig.signatureUrl ? (
                      <img
                        src={sig.signatureUrl}
                        alt={sig.name}
                        className="h-8 w-24 object-contain shrink-0 rounded border border-gray-100 bg-white"
                        onError={e => { (e.target as HTMLImageElement).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; }}
                      />
                    ) : (
                      <div className="h-8 w-24 rounded border border-dashed border-gray-200 flex items-center justify-center shrink-0">
                        <PenLine className="w-4 h-4 text-gray-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{sig.name}</p>
                      <p className="text-xs text-gray-400">{sig.title} · {certCount} cert{certCount !== 1 ? 's' : ''}</p>
                    </div>
                    {!sig.isActive && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">Inactive</span>
                    )}
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700" onClick={() => openSigModal(sig)} title="Edit">
                        <PenLine className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600" onClick={() => setSignatoryToDelete(sig)} title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(signatoryToDelete)} onOpenChange={(open) => !open && setSignatoryToDelete(null)}>
        <ConfirmDialogContent>
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>Delete saved signature?</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              {signatoryToDelete
                ? `This will delete "${signatoryToDelete.name}" unless it is referenced by existing certificates, in which case it will be deactivated.`
                : 'This signature will be removed from the certificate picker.'}
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (signatoryToDelete) {
                  void deleteSig(signatoryToDelete.id);
                }
              }}
            >
              Delete Signature
            </AlertDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </AlertDialog>

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
                      {formatDate(cert.issuedAt, 'short')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {cert.pdfUrl && (
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => void downloadPdf(cert.certId)} title="Download PDF" disabled={downloadingId === cert.certId}>
                            {downloadingId === cert.certId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteTarget(cert)}
                          title="Delete Permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
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
      <Dialog open={showGenerate} onOpenChange={(open) => { setShowGenerate(open); if (!open) setGenerateError(''); }}>
        <DialogContent className="max-w-lg flex flex-col gap-4 max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Generate Certificate
            </DialogTitle>
          </DialogHeader>
          {generateError && (
            <div className="shrink-0 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{generateError}</span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto min-h-0 py-1 pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-full">
                <label htmlFor="admin-certificates-recipient-name" className="text-sm font-medium text-gray-700">Recipient Name *</label>
                <Input id="admin-certificates-recipient-name" value={form.recipientName} onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))} placeholder="Full name" className="mt-1" />
              </div>
              <div className="col-span-full">
                <label htmlFor="admin-certificates-recipient-email" className="text-sm font-medium text-gray-700">Recipient Email *</label>
                <Input id="admin-certificates-recipient-email" type="email" value={form.recipientEmail} onChange={e => setForm(f => ({ ...f, recipientEmail: e.target.value }))} placeholder="email@example.com" className="mt-1" />
              </div>
              <div className="col-span-full">
                <label htmlFor="admin-certificates-event-name" className="text-sm font-medium text-gray-700">Event Name (optional)</label>
                <Input id="admin-certificates-event-name" value={form.eventName} onChange={e => setForm(f => ({ ...f, eventName: e.target.value }))} placeholder="e.g. Hackathon 2026" className="mt-1" />
              </div>
              <div className="col-span-full">
                <label htmlFor="admin-certificates-type" className="text-sm font-medium text-gray-700">Certificate Type</label>
                <select
                  id="admin-certificates-type"
                  className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as CertType }))}
                >
                  {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="admin-certificates-position" className="text-sm font-medium text-gray-700">Position / Rank</label>
                <Input id="admin-certificates-position" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="e.g. 1st Place" className="mt-1" />
              </div>
              <div>
                <label htmlFor="admin-certificates-domain" className="text-sm font-medium text-gray-700">Domain / Track</label>
                <Input id="admin-certificates-domain" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="e.g. Web Dev" className="mt-1" />
              </div>
              <div className="col-span-full">
                <label htmlFor="admin-certificates-team-name" className="text-sm font-medium text-gray-700">Team Name (optional)</label>
                <Input id="admin-certificates-team-name" value={form.teamName} onChange={e => setForm(f => ({ ...f, teamName: e.target.value }))} placeholder="e.g. Team Alpha" className="mt-1" />
              </div>
              <SignatoryPicker
                label="Signatory *"
                required
                token={token!}
                signatories={activeSignatories}
                selectedId={form.signatoryId}
                name={form.signatoryName}
                title={form.signatoryTitle}
                defaultTitle="Club President"
                imageUrl={form.signatoryImageUrl}
                onSelect={(id, name, title) => setForm(f => ({ ...f, signatoryId: id, signatoryName: name, signatoryTitle: title || f.signatoryTitle, signatoryImageUrl: '' }))}
                onImageUrlChange={url => setForm(f => ({ ...f, signatoryImageUrl: url }))}
              />
              <SignatoryPicker
                label="Faculty Signatory (optional)"
                token={token!}
                signatories={activeSignatories}
                selectedId={form.facultySignatoryId}
                name={form.facultyName}
                title={form.facultyTitle}
                defaultTitle="Faculty Coordinator"
                imageUrl={form.facultyImageUrl}
                onSelect={(id, name, title) => setForm(f => ({ ...f, facultySignatoryId: id, facultyName: name, facultyTitle: title || f.facultyTitle, facultyImageUrl: '' }))}
                onImageUrlChange={url => setForm(f => ({ ...f, facultyImageUrl: url }))}
              />
              <div className="col-span-full">
                <label htmlFor="admin-certificates-description" className="text-sm font-medium text-gray-700">Description</label>
                <Textarea
                  id="admin-certificates-description"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Custom recognition text (optional). Markdown supported: **bold**, *italic*, ***bold italic***"
                  className="mt-1 min-h-[92px]"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Supports Markdown formatting like <code>**bold**</code>, <code>*italic*</code>, <code>***bold italic***</code>, and <code>~~strikethrough~~</code>.
                </p>
                <p className="mt-1 text-xs text-amber-600">
                  Placeholders resolve when generating: <code>{'{name}'}</code>, <code>{'{email}'}</code>, <code>{'{position}'}</code>, <code>{'{domain}'}</code>, <code>{'{teamName}'}</code>, <code>{'{eventName}'}</code>, <code>{'{type}'}</code>.
                </p>
                {form.description.trim() && (
                  <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Preview</p>
                    <div className="mt-1 text-sm text-gray-700 leading-relaxed">
                      <InlineMarkdown>{form.description}</InlineMarkdown>
                    </div>
                  </div>
                )}
              </div>
              <div className="col-span-full flex items-center gap-2">
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
          <DialogFooter className="shrink-0 border-t border-gray-100 pt-2">
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
        <DialogContent className="max-w-lg flex flex-col gap-4 max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              Bulk Generate Certificates
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1 pr-1">
            <div>
              <label htmlFor="admin-certificates-bulk-event-name" className="text-sm font-medium text-gray-700">Event Name (optional)</label>
              <Input id="admin-certificates-bulk-event-name" value={bulkEventName} onChange={e => setBulkEventName(e.target.value)} placeholder="Hackathon 2026" className="mt-1" />
            </div>
            <div>
              <label htmlFor="admin-certificates-bulk-type" className="text-sm font-medium text-gray-700">Type</label>
              <select id="admin-certificates-bulk-type" className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" value={bulkType} onChange={e => setBulkType(e.target.value as CertType)}>
                {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <SignatoryPicker
              label="Signatory *"
              required
              token={token!}
              signatories={activeSignatories}
              selectedId={bulkSignatoryId}
              name={bulkSignatory}
              title={bulkSignatoryTitle}
              defaultTitle="Club President"
              imageUrl={bulkSignatoryImageUrl}
              onSelect={(id, name, title) => { setBulkSignatoryId(id); setBulkSignatory(name); setBulkSignatoryTitle(title || bulkSignatoryTitle); setBulkSignatoryImageUrl(''); }}
              onImageUrlChange={setBulkSignatoryImageUrl}
            />
            <SignatoryPicker
              label="Faculty Signatory (optional)"
              token={token!}
              signatories={activeSignatories}
              selectedId={bulkFacultySignatoryId}
              name={bulkFacultyName}
              title={bulkFacultyTitle}
              defaultTitle="Faculty Coordinator"
              imageUrl={bulkFacultyImageUrl}
              onSelect={(id, name, title) => { setBulkFacultySignatoryId(id); setBulkFacultyName(name); setBulkFacultyTitle(title || bulkFacultyTitle); setBulkFacultyImageUrl(''); }}
              onImageUrlChange={setBulkFacultyImageUrl}
            />
            <div>
              <label htmlFor="admin-certificates-bulk-domain" className="text-sm font-medium text-gray-700">Domain / Track</label>
              <Input id="admin-certificates-bulk-domain" value={bulkDomain} onChange={e => setBulkDomain(e.target.value)} placeholder="e.g. Web Development (optional)" className="mt-1" />
            </div>
            <div>
              <label htmlFor="admin-certificates-bulk-description" className="text-sm font-medium text-gray-700">Description</label>
              <Textarea
                id="admin-certificates-bulk-description"
                value={bulkDescription}
                onChange={e => setBulkDescription(e.target.value)}
                placeholder="Custom recognition text (optional). Markdown supported: **bold**, *italic*, ***bold italic***"
                className="mt-1 min-h-[92px]"
              />
              <p className="mt-1 text-xs text-gray-500">
                Supports Markdown formatting like <code>**bold**</code>, <code>*italic*</code>, <code>***bold italic***</code>, and <code>~~strikethrough~~</code>.
              </p>
              <p className="mt-1 text-xs text-amber-600">
                Placeholders resolve per row: <code>{'{name}'}</code>, <code>{'{email}'}</code>, <code>{'{position}'}</code>, <code>{'{domain}'}</code>, <code>{'{teamName}'}</code>, <code>{'{eventName}'}</code>, <code>{'{type}'}</code>.
              </p>
              {bulkDescription.trim() && (
                <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Preview</p>
                  <div className="mt-1 text-sm text-gray-700 leading-relaxed">
                    <InlineMarkdown>{bulkDescription}</InlineMarkdown>
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="admin-certificates-bulk-csv" className="text-sm font-medium text-gray-700">
                  Recipients (CSV) *
                </label>
                <Button variant="ghost" size="sm" onClick={downloadCsvTemplate} className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700">
                  <FileDown className="w-3 h-3" />
                  Download Template
                </Button>
              </div>
              <p className="text-xs text-gray-400 mb-1">One per line: <code>Name, Email, Position</code>. You can also use a header row with <code>Team Name</code>, <code>Domain</code>, <code>Description</code>, <code>Type</code>, <code>Template</code>, or <code>User ID</code>.</p>
              <textarea
                id="admin-certificates-bulk-csv"
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
                      <p key={i}>
                        {r.name} — {r.email}
                        {r.position ? ` (${r.position})` : ''}
                        {r.teamName ? ` · ${r.teamName}` : ''}
                      </p>
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
          <DialogFooter className="shrink-0 border-t border-gray-100 pt-2">
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
              <label htmlFor="admin-certificates-revoke-reason" className="text-sm font-medium text-gray-700">Reason (optional)</label>
              <Input id="admin-certificates-revoke-reason" value={revokeReason} onChange={e => setRevokeReason(e.target.value)} placeholder="Reason for revocation" className="mt-1" />
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

      {/* Delete Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Delete Certificate
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">
              Are you sure you want to <strong>permanently delete</strong> certificate <strong className="font-mono">{deleteTarget?.certId}</strong> for <strong>{deleteTarget?.recipientName}</strong>?
            </p>
            <p className="text-sm text-red-600 font-medium bg-red-50 p-2 rounded border border-red-100">
              This will completely remove it from the database and invalidate the local PDF mapping. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Signature Modal */}
      <Dialog open={sigModalOpen} onOpenChange={open => { if (!sigModalSaving) setSigModalOpen(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{sigModalEdit ? 'Edit Signature' : 'Add Signature'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label htmlFor="admin-certificates-signatory-name" className="text-xs text-gray-500 block mb-1">Name <span className="text-red-500">*</span></label>
              <Input id="admin-certificates-signatory-name" value={sigModalName} onChange={e => setSigModalName(e.target.value)} placeholder="e.g. Aarav Mehta" className="h-9" />
            </div>
            <div>
              <label htmlFor="admin-certificates-signatory-title" className="text-xs text-gray-500 block mb-1">Title</label>
              <Input id="admin-certificates-signatory-title" value={sigModalTitle} onChange={e => setSigModalTitle(e.target.value)} placeholder="e.g. Club President" className="h-9" />
            </div>
            <div>
              <label htmlFor="admin-certificates-signatory-file" className="text-xs text-gray-500 block mb-1">Signature Image <span className="text-gray-400">(optional, PNG/JPG)</span></label>
              {sigModalEdit?.signatureUrl && !sigModalUploadedUrl && !sigModalClearImg && (
                <div className="flex items-center gap-2 rounded border p-2 bg-gray-50 mb-2">
                  <img src={sigModalEdit.signatureUrl} alt="Current" className="h-8 max-w-[100px] object-contain" onError={e => { (e.target as HTMLImageElement).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; }} />
                  <button type="button" className="text-xs text-red-500 hover:text-red-700 ml-auto" onClick={() => setSigModalClearImg(true)}>Remove</button>
                </div>
              )}
              {sigModalClearImg && (
                <p className="text-xs text-amber-600 mb-2">
                  Signature image will be removed on save.{' '}
                  <button type="button" className="underline" onClick={() => setSigModalClearImg(false)}>Undo</button>
                </p>
              )}
              {sigModalUploading ? (
                <div className="flex items-center gap-2 rounded border p-2 bg-gray-50">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                  <span className="text-xs text-gray-500">Uploading to Cloudinary…</span>
                </div>
              ) : sigModalUploadedUrl ? (
                <div className="flex items-center gap-2 rounded border p-2 bg-gray-50 overflow-hidden">
                  <img src={sigModalUploadedUrl} alt="Preview" className="h-8 max-w-[80px] object-contain shrink-0" />
                  <p className="text-xs text-gray-500 truncate flex-1 min-w-0">{sigModalUploadedUrl.split('/').pop()}</p>
                  <button type="button" className="text-xs text-red-500 shrink-0" onClick={() => setSigModalUploadedUrl(null)}>Remove</button>
                </div>
              ) : (
                <label htmlFor="admin-certificates-signatory-file" className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-500 hover:border-amber-400 hover:text-amber-600 transition-colors">
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>Choose image file</span>
                  <input
                    id="admin-certificates-signatory-file"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setSigModalClearImg(false);
                      setSigModalUploading(true);
                      try {
                        const url = await api.uploadImage(file, token!);
                        setSigModalUploadedUrl(url);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Upload failed');
                      } finally {
                        setSigModalUploading(false);
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setSigModalOpen(false)} disabled={sigModalSaving}>Cancel</Button>
            <Button onClick={saveSigModal} disabled={sigModalSaving || sigModalUploading || !sigModalName.trim()} className="bg-amber-500 hover:bg-amber-600 text-white">
              {sigModalSaving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              {sigModalEdit ? 'Save Changes' : 'Add Signature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api } from '@/lib/api';
import {
  Award,
  Loader2,
  AlertCircle,
  Download,
  Copy,
  ExternalLink,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

type CertType = 'PARTICIPATION' | 'COMPLETION' | 'WINNER' | 'SPEAKER';
type Template = 'gold' | 'dark' | 'white' | 'emerald';

interface Certificate {
  certId: string;
  recipientName: string;
  eventName: string;
  type: CertType;
  position?: string;
  domain?: string;
  template: Template;
  issuedAt: string;
  pdfUrl?: string;
}

const typeColors: Record<CertType, string> = {
  PARTICIPATION: 'bg-blue-100 text-blue-700',
  COMPLETION: 'bg-green-100 text-green-700',
  WINNER: 'bg-amber-100 text-amber-700',
  SPEAKER: 'bg-purple-100 text-purple-700',
};

const templateGradients: Record<Template, string> = {
  gold: 'from-amber-50 to-yellow-100 border-amber-200',
  dark: 'from-gray-800 to-gray-900 border-gray-700',
  white: 'from-gray-50 to-white border-gray-200',
  emerald: 'from-emerald-50 to-teal-100 border-emerald-200',
};

const templateTextColor: Record<Template, string> = {
  gold: 'text-amber-900',
  dark: 'text-gray-100',
  white: 'text-gray-800',
  emerald: 'text-emerald-900',
};

function CertCard({ cert }: { cert: Certificate }) {
  const verifyUrl = `${window.location.origin}/verify/${cert.certId}`;

  function handleDownload() {
    // The /download/:certId endpoint is public and handles both local files and
    // Cloudinary-stored PDFs server-side, responding with Content-Disposition: attachment.
    // Navigating to it triggers a browser download without any cross-origin blob issues.
    const url = `${API_URL}/certificates/download/${cert.certId}`;
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { if (document.body.contains(a)) document.body.removeChild(a); }, 1000);
  }

  function copyLink() {
    navigator.clipboard.writeText(verifyUrl)
      .then(() => toast.success('Verify link copied!'))
      .catch(() => toast.error('Copy failed'));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-gradient-to-br p-5 shadow-sm ${templateGradients[cert.template]}`}
    >
      <div className="flex items-start justify-between mb-3">
        <Award className={`w-8 h-8 ${cert.template === 'dark' ? 'text-amber-400' : 'text-amber-500'}`} />
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeColors[cert.type]}`}>
          {cert.type}
        </span>
      </div>

      <h3 className={`font-bold text-base mb-0.5 ${templateTextColor[cert.template]}`}>
        {cert.eventName}
      </h3>

      {cert.position && (
        <p className={`text-xs mb-0.5 ${cert.template === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
          {cert.position}
        </p>
      )}
      {cert.domain && (
        <p className={`text-xs mb-2 ${cert.template === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          {cert.domain}
        </p>
      )}

      <div className={`font-mono text-[11px] mb-3 ${cert.template === 'dark' ? 'text-amber-400' : 'text-amber-700'}`}>
        {cert.certId}
      </div>

      <p className={`text-xs mb-4 ${cert.template === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
        Issued {new Date(cert.issuedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <div className="flex gap-2 flex-wrap">
        {cert.pdfUrl && (
          <Button
            size="sm"
            onClick={handleDownload}
            className="flex-1 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={copyLink}
          className="gap-1.5 text-xs"
          title="Copy verify link"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy Link
        </Button>
        <a href={verifyUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" title="Open verify page">
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </a>
      </div>
    </motion.div>
  );
}

export default function DashboardCertificates() {
  const { token } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const navigate = useNavigate();

  // Redirect if certificates feature is disabled
  useEffect(() => {
    if (!settingsLoading && settings?.certificatesEnabled === false) {
      navigate('/dashboard', { replace: true });
    }
  }, [settings, settingsLoading, navigate]);

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await api.getMyCertificates(token!, {
          page,
          limit: 12,
          type: typeFilter || undefined,
          sort: sortOrder,
        }) as { certificates: Certificate[]; total: number; page: number; totalPages: number };
        setCerts(data.certificates as Certificate[]);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load certificates');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, page, typeFilter, sortOrder]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [typeFilter, sortOrder]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Award className="w-6 h-6 text-amber-500" />
          My Certificates
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {total} certificate{total !== 1 ? 's' : ''} earned through club events and activities
        </p>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">All Types</option>
          <option value="PARTICIPATION">Participation</option>
          <option value="COMPLETION">Completion</option>
          <option value="WINNER">Winner</option>
          <option value="SPEAKER">Speaker</option>
        </select>
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value as 'asc' | 'desc')}
          className="border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : certs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Award className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No certificates yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Participate in club events to earn certificates
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {certs.map(cert => (
              <CertCard key={cert.certId} cert={cert} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
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

          {/* Verify tip */}
          <Card className="border-amber-100 bg-amber-50/50">
            <CardContent className="p-4 flex gap-3 items-start">
              <ShieldCheck className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Share & Verify</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Use the copy link button on any certificate to share a verification link. Anyone can verify your certificate at{' '}
                  <a href="https://codescriet.dev/verify" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    codescriet.dev/verify
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

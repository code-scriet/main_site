import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Award,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  QrCode,
  Search,
  Camera,
  CameraOff,
  ExternalLink,
  Download,
  AlertCircle,
  Linkedin,
} from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';
import { linkedInAddCertUrl } from '@/lib/linkedin';
import { SEO } from '@/components/SEO';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

type CertType = 'PARTICIPATION' | 'COMPLETION' | 'WINNER' | 'SPEAKER';

interface VerifyResult {
  valid: boolean;
  reason?: 'not_found' | 'revoked' | 'server_error' | 'invalid_id';
  revokedReason?: string;
  certId?: string;
  recipientName?: string;
  eventName?: string;
  type?: CertType;
  position?: string;
  domain?: string;
  template?: string;
  issuedAt?: string;
  pdfUrl?: string;
  downloadUrl?: string;
}

const typeColors: Record<CertType, string> = {
  PARTICIPATION: 'bg-blue-100 text-blue-700',
  COMPLETION: 'bg-green-100 text-green-700',
  WINNER: 'bg-amber-100 text-amber-700',
  SPEAKER: 'bg-purple-100 text-purple-700',
};

const typeLabels: Record<CertType, string> = {
  PARTICIPATION: 'Certificate of Participation',
  COMPLETION: 'Certificate of Completion',
  WINNER: 'Certificate of Achievement',
  SPEAKER: 'Speaker Certificate',
};

const typeDescriptions: Record<CertType, string> = {
  PARTICIPATION: 'for participation in',
  COMPLETION: 'for completing',
  WINNER: 'for outstanding performance in',
  SPEAKER: 'for speaking at',
};

const typeDescriptionsWithoutEvent: Record<CertType, string> = {
  PARTICIPATION: 'for participation',
  COMPLETION: 'for completion',
  WINNER: 'for outstanding performance',
  SPEAKER: 'for speaking',
};

function ValidResult({ result }: { result: VerifyResult }) {
  const type = result.type as CertType;
  const eventName = (result.eventName || '').trim();
  const hasEventName = eventName.length > 0;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
      <Card className="border-green-200 bg-green-50/40 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-green-400 to-emerald-500" />
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-green-700 text-sm font-medium mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Verified Certificate
              </p>
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                {result.recipientName}
              </h2>
              <p className="text-gray-600 text-sm mb-3">
                {type && typeLabels[type]}{' '}
                {type
                  ? (hasEventName ? typeDescriptions[type] : typeDescriptionsWithoutEvent[type])
                  : (hasEventName ? 'for participation in' : 'for participation')}
                {hasEventName ? (
                  <>
                    {' '}
                    <strong>{eventName}</strong>
                  </>
                ) : null}
              </p>

              <div className="flex flex-wrap gap-2 mb-4">
                {type && (
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${typeColors[type]}`}>
                    {type}
                  </span>
                )}
                {result.position && (
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    {result.position}
                  </span>
                )}
                {result.domain && (
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    {result.domain}
                  </span>
                )}
              </div>

              <div className="bg-white rounded-lg border border-green-100 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Certificate ID</span>
                  <span className="font-mono text-amber-700 font-medium">{result.certId}</span>
                </div>
                {result.issuedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Issued On</span>
                    <span className="text-gray-800">
                      {formatDate(result.issuedAt)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Issued By</span>
                  <span className="text-gray-800">Code.Scriet Club</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {result.downloadUrl && (
                  <a href={result.downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Button className="gap-2 bg-amber-500 hover:bg-amber-600 text-white">
                      <Download className="w-4 h-4" />
                      Download Certificate
                    </Button>
                  </a>
                )}
                {result.certId && (
                  <a
                    href={linkedInAddCertUrl({
                      certId: result.certId,
                      type: result.type ?? 'PARTICIPATION',
                      eventName: result.eventName,
                      issuedAt: result.issuedAt,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" className="gap-2 border-[#0a66c2] text-[#0a66c2] hover:bg-[#0a66c2] hover:text-white">
                      <Linkedin className="w-4 h-4" />
                      Add to LinkedIn
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function InvalidResult({ result }: { result: VerifyResult }) {
  const messages: Record<string, { title: string; desc: string }> = {
    not_found: { title: 'Certificate Not Found', desc: 'No certificate exists with this ID. Please check the ID and try again.' },
    revoked: { title: 'Certificate Revoked', desc: result.revokedReason || 'This certificate has been revoked and is no longer valid.' },
    server_error: { title: 'Verification Failed', desc: 'An error occurred while verifying. Please try again.' },
    invalid_id: { title: 'Invalid ID', desc: 'The certificate ID format is invalid.' },
  };

  const info = messages[result.reason || 'server_error'] || messages.server_error;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
      <Card className="border-red-200 bg-red-50/40 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-red-400 to-rose-500" />
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <XCircle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-red-600 text-sm font-medium mb-1 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {result.reason === 'revoked' ? 'Certificate Revoked' : 'Verification Failed'}
              </p>
              <h2 className="text-lg font-bold text-gray-900 mb-1">{info.title}</h2>
              <p className="text-gray-600 text-sm">{info.desc}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Extract a cert id from a scanned QR payload (a /verify/<certId> URL or a raw
// "ABCD-EFGH-IJKL" code). Returns null when the payload isn't a cert reference.
function extractCertIdFromQr(data: string): string | null {
  try {
    const url = new URL(data);
    const parts = url.pathname.split('/');
    const certId = parts[parts.length - 1];
    if (certId) return certId;
  } catch {
    const raw = data.trim().toUpperCase();
    if (/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(raw)) return raw;
  }
  return null;
}

const QR_READER_ID = 'cert-verify-qr-reader';

// QR scanner component. Live camera scanning via html5-qrcode (W4: replaces the
// hand-rolled getUserMedia + jsqr loop so the page no longer pulls jsqr — the
// scan chunk now ships one decode engine instead of two). html5-qrcode owns
// camera selection + per-frame decoding internally and renders into #QR_READER_ID.
function QRScanner({ onDetect }: { onDetect: (certId: string) => void }) {
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  // Guards against the decode callback firing again between match and stop().
  const detectedRef = useRef(false);
  // Tracks live mount state so a start() that resolves *after* unmount (the
  // dynamic-import / camera-init window) still releases the camera — otherwise
  // cleanup runs while scannerRef is null and the stream leaks on.
  const mountedRef = useRef(true);
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState('');

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch {
        // Camera may already be stopped — nothing to clean up.
      }
    }
    setCameraReady(false);
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera API not available. Please use a modern browser with HTTPS.');
      return;
    }

    detectedRef.current = false;
    // flushSync so the #reader div is in the DOM before html5-qrcode mounts into it.
    flushSync(() => {
      setScanning(true);
      setCameraReady(false);
    });

    try {
      // Lazy-load the decode engine only when the camera is actually opened —
      // visiting /verify must not pull the scan chunk (preserves the old
      // dynamic-import behavior; the engine is now html5-qrcode, not jsqr).
      const { Html5Qrcode } = await import('html5-qrcode');
      // Unmounted during the import await — abort before touching the camera.
      if (!mountedRef.current) return;
      const scanner = new Html5Qrcode(QR_READER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (detectedRef.current) return;
          const certId = extractCertIdFromQr(decodedText);
          if (certId) {
            detectedRef.current = true;
            void stopCamera().then(() => onDetect(certId));
          }
        },
        () => {
          // Per-frame "no QR detected" — expected, no-op.
        },
      );
      // Unmounted while start() was initializing the camera — release it now;
      // the cleanup effect already ran (with scannerRef possibly still null).
      if (!mountedRef.current) {
        void stopCamera();
        return;
      }
      setCameraReady(true);
    } catch (err) {
      await stopCamera();
      const message = err instanceof Error ? err.message : String(err);
      if (/NotAllowedError|Permission/i.test(message)) {
        setError('Camera access denied. Please allow camera permission in your browser settings and try again.');
      } else if (/NotFoundError|no.*camera/i.test(message)) {
        setError('No camera found on this device.');
      } else if (/NotReadableError|in use|AbortError/i.test(message)) {
        setError('Camera is in use by another app. Close it and try again.');
      } else {
        setError('Could not access camera. Please try again or enter the certificate ID manually.');
      }
    }
  }, [onDetect, stopCamera]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="space-y-3">
      {!scanning ? (
        <Button onClick={startCamera} variant="outline" className="w-full gap-2">
          <Camera className="w-4 h-4" />
          Open Camera to Scan QR Code
        </Button>
      ) : (
        <div className="relative aspect-[4/3] min-h-[18rem] rounded-xl overflow-hidden bg-black">
          {/* html5-qrcode injects its <video> into this container. */}
          <div id={QR_READER_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting camera…
              </div>
            </div>
          )}
          <Button
            onClick={() => { void stopCamera(); }}
            size="sm"
            variant="outline"
            className="absolute top-2 right-2 z-10 gap-1 bg-white/90 text-xs"
          >
            <CameraOff className="w-3.5 h-3.5" />
            Stop
          </Button>
        </div>
      )}
      {error && (
        <p className="text-red-500 text-xs flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
      {scanning && cameraReady && (
        <p className="text-gray-500 text-xs text-center animate-pulse">
          Point camera at a certificate QR code…
        </p>
      )}
    </div>
  );
}

export default function VerifyCertificatePage() {
  const { certId: paramCertId } = useParams<{ certId?: string }>();
  const navigate = useNavigate();

  const [input, setInput] = useState(paramCertId || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  const verify = useCallback(async (id: string) => {
    const cleaned = id.trim().toUpperCase();
    if (!cleaned) return;
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/certificates/verify/${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      setResult(data);
      if (data.valid || data.reason) {
        navigate(`/verify/${cleaned}`, { replace: true });
      }
    } catch {
      setResult({ valid: false, reason: 'server_error' });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // Auto-verify if cert ID in URL
  useEffect(() => {
    if (paramCertId) {
      setInput(paramCertId);
      verify(paramCertId);
    }
  }, [paramCertId, verify]);

  function handleQRDetect(certId: string) {
    setShowScanner(false);
    setInput(certId);
    verify(certId);
  }

  return (
    <Layout>
      <SEO
        title={paramCertId ? `Certificate ${paramCertId}` : 'Verify Certificate'}
        description="Verify the authenticity of any code.scriet certificate by ID or QR code."
        url={paramCertId ? `/verify/${paramCertId}` : '/verify'}
        noIndex={!!paramCertId}
      />
      <div className="bg-gradient-to-br from-amber-50 via-white to-orange-50">
      <main className="py-12 px-4">
        <div className="max-w-lg mx-auto space-y-8">
          {/* Hero */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Verify Certificate</h1>
            <p className="text-gray-500 text-sm">
              Enter a certificate ID or scan the QR code to verify its authenticity
            </p>
            <div className="mt-4 flex items-center justify-center gap-4 text-sm">
              <Link to="/" className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900">
                <Award className="w-4 h-4" />
                Home
              </Link>
              <Link to="/dashboard/certificates" className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
                <ExternalLink className="w-4 h-4" />
                Certificates
              </Link>
            </div>
          </motion.div>

          {/* Search Box */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={input}
                    onChange={e => setInput(e.target.value.toUpperCase())}
                    placeholder="e.g. ABCD-EFGH-JKLM"
                    className="pl-9 font-mono"
                    onKeyDown={e => e.key === 'Enter' && verify(input)}
                  />
                </div>
                <Button
                  onClick={() => verify(input)}
                  disabled={loading || !input.trim()}
                  className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Verify
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-gray-400">or</span>
                </div>
              </div>

              {showScanner ? (
                <QRScanner onDetect={handleQRDetect} />
              ) : (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setShowScanner(true)}
                >
                  <Camera className="w-4 h-4" />
                  Scan QR Code from Certificate
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Result */}
          {loading && (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            </div>
          )}
          {!loading && result && (
            result.valid
              ? <ValidResult result={result} />
              : <InvalidResult result={result} />
          )}

          {/* Info */}
          {!result && !loading && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">{/* responsive: stack on mobile */}
              {[
                { icon: ShieldCheck, label: 'Tamper-proof', desc: 'Cryptographically signed IDs' },
                { icon: QrCode, label: 'QR Enabled', desc: 'Scan from any certificate PDF' },
                { icon: Award, label: 'Instant', desc: 'Verify in seconds' },
              ].map(item => (
                <div key={item.label} className="rounded-xl border bg-white p-3">
                  <item.icon className="w-5 h-5 mx-auto mb-1.5 text-amber-500" />
                  <p className="text-xs font-medium text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      </div>
    </Layout>
  );
}

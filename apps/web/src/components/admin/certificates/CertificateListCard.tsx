import {
  AlertCircle,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Mail,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CertTypeBadge, type CertType } from '@/components/admin/certificates/CertTypeBadge';
import { formatDate } from '@/lib/dateUtils';

export interface CertificateListRow {
  certId: string;
  recipientName: string;
  recipientEmail: string;
  eventName: string;
  type: CertType;
  isRevoked: boolean;
  issuedAt: string;
  pdfUrl?: string;
}

interface CertificateListCardProps {
  certificates: CertificateListRow[];
  loading: boolean;
  error: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  downloadingId: string | null;
  resendingId: string | null;
  onDownload: (certId: string) => void;
  onCopyVerifyLink: (certId: string) => void;
  onResend: (certId: string) => void;
  onRevoke: (cert: CertificateListRow) => void;
  onDelete: (cert: CertificateListRow) => void;
}

export function CertificateListCard({
  certificates,
  loading,
  error,
  page,
  totalPages,
  onPageChange,
  downloadingId,
  resendingId,
  onDownload,
  onCopyVerifyLink,
  onResend,
  onRevoke,
  onDelete,
}: CertificateListCardProps) {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  if (certificates.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Award className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>No certificates found</p>
      </div>
    );
  }

  return (
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
            {certificates.map(cert => (
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => onDownload(cert.certId)}
                        title="Download PDF"
                        disabled={downloadingId === cert.certId}
                      >
                        {downloadingId === cert.certId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Download className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => onCopyVerifyLink(cert.certId)}
                      title="Copy verify link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    {!cert.isRevoked && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => onResend(cert.certId)}
                          disabled={resendingId === cert.certId}
                          title="Resend email"
                        >
                          {resendingId === cert.certId
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Mail className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => onRevoke(cert)}
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
                      onClick={() => onDelete(cert)}
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => onPageChange(page + 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

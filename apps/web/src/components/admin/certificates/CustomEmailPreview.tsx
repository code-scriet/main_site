import { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CustomEmailPreviewProps {
  customBody: string;
  recipientName?: string;
  eventName?: string;
  certId?: string;
}

function substitutePlaceholders(body: string, vars: Record<string, string>): string {
  return body
    .replace(/\{\{name\}\}/g, vars.name)
    .replace(/\{\{eventName\}\}/g, vars.eventName)
    .replace(/\{\{certId\}\}/g, vars.certId)
    .replace(/\{\{downloadUrl\}\}/g, vars.downloadUrl)
    .replace(/\{\{verifyUrl\}\}/g, vars.verifyUrl);
}

function mirrorBackendBodyHtml(body: string, vars: Record<string, string>): string {
  const substituted = substitutePlaceholders(body, vars);
  if (!/<[a-z][\s\S]*>/i.test(substituted)) {
    return substituted
      .split('\n\n')
      .map(
        (p) =>
          `<p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">${p.replace(/\n/g, '<br/>')}</p>`,
      )
      .join('');
  }
  return substituted;
}

/**
 * Approximate in-dialog preview of the certificate custom email body.
 * Mirrors the backend rendering in apps/api/src/utils/email.ts
 * (placeholder substitution + plain-text paragraph wrapping).
 */
export function CustomEmailPreview({
  customBody,
  recipientName,
  eventName,
  certId,
}: CustomEmailPreviewProps) {
  const [open, setOpen] = useState(false);

  const vars = useMemo(
    () => ({
      name: recipientName?.trim() || 'Student Name',
      eventName: eventName?.trim() || 'Event Name',
      certId: certId || 'CS-PREVIEW-0001',
      downloadUrl: 'https://example.com/certificates/CS-PREVIEW-0001.pdf',
      verifyUrl: 'https://codescriet.dev/verify/CS-PREVIEW-0001',
    }),
    [recipientName, eventName, certId],
  );

  const bodyHtml = useMemo(
    () => mirrorBackendBodyHtml(customBody || '(empty custom body)', vars),
    [customBody, vars],
  );

  const srcDoc = useMemo(
    () => `<!DOCTYPE html>
<html><body style="margin:0;background:#0b0f1a;padding:24px;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#111827;border-radius:12px;padding:32px;">
    <h1 style="color:#f9fafb;font-size:20px;margin:0 0 8px;">Hello ${vars.name},</h1>
    <p style="color:#9ca3af;margin:0 0 24px;">Regarding ${vars.eventName}</p>
    ${bodyHtml}
    <a href="${vars.downloadUrl}" style="display:inline-block;background:#f59e0b;color:#111827;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none;margin-right:8px;">⬇ Download Certificate PDF</a>
    <a href="${vars.verifyUrl}" style="display:inline-block;border:1px solid #374151;color:#d1d5db;padding:12px 24px;border-radius:8px;text-decoration:none;">🔍 Verify Certificate</a>
  </div>
</body></html>`,
    [bodyHtml, vars],
  );

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        disabled={!customBody.trim()}
      >
        {open ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
        {open ? 'Hide preview' : 'Preview email'}
      </Button>
      {open && (
        <iframe
          title="Custom email preview"
          sandbox=""
          srcDoc={srcDoc}
          className="mt-2 w-full h-[380px] rounded-md border border-[var(--border-subtle)] bg-[#0b0f1a]"
        />
      )}
    </div>
  );
}

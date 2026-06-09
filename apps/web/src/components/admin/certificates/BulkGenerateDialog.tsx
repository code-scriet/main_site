import { Eye, FileDown, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InlineMarkdown } from '@/components/ui/inline-markdown';
import { CERT_TYPES, type CertType } from '@/components/admin/certificates/CertTypeBadge';
import { SignatoryPicker, type ActiveSignatory } from '@/components/admin/certificates/SignatoryPicker';
import type { BulkEntry } from '@/lib/certificatesCsv';
import type { CertificateEmailTemplate } from '@/lib/api';

interface BulkGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  activeSignatories: ActiveSignatory[];

  eventName: string;
  onEventNameChange: (value: string) => void;
  type: CertType;
  onTypeChange: (value: CertType) => void;
  domain: string;
  onDomainChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;

  signatoryId: string;
  signatoryName: string;
  signatoryTitle: string;
  signatoryImageUrl: string;
  onPrimarySignatorySelect: (id: string, name: string, title: string) => void;
  onPrimarySignatoryImageUrlChange: (value: string) => void;

  facultySignatoryId: string;
  facultyName: string;
  facultyTitle: string;
  facultyImageUrl: string;
  onFacultySignatorySelect: (id: string, name: string, title: string) => void;
  onFacultySignatoryImageUrlChange: (value: string) => void;

  csv: string;
  onCsvChange: (value: string) => void;
  preview: BulkEntry[] | null;
  parseErrors: string[];
  sendEmail: boolean;
  onSendEmailChange: (value: boolean) => void;
  emailTemplate: CertificateEmailTemplate;
  onEmailTemplateChange: (value: CertificateEmailTemplate) => void;
  emailSignerName: string;
  onEmailSignerNameChange: (value: string) => void;
  generating: boolean;
  onPreview: () => void;
  onGenerate: () => void;
  onDownloadTemplate: () => void;
}

export function BulkGenerateDialog({
  open,
  onOpenChange,
  token,
  activeSignatories,
  eventName,
  onEventNameChange,
  type,
  onTypeChange,
  domain,
  onDomainChange,
  description,
  onDescriptionChange,
  signatoryId,
  signatoryName,
  signatoryTitle,
  signatoryImageUrl,
  onPrimarySignatorySelect,
  onPrimarySignatoryImageUrlChange,
  facultySignatoryId,
  facultyName,
  facultyTitle,
  facultyImageUrl,
  onFacultySignatorySelect,
  onFacultySignatoryImageUrlChange,
  csv,
  onCsvChange,
  preview,
  parseErrors,
  sendEmail,
  onSendEmailChange,
  emailTemplate,
  onEmailTemplateChange,
  emailSignerName,
  onEmailSignerNameChange,
  generating,
  onPreview,
  onGenerate,
  onDownloadTemplate,
}: BulkGenerateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col gap-4 max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" />
            Bulk Generate Certificates
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1 pr-1">
          <div>
            <label htmlFor="admin-certificates-bulk-event-name" className="text-sm font-medium text-[var(--ds-text-2)]">Event Name (optional)</label>
            <Input
              id="admin-certificates-bulk-event-name"
              value={eventName}
              onChange={e => onEventNameChange(e.target.value)}
              placeholder="Hackathon 2026"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="admin-certificates-bulk-type" className="text-sm font-medium text-[var(--ds-text-2)]">Type</label>
            <select
              id="admin-certificates-bulk-type"
              className="mt-1 w-full border border-[var(--border-subtle)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={type}
              onChange={e => onTypeChange(e.target.value as CertType)}
            >
              {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <SignatoryPicker
            label="Signatory *"
            required
            token={token}
            signatories={activeSignatories}
            selectedId={signatoryId}
            name={signatoryName}
            title={signatoryTitle}
            defaultTitle="Club President"
            imageUrl={signatoryImageUrl}
            onSelect={onPrimarySignatorySelect}
            onImageUrlChange={onPrimarySignatoryImageUrlChange}
          />
          <SignatoryPicker
            label="Faculty Signatory (optional)"
            token={token}
            signatories={activeSignatories}
            selectedId={facultySignatoryId}
            name={facultyName}
            title={facultyTitle}
            defaultTitle="Faculty Coordinator"
            imageUrl={facultyImageUrl}
            onSelect={onFacultySignatorySelect}
            onImageUrlChange={onFacultySignatoryImageUrlChange}
          />
          <div>
            <label htmlFor="admin-certificates-bulk-domain" className="text-sm font-medium text-[var(--ds-text-2)]">Domain / Track</label>
            <Input
              id="admin-certificates-bulk-domain"
              value={domain}
              onChange={e => onDomainChange(e.target.value)}
              placeholder="e.g. Web Development (optional)"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="admin-certificates-bulk-description" className="text-sm font-medium text-[var(--ds-text-2)]">Description</label>
            <Textarea
              id="admin-certificates-bulk-description"
              value={description}
              onChange={e => onDescriptionChange(e.target.value)}
              placeholder="Custom recognition text (optional). Markdown supported: **bold**, *italic*, ***bold italic***"
              className="mt-1 min-h-[92px]"
            />
            <p className="mt-1 text-xs text-[var(--ds-text-3)]">
              Supports Markdown formatting like <code>**bold**</code>, <code>*italic*</code>, <code>***bold italic***</code>, and <code>~~strikethrough~~</code>.
            </p>
            <p className="mt-1 text-xs text-amber-600">
              Placeholders resolve per row: <code>{'{name}'}</code>, <code>{'{email}'}</code>, <code>{'{position}'}</code>, <code>{'{domain}'}</code>, <code>{'{teamName}'}</code>, <code>{'{eventName}'}</code>, <code>{'{type}'}</code>.
            </p>
            {description.trim() && (
              <div className="mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-3)]">Preview</p>
                <div className="mt-1 text-sm text-[var(--ds-text-2)] leading-relaxed">
                  <InlineMarkdown>{description}</InlineMarkdown>
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="admin-certificates-bulk-csv" className="text-sm font-medium text-[var(--ds-text-2)]">
                Recipients (CSV) *
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDownloadTemplate}
                className="h-7 text-xs gap-1 text-amber-600 hover:text-[var(--warning)]"
              >
                <FileDown className="w-3 h-3" />
                Download Template
              </Button>
            </div>
            <p className="text-xs text-[var(--ds-text-3)] mb-1">
              One per line: <code>Name, Email, Position</code>. You can also use a header row with{' '}
              <code>Team Name</code>, <code>Domain</code>, <code>Description</code>, <code>Type</code>,{' '}
              <code>Template</code>, or <code>User ID</code>.
            </p>
            <textarea
              id="admin-certificates-bulk-csv"
              value={csv}
              onChange={e => onCsvChange(e.target.value)}
              rows={6}
              placeholder={'Alice, alice@example.com, 1st Place\nBob, bob@example.com'}
              className="mt-1 w-full border border-[var(--border-subtle)] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
            {parseErrors.length > 0 && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 space-y-0.5">
                {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            {preview && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                <p className="font-medium mb-1">{preview.length} recipient(s) ready:</p>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {preview.slice(0, 10).map((r, i) => (
                    <p key={i}>
                      {r.name} — {r.email}
                      {r.position ? ` (${r.position})` : ''}
                      {r.teamName ? ` · ${r.teamName}` : ''}
                    </p>
                  ))}
                  {preview.length > 10 && <p className="text-green-500">…and {preview.length - 10} more</p>}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bulkSendEmail"
              checked={sendEmail}
              onChange={e => onSendEmailChange(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-500"
            />
            <label htmlFor="bulkSendEmail" className="text-sm text-[var(--ds-text-2)]">
              Send certificate emails to all recipients
            </label>
          </div>
          {sendEmail && (
            <div className="space-y-3 rounded-md border border-[var(--border-subtle)] p-3">
              <div>
                <label htmlFor="bulkEmailTemplate" className="text-sm font-medium text-[var(--ds-text-2)]">
                  Email template
                </label>
                <select
                  id="bulkEmailTemplate"
                  value={emailTemplate}
                  onChange={(e) => onEmailTemplateChange(e.target.value as CertificateEmailTemplate)}
                  className="mt-1 w-full border border-[var(--border-subtle)] rounded-md px-3 py-2 text-sm bg-[var(--bg-raised)] text-[var(--ds-text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="default">Default (code.scriet)</option>
                  <option value="faculty_distribution">Faculty Certificate Distribution</option>
                </select>
              </div>
              {emailTemplate === 'faculty_distribution' && (
                <div>
                  <label htmlFor="bulkEmailSignerName" className="text-sm font-medium text-[var(--ds-text-2)]">
                    Email signer name
                  </label>
                  <Input
                    id="bulkEmailSignerName"
                    className="mt-1"
                    value={emailSignerName}
                    onChange={(e) => onEmailSignerNameChange(e.target.value)}
                    placeholder="PRINCE GUPTA"
                  />
                  <p className="mt-1 text-[11px] text-[var(--ds-text-3)]">
                    Signs the appreciation email as “President, Code.SCRIET”. Independent of the certificate signatory.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t border-[var(--border-subtle)] pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!preview ? (
            <Button onClick={onPreview} className="bg-blue-500 hover:bg-blue-600 text-white">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          ) : (
            <Button
              onClick={onGenerate}
              disabled={generating}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
              {generating ? 'Generating…' : 'Generate All'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

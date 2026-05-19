import { AlertCircle, Award, Loader2 } from 'lucide-react';
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

export interface GenerateFormData {
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

interface GenerateCertificateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: GenerateFormData;
  onFormChange: (updater: (prev: GenerateFormData) => GenerateFormData) => void;
  error: string;
  generating: boolean;
  onGenerate: () => void;
  token: string;
  activeSignatories: ActiveSignatory[];
}

export function GenerateCertificateDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  error,
  generating,
  onGenerate,
  token,
  activeSignatories,
}: GenerateCertificateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col gap-4 max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            Generate Certificate
          </DialogTitle>
        </DialogHeader>
        {error && (
          <div className="shrink-0 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0 py-1 pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full">
              <label htmlFor="admin-certificates-recipient-name" className="text-sm font-medium text-[var(--ds-text-2)]">
                Recipient Name *
              </label>
              <Input
                id="admin-certificates-recipient-name"
                value={form.recipientName}
                onChange={e => onFormChange(f => ({ ...f, recipientName: e.target.value }))}
                placeholder="Full name"
                className="mt-1"
              />
            </div>
            <div className="col-span-full">
              <label htmlFor="admin-certificates-recipient-email" className="text-sm font-medium text-[var(--ds-text-2)]">
                Recipient Email *
              </label>
              <Input
                id="admin-certificates-recipient-email"
                type="email"
                value={form.recipientEmail}
                onChange={e => onFormChange(f => ({ ...f, recipientEmail: e.target.value }))}
                placeholder="email@example.com"
                className="mt-1"
              />
            </div>
            <div className="col-span-full">
              <label htmlFor="admin-certificates-event-name" className="text-sm font-medium text-[var(--ds-text-2)]">
                Event Name (optional)
              </label>
              <Input
                id="admin-certificates-event-name"
                value={form.eventName}
                onChange={e => onFormChange(f => ({ ...f, eventName: e.target.value }))}
                placeholder="e.g. Hackathon 2026"
                className="mt-1"
              />
            </div>
            <div className="col-span-full">
              <label htmlFor="admin-certificates-type" className="text-sm font-medium text-[var(--ds-text-2)]">
                Certificate Type
              </label>
              <select
                id="admin-certificates-type"
                className="mt-1 w-full border border-[var(--border-subtle)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.type}
                onChange={e => onFormChange(f => ({ ...f, type: e.target.value as CertType }))}
              >
                {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="admin-certificates-position" className="text-sm font-medium text-[var(--ds-text-2)]">
                Position / Rank
              </label>
              <Input
                id="admin-certificates-position"
                value={form.position}
                onChange={e => onFormChange(f => ({ ...f, position: e.target.value }))}
                placeholder="e.g. 1st Place"
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="admin-certificates-domain" className="text-sm font-medium text-[var(--ds-text-2)]">
                Domain / Track
              </label>
              <Input
                id="admin-certificates-domain"
                value={form.domain}
                onChange={e => onFormChange(f => ({ ...f, domain: e.target.value }))}
                placeholder="e.g. Web Dev"
                className="mt-1"
              />
            </div>
            <div className="col-span-full">
              <label htmlFor="admin-certificates-team-name" className="text-sm font-medium text-[var(--ds-text-2)]">
                Team Name (optional)
              </label>
              <Input
                id="admin-certificates-team-name"
                value={form.teamName}
                onChange={e => onFormChange(f => ({ ...f, teamName: e.target.value }))}
                placeholder="e.g. Team Alpha"
                className="mt-1"
              />
            </div>
            <SignatoryPicker
              label="Signatory *"
              required
              token={token}
              signatories={activeSignatories}
              selectedId={form.signatoryId}
              name={form.signatoryName}
              title={form.signatoryTitle}
              defaultTitle="Club President"
              imageUrl={form.signatoryImageUrl}
              onSelect={(id, name, title) =>
                onFormChange(f => ({
                  ...f,
                  signatoryId: id,
                  signatoryName: name,
                  signatoryTitle: title || f.signatoryTitle,
                  signatoryImageUrl: '',
                }))
              }
              onImageUrlChange={url => onFormChange(f => ({ ...f, signatoryImageUrl: url }))}
            />
            <SignatoryPicker
              label="Faculty Signatory (optional)"
              token={token}
              signatories={activeSignatories}
              selectedId={form.facultySignatoryId}
              name={form.facultyName}
              title={form.facultyTitle}
              defaultTitle="Faculty Coordinator"
              imageUrl={form.facultyImageUrl}
              onSelect={(id, name, title) =>
                onFormChange(f => ({
                  ...f,
                  facultySignatoryId: id,
                  facultyName: name,
                  facultyTitle: title || f.facultyTitle,
                  facultyImageUrl: '',
                }))
              }
              onImageUrlChange={url => onFormChange(f => ({ ...f, facultyImageUrl: url }))}
            />
            <div className="col-span-full">
              <label htmlFor="admin-certificates-description" className="text-sm font-medium text-[var(--ds-text-2)]">Description</label>
              <Textarea
                id="admin-certificates-description"
                value={form.description}
                onChange={e => onFormChange(f => ({ ...f, description: e.target.value }))}
                placeholder="Custom recognition text (optional). Markdown supported: **bold**, *italic*, ***bold italic***"
                className="mt-1 min-h-[92px]"
              />
              <p className="mt-1 text-xs text-[var(--ds-text-3)]">
                Supports Markdown formatting like <code>**bold**</code>, <code>*italic*</code>, <code>***bold italic***</code>, and <code>~~strikethrough~~</code>.
              </p>
              <p className="mt-1 text-xs text-amber-600">
                Placeholders resolve when generating: <code>{'{name}'}</code>, <code>{'{email}'}</code>, <code>{'{position}'}</code>, <code>{'{domain}'}</code>, <code>{'{teamName}'}</code>, <code>{'{eventName}'}</code>, <code>{'{type}'}</code>.
              </p>
              {form.description.trim() && (
                <div className="mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-3)]">Preview</p>
                  <div className="mt-1 text-sm text-[var(--ds-text-2)] leading-relaxed">
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
                onChange={e => onFormChange(f => ({ ...f, sendEmail: e.target.checked }))}
                className="w-4 h-4 rounded accent-amber-500"
              />
              <label htmlFor="sendEmail" className="text-sm text-[var(--ds-text-2)]">Send certificate via email</label>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t border-[var(--border-subtle)] pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onGenerate} disabled={generating} className="bg-amber-500 hover:bg-amber-600 text-white">
            {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Award className="w-4 h-4 mr-2" />}
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

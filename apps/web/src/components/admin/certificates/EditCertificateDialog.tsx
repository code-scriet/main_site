import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
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
import { CERT_TYPES, type CertType } from '@/components/admin/certificates/CertTypeBadge';
import type { CertificateDetail, CertificateEmailTemplate, CertificateUpdateInput } from '@/lib/api';

interface EditCertificateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cert: CertificateDetail | null;
  saving: boolean;
  onSave: (data: CertificateUpdateInput) => void;
}

const labelClass = 'text-sm font-medium text-[var(--ds-text-2)]';
const selectClass =
  'mt-1 w-full border border-[var(--border-subtle)] rounded-md px-3 py-2 text-sm bg-[var(--bg-raised)] text-[var(--ds-text-1)] focus:outline-none focus:ring-2 focus:ring-amber-400';

// Parent remounts this (via `key={cert.certId}`) whenever a different certificate is
// opened, so these lazy initializers re-seed the form from the freshly fetched record.
export function EditCertificateDialog({ open, onOpenChange, cert, saving, onSave }: EditCertificateDialogProps) {
  const [recipientName, setRecipientName] = useState(cert?.recipientName ?? '');
  const [recipientEmail, setRecipientEmail] = useState(cert?.recipientEmail ?? '');
  const [eventName, setEventName] = useState(cert?.eventName ?? '');
  const [type, setType] = useState<CertType>(cert?.type ?? 'PARTICIPATION');
  const [position, setPosition] = useState(cert?.position ?? '');
  const [domain, setDomain] = useState(cert?.domain ?? '');
  const [description, setDescription] = useState(cert?.description ?? '');
  const [emailTemplate, setEmailTemplate] = useState<CertificateEmailTemplate>(cert?.emailTemplate ?? 'default');
  const [emailSignerName, setEmailSignerName] = useState(cert?.emailSignerName || 'PRINCE GUPTA');

  const handleSave = () => {
    const name = recipientName.trim();
    const email = recipientEmail.trim();
    if (name.length < 2) {
      toast.error('Recipient name must be at least 2 characters');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid recipient email');
      return;
    }
    onSave({
      recipientName: name,
      recipientEmail: email,
      eventName: eventName.trim(),
      position,
      domain,
      description,
      type,
      emailTemplate,
      emailSignerName: emailTemplate === 'faculty_distribution' ? emailSignerName : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-lg flex flex-col gap-4 max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit certificate{cert ? ` · ${cert.certId}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-full">
              <label htmlFor="edit-cert-name" className={labelClass}>Recipient name</label>
              <Input id="edit-cert-name" className="mt-1" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
            </div>
            <div className="col-span-full">
              <label htmlFor="edit-cert-email" className={labelClass}>Recipient email</label>
              <Input id="edit-cert-email" type="email" className="mt-1" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} />
            </div>
            <div className="col-span-full">
              <label htmlFor="edit-cert-event" className={labelClass}>Event name</label>
              <Input id="edit-cert-event" className="mt-1" value={eventName} onChange={e => setEventName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="edit-cert-type" className={labelClass}>Type</label>
              <select id="edit-cert-type" className={selectClass} value={type} onChange={e => setType(e.target.value as CertType)}>
                {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="edit-cert-position" className={labelClass}>Position / Rank</label>
              <Input id="edit-cert-position" className="mt-1" value={position} onChange={e => setPosition(e.target.value)} />
            </div>
            <div className="col-span-full">
              <label htmlFor="edit-cert-domain" className={labelClass}>Domain</label>
              <Input id="edit-cert-domain" className="mt-1" value={domain} onChange={e => setDomain(e.target.value)} />
            </div>
            <div className="col-span-full">
              <label htmlFor="edit-cert-description" className={labelClass}>Description</label>
              <Textarea id="edit-cert-description" className="mt-1" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <div className="col-span-full">
              <label htmlFor="edit-cert-email-template" className={labelClass}>Email template (used on Resend)</label>
              <select
                id="edit-cert-email-template"
                className={selectClass}
                value={emailTemplate}
                onChange={e => setEmailTemplate(e.target.value as CertificateEmailTemplate)}
              >
                <option value="default">Default (code.scriet)</option>
                <option value="faculty_distribution">Faculty Certificate Distribution</option>
              </select>
            </div>
            {emailTemplate === 'faculty_distribution' && (
              <div className="col-span-full">
                <label htmlFor="edit-cert-signer" className={labelClass}>Email signer name</label>
                <Input id="edit-cert-signer" className="mt-1" value={emailSignerName} onChange={e => setEmailSignerName(e.target.value)} placeholder="PRINCE GUPTA" />
              </div>
            )}
          </div>

          <p className="mt-3 text-[11px] text-[var(--ds-text-3)] leading-relaxed">
            Editing the name, event, position, domain or description re-renders the certificate PDF in place — the
            certificate ID and its verify/download links stay the same. Editing the email keeps the PDF untouched and
            lets you <strong>Resend</strong> to the corrected address right away.
          </p>
        </div>

        <DialogFooter className="shrink-0 border-t border-[var(--border-subtle)] pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !cert} className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

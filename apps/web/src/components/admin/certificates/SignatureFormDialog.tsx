import { ImageIcon, Loader2 } from 'lucide-react';
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
import { api } from '@/lib/api';

export interface SignatureFormEditTarget {
  signatureUrl?: string | null;
}

interface SignatureFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget: SignatureFormEditTarget | null;
  name: string;
  onNameChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  uploadedUrl: string | null;
  onUploadedUrlChange: (value: string | null) => void;
  uploading: boolean;
  onUploadingChange: (value: boolean) => void;
  saving: boolean;
  clearImg: boolean;
  onClearImgChange: (value: boolean) => void;
  onSave: () => void;
  token: string | null;
}

const PIXEL_FALLBACK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function SignatureFormDialog({
  open,
  onOpenChange,
  editTarget,
  name,
  onNameChange,
  title,
  onTitleChange,
  uploadedUrl,
  onUploadedUrlChange,
  uploading,
  onUploadingChange,
  saving,
  clearImg,
  onClearImgChange,
  onSave,
  token,
}: SignatureFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={open => { if (!saving) onOpenChange(open); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Signature' : 'Add Signature'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label htmlFor="admin-certificates-signatory-name" className="text-xs text-[var(--ds-text-3)] block mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="admin-certificates-signatory-name"
              value={name}
              onChange={e => onNameChange(e.target.value)}
              placeholder="e.g. Aarav Mehta"
              className="h-9"
            />
          </div>
          <div>
            <label htmlFor="admin-certificates-signatory-title" className="text-xs text-[var(--ds-text-3)] block mb-1">
              Title
            </label>
            <Input
              id="admin-certificates-signatory-title"
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              placeholder="e.g. Club President"
              className="h-9"
            />
          </div>
          <div>
            <label htmlFor="admin-certificates-signatory-file" className="text-xs text-[var(--ds-text-3)] block mb-1">
              Signature Image <span className="text-[var(--ds-text-3)]">(optional, PNG/JPG)</span>
            </label>
            {editTarget?.signatureUrl && !uploadedUrl && !clearImg && (
              <div className="flex items-center gap-2 rounded border p-2 bg-[var(--surface-soft)] mb-2">
                <img
                  src={editTarget.signatureUrl}
                  alt="Current"
                  className="h-8 max-w-[100px] object-contain"
                  onError={e => { (e.target as HTMLImageElement).src = PIXEL_FALLBACK; }}
                />
                <button
                  type="button"
                  className="text-xs text-red-500 hover:text-red-700 ml-auto"
                  onClick={() => onClearImgChange(true)}
                >
                  Remove
                </button>
              </div>
            )}
            {clearImg && (
              <p className="text-xs text-amber-600 mb-2">
                Signature image will be removed on save.{' '}
                <button type="button" className="underline" onClick={() => onClearImgChange(false)}>
                  Undo
                </button>
              </p>
            )}
            {uploading ? (
              <div className="flex items-center gap-2 rounded border p-2 bg-[var(--surface-soft)]">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                <span className="text-xs text-[var(--ds-text-3)]">Uploading to Cloudinary…</span>
              </div>
            ) : uploadedUrl ? (
              <div className="flex items-center gap-2 rounded border p-2 bg-[var(--surface-soft)] overflow-hidden">
                <img src={uploadedUrl} alt="Preview" className="h-8 max-w-[80px] object-contain shrink-0" />
                <p className="text-xs text-[var(--ds-text-3)] truncate flex-1 min-w-0">{uploadedUrl.split('/').pop()}</p>
                <button
                  type="button"
                  className="text-xs text-red-500 shrink-0"
                  onClick={() => onUploadedUrlChange(null)}
                >
                  Remove
                </button>
              </div>
            ) : (
              <label
                htmlFor="admin-certificates-signatory-file"
                className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--ds-text-3)] hover:border-amber-400 hover:text-amber-600 transition-colors"
              >
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
                    onClearImgChange(false);
                    onUploadingChange(true);
                    try {
                      const url = await api.uploadImage(file, token!);
                      onUploadedUrlChange(url);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Upload failed');
                    } finally {
                      onUploadingChange(false);
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || uploading || !name.trim()}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            {editTarget ? 'Save Changes' : 'Add Signature'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useId } from 'react';
import { Loader2, ImageIcon, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export interface ActiveSignatory {
  id: string;
  name: string;
  title: string;
  signatureUrl: string | null;
}

interface SignatoryPickerProps {
  label: string;
  required?: boolean;
  token: string;
  signatories: ActiveSignatory[];
  selectedId: string;
  name: string;
  title: string;
  defaultTitle: string;
  imageUrl: string;
  onSelect: (id: string, name: string, title: string) => void;
  onImageUrlChange: (url: string) => void;
}

// Dropdown of saved signatories. Selecting one uses its stored signature image.
// "Custom" mode lets admin type a name/title and optionally upload a signature
// image — which is uploaded to Cloudinary on the spot and stored as a URL.
export function SignatoryPicker({
  label, required, token, signatories, selectedId, name, title, defaultTitle,
  imageUrl, onSelect, onImageUrlChange,
}: SignatoryPickerProps) {
  const pickerId = useId();
  const [uploading, setUploading] = useState(false);
  const selected = signatories.find((s) => s.id === selectedId);
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
    <div className="col-span-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3 space-y-3">
      <p className="text-sm font-semibold text-[var(--ds-text-2)]">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </p>

      <select
        id={`${pickerId}-select`}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        value={selectedId || '__custom__'}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__custom__') {
            onSelect('', '', '');
            onImageUrlChange('');
          } else {
            const sig = signatories.find((s) => s.id === val);
            if (sig) { onSelect(sig.id, sig.name, sig.title); onImageUrlChange(''); }
          }
        }}
      >
        <option value="__custom__">✏ Custom (type manually)</option>
        {signatories.map((s) => (
          <option key={s.id} value={s.id}>
            {s.signatureUrl ? '🖊 ' : ''}{s.name} — {s.title}
          </option>
        ))}
      </select>

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border-subtle)] bg-white p-2">
          <div>
            <p className="text-sm font-medium text-[var(--ds-text-1)]">{selected.name}</p>
            <p className="text-xs text-[var(--ds-text-3)]">{selected.title}</p>
          </div>
          {selected.signatureUrl ? (
            <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-2 py-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-green-600 shrink-0" />
              <span className="text-xs text-green-700 font-medium">Signature image</span>
              <img
                src={selected.signatureUrl}
                alt="Signature"
                className="h-8 max-w-[90px] object-contain opacity-80 ml-1"
                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2 py-1.5">
              <PenLine className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-xs text-[var(--warning)]">Cursive text fallback</span>
            </div>
          )}
        </div>
      )}

      {isCustom && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${pickerId}-name`} className="text-xs text-[var(--ds-text-3)] block mb-0.5">Name{required && ' *'}</label>
              <Input
                id={`${pickerId}-name`}
                value={name}
                onChange={(e) => onSelect('', e.target.value, title)}
                placeholder="e.g. Aarav Mehta"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label htmlFor={`${pickerId}-title`} className="text-xs text-[var(--ds-text-3)] block mb-0.5">Title</label>
              <Input
                id={`${pickerId}-title`}
                value={title}
                onChange={(e) => onSelect('', name, e.target.value)}
                placeholder={defaultTitle}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {imageUrl ? (
            <div className="flex items-center gap-3 rounded-md border border-green-200 bg-white p-2">
              <img src={imageUrl} alt="Signature preview" className="h-10 max-w-[120px] object-contain shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-green-700">Signature uploaded</p>
                <p className="text-xs text-[var(--ds-text-3)] truncate">{imageUrl.split('/').pop()}</p>
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
                ? 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-amber-600 cursor-not-allowed'
                : 'border-[var(--border-default)] bg-white text-[var(--ds-text-3)] hover:border-amber-400 hover:text-amber-600'
            }`}>
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin shrink-0" /><span>Uploading to Cloudinary…</span></>
              ) : (
                <><ImageIcon className="w-4 h-4 shrink-0" /><span>Upload signature image <span className="text-xs text-[var(--ds-text-3)]">(PNG/JPG — optional)</span></span></>
              )}
              <input id={`${pickerId}-signature-file`} type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleImageFile} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

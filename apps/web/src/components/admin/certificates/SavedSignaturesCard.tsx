import { Loader2, PenLine, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export interface SavedSignatoryRow {
  id: string;
  name: string;
  title: string;
  signatureUrl?: string | null;
  isActive: boolean;
  _count: { certificatesAsPrimary: number; certificatesAsFaculty: number };
}

interface SavedSignaturesCardProps {
  signatories: SavedSignatoryRow[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (signatory: SavedSignatoryRow) => void;
  onDelete: (signatory: SavedSignatoryRow) => void;
}

const PIXEL_FALLBACK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function SavedSignaturesCard({
  signatories,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: SavedSignaturesCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <PenLine className="w-4 h-4 text-amber-500" />
            Saved Signatures
            <span className="text-xs text-gray-400 font-normal ml-1">
              ({signatories.length} {signatories.length === 1 ? 'entry' : 'entries'})
            </span>
          </h2>
          <Button size="sm" onClick={onAdd} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white h-8">
            <Plus className="w-3.5 h-3.5" />
            Add Signature
          </Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          </div>
        ) : signatories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No saved signatures yet. Add one to make it available in all certificate forms.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {signatories.map(sig => {
              const certCount = sig._count.certificatesAsPrimary + sig._count.certificatesAsFaculty;
              return (
                <div key={sig.id} className="flex items-center gap-3 py-2.5">
                  {sig.signatureUrl ? (
                    <img
                      src={sig.signatureUrl}
                      alt={sig.name}
                      className="h-8 w-24 object-contain shrink-0 rounded border border-gray-100 bg-white"
                      onError={e => { (e.target as HTMLImageElement).src = PIXEL_FALLBACK; }}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700"
                      onClick={() => onEdit(sig)}
                      title="Edit"
                    >
                      <PenLine className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                      onClick={() => onDelete(sig)}
                      title="Delete"
                    >
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
  );
}

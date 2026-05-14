import { Image, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CollapsibleSection } from './CollapsibleSection';

interface EventGallerySectionProps {
  imageGallery: string[];
  onAdd: () => void;
  onUpdate: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  defaultOpen?: boolean;
}

export function EventGallerySection({
  imageGallery,
  onAdd,
  onUpdate,
  onRemove,
  defaultOpen,
}: EventGallerySectionProps) {
  const filledCount = imageGallery.filter(u => u.trim()).length;
  return (
    <CollapsibleSection
      title="Image Gallery"
      icon={<Image className="h-5 w-5 text-amber-600" />}
      badge={filledCount > 0 ? `${filledCount}` : undefined}
      defaultOpen={defaultOpen ?? imageGallery.length > 0}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Add Google Drive shareable links for event images</p>
        {imageGallery.map((url, index) => (
          <div key={index} className="flex gap-2">
            <Input
              placeholder="Google Drive image URL"
              value={url}
              onChange={(e) => onUpdate(index, e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={onAdd} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Image
        </Button>
      </div>
    </CollapsibleSection>
  );
}

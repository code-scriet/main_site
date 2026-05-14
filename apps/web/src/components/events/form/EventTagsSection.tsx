import { Plus, Tag, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CollapsibleSection } from './CollapsibleSection';

interface EventTagsSectionProps {
  tags: string[];
  newTag: string;
  onNewTagChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (index: number) => void;
  defaultOpen?: boolean;
}

export function EventTagsSection({
  tags,
  newTag,
  onNewTagChange,
  onAddTag,
  onRemoveTag,
  defaultOpen,
}: EventTagsSectionProps) {
  return (
    <CollapsibleSection
      title="Tags"
      icon={<Tag className="h-5 w-5 text-amber-600" />}
      badge={tags.length > 0 ? `${tags.length}` : undefined}
      defaultOpen={defaultOpen ?? tags.length > 0}
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Add a tag"
            value={newTag}
            onChange={(e) => onNewTagChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAddTag();
              }
            }}
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={onAddTag}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="px-3 py-1 gap-2">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => onRemoveTag(index)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

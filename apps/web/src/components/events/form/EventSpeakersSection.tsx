import { Plus, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Speaker } from '@/lib/api';
import { CollapsibleSection } from './CollapsibleSection';

interface EventSpeakersSectionProps {
  speakers: Speaker[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Speaker, value: string) => void;
  onRemove: (index: number) => void;
  defaultOpen?: boolean;
  rolePlaceholder?: string;
  imagePlaceholder?: string;
  bioPlaceholder?: string;
}

export function EventSpeakersSection({
  speakers,
  onAdd,
  onUpdate,
  onRemove,
  defaultOpen,
  rolePlaceholder = 'Role (e.g., Software Engineer at Google)',
  imagePlaceholder = 'Profile image URL (Google Drive or direct link)',
  bioPlaceholder = 'Short bio...',
}: EventSpeakersSectionProps) {
  return (
    <CollapsibleSection
      title="Speakers & Instructors"
      icon={<User className="h-5 w-5 text-amber-600" />}
      badge={speakers.length > 0 ? `${speakers.length}` : undefined}
      defaultOpen={defaultOpen ?? speakers.length > 0}
    >
      <div className="space-y-4">
        {speakers.map((speaker, index) => (
          <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">Speaker {index + 1}</span>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Name"
                value={speaker.name}
                onChange={(e) => onUpdate(index, 'name', e.target.value)}
              />
              <Input
                placeholder={rolePlaceholder}
                value={speaker.role}
                onChange={(e) => onUpdate(index, 'role', e.target.value)}
              />
            </div>
            <Input
              placeholder={imagePlaceholder}
              value={speaker.image || ''}
              onChange={(e) => onUpdate(index, 'image', e.target.value)}
            />
            <textarea
              placeholder={bioPlaceholder}
              value={speaker.bio || ''}
              onChange={(e) => onUpdate(index, 'bio', e.target.value)}
              className="w-full min-h-[60px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        ))}
        <Button type="button" variant="outline" onClick={onAdd} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Speaker
        </Button>
      </div>
    </CollapsibleSection>
  );
}

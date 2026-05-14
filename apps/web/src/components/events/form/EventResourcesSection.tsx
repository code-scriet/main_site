import { Link as LinkIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Resource } from '@/lib/api';
import { resourceTypes } from '@/lib/eventForm';
import { CollapsibleSection } from './CollapsibleSection';

interface EventResourcesSectionProps {
  resources: Resource[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Resource, value: string) => void;
  onRemove: (index: number) => void;
  defaultOpen?: boolean;
}

export function EventResourcesSection({
  resources,
  onAdd,
  onUpdate,
  onRemove,
  defaultOpen,
}: EventResourcesSectionProps) {
  return (
    <CollapsibleSection
      title="Resources & Materials"
      icon={<LinkIcon className="h-5 w-5 text-amber-600" />}
      badge={resources.length > 0 ? `${resources.length}` : undefined}
      defaultOpen={defaultOpen ?? resources.length > 0}
    >
      <div className="space-y-4">
        {resources.map((resource, index) => (
          <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">Resource {index + 1}</span>
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
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder="Title"
                value={resource.title}
                onChange={(e) => onUpdate(index, 'title', e.target.value)}
              />
              <Input
                placeholder="URL"
                value={resource.url}
                onChange={(e) => onUpdate(index, 'url', e.target.value)}
              />
              <select
                aria-label="Resource type"
                value={resource.type}
                onChange={(e) => onUpdate(index, 'type', e.target.value)}
                className="h-10 px-3 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {resourceTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={onAdd} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Resource
        </Button>
      </div>
    </CollapsibleSection>
  );
}

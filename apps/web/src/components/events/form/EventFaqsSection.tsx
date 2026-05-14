import { HelpCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FAQ } from '@/lib/api';
import { CollapsibleSection } from './CollapsibleSection';

interface EventFaqsSectionProps {
  faqs: FAQ[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof FAQ, value: string) => void;
  onRemove: (index: number) => void;
  defaultOpen?: boolean;
}

export function EventFaqsSection({
  faqs,
  onAdd,
  onUpdate,
  onRemove,
  defaultOpen,
}: EventFaqsSectionProps) {
  return (
    <CollapsibleSection
      title="FAQs"
      icon={<HelpCircle className="h-5 w-5 text-amber-600" />}
      badge={faqs.length > 0 ? `${faqs.length}` : undefined}
      defaultOpen={defaultOpen ?? faqs.length > 0}
    >
      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">FAQ {index + 1}</span>
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
            <Input
              placeholder="Question"
              value={faq.question}
              onChange={(e) => onUpdate(index, 'question', e.target.value)}
            />
            <textarea
              placeholder="Answer"
              value={faq.answer}
              onChange={(e) => onUpdate(index, 'answer', e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        ))}
        <Button type="button" variant="outline" onClick={onAdd} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add FAQ
        </Button>
      </div>
    </CollapsibleSection>
  );
}

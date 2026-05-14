import type { ReactNode } from 'react';
import { CollapsibleSection } from './CollapsibleSection';

interface EventTextareaSectionProps {
  /** Unique id prefix used to build label/textarea ids. */
  idPrefix: string;
  /** Shared name across both pages (e.g. "highlights", "agenda", "learningOutcomes"). */
  name: string;
  title: string;
  icon: ReactNode;
  value: string;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  label?: string;
  placeholder?: string;
  minHeight?: string;
  defaultOpen?: boolean;
}

/**
 * A collapsible section whose body is a single labelled textarea. Used for
 * Event Highlights, Agenda, and Learning Outcomes.
 */
export function EventTextareaSection({
  idPrefix,
  name,
  title,
  icon,
  value,
  onChange,
  label,
  placeholder,
  minHeight = '120px',
  defaultOpen,
}: EventTextareaSectionProps) {
  const inputId = `${idPrefix}-${name}`;
  return (
    <CollapsibleSection title={title} icon={icon} defaultOpen={defaultOpen}>
      <div className="space-y-2">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">{label}</label>
        )}
        <textarea
          id={inputId}
          name={name}
          aria-label={label ?? title}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{ minHeight }}
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
        />
      </div>
    </CollapsibleSection>
  );
}

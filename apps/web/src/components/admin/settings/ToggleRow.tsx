import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  compact?: boolean;
}

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  compact = false,
}: ToggleRowProps) {
  return (
    <div
      className={`flex items-center justify-between rounded-[8px] border border-[var(--border-default)] ${
        compact ? 'bg-[var(--bg-raised)] p-3' : 'bg-[var(--surface-soft)] p-4'
      }`}
    >
      <div className="pr-4">
        <Label htmlFor={id} className="font-medium text-[var(--ds-text-1)]">
          {label}
        </Label>
        <p
          className={`mt-1 ${compact ? 'text-[11.5px] text-[var(--ds-text-3)]' : 'text-[13px] text-[var(--ds-text-2)]'}`}
        >
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={compact ? 'scale-90' : ''}
      />
    </div>
  );
}

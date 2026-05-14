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
    <div className={`flex items-center justify-between rounded-lg border border-amber-100 ${compact ? 'bg-white p-3' : 'bg-amber-50 p-4'}`}>
      <div className="pr-4">
        <Label htmlFor={id} className="font-medium text-amber-900">
          {label}
        </Label>
        <p className={`mt-1 ${compact ? 'text-xs text-gray-400' : 'text-sm text-gray-500'}`}>{description}</p>
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

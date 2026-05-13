import type { ComponentType } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

export function StatTile({
  label,
  value,
  valueText,
  icon: Icon,
}: {
  label: string;
  value?: number;
  valueText?: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-gray-200 shadow-none">
      <CardContent className="flex items-center gap-3 pt-6">
        <div className="rounded-lg bg-amber-50 p-2">
          <Icon className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-950">
            {value !== undefined ? value : valueText}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm leading-6 text-gray-900">{value}</div>
    </div>
  );
}

export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <p className="text-xs leading-5 text-gray-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

// NumericPromptDialog — replacement for `window.prompt(label, defaultValue)` for numeric inputs.
// Used by AdminProblems (override score), AdminCompetition (raise cap), CompetitionJudge
// (override score), PendingCapRequestsTray (set cap). Keeps dashboard styling and inline
// range validation rather than browser-default chrome.

import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/dash';

interface NumericPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  confirmLabel?: string;
  /** Called with the validated numeric value when the user confirms. */
  onCommit: (value: number) => void;
  /** Optional pending flag (e.g. mutation in flight) to disable the confirm button. */
  pending?: boolean;
}

export function NumericPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label = 'Value',
  defaultValue,
  min,
  max,
  step = 1,
  confirmLabel = 'Save',
  onCommit,
  pending = false,
}: NumericPromptDialogProps) {
  const [raw, setRaw] = useState<string>(String(defaultValue));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the dialog opens with a new default.
  useEffect(() => {
    if (open) {
      setRaw(String(defaultValue));
      setError(null);
    }
  }, [open, defaultValue]);

  const submit = () => {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      setError('Enter a number');
      return;
    }
    if (parsed < min || parsed > max) {
      setError(`Must be between ${min} and ${max}`);
      return;
    }
    onCommit(parsed);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-dashboard="true"
        className="bg-[var(--bg-raised)] border-[var(--border-subtle)]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <Field label={label} hint={`Range ${min}–${max}`} required>
          <Input
            ref={inputRef}
            type="number"
            min={min}
            max={max}
            step={step}
            value={raw}
            onChange={(e) => { setRaw(e.target.value); if (error) setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          />
          {error && (
            <span className="text-[11.5px] text-[var(--danger)]">{error}</span>
          )}
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={submit} disabled={pending}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

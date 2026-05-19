import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEP_LABELS } from '@/lib/quizDrafts';

interface WizardStepperProps {
  step: number;
  onJumpBack: (step: number) => void;
}

export function WizardStepper({ step, onJumpBack }: WizardStepperProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 pt-6">
      <div className="flex items-center justify-center gap-0 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <button
              onClick={() => s < step && onJumpBack(s)}
              disabled={s > step}
              className="flex flex-col items-center gap-1"
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300',
                  step === s
                    ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-amber-300/40'
                    : step > s
                      ? 'bg-green-500 text-white'
                      : 'bg-[var(--warning-bg)] text-[var(--warning)]/40',
                )}
              >
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              <span
                className={cn(
                  'text-[10px] font-semibold',
                  step >= s ? 'text-[var(--warning)]' : 'text-[var(--warning)]/30',
                )}
              >
                {STEP_LABELS[s - 1]}
              </span>
            </button>
            {s < 3 && (
              <div
                className={cn(
                  'w-16 sm:w-24 h-0.5 mx-1 mt-[-12px] rounded-full transition-colors duration-300',
                  step > s ? 'bg-green-500' : 'bg-amber-200',
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-amber-400 text-amber-900 shadow',
        secondary:
          'border-transparent bg-amber-100 text-amber-900',
        destructive:
          'border-transparent bg-red-500 text-white shadow',
        outline: 'text-gray-800 border-amber-400',
        success: 'border-transparent bg-green-500 text-white shadow',
        warning: 'border-transparent bg-orange-500 text-white shadow',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow hover:from-orange-600 hover:to-amber-700 dark:from-red-500 dark:to-amber-500 dark:hover:from-red-400 dark:hover:to-amber-400',
        destructive:
          'bg-red-500 text-white shadow-sm hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500',
        outline:
          'border-2 border-amber-400 bg-transparent text-amber-900 hover:bg-amber-50 dark:border-zinc-700 dark:text-amber-100 dark:hover:bg-zinc-900',
        secondary:
          'bg-amber-100 text-amber-900 shadow-sm hover:bg-amber-200 dark:bg-zinc-900 dark:text-amber-100 dark:hover:bg-zinc-800',
        ghost: 'hover:bg-amber-50 hover:text-amber-900 dark:hover:bg-zinc-900 dark:hover:text-amber-100',
        link: 'text-amber-600 underline-offset-4 hover:underline dark:text-amber-300',
      },
      size: {
        default: 'h-11 px-5 py-2.5 text-sm',
        sm: 'h-10 rounded-md px-4 text-sm',
        lg: 'h-12 rounded-lg px-8 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const buttonClassName = cn(buttonVariants({ variant, size, className }));

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(child, {
        ...props,
        className: cn(buttonClassName, child.props.className),
      });
    }

    return (
      <button
        className={buttonClassName}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };

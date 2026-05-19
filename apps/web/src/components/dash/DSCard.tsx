import * as React from 'react';
import { cn } from '@/lib/utils';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  hover?: boolean;
  as?: React.ElementType;
}

export const DSCard = React.forwardRef<HTMLDivElement, Props>(function DSCard(
  { padded = true, hover = false, as: Tag = 'div', className, children, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(
        'rounded-[var(--radius-lg)] bg-[var(--bg-raised)] border border-[var(--border-subtle)] shadow-[var(--shadow-sm)] dark:card-edge',
        padded && 'p-[var(--sp-card)]',
        hover && 'transition-shadow hover:shadow-[var(--shadow-md)]',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
});

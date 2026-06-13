'use client';

import React from 'react';
import { cn } from '@/lib/cn';

type StarBorderProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> & {
  as?: T;
  className?: string;
  children?: React.ReactNode;
  color?: string;
  speed?: React.CSSProperties['animationDuration'];
  thickness?: number;
  variant?: 'primary' | 'secondary';
};

const StarBorder = <T extends React.ElementType = 'button'>({
  as,
  className = '',
  color = '#D4AF37',
  speed = '6s',
  thickness = 1,
  children,
  variant = 'primary',
  ...rest
}: StarBorderProps<T>) => {
  const Component = as || 'button';
  const innerClass =
    variant === 'secondary'
      ? 'bg-[var(--main-1)] border border-[var(--accent-muted)] text-[var(--accent)]'
      : 'bg-[var(--main-0)] border border-[var(--accent-muted)] text-[var(--accent)]';

  return (
    <Component
      className={cn('relative inline-block overflow-hidden rounded-xl', className)}
      {...(rest as object)}
      style={{ padding: `${thickness}px 0`, ...(rest as { style?: React.CSSProperties }).style }}
    >
      <div
        className="absolute bottom-[-11px] right-[-250%] z-0 h-[50%] w-[300%] rounded-full opacity-70 animate-star-movement-bottom"
        style={{ background: `radial-gradient(circle, ${color}, transparent 10%)`, animationDuration: speed }}
      />
      <div
        className="absolute left-[-250%] top-[-10px] z-0 h-[50%] w-[300%] rounded-full opacity-70 animate-star-movement-top"
        style={{ background: `radial-gradient(circle, ${color}, transparent 10%)`, animationDuration: speed }}
      />
      <div className={cn('relative z-10 rounded-xl px-6 py-3 text-center text-[15px] font-semibold', innerClass)}>
        {children}
      </div>
    </Component>
  );
};

export default StarBorder;

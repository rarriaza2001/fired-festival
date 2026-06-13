'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ThemedCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  headingExtra?: ReactNode;
}

export function ThemedCard({ children, className, title, headingExtra }: ThemedCardProps) {
  return (
    <div
      className={cn(
        'mb-4 rounded-xl border border-[var(--border)] bg-[var(--main-2)] p-5',
        className,
      )}
    >
      {title ? (
        <h2 className="card-heading">
          {title}
          {headingExtra}
        </h2>
      ) : null}
      {children}
    </div>
  );
}

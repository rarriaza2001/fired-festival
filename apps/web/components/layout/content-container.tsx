import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ContentContainerProps {
  children: ReactNode;
  className?: string;
}

export function ContentContainer({ children, className }: ContentContainerProps) {
  return (
    <div className={cn('mx-auto w-full max-w-[920px] px-5', className)}>{children}</div>
  );
}

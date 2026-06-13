'use client';

import type { ReactNode } from 'react';

interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="relative min-h-screen bg-[var(--main-0)]">
      <div className="relative z-10">{children}</div>
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface Position {
  x: number;
  y: number;
}

interface SpotlightCardProps extends React.PropsWithChildren {
  className?: string;
  spotlightColor?: string;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightColor = 'rgba(212, 175, 55, 0.18)',
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    const { width, height } = el.getBoundingClientRect();
    setPosition({ x: width / 2, y: height / 2 });
    setOpacity(0.45);

    const fadeOut = window.setTimeout(() => setOpacity(0), 700);
    return () => window.clearTimeout(fadeOut);
  }, []);

  return (
    <div
      ref={divRef}
      className={cn(
        'relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--main-2)] p-5',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700 ease-out"
        style={{
          opacity,
          background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default SpotlightCard;

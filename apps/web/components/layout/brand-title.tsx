'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { cn } from '@/lib/cn';
import ShinyText from '@/components/ui/ShinyText';

interface BrandTitleProps {
  size?: 'lg' | 'sm';
  centered?: boolean;
}

export function BrandTitle({ size = 'lg', centered = false }: BrandTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    const words = el.querySelectorAll('.brand-word');
    gsap.fromTo(
      words,
      { opacity: 0, y: 22 },
      { opacity: 1, y: 0, duration: 0.8, stagger: 0.14, ease: 'power3.out' },
    );
  }, []);

  return (
    <h1
      ref={ref}
      className={cn(
        'font-display font-extrabold tracking-tight text-[var(--text)]',
        size === 'lg' ? 'text-[2.75rem] leading-none md:text-[4rem]' : 'text-[1.5rem]',
        centered && 'text-center',
      )}
    >
      <span className="brand-word inline-block">Don&apos;t</span>{' '}
      <span className="brand-word inline-block">Go</span>{' '}
      <span className="brand-word inline-block">
        <ShinyText
          text="Blind"
          color="#4ADE80"
          shineColor="#D4AF37"
          speed={3}
          spread={100}
          className="font-display font-extrabold"
        />
      </span>
    </h1>
  );
}

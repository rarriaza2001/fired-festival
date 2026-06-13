'use client';

import { useRef, type ReactNode } from 'react';
import { motion, useInView } from 'motion/react';

interface StaggeredItemProps {
  children: ReactNode;
  index: number;
}

function StaggeredItem({ children, index }: StaggeredItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2, once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
    >
      {children}
    </motion.div>
  );
}

interface StaggeredListProps {
  children: ReactNode[];
}

export function StaggeredList({ children }: StaggeredListProps) {
  return (
    <div className="flex flex-col gap-0">
      {children.map((child, index) => (
        <StaggeredItem key={index} index={index}>
          {child}
        </StaggeredItem>
      ))}
    </div>
  );
}

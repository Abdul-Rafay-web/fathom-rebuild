'use client';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/** One place to set motion defaults: honour the OS "reduce motion" setting everywhere. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}>
      {children}
    </MotionConfig>
  );
}

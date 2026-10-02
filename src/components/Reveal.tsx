import type { ReactNode } from 'react';

// Staggered entrance in pure CSS (see .reveal-group in globals.css): content is
// visible from the first server-rendered paint, with or without JavaScript.
// Transform/opacity only; the global reduced-motion rule disables it.

export function Reveal({ children, className = '', as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'ul' }) {
  const C = as;
  return <C className={`reveal-group ${className}`}>{children}</C>;
}

export function RevealItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' }) {
  const C = as;
  return <C className={className}>{children}</C>;
}

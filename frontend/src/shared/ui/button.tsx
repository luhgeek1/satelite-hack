'use client';

import * as React from 'react';
import { cn } from '@/shared/lib';

type Variant = 'solid' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  solid: 'border border-zinc-600 text-zinc-100 hover:bg-zinc-100 hover:text-black focus-visible:border-zinc-300',
  outline: 'border border-rule-strong text-zinc-400 hover:border-zinc-600 hover:text-zinc-100 focus-visible:border-zinc-400',
  ghost: 'text-zinc-400 hover:text-zinc-100 focus-visible:text-zinc-100',
  danger: 'border border-alarm/40 bg-alarm/10 text-alarm hover:bg-alarm/20 focus-visible:border-alarm',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[12px]',
  md: 'h-10 px-3 text-[13px]',
  lg: 'h-11 px-6 text-[14px]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'outline', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-label transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = 'Button';

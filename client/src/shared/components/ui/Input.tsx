import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  icon,
  className,
  ...props
}, ref) => {
  return (
    <div className="space-y-1 w-full text-left">
      {label && <label className="text-xs font-bold text-on-surface">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-outline flex items-center pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={twMerge(
            clsx(
              'w-full bg-surface-container-low border border-outline-variant rounded-xl py-2.5 text-xs text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all',
              icon ? 'pl-10 pr-4' : 'px-4',
              error && 'border-red-500 focus:ring-red-200',
              className
            )
          )}
          {...props}
        />
      </div>
      {error && <p className="text-[11px] font-semibold text-red-600 mt-0.5">{error}</p>}
    </div>
  );
});

Input.displayName = 'Input';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'outline';
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
  ...props
}) => {
  const variants = {
    default: 'bg-white border border-outline-variant shadow-sm rounded-3xl p-6',
    glass: 'glass-card rounded-3xl p-6 shadow-md',
    outline: 'bg-transparent border border-outline-variant rounded-3xl p-6'
  };

  return (
    <div className={twMerge(clsx(variants[variant], className))} {...props}>
      {children}
    </div>
  );
};

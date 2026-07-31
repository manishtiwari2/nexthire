import React from 'react';
import { cn } from '../../lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/** Underline tab bar used across the problem/leaderboard panels. */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  className,
  size = 'md',
}: TabsProps<T>) {
  return (
    <div role="tablist" className={cn('flex items-center gap-1 overflow-x-auto', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'group relative flex items-center gap-1.5 whitespace-nowrap border-b-2 font-semibold transition-colors',
              size === 'sm' ? 'px-3 py-2.5 text-xs' : 'px-3.5 py-3 text-sm',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            )}
          >
            {item.icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>}
            {item.label}
            {typeof item.count === 'number' && (
              <span
                className={cn(
                  'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                  active ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

import React from 'react';
import { cn } from '../../lib/cn';

/** Card-wrapped, horizontally scrollable table container. */
export const TableContainer: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div
    className={cn('overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elev-1', className)}
    {...props}
  >
    <div className="overflow-x-auto">{children}</div>
  </div>
);

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, ...props }) => (
  <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
);

export const THead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, ...props }) => (
  <thead
    className={cn(
      'border-b border-outline-variant bg-surface-container-low text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant',
      className
    )}
    {...props}
  />
);

export const TBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, ...props }) => (
  <tbody className={cn('divide-y divide-outline-variant', className)} {...props} />
);

export const TR: React.FC<React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }> = ({
  className,
  interactive,
  ...props
}) => (
  <tr
    className={cn(interactive && 'transition-colors hover:bg-surface-container-high/60', className)}
    {...props}
  />
);

export const TH: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, ...props }) => (
  <th className={cn('px-4 py-3 font-semibold', className)} {...props} />
);

export const TD: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, ...props }) => (
  <td className={cn('px-4 py-3 align-middle text-on-surface-variant', className)} {...props} />
);

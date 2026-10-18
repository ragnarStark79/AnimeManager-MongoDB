import React, { useId, useRef } from 'react';
import './SortControl.css';

export interface SortOption<T extends string = string> {
  value: T;
  label: string;
}

interface SortControlProps<T extends string = string> {
  options: SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}

export function SortControl<T extends string = string>({
  options,
  value,
  onChange,
  label = 'Sort by',
  className = '',
}: SortControlProps<T>) {
  const id = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const currentLabel = options.find((o) => o.value === value)?.label ?? label;

  return (
    <div className={['sort-control', className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className="sort-control-label sr-only">
        {label}
      </label>
      <div className="sort-control-trigger" aria-hidden="true" aria-label={`Sort: ${currentLabel}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18M7 12h10M11 18h2" />
        </svg>
        <span className="sort-control-value">{currentLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <select
        ref={selectRef}
        id={id}
        className="sort-control-select"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

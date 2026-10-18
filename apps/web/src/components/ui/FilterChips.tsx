import React from 'react';
import './FilterChips.css';

export interface FilterChipOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface FilterChipsProps<T extends string = string> {
  options: FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}

export function FilterChips<T extends string = string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: FilterChipsProps<T>) {
  return (
    <div
      className={['filter-chips', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={label ?? 'Filter options'}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={['filter-chip', isActive ? 'filter-chip--active' : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && (
              <span className="filter-chip-icon" aria-hidden="true">
                {opt.icon}
              </span>
            )}
            <span className="filter-chip-label">{opt.label}</span>
            {opt.count !== undefined && (
              <span className="filter-chip-count" aria-label={`${opt.count} items`}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

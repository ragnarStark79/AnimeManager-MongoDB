import React from 'react';
import './Badge.css';

type BadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'anime'
  | 'manga'
  | 'manhwa';

type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = 'default',
  size = 'md',
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={['badge', `badge--${variant}`, `badge--${size}`, className].filter(Boolean).join(' ')}
    >
      {children}
    </span>
  );
}

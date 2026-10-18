import React from 'react';
import './GlassCard.css';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: React.ElementType;
  'aria-label'?: string;
}

export function GlassCard({
  children,
  className = '',
  style,
  onClick,
  interactive = false,
  padding = 'md',
  as: Tag = 'div',
  'aria-label': ariaLabel,
}: GlassCardProps) {
  const isInteractive = interactive || !!onClick;

  return (
    <Tag
      style={style}
      className={[
        'glass-card-component',
        `glass-card-component--pad-${padding}`,
        isInteractive ? 'glass-card-component--interactive glass-card' : 'glass-card',
        className,
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={ariaLabel}
      onKeyDown={
        isInteractive && onClick
          ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }
          : undefined
      }
    >
      {children}
    </Tag>
  );
}

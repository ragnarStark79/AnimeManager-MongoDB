import React from 'react';
import { BookOpen } from 'lucide-react';
import './EmptyState.css';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
}: EmptyStateProps) {
  return (
    <div className={`empty-state empty-state--${size}`} role="status">
      <div className="empty-state-icon" aria-hidden="true">
        {icon ?? <BookOpen size={size === 'sm' ? 24 : 36} strokeWidth={1.5} />}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && (
        <p className="empty-state-description">{description}</p>
      )}
      {action && (
        <div className="empty-state-action">{action}</div>
      )}
    </div>
  );
}

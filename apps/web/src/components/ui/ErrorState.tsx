import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import './ErrorState.css';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'An unexpected error occurred while loading content. Please try again.',
  onRetry,
  retryLabel = 'Try Again',
  size = 'md',
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={['error-state', `error-state--${size}`, className].filter(Boolean).join(' ')}
      role="alert"
    >
      <div className="error-state-icon" aria-hidden="true">
        <AlertCircle size={size === 'sm' ? 24 : 36} strokeWidth={1.5} />
      </div>
      <h3 className="error-state-title">{title}</h3>
      {message && <p className="error-state-message">{message}</p>}
      {onRetry && (
        <div className="error-state-action">
          <Button
            variant="secondary"
            size={size === 'sm' ? 'sm' : 'md'}
            onClick={onRetry}
            iconLeft={<RotateCcw size={14} />}
          >
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

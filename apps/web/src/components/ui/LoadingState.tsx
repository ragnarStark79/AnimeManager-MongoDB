import React from 'react';
import './LoadingState.css';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingState({
  message = 'Loading your library…',
  size = 'md',
  className = '',
}: LoadingStateProps) {
  return (
    <div
      className={['loading-state', `loading-state--${size}`, className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
    >
      <div className="loading-state-spinner" aria-hidden="true">
        <div className="loading-state-ring" />
        <div className="loading-state-orb" />
      </div>
      <p className="loading-state-text">{message}</p>
    </div>
  );
}

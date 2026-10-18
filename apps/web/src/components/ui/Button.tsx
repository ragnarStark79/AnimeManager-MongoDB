import React from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize    = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  iconLeft,
  iconRight,
  fullWidth = false,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-busy={loading}
      className={[
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        fullWidth ? 'btn--full' : '',
        loading ? 'btn--loading' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {loading && (
        <span className="btn-spinner" aria-hidden="true" />
      )}
      {!loading && iconLeft && (
        <span className="btn-icon" aria-hidden="true">{iconLeft}</span>
      )}
      {children && <span className="btn-text">{children}</span>}
      {!loading && iconRight && (
        <span className="btn-icon" aria-hidden="true">{iconRight}</span>
      )}
    </button>
  );
}

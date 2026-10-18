import React, { forwardRef } from 'react';
import './Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    hint,
    iconLeft,
    iconRight,
    fullWidth = false,
    id,
    className = '',
    ...props
  },
  ref,
) {
  const inputId = id ?? `input-${Math.random().toString(36).slice(2, 8)}`;
  const errorId = `${inputId}-error`;
  const hintId  = `${inputId}-hint`;

  return (
    <div className={['input-group', fullWidth ? 'input-group--full' : '', className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
        </label>
      )}
      <div className={['input-wrapper', error ? 'input-wrapper--error' : ''].filter(Boolean).join(' ')}>
        {iconLeft && (
          <span className="input-icon input-icon--left" aria-hidden="true">{iconLeft}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={['input', iconLeft ? 'input--icon-left' : '', iconRight ? 'input--icon-right' : ''].filter(Boolean).join(' ')}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined}
          {...props}
        />
        {iconRight && (
          <span className="input-icon input-icon--right" aria-hidden="true">{iconRight}</span>
        )}
      </div>
      {error && (
        <span id={errorId} className="input-error" role="alert">{error}</span>
      )}
      {hint && !error && (
        <span id={hintId} className="input-hint">{hint}</span>
      )}
    </div>
  );
});

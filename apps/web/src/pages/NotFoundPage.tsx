import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import './Placeholder.css';

export function NotFoundPage() {
  return (
    <div className="not-found-page">
      <div className="not-found-icon" aria-hidden="true">
        <AlertTriangle size={40} strokeWidth={1.5} />
      </div>
      <h1 className="not-found-code">404</h1>
      <h2 className="not-found-title">Page Not Found</h2>
      <p className="not-found-desc">
        The page you were looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="btn btn--primary btn--md">
        Back to Dashboard
      </Link>
    </div>
  );
}

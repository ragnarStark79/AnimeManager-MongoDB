import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Shield, Mail, Lock, AlertCircle, ArrowRight, UserPlus } from 'lucide-react';
import { GlassCard, Button, Input } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import './LoginPage.css';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const destination = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  // If already authenticated, redirect to appropriate destination based on role
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (user.role === 'root_admin') {
        navigate('/administrator', { replace: true });
      } else if (user.role === 'superadmin') {
        navigate('/superadmin', { replace: true });
      } else {
        navigate(destination, { replace: true });
      }
    }
  }, [isLoading, isAuthenticated, user, navigate, destination]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await login({ email: trimmedEmail, password });
      if (ok) {
        // Will be redirected by useEffect once user state updates
      } else {
        setErrorMessage('Invalid email or password. Please verify your credentials.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="login-loading-screen">
        <div className="login-spinner" />
      </div>
    );
  }

  return (
    <div className="login-page">
      {/* Decorative ambient background orbs */}
      <div className="ambience-orbs" aria-hidden="true">
        <div className="ambience-orb ambience-orb-1" />
        <div className="ambience-orb ambience-orb-2" />
        <div className="ambience-orb ambience-orb-3" />
      </div>

      <div className="login-container animate-fade-up">
        {/* Brand header */}
        <div className="login-brand">
          <div className="login-logo-mark" aria-hidden="true">
            <Shield size={22} className="login-logo-icon" />
          </div>
          <h1 className="login-brand-title">AnimeManager</h1>
          <p className="login-brand-subtitle">Account Sign In</p>
        </div>

        {/* Login form card */}
        <GlassCard className="login-card" padding="lg">
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {errorMessage && (
              <div className="login-error-banner" role="alert">
                <AlertCircle size={16} className="login-error-icon" aria-hidden="true" />
                <span className="login-error-text">{errorMessage}</span>
              </div>
            )}

            <div className="login-fields">
              <Input
                id="user-email"
                label="Email Address"
                type="email"
                autoComplete="email"
                required
                fullWidth
                iconLeft={<Mail size={16} />}
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />

              <Input
                id="user-password"
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                fullWidth
                iconLeft={<Lock size={16} />}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={isSubmitting}
              iconRight={!isSubmitting ? <ArrowRight size={16} /> : undefined}
              className="login-submit-button"
            >
              Sign In
            </Button>
          </form>

          <div className="login-divider" />

          {/* Registration link for ordinary users */}
          <div className="login-register-prompt">
            <span className="login-register-text">Don't have an account?</span>
            <Link to="/register" className="login-register-link">
              <UserPlus size={15} style={{ marginRight: '6px' }} />
              Create an Account
            </Link>
          </div>
        </GlassCard>

        {/* Security footer disclaimer */}
        <p className="login-footer-disclaimer">
          Secure personal media library & administration.
        </p>
      </div>
    </div>
  );
}


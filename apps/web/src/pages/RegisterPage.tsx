import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, User, Mail, Lock, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { GlassCard, Button, Input } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import './RegisterPage.css';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, isAuthenticated, isLoading } = useAuth();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // If already authenticated, redirect to root
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedDisplayName = displayName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedUsername) {
      setErrorMessage('Please enter a username.');
      return;
    }
    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      setErrorMessage('Username must be between 3 and 30 characters.');
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(trimmedUsername)) {
      setErrorMessage('Username may only contain letters, numbers, underscores, and hyphens.');
      return;
    }

    if (!trimmedDisplayName) {
      setErrorMessage('Please enter your full name or display name.');
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await register({
        username: trimmedUsername,
        displayName: trimmedDisplayName,
        email: trimmedEmail,
        password,
        confirmPassword,
      });

      if (ok) {
        setSuccessMessage('Account created successfully! Redirecting to your personal library...');
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 1200);
      } else {
        setErrorMessage('Registration failed. Please check your information and try again.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="register-loading-screen">
        <div className="register-spinner" />
      </div>
    );
  }

  return (
    <div className="register-page">
      {/* Decorative ambient background orbs */}
      <div className="ambience-orbs" aria-hidden="true">
        <div className="ambience-orb ambience-orb-1" />
        <div className="ambience-orb ambience-orb-2" />
        <div className="ambience-orb ambience-orb-3" />
      </div>

      <div className="register-container animate-fade-up">
        {/* Brand header */}
        <div className="register-brand">
          <div className="register-logo-mark" aria-hidden="true">
            <UserPlus size={22} className="register-logo-icon" />
          </div>
          <h1 className="register-brand-title">Create Account</h1>
          <p className="register-brand-subtitle">Start organizing your personal anime & manga library</p>
        </div>

        {/* Register card */}
        <GlassCard className="register-card" padding="lg">
          <form className="register-form" onSubmit={handleSubmit} noValidate>
            {errorMessage && (
              <div className="register-error-banner" role="alert">
                <AlertCircle size={16} className="register-error-icon" aria-hidden="true" />
                <span className="register-error-text">{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="register-success-banner" role="status">
                <CheckCircle2 size={16} className="register-success-icon" aria-hidden="true" />
                <span className="register-success-text">{successMessage}</span>
              </div>
            )}

            <div className="register-fields">
              <Input
                id="reg-username"
                label="Username"
                type="text"
                autoComplete="username"
                required
                fullWidth
                iconLeft={<User size={16} />}
                placeholder="otaku_collector"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
              />

              <Input
                id="reg-fullname"
                label="Full Name / Display Name"
                type="text"
                autoComplete="name"
                required
                fullWidth
                iconLeft={<User size={16} />}
                placeholder="Spike Spiegel"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isSubmitting}
              />

              <Input
                id="reg-email"
                label="Email Address"
                type="email"
                autoComplete="email"
                required
                fullWidth
                iconLeft={<Mail size={16} />}
                placeholder="spike@bebop.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />

              <Input
                id="reg-password"
                label="Password (min 8 characters)"
                type="password"
                autoComplete="new-password"
                required
                fullWidth
                iconLeft={<Lock size={16} />}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />

              <Input
                id="reg-confirm-password"
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
                required
                fullWidth
                iconLeft={<Lock size={16} />}
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              className="register-submit-button"
            >
              Create Account
            </Button>
          </form>

          <div className="register-divider" />

          {/* Login prompt */}
          <div className="register-login-prompt">
            <span className="register-login-text">Already have an account?</span>
            <Link to="/login" className="register-login-link">
              Sign In
            </Link>
          </div>
        </GlassCard>

        {/* Security footer disclaimer */}
        <p className="register-footer-disclaimer">
          Your personal library is fully private and isolated to your account.
        </p>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Shield,
  Mail,
  Lock,
  AlertCircle,
  ArrowRight,
  UserPlus,
  Smartphone,
  Key,
  ArrowLeft,
} from 'lucide-react';
import { GlassCard, Button, Input } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import './LoginPage.css';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, completeMfaChallenge, user, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Two-Step Verification State
  const [isMfaStep, setIsMfaStep] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

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
      const res = await login({ email: trimmedEmail, password });
      if (res.success && res.mfaRequired && res.challengeToken) {
        setChallengeToken(res.challengeToken);
        setIsMfaStep(true);
        setMfaCode('');
        setErrorMessage(null);
      } else if (res.success) {
        // Will be redirected by useEffect once user state updates
      } else {
        setErrorMessage(res.error || 'Invalid email or password. Please verify your credentials.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCode = mfaCode.trim().replace(/\s+/g, '');
    if (!cleanCode) {
      setErrorMessage(
        isRecoveryMode
          ? 'Please enter an emergency recovery code.'
          : 'Please enter the 6-digit authenticator code.'
      );
      return;
    }

    if (!isRecoveryMode && cleanCode.length !== 6) {
      setErrorMessage('Authenticator code must be exactly 6 digits.');
      return;
    }

    setIsSubmitting(true);
    try {
      await completeMfaChallenge(challengeToken, cleanCode);
      // Redirect will be handled by useEffect upon user state update
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Two-step verification failed. Please verify your code and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelMfa = () => {
    setIsMfaStep(false);
    setChallengeToken('');
    setMfaCode('');
    setErrorMessage(null);
    setIsRecoveryMode(false);
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
            {isMfaStep ? (
              isRecoveryMode ? (
                <Key size={22} className="login-logo-icon" />
              ) : (
                <Smartphone size={22} className="login-logo-icon" />
              )
            ) : (
              <Shield size={22} className="login-logo-icon" />
            )}
          </div>
          <h1 className="login-brand-title">AnimeManager</h1>
          <p className="login-brand-subtitle">
            {isMfaStep
              ? isRecoveryMode
                ? 'Emergency Recovery Verification'
                : 'Two-Step Verification'
              : 'Account Sign In'}
          </p>
        </div>

        {/* Login form card */}
        <GlassCard className="login-card" padding="lg">
          {errorMessage && (
            <div className="login-error-banner" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
              <AlertCircle size={16} className="login-error-icon" aria-hidden="true" />
              <span className="login-error-text">{errorMessage}</span>
            </div>
          )}

          {!isMfaStep ? (
            <form className="login-form" onSubmit={handleSubmit} noValidate>
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
          ) : (
            <form className="login-form" onSubmit={handleMfaSubmit} noValidate>
              <p
                style={{
                  fontSize: 'var(--font-size-xs, 13px)',
                  color: 'var(--color-text-secondary, #94a3b8)',
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {isRecoveryMode
                  ? 'Enter one of your 10-character emergency backup recovery codes (e.g. A1B2C-D3E4F). Each code can only be used once.'
                  : 'Enter the 6-digit verification code from your authenticator app (Google Authenticator, Microsoft Authenticator, 2FAS, etc.).'}
              </p>

              <div className="login-fields" style={{ marginTop: 'var(--space-2)' }}>
                <Input
                  id="mfa-verification-code"
                  label={isRecoveryMode ? 'Emergency Recovery Code' : '6-Digit Authenticator Code'}
                  type="text"
                  inputMode={isRecoveryMode ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  required
                  fullWidth
                  autoFocus
                  maxLength={isRecoveryMode ? 11 : 6}
                  iconLeft={isRecoveryMode ? <Key size={16} /> : <Smartphone size={16} />}
                  placeholder={isRecoveryMode ? 'XXXXX-XXXXX' : '000000'}
                  value={mfaCode}
                  onChange={(e) => {
                    const val = isRecoveryMode ? e.target.value.toUpperCase() : e.target.value;
                    setMfaCode(val);
                  }}
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
                Verify & Continue
              </Button>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  marginTop: 'var(--space-2)',
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    setIsRecoveryMode(!isRecoveryMode);
                    setMfaCode('');
                    setErrorMessage(null);
                  }}
                >
                  {isRecoveryMode
                    ? 'Use Authenticator App Code'
                    : 'Use an Emergency Recovery Code'}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  iconLeft={<ArrowLeft size={14} />}
                  onClick={handleCancelMfa}
                >
                  Cancel & Back to Sign In
                </Button>
              </div>
            </form>
          )}

          {!isMfaStep && (
            <>
              <div className="login-divider" />
              {/* Registration link for ordinary users */}
              <div className="login-register-prompt">
                <span className="login-register-text">Don't have an account?</span>
                <Link to="/register" className="login-register-link">
                  <UserPlus size={15} style={{ marginRight: '6px' }} />
                  Create an Account
                </Link>
              </div>
            </>
          )}
        </GlassCard>

        {/* Security footer disclaimer */}
        <p className="login-footer-disclaimer">
          Secure personal media library & administration.
        </p>
      </div>
    </div>
  );
}


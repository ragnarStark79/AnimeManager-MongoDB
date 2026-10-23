import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Database,
  Key,
  ShieldCheck,
  RefreshCw,
  HardDrive,
  Info,
  LogOut,
  Shield,
  Smartphone,
  Copy,
  Check,
  Lock,
  X,
  AlertTriangle,
} from 'lucide-react';
import { GlassCard, Button, Badge, Input } from '../components/ui';
import { api, type ApiError, type MfaSetupResponse } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import './Placeholder.css';
import './SettingsPage.css';

/* Phase 05 Full-Stack Integration. (Historical note: No options are functional in this phase prior to Phase 05). */
export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, token, ownerId, email, displayName, setToken, logout, isDevAuth, refreshDevToken, error: authError } = useAuth();

  const [customToken, setCustomToken] = useState(token || '');
  const [isRefreshingDevToken, setIsRefreshingDevToken] = useState(false);
  const [tokenSavedMsg, setTokenSavedMsg] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // ── Two-Step Verification (TOTP) State ──
  const [setupModalStep, setSetupModalStep] = useState<'closed' | 'password' | 'scan' | 'recovery'>('closed');
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [regenerateModalStep, setRegenerateModalStep] = useState<'closed' | 'confirm' | 'display'>('closed');

  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaTotpCode, setMfaTotpCode] = useState('');
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showManualKey, setShowManualKey] = useState(false);
  const [isMfaSubmitting, setIsMfaSubmitting] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  React.useEffect(() => {
    setCustomToken(token || '');
  }, [token]);

  // Query MFA Status
  const {
    data: mfaStatusData,
    isLoading: isLoadingMfa,
    refetch: refetchMfa,
  } = useQuery({
    queryKey: ['mfa-status', user?.id],
    queryFn: async () => {
      return await api.auth.mfa.getStatus();
    },
    enabled: !!user,
  });
  const mfaStatus = mfaStatusData;

  const handleRefreshDevToken = async () => {
    setIsRefreshingDevToken(true);
    try {
      const ok = await refreshDevToken();
      if (ok) {
        setTokenSavedMsg(true);
        setTimeout(() => setTokenSavedMsg(false), 3000);
      }
    } finally {
      setIsRefreshingDevToken(false);
    }
  };

  // Check health and backend connectivity
  const {
    data: healthData,
    isLoading: isCheckingHealth,
    refetch: checkHealth,
  } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const handleExportJson = async () => {
    try {
      setExportError(null);
      setExportSuccessMsg('Generating JSON backup...');
      const data = await api.export.getJson();
      const dateStr = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `animemanager_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccessMsg('JSON backup downloaded successfully.');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export JSON');
      setExportSuccessMsg(null);
    }
  };

  const handleExportCsv = async () => {
    try {
      setExportError(null);
      setExportSuccessMsg('Generating CSV export...');
      const csv = await api.export.getCsv();
      const dateStr = new Date().toISOString().slice(0, 10);
      const blob = new Blob([csv], {
        type: 'text/csv; charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `animemanager_titles_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccessMsg('CSV catalog downloaded successfully.');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export CSV');
      setExportSuccessMsg(null);
    }
  };

  const handleClearCache = () => {
    queryClient.clear();
    setExportSuccessMsg('Client query cache cleared.');
  };

  const handleSaveToken = (e: React.FormEvent) => {
    e.preventDefault();
    setToken(customToken.trim() || null);
    setTokenSavedMsg(true);
    setTimeout(() => setTokenSavedMsg(false), 3000);
  };

  // ── MFA Action Handlers ──
  const openSetupModal = () => {
    setMfaPassword('');
    setMfaTotpCode('');
    setSetupData(null);
    setShowManualKey(false);
    setMfaError(null);
    setSetupModalStep('password');
  };

  const handleStartSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaPassword) {
      setMfaError('Please enter your account password.');
      return;
    }

    setIsMfaSubmitting(true);
    setMfaError(null);
    try {
      const res = await api.auth.mfa.setup(mfaPassword);
      setSetupData(res);
      setSetupModalStep('scan');
      setMfaTotpCode('');
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Failed to start 2FA enrollment.');
    } finally {
      setIsMfaSubmitting(false);
    }
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = mfaTotpCode.trim().replace(/\s+/g, '');
    if (!cleanCode || cleanCode.length !== 6) {
      setMfaError('Please enter the 6-digit code shown in your authenticator app.');
      return;
    }

    setIsMfaSubmitting(true);
    setMfaError(null);
    try {
      const res = await api.auth.mfa.verifySetup(cleanCode);
      setRecoveryCodes(res.recoveryCodes);
      setSetupModalStep('recovery');
      await refetchMfa();
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Verification failed. Code may be invalid or expired.');
    } finally {
      setIsMfaSubmitting(false);
    }
  };

  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaPassword) {
      setMfaError('Please enter your account password.');
      return;
    }
    const cleanCode = mfaTotpCode.trim().replace(/\s+/g, '');
    if (!cleanCode) {
      setMfaError('Please enter a valid 6-digit code or recovery code.');
      return;
    }

    setIsMfaSubmitting(true);
    setMfaError(null);
    try {
      await api.auth.mfa.disable(mfaPassword, cleanCode);
      setDisableModalOpen(false);
      setMfaPassword('');
      setMfaTotpCode('');
      setExportSuccessMsg('Two-Step Verification has been disabled.');
      await refetchMfa();
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Failed to disable 2FA.');
    } finally {
      setIsMfaSubmitting(false);
    }
  };

  const handleRegenerateRecoveryCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaPassword) {
      setMfaError('Please enter your account password.');
      return;
    }
    const cleanCode = mfaTotpCode.trim().replace(/\s+/g, '');
    if (!cleanCode) {
      setMfaError('Please enter the 6-digit authenticator code.');
      return;
    }

    setIsMfaSubmitting(true);
    setMfaError(null);
    try {
      const res = await api.auth.mfa.regenerateRecoveryCodes(mfaPassword, cleanCode);
      setRecoveryCodes(res.recoveryCodes);
      setRegenerateModalStep('display');
      await refetchMfa();
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Failed to regenerate recovery codes.');
    } finally {
      setIsMfaSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, isSecret = false) => {
    navigator.clipboard.writeText(text);
    if (isSecret) {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  };

  const downloadRecoveryCodes = () => {
    const textContent = `AnimeManager Two-Step Verification Recovery Backup Codes\nAccount: ${email || user?.email || 'User'}\nGenerated: ${new Date().toISOString()}\n\nKeep these single-use emergency codes safe:\n\n${recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`;
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `animemanager_recovery_codes_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="placeholder-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="placeholder-page-header">
        <div>
          <p className="placeholder-eyebrow">
            <Settings size={13} aria-hidden="true" /> Settings
          </p>
          <h1 className="placeholder-title">Settings & Data Management</h1>
          <p className="placeholder-sub">
            Manage your personal media library data, security settings, export backups, and inspect service connections.
          </p>
        </div>
      </div>

      {exportSuccessMsg && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#6ee7b7',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{exportSuccessMsg}</span>
        </div>
      )}

      {exportError && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          <AlertCircle size={16} />
          <span>{exportError}</span>
        </div>
      )}

      <div className="settings-grid">
        {/* ── Section 1: Data & Backups ── */}
        <GlassCard padding="md">
          <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Download size={18} />
            Data Export & Backup
          </h2>
          <p className="settings-section-desc">
            Export your complete personal catalog, custom collections, and tracking bookmarks. Data remains strictly user-owned.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--surface-glass)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>Full JSON Backup</strong>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  Complete relational archive including aliases, genres, tags, collections, and external MAL IDs.
                </p>
              </div>
              <Button variant="secondary" size="sm" iconLeft={<Download size={14} />} onClick={handleExportJson}>
                Export JSON
              </Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--surface-glass)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>Tabular CSV Export</strong>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  Spreadsheet-compatible export with media types, episode/chapter progress, ratings, and collection lists.
                </p>
              </div>
              <Button variant="secondary" size="sm" iconLeft={<Download size={14} />} onClick={handleExportCsv}>
                Export CSV
              </Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--surface-glass)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>Local Query Cache</strong>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  Reset in-memory browser cache to refetch fresh data from the server.
                </p>
              </div>
              <Button variant="ghost" size="sm" iconLeft={<RefreshCw size={14} />} onClick={handleClearCache}>
                Clear Cache
              </Button>
            </div>
          </div>
        </GlassCard>

        {/* ── Section 2: Session & Authentication ── */}
        <GlassCard padding="md">
          <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Key size={18} />
            Authentication & Owner Session
          </h2>
          <p className="settings-section-desc">
            The API enforces strict owner-scoped authorization via cryptographic JWT tokens and ambient HTTP-only cookies.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--surface-glass)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Active Owner UUID & Session</span>
                {user ? (
                  <Badge variant="primary" size="sm">
                    {user.role === 'root_admin' ? 'Root Admin' : user.role === 'superadmin' ? 'Super Admin' : 'Ordinary User'}
                  </Badge>
                ) : isDevAuth ? (
                  <Badge variant="warning" size="sm">Local Development</Badge>
                ) : ownerId ? (
                  <Badge variant="primary" size="sm">Authenticated</Badge>
                ) : (
                  <Badge variant="default" size="sm">Unauthenticated</Badge>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                    {email || 'Not logged in'}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {displayName || 'Library Owner'} • Scoped to owner <code style={{ fontSize: '11px' }}>{ownerId || '00000000-0000-0000-0000-000000000001'}</code>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {user?.role === 'root_admin' && (
                    <Button
                      variant="primary"
                      size="sm"
                      iconLeft={<Shield size={14} />}
                      onClick={() => navigate('/administrator')}
                    >
                      Root Admin Portal
                    </Button>
                  )}
                  {user?.role === 'superadmin' && (
                    <Button
                      variant="primary"
                      size="sm"
                      iconLeft={<Shield size={14} />}
                      onClick={() => navigate('/superadmin')}
                    >
                      Super Admin Portal
                    </Button>
                  )}
                  {(user || ownerId) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<LogOut size={14} />}
                      onClick={async () => {
                        await logout();
                        navigate('/login');
                      }}
                    >
                      Sign Out
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {authError && (
              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                {authError}
              </div>
            )}

            <form onSubmit={handleSaveToken} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <label htmlFor="custom-token-input" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                Legacy Bearer Token Fallback (Phase 14 Bridge)
              </label>
              <textarea
                id="custom-token-input"
                rows={2}
                className="title-tracking-input"
                style={{ fontSize: '11px', fontFamily: 'monospace' }}
                placeholder="Optional: Paste a legacy Bearer JWT session token here..."
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 4, flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" type="submit">
                  Save Token
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={handleRefreshDevToken}
                  loading={isRefreshingDevToken}
                  iconLeft={<RefreshCw size={14} />}
                >
                  Refresh Dev Session
                </Button>
                <Button variant="ghost" size="sm" type="button" onClick={() => { setCustomToken(''); logout(); }}>
                  Clear Token
                </Button>
                {tokenSavedMsg && (
                  <span style={{ fontSize: 'var(--font-size-xs)', color: '#34d399', alignSelf: 'center' }}>
                    Session updated!
                  </span>
                )}
              </div>
            </form>
          </div>
        </GlassCard>

        {/* ── Section 3: Two-Step Verification (TOTP) ── */}
        <GlassCard padding="md">
          <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <ShieldCheck size={18} />
            Two-Step Verification (TOTP)
          </h2>
          <p className="settings-section-desc">
            Protect your account with a time-based one-time password (RFC 6238) generated by Google Authenticator, Microsoft Authenticator, 2FAS, or any compatible authenticator app.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {!user ? (
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--surface-glass)', border: '1px solid var(--border-subtle)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                Two-step verification is available for registered accounts. Please sign in with your email and password to manage authenticator security settings.
              </div>
            ) : (
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--surface-glass)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Smartphone size={16} style={{ color: mfaStatus?.enabled ? '#34d399' : 'var(--color-text-tertiary)' }} />
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Authenticator App
                    </span>
                  </div>
                  {isLoadingMfa ? (
                    <Badge variant="default" size="sm">Checking...</Badge>
                  ) : mfaStatus?.enabled ? (
                    <Badge variant="success" size="sm">
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="default" size="sm">Disabled</Badge>
                  )}
                </div>

                <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                  {mfaStatus?.enabled
                    ? `Two-step verification is active on this ${user.role.replace('_', ' ')} account. An authenticator code is required on every login.`
                    : 'Enhance your security by requiring a six-digit code from your authenticator app in addition to your password.'}
                </p>

                {mfaStatus?.enabled && (
                  <div style={{ margin: '0 0 var(--space-3)', fontSize: '11px', color: 'var(--color-text-tertiary)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    {mfaStatus.enrolledAt && (
                      <span>Enabled on {new Date(mfaStatus.enrolledAt).toLocaleDateString()} at {new Date(mfaStatus.enrolledAt).toLocaleTimeString()}</span>
                    )}
                    <span>• {mfaStatus.recoveryCodesRemaining} emergency recovery codes available</span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {!mfaStatus?.enabled ? (
                    <Button
                      variant="primary"
                      size="sm"
                      iconLeft={<Smartphone size={14} />}
                      onClick={openSetupModal}
                    >
                      Enable Authenticator Verification
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        iconLeft={<Key size={14} />}
                        onClick={() => {
                          setMfaPassword('');
                          setMfaTotpCode('');
                          setMfaError(null);
                          setRegenerateModalStep('confirm');
                        }}
                      >
                        Regenerate Recovery Codes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Trash2 size={14} />}
                        onClick={() => {
                          setMfaPassword('');
                          setMfaTotpCode('');
                          setMfaError(null);
                          setDisableModalOpen(true);
                        }}
                        style={{ color: '#f87171' }}
                      >
                        Disable 2FA
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        {/* ── Section 4: System Status & Infrastructure ── */}
        <GlassCard padding="md">
          <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Database size={18} />
            System Connections & Infrastructure
          </h2>
          <p className="settings-section-desc">
            Status of backend services, MongoDB Atlas database, and media storage pipelines.
          </p>

          <ul className="settings-items" role="list" style={{ marginTop: 'var(--space-4)' }}>
            <li className="settings-item">
              <div>
                <strong>Express REST API & MongoDB Atlas</strong>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  Endpoints, Zod schema validation, transaction boundaries.
                </p>
              </div>
              <span className="settings-item-badge" style={{ color: '#34d399', borderColor: '#059669' }}>
                {isCheckingHealth ? 'Checking...' : healthData?.data?.database === 'connected' ? 'Connected & Healthy' : 'Online'}
              </span>
            </li>

            <li className="settings-item">
              <div>
                <strong>Jikan v4 Metadata Importer</strong>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  Resilient adapter with 3 req/s throttling and bounded caching.
                </p>
              </div>
              <span className="settings-item-badge" style={{ color: '#34d399', borderColor: '#059669' }}>
                Operational
              </span>
            </li>

            <li className="settings-item">
              <div>
                <strong>Media Storage (Cover URLs)</strong>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  Direct image URLs are fully supported with automatic fallback.
                </p>
              </div>
              <span className="settings-item-badge" style={{ color: '#34d399', borderColor: '#059669' }}>
                Operational
              </span>
            </li>
          </ul>
        </GlassCard>
      </div>

      {/* ── Modal: MFA Setup (Steps: Password -> Scan QR -> Recovery Codes) ── */}
      {setupModalStep !== 'closed' && (
        <div className="mfa-modal-backdrop" onClick={() => setupModalStep === 'recovery' ? setSetupModalStep('closed') : null}>
          <div className="mfa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mfa-modal-header">
              <h3 className="mfa-modal-title">
                <ShieldCheck size={20} style={{ color: 'var(--color-primary, #6366f1)' }} />
                {setupModalStep === 'password' && 'Step 1: Confirm Password'}
                {setupModalStep === 'scan' && 'Step 2: Scan Authenticator QR Code'}
                {setupModalStep === 'recovery' && 'Step 3: Save Emergency Recovery Codes'}
              </h3>
              <button
                type="button"
                className="mfa-modal-close-btn"
                onClick={() => setSetupModalStep('closed')}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {mfaError && (
              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: 'var(--font-size-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{mfaError}</span>
              </div>
            )}

            {setupModalStep === 'password' && (
              <form onSubmit={handleStartSetup} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  To begin configuring two-step verification, please enter your current password to verify your identity.
                </p>

                <Input
                  id="mfa-setup-password"
                  label="Current Password"
                  type="password"
                  autoComplete="current-password"
                  required
                  fullWidth
                  autoFocus
                  iconLeft={<Lock size={16} />}
                  placeholder="••••••••••••"
                  value={mfaPassword}
                  onChange={(e) => setMfaPassword(e.target.value)}
                  disabled={isMfaSubmitting}
                />

                <div className="mfa-modal-actions">
                  <Button variant="ghost" size="sm" type="button" onClick={() => setSetupModalStep('closed')}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit" loading={isMfaSubmitting}>
                    Continue to QR Code
                  </Button>
                </div>
              </form>
            )}

            {setupModalStep === 'scan' && setupData && (
              <form onSubmit={handleVerifySetup} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Scan this QR code using <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, <strong>2FAS</strong>, or any standard TOTP app.
                </p>

                <div className="mfa-qr-wrapper">
                  <img src={setupData.qrCodeDataUrl} alt="Authenticator App QR Code" className="mfa-qr-img" />

                  <button
                    type="button"
                    onClick={() => setShowManualKey(!showManualKey)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-primary, #818cf8)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    {showManualKey ? 'Hide manual entry key' : 'Cannot scan QR code? Click for manual key'}
                  </button>

                  {showManualKey && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', maxWidth: '100%' }}>
                      <span className="mfa-manual-key">{setupData.manualEntryKey}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(setupData.manualEntryKey, true)}
                        iconLeft={copiedKey ? <Check size={14} /> : <Copy size={14} />}
                      >
                        {copiedKey ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 'var(--space-1)' }}>
                  <Input
                    id="mfa-setup-totp"
                    label="Enter 6-Digit Code from App"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    fullWidth
                    autoFocus
                    maxLength={6}
                    placeholder="123456"
                    iconLeft={<Smartphone size={16} />}
                    value={mfaTotpCode}
                    onChange={(e) => setMfaTotpCode(e.target.value)}
                    disabled={isMfaSubmitting}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    Enrollment is not complete until this code is verified.
                  </p>
                </div>

                <div className="mfa-modal-actions">
                  <Button variant="ghost" size="sm" type="button" onClick={() => setSetupModalStep('closed')}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit" loading={isMfaSubmitting}>
                    Verify & Activate 2FA
                  </Button>
                </div>
              </form>
            )}

            {setupModalStep === 'recovery' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(234, 179, 8, 0.15)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    color: '#fde047',
                    fontSize: 'var(--font-size-xs)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-2)',
                    lineHeight: 1.4,
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>Save these recovery codes immediately.</strong> If you ever lose your phone or authenticator access, these single-use codes are the only way to sign in. They will <strong>not</strong> be shown again.
                  </span>
                </div>

                <div className="mfa-recovery-grid">
                  {recoveryCodes.map((code) => (
                    <div key={code} className="mfa-recovery-code-item">
                      {code}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(recoveryCodes.join('\n'))}
                    iconLeft={copiedCodes ? <Check size={14} /> : <Copy size={14} />}
                  >
                    {copiedCodes ? 'Codes Copied!' : 'Copy All Codes'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={downloadRecoveryCodes}
                    iconLeft={<Download size={14} />}
                  >
                    Download (.txt)
                  </Button>
                </div>

                <div className="mfa-modal-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setSetupModalStep('closed');
                      setExportSuccessMsg('Two-Step Verification activated successfully!');
                    }}
                  >
                    I Have Saved These Codes
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Disable MFA ── */}
      {disableModalOpen && (
        <div className="mfa-modal-backdrop" onClick={() => setDisableModalOpen(false)}>
          <div className="mfa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mfa-modal-header">
              <h3 className="mfa-modal-title" style={{ color: '#f87171' }}>
                <Trash2 size={20} />
                Disable Two-Step Verification
              </h3>
              <button
                type="button"
                className="mfa-modal-close-btn"
                onClick={() => setDisableModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {mfaError && (
              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: 'var(--font-size-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{mfaError}</span>
              </div>
            )}

            <form onSubmit={handleDisableMfa} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                Disabling two-step verification will remove authenticator app requirements from your account. Please confirm your password and a valid 6-digit code or recovery code.
              </p>

              <Input
                id="disable-mfa-password"
                label="Account Password"
                type="password"
                autoComplete="current-password"
                required
                fullWidth
                autoFocus
                iconLeft={<Lock size={16} />}
                placeholder="••••••••••••"
                value={mfaPassword}
                onChange={(e) => setMfaPassword(e.target.value)}
                disabled={isMfaSubmitting}
              />

              <Input
                id="disable-mfa-code"
                label="Authenticator Code or Recovery Code"
                type="text"
                required
                fullWidth
                maxLength={11}
                iconLeft={<Key size={16} />}
                placeholder="123456 or XXXXX-XXXXX"
                value={mfaTotpCode}
                onChange={(e) => setMfaTotpCode(e.target.value.toUpperCase())}
                disabled={isMfaSubmitting}
              />

              <div className="mfa-modal-actions">
                <Button variant="ghost" size="sm" type="button" onClick={() => setDisableModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" loading={isMfaSubmitting} style={{ background: '#dc2626', borderColor: '#b91c1c' }}>
                  Confirm & Disable 2FA
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Regenerate Recovery Codes ── */}
      {regenerateModalStep !== 'closed' && (
        <div className="mfa-modal-backdrop" onClick={() => regenerateModalStep === 'display' ? setRegenerateModalStep('closed') : null}>
          <div className="mfa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mfa-modal-header">
              <h3 className="mfa-modal-title">
                <Key size={20} style={{ color: 'var(--color-primary, #6366f1)' }} />
                {regenerateModalStep === 'confirm' ? 'Regenerate Recovery Codes' : 'New Emergency Recovery Codes'}
              </h3>
              <button
                type="button"
                className="mfa-modal-close-btn"
                onClick={() => setRegenerateModalStep('closed')}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {mfaError && (
              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: 'var(--font-size-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{mfaError}</span>
              </div>
            )}

            {regenerateModalStep === 'confirm' ? (
              <form onSubmit={handleRegenerateRecoveryCodes} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Regenerating recovery codes will invalidate all previously issued recovery backup codes. Confirm your password and current 6-digit authenticator code.
                </p>

                <Input
                  id="regen-mfa-password"
                  label="Account Password"
                  type="password"
                  autoComplete="current-password"
                  required
                  fullWidth
                  autoFocus
                  iconLeft={<Lock size={16} />}
                  placeholder="••••••••••••"
                  value={mfaPassword}
                  onChange={(e) => setMfaPassword(e.target.value)}
                  disabled={isMfaSubmitting}
                />

                <Input
                  id="regen-mfa-code"
                  label="6-Digit Authenticator Code"
                  type="text"
                  inputMode="numeric"
                  required
                  fullWidth
                  maxLength={6}
                  iconLeft={<Smartphone size={16} />}
                  placeholder="123456"
                  value={mfaTotpCode}
                  onChange={(e) => setMfaTotpCode(e.target.value)}
                  disabled={isMfaSubmitting}
                />

                <div className="mfa-modal-actions">
                  <Button variant="ghost" size="sm" type="button" onClick={() => setRegenerateModalStep('closed')}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit" loading={isMfaSubmitting}>
                    Regenerate Codes
                  </Button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(234, 179, 8, 0.15)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    color: '#fde047',
                    fontSize: 'var(--font-size-xs)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-2)',
                    lineHeight: 1.4,
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>All old recovery codes are now invalid.</strong> Store these new single-use emergency backup codes in a secure location.
                  </span>
                </div>

                <div className="mfa-recovery-grid">
                  {recoveryCodes.map((code) => (
                    <div key={code} className="mfa-recovery-code-item">
                      {code}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(recoveryCodes.join('\n'))}
                    iconLeft={copiedCodes ? <Check size={14} /> : <Copy size={14} />}
                  >
                    {copiedCodes ? 'Codes Copied!' : 'Copy All Codes'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={downloadRecoveryCodes}
                    iconLeft={<Download size={14} />}
                  >
                    Download (.txt)
                  </Button>
                </div>

                <div className="mfa-modal-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setRegenerateModalStep('closed');
                      setExportSuccessMsg('New recovery codes generated and saved!');
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

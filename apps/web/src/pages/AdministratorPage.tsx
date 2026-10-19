import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield,
  Users,
  UserCheck,
  UserX,
  UserMinus,
  Plus,
  RefreshCw,
  LogOut,
  ArrowLeft,
  LayoutDashboard,
  Check,
  AlertCircle,
  X,
  KeyRound,
  Database,
  Lock,
  FileText,
  Activity,
  Trash2,
  Server,
  Filter,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import {
  api,
  type SuperAdminProfile,
  type ManagedUser,
  type CreateSuperAdminInput,
  type AuditEvent,
  type UserStatus,
} from '../lib/api-client';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/ui/LoadingState';
import './AdministratorPage.css';

export function AdministratorPage() {
  const { user, isRootAdmin, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'superadmins' | 'audit' | 'system'>('overview');
  const [superAdmins, setSuperAdmins] = useState<SuperAdminProfile[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [earliestAuditHistory, setEarliestAuditHistory] = useState<string | null>(null);
  const [systemStats, setSystemStats] = useState<any>(null);

  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filter states for audit logs
  const [auditActorRoleFilter, setAuditActorRoleFilter] = useState<string>('');
  const [auditTargetTypeFilter, setAuditTargetTypeFilter] = useState<string>('');

  // Super Admin creation modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<CreateSuperAdminInput>({
    username: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Action modals
  const [adminToDisable, setAdminToDisable] = useState<SuperAdminProfile | null>(null);
  const [adminToDelete, setAdminToDelete] = useState<SuperAdminProfile | null>(null);
  const [adminToRevoke, setAdminToRevoke] = useState<SuperAdminProfile | null>(null);

  const [userToStatusChange, setUserToStatusChange] = useState<{ user: ManagedUser; targetStatus: UserStatus } | null>(null);
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const [userToRevoke, setUserToRevoke] = useState<ManagedUser | null>(null);

  // Strict route protection: Only Root Administrator (`root_admin`)
  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate('/login', { replace: true });
      } else if (user.role === 'superadmin') {
        navigate('/superadmin', { replace: true });
      } else if (user.role !== 'root_admin') {
        navigate('/', { replace: true });
      }
    }
  }, [isLoading, user, navigate]);

  const loadData = useCallback(async () => {
    try {
      setIsLoadingData(true);
      setActionError(null);
      const [adminsRes, usersRes, auditRes, statsRes] = await Promise.all([
        api.admin.listSuperAdmins().catch(() => []),
        api.admin.listUsers().catch(() => []),
        api.admin.getAuditLogs({
          actorRole: auditActorRoleFilter || undefined,
          targetType: auditTargetTypeFilter || undefined,
          limit: 50,
        }).catch(() => ({ items: [], total: 0, earliestHistory: null })),
        api.admin.getSystemStats().catch(() => null),
      ]);
      setSuperAdmins(adminsRes || []);
      setUsers(usersRes || []);
      setAuditLogs(auditRes?.items || []);
      setAuditTotal(auditRes?.total || 0);
      setEarliestAuditHistory(auditRes?.earliestHistory || null);
      setSystemStats(statsRes || null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load administrator data';
      setActionError(msg);
    } finally {
      setIsLoadingData(false);
    }
  }, [auditActorRoleFilter, auditTargetTypeFilter]);

  useEffect(() => {
    if (isRootAdmin) {
      loadData();
    }
  }, [isRootAdmin, loadData]);

  // Handle Create Super Admin
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.displayName.trim() || !createForm.email.trim() || !createForm.password) {
      setActionError('Please fill out all required fields.');
      return;
    }
    if (createForm.password.length < 8) {
      setActionError('Password must be at least 8 characters long.');
      return;
    }
    if (createForm.password !== createForm.confirmPassword) {
      setActionError('Passwords do not match.');
      return;
    }

    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.admin.createSuperAdmin({
        username: createForm.username?.trim().toLowerCase() || undefined,
        displayName: createForm.displayName.trim(),
        email: createForm.email.trim().toLowerCase(),
        password: createForm.password,
        confirmPassword: createForm.confirmPassword,
      });
      setShowCreateModal(false);
      setCreateForm({ username: '', displayName: '', email: '', password: '', confirmPassword: '' });
      setActionSuccess('Super Admin account created in disabled status. Explicitly activate when authorized.');
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create Super Admin account';
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Super Admin Status Toggle
  const handleToggleAdminStatus = async (admin: SuperAdminProfile) => {
    if (admin.status === 'active') {
      setAdminToDisable(admin);
    } else {
      try {
        setActionError(null);
        await api.admin.updateSuperAdminStatus(admin.id, 'active');
        setActionSuccess(`Super Admin "${admin.email}" has been activated.`);
        await loadData();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to activate Super Admin');
      }
    }
  };

  const confirmDisableAdmin = async () => {
    if (!adminToDisable) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.admin.updateSuperAdminStatus(adminToDisable.id, 'disabled');
      setActionSuccess(`Super Admin "${adminToDisable.email}" has been disabled and its sessions revoked.`);
      setAdminToDisable(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to disable Super Admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteAdmin = async () => {
    if (!adminToDelete) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.admin.deleteSuperAdmin(adminToDelete.id);
      setActionSuccess(`Super Admin "${adminToDelete.email}" has been deleted.`);
      setAdminToDelete(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete Super Admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmRevokeAdminSessions = async () => {
    if (!adminToRevoke) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.admin.revokeSuperAdminSessions(adminToRevoke.id);
      setActionSuccess(`All active sessions for "${adminToRevoke.email}" have been revoked.`);
      setAdminToRevoke(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to revoke sessions');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle User Status Change
  const confirmUserStatusChange = async () => {
    if (!userToStatusChange) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.admin.updateUserStatus(userToStatusChange.user.id, userToStatusChange.targetStatus);
      setActionSuccess(`User "${userToStatusChange.user.email}" status updated to ${userToStatusChange.targetStatus}.`);
      setUserToStatusChange(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update user status');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.admin.deleteUser(userToDelete.id);
      setActionSuccess(`User "${userToDelete.email}" has been deactivated and marked deleted.`);
      setUserToDelete(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmRevokeUserSessions = async () => {
    if (!userToRevoke) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.admin.revokeUserSessions(userToRevoke.id);
      setActionSuccess(`All active sessions for user "${userToRevoke.email}" have been revoked.`);
      setUserToRevoke(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to revoke user sessions');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || (!isRootAdmin && isLoadingData)) {
    return (
      <div className="admin-portal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingState message="Verifying Root Administrator credentials..." />
      </div>
    );
  }

  const activeAdminsCount = superAdmins.filter((a) => a.status === 'active').length;
  const disabledAdminsCount = superAdmins.filter((a) => a.status === 'disabled').length;
  const activeUsersCount = users.filter((u) => u.status === 'active').length;
  const restrictedUsersCount = users.filter((u) => u.status === 'restricted').length;
  const disabledUsersCount = users.filter((u) => u.status === 'disabled').length;

  return (
    <div className="admin-portal">
      {/* ── Top Header ────────────────────────────────────────── */}
      <header className="admin-header">
        <div className="admin-header-title-group">
          <div className="admin-shield-icon" style={{ background: 'linear-gradient(135deg, hsl(270, 80%, 45%), hsl(225, 75%, 25%))' }}>
            <Shield size={22} />
          </div>
          <div>
            <h1 className="admin-portal-title">Root Administrator Portal</h1>
            <div className="admin-portal-subtitle">
              Platform Ownership, Super Admin Governance & Audit Logging
            </div>
          </div>
        </div>

        <div className="admin-header-actions">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>
              Back to App
            </Button>
          </Link>

          <div className="admin-user-pill">
            <UserCheck size={14} style={{ color: 'hsl(270, 80%, 75%)' }} />
            <span>{user?.email}</span>
            <Badge variant="primary" size="sm">
              Root Administrator
            </Badge>
          </div>

          <Button
            variant="ghost"
            size="sm"
            iconLeft={<RefreshCw size={14} className={isLoadingData ? 'spin' : ''} />}
            onClick={loadData}
            title="Refresh data"
          />

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
        </div>
      </header>

      {/* ── Feedback Alerts ───────────────────────────────────── */}
      {actionError && (
        <div className="admin-alert-banner error">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="admin-alert-banner success">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={16} />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Navigation Tabs ───────────────────────────────────── */}
      <nav className="admin-tabs" aria-label="Portal Navigation">
        <button
          className={`admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutDashboard size={15} />
          <span>Overview</span>
        </button>

        <button
          className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={15} />
          <span>Users</span>
          <span className="admin-tab-count">{users.length}</span>
        </button>

        <button
          className={`admin-tab-btn ${activeTab === 'superadmins' ? 'active' : ''}`}
          onClick={() => setActiveTab('superadmins')}
        >
          <Shield size={15} />
          <span>Super Admins</span>
          <span className="admin-tab-count">{superAdmins.length}</span>
        </button>

        <button
          className={`admin-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <Activity size={15} />
          <span>Activity & Audit</span>
          <span className="admin-tab-count">{auditTotal}</span>
        </button>

        <button
          className={`admin-tab-btn ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          <Server size={15} />
          <span>System Status</span>
        </button>
      </nav>

      {/* ── Tab Content: Overview ─────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Total Users</span>
                <Users size={16} style={{ color: 'hsl(215, 90%, 70%)' }} />
              </div>
              <div className="admin-stat-value">{users.length}</div>
              <div className="admin-stat-desc">
                {activeUsersCount} active · {restrictedUsersCount} restricted · {disabledUsersCount} disabled
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Super Admins</span>
                <Shield size={16} style={{ color: 'hsl(270, 90%, 70%)' }} />
              </div>
              <div className="admin-stat-value" style={{ color: 'hsl(270, 90%, 75%)' }}>
                {superAdmins.length}
              </div>
              <div className="admin-stat-desc">
                {activeAdminsCount} active · {disabledAdminsCount} disabled
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Total Audit Events</span>
                <Activity size={16} style={{ color: 'hsl(140, 80%, 70%)' }} />
              </div>
              <div className="admin-stat-value" style={{ color: 'hsl(140, 80%, 75%)' }}>
                {auditTotal}
              </div>
              <div className="admin-stat-desc">Append-only security log</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Database Connection</span>
                <Database size={16} style={{ color: 'hsl(140, 80%, 70%)' }} />
              </div>
              <div className="admin-stat-value" style={{ color: 'hsl(140, 80%, 75%)', fontSize: 'var(--text-lg)' }}>
                {systemStats?.database?.status === 'connected' ? 'Atlas Connected' : 'Connected'}
              </div>
              <div className="admin-stat-desc">{systemStats?.database?.name || 'animemanager'}</div>
            </div>
          </div>

          <div className="admin-system-box">
            <div className="admin-system-box-title">
              <Lock size={16} style={{ color: 'hsl(270, 90%, 70%)' }} />
              <span>Three-Tier Role Hierarchy & Privilege Boundary</span>
            </div>
            <div className="admin-system-list">
              <div className="admin-system-item">
                <Check size={14} style={{ color: 'hsl(140, 80%, 70%)' }} />
                <span>Root Administrator (root_admin): Exclusive authority over Super Admins & system audits</span>
              </div>
              <div className="admin-system-item">
                <Check size={14} style={{ color: 'hsl(140, 80%, 70%)' }} />
                <span>Super Admin (superadmin): Manages ordinary Users only; strictly forbidden from creating/managing Super Admins</span>
              </div>
              <div className="admin-system-item">
                <Check size={14} style={{ color: 'hsl(140, 80%, 70%)' }} />
                <span>Ordinary User (user): Isolated personal media library; cannot access /administrator or /superadmin</span>
              </div>
              <div className="admin-system-item">
                <Check size={14} style={{ color: 'hsl(140, 80%, 70%)' }} />
                <span>Privacy-Preserving Audit: Ordinary user content events omit title text, ratings, and bookmark notes</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="md"
              iconLeft={<Plus size={16} />}
              onClick={() => setShowCreateModal(true)}
            >
              Create Super Admin
            </Button>
            <Button
              variant="secondary"
              size="md"
              iconLeft={<Users size={16} />}
              onClick={() => setActiveTab('users')}
            >
              Manage Users
            </Button>
            <Button
              variant="ghost"
              size="md"
              iconLeft={<Activity size={16} />}
              onClick={() => setActiveTab('audit')}
            >
              View Audit Logs
            </Button>
          </div>
        </div>
      )}

      {/* ── Tab Content: Users ────────────────────────────────── */}
      {activeTab === 'users' && (
        <div>
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Ordinary User Accounts</h2>
              <div className="admin-section-subtitle">
                Registered user accounts with isolated personal media libraries
              </div>
            </div>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Library Counts</th>
                  <th>Joined</th>
                  <th>Last Login</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="admin-name-cell">
                        <span style={{ fontWeight: 600 }}>{u.displayName}</span>
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {u.email}
                      </div>
                    </td>

                    <td>
                      <code style={{ fontSize: '11px', color: 'hsl(215, 90%, 75%)' }}>
                        @{u.username || 'unspecified'}
                      </code>
                    </td>

                    <td>
                      {u.status === 'active' ? (
                        <Badge variant="primary" size="sm">Active</Badge>
                      ) : u.status === 'restricted' ? (
                        <Badge variant="warning" size="sm">Restricted</Badge>
                      ) : (
                        <Badge variant="danger" size="sm">Disabled</Badge>
                      )}
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)' }}>
                      <span>{u.titlesCount} titles · {u.bookmarksCount} bookmarks · {u.collectionsCount} lists</span>
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)' }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-action-btn-group" style={{ justifyContent: 'flex-end' }}>
                        {u.status !== 'active' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            iconLeft={<UserCheck size={13} />}
                            onClick={() => setUserToStatusChange({ user: u, targetStatus: 'active' })}
                          >
                            Activate
                          </Button>
                        )}

                        {u.status !== 'restricted' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            iconLeft={<UserMinus size={13} />}
                            title="Restrict user permissions"
                            onClick={() => setUserToStatusChange({ user: u, targetStatus: 'restricted' })}
                          >
                            Restrict
                          </Button>
                        )}

                        {u.status !== 'disabled' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            iconLeft={<UserX size={13} />}
                            title="Disable account"
                            onClick={() => setUserToStatusChange({ user: u, targetStatus: 'disabled' })}
                          >
                            Disable
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft={<KeyRound size={13} />}
                          title="Revoke active sessions"
                          onClick={() => setUserToRevoke(u)}
                        >
                          Revoke
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft={<Trash2 size={13} />}
                          title="Deactivate & delete user"
                          onClick={() => setUserToDelete(u)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab Content: Super Admins ─────────────────────────── */}
      {activeTab === 'superadmins' && (
        <div>
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Super Administrator Accounts</h2>
              <div className="admin-section-subtitle">
                Privileged operators managed exclusively by the Root Administrator
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus size={14} />}
              onClick={() => setShowCreateModal(true)}
            >
              Create Super Admin
            </Button>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Administrator</th>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last Login</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {superAdmins.map((admin) => (
                  <tr key={admin.id}>
                    <td>
                      <div className="admin-name-cell">
                        <span style={{ fontWeight: 600 }}>{admin.displayName}</span>
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {admin.email}
                      </div>
                    </td>

                    <td>
                      <code style={{ fontSize: '11px', color: 'hsl(270, 90%, 75%)' }}>
                        @{admin.username || 'superadmin'}
                      </code>
                    </td>

                    <td>
                      {admin.status === 'active' ? (
                        <Badge variant="primary" size="sm">Active</Badge>
                      ) : (
                        <Badge variant="warning" size="sm">Disabled</Badge>
                      )}
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)' }}>
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)' }}>
                      {admin.lastLoginAt ? (
                        new Date(admin.lastLoginAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      ) : (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>Never</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-action-btn-group" style={{ justifyContent: 'flex-end' }}>
                        {admin.status === 'disabled' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            iconLeft={<UserCheck size={13} />}
                            onClick={() => handleToggleAdminStatus(admin)}
                          >
                            Activate
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            iconLeft={<UserX size={13} />}
                            title="Disable this administrator"
                            onClick={() => handleToggleAdminStatus(admin)}
                          >
                            Disable
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft={<KeyRound size={13} />}
                          title="Force revoke all active sessions"
                          onClick={() => setAdminToRevoke(admin)}
                        >
                          Revoke
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft={<Trash2 size={13} />}
                          title="Delete Super Admin account"
                          onClick={() => setAdminToDelete(admin)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab Content: Audit & Activity ─────────────────────── */}
      {activeTab === 'audit' && (
        <div>
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">Activity & Audit Logs</h2>
              <div className="admin-section-subtitle">
                Append-only record of administrative operations and privacy-preserving user activity
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <select
                className="admin-form-input"
                style={{ width: 'auto', padding: '6px 10px', fontSize: '12px' }}
                value={auditActorRoleFilter}
                onChange={(e) => setAuditActorRoleFilter(e.target.value)}
              >
                <option value="">All Roles</option>
                <option value="root_admin">Root Admin</option>
                <option value="superadmin">Super Admin</option>
                <option value="user">Ordinary User</option>
              </select>

              <select
                className="admin-form-input"
                style={{ width: 'auto', padding: '6px 10px', fontSize: '12px' }}
                value={auditTargetTypeFilter}
                onChange={(e) => setAuditTargetTypeFilter(e.target.value)}
              >
                <option value="">All Targets</option>
                <option value="super_admin">Super Admins</option>
                <option value="user">Users</option>
                <option value="library_item">Library Items</option>
                <option value="bookmark">Bookmarks</option>
                <option value="collection">Collections</option>
              </select>
            </div>
          </div>

          {earliestAuditHistory && (
            <div className="admin-system-box" style={{ marginBottom: 'var(--space-4)', padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'hsl(215, 90%, 75%)' }}>
                <Activity size={14} />
                <span>
                  Audit history is append-only and active from{' '}
                  <strong>{new Date(earliestAuditHistory).toLocaleString()}</strong>. Prior events are not fabricated.
                </span>
              </div>
            </div>
          )}

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Type</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Outcome</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>

                    <td>
                      <code style={{ fontSize: '11px', color: 'hsl(140, 80%, 75%)' }}>{log.eventType}</code>
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)' }}>
                      <span style={{ marginRight: 6 }}>
                        <Badge variant="default" size="sm">
                          {log.actorRole}
                        </Badge>
                      </span>
                      <code style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                        {log.actorId.slice(0, 8)}...
                      </code>
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)' }}>
                      <span style={{ marginRight: 6 }}>{log.targetType}</span>
                      <code style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                        {log.targetId ? `${log.targetId.slice(0, 8)}...` : 'n/a'}
                      </code>
                    </td>

                    <td>
                      {log.outcome === 'success' ? (
                        <Badge variant="primary" size="sm">Success</Badge>
                      ) : (
                        <Badge variant="danger" size="sm">Failed</Badge>
                      )}
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', maxWidth: '240px' }}>
                      {log.metadata ? (
                        <code style={{ fontSize: '10px' }}>
                          {JSON.stringify(log.metadata).slice(0, 60)}
                          {JSON.stringify(log.metadata).length > 60 ? '...' : ''}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab Content: System Status ─────────────────────────── */}
      {activeTab === 'system' && (
        <div>
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title">System & Security Status</h2>
              <div className="admin-section-subtitle">
                Live backend diagnostics, MongoDB connection state, and operational guidelines
              </div>
            </div>
          </div>

          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Database Status</span>
                <Database size={16} style={{ color: 'hsl(140, 80%, 70%)' }} />
              </div>
              <div className="admin-stat-value" style={{ color: 'hsl(140, 80%, 75%)' }}>
                {systemStats?.database?.status || 'Connected'}
              </div>
              <div className="admin-stat-desc">Target Database: {systemStats?.database?.name || 'animemanager'}</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>API Server</span>
                <Server size={16} />
              </div>
              <div className="admin-stat-value">Node.js Express</div>
              <div className="admin-stat-desc">Environment: {systemStats?.environment || 'development'}</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Server Uptime</span>
                <Activity size={16} />
              </div>
              <div className="admin-stat-value">
                {systemStats?.uptime ? `${Math.floor(systemStats.uptime / 60)}m` : 'Active'}
              </div>
              <div className="admin-stat-desc">System time: {new Date().toLocaleTimeString()}</div>
            </div>
          </div>

          <div className="admin-system-box" style={{ marginTop: 'var(--space-4)' }}>
            <div className="admin-system-box-title">
              <Lock size={16} style={{ color: 'hsl(270, 90%, 70%)' }} />
              <span>Root Administrator Provisioning & CLI Recovery Procedure</span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              In compliance with Section 14, Root Administrator accounts are provisioned outside of public registration.
              To bootstrap or recover a Root Administrator locally or in an authorized operations environment:
              <pre style={{
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '12px',
                borderRadius: '6px',
                marginTop: '8px',
                color: '#86efac',
                fontFamily: 'monospace',
                fontSize: '11px',
                overflowX: 'auto',
              }}>
                node scripts/bootstrap-superadmin.js --role root_admin --email owner@animemanager.local --name "Root Admin"
              </pre>
              Passwords are automatically hashed with Scrypt (64-byte key, 16-byte cryptographically secure salt).
              Never commit or store plaintext passwords.
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Create Super Admin ─────────────────────────── */}
      {showCreateModal && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setShowCreateModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Create Super Administrator</h3>
              <button
                className="admin-modal-close-btn"
                onClick={() => setShowCreateModal(false)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-notice">
              <strong>Security Policy Notice:</strong> In accordance with role hierarchy rules,
              new Super Admin accounts are created in a <strong>disabled</strong> status by default.
              As Root Administrator, you must explicitly activate the account before it can sign in.
            </div>

            <form onSubmit={handleCreateSubmit} className="admin-modal-form">
              <div className="admin-form-group">
                <label className="admin-form-label">Username (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. operator_alex"
                  className="admin-form-input"
                  value={createForm.username || ''}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Rivera"
                  className="admin-form-input"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="admin@example.com"
                  className="admin-form-input"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Password (minimum 8 characters)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  className="admin-form-input"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Confirm Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  className="admin-form-input"
                  value={createForm.confirmPassword}
                  onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="admin-modal-actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  iconLeft={isSubmitting ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />}
                >
                  {isSubmitting ? 'Creating...' : 'Create Super Admin'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Disable Super Admin ─────────────────── */}
      {adminToDisable && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setAdminToDisable(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Confirm Disable Super Administrator</h3>
              <button
                className="admin-modal-close-btn"
                onClick={() => setAdminToDisable(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to disable <strong>{adminToDisable.email}</strong>?
              <br /><br />
              This account will be immediately barred from signing in, and all existing active sessions
              for this administrator will be revoked.
            </div>

            <div className="admin-modal-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAdminToDisable(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={isSubmitting}
                onClick={confirmDisableAdmin}
                iconLeft={isSubmitting ? <RefreshCw size={14} className="spin" /> : <UserX size={14} />}
              >
                {isSubmitting ? 'Disabling...' : 'Confirm Disable'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Delete Super Admin ─────────────────── */}
      {adminToDelete && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setAdminToDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Confirm Delete Super Administrator</h3>
              <button
                className="admin-modal-close-btn"
                onClick={() => setAdminToDelete(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to delete Super Admin <strong>{adminToDelete.email}</strong>?
              <br /><br />
              This action is permanent and will immediately terminate all active sessions.
            </div>

            <div className="admin-modal-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAdminToDelete(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={isSubmitting}
                onClick={confirmDeleteAdmin}
                iconLeft={isSubmitting ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
              >
                {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Revoke Admin Sessions ───────────────── */}
      {adminToRevoke && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setAdminToRevoke(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Revoke Super Admin Sessions</h3>
              <button
                className="admin-modal-close-btn"
                onClick={() => setAdminToRevoke(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to terminate all active sessions for <strong>{adminToRevoke.email}</strong>?
            </div>

            <div className="admin-modal-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAdminToRevoke(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                onClick={confirmRevokeAdminSessions}
                iconLeft={isSubmitting ? <RefreshCw size={14} className="spin" /> : <KeyRound size={14} />}
              >
                {isSubmitting ? 'Revoking...' : 'Revoke All Sessions'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm User Status Change ─────────────────── */}
      {userToStatusChange && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setUserToStatusChange(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Update User Status</h3>
              <button
                className="admin-modal-close-btn"
                onClick={() => setUserToStatusChange(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Set status for user <strong>{userToStatusChange.user.email}</strong> to{' '}
              <strong style={{ color: '#fff', textTransform: 'uppercase' }}>{userToStatusChange.targetStatus}</strong>?
              {userToStatusChange.targetStatus === 'disabled' && (
                <div style={{ marginTop: '8px', color: '#fca5a5' }}>
                  Disabling this account will immediately revoke all active sessions and bar the user from logging in.
                </div>
              )}
            </div>

            <div className="admin-modal-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUserToStatusChange(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                onClick={confirmUserStatusChange}
                iconLeft={isSubmitting ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
              >
                {isSubmitting ? 'Updating...' : 'Confirm Update'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Delete User ────────────────────────── */}
      {userToDelete && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setUserToDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Confirm Deactivate & Delete User</h3>
              <button
                className="admin-modal-close-btn"
                onClick={() => setUserToDelete(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to deactivate and mark user <strong>{userToDelete.email}</strong> as deleted?
              <br /><br />
              <strong>Data Retention Notice:</strong> In accordance with our data lifecycle policy,
              the account is marked disabled/deleted and all active sessions are revoked immediately.
              Personal library data is preserved under the user's isolated ownership record for recovery or auditing.
            </div>

            <div className="admin-modal-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUserToDelete(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={isSubmitting}
                onClick={confirmDeleteUser}
                iconLeft={isSubmitting ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
              >
                {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Revoke User Sessions ───────────────── */}
      {userToRevoke && (
        <div className="admin-modal-backdrop" onClick={() => !isSubmitting && setUserToRevoke(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Revoke User Sessions</h3>
              <button
                className="admin-modal-close-btn"
                onClick={() => setUserToRevoke(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Revoke all active sessions for user <strong>{userToRevoke.email}</strong>?
              The user will need to re-authenticate on their next request.
            </div>

            <div className="admin-modal-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUserToRevoke(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                onClick={confirmRevokeUserSessions}
                iconLeft={isSubmitting ? <RefreshCw size={14} className="spin" /> : <KeyRound size={14} />}
              >
                {isSubmitting ? 'Revoking...' : 'Revoke All Sessions'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

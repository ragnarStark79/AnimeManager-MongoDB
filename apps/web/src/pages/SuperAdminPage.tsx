import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield,
  Users,
  UserCheck,
  UserX,
  UserMinus,
  RefreshCw,
  LogOut,
  ArrowLeft,
  LayoutDashboard,
  Check,
  AlertCircle,
  X,
  KeyRound,
  Trash2,
  Activity,
  Eye,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import {
  api,
  type ManagedUser,
  type AuditEvent,
  type UserStatus,
} from '../lib/api-client';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/ui/LoadingState';
import './SuperAdminPage.css';

export function SuperAdminPage() {
  const { user, isSuperAdmin, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'activity'>('overview');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [activityEvents, setActivityEvents] = useState<AuditEvent[]>([]);
  const [activityTotal, setActivityTotal] = useState<number>(0);

  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals for User management
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [userToStatusChange, setUserToStatusChange] = useState<{ user: ManagedUser; targetStatus: UserStatus } | null>(null);
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const [userToRevoke, setUserToRevoke] = useState<ManagedUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Strict route protection: Only Super Admin (`superadmin`).
  // If Root Admin opens `/superadmin`, redirect to `/administrator`.
  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate('/login', { replace: true });
      } else if (user.role === 'root_admin') {
        navigate('/administrator', { replace: true });
      } else if (user.role !== 'superadmin') {
        navigate('/', { replace: true });
      }
    }
  }, [isLoading, user, navigate]);

  const loadData = useCallback(async () => {
    try {
      setIsLoadingData(true);
      setActionError(null);
      const [usersRes, activityRes] = await Promise.all([
        api.admin.listUsers().catch(() => []),
        api.admin.getUserActivity({ limit: 50 }).catch(() => ({ items: [], total: 0 })),
      ]);
      setUsers(usersRes || []);
      setActivityEvents(activityRes?.items || []);
      setActivityTotal(activityRes?.total || 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load user management data';
      setActionError(msg);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin, loadData]);

  // Handle User Status Update (Activate, Restrict, Disable)
  const confirmUserStatusChange = async () => {
    if (!userToStatusChange) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.admin.updateUserStatus(userToStatusChange.user.id, userToStatusChange.targetStatus);
      setActionSuccess(`User "${userToStatusChange.user.email}" updated to ${userToStatusChange.targetStatus}.`);
      setUserToStatusChange(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update user status');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle User Deletion (Soft delete / Disable)
  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      setIsSubmitting(true);
      setActionError(null);
      await api.admin.deleteUser(userToDelete.id);
      setActionSuccess(`User "${userToDelete.email}" has been marked deleted and sessions revoked.`);
      setUserToDelete(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle User Session Revocation
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

  if (isLoading || (!isSuperAdmin && isLoadingData)) {
    return (
      <div className="superadmin-portal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingState message="Verifying Super Admin permissions..." />
      </div>
    );
  }

  const activeUsersCount = users.filter((u) => u.status === 'active').length;
  const restrictedUsersCount = users.filter((u) => u.status === 'restricted').length;
  const disabledUsersCount = users.filter((u) => u.status === 'disabled').length;

  return (
    <div className="superadmin-portal">
      {/* ── Top Header ────────────────────────────────────────── */}
      <header className="superadmin-header">
        <div className="superadmin-header-title-group">
          <div className="superadmin-shield-icon">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="superadmin-portal-title">Super Admin Portal</h1>
            <div className="superadmin-portal-subtitle">
              User Account Operations & Privacy-Safe Activity Auditing
            </div>
          </div>
        </div>

        <div className="superadmin-header-actions">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>
              Back to Library
            </Button>
          </Link>

          <div className="superadmin-user-pill">
            <UserCheck size={14} style={{ color: 'hsl(140, 80%, 70%)' }} />
            <span>{user?.email}</span>
            <Badge variant="primary" size="sm">Super Admin</Badge>
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
        <div className="superadmin-alert-banner error">
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
        <div className="superadmin-alert-banner success">
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
      <nav className="superadmin-tabs" aria-label="Portal Navigation">
        <button
          className={`superadmin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutDashboard size={15} />
          <span>Overview</span>
        </button>

        <button
          className={`superadmin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={15} />
          <span>Users</span>
          <span className="superadmin-tab-count">{users.length}</span>
        </button>

        <button
          className={`superadmin-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          <Activity size={15} />
          <span>User Activity</span>
          <span className="superadmin-tab-count">{activityTotal}</span>
        </button>
      </nav>

      {/* ── Tab Content: Overview ─────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
          <div className="superadmin-stats-grid">
            <div className="superadmin-stat-card">
              <div className="superadmin-stat-header">
                <span>Total Users</span>
                <Users size={16} style={{ color: 'hsl(215, 90%, 70%)' }} />
              </div>
              <div className="superadmin-stat-value">{users.length}</div>
              <div className="superadmin-stat-desc">Ordinary registered user accounts</div>
            </div>

            <div className="superadmin-stat-card">
              <div className="superadmin-stat-header">
                <span>Active Accounts</span>
                <UserCheck size={16} style={{ color: 'hsl(140, 80%, 70%)' }} />
              </div>
              <div className="superadmin-stat-value" style={{ color: 'hsl(140, 80%, 75%)' }}>
                {activeUsersCount}
              </div>
              <div className="superadmin-stat-desc">Full library access enabled</div>
            </div>

            <div className="superadmin-stat-card">
              <div className="superadmin-stat-header">
                <span>Restricted Accounts</span>
                <UserMinus size={16} style={{ color: 'hsl(40, 90%, 70%)' }} />
              </div>
              <div className="superadmin-stat-value" style={{ color: 'hsl(40, 90%, 75%)' }}>
                {restrictedUsersCount}
              </div>
              <div className="superadmin-stat-desc">Limited account permissions</div>
            </div>

            <div className="superadmin-stat-card">
              <div className="superadmin-stat-header">
                <span>Disabled Accounts</span>
                <UserX size={16} style={{ color: 'hsl(0, 80%, 70%)' }} />
              </div>
              <div className="superadmin-stat-value" style={{ color: 'hsl(0, 80%, 75%)' }}>
                {disabledUsersCount}
              </div>
              <div className="superadmin-stat-desc">Barred from signing in</div>
            </div>
          </div>

          <div className="superadmin-privacy-banner">
            <div className="superadmin-privacy-banner-title">
              <ShieldAlert size={16} />
              <span>Privacy-By-Design Policy Enforced</span>
            </div>
            <p className="superadmin-privacy-banner-text">
              In accordance with Section 9.A of the security architecture, Super Admins have visibility into account statuses
              and activity event types (such as logins, logouts, registration, and content-change counts).
              Specific library item titles, anime/manga details, reading progress, ratings, and bookmark notes
              are confidential and strictly protected from administrative inspection.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
            <Button
              variant="primary"
              size="md"
              iconLeft={<Users size={16} />}
              onClick={() => setActiveTab('users')}
            >
              Manage Users
            </Button>
            <Button
              variant="secondary"
              size="md"
              iconLeft={<Activity size={16} />}
              onClick={() => setActiveTab('activity')}
            >
              View User Activity Feed
            </Button>
          </div>
        </div>
      )}

      {/* ── Tab Content: Users ────────────────────────────────── */}
      {activeTab === 'users' && (
        <div>
          <div className="superadmin-section-header">
            <div>
              <h2 className="superadmin-section-title">Ordinary Users</h2>
              <div className="superadmin-section-subtitle">
                Manage accounts, statuses, and session lifecycles
              </div>
            </div>
          </div>

          <div className="superadmin-table-container">
            <table className="superadmin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Library Items</th>
                  <th>Registered</th>
                  <th>Last Login</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="superadmin-name-cell">
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
                      <div className="superadmin-action-btn-group" style={{ justifyContent: 'flex-end' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft={<Eye size={13} />}
                          title="View user details"
                          onClick={() => setSelectedUser(u)}
                        >
                          Details
                        </Button>

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
                            title="Restrict user"
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
                            title="Disable user"
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
                          title="Deactivate and delete"
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

      {/* ── Tab Content: Activity ─────────────────────────────── */}
      {activeTab === 'activity' && (
        <div>
          <div className="superadmin-section-header">
            <div>
              <h2 className="superadmin-section-title">Privacy-Safe User Activity</h2>
              <div className="superadmin-section-subtitle">
                Oversight of user registrations, authentications, and library operation counts
              </div>
            </div>
          </div>

          <div className="superadmin-privacy-banner" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="superadmin-privacy-banner-title">
              <ShieldAlert size={15} />
              <span>Confidentiality Safeguard</span>
            </div>
            <p className="superadmin-privacy-banner-text">
              Title names, synopsis, personal ratings, and notes are redacted by the backend.
              Only high-level events (e.g. "User added a library item") and media types are surfaced.
            </p>
          </div>

          <div className="superadmin-table-container">
            <table className="superadmin-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>User ID</th>
                  <th>Outcome</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {activityEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>

                    <td>
                      <span style={{ fontWeight: 500, fontSize: '13px' }}>
                        {formatActionLabel(ev.eventType)}
                      </span>
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)' }}>
                      <code style={{ fontSize: '11px', color: 'hsl(215, 90%, 75%)' }}>
                        {ev.actorId.slice(0, 8)}...
                      </code>
                    </td>

                    <td>
                      {ev.outcome === 'success' ? (
                        <Badge variant="primary" size="sm">Success</Badge>
                      ) : (
                        <Badge variant="danger" size="sm">Failed</Badge>
                      )}
                    </td>

                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      {String(ev.metadata?.category || ev.metadata?.mediaType || 'General')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: User Profile Details ───────────────────────── */}
      {selectedUser && (
        <div className="superadmin-modal-backdrop" onClick={() => setSelectedUser(null)}>
          <div className="superadmin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="superadmin-modal-header">
              <h3 className="superadmin-modal-title">User Account Profile</h3>
              <button className="superadmin-modal-close-btn" onClick={() => setSelectedUser(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="superadmin-detail-grid">
              <div>
                <span className="superadmin-detail-label">Display Name</span>
                <span className="superadmin-detail-val">{selectedUser.displayName}</span>
              </div>
              <div>
                <span className="superadmin-detail-label">Username</span>
                <span className="superadmin-detail-val">@{selectedUser.username || 'unspecified'}</span>
              </div>
              <div>
                <span className="superadmin-detail-label">Email Address</span>
                <span className="superadmin-detail-val">{selectedUser.email}</span>
              </div>
              <div>
                <span className="superadmin-detail-label">Account Status</span>
                <span className="superadmin-detail-val" style={{ textTransform: 'capitalize' }}>
                  {selectedUser.status}
                </span>
              </div>
              <div>
                <span className="superadmin-detail-label">Registered At</span>
                <span className="superadmin-detail-val">{new Date(selectedUser.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="superadmin-detail-label">Last Login</span>
                <span className="superadmin-detail-val">
                  {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : 'Never'}
                </span>
              </div>
              <div>
                <span className="superadmin-detail-label">Library Data Scoping</span>
                <span className="superadmin-detail-val">
                  {selectedUser.titlesCount} titles, {selectedUser.bookmarksCount} bookmarks
                </span>
              </div>
              <div>
                <span className="superadmin-detail-label">User ID (ownerId)</span>
                <span className="superadmin-detail-val" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                  {selectedUser.id}
                </span>
              </div>
            </div>

            <div className="superadmin-modal-actions">
              <Button variant="secondary" size="sm" onClick={() => setSelectedUser(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm User Status Change ─────────────────── */}
      {userToStatusChange && (
        <div className="superadmin-modal-backdrop" onClick={() => !isSubmitting && setUserToStatusChange(null)}>
          <div className="superadmin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="superadmin-modal-header">
              <h3 className="superadmin-modal-title">Confirm Status Change</h3>
              <button
                className="superadmin-modal-close-btn"
                onClick={() => setUserToStatusChange(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Change status for <strong>{userToStatusChange.user.email}</strong> to{' '}
              <strong style={{ color: '#fff', textTransform: 'uppercase' }}>{userToStatusChange.targetStatus}</strong>?
              {userToStatusChange.targetStatus === 'disabled' && (
                <div style={{ marginTop: '8px', color: '#fca5a5' }}>
                  Disabling an account revokes active sessions immediately.
                </div>
              )}
            </div>

            <div className="superadmin-modal-actions">
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
                {isSubmitting ? 'Updating...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Delete User ────────────────────────── */}
      {userToDelete && (
        <div className="superadmin-modal-backdrop" onClick={() => !isSubmitting && setUserToDelete(null)}>
          <div className="superadmin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="superadmin-modal-header">
              <h3 className="superadmin-modal-title">Deactivate and Delete User</h3>
              <button
                className="superadmin-modal-close-btn"
                onClick={() => setUserToDelete(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to deactivate and delete user <strong>{userToDelete.email}</strong>?
              <br /><br />
              All active sessions will be terminated immediately. The user will be barred from further access.
            </div>

            <div className="superadmin-modal-actions">
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
        <div className="superadmin-modal-backdrop" onClick={() => !isSubmitting && setUserToRevoke(null)}>
          <div className="superadmin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="superadmin-modal-header">
              <h3 className="superadmin-modal-title">Revoke Active User Sessions</h3>
              <button
                className="superadmin-modal-close-btn"
                onClick={() => setUserToRevoke(null)}
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to revoke all active sessions for <strong>{userToRevoke.email}</strong>?
              The user will need to sign in again.
            </div>

            <div className="superadmin-modal-actions">
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

function formatActionLabel(eventType: string): string {
  switch (eventType) {
    case 'user.registered':
      return 'User registered';
    case 'user.logged_in':
      return 'User signed in';
    case 'user.logged_out':
      return 'User signed out';
    case 'user.library_item_added':
      return 'User added library item';
    case 'user.library_item_updated':
      return 'User edited library item';
    case 'user.library_item_removed':
      return 'User removed library item';
    case 'user.bookmark_changed':
      return 'User updated bookmark';
    case 'user.collection_changed':
      return 'User updated collection';
    case 'user.status_updated':
      return 'User account status changed';
    case 'user.deleted':
      return 'User account deleted';
    case 'user.sessions_revoked':
      return 'User sessions revoked';
    default:
      return eventType.replace(/_/g, ' ');
  }
}

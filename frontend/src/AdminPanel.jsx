import React, { useState, useEffect, useCallback } from 'react';
import './AdminPanel.css';
import {
  Shield, BarChart3, History, MessageSquareHeart, Users, Wrench,
  LogOut, Plus, Trash2, CheckCircle2, Clock, Star, RefreshCw,
  Globe, Lock, UserCheck, MessageSquare, Sparkles, AlertTriangle,
  Crown, KeyRound, Mail, User as UserIcon, Check, X, Activity
} from 'lucide-react';

const API_BASE = window.location.origin.includes(":5173") || window.location.origin.includes(":5174")
  ? `http://${window.location.hostname}:8080`
  : window.location.origin;

export default function AdminPanel() {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem("pairup_admin_token") || "");
  const [currentAdmin, setCurrentAdmin] = useState(() => {
    try {
      const saved = sessionStorage.getItem("pairup_admin_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Login State
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");

  // Navigation Tab: "analytics" | "updates" | "feedbacks" | "admins" | "maintenance"
  const [activeSection, setActiveSection] = useState("analytics");

  // Data States
  const [analytics, setAnalytics] = useState(null);
  const [updatesList, setUpdatesList] = useState([]);
  const [feedbacksList, setFeedbacksList] = useState([]);
  const [adminsList, setAdminsList] = useState([]);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [notice, setNotice] = useState(null);

  // New Update Form State
  const [updVersion, setUpdVersion] = useState("v2.5.1");
  const [updTitle, setUpdTitle] = useState("");
  const [updCategory, setUpdCategory] = useState("Feature");
  const [updDesc, setUpdDesc] = useState("");

  // Feedbacks Filter
  const [feedbackFilter, setFeedbackFilter] = useState("all");

  // Add Admin Form State (Prime Admin only)
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  // Self Profile Update State
  const [selfEmail, setSelfEmail] = useState("");
  const [selfName, setSelfName] = useState("");
  const [selfPassword, setSelfPassword] = useState("");

  const showNotice = useCallback((text, type = "success") => {
    setNotice({ text, type });
    setTimeout(() => setNotice(null), 3500);
  }, []);

  const adminHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`
  }), [adminToken]);

  const saveAdminSession = (token, adminObj) => {
    sessionStorage.setItem("pairup_admin_token", token);
    sessionStorage.setItem("pairup_admin_user", JSON.stringify(adminObj));
    setAdminToken(token);
    setCurrentAdmin(adminObj);
    setSelfEmail(adminObj?.email || "");
    setSelfName(adminObj?.name || "");
  };

  const handleAdminLogout = useCallback(() => {
    sessionStorage.removeItem("pairup_admin_token");
    sessionStorage.removeItem("pairup_admin_user");
    setAdminToken("");
    setCurrentAdmin(null);
  }, []);

  // Fetch Google Client ID for Admin OAuth
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/config`)
      .then(r => r.json())
      .then(d => setGoogleClientId(d.google_client_id || ""))
      .catch(() => {});
  }, []);

  const handleGoogleAdminCallback = useCallback(async (response) => {
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Google Admin authentication failed");
      saveAdminSession(data.access_token, data.admin);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  useEffect(() => {
    if (!adminToken && googleClientId && window.google) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleAdminCallback
        });
        const timer = setTimeout(() => {
          const btn = document.getElementById("admin-google-signin-btn");
          if (btn) {
            btn.innerHTML = "";
            window.google.accounts.id.renderButton(btn, {
              theme: "filled_black",
              size: "large",
              shape: "rectangular",
              width: 320,
              text: "signin_with"
            });
          }
        }, 80);
        return () => clearTimeout(timer);
      } catch (e) {
        console.error(e);
      }
    }
  }, [adminToken, googleClientId, handleGoogleAdminCallback]);

  const handleUsernameLogin = async (e) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) return;
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid credentials");
      saveAdminSession(data.access_token, data.admin);
      setLoginPassword("");
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Load all admin data
  const fetchAllAdminData = useCallback(async () => {
    if (!adminToken) return;
    setIsLoadingData(true);
    try {
      const [meRes, anaRes, updRes, fbRes, admRes, maintRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/me`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/analytics`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/updates`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/feedbacks`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/admins`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/maintenance`, { headers: adminHeaders() })
      ]);

      if (meRes.status === 401) {
        handleAdminLogout();
        return;
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        setCurrentAdmin(meData);
        setSelfEmail(meData.email || "");
        setSelfName(meData.name || "");
      }
      if (anaRes.ok) setAnalytics(await anaRes.json());
      if (updRes.ok) setUpdatesList(await updRes.json());
      if (fbRes.ok) setFeedbacksList(await fbRes.json());
      if (admRes.ok) setAdminsList(await admRes.json());
      if (maintRes.ok) {
        const mData = await maintRes.json();
        setMaintenanceMode(Boolean(mData.maintenance_mode));
        setMaintenanceMessage(mData.maintenance_message || "");
      }
    } catch (e) {
      console.error("Failed loading admin data:", e);
    } finally {
      setIsLoadingData(false);
    }
  }, [adminToken, adminHeaders, handleAdminLogout]);

  useEffect(() => {
    if (adminToken) {
      fetchAllAdminData();
    }
  }, [adminToken, fetchAllAdminData]);

  const formatDate = (dateInput) => {
    if (!dateInput) return "";
    let s = String(dateInput).trim();
    if ((s.includes("T") || s.includes(" ")) && !s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) {
      s = s.replace(" ", "T") + "Z";
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  };

  // ── Actions: Updates Tracker ──
  const handleAddUpdate = async (e) => {
    e.preventDefault();
    if (!updTitle.trim() || !updDesc.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/updates`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          version: updVersion.trim() || "v2.5",
          title: updTitle.trim(),
          category: updCategory,
          description: updDesc.trim()
        })
      });
      if (res.ok) {
        const created = await res.json();
        setUpdatesList(prev => [created, ...prev]);
        setUpdTitle("");
        setUpdDesc("");
        showNotice("Website update logged successfully!");
      } else {
        const err = await res.json();
        showNotice(err.detail || "Failed to log update", "error");
      }
    } catch {
      showNotice("Network error while logging update", "error");
    }
  };

  const handleDeleteUpdate = async (id) => {
    if (!window.confirm("Remove this update entry from the changelog?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/updates/${id}`, {
        method: "DELETE",
        headers: adminHeaders()
      });
      if (res.ok) {
        setUpdatesList(prev => prev.filter(item => item.id !== id));
        showNotice("Update entry deleted");
      }
    } catch {
      showNotice("Failed to delete entry", "error");
    }
  };

  // ── Actions: Feedbacks ──
  const handleToggleResolveFeedback = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/feedbacks/${id}/resolve`, {
        method: "PATCH",
        headers: adminHeaders()
      });
      if (res.ok) {
        const updated = await res.json();
        setFeedbacksList(prev => prev.map(f => f.id === id ? updated : f));
        showNotice(updated.is_resolved ? "Feedback marked as resolved" : "Feedback reopened");
      }
    } catch {
      showNotice("Error updating feedback", "error");
    }
  };

  const handleDeleteFeedback = async (id) => {
    if (!window.confirm("Delete this user feedback permanently?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/feedbacks/${id}`, {
        method: "DELETE",
        headers: adminHeaders()
      });
      if (res.ok) {
        setFeedbacksList(prev => prev.filter(f => f.id !== id));
        showNotice("Feedback deleted");
      }
    } catch {
      showNotice("Error deleting feedback", "error");
    }
  };

  // ── Actions: Admin Management ──
  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminUsername.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/admins`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          username: newAdminUsername.trim(),
          name: newAdminName.trim() || undefined,
          email: newAdminEmail.trim() || undefined,
          password: newAdminPassword || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setAdminsList(prev => [...prev, data]);
        setNewAdminUsername("");
        setNewAdminName("");
        setNewAdminEmail("");
        setNewAdminPassword("");
        showNotice(`Admin @${data.username} added!`);
      } else {
        showNotice(data.detail || "Could not add admin", "error");
      }
    } catch {
      showNotice("Network error adding admin", "error");
    }
  };

  const handleRemoveAdmin = async (adminObj) => {
    if (!window.confirm(`Remove @${adminObj.username} from administrators?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/admins/${adminObj.id}`, {
        method: "DELETE",
        headers: adminHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        setAdminsList(prev => prev.filter(a => a.id !== adminObj.id));
        showNotice(`Removed @${adminObj.username}`);
      } else {
        showNotice(data.detail || "Could not remove admin", "error");
      }
    } catch {
      showNotice("Network error removing admin", "error");
    }
  };

  const handleUpdateSelfProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/me`, {
        method: "PUT",
        headers: adminHeaders(),
        body: JSON.stringify({
          name: selfName.trim() || undefined,
          email: selfEmail.trim(),
          password: selfPassword || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentAdmin(data);
        sessionStorage.setItem("pairup_admin_user", JSON.stringify(data));
        setAdminsList(prev => prev.map(a => a.id === data.id ? data : a));
        setSelfPassword("");
        showNotice("Your admin profile was updated!");
      } else {
        showNotice(data.detail || "Update failed", "error");
      }
    } catch {
      showNotice("Network error updating profile", "error");
    }
  };

  // ── Actions: Maintenance Switch ──
  const handleSaveMaintenance = async (nextMode) => {
    const targetMode = typeof nextMode === "boolean" ? nextMode : maintenanceMode;
    try {
      const res = await fetch(`${API_BASE}/api/admin/maintenance`, {
        method: "PUT",
        headers: adminHeaders(),
        body: JSON.stringify({
          maintenance_mode: targetMode,
          maintenance_message: maintenanceMessage
        })
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceMode(Boolean(data.maintenance_mode));
        setMaintenanceMessage(data.maintenance_message || "");
        showNotice(
          data.maintenance_mode
            ? "Maintenance Mode is now ACTIVE across PairUP"
            : "Maintenance Mode turned OFF — site is live!"
        );
      } else {
        showNotice("Failed to update maintenance settings", "error");
      }
    } catch {
      showNotice("Network error updating maintenance settings", "error");
    }
  };

  // ══════════════════════════════════════════════════════════════
  // LOGIN VIEW
  // ══════════════════════════════════════════════════════════════
  if (!adminToken || !currentAdmin) {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-card">
          <div className="admin-login-badge">
            <Shield size={26} />
          </div>
          <h1 className="admin-login-title">PairUP Admin Console</h1>
          <p className="admin-login-subtitle">
            Authorized personnel only. Sign in with your admin username or linked Google account.
          </p>

          {loginError && (
            <div className="admin-alert error">
              <AlertTriangle size={16} />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleUsernameLogin} className="admin-login-form">
            <div className="admin-field">
              <label>Admin Username</label>
              <div className="admin-input-wrap">
                <UserIcon size={16} />
                <input
                  type="text"
                  placeholder="Enter username"
                  value={loginUsername}
                  onChange={e => setLoginUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="admin-field">
              <label>Password</label>
              <div className="admin-input-wrap">
                <KeyRound size={16} />
                <input
                  type="password"
                  placeholder="Enter password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button type="submit" className="admin-btn-primary full" disabled={isLoggingIn}>
              {isLoggingIn ? "Signing in..." : "Sign In to Console"}
            </button>
          </form>

          {googleClientId && (
            <>
              <div className="admin-login-divider">
                <span>OR</span>
              </div>
              <div id="admin-google-signin-btn" className="admin-google-btn-holder" />
            </>
          )}
        </div>
      </div>
    );
  }

  // Filtered feedbacks
  const filteredFeedbacks = feedbacksList.filter(fb => {
    if (feedbackFilter === "unresolved") return !fb.is_resolved;
    if (feedbackFilter === "resolved") return fb.is_resolved;
    if (["1", "2", "3", "4", "5"].includes(feedbackFilter)) {
      return fb.rating === Number(feedbackFilter);
    }
    return true;
  });

  // ══════════════════════════════════════════════════════════════
  // MAIN ADMIN PORTAL VIEW
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="admin-portal-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-icon">
            <Shield size={20} />
          </div>
          <div>
            <div className="admin-brand-title">PairUP Admin</div>
            <div className="admin-brand-sub">Control Center</div>
          </div>
        </div>

        <nav className="admin-nav">
          <button
            type="button"
            className={`admin-nav-btn ${activeSection === "analytics" ? "active" : ""}`}
            onClick={() => setActiveSection("analytics")}
          >
            <BarChart3 size={18} />
            <span>Analytics Dashboard</span>
          </button>

          <button
            type="button"
            className={`admin-nav-btn ${activeSection === "updates" ? "active" : ""}`}
            onClick={() => setActiveSection("updates")}
          >
            <History size={18} />
            <span>Website Updates</span>
            <span className="admin-nav-pill">{updatesList.length}</span>
          </button>

          <button
            type="button"
            className={`admin-nav-btn ${activeSection === "feedbacks" ? "active" : ""}`}
            onClick={() => setActiveSection("feedbacks")}
          >
            <MessageSquareHeart size={18} />
            <span>User Feedbacks</span>
            {feedbacksList.filter(f => !f.is_resolved).length > 0 && (
              <span className="admin-nav-pill highlight">
                {feedbacksList.filter(f => !f.is_resolved).length}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`admin-nav-btn ${activeSection === "admins" ? "active" : ""}`}
            onClick={() => setActiveSection("admins")}
          >
            <Users size={18} />
            <span>Admin Management</span>
          </button>

          <button
            type="button"
            className={`admin-nav-btn ${activeSection === "maintenance" ? "active" : ""}`}
            onClick={() => setActiveSection("maintenance")}
          >
            <Wrench size={18} />
            <span>Maintenance Switch</span>
            <span className={`admin-status-dot ${maintenanceMode ? "warn" : "ok"}`} />
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-chip">
            <div className="admin-user-avatar">
              {currentAdmin.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="admin-user-meta">
              <div className="admin-user-name">
                {currentAdmin.name || currentAdmin.username}
                {currentAdmin.is_prime && <Crown size={13} className="prime-crown" title="Prime Admin" />}
              </div>
              <div className="admin-user-handle">@{currentAdmin.username}</div>
            </div>
          </div>
          <button type="button" className="admin-logout-btn" onClick={handleAdminLogout} title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <h2 className="admin-page-heading">
              {activeSection === "analytics" && "Analytics & Live Overview"}
              {activeSection === "updates" && "Website Updates & Changelog Tracker"}
              {activeSection === "feedbacks" && "User Feedbacks & Ratings"}
              {activeSection === "admins" && "Administrator Management"}
              {activeSection === "maintenance" && "System Maintenance Control"}
            </h2>
            <p className="admin-page-subheading">
              {maintenanceMode ? (
                <span className="maint-banner-inline">
                  <AlertTriangle size={13} /> Maintenance Mode is currently ON
                </span>
              ) : (
                <span>System status: All services operational</span>
              )}
            </p>
          </div>

          <div className="admin-topbar-actions">
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={fetchAllAdminData}
              disabled={isLoadingData}
            >
              <RefreshCw size={15} className={isLoadingData ? "spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {notice && (
          <div className={`admin-toast ${notice.type}`}>
            {notice.type === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{notice.text}</span>
          </div>
        )}

        <div className="admin-content-scroll">
          {/* ── 1. ANALYTICS DASHBOARD ── */}
          {activeSection === "analytics" && (
            <div className="admin-section-stack">
              <div className="admin-kpi-grid">
                <div className="admin-kpi-card">
                  <div className="kpi-top">
                    <span className="kpi-label">Total Users</span>
                    <Users size={18} className="kpi-icon blue" />
                  </div>
                  <div className="kpi-value">{analytics?.users?.total ?? 0}</div>
                  <div className="kpi-sub">
                    <span>{analytics?.users?.google ?? 0} Google</span>
                    <span>•</span>
                    <span>{analytics?.users?.guest ?? 0} Instant Pass</span>
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="kpi-top">
                    <span className="kpi-label">Online Right Now</span>
                    <Activity size={18} className="kpi-icon green" />
                  </div>
                  <div className="kpi-value">{analytics?.users?.online ?? 0}</div>
                  <div className="kpi-sub">
                    <span>Active WebSocket sessions</span>
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="kpi-top">
                    <span className="kpi-label">Chat Rooms</span>
                    <Globe size={18} className="kpi-icon purple" />
                  </div>
                  <div className="kpi-value">{analytics?.rooms?.total ?? 0}</div>
                  <div className="kpi-sub">
                    <span>{analytics?.rooms?.public ?? 0} Public</span>
                    <span>•</span>
                    <span>{analytics?.rooms?.private ?? 0} Private</span>
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="kpi-top">
                    <span className="kpi-label">Total Messages</span>
                    <MessageSquare size={18} className="kpi-icon amber" />
                  </div>
                  <div className="kpi-value">{analytics?.messages?.total ?? 0}</div>
                  <div className="kpi-sub">
                    <span>{analytics?.messages?.room ?? 0} Room</span>
                    <span>•</span>
                    <span>{analytics?.messages?.direct ?? 0} DM</span>
                    <span>•</span>
                    <span>{analytics?.messages?.mate ?? 0} Mate</span>
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="kpi-top">
                    <span className="kpi-label">Friend Connections</span>
                    <UserCheck size={18} className="kpi-icon teal" />
                  </div>
                  <div className="kpi-value">{analytics?.social?.friends_accepted ?? 0}</div>
                  <div className="kpi-sub">
                    <span>{analytics?.social?.friends_pending ?? 0} pending requests</span>
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="kpi-top">
                    <span className="kpi-label">User Satisfaction</span>
                    <Star size={18} className="kpi-icon gold" />
                  </div>
                  <div className="kpi-value">
                    {analytics?.feedbacks?.average_rating ? `${analytics.feedbacks.average_rating} ★` : "—"}
                  </div>
                  <div className="kpi-sub">
                    <span>{analytics?.feedbacks?.total ?? 0} total feedbacks</span>
                  </div>
                </div>
              </div>

              <div className="admin-two-col">
                {/* Recent Users */}
                <div className="admin-panel-card">
                  <div className="admin-card-header">
                    <h3>Recent Users</h3>
                    <span className="admin-badge-subtle">Latest 8</span>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Auth</th>
                          <th>Status</th>
                          <th>Joined</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics?.recent_users || []).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="empty-cell">No users found</td>
                          </tr>
                        ) : (
                          analytics.recent_users.map(u => (
                            <tr key={u.id}>
                              <td>
                                <div className="table-user-cell">
                                  <span className="table-user-name">{u.name}</span>
                                  <span className="table-user-handle">@{u.username}</span>
                                </div>
                              </td>
                              <td>
                                <span className={`provider-pill ${u.provider}`}>
                                  {u.provider === "google" ? "Google" : "Guest"}
                                </span>
                              </td>
                              <td>
                                <span className={`online-pill ${u.is_online ? "on" : "off"}`}>
                                  {u.is_online ? "Online" : "Offline"}
                                </span>
                              </td>
                              <td className="date-cell">{formatDate(u.created_at)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Active Rooms */}
                <div className="admin-panel-card">
                  <div className="admin-card-header">
                    <h3>Rooms Breakdown</h3>
                    <span className="admin-badge-subtle">{analytics?.rooms?.total ?? 0} total</span>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Room</th>
                          <th>Type</th>
                          <th>Online</th>
                          <th>Messages</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics?.rooms_summary || []).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="empty-cell">No rooms created yet</td>
                          </tr>
                        ) : (
                          analytics.rooms_summary.map(r => (
                            <tr key={r.id}>
                              <td>
                                <div className="table-user-cell">
                                  <span className="table-user-name">{r.title}</span>
                                  <span className="table-user-handle">#{r.slug}</span>
                                </div>
                              </td>
                              <td>
                                <span className={`provider-pill ${r.is_private ? "private" : "public"}`}>
                                  {r.is_private ? "Private" : "Public"}
                                </span>
                              </td>
                              <td>{r.online_count}</td>
                              <td>{r.messages_count}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 2. WEBSITE UPDATES TRACKER ── */}
          {activeSection === "updates" && (
            <div className="admin-section-stack">
              <div className="admin-panel-card">
                <div className="admin-card-header">
                  <h3>Log a Website Update</h3>
                  <span className="admin-badge-subtle">Changelog Record</span>
                </div>
                <form onSubmit={handleAddUpdate} className="admin-form-grid">
                  <div className="admin-field">
                    <label>Version / Tag</label>
                    <input
                      type="text"
                      placeholder="e.g. v2.5.1"
                      value={updVersion}
                      onChange={e => setUpdVersion(e.target.value)}
                      className="admin-text-input"
                    />
                  </div>
                  <div className="admin-field">
                    <label>Category</label>
                    <select
                      value={updCategory}
                      onChange={e => setUpdCategory(e.target.value)}
                      className="admin-select-input"
                    >
                      <option value="Feature">Feature</option>
                      <option value="UI/UX">UI/UX</option>
                      <option value="Bug Fix">Bug Fix</option>
                      <option value="Backend">Backend</option>
                      <option value="Security">Security</option>
                    </select>
                  </div>
                  <div className="admin-field span-2">
                    <label>Update Title</label>
                    <input
                      type="text"
                      placeholder="Brief summary of the update you deployed..."
                      value={updTitle}
                      onChange={e => setUpdTitle(e.target.value)}
                      required
                      className="admin-text-input"
                    />
                  </div>
                  <div className="admin-field span-2">
                    <label>Detailed Description</label>
                    <textarea
                      rows={3}
                      placeholder="Describe what was added, fixed, or changed on the website..."
                      value={updDesc}
                      onChange={e => setUpdDesc(e.target.value)}
                      required
                      className="admin-textarea-input"
                    />
                  </div>
                  <div className="span-2" style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" className="admin-btn-primary">
                      <Plus size={16} /> Record Update
                    </button>
                  </div>
                </form>
              </div>

              <div className="admin-panel-card">
                <div className="admin-card-header">
                  <h3>Recorded Website Updates ({updatesList.length})</h3>
                </div>
                <div className="updates-timeline">
                  {updatesList.length === 0 ? (
                    <div className="admin-empty-state">No updates recorded yet.</div>
                  ) : (
                    updatesList.map(item => (
                      <div key={item.id} className="update-timeline-item">
                        <div className="update-item-top">
                          <div className="update-badges">
                            {item.version && <span className="version-badge">{item.version}</span>}
                            <span className={`category-badge ${item.category.toLowerCase().replace(/[^a-z]/g, "")}`}>
                              {item.category}
                            </span>
                            <h4 className="update-item-title">{item.title}</h4>
                          </div>
                          <div className="update-item-meta">
                            <span>by @{item.author_username}</span>
                            <span>•</span>
                            <span>{formatDate(item.created_at)}</span>
                            <button
                              type="button"
                              className="admin-icon-btn danger"
                              onClick={() => handleDeleteUpdate(item.id)}
                              title="Delete entry"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <p className="update-item-desc">{item.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── 3. USER FEEDBACKS PAGE ── */}
          {activeSection === "feedbacks" && (
            <div className="admin-section-stack">
              <div className="admin-panel-card">
                <div className="feedbacks-header-bar">
                  <div className="feedback-score-summary">
                    <div className="feedback-big-score">
                      <span>{analytics?.feedbacks?.average_rating || "0.0"}</span>
                      <Star size={22} fill="#f59e0b" color="#f59e0b" />
                    </div>
                    <div className="feedback-score-meta">
                      <strong>{feedbacksList.length} Total Submissions</strong>
                      <span>{feedbacksList.filter(f => !f.is_resolved).length} awaiting review</span>
                    </div>
                  </div>

                  <div className="feedback-filters">
                    {[
                      { id: "all", label: "All" },
                      { id: "unresolved", label: "Unresolved" },
                      { id: "resolved", label: "Resolved" },
                      { id: "5", label: "5 ★" },
                      { id: "4", label: "4 ★" },
                      { id: "3", label: "3 ★" },
                      { id: "2", label: "2 ★" },
                      { id: "1", label: "1 ★" }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`feedback-filter-pill ${feedbackFilter === tab.id ? "active" : ""}`}
                        onClick={() => setFeedbackFilter(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="feedbacks-grid">
                {filteredFeedbacks.length === 0 ? (
                  <div className="admin-panel-card admin-empty-state">
                    No feedbacks match the selected filter.
                  </div>
                ) : (
                  filteredFeedbacks.map(fb => (
                    <div key={fb.id} className={`feedback-item-card ${fb.is_resolved ? "resolved" : ""}`}>
                      <div className="feedback-card-top">
                        <div className="feedback-user">
                          <div className="feedback-avatar">
                            {(fb.user_name || "U").slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="feedback-user-name">{fb.user_name || "Anonymous"}</div>
                            <div className="feedback-user-handle">@{fb.user_username || "guest"}</div>
                          </div>
                        </div>

                        <div className="feedback-stars" title={`${fb.rating} out of 5 stars`}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star
                              key={s}
                              size={15}
                              fill={s <= fb.rating ? "#f59e0b" : "transparent"}
                              color={s <= fb.rating ? "#f59e0b" : "#52525b"}
                            />
                          ))}
                        </div>
                      </div>

                      <p className="feedback-comment-body">{fb.comment}</p>

                      <div className="feedback-card-footer">
                        <span className="feedback-date">{formatDate(fb.created_at)}</span>
                        <div className="feedback-actions">
                          <button
                            type="button"
                            className={`admin-btn-xs ${fb.is_resolved ? "neutral" : "success"}`}
                            onClick={() => handleToggleResolveFeedback(fb.id)}
                          >
                            <Check size={13} />
                            <span>{fb.is_resolved ? "Resolved" : "Mark Resolved"}</span>
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn danger"
                            onClick={() => handleDeleteFeedback(fb.id)}
                            title="Delete feedback"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── 4. ADMIN MANAGEMENT ── */}
          {activeSection === "admins" && (
            <div className="admin-section-stack">
              <div className="admin-two-col">
                {/* Add New Admin (Prime Admin Only) */}
                <div className="admin-panel-card">
                  <div className="admin-card-header">
                    <h3>Add Administrator</h3>
                    {currentAdmin.is_prime ? (
                      <span className="prime-badge"><Crown size={12} /> Prime Admin Access</span>
                    ) : (
                      <span className="admin-badge-subtle">Prime Admin Only</span>
                    )}
                  </div>

                  {!currentAdmin.is_prime ? (
                    <p className="admin-muted-note">
                      Only the Prime Admin (@sandeep) has permission to add or remove administrators.
                    </p>
                  ) : (
                    <form onSubmit={handleCreateAdmin} className="admin-stack-form">
                      <div className="admin-field">
                        <label>Username *</label>
                        <input
                          type="text"
                          placeholder="e.g. rahul"
                          value={newAdminUsername}
                          onChange={e => setNewAdminUsername(e.target.value)}
                          required
                          className="admin-text-input"
                        />
                      </div>
                      <div className="admin-field">
                        <label>Display Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Rahul Sharma"
                          value={newAdminName}
                          onChange={e => setNewAdminName(e.target.value)}
                          className="admin-text-input"
                        />
                      </div>
                      <div className="admin-field">
                        <label>Google Email (for Google OAuth Login)</label>
                        <input
                          type="email"
                          placeholder="admin@gmail.com"
                          value={newAdminEmail}
                          onChange={e => setNewAdminEmail(e.target.value)}
                          className="admin-text-input"
                        />
                      </div>
                      <div className="admin-field">
                        <label>Password (for Username Login)</label>
                        <input
                          type="password"
                          placeholder="Set password (optional if Google email set)"
                          value={newAdminPassword}
                          onChange={e => setNewAdminPassword(e.target.value)}
                          className="admin-text-input"
                        />
                      </div>
                      <button type="submit" className="admin-btn-primary">
                        <Plus size={16} /> Add Administrator
                      </button>
                    </form>
                  )}
                </div>

                {/* Update My Admin Profile */}
                <div className="admin-panel-card">
                  <div className="admin-card-header">
                    <h3>My Admin Credentials (@{currentAdmin.username})</h3>
                  </div>
                  <form onSubmit={handleUpdateSelfProfile} className="admin-stack-form">
                    <div className="admin-field">
                      <label>Display Name</label>
                      <input
                        type="text"
                        value={selfName}
                        onChange={e => setSelfName(e.target.value)}
                        className="admin-text-input"
                      />
                    </div>
                    <div className="admin-field">
                      <label>Linked Google Email (enables 1-click Google OAuth login)</label>
                      <input
                        type="email"
                        placeholder="your.email@gmail.com"
                        value={selfEmail}
                        onChange={e => setSelfEmail(e.target.value)}
                        className="admin-text-input"
                      />
                    </div>
                    <div className="admin-field">
                      <label>New Password (leave blank to keep current)</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={selfPassword}
                        onChange={e => setSelfPassword(e.target.value)}
                        className="admin-text-input"
                      />
                    </div>
                    <button type="submit" className="admin-btn-secondary">
                      Save My Credentials
                    </button>
                  </form>
                </div>
              </div>

              {/* Administrators List */}
              <div className="admin-panel-card">
                <div className="admin-card-header">
                  <h3>Registered Administrators ({adminsList.length})</h3>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Admin</th>
                        <th>Role</th>
                        <th>Google OAuth Email</th>
                        <th>Added By</th>
                        <th>Created</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminsList.map(adm => (
                        <tr key={adm.id}>
                          <td>
                            <div className="table-user-cell">
                              <span className="table-user-name">{adm.name || adm.username}</span>
                              <span className="table-user-handle">@{adm.username}</span>
                            </div>
                          </td>
                          <td>
                            {adm.is_prime ? (
                              <span className="prime-badge"><Crown size={12} /> Prime Admin</span>
                            ) : (
                              <span className="provider-pill public">Admin</span>
                            )}
                          </td>
                          <td>{adm.email || <span style={{ opacity: 0.4 }}>Not linked</span>}</td>
                          <td>{adm.added_by ? `@${adm.added_by}` : "System"}</td>
                          <td className="date-cell">{formatDate(adm.created_at)}</td>
                          <td>
                            {currentAdmin.is_prime && !adm.is_prime && (
                              <button
                                type="button"
                                className="admin-icon-btn danger"
                                onClick={() => handleRemoveAdmin(adm)}
                                title="Remove Admin"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── 5. MAINTENANCE SWITCH ── */}
          {activeSection === "maintenance" && (
            <div className="admin-section-stack">
              <div className="admin-panel-card maintenance-control-card">
                <div className="maintenance-status-banner">
                  <div className={`maintenance-indicator ${maintenanceMode ? "active" : "inactive"}`}>
                    <Wrench size={24} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3>
                      {maintenanceMode
                        ? "Maintenance Mode is Currently ACTIVE"
                        : "Website is Live & Operational"}
                    </h3>
                    <p>
                      {maintenanceMode
                        ? "Visitors and users are currently seeing the maintenance screen. The /admin console remains accessible."
                        : "All users can access PairUP rooms, direct messages, Explore, and Mate normally."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`maintenance-toggle-btn ${maintenanceMode ? "turn-off" : "turn-on"}`}
                    onClick={() => handleSaveMaintenance(!maintenanceMode)}
                  >
                    {maintenanceMode ? "Turn OFF Maintenance" : "Turn ON Maintenance"}
                  </button>
                </div>

                <div className="admin-field" style={{ marginTop: "22px" }}>
                  <label>Public Maintenance Message</label>
                  <textarea
                    rows={3}
                    value={maintenanceMessage}
                    onChange={e => setMaintenanceMessage(e.target.value)}
                    placeholder="Message displayed to users while maintenance mode is enabled..."
                    className="admin-textarea-input"
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="admin-btn-primary"
                    onClick={() => handleSaveMaintenance(maintenanceMode)}
                  >
                    Save Maintenance Message
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


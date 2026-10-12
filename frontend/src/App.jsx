import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { 
  Hash, 
  MessageSquare, 
  Users, 
  Send, 
  Plus, 
  LogOut, 
  Search,
  UserPlus,
  Check,
  X,
  UserCheck,
  Clock,
  Sparkles,
  Edit3
} from 'lucide-react';

const API_BASE = window.location.origin.includes(":5173") ? "" : "http://localhost:8080";
const WS_BASE = window.location.origin.includes(":5173") 
  ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
  : "ws://localhost:8080";

export default function App() {
  // Authentication State
  const [token, setToken] = useState(() => localStorage.getItem("pairup_token") || "");
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem("pairup_user");
    return saved ? JSON.parse(saved) : null;
  });

  // Google OAuth Config
  const [googleClientId, setGoogleClientId] = useState("");
  const [demoUsername, setDemoUsername] = useState("");
  const [demoName, setDemoName] = useState("");
  const [demoGender, setDemoGender] = useState("Prefer not to say");
  const [authError, setAuthError] = useState("");

  // Navigation: "room", "direct", or "explore"
  const [viewMode, setViewMode] = useState("chat"); // "chat" or "explore"
  const [activeTab, setActiveTab] = useState({ type: "room", id: "general", data: null });

  // Data
  const [rooms, setRooms] = useState([]);
  const [directConversations, setDirectConversations] = useState([]);
  const [exploreUsersList, setExploreUsersList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  // Input & Typing
  const [inputMessage, setInputMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimeoutRef = useRef(null);

  // Profile Modal State (Viewing target profile or editing own profile)
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editGender, setEditGender] = useState("Prefer not to say");
  const [editBio, setEditBio] = useState("");
  const [editInterests, setEditInterests] = useState("");

  // Create Room Modal
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [newRoomSlug, setNewRoomSlug] = useState("");
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomTopic, setNewRoomTopic] = useState("");

  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  // 1. Fetch OAuth Config
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/config`)
      .then(res => res.json())
      .then(data => {
        setGoogleClientId(data.google_client_id);
      })
      .catch(err => console.error(err));
  }, []);

  // 2. Render Google Button if configured and not logged in
  useEffect(() => {
    if (!token && googleClientId && window.google) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
        });
        const btnContainer = document.getElementById("google-signin-btn");
        if (btnContainer) {
          window.google.accounts.id.renderButton(btnContainer, {
            theme: "outline",
            size: "large",
            shape: "rectangular",
            width: 340,
            text: "continue_with"
          });
        }
      } catch (e) {
        console.error("Google Init Error:", e);
      }
    }
  }, [token, googleClientId]);

  const handleGoogleCredentialResponse = async (response) => {
    setAuthError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Google login failed");
      saveAuthSession(data.access_token, data.user);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleDemoLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!demoUsername.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/auth/demo-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: demoUsername.trim(),
          name: demoName.trim() || undefined,
          gender: demoGender
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");
      saveAuthSession(data.access_token, data.user);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const saveAuthSession = (jwtToken, user) => {
    setToken(jwtToken);
    setCurrentUser(user);
    localStorage.setItem("pairup_token", jwtToken);
    localStorage.setItem("pairup_user", JSON.stringify(user));
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {}
    }
    if (wsRef.current) wsRef.current.close();
    setToken("");
    setCurrentUser(null);
    localStorage.removeItem("pairup_token");
    localStorage.removeItem("pairup_user");
  };

  // 3. Load Rooms and Direct Conversations
  const refreshDirectConversations = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/direct-conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDirectConversations(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadRooms = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`);
      if (res.ok) {
        const data = await res.json();
        setRooms(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadRooms();
    refreshDirectConversations();
  }, [token]);

  // 4. Explore section user search
  const loadExploreUsers = async (query = "") => {
    if (!token) return;
    try {
      const url = query 
        ? `${API_BASE}/api/explore-users?query=${encodeURIComponent(query)}`
        : `${API_BASE}/api/explore-users`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExploreUsersList(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (viewMode === "explore" && token) {
      loadExploreUsers(searchQuery);
    }
  }, [viewMode, searchQuery, token]);

  // 5. WebSocket Gateway
  useEffect(() => {
    if (!token || !currentUser) return;

    const ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (activeTab.type === "room") {
        ws.send(JSON.stringify({
          action: "join_room",
          room_slug: activeTab.id
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          setOnlineUserIds(new Set(data.online_users));
        } else if (data.type === "user_status") {
          setOnlineUserIds(prev => {
            const next = new Set(prev);
            if (data.status === "online") next.add(data.user_id);
            else next.delete(data.user_id);
            return next;
          });
        } else if (data.type === "room_message") {
          if (activeTab.type === "room" && activeTab.id.toLowerCase() === data.room_slug.toLowerCase()) {
            setMessages(prev => [...prev, data]);
          }
        } else if (data.type === "room_notice") {
          if (activeTab.type === "room" && activeTab.id.toLowerCase() === data.room_slug.toLowerCase()) {
            setMessages(prev => [...prev, { isNotice: true, text: data.notice, id: Math.random() }]);
          }
        } else if (data.type === "direct_message") {
          refreshDirectConversations();
          const isCurrentConvo = 
            (activeTab.type === "direct" && (activeTab.id === data.sender_id || activeTab.id === data.recipient_id));
          if (isCurrentConvo) {
            setMessages(prev => [...prev, data]);
          }
        } else if (data.type === "error") {
          alert(data.message);
        } else if (data.type === "typing_status") {
          if (data.is_typing) {
            setTypingUsers(prev => ({ ...prev, [data.user_id]: data.name }));
            setTimeout(() => {
              setTypingUsers(prev => {
                const next = { ...prev };
                delete next[data.user_id];
                return next;
              });
            }, 3000);
          } else {
            setTypingUsers(prev => {
              const next = { ...prev };
              delete next[data.user_id];
              return next;
            });
          }
        }
      } catch (e) {
        console.error("WS error:", e);
      }
    };

    return () => {
      ws.close();
    };
  }, [token, activeTab.type, activeTab.id]);

  // 6. Navigation tabs
  const selectTab = async (type, id, dataObj) => {
    setViewMode("chat");
    setActiveTab({ type, id, data: dataObj });
    setMessages([]);

    if (type === "room") {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          action: "join_room",
          room_slug: id
        }));
      }
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${id}/messages`);
        if (res.ok) setMessages(await res.json());
      } catch (err) {}
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/direct/${id}/messages`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) setMessages(await res.json());
      } catch (err) {}
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 7. Send message
  const handleSendMessage = (e) => {
    e.preventDefault();
    const content = inputMessage.trim();
    if (!content || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    if (activeTab.type === "room") {
      wsRef.current.send(JSON.stringify({
        action: "send_room_message",
        room_slug: activeTab.id,
        content: content
      }));
    } else {
      wsRef.current.send(JSON.stringify({
        action: "send_direct_message",
        recipient_id: activeTab.id,
        content: content
      }));
    }
    setInputMessage("");
  };

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (!typingTimeoutRef.current) {
        wsRef.current.send(JSON.stringify({
          action: "typing",
          room_slug: activeTab.type === "room" ? activeTab.id : undefined,
          recipient_id: activeTab.type === "direct" ? activeTab.id : undefined,
          is_typing: true
        }));
      }
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
      }, 2500);
    }
  };

  // 8. Open Profile Modal (Target user or Self)
  const openUserProfile = async (userId) => {
    setViewingProfileId(userId);
    setIsEditingProfile(false);
    try {
      const res = await fetch(`${API_BASE}/api/users/${userId}/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
        if (userId === currentUser.id) {
          setEditName(data.user.name);
          setEditUsername(data.user.username);
          setEditGender(data.user.gender || "Prefer not to say");
          setEditBio(data.user.bio || "");
          setEditInterests(data.user.interests || "");
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 9. Friend Request Actions
  const handleSendFriendRequest = async (targetUserId) => {
    if (currentUser.provider === "demo") {
      alert("Instant Pass guests cannot add friends. Please sign in with Google to connect!");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/friends/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ addressee_id: targetUserId })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || "Could not send friend request");
      } else {
        if (viewingProfileId === targetUserId) {
          openUserProfile(targetUserId);
        }
        loadExploreUsers(searchQuery);
      }
    } catch (e) {
      alert("Network error sending request");
    }
  };

  const handleRespondFriendRequest = async (requestId, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/friends/respond/${requestId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        if (viewingProfileId) openUserProfile(viewingProfileId);
        refreshDirectConversations();
      }
    } catch (e) {}
  };

  // 10. Update Profile (Username, Display Name, Gender, Bio, Interests)
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editName,
          username: editUsername,
          gender: editGender,
          bio: editBio,
          interests: editInterests
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || "Could not update profile");
      } else {
        setCurrentUser(data);
        localStorage.setItem("pairup_user", JSON.stringify(data));
        setIsEditingProfile(false);
        openUserProfile(currentUser.id);
      }
    } catch (e) {
      alert("Error saving profile");
    }
  };

  // 11. Create Room
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomSlug.trim() || !newRoomTitle.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          slug: newRoomSlug.trim().toLowerCase(),
          title: newRoomTitle.trim(),
          topic: newRoomTopic.trim() || undefined
        })
      });
      if (res.ok) {
        const created = await res.json();
        setRooms(prev => [...prev, created]);
        setIsCreateRoomOpen(false);
        setNewRoomSlug("");
        setNewRoomTitle("");
        setNewRoomTopic("");
        selectTab("room", created.slug, created);
      } else {
        const err = await res.json();
        alert(err.detail || "Could not create room");
      }
    } catch (err) {
      alert("Network error");
    }
  };

  const getGenderBadgeClass = (gender) => {
    const g = (gender || "").toLowerCase();
    if (g === "male") return "gender-badge male";
    if (g === "female") return "gender-badge female";
    if (g === "other") return "gender-badge other";
    return "gender-badge neutral";
  };

  // -------------------------------------------------------------
  // LOGIN SCREEN
  // -------------------------------------------------------------
  if (!token || !currentUser) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ textAlign: "center", marginBottom: "26px" }}>
            <h1 className="brand-gradient" style={{ fontSize: "2.4rem", marginBottom: "6px" }}>
              PairUP
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
              Connect and pair up in real-time rooms and direct conversations.
            </p>
          </div>

          {authError && (
            <div style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              padding: "10px 14px",
              borderRadius: "8px",
              color: "#f87171",
              fontSize: "0.85rem",
              marginBottom: "16px"
            }}>
              {authError}
            </div>
          )}

          {/* Google Sign-in */}
          <div>
            <div id="google-signin-btn" style={{ display: "flex", justifyContent: "center", minHeight: "44px" }}></div>
          </div>

          <div className="divider">Or Continue With Instant Pass</div>

          {/* Instant Pass */}
          <form onSubmit={handleDemoLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <input
                type="text"
                placeholder="Choose Username"
                value={demoUsername}
                onChange={e => setDemoUsername(e.target.value)}
                required
                className="chat-input"
                style={{
                  width: "100%",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)",
                  padding: "11px 14px",
                  borderRadius: "10px"
                }}
              />
            </div>

            <div>
              <input
                type="text"
                placeholder="Display Name (Optional)"
                value={demoName}
                onChange={e => setDemoName(e.target.value)}
                className="chat-input"
                style={{
                  width: "100%",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)",
                  padding: "11px 14px",
                  borderRadius: "10px"
                }}
              />
            </div>

            <div>
              <select
                value={demoGender}
                onChange={e => setDemoGender(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-input)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-subtle)",
                  padding: "11px 14px",
                  borderRadius: "10px",
                  outline: "none"
                }}
              >
                <option value="Prefer not to say">Gender: Prefer not to say</option>
                <option value="Male">Gender: Male</option>
                <option value="Female">Gender: Female</option>
                <option value="Other">Gender: Other</option>
              </select>
            </div>

            <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "6px" }}>
              Enter PairUP
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Active chat metadata
  const activeRoom = rooms.find(r => r.slug === activeTab.id) || {
    slug: activeTab.id,
    title: `#${activeTab.id}`,
    topic: "Public Chat Room"
  };

  const activeDirectUser = directConversations.find(u => u.id === activeTab.id) || activeTab.data;

  // -------------------------------------------------------------
  // MAIN APP INTERFACE
  // -------------------------------------------------------------
  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand-header">
          <div className="brand-logo" onClick={() => setViewMode("chat")}>
            <h1 className="brand-gradient">PairUP</h1>
          </div>
          <button 
            className="btn-section-action" 
            title="Explore Friends"
            onClick={() => {
              setViewMode("explore");
              loadExploreUsers(searchQuery);
            }}
          >
            <Users size={18} />
          </button>
        </div>

        <div className="sidebar-scroll">
          {/* Chat Rooms */}
          <div>
            <div className="section-label">
              <span>Rooms</span>
              <button className="btn-section-action" title="Create Room" onClick={() => setIsCreateRoomOpen(true)}>
                <Plus size={15} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {rooms.map(room => {
                const isActive = viewMode === "chat" && activeTab.type === "room" && activeTab.id === room.slug;
                return (
                  <div
                    key={room.slug}
                    className={`nav-item ${isActive ? "active" : ""}`}
                    onClick={() => selectTab("room", room.slug, room)}
                  >
                    <Hash size={17} color={isActive ? "var(--accent-primary)" : "var(--text-dim)"} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {room.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Direct Messages (Only Initiated Conversations) */}
          <div>
            <div className="section-label">
              <span>Direct Messages</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {directConversations.length === 0 ? (
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", padding: "10px 8px" }}>
                  No active chats. Head over to <strong>Explore Friends</strong> to find connections!
                </div>
              ) : (
                directConversations.map(u => {
                  const isActive = viewMode === "chat" && activeTab.type === "direct" && activeTab.id === u.id;
                  const isOnline = onlineUserIds.has(u.id);
                  return (
                    <div
                      key={u.id}
                      className={`nav-item ${isActive ? "active" : ""}`}
                      onClick={() => selectTab("direct", u.id, u)}
                    >
                      <div 
                        className="user-avatar" 
                        onClick={(e) => {
                          e.stopPropagation();
                          openUserProfile(u.id);
                        }}
                      >
                        <img src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`} alt={u.name} />
                        <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                      </div>
                      <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.name}
                      </div>
                      {u.gender && (
                        <span className={getGenderBadgeClass(u.gender)} style={{ fontSize: "0.65rem", padding: "1px 6px" }}>
                          {u.gender}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Current User Profile Bar */}
        <div className="user-profile-bar">
          <div className="profile-info" onClick={() => openUserProfile(currentUser.id)}>
            <div className="user-avatar">
              <img 
                src={currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.username}`} 
                alt={currentUser.name} 
              />
              <span className="status-dot online" />
            </div>
            <div className="profile-details">
              <span className="profile-name">{currentUser.name}</span>
              <span className="profile-handle">@{currentUser.username}</span>
            </div>
          </div>
          <button className="btn-icon" title="Log Out" onClick={handleLogout}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {/* MAIN STAGE */}
      {viewMode === "explore" ? (
        /* EXPLORE FRIENDS SECTION */
        <main className="explore-stage">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700 }}>
                Explore Friends
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "2px" }}>
                Discover people, search by username, and send friend requests to chat.
              </p>
            </div>
            <button className="btn-secondary" onClick={() => setViewMode("chat")}>
              Back to Chat
            </button>
          </div>

          {/* Search Bar */}
          <div className="explore-search-bar">
            <Search size={18} color="var(--text-dim)" />
            <input
              type="text"
              placeholder="Search by username or display name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="chat-input"
            />
          </div>

          {/* User Cards Grid */}
          <div className="explore-grid">
            {exploreUsersList.map(u => (
              <div key={u.id} className="user-card">
                <div className="user-card-header" onClick={() => openUserProfile(u.id)}>
                  <div className="user-avatar" style={{ width: "42px", height: "42px" }}>
                    <img src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`} alt={u.name} />
                  </div>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>
                      {u.name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      @{u.username}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span className={getGenderBadgeClass(u.gender)}>
                    {u.gender || "Prefer not to say"}
                  </span>
                </div>

                {u.bio && (
                  <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineClamp: 2, overflow: "hidden" }}>
                    {u.bio}
                  </p>
                )}

                <div style={{ marginTop: "auto", display: "flex", gap: "8px" }}>
                  <button 
                    className="btn-primary" 
                    style={{ flex: 1, padding: "8px 12px", fontSize: "0.82rem" }}
                    onClick={() => handleSendFriendRequest(u.id)}
                  >
                    <UserPlus size={14} /> Add Friend
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: "8px 12px", fontSize: "0.82rem" }}
                    onClick={() => openUserProfile(u.id)}
                  >
                    Profile
                  </button>
                </div>
              </div>
            ))}
          </div>
        </main>
      ) : (
        /* CHAT STAGE */
        <main className="chat-stage">
          {/* Header with Gender display and no email */}
          <header className="chat-header">
            <div className="header-title-box">
              {activeTab.type === "direct" && activeDirectUser && (
                <div 
                  className="user-avatar" 
                  style={{ width: "38px", height: "38px" }}
                  onClick={() => openUserProfile(activeDirectUser.id)}
                >
                  <img 
                    src={activeDirectUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${activeDirectUser.username}`} 
                    alt={activeDirectUser.name} 
                  />
                </div>
              )}
              <div>
                <h2>
                  {activeTab.type === "room" ? activeRoom.title : activeDirectUser?.name}
                  {activeTab.type === "direct" && activeDirectUser?.gender && (
                    <span className={getGenderBadgeClass(activeDirectUser.gender)}>
                      {activeDirectUser.gender}
                    </span>
                  )}
                </h2>
                <div className="header-topic">
                  {activeTab.type === "room" 
                    ? (activeRoom.topic || "Room discussions") 
                    : `@${activeDirectUser?.username || "user"}`}
                </div>
              </div>
            </div>

            {activeTab.type === "direct" && activeDirectUser && (
              <button 
                className="btn-secondary" 
                onClick={() => openUserProfile(activeDirectUser.id)}
              >
                View Profile
              </button>
            )}
          </header>

          {/* Message Feed */}
          <div className="messages-feed">
            {messages.length === 0 ? (
              <div style={{ margin: "auto", textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
                <p>No messages here yet. Say hello!</p>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.isNotice) {
                  return (
                    <div key={msg.id} style={{ alignSelf: "center", fontSize: "0.76rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {msg.text}
                    </div>
                  );
                }

                const isOutgoing = msg.sender_id === currentUser.id;
                const formattedTime = msg.created_at 
                  ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : "";

                return (
                  <div key={msg.id || Math.random()} className={`message-card ${isOutgoing ? "outgoing" : ""}`}>
                    <div 
                      className="user-avatar" 
                      style={{ width: "34px", height: "34px" }}
                      onClick={() => openUserProfile(msg.sender_id)}
                      title="View Profile"
                    >
                      <img 
                        src={msg.sender_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.sender_username || "user"}`} 
                        alt={msg.sender_name} 
                      />
                    </div>
                    <div className="msg-bubble">
                      <div className="msg-header">
                        <span className="msg-sender" onClick={() => openUserProfile(msg.sender_id)}>
                          {isOutgoing ? "You" : msg.sender_name}
                        </span>
                        {msg.sender_gender && (
                          <span className={getGenderBadgeClass(msg.sender_gender)} style={{ fontSize: "0.62rem", padding: "1px 5px" }}>
                            {msg.sender_gender}
                          </span>
                        )}
                        <span className="msg-time">{formattedTime}</span>
                      </div>
                      <div className="msg-text">{msg.content}</div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing status */}
          <div className="typing-bar">
            {Object.keys(typingUsers).length > 0 && (
              <span>{Object.values(typingUsers).join(", ")} is typing...</span>
            )}
          </div>

          {/* Input Bar */}
          <div className="chat-input-container">
            <form className="chat-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                className="chat-input"
                placeholder={
                  activeTab.type === "room"
                    ? `Message #${activeRoom.slug}...`
                    : `Message ${activeDirectUser?.name || "user"}...`
                }
                value={inputMessage}
                onChange={handleInputChange}
                maxLength={5000}
              />
              <button type="submit" className="btn-send" disabled={!inputMessage.trim()} title="Send">
                <Send size={16} />
              </button>
            </form>
          </div>
        </main>
      )}

      {/* USER PROFILE MODAL */}
      {viewingProfileId && profileData && (
        <div className="modal-overlay" onClick={() => setViewingProfileId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.2rem" }}>
                {viewingProfileId === currentUser.id ? "Your Profile" : "Profile"}
              </h3>
              <button className="btn-icon" onClick={() => setViewingProfileId(null)}>
                <X size={18} />
              </button>
            </div>

            {viewingProfileId === currentUser.id && isEditingProfile ? (
              /* Profile Edit Form */
              <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="profile-field-group">
                  <label className="profile-field-label">Display Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    required
                    className="chat-input profile-field-val"
                  />
                </div>

                <div className="profile-field-group">
                  <label className="profile-field-label">Username</label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={e => setEditUsername(e.target.value)}
                    required
                    className="chat-input profile-field-val"
                  />
                </div>

                <div className="profile-field-group">
                  <label className="profile-field-label">Gender</label>
                  <select
                    value={editGender}
                    onChange={e => setEditGender(e.target.value)}
                    className="profile-field-val"
                    style={{ outline: "none" }}
                  >
                    <option value="Prefer not to say">Prefer not to say</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="profile-field-group">
                  <label className="profile-field-label">Bio</label>
                  <textarea
                    rows={3}
                    value={editBio}
                    onChange={e => setEditBio(e.target.value)}
                    className="chat-input profile-field-val"
                    style={{ resize: "none" }}
                  />
                </div>

                <div className="profile-field-group">
                  <label className="profile-field-label">Interests</label>
                  <input
                    type="text"
                    placeholder="e.g. Design, React, Gaming"
                    value={editInterests}
                    onChange={e => setEditInterests(e.target.value)}
                    className="chat-input profile-field-val"
                  />
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                    Save Profile
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setIsEditingProfile(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              /* Profile View Card */
              <div>
                <div className="profile-hero">
                  <div className="profile-avatar-lg">
                    <img 
                      src={profileData.user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${profileData.user.username}`} 
                      alt={profileData.user.name} 
                    />
                  </div>
                  <div>
                    <h4 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff" }}>
                      {profileData.user.name}
                    </h4>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginBottom: "6px" }}>
                      @{profileData.user.username}
                    </div>
                    <span className={getGenderBadgeClass(profileData.user.gender)}>
                      {profileData.user.gender || "Prefer not to say"}
                    </span>
                  </div>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Bio</span>
                  <div className="profile-field-val">
                    {profileData.user.bio || "No bio yet."}
                  </div>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Interests</span>
                  <div className="profile-field-val">
                    {profileData.user.interests || "No interests specified."}
                  </div>
                </div>

                {/* Friends With List */}
                <div className="profile-field-group">
                  <span className="profile-field-label">
                    Friends With ({profileData.friends_count})
                  </span>
                  {profileData.friends.length === 0 ? (
                    <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", padding: "6px 0" }}>
                      No friends yet.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
                      {profileData.friends.map(f => (
                        <div 
                          key={f.id}
                          className="btn-secondary"
                          style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                          onClick={() => openUserProfile(f.id)}
                        >
                          @{f.username}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pending Requests (Visible on own profile) */}
                {viewingProfileId === currentUser.id && profileData.pending_requests && profileData.pending_requests.length > 0 && (
                  <div className="profile-field-group" style={{ marginTop: "14px" }}>
                    <span className="profile-field-label">
                      Pending Friend Requests ({profileData.pending_requests.length})
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                      {profileData.pending_requests.map(req => (
                        <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-input)", padding: "8px 12px", borderRadius: "8px" }}>
                          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                            @{req.requester?.username}
                          </span>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button 
                              className="btn-primary" 
                              style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                              onClick={() => handleRespondFriendRequest(req.id, "accepted")}
                            >
                              <Check size={12} /> Accept
                            </button>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                              onClick={() => handleRespondFriendRequest(req.id, "declined")}
                            >
                              <X size={12} /> Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
                  {viewingProfileId === currentUser.id ? (
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsEditingProfile(true)}>
                      <Edit3 size={15} /> Edit Profile
                    </button>
                  ) : (
                    <>
                      {profileData.friendship_status === "accepted" ? (
                        <button 
                          className="btn-primary" 
                          style={{ flex: 1 }}
                          onClick={() => {
                            setViewingProfileId(null);
                            selectTab("direct", profileData.user.id, profileData.user);
                          }}
                        >
                          <MessageSquare size={15} /> Chat
                        </button>
                      ) : profileData.friendship_status === "pending_sent" ? (
                        <button className="btn-secondary" style={{ flex: 1 }} disabled>
                          <Clock size={15} /> Request Pending
                        </button>
                      ) : profileData.friendship_status === "pending_received" ? (
                        <button className="btn-primary" style={{ flex: 1 }} onClick={() => openUserProfile(currentUser.id)}>
                          Respond in Requests
                        </button>
                      ) : (
                        <button 
                          className="btn-primary" 
                          style={{ flex: 1 }}
                          onClick={() => handleSendFriendRequest(profileData.user.id)}
                        >
                          <UserPlus size={15} /> Add Friend
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE ROOM MODAL */}
      {isCreateRoomOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateRoomOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.2rem" }}>
                Create Chat Room
              </h3>
              <button className="btn-icon" onClick={() => setIsCreateRoomOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRoom} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label className="profile-field-label">Room Slug (URL Safe)</label>
                <input
                  type="text"
                  placeholder="e.g. music-hub"
                  value={newRoomSlug}
                  onChange={e => setNewRoomSlug(e.target.value)}
                  required
                  className="chat-input profile-field-val"
                  style={{ width: "100%", marginTop: "4px" }}
                />
              </div>

              <div>
                <label className="profile-field-label">Display Title</label>
                <input
                  type="text"
                  placeholder="e.g. Music Hub"
                  value={newRoomTitle}
                  onChange={e => setNewRoomTitle(e.target.value)}
                  required
                  className="chat-input profile-field-val"
                  style={{ width: "100%", marginTop: "4px" }}
                />
              </div>

              <div>
                <label className="profile-field-label">Topic / Description</label>
                <input
                  type="text"
                  placeholder="What is this room about?"
                  value={newRoomTopic}
                  onChange={e => setNewRoomTopic(e.target.value)}
                  className="chat-input profile-field-val"
                  style={{ width: "100%", marginTop: "4px" }}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: "8px" }}>
                Launch Room
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

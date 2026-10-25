import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import {
  Hash, MessageSquare, Users, Send, Plus, LogOut, Search,
  UserPlus, Check, X, UserCheck, Clock, Sparkles, Edit3,
  Shield, ShieldPlus, ShieldOff, Trash2, Settings, Camera,
  Upload, Image, ChevronDown, Crown, UserMinus, User as UserIcon,
  Heart, AlertCircle, CheckCircle2, Loader2, Flame,
  PanelLeftClose, PanelLeftOpen, ArrowLeft
} from 'lucide-react';

const API_BASE = window.location.origin.includes(":5173")
  ? `http://${window.location.hostname}:8080`
  : window.location.origin;
const WS_BASE = window.location.origin.includes(":5173")
  ? `ws://${window.location.hostname}:8080`
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

const ANIMAL_EMOJIS = {
  Rabbit: "🐰",
  Turtle: "🐢",
  Panda: "🐼",
  Fox: "🦊",
  Koala: "🐨",
  Otter: "🦦",
  Penguin: "🐧",
  Dolphin: "🐬",
  Tiger: "🐯",
  Sparrow: "🐦"
};

export default function App() {
  // Auth
  const [token, setToken] = useState(() => localStorage.getItem("pairup_token") || "");
  const [currentUser, setCurrentUser] = useState(() => {
    const s = localStorage.getItem("pairup_user");
    return s ? JSON.parse(s) : null;
  });
  const [googleClientId, setGoogleClientId] = useState("");
  const [demoUsername, setDemoUsername] = useState("");
  const [demoName, setDemoName] = useState("");
  const [demoGender, setDemoGender] = useState("Prefer not to say");
  const [authError, setAuthError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [loginReturnPath, setLoginReturnPath] = useState("");

  // Snackbar Notification
  const [snackbar, setSnackbar] = useState(null);
  const snackbarTimerRef = useRef(null);

  // Navigation & Layout
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem("pairup_sidebar_collapsed") === "true";
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("pairup_sidebar_collapsed", String(next));
      return next;
    });
  };

  const [viewMode, setViewMode] = useState("chat"); // "chat" | "explore" | "mate" | "mate_chat"
  const [activeTab, setActiveTab] = useState({ type: "room", id: null, data: null });

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

  // Mate Matchmaking & 1-on-1 Chat
  const [mateInterestsInput, setMateInterestsInput] = useState(() => currentUser?.interests || "");
  const [mateStatus, setMateStatus] = useState("idle"); // "idle" | "searching" | "matched"
  const [mateExpiresAt, setMateExpiresAt] = useState(null);
  const [mateRemainingSeconds, setMateRemainingSeconds] = useState(300);
  const [mateConversationId, setMateConversationId] = useState(null);
  const [mateConversationData, setMateConversationData] = useState(null);
  const [mateMessages, setMateMessages] = useState([]);
  const [mateInputMessage, setMateInputMessage] = useState("");
  const [mateTypingStatus, setMateTypingStatus] = useState(null);
  const [isSubmittingMatch, setIsSubmittingMatch] = useState(false);
  const mateMessagesEndRef = useRef(null);
  const mateTypingTimerRef = useRef(null);
  const mateConversationIdRef = useRef(mateConversationId);
  useEffect(() => { mateConversationIdRef.current = mateConversationId; }, [mateConversationId]);

  // Profile Modal
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [profileTab, setProfileTab] = useState("profile"); // "profile" | "friends" | "requests"
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editGender, setEditGender] = useState("Prefer not to say");
  const [editBio, setEditBio] = useState("");
  const [editInterests, setEditInterests] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef(null);

  // Room Creation Modal
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [newRoomSlug, setNewRoomSlug] = useState("");
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");

  // Room Settings Modal (moderators)
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [roomSettingsData, setRoomSettingsData] = useState(null);
  const [editRoomTitle, setEditRoomTitle] = useState("");
  const [editRoomDesc, setEditRoomDesc] = useState("");
  const [roomSettingsTab, setRoomSettingsTab] = useState("info"); // "info" | "moderators" | "members"
  const [addModUserId, setAddModUserId] = useState("");
  const [addModSearch, setAddModSearch] = useState("");
  const [addModResults, setAddModResults] = useState([]);
  const [isSearchingMods, setIsSearchingMods] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [addMemberResults, setAddMemberResults] = useState([]);
  const [uploadingRoomPic, setUploadingRoomPic] = useState(false);
  const roomPicRef = useRef(null);

  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  // ──────────────────────────────────────────────────────────────
  // AUTH HELPERS
  // ──────────────────────────────────────────────────────────────
  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  }), [token]);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/config`)
      .then(r => r.json())
      .then(d => setGoogleClientId(d.google_client_id))
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (!token && googleClientId && window.google) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
        });
        const btn = document.getElementById("google-signin-btn");
        if (btn) {
          window.google.accounts.id.renderButton(btn, {
            theme: "outline", size: "large", shape: "rectangular", width: 340, text: "continue_with"
          });
        }
      } catch (e) { console.error(e); }
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
    } catch (err) { setAuthError(err.message); }
  };

  const handleDemoLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!demoUsername.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/demo-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: demoUsername.trim(), name: demoName.trim() || undefined, gender: demoGender })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");
      saveAuthSession(data.access_token, data.user);
    } catch (err) { setAuthError(err.message); }
  };

  const showSnackbar = useCallback((message, type = "info") => {
    if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
    setSnackbar({ message, type });
    snackbarTimerRef.current = setTimeout(() => {
      setSnackbar(null);
      snackbarTimerRef.current = null;
    }, 4500);
  }, []);

  const handleInstantPassRedirect = useCallback((targetPath = "mate") => {
    if (currentUser?.provider === "demo") {
      setToken("");
      setCurrentUser(null);
      localStorage.removeItem("pairup_token");
      localStorage.removeItem("pairup_user");
      setLoginNotice("You should login to use these features.");
      setLoginReturnPath(targetPath);
      showSnackbar("You should login to use these features.", "error");
      return true;
    }
    return false;
  }, [currentUser, showSnackbar]);

  const saveAuthSession = (jwtToken, user) => {
    setToken(jwtToken);
    setCurrentUser(user);
    localStorage.setItem("pairup_token", jwtToken);
    localStorage.setItem("pairup_user", JSON.stringify(user));
    setLoginNotice("");
    if (loginReturnPath === "mate" && user.provider !== "demo") {
      setViewMode("mate");
      setLoginReturnPath("");
    }
  };

  const handleLogout = async () => {
    if (token) {
      try { await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }); } catch (e) { }
    }
    if (wsRef.current) wsRef.current.close();
    setToken(""); setCurrentUser(null);
    localStorage.removeItem("pairup_token");
    localStorage.removeItem("pairup_user");
    setMateStatus("idle");
    setMateConversationId(null);
    setMateConversationData(null);
    setMateMessages([]);
  };

  // ──────────────────────────────────────────────────────────────
  // DATA LOADERS
  // ──────────────────────────────────────────────────────────────
  const loadRooms = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`);
      if (res.ok) setRooms(await res.json());
    } catch (e) { }
  };

  const refreshDirectConversations = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/direct-conversations`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDirectConversations(await res.json());
    } catch (e) { }
  };

  const loadExploreUsers = async (query = "") => {
    if (!token) return;
    try {
      const url = query ? `${API_BASE}/api/explore-users?query=${encodeURIComponent(query)}` : `${API_BASE}/api/explore-users`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setExploreUsersList(await res.json());
    } catch (e) { }
  };

  const refreshPendingCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/friends/pending`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const list = await res.json();
        setPendingRequestsCount(list.length);
      }
    } catch (e) { }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadRooms();
      refreshDirectConversations();
      refreshPendingCount();
    }
  }, [token, refreshPendingCount]);
  useEffect(() => { if (viewMode === "explore" && token) loadExploreUsers(searchQuery); }, [viewMode, searchQuery, token]);

  // ──────────────────────────────────────────────────────────────
  // MATE CONVERSATION LOADER
  // ──────────────────────────────────────────────────────────────
  const loadMateConversation = useCallback(async (convId) => {
    if (!convId || !token) return;
    try {
      const cRes = await fetch(`${API_BASE}/api/mate/conversations/${convId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (cRes.ok) {
        const cData = await cRes.json();
        setMateConversationData(cData);
      }
      const mRes = await fetch(`${API_BASE}/api/mate/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (mRes.ok) {
        const mData = await mRes.json();
        setMateMessages(mData);
      }
    } catch (e) { }
  }, [token]);

  // ──────────────────────────────────────────────────────────────
  // WEBSOCKET
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !currentUser) return;
    const ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (activeTab.type === "room" && activeTab.id) {
        ws.send(JSON.stringify({ action: "join_room", room_slug: activeTab.id }));
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
            data.status === "online" ? next.add(data.user_id) : next.delete(data.user_id);
            return next;
          });
        } else if (data.type === "room_message") {
          if (activeTab.type === "room" && activeTab.id?.toLowerCase() === data.room_slug?.toLowerCase()) {
            setMessages(prev => [...prev, data]);
          }
        } else if (data.type === "room_notice") {
          if (activeTab.type === "room" && activeTab.id?.toLowerCase() === data.room_slug?.toLowerCase()) {
            setMessages(prev => [...prev, { isNotice: true, text: data.notice, id: Math.random() }]);
          }
        } else if (data.type === "direct_message") {
          refreshDirectConversations();
          const isCurrentConvo = activeTab.type === "direct" && (activeTab.id === data.sender_id || activeTab.id === data.recipient_id);
          if (isCurrentConvo) setMessages(prev => [...prev, data]);
        } else if (data.type === "mate_match_found") {
          setMateConversationId(data.conversation_id);
          setMateStatus("matched");
          setMateExpiresAt(null);
          loadMateConversation(data.conversation_id);
          setViewMode("mate_chat");
          showSnackbar(`Match found! Connected with ${data.partner_nickname}`, "success");
        } else if (data.type === "mate_message") {
          if (data.conversation_id === mateConversationIdRef.current) {
            setMateMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
          }
        } else if (data.type === "mate_interest_received") {
          if (data.conversation_id === mateConversationIdRef.current) {
            setMateConversationData(prev => prev ? { ...prev, partner_interest: true } : prev);
            showSnackbar(`${data.nickname} is interested in you`, "info");
          }
        } else if (data.type === "mate_mutual_interest") {
          if (data.conversation_id === mateConversationIdRef.current) {
            setMateConversationData(prev => prev ? {
              ...prev,
              mutual_interest: true,
              partner_user_id: data.partner_user_id
            } : prev);
            showSnackbar("It's a Match! You are now friends on PairUP! 🎉", "success");
            refreshDirectConversations();
            refreshPendingCount();
          }
        } else if (data.type === "mate_participant_left") {
          if (data.conversation_id === mateConversationIdRef.current) {
            setMateConversationData(prev => prev ? { ...prev, has_left: true } : prev);
            showSnackbar(data.message || "The other user has left the conversation.", "info");
          }
        } else if (data.type === "mate_typing_status") {
          if (data.conversation_id === mateConversationIdRef.current) {
            if (data.is_typing) {
              setMateTypingStatus(`${data.nickname} is typing...`);
              setTimeout(() => setMateTypingStatus(null), 3000);
            } else {
              setMateTypingStatus(null);
            }
          }
        } else if (data.type === "error") {
          alert(data.message);
        } else if (data.type === "typing_status") {
          if (data.is_typing) {
            setTypingUsers(prev => ({ ...prev, [data.user_id]: data.name }));
            setTimeout(() => setTypingUsers(prev => { const n = { ...prev }; delete n[data.user_id]; return n; }), 3000);
          } else {
            setTypingUsers(prev => { const n = { ...prev }; delete n[data.user_id]; return n; });
          }
        }
      } catch (e) { }
    };

    return () => ws.close();
  }, [token, activeTab.type, activeTab.id, loadMateConversation, showSnackbar, refreshPendingCount]);

  // Expiration Date Parser (guarantees UTC handling across timezones)
  const parseExpirationDate = useCallback((expStr) => {
    if (!expStr) return 0;
    if (typeof expStr === "number") return expStr;
    let s = String(expStr).trim();
    if (!s) return 0;
    // If no timezone indicator ('Z' or '+' or offset after time), treat as UTC
    if (!s.endsWith("Z") && !s.includes("+") && !s.slice(10).includes("-")) {
      s += "Z";
    }
    const t = new Date(s).getTime();
    return isNaN(t) ? 0 : t;
  }, []);

  // 5-minute Countdown Timer Effect
  useEffect(() => {
    if (mateStatus !== "searching" || !mateExpiresAt) return;

    const tick = () => {
      const now = Date.now();
      const expTime = parseExpirationDate(mateExpiresAt);
      if (!expTime) return;

      const diffSec = Math.max(0, Math.floor((expTime - now) / 1000));
      setMateRemainingSeconds(diffSec);

      if (diffSec <= 0) {
        setMateStatus("idle");
        setMateExpiresAt(null);
        showSnackbar("Try again mate", "info");
        if (token) {
          fetch(`${API_BASE}/api/mate/queue/cancel`, {
            method: "POST",
            headers: authHeaders()
          }).catch(() => { });
        }
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [mateStatus, mateExpiresAt, token, showSnackbar, authHeaders, parseExpirationDate]);

  // Initial Mate queue status check on mount
  useEffect(() => {
    if (token && currentUser && currentUser.provider !== "demo") {
      fetch(`${API_BASE}/api/mate/queue/status`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return;
          if (d.status === "searching") {
            const expTime = parseExpirationDate(d.expires_at);
            const initialSec = expTime ? Math.max(0, Math.floor((expTime - Date.now()) / 1000)) : 300;
            setMateRemainingSeconds(initialSec);
            setMateStatus("searching");
            setMateExpiresAt(d.expires_at);
          } else if (d.status === "matched" && d.conversation_id) {
            setMateStatus("matched");
            setMateConversationId(d.conversation_id);
            loadMateConversation(d.conversation_id);
          }
        })
        .catch(() => { });
    }
  }, [token, currentUser, loadMateConversation, parseExpirationDate]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { mateMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mateMessages]);

  // ──────────────────────────────────────────────────────────────
  // NAVIGATION
  // ──────────────────────────────────────────────────────────────
  const selectTab = async (type, id, dataObj) => {
    setViewMode("chat");
    setViewingProfileId(null);
    setRoomSettingsOpen(false);
    setActiveTab({ type, id, data: dataObj });
    setMessages([]);

    if (type === "room") {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "join_room", room_slug: id }));
      }
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${id}/messages`);
        if (res.ok) setMessages(await res.json());
      } catch (e) { }
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/direct/${id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setMessages(await res.json());
      } catch (e) { }
    }
  };

  // ──────────────────────────────────────────────────────────────
  // MESSAGES
  // ──────────────────────────────────────────────────────────────
  const handleSendMessage = (e) => {
    e.preventDefault();
    const content = inputMessage.trim();
    if (!content || wsRef.current?.readyState !== WebSocket.OPEN) return;

    if (activeTab.type === "room") {
      wsRef.current.send(JSON.stringify({ action: "send_room_message", room_slug: activeTab.id, content }));
    } else {
      wsRef.current.send(JSON.stringify({ action: "send_direct_message", recipient_id: activeTab.id, content }));
    }
    setInputMessage("");
  };

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (!typingTimeoutRef.current) {
        wsRef.current.send(JSON.stringify({
          action: "typing",
          room_slug: activeTab.type === "room" ? activeTab.id : undefined,
          recipient_id: activeTab.type === "direct" ? activeTab.id : undefined,
          is_typing: true
        }));
      }
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2500);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // PROFILE MODAL
  // ──────────────────────────────────────────────────────────────
  const openUserProfile = async (userId, initialTab = "profile") => {
    setViewingProfileId(userId);
    setIsEditingProfile(false);
    setProfileTab(initialTab);
    try {
      const res = await fetch(`${API_BASE}/api/users/${userId}/profile`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
        if (userId === currentUser.id) {
          setEditName(data.user.name);
          setEditUsername(data.user.username);
          setEditGender(data.user.gender || "Prefer not to say");
          setEditBio(data.user.bio || "");
          setEditInterests(data.user.interests || "");
          setPendingRequestsCount(data.pending_requests?.length || 0);
        }
      }
    } catch (e) { }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ name: editName, username: editUsername, gender: editGender, bio: editBio, interests: editInterests })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.detail || "Could not update profile"); return; }
      setCurrentUser(data);
      localStorage.setItem("pairup_user", JSON.stringify(data));
      setIsEditingProfile(false);
      openUserProfile(currentUser.id, "profile");
    } catch (e) { alert("Error saving profile"); }
  };

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploadingAvatar(true);
    try {
      const res = await fetch(`${API_BASE}/api/upload/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) { alert(data.detail || "Upload failed"); return; }
      const updatedUser = { ...currentUser, avatar: data.avatar_url };
      setCurrentUser(updatedUser);
      localStorage.setItem("pairup_user", JSON.stringify(updatedUser));
      openUserProfile(currentUser.id, "profile");
    } catch (e) { alert("Upload error"); }
    finally { setUploadingAvatar(false); }
  };

  // ──────────────────────────────────────────────────────────────
  // FRIEND REQUESTS
  // ──────────────────────────────────────────────────────────────
  const handleSendFriendRequest = async (targetUserId) => {
    if (currentUser?.provider === "demo") {
      handleInstantPassRedirect("explore");
      return;
    }

    // Optimistic UI update for immediate feedback
    setExploreUsersList(prev => prev.map(u => u.id === targetUserId ? { ...u, friendship_status: "pending_sent" } : u));
    if (profileData && profileData.user.id === targetUserId) {
      setProfileData(prev => ({ ...prev, friendship_status: "pending_sent" }));
    }

    try {
      const res = await fetch(`${API_BASE}/api/friends/request`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ addressee_id: targetUserId })
      });
      const data = await res.json();
      if (!res.ok) {
        showSnackbar(data.detail || "Could not send friend request", "error");
        loadExploreUsers(searchQuery);
        return;
      }
      showSnackbar("Friend request sent!", "success");
      if (viewingProfileId === targetUserId) openUserProfile(targetUserId);
      loadExploreUsers(searchQuery);
      refreshPendingCount();
    } catch (e) {
      showSnackbar("Network error sending friend request", "error");
      loadExploreUsers(searchQuery);
    }
  };

  const handleRespondFriendRequest = async (requestId, status) => {
    if (!requestId) return;

    // Optimistic UI removal
    if (profileData && profileData.pending_requests) {
      setProfileData(prev => ({
        ...prev,
        pending_requests: prev.pending_requests.filter(r => r.id !== requestId),
        friends_count: status === "accepted" ? (prev.friends_count + 1) : prev.friends_count
      }));
    }
    setPendingRequestsCount(prev => Math.max(0, prev - 1));

    try {
      const res = await fetch(`${API_BASE}/api/friends/respond/${requestId}`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ status })
      });
      if (res.ok) {
        if (viewingProfileId) openUserProfile(viewingProfileId, profileTab);
        refreshDirectConversations();
        refreshPendingCount();
        if (viewMode === "explore") loadExploreUsers(searchQuery);
      }
    } catch (e) { }
  };

  // ──────────────────────────────────────────────────────────────
  // MATE ACTIONS
  // ──────────────────────────────────────────────────────────────
  const handleNavigateMate = () => {
    if (currentUser?.provider === "demo") {
      handleInstantPassRedirect("mate");
      return;
    }
    if (mateConversationId && mateConversationData?.status === "active") {
      setViewMode("mate_chat");
    } else {
      setViewMode("mate");
    }
  };

  const handleStartMatchmaking = async () => {
    if (currentUser?.provider === "demo") {
      handleInstantPassRedirect("mate");
      return;
    }
    if (isSubmittingMatch) return;
    setIsSubmittingMatch(true);

    try {
      const res = await fetch(`${API_BASE}/api/mate/queue/join`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ interests: mateInterestsInput })
      });
      if (res.status === 401) {
        showSnackbar("Session expired. Please log in again.", "error");
        handleLogout();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        showSnackbar(data.detail || "Could not start matchmaking", "error");
        return;
      }

      if (data.status === "matched") {
        setMateConversationId(data.conversation_id);
        setMateStatus("matched");
        await loadMateConversation(data.conversation_id);
        setViewMode("mate_chat");
        showSnackbar(`Match found! Connected with ${data.partner_nickname}`, "success");
      } else {
        const expTime = parseExpirationDate(data.expires_at);
        const initialSec = expTime ? Math.max(0, Math.floor((expTime - Date.now()) / 1000)) : 300;
        setMateRemainingSeconds(initialSec);
        setMateStatus("searching");
        setMateExpiresAt(data.expires_at);
        showSnackbar("Searching for your mate...", "info");
      }
    } catch (e) {
      showSnackbar("Network error while starting matchmaking", "error");
    } finally {
      setIsSubmittingMatch(false);
    }
  };

  const handleCancelMatchmaking = async () => {
    try {
      await fetch(`${API_BASE}/api/mate/queue/cancel`, {
        method: "POST",
        headers: authHeaders()
      });
      setMateStatus("idle");
      setMateExpiresAt(null);
      setMateRemainingSeconds(300);
      showSnackbar("Matchmaking cancelled", "info");
    } catch (e) {
      setMateStatus("idle");
    }
  };

  const handleSendMateMessage = (e) => {
    e.preventDefault();
    const content = mateInputMessage.trim();
    if (!content || !mateConversationId || wsRef.current?.readyState !== WebSocket.OPEN) return;
    if (content.length > 1000) {
      showSnackbar("Message too long (maximum 1000 characters)", "error");
      return;
    }

    wsRef.current.send(JSON.stringify({
      action: "send_mate_message",
      conversation_id: mateConversationId,
      content
    }));
    setMateInputMessage("");
  };

  const handleMateInputChange = (e) => {
    setMateInputMessage(e.target.value);
    if (wsRef.current?.readyState === WebSocket.OPEN && mateConversationId) {
      if (!mateTypingTimerRef.current) {
        wsRef.current.send(JSON.stringify({
          action: "mate_typing",
          conversation_id: mateConversationId,
          is_typing: true
        }));
      }
      clearTimeout(mateTypingTimerRef.current);
      mateTypingTimerRef.current = setTimeout(() => {
        mateTypingTimerRef.current = null;
      }, 2500);
    }
  };

  const handleExpressInterest = async () => {
    if (!mateConversationId || mateConversationData?.my_interest) return;
    try {
      const res = await fetch(`${API_BASE}/api/mate/conversations/${mateConversationId}/interested`, {
        method: "POST",
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) {
        showSnackbar(data.detail || "Could not record interest", "error");
        return;
      }

      setMateConversationData(prev => ({
        ...prev,
        my_interest: true,
        mutual_interest: data.mutual_interest,
        partner_user_id: data.partner_user_id || prev?.partner_user_id
      }));

      if (data.mutual_interest) {
        showSnackbar("It's a Match! You are now friends on PairUP! 🎉", "success");
        refreshDirectConversations();
        refreshPendingCount();
      } else {
        showSnackbar("You expressed interest! Waiting for them...", "info");
      }
    } catch (e) {
      showSnackbar("Error recording interest", "error");
    }
  };

  const handleExitMateConversation = async () => {
    if (!mateConversationId) {
      setViewMode("mate");
      return;
    }
    try {
      await fetch(`${API_BASE}/api/mate/conversations/${mateConversationId}/exit`, {
        method: "POST",
        headers: authHeaders()
      });
    } catch (e) { }

    setMateConversationId(null);
    setMateConversationData(null);
    setMateMessages([]);
    setMateStatus("idle");
    setViewMode("mate");
    showSnackbar("You left the conversation", "info");
  };

  // ──────────────────────────────────────────────────────────────
  // ROOM CREATION
  // ──────────────────────────────────────────────────────────────
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomSlug.trim() || !newRoomTitle.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ slug: newRoomSlug.trim().toLowerCase(), title: newRoomTitle.trim(), description: newRoomDesc.trim() || undefined })
      });
      if (res.ok) {
        const created = await res.json();
        setRooms(prev => [...prev, created]);
        setIsCreateRoomOpen(false);
        setNewRoomSlug(""); setNewRoomTitle(""); setNewRoomDesc("");
        selectTab("room", created.slug, created);
      } else {
        const err = await res.json();
        alert(err.detail || "Could not create room");
      }
    } catch (e) { alert("Network error"); }
  };

  // ──────────────────────────────────────────────────────────────
  // ROOM SETTINGS (Moderator Actions)
  // ──────────────────────────────────────────────────────────────
  const openRoomSettings = async (room) => {
    setRoomSettingsData(room);
    setEditRoomTitle(room.title);
    setEditRoomDesc(room.description || "");
    setRoomSettingsTab("info");
    setAddModUserId("");
    setAddModSearch("");
    setAddModResults([]);
    setIsSearchingMods(false);
    setAddMemberSearch("");
    setAddMemberResults([]);
    setRoomSettingsOpen(true);
  };

  const handleSaveRoomInfo = async (e) => {
    e.preventDefault();
    if (!roomSettingsData) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomSettingsData.slug}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ title: editRoomTitle, description: editRoomDesc })
      });
      if (res.ok) {
        const updated = await res.json();
        setRooms(prev => prev.map(r => r.slug === updated.slug ? updated : r));
        setRoomSettingsData(updated);
        setActiveTab(prev => prev.id === updated.slug ? { ...prev, data: updated } : prev);
      } else {
        const err = await res.json();
        alert(err.detail || "Could not update room");
      }
    } catch (e) { alert("Network error"); }
  };

  const handleDeleteRoom = async () => {
    if (!roomSettingsData) return;
    if (!window.confirm(`Delete room #${roomSettingsData.slug}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomSettingsData.slug}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setRooms(prev => prev.filter(r => r.slug !== roomSettingsData.slug));
        setRoomSettingsOpen(false);
        setActiveTab({ type: "room", id: null, data: null });
        setMessages([]);
      } else {
        const err = await res.json();
        alert(err.detail || "Could not delete room");
      }
    } catch (e) { alert("Network error"); }
  };

  const handleAddModerator = async (target) => {
    if (!roomSettingsData) return;
    let payload = {};
    const val = typeof target === "string" ? target.trim() : (target?.id || addModSearch.trim());
    if (!val) return;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    payload = isUuid ? { user_id: val } : { username: val.replace(/^@/, "") };

    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomSettingsData.slug}/moderators/add`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        showSnackbar(data.detail || "Failed to add moderator", "error");
        return;
      }
      showSnackbar(data.message || "Moderator added successfully!", "success");
      // Refresh room data
      const rRes = await fetch(`${API_BASE}/api/rooms/${roomSettingsData.slug}`);
      if (rRes.ok) {
        const updated = await rRes.json();
        setRoomSettingsData(updated);
        setRooms(prev => prev.map(r => r.slug === updated.slug ? updated : r));
      }
      setAddModSearch("");
      setAddModResults([]);
      setAddModUserId("");
    } catch (e) {
      showSnackbar("Network error", "error");
    }
  };

  const searchUsersForModerator = async (q) => {
    setAddModSearch(q);
    const clean = q.trim().replace(/^@/, "");
    if (!clean) {
      setAddModResults([]);
      return;
    }
    setIsSearchingMods(true);
    try {
      const res = await fetch(`${API_BASE}/api/explore-users?query=${encodeURIComponent(clean)}`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const users = await res.json();
        const existingModUserIds = new Set((roomSettingsData?.moderators || []).map(m => m.user_id));
        setAddModResults(users.filter(u => !existingModUserIds.has(u.id) && u.id !== currentUser?.id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearchingMods(false);
    }
  };

  const handleRemoveModerator = async (userId) => {
    if (!roomSettingsData) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomSettingsData.slug}/moderators/remove`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ user_id: userId })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.detail || "Failed"); return; }
      const rRes = await fetch(`${API_BASE}/api/rooms/${roomSettingsData.slug}`);
      if (rRes.ok) { const updated = await rRes.json(); setRoomSettingsData(updated); setRooms(prev => prev.map(r => r.slug === updated.slug ? updated : r)); }
    } catch (e) { alert("Network error"); }
  };

  const searchMembersToAdd = async (q) => {
    setAddMemberSearch(q);
    if (!q.trim()) { setAddMemberResults([]); return; }
    try {
      const res = await fetch(`${API_BASE}/api/explore-users?query=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAddMemberResults(await res.json());
    } catch (e) { }
  };

  const handleAddMember = async (userId) => {
    if (!roomSettingsData) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomSettingsData.slug}/members/add`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ user_id: userId })
      });
      const data = await res.json();
      alert(data.message || data.detail || "Done");
    } catch (e) { alert("Network error"); }
  };

  const handleRoomPicUpload = async (file) => {
    if (!file || !roomSettingsData) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploadingRoomPic(true);
    try {
      const res = await fetch(`${API_BASE}/api/upload/room/${roomSettingsData.slug}/picture`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData
      });
      const data = await res.json();
      if (!res.ok) { alert(data.detail || "Upload failed"); return; }
      const updated = { ...roomSettingsData, picture: data.picture_url };
      setRoomSettingsData(updated);
      setRooms(prev => prev.map(r => r.slug === updated.slug ? updated : r));
    } catch (e) { alert("Upload error"); }
    finally { setUploadingRoomPic(false); }
  };

  // ──────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────
  const getGenderBadgeClass = (gender) => {
    const g = (gender || "").toLowerCase();
    if (g === "male") return "gender-badge male";
    if (g === "female") return "gender-badge female";
    if (g === "other") return "gender-badge other";
    return "gender-badge neutral";
  };

  const avatarSrc = (user) =>
    user?.avatar
      ? (user.avatar.startsWith("/api/") ? `${API_BASE}${user.avatar}` : user.avatar)
      : `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${user?.username || "user"}`;

  const isCurrentUserModerator = (room) =>
    room?.moderators?.some(m => m.user_id === currentUser?.id);

  const isCurrentUserPrimeModerator = (room) =>
    room?.moderators?.some(m => m.user_id === currentUser?.id && m.is_prime);

  const activeRoom = rooms.find(r => r.slug === activeTab.id) || activeTab.data;
  const activeDirectUser = directConversations.find(u => u.id === activeTab.id) || activeTab.data;

  // ══════════════════════════════════════════════════════════════
  // LOGIN SCREEN
  // ══════════════════════════════════════════════════════════════
  if (!token || !currentUser) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <h1 className="brand-gradient" style={{ fontSize: "2.6rem", marginBottom: "8px", letterSpacing: "-0.03em" }}>
              PairUP
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
              Connect. Pair up. Chat in real-time.
            </p>
          </div>

          {loginNotice && (
            <div className="error-banner" style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", marginBottom: "16px" }}>
              {loginNotice}
            </div>
          )}

          {authError && (
            <div className="error-banner">{authError}</div>
          )}

          <div id="google-signin-btn" style={{ display: "flex", justifyContent: "center", minHeight: "44px", marginBottom: "4px" }} />

          <div className="divider">Or Continue With Instant Pass</div>

          <form onSubmit={handleDemoLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input type="text" placeholder="Choose Username" value={demoUsername} onChange={e => setDemoUsername(e.target.value)} required className="chat-input full-width" />
            <input type="text" placeholder="Display Name (optional)" value={demoName} onChange={e => setDemoName(e.target.value)} className="chat-input full-width" />
            <select value={demoGender} onChange={e => setDemoGender(e.target.value)} className="chat-input full-width select-field">
              <option value="Prefer not to say">Gender: Prefer not to say</option>
              <option value="Male">Gender: Male</option>
              <option value="Female">Gender: Female</option>
              <option value="Other">Gender: Other</option>
            </select>
            <button type="submit" className="btn-primary full-width" style={{ marginTop: "4px" }}>
              Enter as Instant Pass (Guest)
            </button>
          </form>

          <p style={{ fontSize: "0.74rem", color: "var(--text-dim)", textAlign: "center", marginTop: "16px" }}>
            Instant Pass sessions are temporary — your data is removed when you leave.
          </p>
        </div>

        {snackbar && (
          <div className="snackbar-container">
            <div className={`snackbar ${snackbar.type || "info"}`}>
              {snackbar.type === "success" && <CheckCircle2 size={16} />}
              {snackbar.type === "error" && <AlertCircle size={16} />}
              <span>{snackbar.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════════
  const isPageActive = Boolean(
    viewingProfileId ||
    roomSettingsOpen ||
    viewMode === "mate" ||
    viewMode === "mate_chat" ||
    viewMode === "explore" ||
    activeTab.id
  );

  return (
    <div className={`app-container ${isPageActive ? "has-active-page" : "no-active-page"}`}>
      {/* ── SIDEBAR ── */}
      <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="brand-header">
          {!isSidebarCollapsed ? (
            <>
              <div className="brand-logo" onClick={() => setViewMode("chat")}>
                <h1 className="brand-gradient">PairUP</h1>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <button className="btn-section-action" title="Explore Friends" onClick={() => { setViewMode("explore"); loadExploreUsers(searchQuery); }}>
                  <Users size={18} />
                </button>
                <button className="btn-section-action" title="Collapse sidebar" onClick={toggleSidebar}>
                  <PanelLeftClose size={18} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
              <button className="btn-section-action" title="Expand sidebar" onClick={toggleSidebar}>
                <PanelLeftOpen size={19} />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="nav-tab-group">
          <button
            type="button"
            className={`nav-tab-btn ${viewMode === "chat" ? "active" : ""}`}
            onClick={() => setViewMode("chat")}
            title="Chats"
          >
            <MessageSquare size={16} />
            {!isSidebarCollapsed && <span>Chats</span>}
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${viewMode === "explore" ? "active" : ""}`}
            onClick={() => { setViewMode("explore"); loadExploreUsers(searchQuery); }}
            title="Explore Friends"
          >
            <Users size={16} />
            {!isSidebarCollapsed && <span>Explore</span>}
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${viewMode === "mate" || viewMode === "mate_chat" ? "active" : ""}`}
            onClick={handleNavigateMate}
            title="Mate - Anonymous Matchmaking"
          >
            <Sparkles size={16} />
            {!isSidebarCollapsed && (
              <>
                <span>Mate</span>
                {/* <span className="mate-sparkle-badge">Coming Soon!</span> */}
              </>
            )}
          </button>
        </div>

        <div className="sidebar-scroll">
          {/* Chat Rooms */}
          <div>
            {!isSidebarCollapsed ? (
              <div className="section-label">
                <span>Rooms</span>
                <button className="btn-section-action" title="Create Room" onClick={() => setIsCreateRoomOpen(true)}>
                  <Plus size={15} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "4px" }}>
                <div className="sidebar-collapsed-section-divider" title="Rooms" />
                <button className="sidebar-collapsed-action-btn" title="Create Room" onClick={() => setIsCreateRoomOpen(true)}>
                  <Plus size={14} />
                </button>
              </div>
            )}

            {rooms.length === 0 ? (
              !isSidebarCollapsed ? (
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", padding: "10px 8px" }}>
                  No rooms yet. Be the first to create one!
                </div>
              ) : null
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: isSidebarCollapsed ? "6px" : "3px" }}>
                {rooms.map(room => {
                  const isActive = viewMode === "chat" && activeTab.type === "room" && activeTab.id === room.slug;
                  const isMod = isCurrentUserModerator(room);
                  return !isSidebarCollapsed ? (
                    <div key={room.slug} className={`nav-item ${isActive ? "active" : ""}`}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, overflow: "hidden" }} onClick={() => selectTab("room", room.slug, room)}>
                        {room.picture ? (
                          <img src={`${API_BASE}${room.picture}`} alt={room.title} style={{ width: 18, height: 18, borderRadius: "4px", objectFit: "cover" }} />
                        ) : (
                          <Hash size={17} color={isActive ? "var(--accent-primary)" : "var(--text-dim)"} />
                        )}
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {room.title}
                        </span>
                        {isMod && <Crown size={11} color="var(--accent-gold)" title="Moderator" />}
                      </div>
                      {isMod && (
                        <button className="btn-icon-sm" title="Room Settings" onClick={e => { e.stopPropagation(); openRoomSettings(room); }}>
                          <Settings size={13} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      key={room.slug}
                      className={`nav-item collapsed-nav-item ${isActive ? "active" : ""}`}
                      onClick={() => selectTab("room", room.slug, room)}
                      title={`# ${room.title}${isMod ? " (Moderator)" : ""}`}
                    >
                      {room.picture ? (
                        <img src={`${API_BASE}${room.picture}`} alt={room.title} className="collapsed-room-pic" />
                      ) : (
                        <div className="collapsed-room-hash">
                          <Hash size={17} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Direct Messages */}
          <div>
            {!isSidebarCollapsed ? (
              <div className="section-label">
                <span>Direct Messages</span>
              </div>
            ) : (
              <div className="sidebar-collapsed-section-divider" title="Direct Messages" style={{ margin: "10px auto 6px" }} />
            )}

            {directConversations.length === 0 ? (
              !isSidebarCollapsed ? (
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", padding: "10px 8px" }}>
                  No active chats. Add friends from <strong>Explore</strong> to chat!
                </div>
              ) : null
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: isSidebarCollapsed ? "6px" : "3px" }}>
                {directConversations.map(u => {
                  const isActive = viewMode === "chat" && activeTab.type === "direct" && activeTab.id === u.id;
                  const isOnline = onlineUserIds.has(u.id);
                  return !isSidebarCollapsed ? (
                    <div key={u.id} className={`nav-item ${isActive ? "active" : ""}`} onClick={() => selectTab("direct", u.id, u)}>
                      <div className="user-avatar">
                        <img src={avatarSrc(u)} alt={u.name} />
                        <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                      </div>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.88rem", fontWeight: 600 }}>{u.name}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>@{u.username}</div>
                      </div>
                      {u.gender && (
                        <span className={getGenderBadgeClass(u.gender)} style={{ fontSize: "0.62rem", padding: "1px 5px" }}>
                          {u.gender}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      key={u.id}
                      className={`nav-item collapsed-nav-item ${isActive ? "active" : ""}`}
                      onClick={() => selectTab("direct", u.id, u)}
                      title={`${u.name} (@${u.username})${u.gender ? ` • ${u.gender}` : ""}`}
                    >
                      <div className="user-avatar">
                        <img src={avatarSrc(u)} alt={u.name} />
                        <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* User Profile Bar */}
        <div className="user-profile-bar">
          {!isSidebarCollapsed ? (
            <>
              <div className="profile-info" onClick={() => openUserProfile(currentUser.id, pendingRequestsCount > 0 ? "requests" : "profile")}>
                <div className="user-avatar" style={{ position: "relative" }}>
                  <img src={avatarSrc(currentUser)} alt={currentUser.name} />
                  <span className="status-dot online" />
                  {pendingRequestsCount > 0 && (
                    <span className="badge-count" style={{ position: "absolute", top: -4, right: -4, fontSize: "0.62rem", padding: "1px 5px" }}>
                      {pendingRequestsCount}
                    </span>
                  )}
                </div>
                <div className="profile-details">
                  <span className="profile-name">{currentUser.name}</span>
                  <span className="profile-handle">@{currentUser.username}</span>
                </div>
              </div>
              <button className="btn-icon" title="Log Out" onClick={handleLogout}>
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "100%" }}>
              <div
                className="user-avatar"
                style={{ position: "relative", width: 38, height: 38 }}
                onClick={() => openUserProfile(currentUser.id, pendingRequestsCount > 0 ? "requests" : "profile")}
                title={`Your Profile: ${currentUser.name} (@${currentUser.username})`}
              >
                <img src={avatarSrc(currentUser)} alt={currentUser.name} />
                <span className="status-dot online" />
                {pendingRequestsCount > 0 && (
                  <span className="badge-count" style={{ position: "absolute", top: -4, right: -4, fontSize: "0.62rem", padding: "1px 5px" }}>
                    {pendingRequestsCount}
                  </span>
                )}
              </div>
              <button className="btn-icon" title="Log Out" onClick={handleLogout}>
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN STAGE / PAGES ── */}
      {viewingProfileId && profileData ? (
        <main className="page-stage profile-page-stage">
          <header className="page-header">
            <button
              type="button"
              className="btn-back"
              onClick={() => { setViewingProfileId(null); setIsEditingProfile(false); }}
              title="Back"
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
                {viewingProfileId === currentUser?.id ? "Your Profile" : "Profile"}
              </h2>
              <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                @{profileData.user.username}
              </div>
            </div>
            {viewingProfileId === currentUser?.id && !isEditingProfile && (
              <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: "0.82rem" }} onClick={() => setIsEditingProfile(true)}>
                <Edit3 size={14} /> Edit Profile
              </button>
            )}
          </header>

          <div className="page-content-scroll">
            <div className="page-card">
              {viewingProfileId === currentUser.id && isEditingProfile ? (
                /* ── Edit Own Profile ── */
                <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <div style={{ position: "relative", width: "80px", height: "80px" }}>
                      <img src={avatarSrc(currentUser)} alt="" style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "3px solid var(--accent-primary)" }} />
                      <button type="button" className="avatar-upload-btn" onClick={() => avatarFileRef.current?.click()} title="Upload Photo" disabled={uploadingAvatar}>
                        <Camera size={14} />
                      </button>
                    </div>
                    <input ref={avatarFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleAvatarUpload(e.target.files[0]); }} />
                    {uploadingAvatar && <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Uploading...</span>}
                  </div>

                  <div className="profile-field-group">
                    <label className="profile-field-label">Display Name</label>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} required className="chat-input profile-field-val" />
                  </div>
                  <div className="profile-field-group">
                    <label className="profile-field-label">Username</label>
                    <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)} required className="chat-input profile-field-val" />
                  </div>
                  <div className="profile-field-group">
                    <label className="profile-field-label">Gender</label>
                    <select value={editGender} onChange={e => setEditGender(e.target.value)} className="profile-field-val chat-input">
                      <option value="Prefer not to say">Prefer not to say</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="profile-field-group">
                    <label className="profile-field-label">Bio</label>
                    <textarea rows={3} value={editBio} onChange={e => setEditBio(e.target.value)} className="chat-input profile-field-val" style={{ resize: "none" }} />
                  </div>
                  <div className="profile-field-group">
                    <label className="profile-field-label">Interests</label>
                    <input type="text" placeholder="e.g. Design, React, Gaming" value={editInterests} onChange={e => setEditInterests(e.target.value)} className="chat-input profile-field-val" />
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                    <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Changes</button>
                    <button type="button" className="btn-secondary" onClick={() => setIsEditingProfile(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                /* ── View Profile ── */
                <div>
                  <div className="profile-hero">
                    <div className="profile-avatar-lg" style={{ position: "relative" }}>
                      <img src={avatarSrc(profileData.user)} alt={profileData.user.name} />
                      {viewingProfileId === currentUser.id && (
                        <button type="button" className="avatar-upload-btn" onClick={() => avatarFileRef.current?.click()} title="Change Photo" disabled={uploadingAvatar}>
                          <Camera size={14} />
                        </button>
                      )}
                      <input ref={avatarFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleAvatarUpload(e.target.files[0]); }} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff" }}>{profileData.user.name}</h4>
                      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginBottom: "6px" }}>@{profileData.user.username}</div>
                      <span className={getGenderBadgeClass(profileData.user.gender)}>{profileData.user.gender || "Prefer not to say"}</span>
                    </div>
                  </div>

                  {/* Profile Tabs */}
                  <div className="profile-tabs">
                    <button
                      type="button"
                      className={`profile-tab-btn ${profileTab === "profile" ? "active" : ""}`}
                      onClick={() => setProfileTab("profile")}
                    >
                      <UserIcon size={14} /> Profile
                    </button>
                    <button
                      type="button"
                      className={`profile-tab-btn ${profileTab === "friends" ? "active" : ""}`}
                      onClick={() => setProfileTab("friends")}
                    >
                      <Users size={14} /> Friends ({profileData.friends_count || 0})
                    </button>
                    {viewingProfileId === currentUser.id && (
                      <button
                        type="button"
                        className={`profile-tab-btn ${profileTab === "requests" ? "active" : ""}`}
                        onClick={() => setProfileTab("requests")}
                      >
                        <Clock size={14} /> Requests
                        {profileData.pending_requests?.length > 0 && (
                          <span className="badge-count">{profileData.pending_requests.length}</span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* TAB 1: Profile Info */}
                  {profileTab === "profile" && (
                    <div>
                      <div className="profile-field-group">
                        <span className="profile-field-label">Bio</span>
                        <div className="profile-field-val">{profileData.user.bio || "No bio yet."}</div>
                      </div>
                      <div className="profile-field-group">
                        <span className="profile-field-label">Interests</span>
                        <div className="profile-field-val">{profileData.user.interests || "No interests specified."}</div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
                        {viewingProfileId === currentUser.id ? (
                          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsEditingProfile(true)}>
                            <Edit3 size={15} /> Edit Profile
                          </button>
                        ) : (
                          <>
                            {profileData.friendship_status === "accepted" ? (
                              <button className="btn-primary" style={{ flex: 1 }} onClick={() => { setViewingProfileId(null); selectTab("direct", profileData.user.id, profileData.user); }}>
                                <MessageSquare size={15} /> Chat
                              </button>
                            ) : profileData.friendship_status === "pending_sent" ? (
                              <button className="btn-secondary" style={{ flex: 1 }} disabled><Clock size={15} /> Request Pending</button>
                            ) : profileData.friendship_status === "pending_received" ? (
                              <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                                <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleRespondFriendRequest(profileData.user.friend_request_id, "accepted")}>
                                  <Check size={14} /> Accept Request
                                </button>
                                <button className="btn-danger" style={{ flex: 1 }} onClick={() => handleRespondFriendRequest(profileData.user.friend_request_id, "ignored")}>
                                  <X size={14} /> Ignore
                                </button>
                              </div>
                            ) : (
                              <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleSendFriendRequest(profileData.user.id)}>
                                <UserPlus size={15} /> Add Friend
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: Friends Tab */}
                  {profileTab === "friends" && (
                    <div>
                      {profileData.friends.length === 0 ? (
                        <div className="empty-requests-box">
                          <Users size={36} style={{ opacity: 0.3, marginBottom: "8px" }} />
                          <p style={{ fontWeight: 600 }}>No friends yet</p>
                          <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginTop: "4px" }}>
                            Discover and add friends from the Explore section!
                          </p>
                        </div>
                      ) : (
                        <div className="profile-friends-list">
                          {profileData.friends.map(f => (
                            <div key={f.id} className="friend-card-item">
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", flex: 1, overflow: "hidden" }} onClick={() => openUserProfile(f.id)}>
                                <img src={avatarSrc(f)} alt={f.name} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
                                <div style={{ overflow: "hidden" }}>
                                  <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#fff", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{f.name}</div>
                                  <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>@{f.username}</div>
                                </div>
                                {f.gender && (
                                  <span className={getGenderBadgeClass(f.gender)} style={{ fontSize: "0.58rem", padding: "1px 5px" }}>
                                    {f.gender}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                  className="btn-primary"
                                  style={{ padding: "5px 12px", fontSize: "0.78rem" }}
                                  onClick={() => { setViewingProfileId(null); selectTab("direct", f.id, f); }}
                                >
                                  <MessageSquare size={13} /> Chat
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: Requests Tab */}
                  {viewingProfileId === currentUser.id && profileTab === "requests" && (
                    <div>
                      {!profileData.pending_requests || profileData.pending_requests.length === 0 ? (
                        <div className="empty-requests-box">
                          <UserCheck size={36} style={{ opacity: 0.3, marginBottom: "8px" }} />
                          <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>No Pending Requests</p>
                          <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginTop: "4px" }}>
                            When someone sends you a friend request, it will appear here so you can accept or ignore it.
                          </p>
                        </div>
                      ) : (
                        <div className="profile-requests-list">
                          {profileData.pending_requests.map(req => (
                            <div key={req.id} className="request-card">
                              <div className="request-user-info" onClick={() => openUserProfile(req.requester.id)}>
                                <div className="user-avatar" style={{ width: 38, height: 38 }}>
                                  <img src={avatarSrc(req.requester)} alt={req.requester.name} />
                                </div>
                                <div style={{ overflow: "hidden" }}>
                                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                    {req.requester.name}
                                  </div>
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                                    @{req.requester.username}
                                  </div>
                                  {req.requester.gender && (
                                    <span className={getGenderBadgeClass(req.requester.gender)} style={{ fontSize: "0.58rem", padding: "1px 5px", marginTop: "2px", display: "inline-block" }}>
                                      {req.requester.gender}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="request-actions">
                                <button
                                  className="btn-primary"
                                  style={{ padding: "6px 12px", fontSize: "0.78rem", gap: "5px" }}
                                  onClick={() => handleRespondFriendRequest(req.id, "accepted")}
                                  title="Accept Friend Request"
                                >
                                  <Check size={13} /> Accept
                                </button>
                                <button
                                  className="btn-danger"
                                  style={{ padding: "6px 12px", fontSize: "0.78rem", gap: "5px" }}
                                  onClick={() => handleRespondFriendRequest(req.id, "ignored")}
                                  title="Ignore Friend Request"
                                >
                                  <X size={13} /> Ignore
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      ) : roomSettingsOpen && roomSettingsData ? (
        <main className="page-stage room-settings-page-stage">
          <header className="page-header">
            <button
              type="button"
              className="btn-back"
              onClick={() => setRoomSettingsOpen(false)}
              title="Back to Room"
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <Settings size={18} /> Manage Room
              </h2>
              <div className="header-topic">#{roomSettingsData.slug} · {roomSettingsData.title}</div>
            </div>
          </header>

          <div className="page-content-scroll">
            <div className="page-card">
              {/* Settings Tabs */}
              <div className="settings-tabs">
                {["info", "moderators", "members"].map(tab => (
                  <button key={tab} className={`settings-tab ${roomSettingsTab === tab ? "active" : ""}`} onClick={() => setRoomSettingsTab(tab)}>
                    {tab === "info" ? "Room Info" : tab === "moderators" ? "Moderators" : "Add Members"}
                  </button>
                ))}
              </div>

              {roomSettingsTab === "info" && (
                <div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                    <div style={{ position: "relative", width: "80px", height: "80px" }}>
                      {roomSettingsData.picture ? (
                        <img src={`${API_BASE}${roomSettingsData.picture}`} alt="" style={{ width: "80px", height: "80px", borderRadius: "12px", objectFit: "cover", border: "3px solid var(--accent-primary)" }} />
                      ) : (
                        <div style={{ width: "80px", height: "80px", borderRadius: "12px", background: "var(--bg-input)", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid var(--border-subtle)" }}>
                          <Image size={28} color="var(--text-dim)" />
                        </div>
                      )}
                      <button type="button" className="avatar-upload-btn" onClick={() => roomPicRef.current?.click()} title="Upload Room Picture" disabled={uploadingRoomPic}>
                        <Camera size={14} />
                      </button>
                    </div>
                    <input ref={roomPicRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleRoomPicUpload(e.target.files[0]); }} />
                    {uploadingRoomPic && <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Uploading...</span>}
                    <span style={{ fontSize: "0.74rem", color: "var(--text-dim)" }}>Room picture</span>
                  </div>

                  <form onSubmit={handleSaveRoomInfo} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label className="profile-field-label">Room Title</label>
                      <input type="text" value={editRoomTitle} onChange={e => setEditRoomTitle(e.target.value)} required className="chat-input profile-field-val" style={{ width: "100%", marginTop: "4px" }} />
                    </div>
                    <div>
                      <label className="profile-field-label">Description</label>
                      <textarea rows={3} value={editRoomDesc} onChange={e => setEditRoomDesc(e.target.value)} className="chat-input profile-field-val" style={{ width: "100%", marginTop: "4px", resize: "none" }} placeholder="Describe what this room is about..." />
                    </div>
                    <button type="submit" className="btn-primary">Save Changes</button>
                  </form>

                  <div style={{ marginTop: "24px", borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "10px" }}>
                      <strong>Danger Zone</strong> — deleting the room is permanent and removes all messages.
                    </p>
                    <button className="btn-danger" onClick={handleDeleteRoom}>
                      <Trash2 size={15} /> Delete Room
                    </button>
                  </div>
                </div>
              )}

              {roomSettingsTab === "moderators" && (
                <div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                    A room can have up to 5 moderators (including prime). Only the prime moderator can add or remove others.
                  </p>

                  {/* Existing Moderators */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                    {roomSettingsData.moderators?.map(mod => (
                      <div key={mod.user_id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "var(--bg-input)", borderRadius: "10px" }}>
                        <img src={avatarSrc(mod)} alt={mod.name} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{mod.name}</div>
                          <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>@{mod.username}</div>
                        </div>
                        {mod.is_prime ? (
                          <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.72rem", color: "var(--accent-gold)", fontWeight: 700 }}>
                            <Crown size={12} /> Prime
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.72rem", color: "var(--accent-primary)", fontWeight: 600 }}>Moderator</span>
                        )}
                        {!mod.is_prime && isCurrentUserPrimeModerator(roomSettingsData) && (
                          <button className="btn-icon" style={{ color: "var(--color-danger)" }} title="Remove Moderator" onClick={() => handleRemoveModerator(mod.user_id)}>
                            <ShieldOff size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Moderator — Elastic Search & Direct Username Input */}
                  {isCurrentUserPrimeModerator(roomSettingsData) && (roomSettingsData.moderators?.length || 0) < 5 && (
                    <div style={{ marginTop: "16px" }}>
                      <label className="profile-field-label">Add Moderator by Username or Name</label>
                      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                        <div style={{ position: "relative", flex: 1 }}>
                          <input
                            type="text"
                            placeholder="Type username (e.g. @sandeep) or full name..."
                            value={addModSearch}
                            onChange={e => searchUsersForModerator(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddModerator(addModSearch); } }}
                            className="chat-input"
                            style={{ width: "100%", paddingRight: isSearchingMods ? "34px" : "12px" }}
                          />
                          {isSearchingMods && (
                            <Loader2 size={16} className="mate-spin-icon" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--accent-primary)" }} />
                          )}
                        </div>
                        <button className="btn-primary" onClick={() => handleAddModerator(addModSearch)} disabled={!addModSearch.trim()}>
                          <ShieldPlus size={14} /> Add
                        </button>
                      </div>
                      <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "6px" }}>
                        Search users instantly by username or full name. Max 5 moderators total.
                      </p>

                      {/* Elastic Search Results */}
                      {addModResults.length > 0 && (
                        <div className="mod-search-results">
                          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "6px", fontWeight: 600 }}>
                            Matching users ({addModResults.length}):
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
                            {addModResults.map(u => (
                              <div key={u.id} className="mod-search-item">
                                <div className="user-avatar" style={{ width: 32, height: 32 }}>
                                  <img src={avatarSrc(u)} alt={u.name} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>@{u.username}</div>
                                </div>
                                {u.gender && (
                                  <span className={getGenderBadgeClass(u.gender)} style={{ fontSize: "0.62rem", padding: "1px 5px" }}>
                                    {u.gender}
                                  </span>
                                )}
                                <button
                                  className="btn-primary"
                                  style={{ padding: "5px 12px", fontSize: "0.76rem" }}
                                  onClick={() => handleAddModerator(u)}
                                >
                                  <ShieldPlus size={13} /> Add
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {addModSearch.trim() && !isSearchingMods && addModResults.length === 0 && (
                        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "8px", fontStyle: "italic" }}>
                          No matching users found for "{addModSearch}". You can also click "Add" to try adding by exact username.
                        </div>
                      )}
                    </div>
                  )}
                  {isCurrentUserPrimeModerator(roomSettingsData) && (roomSettingsData.moderators?.length || 0) >= 5 && (
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Room has reached the maximum of 5 moderators.</p>
                  )}
                </div>
              )}

              {roomSettingsTab === "members" && (
                <div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                    Search and add registered users to this room. You can also remove existing members.
                  </p>
                  <div className="explore-search-bar" style={{ marginBottom: "14px" }}>
                    <Search size={16} color="var(--text-dim)" />
                    <input type="text" placeholder="Search users to add..." value={addMemberSearch} onChange={e => searchMembersToAdd(e.target.value)} className="chat-input" />
                  </div>
                  {addMemberResults.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {addMemberResults.map(u => (
                        <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "var(--bg-input)", borderRadius: "10px" }}>
                          <img src={avatarSrc(u)} alt={u.name} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{u.name}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>@{u.username}</div>
                          </div>
                          <button className="btn-primary" style={{ padding: "5px 10px", fontSize: "0.78rem" }} onClick={() => handleAddMember(u.id)}>
                            <UserPlus size={13} /> Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      ) : viewMode === "mate" ? (
        <main className="page-stage mate-stage">
          <header className="page-header">
            <button
              type="button"
              className="btn-back"
              onClick={() => setViewMode("chat")}
              title="Back to chats"
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>Mate Matchmaking</h2>
              <div className="header-topic">1-on-1 Anonymous matching</div>
            </div>
          </header>

          <div className="page-content-scroll">
            <div className="mate-page-card">
              <div style={{ textAlign: "center" }}>
                <div className="mate-badge">
                  <Sparkles size={14} /> Anonymous Matchmaking
                </div>
                <h2 className="mate-title brand-gradient">Find your mate</h2>
                <p className="mate-subtitle">
                  Enter your interests, jump into the matchmaking pool, and connect anonymously with someone on your wavelength.
                </p>
              </div>

              {/* Center Rectangular Button with Rounded Edges */}
              <div style={{ position: "relative", margin: "28px 0 20px 0", display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  className={`mate-rect-btn ${mateStatus === "searching" ? "searching" : ""}`}
                  disabled={isSubmittingMatch}
                  onClick={mateStatus === "searching" ? handleCancelMatchmaking : handleStartMatchmaking}
                  title={mateStatus === "searching" ? "Click to cancel search" : "Start anonymous matchmaking"}
                >
                  {mateStatus === "searching" ? (
                    <>
                      <Loader2 size={20} className="mate-spin-icon" />
                      <span className="mate-btn-text">Searching...</span>
                      <span className="mate-btn-sub" style={{ fontSize: "0.78rem", opacity: 0.85 }}>(Click to cancel)</span>
                    </>
                  ) : isSubmittingMatch ? (
                    <>
                      <Loader2 size={20} className="mate-spin-icon" />
                      <span className="mate-btn-text">Matching...</span>
                    </>
                  ) : (
                    <>
                      <Flame size={20} className="mate-flame-icon" />
                      <span className="mate-btn-text">Find your Mate</span>
                    </>
                  )}
                </button>
              </div>

              {/* Countdown display */}
              {mateStatus === "searching" && (
                <div className="mate-countdown-card">
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                    Finding a mate with overlapping interests...
                  </div>
                  <div className="mate-countdown-timer">
                    <Clock size={18} />
                    <span>
                      {String(Math.floor(mateRemainingSeconds / 60)).padStart(2, "0")}:
                      {String(mateRemainingSeconds % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: "12px", padding: "6px 18px", fontSize: "0.82rem" }}
                    onClick={handleCancelMatchmaking}
                  >
                    Cancel Search
                  </button>
                </div>
              )}

              {/* Interests preference field */}
              <div className="mate-interests-box">
                <label className="mate-interests-label" htmlFor="mate-interests-input">
                  <span>Your interests</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "none", fontWeight: 500 }}>
                    e.g. coding, music, gaming
                  </span>
                </label>
                <input
                  id="mate-interests-input"
                  type="text"
                  className="mate-interests-input"
                  placeholder="Enter interests separated by commas (coding, gaming, movies)..."
                  value={mateInterestsInput}
                  disabled={mateStatus === "searching"}
                  onChange={e => setMateInterestsInput(e.target.value)}
                />
                {mateInterestsInput.split(",").map(s => s.trim().toLowerCase()).filter((s, idx, arr) => s.length > 0 && arr.indexOf(s) === idx).length > 0 && (
                  <div className="mate-chip-wrap">
                    {mateInterestsInput
                      .split(",")
                      .map(s => s.trim().toLowerCase())
                      .filter((s, idx, arr) => s.length > 0 && arr.indexOf(s) === idx)
                      .map(chip => (
                        <span key={chip} className="mate-chip">
                          #{chip}
                        </span>
                      ))}
                  </div>
                )}
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "4px" }}>
                  Interests are normalized (case-insensitive, trimmed, deduplicated) and compared using Jaccard similarity.
                </div>
              </div>
            </div>
          </div>
        </main>
      ) : viewMode === "mate_chat" ? (
        <main className="chat-stage">
          {/* Header */}
          <header className="chat-header">
            <div className="header-title-box">
              <button
                type="button"
                className="btn-back"
                onClick={handleExitMateConversation}
                title="Exit Mate Chat"
              >
                <ArrowLeft size={19} />
              </button>
              <div
                className="user-avatar"
                style={{
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.45rem",
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))",
                  border: "1px solid rgba(168, 85, 247, 0.4)",
                  boxShadow: "0 0 12px rgba(168, 85, 247, 0.3)"
                }}
              >
                {ANIMAL_EMOJIS[mateConversationData?.partner_nickname] || "🐾"}
              </div>
              <div>
                <h2>
                  {mateConversationData?.partner_nickname || "Anonymous Mate"}
                  <span className="mate-anon-tag" style={{ marginLeft: "8px" }}>
                    ANONYMOUS MATE
                  </span>
                </h2>
                <div className="header-topic">
                  You: {mateConversationData?.my_nickname ? `${ANIMAL_EMOJIS[mateConversationData?.my_nickname] || "🐾"} ${mateConversationData?.my_nickname}` : "Anonymous"}
                  {mateConversationData?.mutual_interest ? " · Mutual Friends" : ""}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {mateConversationData?.mutual_interest && mateConversationData?.partner_user_id && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: "0.82rem", padding: "7px 14px" }}
                  onClick={() => openUserProfile(mateConversationData.partner_user_id)}
                >
                  <UserCheck size={14} /> View Profile
                </button>
              )}

              <button
                type="button"
                className={`btn-interested ${mateConversationData?.my_interest ? "active" : ""}`}
                disabled={mateConversationData?.my_interest || mateConversationData?.has_left}
                onClick={handleExpressInterest}
                title={mateConversationData?.my_interest ? "You expressed interest!" : "Express interest in this mate"}
              >
                <Heart size={14} fill={mateConversationData?.my_interest ? "currentColor" : "none"} />
                <span>
                  {mateConversationData?.mutual_interest
                    ? "Friends! 🎉"
                    : mateConversationData?.my_interest
                      ? "Interested ✓"
                      : "Interested"}
                </span>
              </button>

              <button
                type="button"
                className="btn-exit"
                onClick={handleExitMateConversation}
                title="Exit anonymous conversation"
              >
                <LogOut size={14} />
                <span>Exit</span>
              </button>
            </div>
          </header>

          {/* Mutual Interest Banner */}
          {mateConversationData?.mutual_interest && (
            <div className="mate-banner-mutual">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Sparkles size={20} color="var(--accent-gold)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#fff" }}>
                    Mutual Interest Confirmed! 🎉
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)" }}>
                    You and {mateConversationData.partner_nickname} liked each other and are now reciprocal friends on PairUP!
                  </div>
                </div>
              </div>
              {mateConversationData.partner_user_id && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: "0.82rem", whiteSpace: "nowrap" }}
                  onClick={() => openUserProfile(mateConversationData.partner_user_id)}
                >
                  View Profile
                </button>
              )}
            </div>
          )}

          {/* Participant Left Banner */}
          {mateConversationData?.has_left && (
            <div className="mate-banner-left">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertCircle size={18} />
                <span>The other user has left the conversation.</span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ marginLeft: "auto", padding: "5px 14px", fontSize: "0.8rem" }}
                onClick={handleExitMateConversation}
              >
                Return to Mate
              </button>
            </div>
          )}

          {/* Messages Feed */}
          <div className="messages-feed">
            {mateMessages.length === 0 ? (
              <div style={{ margin: "auto", textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
                <span style={{ fontSize: "3rem", display: "block", marginBottom: "12px" }}>
                  {ANIMAL_EMOJIS[mateConversationData?.partner_nickname] || "💬"}
                </span>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                  You're paired with {mateConversationData?.partner_nickname}!
                </p>
                <p style={{ fontSize: "0.88rem" }}>
                  Say hello, share thoughts, or discuss your shared interests.
                </p>
              </div>
            ) : (
              mateMessages.map(msg => {
                const isOutgoing = msg.sender_nickname === mateConversationData?.my_nickname;
                const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                const emoji = ANIMAL_EMOJIS[msg.sender_nickname] || "🐾";
                return (
                  <div key={msg.id || Math.random()} className={`message-card ${isOutgoing ? "outgoing" : ""}`}>
                    <div
                      className="user-avatar"
                      style={{
                        width: "36px",
                        height: "36px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.3rem",
                        background: isOutgoing ? "rgba(99, 102, 241, 0.18)" : "rgba(16, 185, 129, 0.15)",
                        border: isOutgoing ? "1px solid rgba(99, 102, 241, 0.35)" : "1px solid rgba(16, 185, 129, 0.3)"
                      }}
                      title={msg.sender_nickname}
                    >
                      {emoji}
                    </div>
                    <div className="msg-bubble">
                      <div className="msg-header">
                        <span className="msg-sender" style={{ cursor: "default" }}>
                          {isOutgoing ? "You" : msg.sender_nickname}
                        </span>
                        <span className="msg-time">{time}</span>
                      </div>
                      <div className="msg-text">{msg.content}</div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={mateMessagesEndRef} />
          </div>

          {/* Typing Bar */}
          <div className="typing-bar">
            {mateTypingStatus && <span>{mateTypingStatus}</span>}
          </div>

          {/* Chat Input Container */}
          <div className="chat-input-container">
            <form className="chat-form" onSubmit={handleSendMateMessage}>
              <input
                type="text"
                className="chat-input"
                placeholder={mateConversationData?.has_left ? "Conversation ended." : `Message ${mateConversationData?.partner_nickname || "mate"}...`}
                value={mateInputMessage}
                disabled={mateConversationData?.has_left}
                onChange={handleMateInputChange}
                maxLength={1000}
              />
              <button
                type="submit"
                className="btn-send"
                disabled={!mateInputMessage.trim() || mateConversationData?.has_left}
                title="Send"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </main>
      ) : viewMode === "explore" ? (
        <main className="page-stage explore-stage">
          <header className="page-header">
            <button
              type="button"
              className="btn-back"
              onClick={() => setViewMode("chat")}
              title="Back to chats"
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>Explore Friends</h2>
              <div className="header-topic">Discover people and send friend requests to chat</div>
            </div>
          </header>

          <div className="page-content-scroll explore-content-scroll">
            <div className="explore-search-bar">
              <Search size={18} color="var(--text-dim)" />
              <input type="text" placeholder="Search by username or display name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="chat-input" />
            </div>

            <div className="explore-grid">
              {exploreUsersList.length === 0 ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-dim)", padding: "40px 0" }}>
                  {searchQuery ? `No users found for "${searchQuery}"` : "Start searching for friends above!"}
                </div>
              ) : exploreUsersList.map(u => (
                <div key={u.id} className="user-card">
                  <div className="user-card-header" onClick={() => openUserProfile(u.id)}>
                    <div className="user-avatar" style={{ width: "42px", height: "42px" }}>
                      <img src={avatarSrc(u)} alt={u.name} />
                    </div>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>{u.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>@{u.username}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className={getGenderBadgeClass(u.gender)}>{u.gender || "Prefer not to say"}</span>
                    {u.friendship_status === "accepted" && (
                      <span className="badge-friends"><Check size={11} /> Friends</span>
                    )}
                  </div>
                  {u.bio && <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{u.bio}</p>}
                  <div style={{ marginTop: "auto", display: "flex", gap: "8px", paddingTop: "10px" }}>
                    {u.friendship_status === "accepted" ? (
                      <>
                        <button className="btn-primary" style={{ flex: 1, padding: "8px 12px", fontSize: "0.82rem" }} onClick={() => { setViewMode("chat"); selectTab("direct", u.id, u); }}>
                          <MessageSquare size={14} /> Chat
                        </button>
                        <button className="btn-secondary" style={{ padding: "8px 12px", fontSize: "0.82rem" }} onClick={() => openUserProfile(u.id)}>
                          Profile
                        </button>
                      </>
                    ) : u.friendship_status === "pending_sent" ? (
                      <>
                        <button className="btn-secondary" style={{ flex: 1, padding: "8px 12px", fontSize: "0.82rem", opacity: 0.8 }} disabled>
                          <Clock size={14} /> Requested
                        </button>
                        <button className="btn-secondary" style={{ padding: "8px 12px", fontSize: "0.82rem" }} onClick={() => openUserProfile(u.id)}>
                          Profile
                        </button>
                      </>
                    ) : u.friendship_status === "pending_received" ? (
                      <>
                        <button className="btn-primary" style={{ flex: 1, padding: "8px 8px", fontSize: "0.78rem" }} onClick={() => handleRespondFriendRequest(u.friend_request_id, "accepted")}>
                          <Check size={13} /> Accept
                        </button>
                        <button className="btn-danger" style={{ flex: 1, padding: "8px 8px", fontSize: "0.78rem" }} onClick={() => handleRespondFriendRequest(u.friend_request_id, "ignored")}>
                          <X size={13} /> Ignore
                        </button>
                        <button className="btn-secondary" style={{ padding: "8px 10px", fontSize: "0.82rem" }} onClick={() => openUserProfile(u.id)}>
                          Profile
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-primary" style={{ flex: 1, padding: "8px 12px", fontSize: "0.82rem" }} onClick={() => handleSendFriendRequest(u.id)}>
                          <UserPlus size={14} /> Add Friend
                        </button>
                        <button className="btn-secondary" style={{ padding: "8px 12px", fontSize: "0.82rem" }} onClick={() => openUserProfile(u.id)}>
                          Profile
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      ) : (
        /* ── CHAT STAGE ── */
        <main className="chat-stage">
          {/* Header */}
          <header className="chat-header">
            <div className="header-title-box">
              <button
                type="button"
                className="btn-back"
                onClick={() => setActiveTab({ type: "room", id: null, data: null })}
                title="Back to chats"
              >
                <ArrowLeft size={19} />
              </button>
              {activeTab.type === "room" && activeRoom && (
                <div className="room-icon-header" onClick={() => isCurrentUserModerator(activeRoom) && openRoomSettings(activeRoom)}>
                  {activeRoom.picture ? (
                    <img src={`${API_BASE}${activeRoom.picture}`} alt={activeRoom.title} style={{ width: 38, height: 38, borderRadius: "8px", objectFit: "cover" }} />
                  ) : (
                    <div className="room-hash-icon"><Hash size={20} /></div>
                  )}
                </div>
              )}
              {activeTab.type === "direct" && activeDirectUser && (
                <div className="user-avatar" style={{ width: "38px", height: "38px" }} onClick={() => openUserProfile(activeDirectUser.id)}>
                  <img src={avatarSrc(activeDirectUser)} alt={activeDirectUser.name} />
                </div>
              )}
              <div>
                {activeTab.id ? (
                  <>
                    <h2>
                      {activeTab.type === "room" ? activeRoom?.title : activeDirectUser?.name}
                      {activeTab.type === "direct" && activeDirectUser?.gender && (
                        <span className={getGenderBadgeClass(activeDirectUser.gender)} style={{ marginLeft: "8px" }}>
                          {activeDirectUser.gender}
                        </span>
                      )}
                    </h2>
                    <div className="header-topic">
                      {activeTab.type === "room"
                        ? (activeRoom?.description || activeRoom?.slug && `#${activeRoom.slug}`)
                        : `@${activeDirectUser?.username || "user"}`}
                    </div>
                    {activeTab.type === "room" && activeRoom?.moderators && (
                      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "2px" }}>
                        {activeRoom.moderators.length} moderator{activeRoom.moderators.length !== 1 ? "s" : ""}
                        {activeRoom.moderators.find(m => m.is_prime) && ` · Prime: @${activeRoom.moderators.find(m => m.is_prime)?.username}`}
                      </div>
                    )}
                  </>
                ) : (
                  <h2 style={{ color: "var(--text-dim)" }}>Select a room or conversation</h2>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {activeTab.type === "room" && activeRoom && isCurrentUserModerator(activeRoom) && (
                <button className="btn-secondary" style={{ fontSize: "0.82rem", padding: "7px 14px" }} onClick={() => openRoomSettings(activeRoom)}>
                  <Settings size={14} /> Manage Room
                </button>
              )}
              {activeTab.type === "direct" && activeDirectUser && (
                <button className="btn-secondary" style={{ fontSize: "0.82rem", padding: "7px 14px" }} onClick={() => openUserProfile(activeDirectUser.id)}>
                  View Profile
                </button>
              )}
            </div>
          </header>

          {/* Messages */}
          <div className="messages-feed">
            {!activeTab.id ? (
              <div style={{ margin: "auto", textAlign: "center", padding: "60px 40px", color: "var(--text-dim)" }}>
                <Hash size={48} style={{ opacity: 0.2, marginBottom: "16px" }} />
                <p style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "8px" }}>Welcome to PairUP</p>
                <p style={{ fontSize: "0.88rem" }}>Pick a room or a direct conversation from the sidebar to start chatting.</p>
              </div>
            ) : messages.length === 0 ? (
              <div style={{ margin: "auto", textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
                <p>No messages here yet. Say hello!</p>
              </div>
            ) : messages.map(msg => {
              if (msg.isNotice) return (
                <div key={msg.id} className="notice-line">{msg.text}</div>
              );
              const isOutgoing = msg.sender_id === currentUser.id;
              const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
              return (
                <div key={msg.id || Math.random()} className={`message-card ${isOutgoing ? "outgoing" : ""}`}>
                  <div className="user-avatar" style={{ width: "34px", height: "34px" }} onClick={() => openUserProfile(msg.sender_id)} title="View Profile">
                    <img src={msg.sender_avatar ? (msg.sender_avatar.startsWith("/api/") ? `${API_BASE}${msg.sender_avatar}` : msg.sender_avatar) : `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${msg.sender_username}`} alt={msg.sender_name} />
                  </div>
                  <div className="msg-bubble">
                    <div className="msg-header">
                      <span className="msg-sender" onClick={() => openUserProfile(msg.sender_id)}>
                        {isOutgoing ? "You" : msg.sender_name}
                      </span>
                      {msg.sender_gender && (
                        <span className={getGenderBadgeClass(msg.sender_gender)} style={{ fontSize: "0.6rem", padding: "1px 4px" }}>
                          {msg.sender_gender}
                        </span>
                      )}
                      <span className="msg-time">{time}</span>
                    </div>
                    <div className="msg-text">{msg.content}</div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing */}
          <div className="typing-bar">
            {Object.keys(typingUsers).length > 0 && (
              <span>{Object.values(typingUsers).join(", ")} {Object.keys(typingUsers).length === 1 ? "is" : "are"} typing...</span>
            )}
          </div>

          {/* Input */}
          <div className="chat-input-container">
            <form className="chat-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                className="chat-input"
                placeholder={activeTab.id ? (activeTab.type === "room" ? `Message ${activeRoom?.title || "room"}...` : `Message ${activeDirectUser?.name || "user"}...`) : "Select a chat first..."}
                value={inputMessage}
                onChange={handleInputChange}
                disabled={!activeTab.id}
                maxLength={5000}
              />
              <button type="submit" className="btn-send" disabled={!inputMessage.trim() || !activeTab.id} title="Send">
                <Send size={16} />
              </button>
            </form>
          </div>
        </main>
      )}

      {/* ══════════════════════════════════════════════════════════
          CREATE ROOM MODAL
      ══════════════════════════════════════════════════════════ */}
      {isCreateRoomOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateRoomOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Chat Room</h3>
              <button className="btn-icon" onClick={() => setIsCreateRoomOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateRoom} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label className="profile-field-label">Room Slug (URL)</label>
                <input type="text" placeholder="e.g. music-hub" value={newRoomSlug} onChange={e => setNewRoomSlug(e.target.value)} required className="chat-input profile-field-val" style={{ width: "100%", marginTop: "4px" }} />
              </div>
              <div>
                <label className="profile-field-label">Display Title</label>
                <input type="text" placeholder="e.g. Music Hub" value={newRoomTitle} onChange={e => setNewRoomTitle(e.target.value)} required className="chat-input profile-field-val" style={{ width: "100%", marginTop: "4px" }} />
              </div>
              <div>
                <label className="profile-field-label">Description (optional)</label>
                <input type="text" placeholder="What is this room about?" value={newRoomDesc} onChange={e => setNewRoomDesc(e.target.value)} className="chat-input profile-field-val" style={{ width: "100%", marginTop: "4px" }} />
              </div>
              <p style={{ fontSize: "0.76rem", color: "var(--text-dim)" }}>
                You will be set as the prime moderator of this room.
              </p>
              <button type="submit" className="btn-primary" style={{ marginTop: "4px" }}>Launch Room</button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Snackbar */}
      {snackbar && (
        <div className="snackbar-container">
          <div className={`snackbar ${snackbar.type || "info"}`}>
            {snackbar.type === "success" && <CheckCircle2 size={16} />}
            {snackbar.type === "error" && <AlertCircle size={16} />}
            <span>{snackbar.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

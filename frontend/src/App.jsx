import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import LandingPage from './LandingPage.jsx';
import {
  Hash, MessageSquare, Megaphone, Users, Send, Plus, LogOut, Search,
  UserPlus, Check, X, UserCheck, Clock, Sparkles, Edit3,
  Shield, ShieldPlus, ShieldOff, Trash2, Settings, Camera,
  Upload, Image, ChevronDown, Crown, UserMinus, User as UserIcon,
  Heart, AlertCircle, CheckCircle2, Loader2, Flame,
  PanelLeftClose, PanelLeftOpen, ArrowLeft, Info, Sun, Moon,
  Bell, Lock, Globe, Copy, Share2, MoreVertical, Eraser, Construction, LogIn,
  Star, MessageSquarePlus
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
  Sparrow: "🐦",
  Bear: "🐻",
  Wolf: "🐺",
  Deer: "🦌",
  Falcon: "🦅",
  Owl: "🦉",
  Lion: "🦁",
  Hedgehog: "🦔",
  Cheetah: "🐆",
  Beaver: "🦫",
  Kangaroo: "🦘",
  Badger: "🦡",
  Lynx: "🐱",
  Seal: "🦭",
  Raccoon: "🦝"
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
  const [showLandingPage, setShowLandingPage] = useState(() => !localStorage.getItem("pairup_token"));
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Snackbar Notification
  const [snackbar, setSnackbar] = useState(null);
  const snackbarTimerRef = useRef(null);

  // Theme (Light / Dark Minimalist Gray & White)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("pu_theme") || "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pu_theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "dark" ? "#09090b" : "#ffffff");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === "dark" ? "light" : "dark"));
  };

  // Navigation & Layout
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 768) return false;
    return localStorage.getItem("pairup_sidebar_collapsed") === "true";
  });

  const toggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 768) return;
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("pairup_sidebar_collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768 && isSidebarCollapsed) {
        setIsSidebarCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isSidebarCollapsed]);

  const [viewMode, setViewMode] = useState("chat"); // "chat" | "explore" | "mate" | "mate_chat" | "announcements"
  const [activeTab, setActiveTab] = useState({ type: "room", id: null, data: null });
  const [mobileTab, setMobileTab] = useState("chat"); // "chat" | "announcements"
  const [exploreFilter, setExploreFilter] = useState("all"); // "all" | "friends"
  const [announcementsTab, setAnnouncementsTab] = useState("rooms"); // "rooms" | "announcements"
  const [roomsFilterQuery, setRoomsFilterQuery] = useState("");

  // Data
  const [rooms, setRooms] = useState([]);
  const [directConversations, setDirectConversations] = useState([]);
  const [exploreUsersList, setExploreUsersList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});

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
  const [newRoomIsPrivate, setNewRoomIsPrivate] = useState(false);

  // Room Settings Modal (moderators)
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [roomSettingsData, setRoomSettingsData] = useState(null);
  const [editRoomTitle, setEditRoomTitle] = useState("");
  const [editRoomDesc, setEditRoomDesc] = useState("");
  const [editRoomIsPrivate, setEditRoomIsPrivate] = useState(false);
  const [roomSettingsTab, setRoomSettingsTab] = useState("info"); // "info" | "moderators" | "admissions"
  const [roomAdmissions, setRoomAdmissions] = useState([]);
  const [isLoadingAdmissions, setIsLoadingAdmissions] = useState(false);
  const [hasCopiedInvite, setHasCopiedInvite] = useState(false);
  const [addModUserId, setAddModUserId] = useState("");
  const [addModSearch, setAddModSearch] = useState("");
  const [addModResults, setAddModResults] = useState([]);
  const [isSearchingMods, setIsSearchingMods] = useState(false);
  const [uploadingRoomPic, setUploadingRoomPic] = useState(false);
  const roomPicRef = useRef(null);

  // Notification Box
  const [notificationsOpenMode, setNotificationsOpenMode] = useState(null); // null | "sidebar" | "topright"
  const notificationsOpen = notificationsOpenMode !== null;
  const [notificationsList, setNotificationsList] = useState([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const notificationsSidebarRef = useRef(null);
  const notificationsTopRightRef = useRef(null);

  // Invite Link Handling (Joining via URL)
  const [inviteFromUrl, setInviteFromUrl] = useState(null);
  const [inviteAdmissionStatus, setInviteAdmissionStatus] = useState(null);

  // Room Info View (for normal users)
  const [viewingRoomInfo, setViewingRoomInfo] = useState(null);
  const [roomParticipants, setRoomParticipants] = useState([]);
  const [loadingRoomInfo, setLoadingRoomInfo] = useState(false);

  // Public Room Join Confirmation Modal
  const [roomJoinPrompt, setRoomJoinPrompt] = useState(null);

  // Active Chat Options Menu (Three Dots)
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const chatMenuRef = useRef(null);

  // Mate #hot trends
  const [mateTrends, setMateTrends] = useState([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);

  // Feedbacks Floating Button & Modal
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackHoverRating, setFeedbackHoverRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // New Chat with Friend Modal (Mobile FAB + Direct Messages Quick Action)
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [friendsForNewChat, setFriendsForNewChat] = useState([]);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [isLoadingFriendsForChat, setIsLoadingFriendsForChat] = useState(false);

  // System Maintenance Status
  const [maintenanceState, setMaintenanceState] = useState({ active: false, message: "" });

  const pushNavState = useCallback((type) => {
    try {
      window.history.pushState({ puApp: true, type, ts: Date.now() }, "");
    } catch (e) { }
  }, []);

  const handleSystemOrInAppBack = useCallback((fallbackFn) => {
    if (window.history.state && window.history.state.puApp && !window.history.state.root) {
      window.history.back();
    } else if (fallbackFn) {
      fallbackFn();
    }
  }, []);

  // Initialize root history state
  useEffect(() => {
    if (!window.history.state || !window.history.state.puApp) {
      window.history.replaceState({ puApp: true, root: true }, "");
    }
  }, []);

  const activeChatStateRef = useRef({
    viewMode,
    activeTab,
    viewingProfileId,
    roomSettingsOpen,
    viewingRoomInfo,
    currentUserId: currentUser?.id,
    isCreateRoomOpen,
    showLandingPage,
    isEditingProfile,
    mobileTab,
    isFeedbackModalOpen,
    isNewChatModalOpen
  });

  useEffect(() => {
    activeChatStateRef.current = {
      viewMode,
      activeTab,
      viewingProfileId,
      roomSettingsOpen,
      viewingRoomInfo,
      currentUserId: currentUser?.id,
      isCreateRoomOpen,
      showLandingPage,
      isEditingProfile,
      mobileTab,
      isFeedbackModalOpen,
      isNewChatModalOpen
    };
  }, [viewMode, activeTab, viewingProfileId, roomSettingsOpen, viewingRoomInfo, currentUser, isCreateRoomOpen, showLandingPage, isEditingProfile, mobileTab, isFeedbackModalOpen, isNewChatModalOpen]);

  // Robust System & Hardware Back Button Handler
  useEffect(() => {
    const onPopState = () => {
      const state = activeChatStateRef.current;
      if (notificationsOpenRef.current) {
        setNotificationsOpenMode(null);
        return;
      }
      if (state.isNewChatModalOpen) {
        setIsNewChatModalOpen(false);
        return;
      }
      if (state.isFeedbackModalOpen) {
        setIsFeedbackModalOpen(false);
        return;
      }
      if (state.isEditingProfile) {
        setIsEditingProfile(false);
        return;
      }
      if (state.viewingProfileId) {
        setViewingProfileId(null);
        return;
      }
      if (state.roomSettingsOpen) {
        setRoomSettingsOpen(false);
        return;
      }
      if (state.viewingRoomInfo) {
        setViewingRoomInfo(null);
        return;
      }
      if (state.isCreateRoomOpen) {
        setIsCreateRoomOpen(false);
        return;
      }
      if (state.showLandingPage) {
        setShowLandingPage(false);
        return;
      }
      if (state.activeTab?.id && window.innerWidth <= 768) {
        setActiveTab({ type: "room", id: null, data: null });
        return;
      }
      if (state.viewMode !== "chat") {
        setViewMode("chat");
        setMobileTab("chat");
        return;
      }
      if (state.mobileTab !== "chat") {
        setMobileTab("chat");
        return;
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Clear unread count when viewing active room or conversation
  useEffect(() => {
    if (viewMode === "chat" && activeTab.id && !viewingProfileId && !roomSettingsOpen && !viewingRoomInfo) {
      const key = `${activeTab.type}_${activeTab.type === "room" ? activeTab.id?.toLowerCase() : activeTab.id}`;
      setUnreadCounts(prev => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [viewMode, activeTab.type, activeTab.id, viewingProfileId, roomSettingsOpen, viewingRoomInfo]);

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

    fetch(`${API_BASE}/api/system/status`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setMaintenanceState({
            active: Boolean(d.maintenance_mode),
            message: d.maintenance_message || ""
          });
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (!token && googleClientId && window.google) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
        });
        const timer = setTimeout(() => {
          const btn = document.getElementById("google-signin-btn");
          if (btn) {
            btn.innerHTML = "";
            window.google.accounts.id.renderButton(btn, {
              theme: "outline", size: "large", shape: "rectangular", width: 340, text: "continue_with"
            });
          }
        }, 50);
        return () => clearTimeout(timer);
      } catch (e) { console.error(e); }
    }
  }, [token, googleClientId, showAuthModal]);

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
    if (e && e.preventDefault) e.preventDefault();
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
      setShowAuthModal(true);
      setShowLandingPage(true);
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
    setShowAuthModal(false);
    setShowLandingPage(false);
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
    setToken("");
    setCurrentUser(null);
    localStorage.removeItem("pairup_token");
    localStorage.removeItem("pairup_user");
    setShowLandingPage(true);
    setShowAuthModal(false);
    setMateStatus("idle");
    setMateConversationId(null);
    setMateConversationData(null);
    setMateMessages([]);
  };

  // ──────────────────────────────────────────────────────────────
  // DATA LOADERS
  // ──────────────────────────────────────────────────────────────
  // DATA LOADERS & NOTIFICATIONS
  // ──────────────────────────────────────────────────────────────
  const loadRooms = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/rooms`, { headers });
      if (res.ok) setRooms(await res.json());
    } catch (e) { }
  }, [token]);

  const notificationsOpenRef = useRef(notificationsOpen);
  useEffect(() => { notificationsOpenRef.current = notificationsOpen; }, [notificationsOpen]);

  const refreshDirectConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/direct-conversations`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDirectConversations(await res.json());
    } catch (e) { }
  }, [token]);

  const loadExploreUsers = useCallback(async (query = "") => {
    if (!token) return;
    try {
      const url = query ? `${API_BASE}/api/explore-users?query=${encodeURIComponent(query)}` : `${API_BASE}/api/explore-users`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setExploreUsersList(await res.json());
    } catch (e) { }
  }, [token]);

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

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        setNotificationsList(items);
        if (!notificationsOpenRef.current) {
          setUnreadNotificationsCount(data.unread_count || 0);
        }
        const friendReqCount = items.filter(n => n.type === "friend_request").length;
        setPendingRequestsCount(friendReqCount);
      }
    } catch (e) { }
  }, [token]);

  const toggleNotifications = (mode = "topright") => {
    setNotificationsOpenMode(prev => {
      const next = prev === mode ? null : mode;
      if (next) {
        // Once opened, mark all notifications as read
        setUnreadNotificationsCount(0);
      }
      return next;
    });
  };

  // Close notifications on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      const activeRef = notificationsOpenMode === "sidebar" ? notificationsSidebarRef : notificationsTopRightRef;
      if (activeRef.current && !activeRef.current.contains(e.target)) {
        setNotificationsOpenMode(null);
      }
    };
    if (notificationsOpenMode) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notificationsOpenMode]);

  // Close chat options menu on click outside
  useEffect(() => {
    const handleClickOutsideChatMenu = (e) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target)) {
        setChatMenuOpen(false);
      }
    };
    if (chatMenuOpen) {
      document.addEventListener("mousedown", handleClickOutsideChatMenu);
    }
    return () => document.removeEventListener("mousedown", handleClickOutsideChatMenu);
  }, [chatMenuOpen]);

  // Parse invite link from URL (?invite=slug&code=token). The invite is persisted so it
  // survives the login / OAuth redirect that unauthenticated visitors must go through.
  const inviteMountedRef = useRef(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const inviteSlug = params.get("invite");
      const inviteCode = params.get("code");
      if (inviteSlug && inviteCode) {
        setInviteFromUrl({ slug: inviteSlug.toLowerCase(), code: inviteCode });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        const saved = localStorage.getItem("pairup_pending_invite");
        if (saved) setInviteFromUrl(JSON.parse(saved));
      }
    } catch (e) { }
  }, []);

  useEffect(() => {
    if (inviteFromUrl) {
      localStorage.setItem("pairup_pending_invite", JSON.stringify(inviteFromUrl));
    } else if (inviteMountedRef.current) {
      localStorage.removeItem("pairup_pending_invite");
    }
    inviteMountedRef.current = true;
  }, [inviteFromUrl]);

  useEffect(() => {
    if (token) {
      loadRooms();
      refreshDirectConversations();
      refreshPendingCount();
      fetchNotifications();
      const interval = setInterval(() => {
        fetchNotifications();
        loadRooms();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [token, loadRooms, refreshPendingCount, fetchNotifications]);

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
  const callbacksRef = useRef({});
  useEffect(() => {
    callbacksRef.current = {
      refreshPendingCount,
      fetchNotifications,
      loadRooms,
      refreshDirectConversations,
      loadMateConversation,
      showSnackbar,
    };
  });

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const state = activeChatStateRef.current;
      if (state.activeTab?.type === "room" && state.activeTab?.id) {
        ws.send(JSON.stringify({ action: "join_room", room_slug: state.activeTab.id }));
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
          setRooms(prev => {
            const roomSlug = data.room_slug?.toLowerCase();
            const idx = prev.findIndex(r => r.slug.toLowerCase() === roomSlug);
            if (idx < 0) return prev;
            const target = {
              ...prev[idx],
              last_message: data.content,
              last_message_at: data.created_at || new Date().toISOString(),
              last_message_sender_name: data.sender_name,
              last_message_sender_id: data.sender_id
            };
            return [target, ...prev.filter((_, i) => i !== idx)];
          });
          const state = activeChatStateRef.current;
          const isViewingThisRoom = state.viewMode === "chat" &&
            !state.viewingProfileId &&
            !state.roomSettingsOpen &&
            !state.viewingRoomInfo &&
            state.activeTab?.type === "room" &&
            state.activeTab?.id?.toLowerCase() === data.room_slug?.toLowerCase();

          if (isViewingThisRoom) {
            setMessages(prev => [...prev, data]);
          } else {
            if (data.sender_id !== state.currentUserId) {
              const roomKey = `room_${data.room_slug?.toLowerCase()}`;
              setUnreadCounts(prev => ({
                ...prev,
                [roomKey]: (prev[roomKey] || 0) + 1
              }));
            }
          }
        } else if (data.type === "room_notice") {
          const state = activeChatStateRef.current;
          if (state.activeTab?.type === "room" && state.activeTab?.id?.toLowerCase() === data.room_slug?.toLowerCase()) {
            setMessages(prev => [...prev, { isNotice: true, text: data.notice, id: Math.random() }]);
          }
        } else if (data.type === "direct_message") {
          const state = activeChatStateRef.current;
          const partnerId = data.sender_id === state.currentUserId ? data.recipient_id : data.sender_id;
          setDirectConversations(prev => {
            const idx = prev.findIndex(u => u.id === partnerId);
            if (idx < 0) return prev;
            const target = {
              ...prev[idx],
              last_message: data.content,
              last_message_at: data.created_at || new Date().toISOString(),
              last_message_sender_id: data.sender_id
            };
            return [target, ...prev.filter((_, i) => i !== idx)];
          });
          callbacksRef.current.refreshDirectConversations?.();
          const isViewingThisConvo = state.viewMode === "chat" &&
            !state.viewingProfileId &&
            !state.roomSettingsOpen &&
            !state.viewingRoomInfo &&
            state.activeTab?.type === "direct" &&
            (state.activeTab?.id === data.sender_id || state.activeTab?.id === data.recipient_id);

          if (isViewingThisConvo) {
            setMessages(prev => [...prev, data]);
          } else {
            if (data.sender_id !== state.currentUserId) {
              const directKey = `direct_${data.sender_id}`;
              setUnreadCounts(prev => ({
                ...prev,
                [directKey]: (prev[directKey] || 0) + 1
              }));
            }
          }
        } else if (data.type === "mate_match_found") {
          setMateConversationId(data.conversation_id);
          setMateStatus("matched");
          setMateExpiresAt(null);
          callbacksRef.current.loadMateConversation?.(data.conversation_id);
          setViewMode("mate_chat");
          callbacksRef.current.showSnackbar?.(`Match found! Connected with ${data.partner_nickname}`, "success");
        } else if (data.type === "mate_message") {
          if (data.conversation_id === mateConversationIdRef.current) {
            setMateMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
          }
        } else if (data.type === "mate_interest_received") {
          if (data.conversation_id === mateConversationIdRef.current) {
            setMateConversationData(prev => prev ? { ...prev, partner_interest: true } : prev);
            callbacksRef.current.showSnackbar?.(`${data.nickname} is interested in you`, "info");
          }
        } else if (data.type === "mate_mutual_interest") {
          if (data.conversation_id === mateConversationIdRef.current) {
            setMateConversationData(prev => prev ? {
              ...prev,
              mutual_interest: true,
              partner_user_id: data.partner_user_id
            } : prev);
            callbacksRef.current.showSnackbar?.("It's a Match! You are now friends on PairUP! 🎉", "success");
            callbacksRef.current.refreshDirectConversations?.();
            callbacksRef.current.refreshPendingCount?.();
          }
        } else if (data.type === "mate_participant_left") {
          if (data.conversation_id === mateConversationIdRef.current) {
            setMateConversationData(prev => prev ? { ...prev, has_left: true } : prev);
            callbacksRef.current.showSnackbar?.(data.message || "The other user has left the conversation.", "info");
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
        } else if (data.type === "friend_request_received") {
          callbacksRef.current.refreshPendingCount?.();
          callbacksRef.current.fetchNotifications?.();
          callbacksRef.current.showSnackbar?.(`New friend request from ${data.name || "a user"}!`, "info");
        } else if (data.type === "friend_request_accepted") {
          callbacksRef.current.refreshDirectConversations?.();
          callbacksRef.current.fetchNotifications?.();
          callbacksRef.current.showSnackbar?.(`${data.name} accepted your friend request! 🎉`, "success");
        } else if (data.type === "room_admission_received") {
          callbacksRef.current.loadRooms?.();
          callbacksRef.current.fetchNotifications?.();
          callbacksRef.current.showSnackbar?.(`${data.name} requested to join #${data.room_title}`, "info");
        } else if (data.type === "room_admission_status") {
          if (data.status === "accepted") {
            callbacksRef.current.showSnackbar?.(`Your admission to #${data.room_title} was accepted! 🎉`, "success");
            callbacksRef.current.loadRooms?.();
          } else {
            callbacksRef.current.showSnackbar?.(`Admission request to #${data.room_title} was declined.`, "info");
          }
        } else if (data.type === "error") {
          callbacksRef.current.showSnackbar?.(data.message, "error");
        } else if (data.type === "maintenance_status") {
          setMaintenanceState({
            active: Boolean(data.maintenance_mode),
            message: data.maintenance_message || ""
          });
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

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };

    return () => {
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [token]);

  // Keep WebSocket joined to active room across tab changes without reconnecting socket
  useEffect(() => {
    if (activeTab.type === "room" && activeTab.id) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "join_room", room_slug: activeTab.id }));
      }
    }
  }, [activeTab.type, activeTab.id]);

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

  const parseSafeDate = (d) => {
    if (!d) return null;
    if (d instanceof Date) return d;
    let s = String(d).trim();
    if (!s) return null;
    if ((s.includes("T") || s.includes(" ")) && !s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s) && !/[+-]\d{4}$/.test(s)) {
      s = s.replace(" ", "T");
      s += "Z";
    }
    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatMessageTimestamp = (dateInput) => {
    const d = parseSafeDate(dateInput);
    if (!d) return "";
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    if (isToday) return timeStr;
    if (isYesterday) return `Yesterday, ${timeStr}`;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
  };

  const formatTileTimestamp = (dateInput) => {
    const d = parseSafeDate(dateInput);
    if (!d) return "";
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const isCurrentUserModerator = (room) =>
    room?.moderators?.some(m => m.user_id === currentUser?.id);

  const isCurrentUserPrimeModerator = (room) =>
    room?.moderators?.some(m => m.user_id === currentUser?.id && m.is_prime);

  const isUserRoomParticipant = (room) => {
    if (!room || !currentUser) return false;
    if (room.creator_id === currentUser.id) return true;
    if (isCurrentUserModerator(room)) return true;
    return Boolean(room.is_member);
  };

  const handleConfirmJoinPublicRoom = async (room) => {
    if (!room) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${room.slug}/join`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code: null })
      });
      const data = await res.json();
      if (res.ok) {
        showSnackbar(data.message || `Joined #${room.title}!`);
        const updatedRoom = { ...room, is_member: true };
        setRooms(prev => prev.map(r => r.slug === room.slug ? updatedRoom : r));
        setRoomJoinPrompt(null);
        await loadRooms();
        setViewMode("chat");
        if (window.innerWidth <= 768) {
          pushNavState("chat_active");
        }
        setViewingProfileId(null);
        setRoomSettingsOpen(false);
        setViewingRoomInfo(null);
        setActiveTab({ type: "room", id: room.slug, data: updatedRoom });
        setMessages([]);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: "join_room", room_slug: room.slug }));
        }
        try {
          const msgRes = await fetch(`${API_BASE}/api/rooms/${room.slug}/messages`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (msgRes.ok) setMessages(await msgRes.json());
        } catch (e) { }
      } else {
        alert(data.detail || "Could not join room");
      }
    } catch (e) {
      alert("Failed to join room. Please check your network connection.");
    }
  };

  const handleAttemptEnterRoom = (room) => {
    if (!room) return;
    if (isUserRoomParticipant(room)) {
      setViewMode("chat");
      selectTab("room", room.slug, room);
      return;
    }
    if (room.is_private) {
      openRoomInfo(room);
      return;
    }
    setRoomJoinPrompt(room);
  };

  // ──────────────────────────────────────────────────────────────
  // NAVIGATION
  // ──────────────────────────────────────────────────────────────
  const selectTab = async (type, id, dataObj) => {
    if (type === "room") {
      const targetRoom = dataObj || rooms.find(r => r.slug === id);
      if (targetRoom && !isUserRoomParticipant(targetRoom)) {
        if (targetRoom.is_private) {
          openRoomInfo(targetRoom);
        } else {
          setRoomJoinPrompt(targetRoom);
        }
        return;
      }
    }

    if (window.innerWidth <= 768 && id) {
      pushNavState("chat_active");
    }
    setViewMode("chat");
    setViewingProfileId(null);
    setRoomSettingsOpen(false);
    setViewingRoomInfo(null);
    setActiveTab({ type, id, data: dataObj });
    setMessages([]);

    const unreadKey = `${type}_${type === "room" ? id?.toLowerCase() : id}`;
    setUnreadCounts(prev => {
      if (!prev[unreadKey]) return prev;
      const next = { ...prev };
      delete next[unreadKey];
      return next;
    });

    if (type === "room") {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "join_room", room_slug: id }));
      }
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/api/rooms/${id}/messages`, { headers });
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
    if (!content) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      showSnackbar("Connecting to chat server, please wait a moment...", "info");
      return;
    }

    if (activeTab.type === "room") {
      wsRef.current.send(JSON.stringify({ action: "send_room_message", room_slug: activeTab.id, content }));
      const nowIso = new Date().toISOString();
      setRooms(prev => {
        const roomSlug = activeTab.id?.toLowerCase();
        const idx = prev.findIndex(r => r.slug.toLowerCase() === roomSlug);
        if (idx < 0) return prev;
        const target = {
          ...prev[idx],
          last_message: content,
          last_message_at: nowIso,
          last_message_sender_name: currentUser?.name,
          last_message_sender_id: currentUser?.id
        };
        return [target, ...prev.filter((_, i) => i !== idx)];
      });
    } else {
      wsRef.current.send(JSON.stringify({ action: "send_direct_message", recipient_id: activeTab.id, content }));
      const nowIso = new Date().toISOString();
      setDirectConversations(prev => {
        const partnerId = activeTab.id;
        const idx = prev.findIndex(u => u.id === partnerId);
        if (idx < 0) {
          if (activeTab.data && activeTab.data.id === partnerId) {
            return [{
              ...activeTab.data,
              last_message: content,
              last_message_at: nowIso,
              last_message_sender_id: currentUser?.id
            }, ...prev];
          }
          return prev;
        }
        const target = {
          ...prev[idx],
          last_message: content,
          last_message_at: nowIso,
          last_message_sender_id: currentUser?.id
        };
        return [target, ...prev.filter((_, i) => i !== idx)];
      });
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
    pushNavState("profile");
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
  const fetchMateTrends = useCallback(async () => {
    setIsLoadingTrends(true);
    try {
      const res = await fetch(`${API_BASE}/api/mate/trends?order=asc`);
      if (res.ok) {
        const data = await res.json();
        setMateTrends(data);
      }
    } catch (e) {
      console.error("Failed to load mate trends:", e);
    } finally {
      setIsLoadingTrends(false);
    }
  }, []);

  const toggleTrendInterest = (topic) => {
    const cleanTopic = topic.trim().toLowerCase();
    const current = mateInterestsInput
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    let updated;
    if (current.includes(cleanTopic)) {
      updated = current.filter(t => t !== cleanTopic);
    } else {
      updated = [...current, cleanTopic];
    }
    setMateInterestsInput(updated.join(", "));
  };

  useEffect(() => {
    if (viewMode === "mate") {
      fetchMateTrends();
    }
  }, [viewMode, fetchMateTrends]);

  const handleNavigateMate = () => {
    if (currentUser?.provider === "demo") {
      handleInstantPassRedirect("mate");
      return;
    }
    fetchMateTrends();
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
        body: JSON.stringify({
          slug: newRoomSlug.trim().toLowerCase(),
          title: newRoomTitle.trim(),
          description: newRoomDesc.trim() || undefined,
          is_private: newRoomIsPrivate
        })
      });
      if (res.ok) {
        const created = await res.json();
        setRooms(prev => [...prev, created]);
        setIsCreateRoomOpen(false);
        setNewRoomSlug(""); setNewRoomTitle(""); setNewRoomDesc(""); setNewRoomIsPrivate(false);
        selectTab("room", created.slug, created);
        showSnackbar(`Room #${created.slug} launched!`, "success");
      } else {
        const err = await res.json();
        showSnackbar(err.detail || "Could not create room", "error");
      }
    } catch (e) { showSnackbar("Network error creating room", "error"); }
  };

  // ──────────────────────────────────────────────────────────────
  // ROOM SETTINGS (Moderator Actions)
  // ──────────────────────────────────────────────────────────────
  const loadRoomAdmissions = async (slug) => {
    if (!slug || !token) return;
    setIsLoadingAdmissions(true);
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${slug}/admissions`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRoomAdmissions(data);
      }
    } catch (e) { }
    setIsLoadingAdmissions(false);
  };

  const handleRespondAdmission = async (slug, admissionId, status) => {
    if (!slug || !admissionId) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${slug}/admissions/${admissionId}/respond`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        showSnackbar(`Admission request ${status}!`, "success");
        setRoomAdmissions(prev => prev.filter(a => a.id !== admissionId));
        setNotificationsList(prev => prev.filter(n => n.raw_id !== admissionId));
        loadRooms();
        fetchNotifications();
      } else {
        const err = await res.json();
        showSnackbar(err.detail || "Could not respond to admission", "error");
      }
    } catch (e) {
      showSnackbar("Network error", "error");
    }
  };

  const handleCopyInviteLink = async (room) => {
    let code = room?.invite_code;
    if (!code && room?.slug) {
      try {
        const r = await fetch(`${API_BASE}/api/rooms/${room.slug}/invite`, { headers: authHeaders() });
        if (r.ok) code = (await r.json()).invite_code;
      } catch (e) { }
    }
    if (!code) {
      showSnackbar("Could not generate an invitation link for this room", "error");
      return;
    }
    const url = `${window.location.origin}/?invite=${room.slug}&code=${code}`;
    try { await navigator.clipboard.writeText(url); } catch (e) { window.prompt("Copy invitation link:", url); }
    setHasCopiedInvite(true);
    showSnackbar("Invitation link copied to clipboard!", "success");
    setTimeout(() => setHasCopiedInvite(false), 2500);
  };

  const handleJoinViaInvite = async () => {
    if (!inviteFromUrl) return;
    if (currentUser?.provider === "demo") {
      handleInstantPassRedirect("invite");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${inviteFromUrl.slug}/join`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code: inviteFromUrl.code })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.status === "joined") {
          showSnackbar(data.message || "Joined room!", "success");
          const joinedSlug = inviteFromUrl.slug;
          setInviteFromUrl(null);
          await loadRooms();
          try {
            const rr = await fetch(`${API_BASE}/api/rooms/${joinedSlug}`, { headers: authHeaders() });
            if (rr.ok) {
              const targetRoom = await rr.json();
              setViewMode("chat");
              selectTab("room", targetRoom.slug, targetRoom);
            }
          } catch (e) { }
        } else if (data.status === "pending") {
          showSnackbar(data.message || "Admission requested!", "info");
          setInviteAdmissionStatus("pending");
        }
      } else {
        showSnackbar(data.detail || "Could not join room", "error");
      }
    } catch (e) {
      showSnackbar("Network error joining room", "error");
    }
  };

  const openRoomSettings = async (room) => {
    pushNavState("room_settings");
    setRoomSettingsData(room);
    setEditRoomTitle(room.title);
    setEditRoomDesc(room.description || "");
    setEditRoomIsPrivate(Boolean(room.is_private));
    setRoomSettingsTab("info");
    setAddModUserId("");
    setAddModSearch("");
    setAddModResults([]);
    setIsSearchingMods(false);
    setRoomSettingsOpen(true);
    loadRoomAdmissions(room.slug);
  };

  const handleSaveRoomInfo = async (e) => {
    e.preventDefault();
    if (!roomSettingsData) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${roomSettingsData.slug}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({
          title: editRoomTitle,
          description: editRoomDesc,
          is_private: editRoomIsPrivate
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setRooms(prev => prev.map(r => r.slug === updated.slug ? updated : r));
        setRoomSettingsData(updated);
        setActiveTab(prev => prev.id === updated.slug ? { ...prev, data: updated } : prev);
        showSnackbar("Room settings saved!", "success");
      } else {
        const err = await res.json();
        showSnackbar(err.detail || "Could not update room", "error");
      }
    } catch (e) { showSnackbar("Network error", "error"); }
  };

  const handleDeleteRoom = async (roomObj) => {
    // onClick handlers pass a DOM event; only accept real room objects
    const targetRoom = (roomObj && roomObj.slug) ? roomObj : roomSettingsData;
    if (!targetRoom || !targetRoom.slug) return;
    if (!window.confirm(`Delete room #${targetRoom.slug}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${targetRoom.slug}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        showSnackbar(`Room #${targetRoom.slug} deleted`);
        setRooms(prev => prev.filter(r => r.slug !== targetRoom.slug));
        setRoomSettingsOpen(false);
        setViewingRoomInfo(null);
        setChatMenuOpen(false);
        if (activeTab.type === "room" && activeTab.id === targetRoom.slug) {
          setActiveTab({ type: "room", id: null, data: null });
        }
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

  const loadRoomParticipants = async (slug) => {
    setLoadingRoomInfo(true);
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${slug}/participants`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setRoomParticipants(data);
        return data;
      } else {
        setRoomParticipants([]);
      }
    } catch (e) {
      setRoomParticipants([]);
    } finally {
      setLoadingRoomInfo(false);
    }
    return [];
  };

  const openRoomInfo = async (room) => {
    pushNavState("room_info");
    setViewingRoomInfo(room);
    loadRoomParticipants(room.slug);
  };

  const handleRemoveParticipant = async (slug, userId, userName) => {
    if (!window.confirm(`Are you sure you want to remove ${userName || "this participant"} from the room?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${slug}/members/remove`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ user_id: userId })
      });
      const data = await res.json();
      if (res.ok) {
        showSnackbar(`Removed ${userName || "participant"} from the room`);
        setRoomParticipants(prev => prev.filter(p => p.id !== userId));
      } else {
        alert(data.detail || "Failed to remove participant");
      }
    } catch (e) {
      alert("Network error");
    }
  };

  const handleExitRoom = async (room) => {
    if (!room) return;
    if (!window.confirm(`Are you sure you want to exit #${room.title}? You will need to rejoin or request admission to participate again.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${room.slug}/exit`, {
        method: "POST",
        headers: authHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        showSnackbar(`You have exited #${room.title}`);
        setViewingRoomInfo(null);
        setRoomSettingsOpen(false);
        setChatMenuOpen(false);
        setRooms(prev => prev.map(r => r.slug === room.slug ? { ...r, is_member: false } : r));
        if (activeTab.type === "room" && (activeTab.data?.slug === room.slug || activeTab.id === room.slug)) {
          setActiveTab({ type: "direct", id: null, data: null });
        }
        loadRooms();
      } else {
        alert(data.detail || "Failed to exit room");
      }
    } catch (e) {
      alert("Network error");
    }
  };

  const handleRemoveFriend = async (friendId, friendName) => {
    if (!window.confirm(`Are you sure you want to remove ${friendName || "this friend"} from your friends?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/friends/${friendId}/remove`, {
        method: "POST",
        headers: authHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        showSnackbar(`Removed ${friendName || "friend"} from friends`);
        setProfileData(prev => {
          if (!prev) return prev;
          const updatedFriends = (prev.friends || []).filter(f => f.id !== friendId);
          return {
            ...prev,
            friends: updatedFriends,
            friends_count: Math.max(0, (prev.friends_count || 1) - 1),
            friendship_status: prev.user?.id === friendId ? "none" : prev.friendship_status
          };
        });
        refreshDirectConversations();
      } else {
        alert(data.detail || "Failed to remove friend");
      }
    } catch (e) {
      alert("Network error");
    }
  };

  const handleClearChat = async () => {
    if (activeTab.type === "direct" && activeDirectUser) {
      if (!window.confirm(`Are you sure you want to clear your chat history with ${activeDirectUser.name}?`)) return;
      try {
        const res = await fetch(`${API_BASE}/api/direct/${activeDirectUser.id}/messages`, {
          method: "DELETE",
          headers: authHeaders()
        });
        if (res.ok) {
          setMessages([]);
          setChatMenuOpen(false);
          setDirectConversations(prev => prev.map(u => u.id === activeDirectUser.id ? {
            ...u,
            last_message: null,
            last_message_at: null,
            last_message_sender_id: null
          } : u));
          refreshDirectConversations();
          showSnackbar("Chat history cleared");
        } else {
          alert("Failed to clear chat");
        }
      } catch (e) {
        alert("Network error");
      }
    } else if (activeTab.type === "room" && activeRoom) {
      if (!isCurrentUserModerator(activeRoom)) {
        alert("Only room moderators can clear the room chat history.");
        return;
      }
      if (!window.confirm(`Are you sure you want to clear all message history in #${activeRoom.title}? This cannot be undone.`)) return;
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${activeRoom.slug}/messages`, {
          method: "DELETE",
          headers: authHeaders()
        });
        if (res.ok) {
          setMessages([]);
          setChatMenuOpen(false);
          setRooms(prev => prev.map(r => r.slug === activeRoom.slug ? {
            ...r,
            last_message: null,
            last_message_at: null,
            last_message_sender_name: null,
            last_message_sender_id: null
          } : r));
          showSnackbar("Room chat history cleared");
        } else {
          alert("Failed to clear room chat");
        }
      } catch (e) {
        alert("Network error");
      }
    }
  };

  const handleDeleteDirectChat = async () => {
    if (activeTab.type !== "direct" || !activeDirectUser) return;
    if (!window.confirm(`Are you sure you want to delete this chat with ${activeDirectUser.name}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/direct/${activeDirectUser.id}/messages`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (res.ok) {
        setMessages([]);
        setChatMenuOpen(false);
        setActiveTab({ type: "direct", id: null, data: null });
        refreshDirectConversations();
        showSnackbar("Chat deleted");
      } else {
        alert("Failed to delete chat");
      }
    } catch (e) {
      alert("Network error");
    }
  };

  useEffect(() => {
    if (viewMode === "mate" && token) {
      fetchMateTrends();
    }
  }, [viewMode, token, fetchMateTrends]);

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

  const avatarSrc = (user) => {
    const raw = (user?.avatar || "").trim();
    if (raw) {
      if (raw.startsWith("/api/uploads/")) return `${API_BASE}${raw}`;
      if (raw.startsWith("https://") || raw.startsWith("http://")) return raw;
    }
    return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(user?.username || "user")}`;
  };

  const activeRoom = rooms.find(r => r.slug === activeTab.id) || activeTab.data;
  const activeDirectUser = directConversations.find(u => u.id === activeTab.id) || activeTab.data;

  const openNewChatModal = async () => {
    pushNavState("new_chat_modal");
    setNewChatSearch("");
    setIsNewChatModalOpen(true);
    setIsLoadingFriendsForChat(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/${currentUser.id}/profile`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setFriendsForNewChat(data.friends || []);
      }
    } catch (e) { }
    finally {
      setIsLoadingFriendsForChat(false);
    }
  };

  const handleSubmitFeedback = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!feedbackRating || feedbackRating < 1 || feedbackRating > 5) {
      showSnackbar("Please select a star rating (1 to 5).", "error");
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          rating: feedbackRating,
          comment: feedbackComment.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit feedback");
      showSnackbar("Thank you for your feedback! ✨", "success");
      setIsFeedbackModalOpen(false);
      setFeedbackComment("");
      setFeedbackRating(5);
      setFeedbackHoverRating(0);
    } catch (err) {
      showSnackbar(err.message || "Error submitting feedback", "error");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // MAINTENANCE OVERLAY
  // ══════════════════════════════════════════════════════════════
  if (maintenanceState.active) {
    return (
      <div className="maintenance-screen">
        <div className="maintenance-card">
          <div className="maintenance-icon-ring">
            <Construction size={38} />
          </div>
          <h1 className="maintenance-title">Scheduled Maintenance</h1>
          <p className="maintenance-desc">
            {maintenanceState.message || "PairUP is currently undergoing scheduled maintenance. Please check back shortly!"}
          </p>
          <div className="maintenance-status-pill">
            <span className="maintenance-pulse-dot" />
            <span>Upgrading systems — back online soon</span>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // LANDING PAGE & AUTHENTICATION
  // ══════════════════════════════════════════════════════════════
  if (!token || !currentUser || showLandingPage) {
    return (
      <>
        <LandingPage
          onOpenAuth={() => setShowAuthModal(true)}
          demoUsername={demoUsername}
          setDemoUsername={setDemoUsername}
          demoName={demoName}
          setDemoName={setDemoName}
          demoGender={demoGender}
          setDemoGender={setDemoGender}
          handleDemoLogin={handleDemoLogin}
          isLoggedIn={Boolean(token && currentUser)}
          onLaunchApp={() => handleSystemOrInAppBack(() => setShowLandingPage(false))}
          authError={authError}
          loginNotice={loginNotice}
          showAuthModal={showAuthModal}
          setShowAuthModal={setShowAuthModal}
          theme={theme}
          toggleTheme={toggleTheme}
        />
        {snackbar && (
          <div className="snackbar-container">
            <div className={`snackbar ${snackbar.type || "info"}`}>
              {snackbar.type === "success" && <CheckCircle2 size={16} />}
              {snackbar.type === "error" && <AlertCircle size={16} />}
              <span>{snackbar.message}</span>
            </div>
          </div>
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════════
  const isPageActive = Boolean(
    viewingProfileId ||
    roomSettingsOpen ||
    viewingRoomInfo ||
    viewMode === "mate" ||
    viewMode === "mate_chat" ||
    viewMode === "explore" ||
    viewMode === "announcements" ||
    activeTab.id
  );

  // Unread badge counters for mobile bottom navigation
  const totalDirectUnreadCount = Object.entries(unreadCounts)
    .filter(([k]) => k.startsWith("direct_"))
    .reduce((sum, [, count]) => sum + (count || 0), 0);

  const totalRoomUnreadCount = Object.entries(unreadCounts)
    .filter(([k]) => k.startsWith("room_"))
    .reduce((sum, [, count]) => sum + (count || 0), 0);

  // Notification Bell & Dropdown Box
  const renderNotificationBell = (mode = "topright") => {
    const isOpen = notificationsOpenMode === mode;
    const isSidebar = mode === "sidebar";
    const wrapperClass = isSidebar
      ? "notification-btn-wrapper notification-side-panel"
      : "notification-btn-wrapper notification-desktop-mode";

    return (
      <div className={wrapperClass} ref={isSidebar ? notificationsSidebarRef : notificationsTopRightRef}>
        <button
          type="button"
          className={`btn-icon-sm notification-trigger-btn ${isOpen ? "active" : ""}`}
          title="Notifications"
          onClick={() => toggleNotifications(mode)}
          aria-label="Notifications"
        >
          <Bell size={16} />
          {unreadNotificationsCount > 0 && (
            <span className="notification-badge" title={`${unreadNotificationsCount} notifications`}>
              {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="notification-dropdown">
            <div className="notification-dropdown-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Bell size={15} />
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Notifications</span>
              </div>
              <button
                type="button"
                className="btn-icon-xs"
                onClick={() => setNotificationsOpenMode(null)}
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="notification-dropdown-list">
              {notificationsList.length === 0 ? (
                <div className="notification-empty">
                  <Bell size={26} style={{ opacity: 0.25, marginBottom: "8px" }} />
                  <p style={{ margin: 0, fontWeight: 600, fontSize: "0.86rem" }}>No notifications</p>
                  <span style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "2px" }}>You are all caught up!</span>
                </div>
              ) : (
                notificationsList.map(item => (
                  <div key={item.id} className="notification-item">
                    <img
                      src={avatarSrc({ avatar: item.avatar, username: item.user_username, name: item.user_name })}
                      alt={item.user_name || "User"}
                      className="notification-item-avatar"
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>{item.title}</span>
                        <span style={{ fontSize: "0.68rem", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                          {formatMessageTimestamp(item.created_at)}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "2px 0 6px", lineHeight: "1.3" }}>
                        {item.description}
                      </p>
                      {item.type === "friend_request" && (
                        <div className="notification-item-actions">
                          <button
                            type="button"
                            className="btn-primary-xs"
                            onClick={() => handleRespondFriendRequest(item.raw_id, "accepted")}
                          >
                            <Check size={12} /> Accept
                          </button>
                          <button
                            type="button"
                            className="btn-secondary-xs"
                            onClick={() => handleRespondFriendRequest(item.raw_id, "ignored")}
                          >
                            <X size={12} /> Ignore
                          </button>
                        </div>
                      )}
                      {item.type === "room_admission" && (
                        <div className="notification-item-actions">
                          <button
                            type="button"
                            className="btn-primary-xs"
                            onClick={() => handleRespondAdmission(item.room_slug, item.raw_id, "accepted")}
                          >
                            <Check size={12} /> Accept
                          </button>
                          <button
                            type="button"
                            className="btn-secondary-xs"
                            onClick={() => handleRespondAdmission(item.room_slug, item.raw_id, "rejected")}
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Mobile Bottom Navigation Bar Component
  const renderMobileBottomNav = () => (
    <nav className="mobile-bottom-nav mobile-only" aria-label="Mobile Navigation">
      <button
        type="button"
        className={`mobile-nav-btn ${viewMode === "chat" && mobileTab === "chat" && !viewingProfileId && !roomSettingsOpen && !viewingRoomInfo ? "active" : ""}`}
        onClick={() => {
          setViewingProfileId(null);
          setRoomSettingsOpen(false);
          setViewingRoomInfo(null);
          setViewMode("chat");
          setMobileTab("chat");
          setActiveTab({ type: "direct", id: null, data: null });
        }}
        title="Chats"
        aria-label="Chats"
      >
        <div className="mobile-nav-icon-wrap">
          <MessageSquare size={21} />
          {totalDirectUnreadCount > 0 && (
            <span className="mobile-nav-badge">
              {totalDirectUnreadCount > 99 ? "99+" : totalDirectUnreadCount}
            </span>
          )}
        </div>
      </button>

      <button
        type="button"
        className={`mobile-nav-btn ${viewMode === "announcements" && !viewingProfileId && !roomSettingsOpen && !viewingRoomInfo ? "active" : ""}`}
        onClick={() => {
          setViewingProfileId(null);
          setRoomSettingsOpen(false);
          setViewingRoomInfo(null);
          pushNavState("announcements");
          setViewMode("announcements");
          setActiveTab({ type: "room", id: null, data: null });
        }}
        title="Announcements"
        aria-label="Announcements"
      >
        <div className="mobile-nav-icon-wrap">
          <Megaphone size={21} />
        </div>
      </button>

      <button
        type="button"
        className={`mobile-nav-btn ${viewMode === "explore" && !viewingProfileId ? "active" : ""}`}
        onClick={() => {
          setViewingProfileId(null);
          setRoomSettingsOpen(false);
          setViewingRoomInfo(null);
          pushNavState("explore");
          setViewMode("explore");
          loadExploreUsers(searchQuery);
        }}
        title="Explore"
        aria-label="Explore"
      >
        <div className="mobile-nav-icon-wrap">
          <Search size={21} />
        </div>
      </button>

      <button
        type="button"
        className={`mobile-nav-btn ${(viewMode === "mate" || viewMode === "mate_chat") && !viewingProfileId ? "active" : ""}`}
        onClick={() => {
          setViewingProfileId(null);
          setRoomSettingsOpen(false);
          setViewingRoomInfo(null);
          pushNavState("mate");
          handleNavigateMate();
        }}
        title="Mate"
        aria-label="Mate"
      >
        <div className="mobile-nav-icon-wrap">
          <Sparkles size={21} />
        </div>
      </button>

      <button
        type="button"
        className={`mobile-nav-btn ${viewingProfileId === currentUser?.id ? "active" : ""}`}
        onClick={() => {
          setRoomSettingsOpen(false);
          setViewingRoomInfo(null);
          openUserProfile(currentUser.id, pendingRequestsCount > 0 ? "requests" : "profile");
        }}
        title="Profile"
        aria-label="Profile"
      >
        <div className="mobile-nav-icon-wrap" style={{ position: "relative" }}>
          <div className="mobile-nav-avatar">
            <img src={avatarSrc(currentUser)} alt={currentUser?.name || "Profile"} />
          </div>
          {pendingRequestsCount > 0 && (
            <span className="attention-blue-dot mobile-profile-dot" title="Attention required in profile" />
          )}
        </div>
      </button>
    </nav>
  );

  return (
    <div className={`app-container ${isPageActive ? "has-active-page" : "no-active-page"}`}>
      {/* ── SIDEBAR ── */}
      <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="brand-header">
          {!isSidebarCollapsed ? (
            <>
              <div className="brand-logo" onClick={() => { setViewMode("chat"); setMobileTab("chat"); setActiveTab({ type: "direct", id: null, data: null }); setViewingProfileId(null); }}>
                <h1 className="brand-gradient">PairUP</h1>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {renderNotificationBell("sidebar")}
                <button
                  type="button"
                  className="sidebar-theme-toggle"
                  title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button className="btn-section-action" title="About PairUP & Features" onClick={() => { pushNavState("landing_page"); setShowLandingPage(true); }}>
                  <Info size={17} />
                </button>
                <button className="btn-section-action sidebar-collapse-btn" title="Collapse sidebar" onClick={toggleSidebar}>
                  <PanelLeftClose size={17} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: "8px" }}>
              <button className="btn-section-action sidebar-collapse-btn" title="Expand sidebar" onClick={toggleSidebar}>
                <PanelLeftOpen size={19} />
              </button>
              {renderNotificationBell("sidebar")}
              <button
                type="button"
                className="sidebar-theme-toggle"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                onClick={toggleTheme}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="btn-section-action" title="About PairUP" onClick={() => { pushNavState("landing_page"); setShowLandingPage(true); }}>
                <Info size={17} />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs (Desktop only) */}
        <div className="nav-tab-group desktop-only">
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
            className={`nav-tab-btn ${viewMode === "announcements" ? "active" : ""}`}
            onClick={() => { pushNavState("announcements"); setViewMode("announcements"); }}
            title="Announcements & Rooms"
          >
            <Megaphone size={16} />
            {!isSidebarCollapsed && <span>Announcements</span>}
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${viewMode === "explore" ? "active" : ""}`}
            onClick={() => { pushNavState("explore"); setViewMode("explore"); loadExploreUsers(searchQuery); }}
            title="Explore Friends"
          >
            <Users size={16} />
            {!isSidebarCollapsed && <span>Explore</span>}
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${viewMode === "mate" || viewMode === "mate_chat" ? "active" : ""}`}
            onClick={() => { pushNavState("mate"); handleNavigateMate(); }}
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
          {/* Direct Messages */}
          <div className="sidebar-dms-section">
            {!isSidebarCollapsed ? (
              <div className="section-label">
                <span>Direct Messages</span>
                <button
                  type="button"
                  className="btn-section-action"
                  title="New Chat with Friend"
                  onClick={openNewChatModal}
                >
                  <Plus size={15} />
                </button>
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
                  const directUnread = unreadCounts[`direct_${u.id}`] || 0;
                  const lastMsgTime = formatTileTimestamp(u.last_message_at);
                  const lastMsgPreview = u.last_message
                    ? (u.last_message_sender_id === currentUser?.id ? `You: ${u.last_message}` : u.last_message)
                    : `@${u.username}`;
                  return !isSidebarCollapsed ? (
                    <div
                      key={u.id}
                      className={`nav-item nav-item-with-preview ${isActive ? "active" : ""}`}
                      onClick={() => selectTab("direct", u.id, u)}
                      title={`${u.name} (@${u.username})`}
                    >
                      <div className="user-avatar">
                        <img src={avatarSrc(u)} alt={u.name} />
                        <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                      </div>
                      <div className="nav-item-text-col">
                        <div className="nav-item-top-row">
                          <span className="nav-item-name">{u.name}</span>
                          {lastMsgTime && (
                            <span className="nav-item-time">{lastMsgTime}</span>
                          )}
                        </div>
                        <div className="nav-item-bottom-row">
                          <span className={`nav-item-last-msg ${directUnread > 0 ? "unread" : ""}`}>
                            {lastMsgPreview}
                          </span>
                          {directUnread > 0 && (
                            <span className="unread-counter-badge" title={`${directUnread} unread message${directUnread > 1 ? "s" : ""}`}>
                              {directUnread > 99 ? "99+" : directUnread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={u.id}
                      className={`nav-item collapsed-nav-item ${isActive ? "active" : ""}`}
                      onClick={() => selectTab("direct", u.id, u)}
                      title={`${u.name} (@${u.username})${u.gender ? ` • ${u.gender}` : ""}${directUnread > 0 ? ` (${directUnread} new)` : ""}`}
                    >
                      <div className="user-avatar">
                        <img src={avatarSrc(u)} alt={u.name} />
                        <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                      </div>
                      {directUnread > 0 && (
                        <span className="unread-counter-badge collapsed">
                          {directUnread > 99 ? "99+" : directUnread}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chat Rooms */}
          <div className="sidebar-rooms-section">
            {!isSidebarCollapsed ? (
              <div className="section-label">
                <span>Rooms</span>
                <button className="btn-section-action" title="Create Room" onClick={() => { pushNavState("create_room"); setIsCreateRoomOpen(true); }}>
                  <Plus size={15} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "4px" }}>
                <div className="sidebar-collapsed-section-divider" title="Rooms" />
                <button className="sidebar-collapsed-action-btn" title="Create Room" onClick={() => { pushNavState("create_room"); setIsCreateRoomOpen(true); }}>
                  <Plus size={14} />
                </button>
              </div>
            )}

            {(() => {
              const userJoinedRooms = rooms.filter(room => isUserRoomParticipant(room));
              if (userJoinedRooms.length === 0) {
                return !isSidebarCollapsed ? (
                  <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", padding: "10px 8px" }}>
                    No joined rooms yet. Discover rooms in <button type="button" className="btn-link-inline" onClick={() => { pushNavState("announcements"); setViewMode("announcements"); }}>Announcements</button>!
                  </div>
                ) : null;
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: isSidebarCollapsed ? "6px" : "3px" }}>
                  {userJoinedRooms.map(room => {
                    const isActive = viewMode === "chat" && activeTab.type === "room" && activeTab.id === room.slug;
                    const isMod = isCurrentUserModerator(room);
                    const roomUnread = unreadCounts[`room_${room.slug.toLowerCase()}`] || 0;
                    const roomLastTime = formatTileTimestamp(room.last_message_at);
                    const roomSenderPrefix = room.last_message_sender_id === currentUser?.id
                      ? "You"
                      : (room.last_message_sender_name || "");
                    const roomLastPreview = room.last_message
                      ? (roomSenderPrefix ? `${roomSenderPrefix}: ${room.last_message}` : room.last_message)
                      : (room.description || `#${room.slug}`);
                    return !isSidebarCollapsed ? (
                      <div
                        key={room.slug}
                        className={`nav-item nav-item-with-preview ${isActive ? "active" : ""}`}
                        onClick={() => selectTab("room", room.slug, room)}
                        title={`# ${room.title}`}
                      >
                        <div className="nav-item-hash-box">
                          {room.picture ? (
                            <img src={`${API_BASE}${room.picture}`} alt={room.title} className="nav-item-room-pic" />
                          ) : (
                            <Hash size={15} />
                          )}
                        </div>
                        <div className="nav-item-text-col">
                          <div className="nav-item-top-row">
                            <div className="nav-item-title-wrap">
                              <span className="nav-item-title">
                                {room.title}
                              </span>
                              {room.is_private && <Lock size={11} style={{ opacity: 0.55, flexShrink: 0 }} title="Private Room" />}
                              {isMod && <Crown size={11} className="mod-crown-icon" title="Moderator" />}
                            </div>
                            {roomLastTime && (
                              <span className="nav-item-time">{roomLastTime}</span>
                            )}
                          </div>
                          <div className="nav-item-bottom-row">
                            <span className={`nav-item-last-msg ${roomUnread > 0 ? "unread" : ""}`}>
                              {roomLastPreview}
                            </span>
                            <div className="nav-item-right-badges">
                              {roomUnread > 0 && (
                                <span className="unread-counter-badge" title={`${roomUnread} unread message${roomUnread > 1 ? "s" : ""}`}>
                                  {roomUnread > 99 ? "99+" : roomUnread}
                                </span>
                              )}
                              {isMod && (
                                <button
                                  type="button"
                                  className="btn-icon-sm"
                                  style={{ position: "relative" }}
                                  title="Room Settings"
                                  onClick={e => { e.stopPropagation(); openRoomSettings(room); }}
                                >
                                  <Settings size={13} />
                                  {((room.pending_admissions_count > 0) || notificationsList.some(n => n.type === "room_admission" && n.room_slug === room.slug)) && (
                                    <span className="attention-blue-dot" style={{ top: -2, right: -2 }} title="Attention required: pending admissions" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={room.slug}
                        className={`nav-item collapsed-nav-item ${isActive ? "active" : ""}`}
                        onClick={() => selectTab("room", room.slug, room)}
                        title={`# ${room.title}${isMod ? " (Moderator)" : ""}${roomUnread > 0 ? ` (${roomUnread} new)` : ""}`}
                      >
                        {room.picture ? (
                          <img src={`${API_BASE}${room.picture}`} alt={room.title} className="collapsed-room-pic" />
                        ) : (
                          <div className="collapsed-room-hash">
                            <Hash size={17} />
                          </div>
                        )}
                        {roomUnread > 0 && (
                          <span className="unread-counter-badge collapsed">
                            {roomUnread > 99 ? "99+" : roomUnread}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* User Profile Bar (Desktop Only) */}
        <div className="user-profile-bar desktop-only">
          {!isSidebarCollapsed ? (
            <>
              <div className="profile-info" onClick={() => openUserProfile(currentUser.id, pendingRequestsCount > 0 ? "requests" : "profile")}>
                <div className="user-avatar" style={{ position: "relative" }}>
                  <img src={avatarSrc(currentUser)} alt={currentUser.name} />
                  <span className="status-dot online" />
                  {pendingRequestsCount > 0 && (
                    <span className="attention-blue-dot profile-dot" title="Attention required in profile" />
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
                  <span className="attention-blue-dot profile-dot" title="Attention required in profile" />
                )}
              </div>
              <button className="btn-icon" title="Log Out" onClick={handleLogout}>
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Floating Button to Create New Chat with Friend */}
        <button
          type="button"
          className="floating-new-chat-btn mobile-only"
          onClick={openNewChatModal}
          aria-label="New Chat with Friend"
          title="New Chat with Friend"
        >
          <MessageSquarePlus size={20} />
          <span>New Chat</span>
        </button>

        {/* Mobile Bottom Navigation Bar */}
        {renderMobileBottomNav()}
      </aside>

      {/* ── MAIN STAGE / PAGES ── */}
      {viewingProfileId && profileData ? (
        <main className="page-stage profile-page-stage">
          <header className="page-header">
            <button
              type="button"
              className="btn-back"
              onClick={() => handleSystemOrInAppBack(() => { setViewingProfileId(null); setIsEditingProfile(false); })}
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
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {renderNotificationBell()}
              <button
                type="button"
                className="btn-icon"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              {viewingProfileId === currentUser?.id && !isEditingProfile && (
                <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: "0.82rem" }} onClick={() => setIsEditingProfile(true)}>
                  <Edit3 size={14} /> Edit Profile
                </button>
              )}
            </div>
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
                      <h4 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-main)" }}>{profileData.user.name}</h4>
                      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginBottom: "6px" }}>@{profileData.user.username}</div>
                      <span style={{ marginBottom: "6px" }} className={getGenderBadgeClass(profileData.user.gender)}>{profileData.user.gender || "Prefer not to say"}</span>
                      <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginBottom: "6px" }}>Bio: {profileData.user.bio}</p>
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
                        <div
                          className="profile-field-val"
                          style={{
                            color: profileData.user.bio ? "var(--text-main)" : "var(--text-dim)",
                            fontStyle: profileData.user.bio ? "normal" : "italic"
                          }}
                        >
                          {profileData.user.bio || "No bio added yet."}
                        </div>
                      </div>
                      <div className="profile-field-group">
                        <span className="profile-field-label">Interests</span>
                        <div
                          className="profile-field-val"
                          style={{
                            color: profileData.user.interests ? "var(--text-main)" : "var(--text-dim)",
                            fontStyle: profileData.user.interests ? "normal" : "italic"
                          }}
                        >
                          {profileData.user.interests || "No interests specified."}
                        </div>
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
                              <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                                <button className="btn-primary" style={{ flex: 1 }} onClick={() => { setViewingProfileId(null); selectTab("direct", profileData.user.id, profileData.user); }}>
                                  <MessageSquare size={15} /> Chat
                                </button>
                                <button
                                  type="button"
                                  className="btn-danger"
                                  style={{ padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}
                                  onClick={() => handleRemoveFriend(profileData.user.id, profileData.user.name)}
                                  title="Remove Friend"
                                >
                                  <UserMinus size={15} /> Remove
                                </button>
                              </div>
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

                      {/* Theme switcher preference row inside own profile */}
                      {viewingProfileId === currentUser.id && (
                        <div style={{ marginTop: "16px", padding: "12px 14px", background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-main)" }}>Appearance</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                              {theme === "dark" ? "Dark Gray & White Theme" : "Light Gray & White Theme"}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                            onClick={toggleTheme}
                          >
                            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                            <span>{theme === "dark" ? "Switch to Light" : "Switch to Dark"}</span>
                          </button>
                        </div>
                      )}

                      {/* Log out option inside profile */}
                      {viewingProfileId === currentUser.id && (
                        <div style={{ marginTop: "12px", padding: "12px 14px", background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-main)" }}>Account Session</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                              Signed in as @{currentUser.username}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-danger"
                            style={{ padding: "7px 14px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
                            onClick={handleLogout}
                          >
                            <LogOut size={15} />
                            <span>Log Out</span>
                          </button>
                        </div>
                      )}
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
                                {/* {f.gender && (
                                  <span className={getGenderBadgeClass(f.gender)} style={{ fontSize: "0.58rem", padding: "1px 5px" }}>
                                    {f.gender}
                                  </span>
                                )} */}
                              </div>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                  type="button"
                                  className="btn-primary"
                                  style={{ padding: "5px 12px", fontSize: "0.78rem" }}
                                  onClick={() => { setViewingProfileId(null); selectTab("direct", f.id, f); }}
                                >
                                  <MessageSquare size={13} /> Chat
                                </button>
                                {/* {viewingProfileId === currentUser.id && (
                                  <button
                                    type="button"
                                    className="btn-danger"
                                    style={{ padding: "5px 10px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                    onClick={() => handleRemoveFriend(f.id, f.name)}
                                    title="Remove Friend"
                                  >
                                    <UserMinus size={13} /> Remove
                                  </button>
                                )} */}
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
          {renderMobileBottomNav()}
        </main>
      ) : roomSettingsOpen && roomSettingsData ? (
        <main className="page-stage room-settings-page-stage">
          <header className="page-header">
            <button
              type="button"
              className="btn-back"
              onClick={() => handleSystemOrInAppBack(() => setRoomSettingsOpen(false))}
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
                <button
                  type="button"
                  className={`settings-tab ${roomSettingsTab === "info" ? "active" : ""}`}
                  onClick={() => setRoomSettingsTab("info")}
                >
                  Room Info
                </button>
                <button
                  type="button"
                  className={`settings-tab ${roomSettingsTab === "moderators" ? "active" : ""}`}
                  onClick={() => setRoomSettingsTab("moderators")}
                >
                  Moderators
                </button>
                <button
                  type="button"
                  className={`settings-tab ${roomSettingsTab === "admissions" ? "active" : ""}`}
                  onClick={() => {
                    setRoomSettingsTab("admissions");
                    loadRoomAdmissions(roomSettingsData.slug);
                  }}
                  style={{ position: "relative" }}
                >
                  <span>Admissions</span>
                  {roomAdmissions.length > 0 && (
                    <span className="badge-count" style={{ marginLeft: "6px", fontSize: "0.7rem", padding: "1px 6px" }}>
                      {roomAdmissions.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`settings-tab ${roomSettingsTab === "participants" ? "active" : ""}`}
                  onClick={() => {
                    setRoomSettingsTab("participants");
                    loadRoomParticipants(roomSettingsData.slug);
                  }}
                  style={{ position: "relative" }}
                >
                  <span>Participants</span>
                  {roomParticipants.length > 0 && (
                    <span className="badge-count" style={{ marginLeft: "6px", fontSize: "0.7rem", padding: "1px 6px" }}>
                      {roomParticipants.length}
                    </span>
                  )}
                </button>
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

                    <div>
                      <label className="profile-field-label">Room Visibility</label>
                      <div className="room-visibility-selector" style={{ marginTop: "6px" }}>
                        <div
                          className={`visibility-option ${!editRoomIsPrivate ? "active" : ""}`}
                          onClick={() => setEditRoomIsPrivate(false)}
                        >
                          <div className="visibility-icon-wrap">
                            <Globe size={18} />
                          </div>
                          <div className="visibility-info">
                            <span className="visibility-title">Public Room</span>
                            <span className="visibility-desc">Anyone can view, join, and chat directly.</span>
                          </div>
                        </div>
                        <div
                          className={`visibility-option ${editRoomIsPrivate ? "active" : ""}`}
                          onClick={() => setEditRoomIsPrivate(true)}
                        >
                          <div className="visibility-icon-wrap">
                            <Lock size={18} />
                          </div>
                          <div className="visibility-info">
                            <span className="visibility-title">Private Room</span>
                            <span className="visibility-desc">Invitation link required. Moderators approve members.</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {editRoomIsPrivate && (
                      <div className="room-invite-box">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <Share2 size={14} /> Invitation Link
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Shareable link</span>
                        </div>
                        <div className="room-invite-link-row">
                          <input
                            type="text"
                            readOnly
                            className="room-invite-link-input"
                            value={`${window.location.origin}/?invite=${roomSettingsData.slug}&code=${roomSettingsData.invite_code || ""}`}
                          />
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: "8px 14px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0 }}
                            onClick={() => handleCopyInviteLink(roomSettingsData)}
                          >
                            {hasCopiedInvite ? <Check size={14} /> : <Copy size={14} />}
                            <span>{hasCopiedInvite ? "Copied" : "Copy Link"}</span>
                          </button>
                        </div>
                        <p style={{ fontSize: "0.74rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                          Anyone in the room can share this link to invite others. Moderators accept or reject new admissions.
                        </p>
                      </div>
                    )}

                    <button type="submit" className="btn-primary">Save Changes</button>
                  </form>

                  <div style={{ marginTop: "24px", borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "10px" }}>
                      <strong>Danger Zone</strong> — deleting the room is permanent and removes all messages.
                    </p>
                    <button className="btn-danger" onClick={() => handleDeleteRoom(roomSettingsData)}>
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

              {roomSettingsTab === "admissions" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Pending Admissions</h4>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-dim)" }}>
                        People requesting to join this private room
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                      onClick={() => loadRoomAdmissions(roomSettingsData.slug)}
                    >
                      Refresh
                    </button>
                  </div>

                  {isLoadingAdmissions ? (
                    <div style={{ padding: "32px", textAlign: "center", color: "var(--text-dim)" }}>
                      <Loader2 size={22} className="mate-spin-icon" style={{ display: "inline-block" }} />
                      <p style={{ marginTop: "8px", fontSize: "0.82rem" }}>Loading admissions...</p>
                    </div>
                  ) : roomAdmissions.length === 0 ? (
                    <div style={{ padding: "36px 16px", textAlign: "center", color: "var(--text-dim)", background: "var(--bg-input)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-subtle)" }}>
                      <Shield size={26} style={{ opacity: 0.35, marginBottom: "8px" }} />
                      <p style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", color: "var(--text-main)" }}>No pending admissions</p>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-dim)" }}>New requests will appear here when people click the invitation link.</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {roomAdmissions.map(adm => (
                        <div
                          key={adm.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            padding: "12px 14px",
                            background: "var(--bg-input)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-subtle)"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                            <img
                              src={avatarSrc({ avatar: adm.avatar || adm.user_avatar, username: adm.username || adm.user_username, name: adm.name || adm.user_name })}
                              alt={adm.name || adm.user_name || "Applicant"}
                              style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-subtle)" }}
                            />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {adm.name || adm.user_name || "Applicant"}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "6px" }}>
                                <span>@{adm.username || adm.user_username || "user"}</span>
                                {(adm.gender || adm.user_gender) && (
                                  <span style={{ fontSize: "0.68rem", opacity: 0.8, background: "var(--bg-hover)", padding: "1px 6px", borderRadius: "4px" }}>
                                    {adm.gender || adm.user_gender}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ padding: "6px 12px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              onClick={() => handleRespondAdmission(roomSettingsData.slug, adm.id, "accepted")}
                            >
                              <Check size={13} /> Accept
                            </button>
                            <button
                              type="button"
                              className="btn-danger"
                              style={{ padding: "6px 12px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              onClick={() => handleRespondAdmission(roomSettingsData.slug, adm.id, "rejected")}
                            >
                              <X size={13} /> Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {roomSettingsTab === "participants" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Room Participants</h4>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-dim)" }}>
                        Active members and participants of #{roomSettingsData.slug}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                      onClick={() => loadRoomParticipants(roomSettingsData.slug)}
                    >
                      Refresh
                    </button>
                  </div>

                  {loadingRoomInfo ? (
                    <div style={{ padding: "32px", textAlign: "center", color: "var(--text-dim)" }}>
                      <Loader2 size={22} className="mate-spin-icon" style={{ display: "inline-block" }} />
                      <p style={{ marginTop: "8px", fontSize: "0.82rem" }}>Loading participants...</p>
                    </div>
                  ) : roomParticipants.length === 0 ? (
                    <div style={{ padding: "36px 16px", textAlign: "center", color: "var(--text-dim)", background: "var(--bg-input)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-subtle)" }}>
                      <Users size={26} style={{ opacity: 0.35, marginBottom: "8px" }} />
                      <p style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", color: "var(--text-main)" }}>No participants found</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {roomParticipants.map(participant => {
                        const isCreator = participant.id === roomSettingsData.creator_id;
                        const isMod = roomSettingsData.moderators?.some(m => m.user_id === participant.id);
                        const isPrime = roomSettingsData.moderators?.some(m => m.user_id === participant.id && m.is_prime);
                        const isSelf = participant.id === currentUser?.id;
                        const canRemove = !isCreator && !isPrime && !isSelf;

                        return (
                          <div
                            key={participant.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "10px",
                              padding: "10px 12px",
                              background: "var(--bg-input)",
                              borderRadius: "10px"
                            }}
                          >
                            <div
                              style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1, cursor: "pointer" }}
                              onClick={() => openUserProfile(participant.id)}
                            >
                              <img
                                src={avatarSrc(participant)}
                                alt={participant.name}
                                style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }}
                              />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {participant.name} {isSelf && <span style={{ opacity: 0.6, fontSize: "0.75rem" }}>(You)</span>}
                                </div>
                                <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                                  @{participant.username}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                              {isCreator ? (
                                <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.72rem", color: "var(--accent-gold)", fontWeight: 700 }}>
                                  <Crown size={12} /> Creator
                                </span>
                              ) : isMod ? (
                                <span style={{ fontSize: "0.72rem", color: "var(--accent-primary)", fontWeight: 600 }}>
                                  Moderator
                                </span>
                              ) : (
                                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontWeight: 500 }}>
                                  Member
                                </span>
                              )}

                              {canRemove && (
                                <button
                                  type="button"
                                  className="btn-danger"
                                  style={{ padding: "5px 10px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                  onClick={() => handleRemoveParticipant(roomSettingsData.slug, participant.id, participant.name)}
                                  title="Remove participant from room"
                                >
                                  <UserMinus size={13} /> Remove
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* End of Settings */}
            </div>
          </div>
        </main>
      ) : viewingRoomInfo ? (
        <main className="page-stage room-info-page-stage">
          <header className="page-header">
            <button
              type="button"
              className="btn-back"
              onClick={() => handleSystemOrInAppBack(() => setViewingRoomInfo(null))}
              title="Back to Room"
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <Info size={18} /> Room Info
              </h2>
              <div className="header-topic">#{viewingRoomInfo.slug} · {viewingRoomInfo.title}</div>
            </div>
          </header>

          <div className="page-content-scroll">
            <div className="page-card">
              {/* Room Header Info Card */}
              <div className="room-info-hero">
                <div className="room-info-avatar-box">
                  {viewingRoomInfo.picture ? (
                    <img src={`${API_BASE}${viewingRoomInfo.picture}`} alt={viewingRoomInfo.title} className="room-info-avatar-img" />
                  ) : (
                    <div className="room-info-avatar-fallback">
                      <Hash size={32} />
                    </div>
                  )}
                </div>
                <div className="room-info-details">
                  <h3 className="room-info-title">{viewingRoomInfo.title}</h3>
                  <div className="room-info-slug">#{viewingRoomInfo.slug}</div>
                  {viewingRoomInfo.description ? (
                    <p className="room-info-desc">{viewingRoomInfo.description}</p>
                  ) : (
                    <p className="room-info-desc" style={{ fontStyle: "italic", opacity: 0.6 }}>No room description provided.</p>
                  )}
                </div>
              </div>

              {/* Shareable Invite Link (Private Room) */}
              {viewingRoomInfo.is_private && viewingRoomInfo.invite_code && (
                <div className="room-invite-box" style={{ marginBottom: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Share2 size={14} /> Invite Friends to Room
                    </span>
                    <span className="room-private-badge">
                      <Lock size={11} /> Private Room
                    </span>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "4px 0 8px" }}>
                    Anyone in this room can share this invite link. Room moderators will review requests before admission.
                  </p>
                  <div className="room-invite-link-row">
                    <input
                      type="text"
                      readOnly
                      className="room-invite-link-input"
                      value={`${window.location.origin}/?invite=${viewingRoomInfo.slug}&code=${viewingRoomInfo.invite_code}`}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: "8px 14px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0 }}
                      onClick={() => handleCopyInviteLink(viewingRoomInfo)}
                    >
                      {hasCopiedInvite ? <Check size={14} /> : <Copy size={14} />}
                      <span>{hasCopiedInvite ? "Copied" : "Copy Link"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Section 1: Moderators List */}
              <div className="room-info-section">
                <div className="room-info-section-header">
                  <h4>
                    <Shield size={16} /> Moderators ({viewingRoomInfo.moderators?.length || 0})
                  </h4>
                </div>
                <div className="room-info-user-list">
                  {(!viewingRoomInfo.moderators || viewingRoomInfo.moderators.length === 0) ? (
                    <p className="room-info-empty-text">No moderators assigned.</p>
                  ) : (
                    viewingRoomInfo.moderators.map(mod => (
                      <div
                        key={mod.user_id}
                        className="room-info-user-row"
                        onClick={() => openUserProfile(mod.user_id)}
                      >
                        <div className="user-avatar" style={{ width: 36, height: 36 }}>
                          <img src={avatarSrc(mod)} alt={mod.name} />
                        </div>
                        <div className="room-info-user-meta">
                          <div className="room-info-user-name">
                            {mod.name}
                            {mod.gender && (
                              <span className={getGenderBadgeClass(mod.gender)} style={{ fontSize: "0.6rem", padding: "1px 5px", marginLeft: "6px" }}>
                                {mod.gender}
                              </span>
                            )}
                          </div>
                          <div className="room-info-user-handle">@{mod.username}</div>
                        </div>
                        {mod.is_prime ? (
                          <span className="mod-prime-badge">
                            <Crown size={12} /> Prime
                          </span>
                        ) : (
                          <span className="mod-regular-badge">
                            Moderator
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Section 2: Room Participants List */}
              <div className="room-info-section">
                <div className="room-info-section-header">
                  <h4>
                    <Users size={16} /> Room Participants ({roomParticipants.length})
                  </h4>
                </div>
                {loadingRoomInfo ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
                    <Loader2 size={24} className="mate-spin-icon" style={{ color: "var(--accent-primary)" }} />
                  </div>
                ) : (
                  <div className="room-info-user-list">
                    {roomParticipants.length === 0 ? (
                      <p className="room-info-empty-text">No participants yet. Send a message to appear here!</p>
                    ) : (
                      roomParticipants.map(user => (
                        <div
                          key={user.id}
                          className="room-info-user-row"
                          onClick={() => openUserProfile(user.id)}
                        >
                          <div className="user-avatar" style={{ width: 36, height: 36 }}>
                            <img src={avatarSrc(user)} alt={user.name} />
                          </div>
                          <div className="room-info-user-meta">
                            <div className="room-info-user-name">
                              {user.name}
                              {user.gender && (
                                <span className={getGenderBadgeClass(user.gender)} style={{ fontSize: "0.6rem", padding: "1px 5px", marginLeft: "6px" }}>
                                  {user.gender}
                                </span>
                              )}
                            </div>
                            <div className="room-info-user-handle">@{user.username}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {isCurrentUserModerator(viewingRoomInfo) && user.id !== viewingRoomInfo.creator_id && !viewingRoomInfo.moderators?.some(m => m.user_id === user.id && m.is_prime) && user.id !== currentUser?.id && (
                              <button
                                type="button"
                                className="btn-danger"
                                style={{ padding: "4px 8px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "3px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveParticipant(viewingRoomInfo.slug, user.id, user.name);
                                }}
                                title="Remove participant from room"
                              >
                                <UserMinus size={12} /> Remove
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openUserProfile(user.id);
                              }}
                            >
                              Profile
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {currentUser?.id !== viewingRoomInfo.creator_id && (
                <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-subtle)" }}>
                  {isUserRoomParticipant(viewingRoomInfo) ? (
                    <button
                      type="button"
                      className="btn-exit-room"
                      onClick={() => handleExitRoom(viewingRoomInfo)}
                    >
                      <LogOut size={16} /> Exit Room
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}
                      onClick={() => {
                        if (viewingRoomInfo.is_private) {
                          setInviteFromUrl(viewingRoomInfo.slug);
                        } else {
                          setRoomJoinPrompt(viewingRoomInfo);
                        }
                      }}
                    >
                      <LogIn size={16} /> Join Room
                    </button>
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
              onClick={() => handleSystemOrInAppBack(() => setViewMode("chat"))}
              title="Back to chats"
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>Mate Matchmaking</h2>
              <div className="header-topic">1-on-1 Anonymous matching</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {renderNotificationBell()}
              <button
                type="button"
                className="btn-icon"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
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

              {/* #hot trends suggestions */}
              <div className="mate-trends-container">
                <div className="mate-trends-header">
                  <div className="mate-trends-title-wrap">
                    <Flame size={15} color="#f97316" />
                    <span className="mate-trends-title">#hot trends</span>
                    <span className="mate-trends-badge">Popular</span>
                  </div>
                  <span className="mate-trends-hint">Tap to add or remove</span>
                </div>
                {isLoadingTrends ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-dim)", padding: "8px 0" }}>
                    <Loader2 size={14} className="mate-spin-icon" /> Loading trends...
                  </div>
                ) : (
                  <div className="mate-trends-chips-wrap">
                    {mateTrends.map(trend => {
                      const currentSelected = mateInterestsInput
                        .split(",")
                        .map(s => s.trim().toLowerCase())
                        .includes(trend.topic.toLowerCase());
                      return (
                        <div
                          key={trend.topic}
                          className={`mate-trend-chip ${currentSelected ? "selected" : ""}`}
                          onClick={() => toggleTrendInterest(trend.topic)}
                          title={`#${trend.topic} (${trend.count} matches) - click to toggle`}
                        >
                          <span>#{trend.topic}</span>
                          <span className="trend-count">{trend.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          {renderMobileBottomNav()}
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
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)"
                }}
              >
                {ANIMAL_EMOJIS[mateConversationData?.partner_nickname] || "🐾"}
              </div>
              <div>
                <h2>
                  {mateConversationData?.partner_nickname || "Anonymous Mate"}
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
                  title="View Profile"
                >
                  <UserCheck size={14} /> <span className="header-btn-text">View Profile</span>
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
                <span className="header-btn-text">
                  {mateConversationData?.mutual_interest
                    ? "Friends! 🎉"
                    : mateConversationData?.my_interest
                      ? "Interested ✓"
                      : "Interested"}
                </span>
              </button>

              <button
                type="button"
                className="btn-icon-sm"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              <button
                type="button"
                className="btn-exit"
                onClick={handleExitMateConversation}
                title="Exit anonymous conversation"
              >
                <LogOut size={14} />
                <span className="header-btn-text">Exit</span>
              </button>
            </div>
          </header>

          {/* Mutual Interest Banner */}
          {mateConversationData?.mutual_interest && (
            <div className="mate-banner-mutual">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Heart size={20} color="#18181b" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-main)" }}>
                    Mutual Interest Confirmed! 🎉
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
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
                  {ANIMAL_EMOJIS[mateConversationData?.partner_nickname] || "🐾"}
                </span>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
                  You're paired with {mateConversationData?.partner_nickname}!
                </p>
                <p style={{ fontSize: "0.88rem" }}>
                  Say hello, share thoughts, or discuss your shared interests.
                </p>
              </div>
            ) : (
              mateMessages.map(msg => {
                const isOutgoing = msg.sender_nickname === mateConversationData?.my_nickname;
                const time = formatMessageTimestamp(msg.created_at);
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
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-subtle)"
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
              onClick={() => handleSystemOrInAppBack(() => setViewMode("chat"))}
              title="Back to chats"
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>Explore Friends</h2>
              <div className="header-topic">Discover people and connect with friends</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {renderNotificationBell()}
              <button
                type="button"
                className="btn-icon"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            </div>
          </header>

          <div className="page-content-scroll explore-content-scroll">
            <div className="explore-toolbar">
              <div className="explore-search-bar">
                <Search size={18} color="var(--text-dim)" />
                <input type="text" placeholder="Search by username or display name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="chat-input" />
              </div>

              {/* Explore Categorization Toggle */}
              <div className="explore-filter-toggle">
                <button
                  type="button"
                  className={`toggle-pill-btn ${exploreFilter === "all" ? "active" : ""}`}
                  onClick={() => setExploreFilter("all")}
                >
                  <Users size={14} />
                  <span>All Users</span>
                  <span className="toggle-pill-count">{exploreUsersList.length}</span>
                </button>
                <button
                  type="button"
                  className={`toggle-pill-btn ${exploreFilter === "friends" ? "active" : ""}`}
                  onClick={() => setExploreFilter("friends")}
                >
                  <UserCheck size={14} />
                  <span>My Friends</span>
                  <span className="toggle-pill-count">
                    {exploreUsersList.filter(u => u.friendship_status === "accepted").length}
                  </span>
                </button>
              </div>
            </div>

            {(() => {
              const displayedExploreUsers = exploreFilter === "friends"
                ? exploreUsersList.filter(u => u.friendship_status === "accepted")
                : exploreUsersList;

              return (
                <div className="explore-grid">
                  {displayedExploreUsers.length === 0 ? (
                    <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-dim)", padding: "40px 0" }}>
                      {exploreFilter === "friends"
                        ? "You haven't added any friends yet. Switch to 'All Users' to discover people and send requests!"
                        : searchQuery
                          ? `No users found for "${searchQuery}"`
                          : "Start searching for friends above!"}
                    </div>
                  ) : displayedExploreUsers.map(u => (
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
                        {/* <span className={getGenderBadgeClass(u.gender)}>{u.gender || "Prefer not to say"}</span> */}
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
              );
            })()}
          </div>
          {renderMobileBottomNav()}
        </main>
      ) : viewMode === "announcements" ? (
        <main className="page-stage announcements-stage">
          <header className="page-header">
            <button
              type="button"
              className="btn-back"
              onClick={() => handleSystemOrInAppBack(() => setViewMode("chat"))}
              title="Back to chats"
            >
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>Announcements & Rooms</h2>
              <div className="header-topic">Discover community rooms and view platform announcements</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {renderNotificationBell()}
              <button
                type="button"
                className="btn-icon"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            </div>
          </header>

          <div className="page-content-scroll announcements-content-scroll">
            {/* Category Toggle: Rooms vs Announcements */}
            <div className="category-toggle-container">
              <button
                type="button"
                className={`toggle-pill-btn ${announcementsTab === "rooms" ? "active" : ""}`}
                onClick={() => setAnnouncementsTab("rooms")}
              >
                <Hash size={15} />
                <span>Rooms</span>
                <span className="toggle-pill-count">{rooms.length}</span>
              </button>
              <button
                type="button"
                className={`toggle-pill-btn ${announcementsTab === "announcements" ? "active" : ""}`}
                onClick={() => setAnnouncementsTab("announcements")}
              >
                <Megaphone size={15} />
                <span>Announcements</span>
              </button>
            </div>

            {announcementsTab === "announcements" ? (
              <div className="announcements-under-construction">
                <div className="construction-icon-wrapper">
                  <Construction size={40} className="construction-icon" />
                </div>
                <h3 className="construction-title">Under Construction</h3>
                <p className="construction-text">
                  The announcements broadcast feature is currently under construction. Soon, verified moderators and administrators will publish pinned bulletins, alerts, and live event updates here.
                </p>
                <div className="construction-badge">
                  <Sparkles size={14} /> Coming Soon
                </div>
              </div>
            ) : (
              <div className="rooms-discovery-section">
                <div className="rooms-discovery-toolbar">
                  <div className="rooms-search-box">
                    <Search size={17} color="var(--text-dim)" className="rooms-search-icon" />
                    <input
                      type="text"
                      placeholder="Search rooms..."
                      value={roomsFilterQuery}
                      onChange={e => setRoomsFilterQuery(e.target.value)}
                      className="rooms-search-input"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-create-room"
                    onClick={() => { pushNavState("create_room"); setIsCreateRoomOpen(true); }}
                  >
                    <Plus size={16} />
                    <span>Create Room</span>
                  </button>
                </div>

                {(() => {
                  const filteredRooms = roomsFilterQuery.trim()
                    ? rooms.filter(r =>
                      r.title.toLowerCase().includes(roomsFilterQuery.toLowerCase()) ||
                      r.slug.toLowerCase().includes(roomsFilterQuery.toLowerCase()) ||
                      (r.description && r.description.toLowerCase().includes(roomsFilterQuery.toLowerCase()))
                    )
                    : rooms;

                  return (
                    <div className="rooms-discovery-grid">
                      {filteredRooms.length === 0 ? (
                        <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-dim)", padding: "40px 0" }}>
                          {roomsFilterQuery ? `No rooms found matching "${roomsFilterQuery}"` : "No rooms available right now. Click '+ Create Room' to start one!"}
                        </div>
                      ) : (
                        filteredRooms.map(room => {
                          const isMod = isCurrentUserModerator(room);
                          const isJoined = isUserRoomParticipant(room);
                          return (
                            <div key={room.slug} className="room-discovery-card">
                              <div className="room-card-top">
                                {room.picture ? (
                                  <img src={`${API_BASE}${room.picture}`} alt={room.title} className="room-card-avatar" />
                                ) : (
                                  <div className="room-card-avatar-hash">
                                    <Hash size={22} />
                                  </div>
                                )}
                                <div className="room-card-info">
                                  <div className="room-card-title-row">
                                    <h4 className="room-card-title">{room.title}</h4>
                                    <span className={room.is_private ? "badge-private" : "badge-public"}>
                                      {room.is_private ? <Lock size={11} /> : <Globe size={11} />}
                                      {room.is_private ? "Private" : "Public"}
                                    </span>
                                  </div>
                                  <span className="room-card-slug">#{room.slug}</span>
                                </div>
                              </div>

                              {room.description && (
                                <p className="room-card-desc">{room.description}</p>
                              )}

                              <div className="room-card-meta">
                                <span>
                                  <span className="status-dot online" style={{ display: "inline-block", marginRight: "4px" }} />
                                  {room.online_count || 0} online
                                </span>
                                {isMod && <span className="badge-moderator">Moderator</span>}
                                {!isMod && isJoined && <span className="badge-member">Joined</span>}
                              </div>

                              <div className="room-card-actions">
                                <button
                                  type="button"
                                  className="btn-primary"
                                  style={{ flex: 1, padding: "8px 12px", fontSize: "0.84rem" }}
                                  onClick={() => handleAttemptEnterRoom(room)}
                                >
                                  <MessageSquare size={14} /> Enter Room
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ padding: "8px 12px", fontSize: "0.84rem" }}
                                  onClick={() => openRoomInfo(room)}
                                >
                                  Info
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Floating Feedbacks Button (Bottom-Right Corner) */}
          <button
            type="button"
            className="floating-feedback-btn"
            onClick={() => {
              pushNavState("feedback_modal");
              setIsFeedbackModalOpen(true);
            }}
            title="Share your feedback"
            aria-label="Feedbacks"
          >
            <Star size={17} className="feedback-fab-star" />
            <span>Feedbacks</span>
          </button>

          {renderMobileBottomNav()}
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
                onClick={() => handleSystemOrInAppBack(() => setActiveTab({ type: "room", id: null, data: null }))}
                title="Back to chats"
              >
                <ArrowLeft size={19} />
              </button>
              {activeTab.type === "room" && activeRoom && (
                <div className="room-icon-header" onClick={() => isCurrentUserModerator(activeRoom) ? openRoomSettings(activeRoom) : openRoomInfo(activeRoom)}>
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
                    </h2>
                    <div className="header-topic">
                      {activeTab.type === "room"
                        ? (activeRoom?.description || activeRoom?.slug && `#${activeRoom.slug}`)
                        : `@${activeDirectUser?.username || "user"}`}
                    </div>
                  </>
                ) : (
                  <h2 style={{ color: "var(--text-dim)" }}>Select a room or conversation</h2>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {activeTab.type === "room" && activeRoom && isCurrentUserModerator(activeRoom) && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: "0.82rem", padding: "7px 14px", position: "relative" }}
                  onClick={() => openRoomSettings(activeRoom)}
                  title="Manage Room"
                >
                  <Settings size={14} /> <span className="header-btn-text">Manage Room</span>
                  {((activeRoom.pending_admissions_count > 0) || notificationsList.some(n => n.type === "room_admission" && n.room_slug === activeRoom.slug)) && (
                    <span className="attention-blue-dot manage-room-dot" title="Pending admissions require attention" />
                  )}
                </button>
              )}
              {activeTab.type === "room" && activeRoom && (
                <>
                  {activeRoom.is_private && activeRoom.invite_code && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: "0.82rem", padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      onClick={() => handleCopyInviteLink(activeRoom)}
                      title="Copy Shareable Invite Link"
                    >
                      {hasCopiedInvite ? <Check size={14} /> : <Share2 size={14} />}
                      <span className="header-btn-text">{hasCopiedInvite ? "Copied" : "Invite"}</span>
                    </button>
                  )}
                  {!isCurrentUserModerator(activeRoom) && (
                    <button
                      className="btn-secondary"
                      style={{ fontSize: "0.82rem", padding: "7px 14px" }}
                      onClick={() => openRoomInfo(activeRoom)}
                      title="View Room Info"
                    >
                      <Info size={14} /> <span className="header-btn-text">View Info</span>
                    </button>
                  )}
                </>
              )}
              {activeTab.type === "direct" && activeDirectUser && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: "0.82rem", padding: "7px 14px" }}
                  onClick={() => openUserProfile(activeDirectUser.id)}
                  title="View Profile"
                >
                  <UserIcon size={14} /> <span className="header-btn-text">View Profile</span>
                </button>
              )}
              {activeTab.id && (
                <div className="chat-menu-wrapper" ref={chatMenuRef}>
                  <button
                    type="button"
                    className="btn-icon-sm"
                    title="Chat Options"
                    onClick={() => setChatMenuOpen(prev => !prev)}
                    style={{ position: "relative" }}
                  >
                    <MoreVertical size={16} />
                  </button>

                  {chatMenuOpen && (
                    <div className="chat-menu-dropdown">
                      {activeTab.type === "direct" && (
                        <>
                          <button
                            type="button"
                            className="chat-menu-item"
                            onClick={handleClearChat}
                          >
                            <Eraser size={14} /> Clear Chat
                          </button>
                          <button
                            type="button"
                            className="chat-menu-item text-danger"
                            onClick={handleDeleteDirectChat}
                          >
                            <Trash2 size={14} /> Delete Chat
                          </button>
                        </>
                      )}

                      {activeTab.type === "room" && activeRoom && (
                        <>
                          {isCurrentUserModerator(activeRoom) && (
                            <button
                              type="button"
                              className="chat-menu-item"
                              onClick={handleClearChat}
                            >
                              <Eraser size={14} /> Clear Room Chat
                            </button>
                          )}
                          {currentUser?.id !== activeRoom.creator_id ? (
                            isUserRoomParticipant(activeRoom) && (
                              <button
                                type="button"
                                className="chat-menu-item text-danger"
                                onClick={() => {
                                  setChatMenuOpen(false);
                                  handleExitRoom(activeRoom);
                                }}
                              >
                                <LogOut size={14} /> Exit Room
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              className="chat-menu-item text-danger"
                              onClick={() => {
                                setChatMenuOpen(false);
                                handleDeleteRoom(activeRoom);
                              }}
                            >
                              <Trash2 size={14} /> Delete Room
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {renderNotificationBell("topright")}
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
            ) : activeTab.type === "room" && activeRoom && !isUserRoomParticipant(activeRoom) ? (
              <div className="room-locked-placeholder">
                <div className="room-locked-icon-wrap">
                  <Lock size={30} />
                </div>
                <h3>Participant Only</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "4px 0 16px" }}>
                  You are not a participant of #{activeRoom.title}. Join this room to view messages and participate in chat.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: "9px 22px", fontSize: "0.9rem" }}
                  onClick={() => setRoomJoinPrompt(activeRoom)}
                >
                  Join #{activeRoom.title}
                </button>
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
              const time = formatMessageTimestamp(msg.created_at);
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
                      {/* {msg.sender_gender && (
                        <span className={getGenderBadgeClass(msg.sender_gender)} style={{ fontSize: "0.6rem", padding: "1px 4px" }}>
                          {msg.sender_gender}
                        </span>
                      )} */}
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
                placeholder={
                  !activeTab.id
                    ? "Select a chat first..."
                    : activeTab.type === "room" && activeRoom && !isUserRoomParticipant(activeRoom)
                      ? `Join #${activeRoom?.title || "room"} to participate...`
                      : activeTab.type === "room"
                        ? `Message ${activeRoom?.title || "room"}...`
                        : `Message ${activeDirectUser?.name || "user"}...`
                }
                value={inputMessage}
                onChange={handleInputChange}
                disabled={!activeTab.id || (activeTab.type === "room" && activeRoom && !isUserRoomParticipant(activeRoom))}
                maxLength={5000}
              />
              <button
                type="submit"
                className="btn-send"
                disabled={!inputMessage.trim() || !activeTab.id || (activeTab.type === "room" && activeRoom && !isUserRoomParticipant(activeRoom))}
                title="Send"
              >
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
        <div className="modal-overlay" onClick={() => handleSystemOrInAppBack(() => setIsCreateRoomOpen(false))}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Chat Room</h3>
              <button className="btn-icon" onClick={() => handleSystemOrInAppBack(() => setIsCreateRoomOpen(false))}><X size={18} /></button>
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

              <div>
                <label className="profile-field-label">Room Visibility</label>
                <div className="room-visibility-selector" style={{ marginTop: "6px" }}>
                  <div
                    className={`visibility-option ${!newRoomIsPrivate ? "active" : ""}`}
                    onClick={() => setNewRoomIsPrivate(false)}
                  >
                    <div className="visibility-icon-wrap">
                      <Globe size={18} />
                    </div>
                    <div className="visibility-info">
                      <span className="visibility-title">Public Room</span>
                      <span className="visibility-desc">Anyone can discover, view, and join this room.</span>
                    </div>
                  </div>
                  <div
                    className={`visibility-option ${newRoomIsPrivate ? "active" : ""}`}
                    onClick={() => setNewRoomIsPrivate(true)}
                  >
                    <div className="visibility-icon-wrap">
                      <Lock size={18} />
                    </div>
                    <div className="visibility-info">
                      <span className="visibility-title">Private Room</span>
                      <span className="visibility-desc">Join by invitation link only. Moderators approve members.</span>
                    </div>
                  </div>
                </div>
              </div>

              <p style={{ fontSize: "0.76rem", color: "var(--text-dim)" }}>
                You will be set as the prime moderator of this room.
              </p>
              <button type="submit" className="btn-primary" style={{ marginTop: "4px" }}>Launch Room</button>
            </form>
          </div>
        </div>
      )}

      {/* Invite Landing Overlay Modal */}
      {inviteFromUrl && (
        <div className="invite-landing-overlay" onClick={() => setInviteFromUrl(null)}>
          <div className="invite-landing-card" onClick={e => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--bg-input)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Lock size={26} color="var(--accent-primary)" />
            </div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 6px" }}>Room Invitation</h3>
            <p style={{ fontSize: "0.86rem", color: "var(--text-muted)", margin: "0 0 20px" }}>
              You were invited to join <strong>#{inviteFromUrl.slug}</strong>.
            </p>

            {inviteAdmissionStatus === "pending" ? (
              <div style={{ padding: "16px", background: "var(--bg-input)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", marginBottom: "16px" }}>
                <Clock size={20} style={{ color: "#3b82f6", display: "block", margin: "0 auto 8px" }} />
                <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: "4px" }}>Request Pending</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                  Your request to join has been sent to the room moderators. You will be admitted once they approve!
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: "100%", padding: "11px", fontSize: "0.92rem" }}
                  onClick={handleJoinViaInvite}
                >
                  {token ? "Request to Join Room" : "Sign In & Join Room"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "100%", padding: "10px", fontSize: "0.86rem" }}
                  onClick={() => setInviteFromUrl(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Public Room Join Confirmation Modal */}
      {roomJoinPrompt && (
        <div className="modal-overlay" onClick={() => setRoomJoinPrompt(null)}>
          <div className="modal-card room-join-prompt-modal" onClick={e => e.stopPropagation()}>
            <div className="room-join-icon-wrap">
              <Hash size={30} />
            </div>
            <h3 className="room-join-title">Want to join #{roomJoinPrompt.title}?</h3>
            <p className="room-join-desc">
              {roomJoinPrompt.description || "Join this room to participate in conversations, share messages, and keep it in your side panel."}
            </p>
            <div className="room-join-actions">
              <button
                type="button"
                className="btn-primary room-join-btn-confirm"
                onClick={() => handleConfirmJoinPublicRoom(roomJoinPrompt)}
              >
                Yes
              </button>
              <button
                type="button"
                className="btn-secondary room-join-btn-cancel"
                onClick={() => setRoomJoinPrompt(null)}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Chat with Friend Modal */}
      {isNewChatModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewChatModalOpen(false)}>
          <div className="modal-card new-chat-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="new-chat-modal-icon-badge">
                  <MessageSquarePlus size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.06rem", fontWeight: 700 }}>New Chat with Friend</h3>
                  <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                    Select a friend to start a direct conversation
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsNewChatModalOpen(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="new-chat-modal-body">
              <div className="new-chat-search-box">
                <Search size={15} className="new-chat-search-icon" />
                <input
                  type="text"
                  placeholder="Search your friends..."
                  value={newChatSearch}
                  onChange={e => setNewChatSearch(e.target.value)}
                  className="new-chat-search-input"
                />
                {newChatSearch && (
                  <button
                    type="button"
                    className="btn-icon-sm"
                    onClick={() => setNewChatSearch("")}
                    title="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {isLoadingFriendsForChat ? (
                <div className="new-chat-empty-state">
                  <Loader2 size={24} className="mate-spin-icon" style={{ color: "var(--text-dim)" }} />
                  <span>Loading your friends...</span>
                </div>
              ) : (() => {
                const q = newChatSearch.trim().toLowerCase();
                const filteredFriends = friendsForNewChat.filter(f =>
                  !q ||
                  (f.name || "").toLowerCase().includes(q) ||
                  (f.username || "").toLowerCase().includes(q)
                );

                if (friendsForNewChat.length === 0) {
                  return (
                    <div className="new-chat-empty-state">
                      <Users size={28} style={{ color: "var(--text-dim)", opacity: 0.7 }} />
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                        No friends added yet
                      </div>
                      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-dim)", maxWidth: 260 }}>
                        Explore the community and add friends to start private 1-on-1 conversations!
                      </p>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ marginTop: "8px", padding: "9px 16px", fontSize: "0.84rem" }}
                        onClick={() => {
                          setIsNewChatModalOpen(false);
                          pushNavState("explore");
                          setViewMode("explore");
                          loadExploreUsers("");
                        }}
                      >
                        <Search size={14} />
                        <span>Find Friends in Explore</span>
                      </button>
                    </div>
                  );
                }

                if (filteredFriends.length === 0) {
                  return (
                    <div className="new-chat-empty-state">
                      <Search size={24} style={{ color: "var(--text-dim)", opacity: 0.7 }} />
                      <span style={{ fontSize: "0.84rem", color: "var(--text-dim)" }}>
                        No friends matching "{newChatSearch}"
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="new-chat-friends-list">
                    {filteredFriends.map(friend => {
                      const isOnline = onlineUserIds.has(friend.id);
                      return (
                        <div
                          key={friend.id}
                          className="new-chat-friend-item"
                          onClick={() => {
                            setIsNewChatModalOpen(false);
                            setDirectConversations(prev => {
                              if (prev.some(u => u.id === friend.id)) return prev;
                              return [friend, ...prev];
                            });
                            selectTab("direct", friend.id, friend);
                          }}
                        >
                          <div className="user-avatar" style={{ width: 38, height: 38 }}>
                            <img src={avatarSrc(friend)} alt={friend.name} />
                            <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                          </div>
                          <div className="new-chat-friend-info">
                            <div className="new-chat-friend-name">{friend.name}</div>
                            <div className="new-chat-friend-handle">@{friend.username}</div>
                          </div>
                          <button
                            type="button"
                            className="btn-primary new-chat-start-btn"
                            onClick={e => {
                              e.stopPropagation();
                              setIsNewChatModalOpen(false);
                              setDirectConversations(prev => {
                                if (prev.some(u => u.id === friend.id)) return prev;
                                return [friend, ...prev];
                              });
                              selectTab("direct", friend.id, friend);
                            }}
                          >
                            <MessageSquare size={14} />
                            <span>Chat</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {friendsForNewChat.length > 0 && (
              <div className="new-chat-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: "100%", justifyContent: "center", fontSize: "0.82rem", padding: "9px 14px" }}
                  onClick={() => {
                    setIsNewChatModalOpen(false);
                    pushNavState("explore");
                    setViewMode("explore");
                    loadExploreUsers("");
                  }}
                >
                  <UserPlus size={14} />
                  <span>Discover More Friends in Explore</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedbacks Modal (5-Star Rating + Tell us what you think) */}
      {isFeedbackModalOpen && (
        <div className="modal-overlay" onClick={() => setIsFeedbackModalOpen(false)}>
          <div className="modal-card feedback-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="feedback-modal-icon-badge">
                  <Star size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 700 }}>Share Your Feedback</h3>
                  <p style={{ margin: "2px 0 0", fontSize: "0.76rem", color: "var(--text-dim)" }}>
                    Help us make PairUP even better for everyone
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsFeedbackModalOpen(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} className="feedback-modal-form">
              <div className="feedback-stars-section">
                <label className="feedback-field-label">Rate your experience</label>
                <div
                  className="feedback-stars-picker"
                  onMouseLeave={() => setFeedbackHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map(starVal => {
                    const activeRating = feedbackHoverRating || feedbackRating;
                    const isFilled = starVal <= activeRating;
                    return (
                      <button
                        key={starVal}
                        type="button"
                        className={`feedback-star-btn ${isFilled ? "filled" : ""}`}
                        onMouseEnter={() => setFeedbackHoverRating(starVal)}
                        onClick={() => setFeedbackRating(starVal)}
                        aria-label={`Rate ${starVal} out of 5 stars`}
                      >
                        <Star
                          size={30}
                          fill={isFilled ? "#f59e0b" : "transparent"}
                          stroke={isFilled ? "#f59e0b" : "currentColor"}
                        />
                      </button>
                    );
                  })}
                </div>
                <span className="feedback-rating-caption">
                  {(feedbackHoverRating || feedbackRating) === 5 && "Excellent! Love it ⭐"}
                  {(feedbackHoverRating || feedbackRating) === 4 && "Great experience 👍"}
                  {(feedbackHoverRating || feedbackRating) === 3 && "Good, could be better 🙂"}
                  {(feedbackHoverRating || feedbackRating) === 2 && "Needs improvement 🛠️"}
                  {(feedbackHoverRating || feedbackRating) === 1 && "Poor experience 😔"}
                </span>
              </div>

              <div className="feedback-comment-section">
                <label className="feedback-field-label" htmlFor="feedback-comment-input">
                  Tell us what you think
                </label>
                <textarea
                  id="feedback-comment-input"
                  rows={4}
                  placeholder="Tell us what you think about PairUP, features you'd love to see, or any issues you noticed..."
                  value={feedbackComment}
                  onChange={e => setFeedbackComment(e.target.value)}
                  className="chat-input feedback-textarea"
                  maxLength={2000}
                  required
                />
              </div>

              <div className="feedback-modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsFeedbackModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary feedback-submit-btn"
                  disabled={isSubmittingFeedback}
                >
                  {isSubmittingFeedback ? (
                    <>
                      <Loader2 size={16} className="mate-spin-icon" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Submit Feedback</span>
                    </>
                  )}
                </button>
              </div>
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

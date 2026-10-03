import { useState, useEffect, useRef, createContext, useContext } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { BiometricAuth, BiometryType } from "@aparajita/capacitor-biometric-auth";
import {
  ChevronDown, ChevronLeft, ChevronUp, Clock, Droplet, ExternalLink, House, IceCreamCone, KeyRound,
  Lock, Map as MapIcon, MapPin, Minus, MountainSnow, Navigation, Phone, Plus, Settings,
  ShoppingCart, Snowflake, ThumbsUp, Wind,
} from "lucide-react";
import { createEphemeralSupabaseClient, supabase } from "./lib/supabaseClient";
import img from './assets/Variety-H2O-+-Ice-Cream-Logo-Final.png';
import bottlesIcon from './assets/bottles.png';

// User Context
export const UserContext = createContext();

const ACTIVE_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

// Structural icons (navigation, actions, status) are Lucide SVGs at these sizes, one stroke
// width. Menu-category and reward-tier emoji are illustrative content and stay as emoji.
const ICON_SIZE = { inline: 14, md: 22, lg: 28 };

// Absolute URL (not a relative route) so it also opens correctly from inside the Capacitor
// native wrapper, where window.location.origin is not varietyh2o.com. Google Play requires the
// policy to be linked both on the store listing and inside the app.
export const PRIVACY_POLICY_URL = "https://varietyh2o.com/privacy/";

const PRODUCTION_ORIGIN = "https://varietyh2o.com";

// Where Supabase sends people back to after Google sign-in or an emailed link (sign-up
// confirmation, password reset). Must match an entry in Supabase's Redirect URLs allow list,
// or Supabase silently falls back to its Site URL. On the web that's this same site (so deploy
// previews and localhost come back to themselves); inside the Capacitor native wrapper
// window.location.origin is the app's internal https://localhost, which no browser can reach,
// so emailed links point at the live site instead.
export function authRedirectUrl() {
  const origin = Capacitor.isNativePlatform() ? PRODUCTION_ORIGIN : window.location.origin;
  return `${origin}/login`;
}

// Size classes (see ROADMAP.md, "Layout for tablet and desktop"): decided by the window's own
// size, never by user-agent sniffing. A short window (e.g. a phone in landscape) stays "phone"
// even when it is wide. useSizeClass() is the single source of truth -- RewardsApp mirrors it onto
// <html data-size>, which the layout rules in index.css key off.
export function sizeClassFor(width, height) {
  if (width < 600 || height < 500) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function useSizeClass() {
  const [size, setSize] = useState(() => sizeClassFor(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const onResize = () => setSize(sizeClassFor(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

// Up to two initials for the tracker avatar: "Jane Doe" -> "JD", "cher" -> "C"; falls back to
// the email's first letter, then "?".
export function initialsFor(name, email) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0][0].toUpperCase();
  const fromEmail = String(email || "").trim()[0];
  return fromEmail ? fromEmail.toUpperCase() : "?";
}

// Dialog behavior for the bottom sheets: while open, focus moves into the sheet, Tab stays
// inside it, and Escape calls onClose; on close, focus returns to whatever opened it.
export function useDialog(open, onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const sheet = ref.current;
    if (!open || !sheet) return undefined;
    const opener = document.activeElement;
    const focusables = () => [...sheet.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )];
    // Focus the sheet itself (announced as the dialog) rather than its first button, so an
    // Enter meant for the page can't land on e.g. "Confirm" by accident.
    sheet.setAttribute("tabindex", "-1");
    sheet.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [open]);

  return ref;
}

// Props for a click target that can't be a real <button> -- e.g. a card containing block
// elements, which <button> may not contain. Makes it keyboard-focusable, announced as a
// button, and activated by Enter or Space like a native button.
export function buttonProps(onActivate) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(e);
      }
    },
  };
}

function PrivacyPolicyLink({ id }) {
  return (
    <p style={{ marginTop: 16, fontSize: 13 }}>
      <a id={id} href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--vh2o-accent)" }}>
        Privacy Policy
      </a>
    </p>
  );
}

export function mapProfileToUser(profile) {
  return {
    id: profile.legacy_id,
    profileId: profile.id,
    authUserId: profile.auth_user_id,
    username: profile.email,
    email: profile.email,
    role: profile.role === "admin" ? "admin" : "user",
    gallons: profile.gallons,
    name: profile.name,
    memberSince: profile.member_since || "N/A",
    waterType: profile.water_type || null,
    lastTransactionAt: profile.last_transaction_at || null,
    hasClaimCode: Boolean(profile.claim_code),
  };
}

// A customer is active if they currently hold gallons, or made a transaction within the
// last 31 days. No stored/scheduled status — always derived fresh from the data.
export function isActiveCustomer(user) {
  if (user.gallons > 0) {
    return true;
  }
  if (!user.lastTransactionAt) {
    return false;
  }
  return Date.now() - new Date(user.lastTransactionAt).getTime() <= ACTIVE_WINDOW_MS;
}

// Admin customer list: customers only (no admins), narrowed by a status filter and a search over
// name, email, and legacy ID, then sorted. filter: "all" | "active" | "inactive" | "nologin"
// ("nologin" = no linked login yet, i.e. still needs a claim code); sort: "name" | "gallons".
export function filterCustomers(users, { query = "", filter = "all", sort = "name" } = {}) {
  const q = String(query).trim().toLowerCase();
  const matches = users.filter((u) => {
    if (u.role !== "user") return false;
    if (filter === "active" && !isActiveCustomer(u)) return false;
    if (filter === "inactive" && isActiveCustomer(u)) return false;
    if (filter === "nologin" && u.authUserId) return false;
    if (!q) return true;
    return (
      String(u.name || "").toLowerCase().includes(q)
      || String(u.email || "").toLowerCase().includes(q)
      || String(u.id).includes(q)
    );
  });
  return matches.sort((a, b) => (
    sort === "gallons"
      ? b.gallons - a.gallons || String(a.name || "").localeCompare(String(b.name || ""))
      : String(a.name || "").localeCompare(String(b.name || ""))
  ));
}

const WATER_TYPE_LABELS = {
  purified: "Purified",
  remineralized: "Remineralized",
  alkaline: "Alkaline",
};

export function mapTransactionToNotification(transaction, usersByProfileId) {
  const user = usersByProfileId[transaction.user_profile_id];
  if (!user) {
    return null;
  }

  const timestamp = new Date(transaction.created_at);
  return {
    id: transaction.id,
    userId: user.id,
    userName: user.name,
    amount: transaction.amount,
    previousBalance: transaction.previous_balance,
    newBalance: transaction.new_balance,
    note: transaction.note || "",
    timestamp: transaction.created_at,
    displayTime: timestamp.toLocaleString(),
    type: transaction.amount > 0 ? "credit" : "debit",
  };
}

const MAX_NOTIFICATIONS_PER_USER = 5;

// Notifications are ordered newest-first; this keeps at most the most recent
// MAX_NOTIFICATIONS_PER_USER entries per user without disturbing that order.
export function capNotificationsPerUser(notifications) {
  const countsByUserId = {};
  return notifications.filter((notification) => {
    countsByUserId[notification.userId] = (countsByUserId[notification.userId] || 0) + 1;
    return countsByUserId[notification.userId] <= MAX_NOTIFICATIONS_PER_USER;
  });
}

// User-facing name for the device's primary biometry type. "Biometric unlock" is the fallback
// for a type this app doesn't have a specific label for yet (iris, or a future Android type).
export function biometryLabel(biometryType) {
  switch (biometryType) {
    case BiometryType.faceId:
      return "Face ID";
    case BiometryType.touchId:
      return "Touch ID";
    case BiometryType.fingerprintAuthentication:
      return "Fingerprint unlock";
    case BiometryType.faceAuthentication:
      return "Face unlock";
    default:
      return "Biometric unlock";
  }
}

function biometricLockStorageKey(authUserId) {
  return `vh2o-biometric-lock:${authUserId}`;
}

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // Set when an OAuth provider (e.g. Google) signs someone into Supabase Auth but no
  // profiles row is linked to that account -- distinct from simply being signed out, since
  // there's an active Supabase session we deliberately tear back down (see refreshFromSupabase).
  // Email of a signed-in auth user (e.g. a first-time Google sign-in) that no profiles row is
  // linked to yet. The session is kept -- claim_profile() needs it -- and
  // UnlinkedSessionRedirect sends them to /claim to link it with an ID + claim code.
  const [unlinkedAuthEmail, setUnlinkedAuthEmail] = useState(null);
  // Device-level convenience layer on top of the Supabase session above, not a separate auth
  // method -- see biometryLabel()/enableBiometricLock() below. biometricAvailable reflects the
  // device's hardware+enrollment state; biometricLockEnabled is this user's own opt-in
  // (persisted per authUserId, since the same device could see more than one account log in);
  // isBiometricLocked is the moment-to-moment "show the lock screen right now" flag.
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometryType, setBiometryType] = useState(BiometryType.none);
  const [biometricLockEnabled, setBiometricLockEnabled] = useState(false);
  const [isBiometricLocked, setIsBiometricLocked] = useState(false);
  // Which signed-in user the two biometric-lock flags above were last loaded for (null when
  // signed out), so they can be reloaded during render the moment that user changes.
  const [biometricLockUserId, setBiometricLockUserId] = useState(null);

  const refreshFromSupabase = async (authUserId = null) => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, auth_user_id, email, role, gallons, name, member_since, legacy_id, water_type, claim_code, last_transaction_at")
        .order("legacy_id", { ascending: true });

      if (profilesError) {
        throw profilesError;
      }

      const mappedUsers = (profiles || []).map(mapProfileToUser);
      setUsers(mappedUsers);

      const usersByProfileId = mappedUsers.reduce((acc, user) => {
        if (user.profileId) {
          acc[user.profileId] = user;
        }
        return acc;
      }, {});

      const { data: transactions, error: transactionsError } = await supabase
        .from("gallon_transactions")
        .select("id, user_profile_id, amount, previous_balance, new_balance, note, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (transactionsError) {
        throw transactionsError;
      }

      const mappedNotifications = capNotificationsPerUser(
        (transactions || [])
          .map((transaction) => mapTransactionToNotification(transaction, usersByProfileId))
          .filter(Boolean)
      );

      setNotifications(mappedNotifications);

      let resolvedAuthUserId = authUserId;
      let authEmail = null;

      const { data: authData } = await supabase.auth.getUser();
      if (!resolvedAuthUserId) {
        resolvedAuthUserId = authData.user?.id || null;
      }
      authEmail = authData.user?.email?.toLowerCase() || null;

      if (!resolvedAuthUserId) {
        setUnlinkedAuthEmail(null);
        setCurrentUser(null);
        return true;
      }

      let matchedUser = mappedUsers.find((user) => user.authUserId === resolvedAuthUserId) || null;
      if (!matchedUser && authEmail) {
        const emailMatch = mappedUsers.find((user) => user.email === authEmail) || null;
        if (emailMatch?.profileId) {
          const { error: linkError } = await supabase
            .from("profiles")
            .update({ auth_user_id: resolvedAuthUserId })
            .eq("id", emailMatch.profileId)
            .is("auth_user_id", null);

          if (!linkError) {
            matchedUser = { ...emailMatch, authUserId: resolvedAuthUserId };
            setUsers((prevUsers) => prevUsers.map((u) => {
              if (u.profileId === emailMatch.profileId) {
                return matchedUser;
              }
              return u;
            }));
          }
        }
      }

      if (!matchedUser) {
        // Signed into Supabase Auth (e.g. via Google) but no profiles row references this
        // auth user yet, and there was no unclaimed profile with a matching email to fall
        // back to. Keep the session -- it's what lets them redeem a claim code -- and flag it
        // so UnlinkedSessionRedirect routes them to /claim instead of a blank signed-out app.
        setUnlinkedAuthEmail(authEmail || "your account");
        setCurrentUser(null);
        return true;
      }

      setUnlinkedAuthEmail(null);
      setCurrentUser(matchedUser);
      return true;
    } catch (err) {
      console.warn("Supabase sync failed, keeping local cache:", err);
      return false;
    }
  };

  useEffect(() => {
    let isActive = true;

    const init = async () => {
      setIsLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user?.id || null;
      const synced = await refreshFromSupabase(authUserId);
      if (!synced && !authUserId) {
        setCurrentUser(null);
      }
      if (isActive) {
        setIsLoading(false);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isActive) {
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      }
      if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }

      const authUserId = session?.user?.id || null;
      void refreshFromSupabase(authUserId);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  // Keeps an already-open app in sync when an admin adjusts this user's balance from
  // another device/session -- without this, the balance and history only refresh on
  // mount, login, or an auth token event. RLS scopes both subscriptions to this user's
  // own rows, so Realtime can't leak another customer's changes here.
  useEffect(() => {
    const profileId = currentUser?.profileId;
    if (!profileId) {
      return;
    }

    const handleProfileUpdate = (payload) => {
      const updated = payload.new;
      setCurrentUser((prev) => (prev?.profileId === profileId
        ? { ...prev, gallons: updated.gallons, lastTransactionAt: updated.last_transaction_at }
        : prev));
      setUsers((prevUsers) => prevUsers.map((u) => (u.profileId === profileId
        ? { ...u, gallons: updated.gallons, lastTransactionAt: updated.last_transaction_at }
        : u)));
    };

    const handleNewTransaction = (payload) => {
      const notification = mapTransactionToNotification(payload.new, {
        [profileId]: { id: currentUser.id, name: currentUser.name },
      });
      if (!notification) {
        return;
      }
      setNotifications((prev) => capNotificationsPerUser([
        notification,
        ...prev.filter((n) => n.id !== notification.id),
      ]));
    };

    const channel = supabase
      .channel(`profile-balance-${profileId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${profileId}`,
      }, handleProfileUpdate)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "gallon_transactions",
        filter: `user_profile_id=eq.${profileId}`,
      }, handleNewTransaction)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.profileId, currentUser?.id, currentUser?.name]);

  // Checked once per app launch: whether this device's hardware supports biometry and the
  // user has enrolled in it. Never touched on web -- the plugin's web shim always reports
  // unavailable anyway, but skipping the call there avoids depending on that fallback.
  useEffect(() => {
    if (Capacitor.getPlatform() === "web") {
      return;
    }

    let isActive = true;
    BiometricAuth.checkBiometry()
      .then((result) => {
        if (isActive) {
          setBiometricAvailable(result.isAvailable);
          setBiometryType(result.biometryType);
        }
      })
      .catch(() => {
        if (isActive) {
          setBiometricAvailable(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  // Reads this user's own opt-in the moment they become signed in (covers both a fresh login
  // and the session Supabase auto-restores on cold start), and locks immediately if they'd
  // previously turned it on. Logging out clears both -- there's nothing to lock when signed out.
  // Done during render rather than in an effect so the lock is already in place on the very
  // first render for that user, instead of the app flashing on screen for one frame first.
  const authUserId = currentUser?.authUserId ?? null;
  if (authUserId !== biometricLockUserId) {
    const enabled = authUserId !== null
      && localStorage.getItem(biometricLockStorageKey(authUserId)) === "1";
    setBiometricLockUserId(authUserId);
    setBiometricLockEnabled(enabled);
    setIsBiometricLocked(enabled);
  }

  // Re-locks every time the app is foregrounded again (app switcher, screen lock, etc.), not
  // just at cold start -- matches how a banking-app-style biometric gate is expected to behave.
  useEffect(() => {
    if (Capacitor.getPlatform() === "web" || !biometricLockEnabled) {
      return;
    }

    const listenerPromise = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        setIsBiometricLocked(true);
      }
    });

    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [biometricLockEnabled]);

  const login = async (email, password) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      return error.message;
    }

    const signedInUserId = signInData.user?.id || null;
    if (signedInUserId) {
      const { data: linkedProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", signedInUserId)
        .maybeSingle();

      if (profileError) {
        return profileError.message;
      }

      if (!linkedProfile) {
        await supabase.auth.signOut();
        return "No VH2O profile is linked to this account yet. Ask admin to complete setup.";
      }
    }

    await refreshFromSupabase();
    return true;
  };

  // Kicks off the redirect to Google; there's nothing to check synchronously here since the
  // browser navigates away. The returning session is picked up by onAuthStateChange, which
  // runs refreshFromSupabase() the same as any other sign-in (see the matchedUser/
  // unlinkedAuthEmail handling there for a Google account with no linked VH2O profile yet).
  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl(),
      },
    });

    if (error) {
      return error.message;
    }

    return true;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setIsPasswordRecovery(false);
    setUnlinkedAuthEmail(null);
    setCurrentUser(null);
  };

  // Requires a successful biometric check before turning the preference on, so a user can't
  // enable a lock they then can't get back past (e.g. accidentally tapping through a device
  // that isn't actually theirs, or one where enrollment silently failed).
  const enableBiometricLock = async () => {
    if (!biometricAvailable || !currentUser?.authUserId) {
      return "Biometric authentication isn't available on this device.";
    }

    try {
      await BiometricAuth.authenticate({
        reason: `Confirm to turn on ${biometryLabel(biometryType)}`,
        allowDeviceCredential: true,
      });
    } catch (err) {
      return err?.message || "Unable to verify biometrics";
    }

    localStorage.setItem(biometricLockStorageKey(currentUser.authUserId), "1");
    setBiometricLockEnabled(true);
    return true;
  };

  const disableBiometricLock = () => {
    if (currentUser?.authUserId) {
      localStorage.removeItem(biometricLockStorageKey(currentUser.authUserId));
    }
    setBiometricLockEnabled(false);
    setIsBiometricLocked(false);
  };

  const unlockWithBiometrics = async () => {
    try {
      await BiometricAuth.authenticate({
        reason: `Unlock with ${biometryLabel(biometryType)}`,
        allowDeviceCredential: true,
      });
    } catch (err) {
      return err?.message || "Unable to verify biometrics";
    }

    setIsBiometricLocked(false);
    return true;
  };

  const requestPasswordReset = async (email) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      return "Enter a valid email";
    }

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: authRedirectUrl(),
    });

    if (error) {
      return error.message;
    }

    return true;
  };

  const completePasswordReset = async (newPassword, confirmPassword) => {
    if (newPassword !== confirmPassword) {
      return "Passwords do not match";
    }

    if (!newPassword || newPassword.length < 6) {
      return "Password must be at least 6 characters";
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return error.message;
    }

    setIsPasswordRecovery(false);
    await supabase.auth.signOut();
    return true;
  };

  // The only way a customer's balance can change. Delegates to the admin_adjust_gallons()
  // Postgres function, which re-checks admin status, locks the row, rejects a negative
  // result, and writes the profile update + transaction row atomically in one DB transaction.
  const adjustGallons = async (userId, amount, note = "") => {
    const affectedUser = users.find((u) => u.id === userId);
    if (!affectedUser?.profileId) {
      return { ok: false, message: "Customer not found" };
    }

    const { data, error } = await supabase.rpc("admin_adjust_gallons", {
      target_profile_id: affectedUser.profileId,
      delta: amount,
      note: note || null,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    await refreshFromSupabase(currentUser?.authUserId || null);

    return { ok: true, newBalance: data.gallons };
  };

  const fetchUserHistory = async (profileId) => {
    const { data, error } = await supabase
      .from("gallon_transactions")
      .select("id, amount, previous_balance, new_balance, note, created_at")
      .eq("user_profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      return { ok: false, message: error.message };
    }

    return {
      ok: true,
      transactions: (data || []).map((transaction) => ({
        id: transaction.id,
        amount: transaction.amount,
        previousBalance: transaction.previous_balance,
        newBalance: transaction.new_balance,
        note: transaction.note || "",
        displayTime: new Date(transaction.created_at).toLocaleString(),
        type: transaction.amount > 0 ? "credit" : "debit",
      })),
    };
  };

  const register = async (name, email, password, confirmPassword) => {
    if (currentUser?.role !== "admin") {
      return "Only admins can register users";
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      return "Enter a valid email";
    }

    if (password !== confirmPassword) {
      return "Passwords do not match";
    }

    if (!password || password.length < 6) {
      return "Password must be at least 6 characters";
    }

    if (users.find((u) => u.email === normalizedEmail)) {
      return "Email already exists";
    }

    const ephemeralClient = createEphemeralSupabaseClient();
    const { data: signUpData, error: signUpError } = await ephemeralClient.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          name,
        },
        emailRedirectTo: authRedirectUrl(),
      },
    });

    if (signUpError) {
      return signUpError.message;
    }

    const maxId = users.length > 0 ? Math.max(...users.map((u) => u.id)) : 100;
    const newProfile = {
      auth_user_id: signUpData.user?.id || null,
      email: normalizedEmail,
      role: "user",
      gallons: 0,
      name,
      member_since: new Date().toLocaleDateString(),
      legacy_id: maxId + 1,
    };

    const { error: insertError } = await supabase.from("profiles").insert(newProfile);
    if (insertError) {
      return insertError.message;
    }

    await refreshFromSupabase(currentUser?.authUserId || null);
    return true;
  };

  const generateClaimCode = async (profileId) => {
    const { data, error } = await supabase.rpc("admin_generate_claim_code", {
      target_profile_id: profileId,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    await refreshFromSupabase(currentUser?.authUserId || null);
    return { ok: true, code: data };
  };

  const updateWaterType = async (profileId, waterType) => {
    const { error } = await supabase
      .from("profiles")
      .update({ water_type: waterType })
      .eq("id", profileId);

    if (error) {
      return { ok: false, message: error.message };
    }

    await refreshFromSupabase(currentUser?.authUserId || null);
    return { ok: true };
  };

  // Public self-serve flow: a customer who isn't logged in yet signs up with their own
  // email + password, then redeems the one-time ID + claim code an admin handed them to
  // link that new login to their existing imported record.
  const claimProfile = async (legacyId, claimCode, email, password, confirmPassword) => {
    const parsedId = parseInt(legacyId, 10);
    if (!Number.isFinite(parsedId)) {
      return "Enter a valid customer ID";
    }

    const normalizedCode = String(claimCode || "").trim().toUpperCase();
    if (!normalizedCode) {
      return "Enter your claim code";
    }

    const { data: existingSession } = await supabase.auth.getSession();

    if (!existingSession.session) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail.includes("@")) {
        return "Enter a valid email";
      }
      if (password !== confirmPassword) {
        return "Passwords do not match";
      }
      if (!password || password.length < 6) {
        return "Password must be at least 6 characters";
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: authRedirectUrl(),
        },
      });

      if (signUpError) {
        return signUpError.message;
      }
    }

    const { error: claimError } = await supabase.rpc("claim_profile", {
      p_legacy_id: parsedId,
      p_claim_code: normalizedCode,
    });

    if (claimError) {
      return claimError.message;
    }

    await refreshFromSupabase();
    return true;
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        users,
        login,
        loginWithGoogle,
        logout,
        adjustGallons,
        fetchUserHistory,
        generateClaimCode,
        updateWaterType,
        claimProfile,
        notifications,
        register,
        isPasswordRecovery,
        requestPasswordReset,
        completePasswordReset,
        isLoading,
        unlinkedAuthEmail,
        biometricAvailable,
        biometryType,
        biometricLockEnabled,
        isBiometricLocked,
        enableBiometricLock,
        disableBiometricLock,
        unlockWithBiometrics,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

// Login Component
export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const {
    login,
    loginWithGoogle,
    isPasswordRecovery,
    completePasswordReset,
  } = useUser();
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setError("");
    const result = await loginWithGoogle();
    if (result !== true) {
      setError(result || "Unable to start Google sign-in");
    }
    // On success the browser navigates to Google -- nothing else to do here.
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const result = await login(email, password);
    if (result === true) {
      navigate("/");
    } else {
      setError(result || "Invalid credentials");
    }
  };

  const handleCompletePasswordReset = async (e) => {
    e.preventDefault();
    setError("");
    setResetStatus("");

    const result = await completePasswordReset(newPassword, confirmNewPassword);
    if (result === true) {
      setNewPassword("");
      setConfirmNewPassword("");
      setResetStatus("Password updated. Please log in with your new password.");
      return;
    }

    setError(result || "Unable to update password");
  };

  return (
    <div id="vh2o-login-root" className="vh2o-root vh2o-auth" style={styles.root}>
      <div id="vh2o-login-phone" className="vh2o-phone" style={styles.phone}>
        <div id="vh2o-login-content" style={{ padding: "40px 20px", textAlign: "center" }}>
          <div id="vh2o-login-store-name" style={styles.storeName}>
            <span style={{ fontSize: 22 }}>🧊</span>
            <span>Variety H2O + Ice Cream</span>
            <span style={{ fontSize: 22 }}>💧</span>
          </div>
          <form onSubmit={handleSubmit} style={{ marginTop: 40 }}>
            <label htmlFor="vh2o-login-username-input" style={styles.fieldLabel}>Email</label>
            <input
              id="vh2o-login-username-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
              required
            />
            <label htmlFor="vh2o-login-password-input" style={styles.fieldLabel}>Password</label>
            <input
              id="vh2o-login-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              autoComplete="current-password"
              required
            />
            <button id="vh2o-login-submit" type="submit" style={styles.loginBtn}>Login</button>
            {/* Web only: Google refuses OAuth inside embedded webviews (the Capacitor native
                wrapper) with "Error 403: disallowed_useragent". Native Google sign-in would
                need a system-browser/deep-link flow instead. */}
            {!Capacitor.isNativePlatform() && (
              <button
                id="vh2o-login-google-btn"
                type="button"
                onClick={handleGoogleLogin}
                style={styles.googleBtn}
              >
                Continue with Google
              </button>
            )}
            {isPasswordRecovery && (
              <>
                <div id="vh2o-login-recovery-title" style={{ ...styles.sectionTitle, marginTop: 14 }}>Set New Password</div>
                <label htmlFor="vh2o-login-recovery-password-input" style={styles.fieldLabel}>New password</label>
                <input
                  id="vh2o-login-recovery-password-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={styles.input}
                  autoComplete="new-password"
                  required
                />
                <label htmlFor="vh2o-login-recovery-confirm-password-input" style={styles.fieldLabel}>Confirm new password</label>
                <input
                  id="vh2o-login-recovery-confirm-password-input"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  style={styles.input}
                  autoComplete="new-password"
                  required
                />
                <button
                  id="vh2o-login-recovery-submit"
                  type="button"
                  onClick={handleCompletePasswordReset}
                  style={styles.loginBtn}
                >
                  Update Password
                </button>
              </>
            )}
            {error && <p id="vh2o-login-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{error}</p>}
            {resetStatus && <p id="vh2o-login-reset-status" style={{ color: "var(--vh2o-success)", marginTop: 10 }}>{resetStatus}</p>}
          </form>
          {!isPasswordRecovery && (
            <p style={{ marginTop: 16, fontSize: 13 }}>
              {/* Carries whatever was typed in the email field over to the reset page. */}
              <Link id="vh2o-login-forgot-link" to="/forgot-password" state={{ email }} style={{ color: "var(--vh2o-accent)" }}>
                Forgot password?
              </Link>
            </p>
          )}
          <PrivacyPolicyLink id="vh2o-login-privacy-link" />
        </div>
      </div>
    </div>
  );
}

// Step 1 of a password reset: request the emailed link. The link returns to /login (the address on
// Supabase's Redirect URLs allow list), where isPasswordRecovery shows step 2, choosing a new password.
export function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const { requestPasswordReset } = useUser();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setStatus("");

    const result = await requestPasswordReset(email);
    if (result === true) {
      setStatus("Check your email for a password reset link. Open it to choose a new password.");
      return;
    }

    setError(result || "Unable to send reset email");
  };

  return (
    <div id="vh2o-forgot-root" className="vh2o-root vh2o-auth" style={styles.root}>
      <div id="vh2o-forgot-phone" className="vh2o-phone" style={styles.phone}>
        <div id="vh2o-forgot-content" style={{ padding: "40px 20px", textAlign: "center" }}>
          <div id="vh2o-forgot-title" style={styles.storeName}>
            <KeyRound size={ICON_SIZE.md} aria-hidden="true" />
            <span>Reset Password</span>
          </div>
          <p style={{ color: "var(--vh2o-text-muted)", fontSize: 14, margin: "24px 0 20px" }}>
            Enter your account email and we'll send you a link to choose a new password.
          </p>
          <form onSubmit={handleSubmit}>
            <label htmlFor="vh2o-forgot-email-input" style={styles.fieldLabel}>Email</label>
            <input
              id="vh2o-forgot-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
              required
            />
            <button id="vh2o-forgot-submit" type="submit" style={styles.loginBtn}>Send Reset Link</button>
            {error && <p id="vh2o-forgot-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{error}</p>}
            {status && <p id="vh2o-forgot-status" style={{ color: "var(--vh2o-success)", marginTop: 10 }}>{status}</p>}
          </form>
          <p style={{ marginTop: 16, fontSize: 13 }}>
            <Link id="vh2o-forgot-back-link" to="/login" style={{ color: "var(--vh2o-accent)" }}>
              Back to login
            </Link>
          </p>
          <PrivacyPolicyLink id="vh2o-forgot-privacy-link" />
        </div>
      </div>
    </div>
  );
}

// Public self-serve page: a customer with a customer ID + one-time claim code (handed to
// them by staff) sets up their own login.
export function ClaimAccount() {
  const [legacyId, setLegacyId] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const { claimProfile, unlinkedAuthEmail, logout } = useUser();
  const navigate = useNavigate();
  // Already signed in (e.g. with Google) but not linked: only the ID + code are needed.
  const signedInUnlinked = Boolean(unlinkedAuthEmail);

  const handleSwitchAccount = async () => {
    await logout();
    navigate("/login");
  };

  useEffect(() => {
    let isActive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (isActive) {
        setHasSession(Boolean(data.session));
        setCheckingSession(false);
      }
    });
    return () => {
      isActive = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const result = await claimProfile(legacyId, claimCode, email, password, confirmPassword);
    if (result === true) {
      setSuccess(true);
      setTimeout(() => navigate("/"), 1500);
      return;
    }
    setError(result || "Unable to set up your account");
    // A signUp may have already succeeded even if the claim itself failed (bad code) --
    // switch to the ID+code-only retry view so they don't try to sign up a second time.
    supabase.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session)));
  };

  if (checkingSession) {
    return null;
  }

  return (
    <div id="vh2o-claim-root" className="vh2o-root vh2o-auth" style={styles.root}>
      <div id="vh2o-claim-phone" className="vh2o-phone" style={styles.phone}>
        <div id="vh2o-claim-content" style={{ padding: "40px 20px", textAlign: "center" }}>
          <div id="vh2o-claim-title" style={styles.storeName}>
            <KeyRound size={ICON_SIZE.md} aria-hidden="true" />
            <span>Set Up Your Account</span>
          </div>
          {success ? (
            <p id="vh2o-claim-success" style={{ color: "var(--vh2o-success)", marginTop: 20 }}>
              Account linked! Taking you to the app...
            </p>
          ) : (
            <form onSubmit={handleSubmit} style={{ marginTop: 30 }}>
              {signedInUnlinked && (
                <p id="vh2o-claim-signed-in-as" style={{ color: "var(--vh2o-text-muted)", fontSize: 14, marginBottom: 20 }}>
                  Signed in as <strong style={{ color: "var(--vh2o-text)" }}>{unlinkedAuthEmail}</strong>. Enter the
                  customer ID and claim code from the store to link this login to your account.
                </p>
              )}
              <label htmlFor="vh2o-claim-legacy-id-input" style={styles.fieldLabel}>Customer ID</label>
              <input
                id="vh2o-claim-legacy-id-input"
                type="text"
                inputMode="numeric"
                value={legacyId}
                onChange={(e) => setLegacyId(e.target.value)}
                style={styles.input}
                required
              />
              <label htmlFor="vh2o-claim-code-input" style={styles.fieldLabel}>Claim code</label>
              <input
                id="vh2o-claim-code-input"
                type="text"
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value)}
                style={styles.input}
                required
              />
              {!hasSession && !signedInUnlinked && (
                <>
                  <label htmlFor="vh2o-claim-email-input" style={styles.fieldLabel}>Your email</label>
                  <input
                    id="vh2o-claim-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={styles.input}
                    autoComplete="email"
                    required
                  />
                  <label htmlFor="vh2o-claim-password-input" style={styles.fieldLabel}>Create password</label>
                  <input
                    id="vh2o-claim-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={styles.input}
                    autoComplete="new-password"
                    required
                  />
                  <label htmlFor="vh2o-claim-confirm-password-input" style={styles.fieldLabel}>Confirm password</label>
                  <input
                    id="vh2o-claim-confirm-password-input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={styles.input}
                    autoComplete="new-password"
                    required
                  />
                </>
              )}
              <button id="vh2o-claim-submit" type="submit" style={styles.loginBtn}>
                Set Up Account
              </button>
              {error && <p id="vh2o-claim-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{error}</p>}
            </form>
          )}
          {signedInUnlinked && !success && (
            <>
              <p style={{ color: "var(--vh2o-text-subtle)", fontSize: 13, marginTop: 16 }}>
                Don&apos;t have a claim code? Ask at the store.
              </p>
              <p style={{ marginTop: 8, fontSize: 13 }}>
                <button
                  id="vh2o-claim-switch-account-btn"
                  type="button"
                  onClick={handleSwitchAccount}
                  style={{ background: "none", border: "none", color: "var(--vh2o-accent)", textDecoration: "underline", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
                >
                  Use a different account
                </button>
              </p>
            </>
          )}
          <PrivacyPolicyLink id="vh2o-claim-privacy-link" />
        </div>
      </div>
    </div>
  );
}

// ─── Rewards App Component ─────────────────────────────────────────────────

const TIERS = [
  { name: "Splash", min: 0, max: 199, color: "#7dd3fc", icon: Droplet },
  { name: "Frost", min: 200, max: 499, color: "#38bdf8", icon: Snowflake },
  { name: "Glacier", min: 500, max: 999, color: "#0ea5e9", icon: MountainSnow },
  { name: "Blizzard", min: 1000, max: Infinity, color: "#f472b6", icon: Wind },
];

// Per-category flat pricing (same price for every item in the category, matching what's
// actually charged at the register per the Square catalog) for categories offered in
// multiple sizes/quantities. An item can override with `flatPrice` (single price, no size
// choice) or `customTiers` (its own tier list instead of the category default) -- see
// "Add a Scoop of Ice Cream" and "Protein Smoothie" below.
const CATEGORY_SIZE_TIERS = {
  smoothies: [
    { key: "small", label: "Small", price: 8.05 },
    { key: "large", label: "Large", price: 10.12 },
  ],
  milkshakes: [
    { key: "small", label: "Small", price: 8.05 },
    { key: "large", label: "Large", price: 10.12 },
  ],
  snowcones: [
    { key: "small", label: "Small", price: 4.14 },
    { key: "large", label: "Large", price: 5.52 },
  ],
  "ice-cream": [
    { key: "single", label: "Single Scoop", price: 3.22 },
    { key: "double", label: "Double Scoop", price: 5.98 },
    { key: "triple", label: "Triple Scoop", price: 7.36 },
  ],
};

const PROTEIN_SMOOTHIE_TIERS = [
  { key: "small", label: "Small", price: 9.89 },
  { key: "large", label: "Large", price: 12.88 },
];

// Renders a menu category's icon: an image when the category has `iconSrc`, otherwise its emoji.
// The image is sized in `em` so it scales with the surrounding font-size like the emoji does.
const CategoryIcon = ({ cat }) => cat.iconSrc
  ? <img src={cat.iconSrc} alt="" style={{ width: "1.15em", height: "1.15em", objectFit: "contain", verticalAlign: "-0.2em" }} />
  : cat.icon;

const MENU_CATEGORIES = [
  {
    id: "water",
    name: "Water",
    icon: "💧",
    color: "#38bdf8",
    items: [
      { name: "Reverse Osmosis Water", price: 0.55, unit: "per gallon", description: "Filtration using a semi-permeable membrane for purification. Rejects larger molecules such as dissolved salts, bacteria, and other impurities. Passes ONLY pure water." },
      { name: "Remineralized Water", price: 0.80, unit: "per gallon", description: "Water purified by Reverse Osmosis charged with Calcium and Magnesium. Studies over the past few decades show that Americans in general tend to have an inadequate amount of Calcium in their diets. Magnesium activates the Vitamin D we absorb from the sun which plays a vital role in our bodies absorption of Calcium." },
      { name: "Alkaline Water", price: 2.25, unit: "per gallon", description: "Remineralized Water alkalized via electrolysis from an ionizer. Benefits may include reduced bone loss, improved metabolism, impeded aging, improved digestion, lessened acid reflux, increased longevity, increased growth hormone in children (eliminates short stature)." },
    ],
  },
  {
    id: "ice-cream",
    name: "Ice Cream",
    icon: "🍦",
    color: "#fb923c",
    items: [
        { name: "Banana Nut" },
        { name: "Birthday Cake" },
        { name: "Black Cherry" },
        { name: "Blueberry Cheesecake" },
        { name: "Bubble Gum" },
        { name: "Butter Pecan" },
        { name: "Cappuccino Crunch" },
        { name: "Chocolate" },
        { name: "Chocolate Chip" },
        { name: "Chocolate Malted Crunch" },
        { name: "Circus Animal" },
        { name: "Coconut Pineapple" },
        { name: "Coffee" },
        { name: "Cookie Dough" },
        { name: "Cookies N Cream" },
        { name: "Cotton Candy" },
        { name: "Frozen Yogurt" },
        { name: "Green Tea" },
        { name: "Mint N Chip" },
        { name: "Orange Sherbet" },
        { name: "Peanut Butter" },
        { name: "Pecan Praline" },
        { name: "Pistachio" },
        { name: "Rainbow Sherbet" },
        { name: "Rocky Road" },
        { name: "Strawberry" },
        { name: "Strawberry Banana" },
        { name: "Strawberry Cheesecake" },
        { name: "Vanilla" },
    ],
  },
  {
    id: "smoothies",
    name: "Smoothies",
    icon: "🥤",
    color: "#a78bfa",
    items: [
      { name: "Mango Strawberry Banana" },
      { name: "Peach Mango" },
      { name: "Pineapple Mango" },
      { name: "Pineapple Strawberry Banana" },
      { name: "Strawberry Banana" },
      { name: "Strawberry Peach Cream" },
      { name: "Tropical Delight" },
      { name: "Very Berry" },
      { name: "Protein Smoothie", customTiers: PROTEIN_SMOOTHIE_TIERS },
    ],
  },
  {
    id: "milkshakes",
    name: "Milkshakes",
    icon: "🥛",
    color: "#f472b6",
    items: [
      { name: "Chocolate" },
      { name: "Twix" },
      { name: "Butterfinger" },
      { name: "Kit-Kat" },
      { name: "Snickers" },
      { name: "Almond Joy" },
      { name: "Nestle Crunch" },
      { name: "3 Musketeers" },
      { name: "Cookies & Cream" },
      { name: "Peanut Butter" },
      { name: "Vanilla" },
      { name: "Chocolate Toffee" },
      { name: "Banana" },
      { name: "Strawberry" },
      { name: "Banana Strawberry" },
      { name: "Strawberry Peach" },
      { name: "Chocolate Pineapple" },
      { name: "Java Chip" },
      { name: "Mint Chip" },
    ],
  },
  {
    id: "snowcones",
    name: "Snowcones",
    icon: "🧊",
    color: "#7dd3fc",
    items: [
      { name: "Mango" },
      { name: "Strawberry" },
      { name: "Tiger's Blood" },
      { name: "Blue Raspberry" },
      { name: "Guava" },
      { name: "Pina Colada" },
      { name: "Mai Tai" },
      { name: "Dinosaur" },
      { name: "Cotton Candy" },
      { name: "Rock & Roll" },
      { name: "Bubble Gum" },
      { name: "Birthday Cake" },
      { name: "Add a Scoop of Ice Cream", flatPrice: 2.76, unit: "add-on" },
    ],
  },
  {
    id: "golas",
    name: "Golas",
    icon: "🍧",
    color: "#34d399",
    items: [
      { name: "Rajbhog", price: 7.36, unit: "regular" },
      { name: "Kalakhatta", price: 7.36, unit: "regular" },
      { name: "Chocolate", price: 7.36, unit: "regular" },
      { name: "Kachie Karey", price: 7.36, unit: "regular" },
      { name: "Saffron", price: 7.36, unit: "regular" },
      { name: "Rose", price: 7.36, unit: "regular" },
      { name: "Mango", price: 7.36, unit: "regular" },
      { name: "Strawberry", price: 7.36, unit: "regular" },
    ],
  },
  {
    id: "bottles",
    name: "Bottles & Jugs",
    icon: "🧴",
    iconSrc: bottlesIcon,
    color: "#60a5fa",
    items: [
      { name: "1 Gallon BPA Free W/Extra Cap", price: 15.64, unit: "each" },
      { name: "1/2 Gallon BPA Free W/Extra Cap", price: 13.80, unit: "each" },
      { name: "20oz Bottle", price: 4.60, unit: "each" },
      { name: "3 Gallon HDPE", price: 14.72, unit: "each" },
      { name: "62 OZ Bottle", price: 9.99, unit: "each" },
      { name: "BPA Free - 2 Gallon", price: 22.08, unit: "each" },
      { name: "BPA Free - 3 Gallon", price: 23.00, unit: "each" },
      { name: "BPA Free - 5 Gallon", price: 29.44, unit: "each" },
      { name: "Bottle with Valve - 2 Gallon PC", price: 22.08, unit: "each" },
      { name: "Bottle with Valve - 3 Gallon PC", price: 26.22, unit: "each" },
      { name: "Bottle with Valve - 5 Gallon PC", price: 34.04, unit: "each" },
      { name: "Dairy Jug", price: 2.38, unit: "each" },
      { name: "Glass Bottle - 1 Gallon", price: 15.64, unit: "each" },
      { name: "Glass Bottle - 3 Gallon", price: 59.80, unit: "each" },
      { name: "Glass Bottle - 5 Gallon", price: 69.90, unit: "each" },
      { name: "Polycarbonate (PC) Bottle - 2 Gallon PC", price: 17.48, unit: "each" },
      { name: "Polycarbonate (PC) Bottle - 3 Gallon", price: 21.62, unit: "each" },
      { name: "Polycarbonate (PC) Bottle - 5 Gallon", price: 26.22, unit: "each" },
      { name: "Refrigerator Bottle - 2 Gallon", price: 25.30, unit: "each" },
      { name: "Refrigerator Bottle - 3 Gallon PC", price: 28.52, unit: "each" },
    ],
  },
  {
    id: "ice",
    name: "Ice",
    icon: "❄️",
    color: "#93c5fd",
    items: [
      { name: "20 Lb Ice Bag", price: 5.00, unit: "each" },
      { name: "8 Lb Ice Bag", price: 2.50, unit: "each" },
      { name: "Block Ice", price: 6.00, unit: "each" },
      { name: "Shaved 8 lbs", price: 7.99, unit: "each" },
    ],
  },
  {
    id: "bottled-water",
    name: "Bottled Water",
    icon: "🚰",
    color: "#38bdf8",
    items: [
      { name: "Alkaline 1 Gallon", price: 4.00, unit: "each" },
      { name: "Alkaline 1 Liter", price: 1.75, unit: "each" },
      { name: "Remineralized 1 Gallon", price: 3.00, unit: "each" },
      { name: "Remineralized 1 Liter", price: 1.50, unit: "each" },
      { name: "5G Remineralized Water Bottle", price: 10.00, unit: "each" },
    ],
  },
  {
    id: "drinks",
    name: "Drinks",
    icon: "🧃",
    color: "#fbbf24",
    items: [
      { name: "Arizona Green Tea", price: 2.76, unit: "each" },
      { name: "Bai", price: 2.76, unit: "each" },
      { name: "Chai", price: 3.68, unit: "each" },
      { name: "Coconut Water", price: 2.76, unit: "each" },
      { name: "Gatorade", price: 2.30, unit: "each" },
      { name: "Protein Milk", price: 2.76, unit: "each" },
      { name: "Red Bull", price: 3.68, unit: "each" },
      { name: "Soda Bottle", price: 2.07, unit: "each" },
      { name: "Soda Can", price: 0.92, unit: "each" },
    ],
  },
  {
    id: "accessories",
    name: "Accessories",
    icon: "🔧",
    color: "#94a3b8",
    items: [
      { name: "Bottle Cap Silicon", price: 2.76, unit: "each" },
      { name: "Bottle Cap big", price: 1.84, unit: "each" },
      { name: "Bottle Cap small", price: 1.38, unit: "each" },
      { name: "Glass Bottle Handle", price: 11.99, unit: "each" },
      { name: "Hydro Pump", price: 29.99, unit: "each" },
      { name: "Just Silicine Cap", price: 4.60, unit: "each" },
      { name: "Just cap big", price: 3.68, unit: "each" },
      { name: "Just cap small", price: 2.76, unit: "each" },
      { name: "Valve", price: 3.68, unit: "each" },
      { name: "Valve (Screw On) - Anti Splash Cap", price: 7.99, unit: "each" },
      { name: "Valve (Snap On) - Anti Splash Cap", price: 7.99, unit: "each" },
    ],
  },
  {
    id: "dispensers",
    name: "Dispensers & Stands",
    icon: "⚙️",
    color: "#c084fc",
    items: [
      { name: "Clover Water Dispenser", price: 279.00, unit: "each" },
      { name: "Dispenser Ring", price: 2.99, unit: "each" },
      { name: "Dispenser W/Lid", price: 65.32, unit: "each" },
      { name: "Lid", price: 11.99, unit: "each" },
      { name: "White Ceramic", price: 59.80, unit: "each" },
      { name: "Large Steel Stand", price: 71.76, unit: "each" },
    ],
  },
  {
    id: "ice-cream-extras",
    name: "Ice Cream Extras",
    icon: "🍨",
    color: "#fdba74",
    items: [
      { name: "8oz Mango Prepacked", price: 1.84, unit: "each" },
      { name: "Cone - Cake", price: 0.41, unit: "each" },
      { name: "Cone - Sugar", price: 0.55, unit: "each" },
      { name: "Cone - Waffle", price: 1.29, unit: "each" },
      { name: "Cone - Large Waffle", price: 1.38, unit: "each" },
      { name: "Packed 3 Gallon", price: 66.24, unit: "each" },
      { name: "Packed 48oz", price: 10.12, unit: "each" },
      { name: "Pint Prepacked", price: 6.99, unit: "each" },
      { name: "Reusable Cup", price: 3.68, unit: "each" },
      { name: "Topping", price: 0.92, unit: "each" },
    ],
  },
  {
    id: "snacks",
    name: "Snacks & Candy",
    icon: "🍬",
    color: "#f87171",
    items: [
      { name: "Protein Bar", price: 2.30, unit: "each" },
      { name: "Chocolate", price: 1.25, unit: "each" },
      { name: "Gum", price: 1.25, unit: "each" },
      { name: "Banana Split", price: 7.99, unit: "each" },
    ],
  },
];

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getTier(pts) {
  return TIERS.find((t) => pts >= t.min && pts <= t.max) || TIERS[0];
}

function AdminUserRow({ user, onRequestAdjustment, onViewHistory, onUpdateWaterType, onGenerateClaimCode }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  const submit = (direction) => {
    const parsed = parseInt(amount, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    onRequestAdjustment(user, direction === "credit" ? parsed : -parsed, note.trim());
    setAmount("");
    setNote("");
  };

  const handleGenerateCode = async () => {
    setCodeError("");
    setIsGeneratingCode(true);
    const result = await onGenerateClaimCode(user);
    setIsGeneratingCode(false);
    if (!result.ok) {
      setCodeError(result.message || "Unable to generate code");
      return;
    }
    setGeneratedCode(result.code);
  };

  const active = isActiveCustomer(user);
  const lastActivity = user.lastTransactionAt ? new Date(user.lastTransactionAt).toLocaleDateString() : "None yet";

  return (
    <div id={`vh2o-admin-user-card-${user.id}`} className="vh2o-admin-detail" style={{ ...styles.rewardCard, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div className="vh2o-admin-detail-head">
        <div style={{ minWidth: 0 }}>
          <div id={`vh2o-admin-user-name-${user.id}`} className="vh2o-admin-detail-name">{user.name}</div>
          <div className="vh2o-admin-muted">#{user.id} · {user.email || "No email yet"}</div>
        </div>
        <div id={`vh2o-admin-user-gallons-${user.id}`} className="vh2o-admin-detail-balance">
          <span className="vh2o-admin-detail-gallons">{user.gallons.toLocaleString()}</span>
          <span className="vh2o-admin-muted">gallons</span>
        </div>
      </div>
      <div className="vh2o-admin-detail-facts">
        <span
          id={`vh2o-admin-user-status-${user.id}`}
          className={`vh2o-status-pill ${active ? "is-active" : "is-inactive"}`}
        >
          {active ? "Active" : "Inactive"}
        </span>
        {!user.authUserId && <span className="vh2o-status-pill is-nologin">No login yet</span>}
        <span className="vh2o-admin-muted">Member since {user.memberSince}</span>
        <span className="vh2o-admin-muted">Last activity {lastActivity}</span>
        <button
          id={`vh2o-admin-user-history-btn-${user.id}`}
          type="button"
          onClick={() => onViewHistory(user)}
          style={{
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(148,163,184,0.1)",
            color: "var(--vh2o-text-muted)",
            borderRadius: 10, padding: "6px 10px",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          History
        </button>
      </div>
      <label htmlFor={`vh2o-admin-user-water-type-select-${user.id}`} style={{ ...styles.fieldLabel, marginBottom: -4 }}>Water type</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          id={`vh2o-admin-user-water-type-select-${user.id}`}
          aria-label={`Water type for ${user.name || user.email}`}
          value={user.waterType || ""}
          onChange={(e) => onUpdateWaterType(user, e.target.value || null)}
          style={{ ...styles.input, marginBottom: 0, padding: "6px", flex: 1 }}
        >
          <option value="">No water type</option>
          <option value="purified">Purified</option>
          <option value="remineralized">Remineralized</option>
          <option value="alkaline">Alkaline</option>
        </select>
      </div>
      {!user.authUserId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            id={`vh2o-admin-user-generate-code-btn-${user.id}`}
            type="button"
            onClick={handleGenerateCode}
            disabled={isGeneratingCode}
            style={{
              border: "1px solid rgba(167,139,250,0.4)",
              background: "rgba(167,139,250,0.12)",
              color: "#a78bfa",
              borderRadius: 10, padding: "8px",
              fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              opacity: isGeneratingCode ? 0.6 : 1,
            }}
          >
            {isGeneratingCode ? "Generating…" : user.hasClaimCode ? "Regenerate Claim Code" : "Generate Claim Code"}
          </button>
          {generatedCode && (
            <div
              id={`vh2o-admin-user-claim-code-${user.id}`}
              style={{ fontSize: 14, fontWeight: 800, color: "var(--vh2o-accent-soft)", textAlign: "center", padding: "8px", background: "rgba(56,189,248,0.1)", borderRadius: 8, letterSpacing: 1 }}
            >
              {generatedCode}
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--vh2o-text-subtle)", marginTop: 2, letterSpacing: 0 }}>
                Give this + their Customer ID ({user.id}) to the customer
              </div>
            </div>
          )}
          {codeError && (
            <p id={`vh2o-admin-user-claim-code-error-${user.id}`} style={{ color: "var(--vh2o-danger)", fontSize: 12, textAlign: "center" }}>{codeError}</p>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ width: 90 }}>
          <label htmlFor={`vh2o-admin-user-amount-input-${user.id}`} style={styles.fieldLabel}>Gallons</label>
          <input
            id={`vh2o-admin-user-amount-input-${user.id}`}
            aria-label={`Gallons for ${user.name || user.email}`}
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ ...styles.input, padding: "6px", marginBottom: 0 }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor={`vh2o-admin-user-note-input-${user.id}`} style={styles.fieldLabel}>Note (optional)</label>
          <input
            id={`vh2o-admin-user-note-input-${user.id}`}
            aria-label={`Note for ${user.name || user.email}`}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ ...styles.input, padding: "6px", marginBottom: 0 }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          id={`vh2o-admin-user-credit-btn-${user.id}`}
          type="button"
          onClick={() => submit("credit")}
          style={{
            flex: 1,
            border: "1px solid rgba(52,211,153,0.4)",
            background: "rgba(52,211,153,0.15)",
            color: "var(--vh2o-success)",
            borderRadius: 10, padding: "8px",
            fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Bought Today
        </button>
        <button
          id={`vh2o-admin-user-debit-btn-${user.id}`}
          type="button"
          onClick={() => submit("debit")}
          style={{
            flex: 1,
            border: "1px solid rgba(248,113,113,0.4)",
            background: "rgba(248,113,113,0.12)",
            color: "var(--vh2o-danger)",
            borderRadius: 10, padding: "8px",
            fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Filled Today
        </button>
      </div>
    </div>
  );
}

// Shown instead of the app whenever a signed-in user has biometric lock turned on and the app
// has just launched or come back to the foreground. Auto-prompts on mount so the OS Face
// ID/Touch ID/fingerprint dialog appears immediately instead of waiting for a tap.
function BiometricLockScreen() {
  const { biometryType, unlockWithBiometrics, logout } = useUser();
  const [error, setError] = useState("");

  const showUnlockResult = (result) => {
    if (result !== true) {
      setError(result || "Unable to verify biometrics");
    }
  };

  const attemptUnlock = async () => {
    setError("");
    showUnlockResult(await unlockWithBiometrics());
  };

  useEffect(() => {
    // Not attemptUnlock(): on mount there's no previous error to clear, and clearing it
    // synchronously here would be a pointless extra render.
    void unlockWithBiometrics().then(showUnlockResult);
    // Intentionally run once on mount only -- re-prompting after that is via the retry
    // button, not a dependency change, so unlockWithBiometrics' fresh identity each render
    // shouldn't re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div id="vh2o-biometric-lock-root" className="vh2o-root vh2o-auth" style={styles.root}>
      <style>{css}</style>
      <div id="vh2o-biometric-lock-phone" className="vh2o-phone" style={styles.phone}>
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={styles.storeName}>
            <Lock size={ICON_SIZE.md} aria-hidden="true" />
            <span>Variety H2O + Ice Cream</span>
          </div>
          <p id="vh2o-biometric-lock-message" style={{ color: "var(--vh2o-text-subtle)", margin: "30px 0" }}>
            Unlock with {biometryLabel(biometryType)} to continue.
          </p>
          <button id="vh2o-biometric-lock-unlock-btn" onClick={attemptUnlock} style={styles.loginBtn}>
            Unlock
          </button>
          {error && <p id="vh2o-biometric-lock-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{error}</p>}
          <button
            id="vh2o-biometric-lock-logout-btn"
            onClick={logout}
            style={{ ...styles.loginBtn, marginTop: 12, background: "transparent", border: "1px solid var(--vh2o-border-accent)" }}
          >
            Log out instead
          </button>
        </div>
      </div>
    </div>
  );
}

export function MainApp() {
  const {
    currentUser, logout, adjustGallons, fetchUserHistory, updateWaterType, generateClaimCode,
    users, notifications, register, isLoading,
    biometricAvailable, biometryType, biometricLockEnabled, isBiometricLocked,
    enableBiometricLock, disableBiometricLock,
  } = useUser();
  const [activeTab, setActiveTab] = useState("menu"); // Start with menu when logged out
  const [activeCategory, setActiveCategory] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  const [pendingAdjustment, setPendingAdjustment] = useState(null); // { user, amount, note }
  const [adjustmentError, setAdjustmentError] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [historyUser, setHistoryUser] = useState(null);
  const [historyTransactions, setHistoryTransactions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // Switch to Home on login, Menu on logout. Adjusted during render (not an effect) so a
  // data refresh that produces a new `currentUser` object for the *same* logged-in account
  // (e.g. after crediting a customer) doesn't yank the admin back to the tracker tab.
  const currentUserId = currentUser?.id ?? null;
  const [prevUserId, setPrevUserId] = useState(currentUserId);
  if (currentUserId !== prevUserId) {
    setPrevUserId(currentUserId);
    setActiveTab(currentUserId ? "tracker" : "menu");
  }

  // Reset category drill-down when leaving the menu tab.
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
  if (activeTab !== prevActiveTab) {
    setPrevActiveTab(activeTab);
    if (activeTab !== "menu") {
      setActiveCategory(null);
    }
  }
  const [searchQuery, setSearchQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState("all");
  const [adminSort, setAdminSort] = useState("name");
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  // Phone only: the list and a customer's details are separate views.
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState("");
  const [newUserError, setNewUserError] = useState("");
  const [newUserSuccess, setNewUserSuccess] = useState("");
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [showCallOptions, setShowCallOptions] = useState(false);
  const sizeClass = useSizeClass();
  const isDesktop = sizeClass === "desktop";
  // A signed-in customer's Home tab (profile card + history), laid out per size class.
  const isCustomerHome = Boolean(currentUser && currentUser.role !== "admin");
  const confirmSheetRef = useDialog(Boolean(pendingAdjustment), () => {
    if (!isAdjusting) setPendingAdjustment(null);
  });
  const historySheetRef = useDialog(Boolean(historyUser), () => setHistoryUser(null));
  const mapSheetRef = useDialog(showMapOptions, () => setShowMapOptions(false));
  const callSheetRef = useDialog(showCallOptions, () => setShowCallOptions(false));
  const navigate = useNavigate();

  const tier = currentUser ? getTier(currentUser.gallons) : null;

  const handleAdminRegisterUser = async (e) => {
    e.preventDefault();
    setNewUserError("");
    setNewUserSuccess("");

    const result = await register(newUserName, newUserUsername, newUserPassword, newUserConfirmPassword);
    if (result === true) {
      setNewUserName("");
      setNewUserUsername("");
      setNewUserPassword("");
      setNewUserConfirmPassword("");
      setNewUserSuccess("Customer registered. They can log in now with the email and temporary password you set — give it to them in person.");
      return;
    }

    setNewUserError(result);
  };

  const requestAdjustment = (user, amount, note) => {
    setAdjustmentError("");
    setPendingAdjustment({ user, amount, note });
  };

  const confirmAdjustment = async () => {
    if (!pendingAdjustment) {
      return;
    }
    setIsAdjusting(true);
    setAdjustmentError("");
    const result = await adjustGallons(pendingAdjustment.user.id, pendingAdjustment.amount, pendingAdjustment.note);
    setIsAdjusting(false);
    if (!result.ok) {
      setAdjustmentError(result.message || "Unable to apply this change");
      return;
    }
    setPendingAdjustment(null);
  };

  const handleUpdateWaterType = (user, waterType) => updateWaterType(user.profileId, waterType);
  const handleGenerateClaimCode = (user) => generateClaimCode(user.profileId);

  const openHistory = async (user) => {
    setHistoryUser(user);
    setHistoryTransactions([]);
    setHistoryError("");
    setHistoryLoading(true);
    const result = await fetchUserHistory(user.profileId);
    setHistoryLoading(false);
    if (!result.ok) {
      setHistoryError(result.message || "Unable to load history");
      return;
    }
    setHistoryTransactions(result.transactions);
  };

  const [biometricSettingsError, setBiometricSettingsError] = useState("");

  const handleBiometricToggle = async () => {
    setBiometricSettingsError("");
    if (biometricLockEnabled) {
      disableBiometricLock();
      return;
    }
    const result = await enableBiometricLock();
    if (result !== true) {
      setBiometricSettingsError(result || "Unable to turn on biometric unlock");
    }
  };

  if (currentUser && isBiometricLocked) {
    return <BiometricLockScreen />;
  }

  return (
    <div id="vh2o-app-root" className="vh2o-root" style={styles.root}>
      <style>{css}</style>

      {/* Phone wrapper */}
      <div id="vh2o-app-phone" className="vh2o-phone" style={styles.phone}>

        {isDesktop ? (
          // Desktop: a top bar replaces both the logo banner and the bottom tab bar.
          <header id="vh2o-top-nav" className="vh2o-topbar">
            <img id="vh2o-top-nav-logo" className="vh2o-topbar-logo" src={img} alt="Variety H2O + Ice Cream" />
            <nav aria-label="Main" className="vh2o-topbar-tabs">
              {[
                ["tracker", House, "Home"],
                ["menu", IceCreamCone, "Menu"],
                ["locations", MapPin, "Location"],
                ["settings", Settings, "Settings"],
              ].map(([tab, icon, label]) => {
                const TabIcon = icon;
                return (
                <button
                  key={tab}
                  id={`vh2o-top-nav-${tab}`}
                  type="button"
                  className="vh2o-topbar-tab"
                  aria-current={activeTab === tab ? "page" : undefined}
                  onClick={() => setActiveTab(tab)}
                >
                  <TabIcon size={18} aria-hidden="true" />
                  {label}
                </button>
                );
              })}
            </nav>
            <div id="vh2o-top-nav-account" className="vh2o-topbar-account">
              {currentUser ? (
                <>
                  <span>{currentUser.name || currentUser.email}</span>
                  <span className="vh2o-topbar-avatar" aria-hidden="true">
                    {initialsFor(currentUser.name, currentUser.email)}
                  </span>
                </>
              ) : (
                <button id="vh2o-top-nav-login-btn" type="button" className="vh2o-topbar-login" onClick={() => navigate("/login")}>
                  Log in
                </button>
              )}
            </div>
          </header>
        ) : (
          /* Wavy header */
          <div id="vh2o-app-header" style={styles.header}>
            <div style={styles.headerBg} />
            <div style={styles.headerContent}>
              <div style={styles.storeName}>
                  <img id="vh2o-app-header-logo" className="vh2o-banner-logo" src={img} alt="Variety H2O + Ice Cream" style={{ width: "100%" }}/>
              </div>
            </div>
          </div>
        )}

        {/* Tab content */}
        <div
          id="vh2o-app-content"
          className={`vh2o-content${activeTab === "tracker" && currentUser?.role === "admin" ? " vh2o-content--wide" : ""}`}
          style={styles.content}
        >
          {activeTab === "tracker" && (
          <div id="vh2o-tracker-home" className={isCustomerHome ? "vh2o-home" : undefined}>
            {currentUser && (
            <div id="vh2o-tracker-profile" className={isCustomerHome ? "vh2o-home-profile" : undefined}>
              <div id="vh2o-tracker-avatar-ring" style={styles.avatarRing}>
                <div id="vh2o-tracker-avatar" aria-hidden="true" style={styles.avatar}>
                  {initialsFor(currentUser.name, currentUser.email)}
                </div>
                <div id="vh2o-tracker-tier-badge" style={{ ...styles.tierBadge, background: tier.color }}>
                  <tier.icon size={ICON_SIZE.inline} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {tier.name}
                </div>
              </div>
              <div id="vh2o-tracker-user-name" style={styles.userName}>{currentUser.name} (ID: {currentUser.id})</div>
              {currentUser.role !== 'admin' && (
                <>
                  <div id="vh2o-tracker-member-since" style={styles.memberSince}>Member since {currentUser.memberSince}</div>
                  {currentUser.waterType && (
                    <div id="vh2o-tracker-water-type" style={styles.memberSince}>
                      {WATER_TYPE_LABELS[currentUser.waterType] || currentUser.waterType} Water
                    </div>
                  )}
                  <div id="vh2o-tracker-points-pill" style={styles.pointsPill}>
                    <div style={styles.pointsNum}>{currentUser.gallons.toLocaleString()}</div>
                    <div style={styles.pointsLabel}>GALLONS REMAINING</div>
                  </div>
                </>
              )}
            </div>
            )}
            <div
              id="vh2o-tracker-section"
              className={isCustomerHome ? "vh2o-home-section" : undefined}
              style={isCustomerHome ? undefined : styles.rewardsList}
            >
              {isLoading ? (
                <p style={{ color: "var(--vh2o-text-subtle)", textAlign: "center", marginTop: 20 }}>Loading…</p>
              ) : !currentUser ? (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={styles.sectionTitle}>Login Required</div>
                  <p style={{ color: "var(--vh2o-text-subtle)", marginBottom: 20 }}>
                    Please log in to access your gallons tracker and account management.
                  </p>
                  <button onClick={() => navigate("/login")} style={styles.loginBtn}>Login</button>
                </div>
              ) : currentUser.role !== 'admin' ? (
                <>
                  <div id="vh2o-tracker-history-title" style={styles.sectionTitle}>Transaction History</div>
                  <div id="vh2o-tracker-history" className="vh2o-home-history">
                  {notifications?.length > 0 && notifications.filter(n => n.userId === currentUser.id).length > 0 ? (
                    notifications
                      .filter(n => n.userId === currentUser.id)
                      .map((notif) => (
                        <div id={`vh2o-tracker-notification-card-${notif.id}`} key={notif.id} style={styles.notificationCard}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div id={`vh2o-tracker-notification-icon-${notif.id}`} style={{
                              ...styles.notificationIcon,
                              background: notif.type === "credit" ? "#10b98133" : "#ef444433"
                            }}>
                              {notif.type === "credit"
                                ? <Plus size={ICON_SIZE.md} color="#34d399" aria-hidden="true" />
                                : <Minus size={ICON_SIZE.md} color="#f87171" aria-hidden="true" />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={styles.notificationTitle}>
                                {notif.type === "credit" ? "Bought" : "Filled"}
                              </div>
                              <div id={`vh2o-tracker-notification-amount-${notif.id}`} style={{ ...styles.notificationBody, color: notif.type === "credit" ? "var(--vh2o-accent-soft)" : "var(--vh2o-danger)" }}>
                                {notif.type === "credit" ? "+" : ""}{notif.amount} gallons
                              </div>
                              <div id={`vh2o-tracker-notification-time-${notif.id}`} style={styles.notificationTime}>
                                {notif.displayTime}
                              </div>
                              <div style={styles.notificationDetails}>
                                Balance: {notif.previousBalance} → {notif.newBalance}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                  ) : (
                    <p id="vh2o-tracker-history-empty" style={{ color: "var(--vh2o-text-subtle)", textAlign: "center", marginTop: 20 }}>
                      No transactions for your account yet
                    </p>
                  )}
                  </div>
                </>
              ) : (
                <div id="vh2o-admin-manage-users" className="vh2o-admin" style={{ marginTop: 20 }}>
                  <div id="vh2o-admin-manage-users-title" style={styles.sectionTitle}>Admin: Customers</div>
                  {(() => {
                    const customers = users.filter((u) => u.role === "user");
                    const activeCount = customers.filter(isActiveCustomer).length;
                    const pct = customers.length > 0 ? Math.round((activeCount / customers.length) * 100) : 0;
                    // Nothing is listed until 3+ characters are typed, so customer names and balances
                    // aren't on show at a glance to anyone who can see the admin screen.
                    const canSearch = searchQuery.trim().length >= 3;
                    const shown = canSearch
                      ? filterCustomers(users, { query: searchQuery, filter: adminFilter, sort: adminSort })
                      : [];
                    const selected = customers.find((u) => u.id === selectedCustomerId) || null;
                    const isPhone = sizeClass === "phone";
                    const showList = !isPhone || !showCustomerDetail || !selected;
                    const showDetail = !isPhone || (showCustomerDetail && selected);

                    const list = (
                      <div id="vh2o-admin-customer-list" className="vh2o-admin-list">
                        <div id="vh2o-admin-active-summary" className="vh2o-admin-muted" style={{ textAlign: "center" }}>
                          {activeCount} active / {customers.length} total customers ({pct}%)
                        </div>
                        <div>
                          <label htmlFor="vh2o-admin-user-search-input" style={styles.fieldLabel}>Search customers</label>
                          <input
                            id="vh2o-admin-user-search-input"
                            type="text"
                            placeholder="Type 3+ characters of a name, email, or ID"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ ...styles.input, marginBottom: 0 }}
                          />
                        </div>
                        <div className="vh2o-chip-row" role="group" aria-label="Filter customers">
                          {[["all", "All"], ["active", "Active"], ["inactive", "Inactive"], ["nologin", "No login yet"]].map(([value, label]) => (
                            <button
                              key={value}
                              id={`vh2o-admin-filter-${value}`}
                              type="button"
                              className="vh2o-chip"
                              aria-pressed={adminFilter === value}
                              onClick={() => setAdminFilter(value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="vh2o-admin-sort">
                          <label htmlFor="vh2o-admin-sort-select">Sort</label>
                          <select id="vh2o-admin-sort-select" value={adminSort} onChange={(e) => setAdminSort(e.target.value)}>
                            <option value="name">Name</option>
                            <option value="gallons">Gallons</option>
                          </select>
                          {canSearch && (
                            <span id="vh2o-admin-customer-count" style={{ marginLeft: "auto" }}>{shown.length} of {customers.length}</span>
                          )}
                        </div>
                        <div className="vh2o-admin-rows">
                          {!canSearch ? (
                            <p id="vh2o-admin-user-search-hint" className="vh2o-admin-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                              Type at least 3 characters of a name, email, or ID to look up a customer
                            </p>
                          ) : shown.length === 0 ? (
                            <p id="vh2o-admin-customer-empty" className="vh2o-admin-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                              No customers match. Try a different name or filter.
                            </p>
                          ) : shown.map((u) => {
                            const rowActive = isActiveCustomer(u);
                            return (
                              <div
                                key={u.id}
                                id={`vh2o-admin-customer-row-${u.id}`}
                                className="vh2o-admin-row"
                                aria-current={!isPhone && u.id === selectedCustomerId ? "true" : undefined}
                                {...buttonProps(() => {
                                  setSelectedCustomerId(u.id);
                                  setShowCustomerDetail(true);
                                })}
                              >
                                <span className="vh2o-admin-row-name">{u.name} <span className="vh2o-admin-muted">#{u.id}</span></span>
                                <span className="vh2o-admin-row-gallons">{u.gallons.toLocaleString()} gal</span>
                                <span className="vh2o-admin-row-email">{u.email || "No email yet"}</span>
                                <span className="vh2o-admin-row-meta">
                                  {WATER_TYPE_LABELS[u.waterType] || "No water type"}
                                  {" · "}
                                  <span className={`vh2o-status-pill ${u.authUserId ? (rowActive ? "is-active" : "is-inactive") : "is-nologin"}`}>
                                    {u.authUserId ? (rowActive ? "Active" : "Inactive") : "No login"}
                                  </span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );

                    const detail = selected ? (
                      <div id="vh2o-admin-customer-detail" className="vh2o-admin-detail-panel">
                        {isPhone && (
                          <button id="vh2o-admin-back-btn" type="button" className="vh2o-admin-back" onClick={() => setShowCustomerDetail(false)}>
                            <ChevronLeft size={ICON_SIZE.inline + 2} aria-hidden="true" /> All customers
                          </button>
                        )}
                        <AdminUserRow
                          key={selected.id}
                          user={selected}
                          onRequestAdjustment={requestAdjustment}
                          onViewHistory={openHistory}
                          onUpdateWaterType={handleUpdateWaterType}
                          onGenerateClaimCode={handleGenerateClaimCode}
                        />
                      </div>
                    ) : (
                      <p id="vh2o-admin-customer-detail-empty" className="vh2o-admin-detail-panel vh2o-admin-placeholder">
                        Select a customer to see their balance, adjust gallons, or view history.
                      </p>
                    );

                    return (
                      <div className="vh2o-admin-panels">
                        {showList && list}
                        {showDetail && detail}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Credit/debit confirmation sheet */}
          {pendingAdjustment && (
            <div
              id="vh2o-admin-confirm-overlay"
              style={{
                position: "absolute", inset: 0,
                background: "var(--vh2o-scrim)",
                display: "flex", alignItems: "flex-end",
                zIndex: 100,
              }}
              onClick={() => !isAdjusting && setPendingAdjustment(null)}
            >
              <div
                id="vh2o-admin-confirm-sheet"
                ref={confirmSheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Confirm gallon adjustment"
                style={{
                  width: "100%",
                  background: "var(--vh2o-sheet)",
                  borderTop: "1px solid var(--vh2o-border-strong)",
                  borderRadius: "20px 20px 0 0",
                  padding: "20px 16px 36px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-subtle)", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
                  Confirm {pendingAdjustment.amount > 0 ? "Bought Today" : "Filled Today"}
                </div>
                <div id="vh2o-admin-confirm-message" style={{ fontSize: 14, color: "var(--vh2o-text)", textAlign: "center", lineHeight: 1.6 }}>
                  <strong>{pendingAdjustment.user.name}</strong> {pendingAdjustment.amount > 0 ? "bought" : "filled"} <strong>{Math.abs(pendingAdjustment.amount)} gal</strong> today
                  <br />
                  New balance: {pendingAdjustment.user.gallons} → {Math.max(0, pendingAdjustment.user.gallons + pendingAdjustment.amount)}
                  {pendingAdjustment.note && (
                    <>
                      <br />
                      <span style={{ color: "var(--vh2o-text-muted)", fontSize: 12 }}>Note: {pendingAdjustment.note}</span>
                    </>
                  )}
                </div>
                {adjustmentError && (
                  <p id="vh2o-admin-confirm-error" style={{ color: "var(--vh2o-danger)", fontSize: 12, textAlign: "center" }}>{adjustmentError}</p>
                )}
                <button
                  id="vh2o-admin-confirm-submit"
                  onClick={confirmAdjustment}
                  disabled={isAdjusting}
                  style={{ ...styles.loginBtn, opacity: isAdjusting ? 0.6 : 1 }}
                >
                  {isAdjusting ? "Applying…" : "Confirm"}
                </button>
                <button
                  id="vh2o-admin-confirm-cancel"
                  onClick={() => setPendingAdjustment(null)}
                  disabled={isAdjusting}
                  style={{
                    padding: "12px",
                    background: "var(--vh2o-surface-subtle)",
                    border: "1px solid var(--vh2o-border)",
                    borderRadius: 14, color: "var(--vh2o-text-muted)",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Full transaction history sheet */}
          {historyUser && (
            <div
              id="vh2o-admin-history-overlay"
              style={{
                position: "absolute", inset: 0,
                background: "var(--vh2o-scrim)",
                display: "flex", alignItems: "flex-end",
                zIndex: 100,
              }}
              onClick={() => setHistoryUser(null)}
            >
              <div
                id="vh2o-admin-history-sheet"
                ref={historySheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Transaction history"
                style={{
                  width: "100%",
                  maxHeight: "70vh",
                  overflowY: "auto",
                  background: "var(--vh2o-sheet)",
                  borderTop: "1px solid var(--vh2o-border-strong)",
                  borderRadius: "20px 20px 0 0",
                  padding: "20px 16px 36px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div id="vh2o-admin-history-title" style={{ fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-subtle)", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
                  Full History — {historyUser.name}
                </div>
                {historyLoading && (
                  <p style={{ color: "var(--vh2o-text-subtle)", textAlign: "center" }}>Loading…</p>
                )}
                {historyError && (
                  <p style={{ color: "var(--vh2o-danger)", textAlign: "center" }}>{historyError}</p>
                )}
                {!historyLoading && !historyError && historyTransactions.length === 0 && (
                  <p id="vh2o-admin-history-empty" style={{ color: "var(--vh2o-text-subtle)", textAlign: "center" }}>No transactions yet</p>
                )}
                {!historyLoading && historyTransactions.map((tx) => (
                  <div id={`vh2o-admin-history-row-${tx.id}`} key={tx.id} style={styles.notificationCard}>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...styles.notificationTitle, color: tx.type === "credit" ? "var(--vh2o-accent-soft)" : "var(--vh2o-danger)" }}>
                        {tx.type === "credit"
                          ? <Plus size={ICON_SIZE.inline} aria-hidden="true" style={{ verticalAlign: "-2px" }} />
                          : <Minus size={ICON_SIZE.inline} aria-hidden="true" style={{ verticalAlign: "-2px" }} />}
                        {" "}{tx.type === "credit" ? "Bought" : "Filled"} {Math.abs(tx.amount)} gal
                      </div>
                      <div style={styles.notificationTime}>{tx.displayTime}</div>
                      <div style={styles.notificationDetails}>Balance: {tx.previousBalance} → {tx.newBalance}</div>
                      {tx.note && <div style={{ ...styles.notificationDetails, fontStyle: "italic" }}>{tx.note}</div>}
                    </div>
                  </div>
                ))}
                <button
                  id="vh2o-admin-history-close-btn"
                  onClick={() => setHistoryUser(null)}
                  style={{
                    padding: "12px",
                    background: "var(--vh2o-surface-subtle)",
                    border: "1px solid var(--vh2o-border)",
                    borderRadius: 14, color: "var(--vh2o-text-muted)",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {activeTab === "menu" && (() => {
            // Desktop always shows a category (the first by default) beside the category list;
            // phone and tablet show the category grid until one is picked.
            const menuCategory = isDesktop ? (activeCategory ?? MENU_CATEGORIES[0].id) : activeCategory;
            const renderMenuItems = (cat) => (
              <div id="vh2o-menu-items" className="vh2o-menu-items">
                    {(() => {
                      // Per-item overrides: `flatPrice` opts an item out of the category's
                      // size tiers entirely (e.g. the snowcone ice-cream add-on); `customTiers`
                      // gives an item its own tier list instead of the category default (e.g.
                      // Protein Smoothie is priced differently than regular smoothies).
                      const tiersOf = (item) => item.flatPrice !== undefined
                        ? null
                        : (item.customTiers ?? CATEGORY_SIZE_TIERS[cat.id] ?? null);

                      // Group items that share identical pricing (same tiers, or same flat
                      // price/unit) so flavors that all cost the same -- e.g. every milkshake
                      // is $8.05/$10.12 by size -- show that pricing once instead of repeating
                      // it on every flavor row.
                      const priceKeyOf = (item) => {
                        const tiers = tiersOf(item);
                        if (tiers) return `tiers:${tiers.map((t) => `${t.key}:${t.price}`).join(",")}`;
                        return `flat:${item.flatPrice ?? item.price}:${item.unit ?? ""}`;
                      };
                      const groups = [];
                      const groupIndexByKey = new Map();
                      cat.items.forEach((item, i) => {
                        const key = priceKeyOf(item);
                        if (!groupIndexByKey.has(key)) {
                          groupIndexByKey.set(key, groups.length);
                          groups.push({ key, entries: [] });
                        }
                        groups[groupIndexByKey.get(key)].entries.push({ item, i });
                      });

                      const renderItemCard = (item, i) => {
                        const itemSlug = slugify(item.name);
                        const itemDomKey = `${menuCategory}-${itemSlug || i}`;
                        const itemTiers = tiersOf(item);
                        return (
                          <div
                            id={`vh2o-menu-item-card-${itemDomKey}`}
                            key={i}
                            style={{ ...styles.rewardCard, cursor: item.description ? "pointer" : "default" }}
                            {...(item.description ? {
                              ...buttonProps(() => setExpandedItem(expandedItem === `${menuCategory}-${i}` ? null : `${menuCategory}-${i}`)),
                              "aria-expanded": expandedItem === `${menuCategory}-${i}`,
                            } : {})}
                          >
                            <div aria-hidden="true" style={styles.rewardIcon}><CategoryIcon cat={cat} /></div>
                            <div style={styles.rewardInfo}>
                              <div id={`vh2o-menu-item-name-${itemDomKey}`} style={styles.rewardName}>{item.name}</div>
                              {!itemTiers && (
                                <div id={`vh2o-menu-item-price-${itemDomKey}`} style={styles.rewardDesc}>${(item.flatPrice ?? item.price).toFixed(2)} {item.unit}</div>
                              )}
                              {item.description && expandedItem === `${menuCategory}-${i}` && (
                                <div id={`vh2o-menu-item-description-${itemDomKey}`} style={{ ...styles.rewardDesc, fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                                  {item.description}
                                </div>
                              )}
                            </div>
                            {itemTiers && (
                              <div style={styles.sizeOptionsRow}>
                                {itemTiers.map((tier) => (
                                  <button
                                    id={`vh2o-menu-item-size-btn-${itemDomKey}-${tier.key}`}
                                    key={tier.key}
                                    type="button"
                                    style={styles.sizeOptionBtn}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Placeholder for future cart integration.
                                      console.log(`Selected ${tier.label} for ${item.name} at $${tier.price.toFixed(2)}`);
                                    }}
                                  >
                                    {tier.label} - ${tier.price.toFixed(2)}
                                  </button>
                                ))}
                              </div>
                            )}
                            {item.description && (
                              <div aria-hidden="true" style={{ color: "var(--vh2o-text-subtle)", marginLeft: "auto", display: "flex" }}>
                                {expandedItem === `${menuCategory}-${i}` ? <ChevronUp size={ICON_SIZE.inline + 2} /> : <ChevronDown size={ICON_SIZE.inline + 2} />}
                              </div>
                            )}
                          </div>
                        );
                      };

                      return groups.map((group, groupIdx) => {
                        // A price shared by only one item isn't "duplicate" -- keep its full
                        // card (name + price/size buttons) exactly as before.
                        if (group.entries.length === 1) {
                          const { item, i } = group.entries[0];
                          return renderItemCard(item, i);
                        }
                        const sampleItem = group.entries[0].item;
                        const sampleTiers = tiersOf(sampleItem);
                        return (
                          <div key={group.key} className="vh2o-menu-group" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div id={`vh2o-menu-group-pricing-${menuCategory}-${groupIdx}`} style={styles.groupPricingBar}>
                              {sampleTiers
                                ? sampleTiers.map((tier) => (
                                    <span key={tier.key} style={styles.groupPricingPill}>{tier.label} · ${tier.price.toFixed(2)}</span>
                                  ))
                                : (
                                    <span style={styles.groupPricingPill}>${(sampleItem.flatPrice ?? sampleItem.price).toFixed(2)} {sampleItem.unit}</span>
                                  )}
                            </div>
                            <div style={styles.flavorGrid}>
                              {group.entries.map(({ item, i }) => {
                                const itemSlug = slugify(item.name);
                                const itemDomKey = `${menuCategory}-${itemSlug || i}`;
                                return (
                                  <div id={`vh2o-menu-item-card-${itemDomKey}`} key={i} style={styles.flavorChip}>
                                    <span id={`vh2o-menu-item-name-${itemDomKey}`}>{item.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
              </div>
            );
            const intro = (
              <>
                  <div id="vh2o-menu-tagline" style={{ fontSize: 13, fontStyle: "italic", color: "var(--vh2o-accent-soft)", textAlign: "center", marginBottom: 4 }}>
                    Diligently Purified for an Impeccable Taste
                  </div>
                  <div id="vh2o-menu-welcome" style={{ fontSize: 12, color: "var(--vh2o-text-muted)", textAlign: "center", lineHeight: 1.6, marginBottom: 12 }}>
                    We are a family-owned and operated water purification and desserts shop! Come try
                    all of our purified waters: RO, Re-mineralized, and Alkaline!
                  </div>
              </>
            );

            if (isDesktop) {
              const cat = MENU_CATEGORIES.find((c) => c.id === menuCategory) || MENU_CATEGORIES[0];
              return (
                <div id="vh2o-menu-section" style={styles.rewardsList}>
                  {intro}
                  {/* The heading sits over the items only, so the category list lines up with the first item. */}
                  <div className="vh2o-menu-desk">
                    <div id="vh2o-menu-category-title" className="vh2o-menu-desk-title" style={styles.sectionTitle}>
                      <span aria-hidden="true"><CategoryIcon cat={cat} /></span> {cat.name}
                    </div>
                    <nav id="vh2o-menu-category-list" className="vh2o-menu-cat-list" aria-label="Menu categories">
                      {MENU_CATEGORIES.map((c) => (
                        <button
                          key={c.id}
                          id={`vh2o-menu-category-link-${c.id}`}
                          type="button"
                          className="vh2o-menu-cat-link"
                          aria-current={c.id === cat.id ? "true" : undefined}
                          onClick={() => { setActiveCategory(c.id); setExpandedItem(null); }}
                        >
                          <span aria-hidden="true" className="vh2o-menu-cat-emoji"><CategoryIcon cat={c} /></span>
                          <span className="vh2o-menu-cat-name">{c.name}</span>
                          <span className="vh2o-menu-cat-count">{c.items.length}</span>
                        </button>
                      ))}
                    </nav>
                    {renderMenuItems(cat)}
                  </div>
                </div>
              );
            }

            return (
              <div id="vh2o-menu-section" style={styles.rewardsList}>
                {menuCategory === null ? (
                  <>
                    {intro}
                    <div id="vh2o-menu-title" style={styles.sectionTitle}>Our Menu</div>
                    <div id="vh2o-menu-categories-grid" className="vh2o-menu-grid">
                    {MENU_CATEGORIES.map((cat) => (
                      <div
                        id={`vh2o-menu-category-card-${cat.id}`}
                        key={cat.id}
                        style={{
                          background: "var(--vh2o-surface)",
                          border: `1px solid ${cat.color}55`,
                          borderRadius: 16,
                          padding: "22px 14px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        {...buttonProps(() => { setActiveCategory(cat.id); setExpandedItem(null); })}
                      >
                        <div aria-hidden="true" style={{ fontSize: 38 }}><CategoryIcon cat={cat} /></div>
                        <div id={`vh2o-menu-category-name-${cat.id}`} style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)", textAlign: "center" }}>{cat.name}</div>
                        <div style={{ fontSize: 12, color: cat.color, fontWeight: 600 }}>{cat.items.length} items</div>
                      </div>
                    ))}
                    </div>
                  </>
                ) : (() => {
                  const cat = MENU_CATEGORIES.find((c) => c.id === menuCategory);
                  return (
                    <>
                    <button
                      id="vh2o-menu-back-btn"
                      onClick={() => { setActiveCategory(null); setExpandedItem(null); }}
                      style={{ background: "none", border: "none", color: "var(--vh2o-accent)", cursor: "pointer", fontSize: 14, padding: "4px 0", textAlign: "left", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit", fontWeight: 700 }}
                    >
                      <ChevronLeft size={ICON_SIZE.inline + 2} aria-hidden="true" /> Back to Menu
                    </button>
                      <div style={styles.sectionTitle}><span aria-hidden="true"><CategoryIcon cat={cat} /></span> {cat.name}</div>
                      {renderMenuItems(cat)}
                    </>
                  );
                })()}
              </div>
            );
          })()}

          {activeTab === "locations" && (
            <div id="vh2o-locations-section" style={styles.rewardsList}>
              <div id="vh2o-locations-title" style={styles.sectionTitle}>Store Location</div>

              <div id="vh2o-locations-cards" className="vh2o-location-cards">
              {/* Clickable address card */}
              <div
                id="vh2o-locations-address-card"
                style={{
                  ...styles.rewardCard,
                  flexDirection: "column",
                  alignItems: "center",
                  cursor: "pointer",
                  border: "1px solid rgba(56,189,248,0.3)",
                  gap: 6,
                }}
                {...buttonProps(() => setShowMapOptions(true))}
                aria-haspopup="dialog"
              >
                <MapPin size={ICON_SIZE.lg} color="#38bdf8" aria-hidden="true" />
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--vh2o-text)", textAlign: "center" }}>
                  Variety H2O + Ice Cream
                </div>
                <div style={{ fontSize: 12, color: "var(--vh2o-accent)", textAlign: "center", lineHeight: 1.6 }}>
                  6330 E Golf Links Rd #A138<br />
                  Tucson, AZ 85730
                </div>
                <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>
                  Tap to open in maps <ExternalLink size={ICON_SIZE.inline - 2} aria-hidden="true" style={{ verticalAlign: "-1px" }} />
                </div>
              </div>

              <div
                id="vh2o-locations-call-card"
                style={{
                  ...styles.rewardCard,
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  border: "1px solid rgba(52,211,153,0.3)",
                }}
                {...buttonProps(() => setShowCallOptions(true))}
                aria-haspopup="dialog"
              >
                <Phone size={ICON_SIZE.md} color="#34d399" aria-hidden="true" />
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)" }}>(520) 812-1532</div>
                <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Tap to call <ExternalLink size={ICON_SIZE.inline - 2} aria-hidden="true" style={{ verticalAlign: "-1px" }} /></div>
              </div>

              <div id="vh2o-locations-hours-card" style={{ ...styles.rewardCard, flexDirection: "column", alignItems: "center", gap: 4 }}>
                <Clock size={ICON_SIZE.md} color="#94a3b8" aria-hidden="true" />
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)" }}>Hours</div>
                <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", textAlign: "center", lineHeight: 1.6 }}>
                  Mon – Sat: 10am – 7pm<br />
                  Sun: 12pm – 5pm
                </div>
              </div>

              <a
                id="vh2o-locations-order-now-card"
                href="https://order.online/business/variety-h2o-ice-cream-461440"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...styles.rewardCard,
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  border: "1px solid rgba(251,146,60,0.3)",
                  textDecoration: "none",
                }}
              >
                <ShoppingCart size={ICON_SIZE.md} color="#fb923c" aria-hidden="true" />
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)" }}>Order Online</div>
                <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Opens order.online <ExternalLink size={ICON_SIZE.inline - 2} aria-hidden="true" style={{ verticalAlign: "-1px" }} /></div>
              </a>

              <a
                id="vh2o-locations-facebook-card"
                href="https://www.facebook.com/VarietyWaterPlusIceCream/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...styles.rewardCard,
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  border: "1px solid rgba(59,130,246,0.3)",
                  textDecoration: "none",
                }}
              >
                <ThumbsUp size={ICON_SIZE.md} color="#60a5fa" aria-hidden="true" />
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)" }}>Follow Us on Facebook</div>
                <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Opens Facebook <ExternalLink size={ICON_SIZE.inline - 2} aria-hidden="true" style={{ verticalAlign: "-1px" }} /></div>
              </a>
              </div>
            </div>
          )}

          {/* Map picker bottom sheet */}
          {showMapOptions && (
            <div
              id="vh2o-map-options-overlay"
              style={{
                position: "absolute", inset: 0,
                background: "var(--vh2o-scrim)",
                display: "flex", alignItems: "flex-end",
                zIndex: 100,
              }}
              onClick={() => setShowMapOptions(false)}
            >
              <div
                id="vh2o-map-options-sheet"
                ref={mapSheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Open the address in maps"
                style={{
                  width: "100%",
                  background: "var(--vh2o-sheet)",
                  borderTop: "1px solid var(--vh2o-border-strong)",
                  borderRadius: "20px 20px 0 0",
                  padding: "20px 16px 36px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-subtle)", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
                  Open Address In…
                </div>
                <a
                  id="vh2o-map-options-google-link"
                  href="https://maps.app.goo.gl/u6AER73Amus6L5me6"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid var(--vh2o-border-strong)",
                    borderRadius: 14, padding: "14px 16px",
                    textDecoration: "none", color: "var(--vh2o-text)",
                  }}
                  onClick={() => setShowMapOptions(false)}
                >
                  <MapIcon size={ICON_SIZE.lg} color="#38bdf8" aria-hidden="true" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Google Maps</div>
                    <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Open in browser or app</div>
                  </div>
                </a>
                <a
                  id="vh2o-map-options-apple-link"
                  href="https://maps.apple/p/zxEvbrjs8z53N7"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid var(--vh2o-border-strong)",
                    borderRadius: 14, padding: "14px 16px",
                    textDecoration: "none", color: "var(--vh2o-text)",
                  }}
                  onClick={() => setShowMapOptions(false)}
                >
                  <Navigation size={ICON_SIZE.lg} color="#38bdf8" aria-hidden="true" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Apple Maps</div>
                    <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Open in Maps app</div>
                  </div>
                </a>
                <button
                  id="vh2o-map-options-cancel-btn"
                  onClick={() => setShowMapOptions(false)}
                  style={{
                    marginTop: 4, padding: "12px",
                    background: "var(--vh2o-surface-subtle)",
                    border: "1px solid var(--vh2o-border)",
                    borderRadius: 14, color: "var(--vh2o-text-muted)",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Call bottom sheet */}
          {showCallOptions && (
            <div
              id="vh2o-call-options-overlay"
              style={{
                position: "absolute", inset: 0,
                background: "var(--vh2o-scrim)",
                display: "flex", alignItems: "flex-end",
                zIndex: 100,
              }}
              onClick={() => setShowCallOptions(false)}
            >
              <div
                id="vh2o-call-options-sheet"
                ref={callSheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Call the store"
                style={{
                  width: "100%",
                  background: "var(--vh2o-sheet)",
                  borderTop: "1px solid var(--vh2o-border-strong)",
                  borderRadius: "20px 20px 0 0",
                  padding: "20px 16px 36px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-subtle)", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
                  Contact Us
                </div>
                <a
                  id="vh2o-call-options-link"
                  href="tel:+15208121532"
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    background: "rgba(52,211,153,0.08)",
                    border: "1px solid rgba(52,211,153,0.25)",
                    borderRadius: 14, padding: "14px 16px",
                    textDecoration: "none", color: "var(--vh2o-text)",
                  }}
                  onClick={() => setShowCallOptions(false)}
                >
                  <Phone size={ICON_SIZE.lg} color="#34d399" aria-hidden="true" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Call (520) 812-1532</div>
                    <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Variety H2O + Ice Cream</div>
                  </div>
                </a>
                <button
                  id="vh2o-call-options-cancel-btn"
                  onClick={() => setShowCallOptions(false)}
                  style={{
                    marginTop: 4, padding: "12px",
                    background: "var(--vh2o-surface-subtle)",
                    border: "1px solid var(--vh2o-border)",
                    borderRadius: 14, color: "var(--vh2o-text-muted)",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div id="vh2o-settings-section" className="vh2o-settings" style={styles.rewardsList}>
              <div id="vh2o-settings-title" style={styles.sectionTitle}>Settings</div>
              {!currentUser && (
                <button id="vh2o-settings-login-btn" onClick={() => navigate("/login")} style={styles.loginBtn}>Login</button>
              )}
              {currentUser?.role === "admin" && (
                <>
                  <div style={styles.sectionTitle}>Register New User</div>
                  <form id="vh2o-settings-admin-register-form" onSubmit={handleAdminRegisterUser} style={{ marginTop: 10 }}>
                    <label htmlFor="vh2o-settings-admin-register-name" style={styles.fieldLabel}>Full name</label>
                    <input
                      id="vh2o-settings-admin-register-name"
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      style={styles.input}
                      required
                    />
                    <label htmlFor="vh2o-settings-admin-register-username" style={styles.fieldLabel}>Customer email</label>
                    <input
                      id="vh2o-settings-admin-register-username"
                      type="email"
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      style={styles.input}
                      autoComplete="email"
                      required
                    />
                    <label htmlFor="vh2o-settings-admin-register-password" style={styles.fieldLabel}>Password</label>
                    <input
                      id="vh2o-settings-admin-register-password"
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      style={styles.input}
                      required
                    />
                    <label htmlFor="vh2o-settings-admin-register-confirm-password" style={styles.fieldLabel}>Confirm password</label>
                    <input
                      id="vh2o-settings-admin-register-confirm-password"
                      type="password"
                      value={newUserConfirmPassword}
                      onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                      style={styles.input}
                      required
                    />
                    <button id="vh2o-settings-admin-register-submit" type="submit" style={styles.loginBtn}>Register User</button>
                    {newUserError && <p id="vh2o-settings-admin-register-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{newUserError}</p>}
                    {newUserSuccess && <p id="vh2o-settings-admin-register-success" style={{ color: "var(--vh2o-success)", marginTop: 10 }}>{newUserSuccess}</p>}
                  </form>
                </>
              )}
              {currentUser && biometricAvailable && (
                <div style={{ marginTop: 20 }}>
                  <div id="vh2o-settings-biometric-title" style={styles.sectionTitle}>{biometryLabel(biometryType)}</div>
                  <p style={{ color: "var(--vh2o-text-subtle)", marginBottom: 10 }}>
                    {biometricLockEnabled
                      ? `Your account is locked behind ${biometryLabel(biometryType)} every time the app opens.`
                      : `Skip unlocking manually -- use ${biometryLabel(biometryType)} instead.`}
                  </p>
                  <button id="vh2o-settings-biometric-toggle-btn" onClick={handleBiometricToggle} style={styles.loginBtn}>
                    {biometricLockEnabled ? `Turn off ${biometryLabel(biometryType)}` : `Turn on ${biometryLabel(biometryType)}`}
                  </button>
                  {biometricSettingsError && (
                    <p id="vh2o-settings-biometric-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{biometricSettingsError}</p>
                  )}
                </div>
              )}
              {currentUser && <button id="vh2o-settings-logout-btn" onClick={logout} style={styles.loginBtn}>Logout</button>}
              <PrivacyPolicyLink id="vh2o-settings-privacy-link" />
            </div>
          )}
        </div>

        {/* Bottom nav bar (phone and tablet; desktop uses the top bar) */}
        {!isDesktop && (
        <nav id="vh2o-bottom-nav" aria-label="Main" style={styles.bottomNav}>
          <div id="vh2o-bottom-nav-tracker" style={{ ...styles.navItem, ...(activeTab === "tracker" ? styles.navItemActive : {}) }} {...buttonProps(() => setActiveTab("tracker"))} aria-current={activeTab === "tracker" ? "page" : undefined}>
            <House size={ICON_SIZE.md} color={activeTab === "tracker" ? "var(--vh2o-accent)" : "var(--vh2o-text-subtle)"} aria-hidden="true" /><span style={{ ...styles.navLabel, ...(activeTab === "tracker" ? { color: "var(--vh2o-accent)" } : {}) }}>Home</span>
          </div>
          <div id="vh2o-bottom-nav-menu" style={{ ...styles.navItem, ...(activeTab === "menu" ? styles.navItemActive : {}) }} {...buttonProps(() => setActiveTab("menu"))} aria-current={activeTab === "menu" ? "page" : undefined}>
            <IceCreamCone size={ICON_SIZE.md} color={activeTab === "menu" ? "var(--vh2o-accent)" : "var(--vh2o-text-subtle)"} aria-hidden="true" /><span style={{ ...styles.navLabel, ...(activeTab === "menu" ? { color: "var(--vh2o-accent)" } : {}) }}>Menu</span>
          </div>
          <div id="vh2o-bottom-nav-locations" style={{ ...styles.navItem, ...(activeTab === "locations" ? styles.navItemActive : {}) }} {...buttonProps(() => setActiveTab("locations"))} aria-current={activeTab === "locations" ? "page" : undefined}>
            <MapPin size={ICON_SIZE.md} color={activeTab === "locations" ? "var(--vh2o-accent)" : "var(--vh2o-text-subtle)"} aria-hidden="true" /><span style={{ ...styles.navLabel, ...(activeTab === "locations" ? { color: "var(--vh2o-accent)" } : {}) }}>Location</span>
          </div>
          <div id="vh2o-bottom-nav-settings" style={{ ...styles.navItem, ...(activeTab === "settings" ? styles.navItemActive : {}) }} {...buttonProps(() => setActiveTab("settings"))} aria-current={activeTab === "settings" ? "page" : undefined}>
            <Settings size={ICON_SIZE.md} color={activeTab === "settings" ? "var(--vh2o-accent)" : "var(--vh2o-text-subtle)"} aria-hidden="true" /><span style={{ ...styles.navLabel, ...(activeTab === "settings" ? { color: "var(--vh2o-accent)" } : {}) }}>Settings</span>
          </div>
        </nav>
        )}
      </div>
    </div>
  );
}

// A signed-in login with no linked profile (see unlinkedAuthEmail) can only do one useful
// thing -- redeem a claim code -- so send it to /claim from any other route, including the
// /login page a Google sign-in returns to.
export function UnlinkedSessionRedirect() {
  const { unlinkedAuthEmail } = useUser();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (unlinkedAuthEmail && location.pathname !== "/claim") {
      navigate("/claim", { replace: true });
    }
  }, [unlinkedAuthEmail, location.pathname, navigate]);

  return null;
}

export default function RewardsApp() {
  const sizeClass = useSizeClass();
  useEffect(() => {
    document.documentElement.dataset.size = sizeClass;
  }, [sizeClass]);

  return (
    <UserProvider>
      <Router>
        <UnlinkedSessionRedirect />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/claim" element={<ClaimAccount />} />
          <Route path="/" element={<MainApp />} />
        </Routes>
      </Router>
    </UserProvider>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  // Size-dependent frame properties (width, height, padding, corners, shadow, safe-area insets)
  // live in the .vh2o-root/.vh2o-phone classes in src/index.css so they can change per screen size.
  root: {
    background: "var(--vh2o-page-gradient)",
    display: "flex",
    justifyContent: "center",
    fontFamily: "'Nunito', 'Poppins', sans-serif",
  },
  phone: {
    background: "var(--vh2o-bg)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  header: {
    position: "relative",
    background: "var(--vh2o-header-gradient)",
    padding: "0 0 0 0",
    overflow: "hidden",
  },
  headerBg: {
    position: "absolute", inset: 0,
    background: "radial-gradient(ellipse at 50% -20%,rgba(125,211,252,0.18) 0%,transparent 70%)",
  },
  headerContent: {
    position: "relative",
    padding: "48px 20px 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  storeName: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px",
    color: "#e0f2fe", marginBottom: 20,
    textShadow: "0 0 20px rgba(125,211,252,0.4)",
  },
  avatarRing: {
    position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
  },
  avatar: {
    width: 80, height: 80, borderRadius: "50%",
    background: "var(--vh2o-avatar-gradient)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 30, fontWeight: 900, color: "var(--vh2o-bg)", letterSpacing: "1px", boxShadow: "0 0 0 4px rgba(125,211,252,0.25), 0 8px 24px rgba(0,0,0,0.4)",
  },
  tierBadge: {
    marginTop: 8, padding: "3px 12px", borderRadius: 20,
    fontSize: 12, fontWeight: 800, color: "#fff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)", letterSpacing: "0.5px",
  },
  userName: {
    marginTop: 10, fontSize: 20, fontWeight: 800, color: "var(--vh2o-text)",
    letterSpacing: "-0.3px",
  },
  memberSince: {
    fontSize: 12, color: "var(--vh2o-accent-soft)", opacity: 0.7, marginBottom: 16,
  },
  pointsPill: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid var(--vh2o-border-accent)",
    borderRadius: 16, padding: "12px 32px",
    display: "flex", flexDirection: "column", alignItems: "center",
    backdropFilter: "blur(10px)", marginBottom: 20,
    margin: "0 16px 20px",
  },
  pointsNum: {
    fontSize: 38, fontWeight: 900, color: "var(--vh2o-accent-soft)",
    letterSpacing: "-1px", lineHeight: 1,
    textShadow: "0 0 30px rgba(125,211,252,0.5)",
  },
  pointsLabel: {
    fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-muted)",
    letterSpacing: "2px", marginTop: 2,
  },
  content: {
    flex: 1, overflowY: "auto",
    padding: "0 0 20px",
  },
  rewardsList: {
    padding: "16px 16px 0",
    display: "flex", flexDirection: "column", gap: 10,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-subtle)",
    letterSpacing: "1.5px", textTransform: "uppercase",
    marginBottom: 2,
  },
  rewardCard: {
    background: "var(--vh2o-surface)",
    border: "1px solid var(--vh2o-border)",
    borderRadius: 16, padding: "14px",
    display: "flex", alignItems: "center", gap: 12,
    transition: "all 0.2s",
  },
  rewardIcon: { fontSize: 30, width: 44, textAlign: "center" },
  rewardInfo: { flex: 1 },
  rewardName: { fontSize: 14, fontWeight: 700, color: "var(--vh2o-text)" },
  rewardDesc: { fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 },
  sizeOptionsRow: {
    marginLeft: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  sizeOptionBtn: {
    border: "1px solid rgba(56,189,248,0.35)",
    background: "rgba(56,189,248,0.12)",
    color: "var(--vh2o-accent-soft)",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  groupPricingBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: "10px 14px",
    background: "rgba(56,189,248,0.08)",
    border: "1px solid rgba(56,189,248,0.25)",
    borderRadius: 14,
  },
  groupPricingPill: {
    border: "1px solid rgba(56,189,248,0.35)",
    background: "rgba(56,189,248,0.12)",
    color: "var(--vh2o-accent-soft)",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  flavorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: 8,
  },
  flavorChip: {
    background: "var(--vh2o-surface)",
    border: "1px solid var(--vh2o-border)",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--vh2o-text)",
  },
  bottomNav: {
    display: "flex", background: "var(--vh2o-scrim)",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    backdropFilter: "blur(20px)",
    padding: "8px 0 20px",
  },
  navItem: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", gap: 2, cursor: "pointer",
    fontSize: 20,
  },
  navItemActive: {},
  navLabel: { fontSize: 12, fontWeight: 700, color: "var(--vh2o-text-subtle)", letterSpacing: "0.5px" },
  notificationCard: {
    background: "var(--vh2o-surface)",
    border: "1px solid var(--vh2o-border)",
    borderRadius: 16, padding: "14px",
    display: "flex", alignItems: "flex-start", gap: 12,
    transition: "all 0.2s",
    marginBottom: 10,
  },
  notificationIcon: {
    width: 44, height: 44, borderRadius: 12,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 20, flexShrink: 0,
  },
  notificationTitle: {
    fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)",
  },
  notificationBody: {
    fontSize: 12, fontWeight: 600, color: "var(--vh2o-accent-soft)",
    marginTop: 2,
  },
  notificationTime: {
    fontSize: 12, color: "var(--vh2o-text-subtle)",
    marginTop: 4,
  },
  notificationDetails: {
    fontSize: 12, color: "var(--vh2o-text-muted)",
    marginTop: 4,
  },
  fieldLabel: {
    display: "block", textAlign: "left", fontSize: 13, fontWeight: 700, color: "var(--vh2o-text-muted)",
    margin: "0 0 4px 2px",
  },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: 10,
    border: "1px solid var(--vh2o-border-accent)",
    borderRadius: 8,
    background: "var(--vh2o-surface)",
    color: "var(--vh2o-text)",
    fontSize: 16,
  },
  loginBtn: {
    width: "100%",
    padding: "12px",
    background: "var(--vh2o-cta)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  googleBtn: {
    width: "100%",
    padding: "12px",
    marginTop: 10,
    background: "#fff",
    border: "1px solid var(--vh2o-border-accent)",
    borderRadius: 8,
    color: "#1f2937",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
};

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; }

  .progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 1s cubic-bezier(0.34,1.56,0.64,1);
    box-shadow: 0 0 8px currentColor;
  }

  .stamp-filled {
    animation: stamp-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
  }

  @keyframes stamp-pop {
    from { transform: scale(0.5); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  .confetti-piece {
    position: absolute;
    width: 8px; height: 8px;
    border-radius: 2px;
    animation: confetti-fall 1.8s ease-in forwards;
    top: -10px;
  }

  @keyframes confetti-fall {
    0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }

  .toast-in {
    animation: toast-slide 0.4s cubic-bezier(0.34,1.56,0.64,1);
  }

  @keyframes toast-slide {
    from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
    to   { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
`;


import { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { LocalNotifications } from "@capacitor/local-notifications";
import { createEphemeralSupabaseClient, supabase } from "./lib/supabaseClient";
import img from './assets/Variety-H2O-+-Ice-Cream-Logo-Final.png';

// User Context
const UserContext = createContext();

// Notification Helper
async function sendNotification(title, body, userId) {
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: userId * 1000 + Date.now(),
          schedule: { at: new Date(Date.now() + 1000) }, // Send immediately
        },
      ],
    });
  } catch (err) {
    console.log("Notification error (may be normal on web):", err);
  }
}

const ACTIVE_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

function mapProfileToUser(profile) {
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
function isActiveCustomer(user) {
  if (user.gallons > 0) {
    return true;
  }
  if (!user.lastTransactionAt) {
    return false;
  }
  return Date.now() - new Date(user.lastTransactionAt).getTime() <= ACTIVE_WINDOW_MS;
}

const WATER_TYPE_LABELS = {
  purified: "Purified",
  remineralized: "Remineralized",
  alkaline: "Alkaline",
};

function mapTransactionToNotification(transaction, usersByProfileId) {
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

function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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

      const maxTransactionsPerUser = 5;
      const userTransactionCounts = {};
      const mappedNotifications = (transactions || [])
        .map((transaction) => mapTransactionToNotification(transaction, usersByProfileId))
        .filter(Boolean)
        .filter((notification) => {
          userTransactionCounts[notification.userId] = (userTransactionCounts[notification.userId] || 0) + 1;
          return userTransactionCounts[notification.userId] <= maxTransactionsPerUser;
        });

      setNotifications(mappedNotifications);

      let resolvedAuthUserId = authUserId;
      let authEmail = null;

      const { data: authData } = await supabase.auth.getUser();
      if (!resolvedAuthUserId) {
        resolvedAuthUserId = authData.user?.id || null;
      }
      authEmail = authData.user?.email?.toLowerCase() || null;

      if (!resolvedAuthUserId) {
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

  const logout = async () => {
    await supabase.auth.signOut();
    setIsPasswordRecovery(false);
    setCurrentUser(null);
  };

  const requestPasswordReset = async (email) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      return "Enter a valid email";
    }

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/login`,
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

    sendNotification(
      "Account Updated",
      `Your gallons balance changed by ${amount > 0 ? "+" : ""}${amount}. New balance: ${data.gallons} gallons`,
      userId,
    );

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
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

function useUser() {
  return useContext(UserContext);
}

// Login Component
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const {
    login,
    isPasswordRecovery,
    requestPasswordReset,
    completePasswordReset,
  } = useUser();
  const navigate = useNavigate();

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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError("");
    setResetStatus("");

    const result = await requestPasswordReset(resetEmail || email);
    if (result === true) {
      setResetStatus("Password reset email sent. Open the link, then return here to set a new password.");
      return;
    }

    setError(result || "Unable to send reset email");
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
    <div id="vh2o-login-root" style={styles.root}>
      <div id="vh2o-login-phone" style={styles.phone}>
        <div id="vh2o-login-content" style={{ padding: "40px 20px", textAlign: "center" }}>
          <div id="vh2o-login-store-name" style={styles.storeName}>
            <span style={{ fontSize: 22 }}>🧊</span>
            <span>Variety H2O + Ice Cream</span>
            <span style={{ fontSize: 22 }}>💧</span>
          </div>
          <form onSubmit={handleSubmit} style={{ marginTop: 40 }}>
            <input
              id="vh2o-login-username-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
              required
            />
            <input
              id="vh2o-login-password-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              autoComplete="current-password"
              required
            />
            <button id="vh2o-login-submit" type="submit" style={styles.loginBtn}>Login</button>
            <input
              id="vh2o-login-reset-email-input"
              type="email"
              placeholder="Reset email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
            />
            <button id="vh2o-login-reset-request-btn" type="button" onClick={handleForgotPassword} style={styles.loginBtn}>
              Forgot Password
            </button>
            {isPasswordRecovery && (
              <>
                <div id="vh2o-login-recovery-title" style={{ ...styles.sectionTitle, marginTop: 14 }}>Set New Password</div>
                <input
                  id="vh2o-login-recovery-password-input"
                  type="password"
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={styles.input}
                  autoComplete="new-password"
                  required
                />
                <input
                  id="vh2o-login-recovery-confirm-password-input"
                  type="password"
                  placeholder="Confirm New Password"
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
            {error && <p id="vh2o-login-error" style={{ color: "#f87171", marginTop: 10 }}>{error}</p>}
            {resetStatus && <p id="vh2o-login-reset-status" style={{ color: "#34d399", marginTop: 10 }}>{resetStatus}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

// Public self-serve page: a customer with a customer ID + one-time claim code (handed to
// them by staff) sets up their own login.
function ClaimAccount() {
  const [legacyId, setLegacyId] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const { claimProfile } = useUser();
  const navigate = useNavigate();

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
    <div id="vh2o-claim-root" style={styles.root}>
      <div id="vh2o-claim-phone" style={styles.phone}>
        <div id="vh2o-claim-content" style={{ padding: "40px 20px", textAlign: "center" }}>
          <div id="vh2o-claim-title" style={styles.storeName}>
            <span style={{ fontSize: 22 }}>🔑</span>
            <span>Set Up Your Account</span>
          </div>
          {success ? (
            <p id="vh2o-claim-success" style={{ color: "#34d399", marginTop: 20 }}>
              Account linked! Taking you to the app...
            </p>
          ) : (
            <form onSubmit={handleSubmit} style={{ marginTop: 30 }}>
              <input
                id="vh2o-claim-legacy-id-input"
                type="text"
                inputMode="numeric"
                placeholder="Customer ID"
                value={legacyId}
                onChange={(e) => setLegacyId(e.target.value)}
                style={styles.input}
                required
              />
              <input
                id="vh2o-claim-code-input"
                type="text"
                placeholder="Claim Code"
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value)}
                style={styles.input}
                required
              />
              {!hasSession && (
                <>
                  <input
                    id="vh2o-claim-email-input"
                    type="email"
                    placeholder="Your Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={styles.input}
                    autoComplete="email"
                    required
                  />
                  <input
                    id="vh2o-claim-password-input"
                    type="password"
                    placeholder="Create Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={styles.input}
                    autoComplete="new-password"
                    required
                  />
                  <input
                    id="vh2o-claim-confirm-password-input"
                    type="password"
                    placeholder="Confirm Password"
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
              {error && <p id="vh2o-claim-error" style={{ color: "#f87171", marginTop: 10 }}>{error}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Rewards App Component ─────────────────────────────────────────────────

const TIERS = [
  { name: "Splash", min: 0, max: 199, color: "#7dd3fc", icon: "💧" },
  { name: "Frost", min: 200, max: 499, color: "#38bdf8", icon: "❄️" },
  { name: "Glacier", min: 500, max: 999, color: "#0ea5e9", icon: "🧊" },
  { name: "Blizzard", min: 1000, max: Infinity, color: "#f472b6", icon: "🌀" },
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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getTier(pts) {
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

  return (
    <div id={`vh2o-admin-user-card-${user.id}`} style={{ ...styles.rewardCard, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={styles.rewardInfo}>
          <div id={`vh2o-admin-user-name-${user.id}`} style={styles.rewardName}>{user.id} - {user.name}</div>
          <div id={`vh2o-admin-user-gallons-${user.id}`} style={styles.rewardDesc}>
            Gallons: {user.gallons}{" "}
            <span
              id={`vh2o-admin-user-status-${user.id}`}
              style={{
                fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10, marginLeft: 6,
                background: active ? "rgba(52,211,153,0.15)" : "rgba(148,163,184,0.15)",
                color: active ? "#34d399" : "#94a3b8",
              }}
            >
              {active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <button
          id={`vh2o-admin-user-history-btn-${user.id}`}
          type="button"
          onClick={() => onViewHistory(user)}
          style={{
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(148,163,184,0.1)",
            color: "#94a3b8",
            borderRadius: 10, padding: "6px 10px",
            fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          History
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          id={`vh2o-admin-user-water-type-select-${user.id}`}
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
              style={{ fontSize: 14, fontWeight: 800, color: "#7dd3fc", textAlign: "center", padding: "8px", background: "rgba(56,189,248,0.1)", borderRadius: 8, letterSpacing: 1 }}
            >
              {generatedCode}
              <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginTop: 2, letterSpacing: 0 }}>
                Give this + their Customer ID ({user.id}) to the customer
              </div>
            </div>
          )}
          {codeError && (
            <p id={`vh2o-admin-user-claim-code-error-${user.id}`} style={{ color: "#f87171", fontSize: 11, textAlign: "center" }}>{codeError}</p>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id={`vh2o-admin-user-amount-input-${user.id}`}
          type="number"
          min="1"
          placeholder="Gallons"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ ...styles.input, width: 90, padding: "6px", marginBottom: 0 }}
        />
        <input
          id={`vh2o-admin-user-note-input-${user.id}`}
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ ...styles.input, flex: 1, padding: "6px", marginBottom: 0 }}
        />
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
            color: "#34d399",
            borderRadius: 10, padding: "8px",
            fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          + Credit
        </button>
        <button
          id={`vh2o-admin-user-debit-btn-${user.id}`}
          type="button"
          onClick={() => submit("debit")}
          style={{
            flex: 1,
            border: "1px solid rgba(248,113,113,0.4)",
            background: "rgba(248,113,113,0.12)",
            color: "#f87171",
            borderRadius: 10, padding: "8px",
            fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          − Debit
        </button>
      </div>
    </div>
  );
}

function MainApp() {
  const { currentUser, logout, adjustGallons, fetchUserHistory, updateWaterType, generateClaimCode, users, notifications, register, isLoading } = useUser();
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
  const [newUserName, setNewUserName] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState("");
  const [newUserError, setNewUserError] = useState("");
  const [newUserSuccess, setNewUserSuccess] = useState("");
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [showCallOptions, setShowCallOptions] = useState(false);
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

  return (
    <div id="vh2o-app-root" style={styles.root}>
      <style>{css}</style>

      {/* Phone wrapper */}
      <div id="vh2o-app-phone" style={styles.phone}>

        {/* Wavy header */}
        <div id="vh2o-app-header" style={styles.header}>
          <div style={styles.headerBg} />
          <div style={styles.headerContent}>
            <div style={styles.storeName}>
                <img id="vh2o-app-header-logo" src={img} alt="Store Logo" style={{ width: "100%" }}/>
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div id="vh2o-app-content" style={styles.content}>
            {currentUser && activeTab === "tracker" && (
            <>
              <div id="vh2o-tracker-avatar-ring" style={styles.avatarRing}>
                <div style={styles.avatar}>😊</div>
                <div style={{ ...styles.tierBadge, background: tier.color }}>
                  {tier.icon} {tier.name}
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
            </>
          )}
          {activeTab === "tracker" && (
            <div id="vh2o-tracker-section" style={styles.rewardsList}>
              {isLoading ? (
                <p style={{ color: "#64748b", textAlign: "center", marginTop: 20 }}>Loading…</p>
              ) : !currentUser ? (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={styles.sectionTitle}>Login Required</div>
                  <p style={{ color: "#64748b", marginBottom: 20 }}>
                    Please log in to access your gallons tracker and account management.
                  </p>
                  <button onClick={() => navigate("/login")} style={styles.loginBtn}>Login</button>
                </div>
              ) : currentUser.role !== 'admin' ? (
                <>
                  <div id="vh2o-tracker-history-title" style={styles.sectionTitle}>Transaction History</div>
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
                              {notif.type === "credit" ? "➕" : "➖"}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={styles.notificationTitle}>
                                Balance {notif.type === "credit" ? "Credited" : "Debited"}
                              </div>
                              <div id={`vh2o-tracker-notification-amount-${notif.id}`} style={styles.notificationBody}>
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
                    <p id="vh2o-tracker-history-empty" style={{ color: "#64748b", textAlign: "center", marginTop: 20 }}>
                      No transactions for your account yet
                    </p>
                  )}
                </>
              ) : (
                <div id="vh2o-admin-manage-users" style={{ marginTop: 20 }}>
                  <div id="vh2o-admin-manage-users-title" style={styles.sectionTitle}>Admin: Manage Users</div>
                  {(() => {
                    const customers = users.filter((u) => u.role === "user");
                    const activeCount = customers.filter(isActiveCustomer).length;
                    const pct = customers.length > 0 ? Math.round((activeCount / customers.length) * 100) : 0;
                    return (
                      <div id="vh2o-admin-active-summary" style={{ ...styles.rewardDesc, marginBottom: 10 }}>
                        {activeCount} active / {customers.length} total customers ({pct}%)
                      </div>
                    );
                  })()}
                  <input
                    id="vh2o-admin-user-search-input"
                    type="text"
                    placeholder="Search customers by name or ID (3+ characters)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ ...styles.input, marginBottom: 10 }}
                  />
                  {searchQuery.trim().length < 3 ? (
                    <p id="vh2o-admin-user-search-hint" style={{ color: "#64748b", textAlign: "center", marginTop: 20 }}>
                      Type at least 3 characters of a name or ID to look up a customer
                    </p>
                  ) : (
                    users.filter(u =>
                      u.role === "user" &&
                      (u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        u.id.toString().includes(searchQuery))
                    ).map(user => (
                      <AdminUserRow
                        key={user.id}
                        user={user}
                        onRequestAdjustment={requestAdjustment}
                        onViewHistory={openHistory}
                        onUpdateWaterType={handleUpdateWaterType}
                        onGenerateClaimCode={handleGenerateClaimCode}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Credit/debit confirmation sheet */}
          {pendingAdjustment && (
            <div
              id="vh2o-admin-confirm-overlay"
              style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.6)",
                display: "flex", alignItems: "flex-end",
                zIndex: 100,
              }}
              onClick={() => !isAdjusting && setPendingAdjustment(null)}
            >
              <div
                id="vh2o-admin-confirm-sheet"
                style={{
                  width: "100%",
                  background: "#1e293b",
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "20px 20px 0 0",
                  padding: "20px 16px 36px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
                  Confirm {pendingAdjustment.amount > 0 ? "Credit" : "Debit"}
                </div>
                <div id="vh2o-admin-confirm-message" style={{ fontSize: 14, color: "#f0f9ff", textAlign: "center", lineHeight: 1.6 }}>
                  {pendingAdjustment.amount > 0 ? "Credit" : "Debit"} <strong>{Math.abs(pendingAdjustment.amount)} gal</strong> {pendingAdjustment.amount > 0 ? "to" : "from"} <strong>{pendingAdjustment.user.name}</strong>
                  <br />
                  New balance: {pendingAdjustment.user.gallons} → {Math.max(0, pendingAdjustment.user.gallons + pendingAdjustment.amount)}
                  {pendingAdjustment.note && (
                    <>
                      <br />
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>Note: {pendingAdjustment.note}</span>
                    </>
                  )}
                </div>
                {adjustmentError && (
                  <p id="vh2o-admin-confirm-error" style={{ color: "#f87171", fontSize: 12, textAlign: "center" }}>{adjustmentError}</p>
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
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14, color: "#94a3b8",
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
                background: "rgba(0,0,0,0.6)",
                display: "flex", alignItems: "flex-end",
                zIndex: 100,
              }}
              onClick={() => setHistoryUser(null)}
            >
              <div
                id="vh2o-admin-history-sheet"
                style={{
                  width: "100%",
                  maxHeight: "70vh",
                  overflowY: "auto",
                  background: "#1e293b",
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "20px 20px 0 0",
                  padding: "20px 16px 36px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div id="vh2o-admin-history-title" style={{ fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
                  Full History — {historyUser.name}
                </div>
                {historyLoading && (
                  <p style={{ color: "#64748b", textAlign: "center" }}>Loading…</p>
                )}
                {historyError && (
                  <p style={{ color: "#f87171", textAlign: "center" }}>{historyError}</p>
                )}
                {!historyLoading && !historyError && historyTransactions.length === 0 && (
                  <p id="vh2o-admin-history-empty" style={{ color: "#64748b", textAlign: "center" }}>No transactions yet</p>
                )}
                {!historyLoading && historyTransactions.map((tx) => (
                  <div id={`vh2o-admin-history-row-${tx.id}`} key={tx.id} style={styles.notificationCard}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.notificationTitle}>
                        {tx.type === "credit" ? "➕ Credited" : "➖ Debited"} {Math.abs(tx.amount)} gal
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
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14, color: "#94a3b8",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {activeTab === "menu" && (
            <div id="vh2o-menu-section" style={styles.rewardsList}>
              {activeCategory === null ? (
                <>
                  <div id="vh2o-menu-tagline" style={{ fontSize: 13, fontStyle: "italic", color: "#7dd3fc", textAlign: "center", marginBottom: 4 }}>
                    Diligently Purified for an Impeccable Taste
                  </div>
                  <div id="vh2o-menu-welcome" style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", lineHeight: 1.6, marginBottom: 12 }}>
                    We are a family-owned and operated water purification and desserts shop! Come try
                    all of our purified waters: RO, Re-mineralized, and Alkaline!
                  </div>
                  <div id="vh2o-menu-title" style={styles.sectionTitle}>Our Menu</div>
                  <div id="vh2o-menu-categories-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {MENU_CATEGORIES.map((cat) => (
                      <div
                        id={`vh2o-menu-category-card-${cat.id}`}
                        key={cat.id}
                        style={{
                          background: "rgba(255,255,255,0.05)",
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
                        onClick={() => { setActiveCategory(cat.id); setExpandedItem(null); }}
                      >
                        <div style={{ fontSize: 38 }}>{cat.icon}</div>
                        <div id={`vh2o-menu-category-name-${cat.id}`} style={{ fontSize: 13, fontWeight: 700, color: "#f0f9ff", textAlign: "center" }}>{cat.name}</div>
                        <div style={{ fontSize: 10, color: cat.color, fontWeight: 600 }}>{cat.items.length} items</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (() => {
                const cat = MENU_CATEGORIES.find((c) => c.id === activeCategory);
                return (
                  <>
                    <button
                      id="vh2o-menu-back-btn"
                      onClick={() => { setActiveCategory(null); setExpandedItem(null); }}
                      style={{ background: "none", border: "none", color: "#38bdf8", cursor: "pointer", fontSize: 14, padding: "4px 0", textAlign: "left", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit", fontWeight: 700 }}
                    >
                      ← Back to Menu
                    </button>
                    <div style={styles.sectionTitle}>{cat.icon} {cat.name}</div>
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
                        const itemDomKey = `${activeCategory}-${itemSlug || i}`;
                        const itemTiers = tiersOf(item);
                        return (
                          <div
                            id={`vh2o-menu-item-card-${itemDomKey}`}
                            key={i}
                            style={{ ...styles.rewardCard, cursor: item.description ? "pointer" : "default" }}
                            onClick={() => item.description && setExpandedItem(expandedItem === `${activeCategory}-${i}` ? null : `${activeCategory}-${i}`)}
                          >
                            <div style={styles.rewardIcon}>{cat.icon}</div>
                            <div style={styles.rewardInfo}>
                              <div id={`vh2o-menu-item-name-${itemDomKey}`} style={styles.rewardName}>{item.name}</div>
                              {!itemTiers && (
                                <div id={`vh2o-menu-item-price-${itemDomKey}`} style={styles.rewardDesc}>${(item.flatPrice ?? item.price).toFixed(2)} {item.unit}</div>
                              )}
                              {item.description && expandedItem === `${activeCategory}-${i}` && (
                                <div id={`vh2o-menu-item-description-${itemDomKey}`} style={{ ...styles.rewardDesc, fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
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
                              <div style={{ fontSize: 12, color: "#64748b", marginLeft: "auto" }}>
                                {expandedItem === `${activeCategory}-${i}` ? "▲" : "▼"}
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
                          <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div id={`vh2o-menu-group-pricing-${activeCategory}-${groupIdx}`} style={styles.groupPricingBar}>
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
                                const itemDomKey = `${activeCategory}-${itemSlug || i}`;
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
                  </>
                );
              })()}
            </div>
          )}

          {activeTab === "locations" && (
            <div id="vh2o-locations-section" style={styles.rewardsList}>
              <div id="vh2o-locations-title" style={styles.sectionTitle}>Store Location</div>

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
                onClick={() => setShowMapOptions(true)}
              >
                <div style={{ fontSize: 32 }}>📍</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f9ff", textAlign: "center" }}>
                  Variety H2O + Ice Cream
                </div>
                <div style={{ fontSize: 12, color: "#38bdf8", textAlign: "center", lineHeight: 1.6 }}>
                  6330 E Golf Links Rd #A138<br />
                  Tucson, AZ 85730
                </div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                  Tap to open in maps ↗
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
                onClick={() => setShowCallOptions(true)}
              >
                <div style={{ fontSize: 24 }}>📞</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f9ff" }}>(520) 812-1532</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>Tap to call ↗</div>
              </div>

              <div id="vh2o-locations-hours-card" style={{ ...styles.rewardCard, flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 24 }}>🕐</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f9ff" }}>Hours</div>
                <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", lineHeight: 1.6 }}>
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
                <div style={{ fontSize: 24 }}>🛒</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f9ff" }}>Order Online</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>Opens order.online ↗</div>
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
                <div style={{ fontSize: 24 }}>👍</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f9ff" }}>Follow Us on Facebook</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>Opens Facebook ↗</div>
              </a>
            </div>
          )}

          {/* Map picker bottom sheet */}
          {showMapOptions && (
            <div
              id="vh2o-map-options-overlay"
              style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.6)",
                display: "flex", alignItems: "flex-end",
                zIndex: 100,
              }}
              onClick={() => setShowMapOptions(false)}
            >
              <div
                id="vh2o-map-options-sheet"
                style={{
                  width: "100%",
                  background: "#1e293b",
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "20px 20px 0 0",
                  padding: "20px 16px 36px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
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
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 14, padding: "14px 16px",
                    textDecoration: "none", color: "#f0f9ff",
                  }}
                  onClick={() => setShowMapOptions(false)}
                >
                  <span style={{ fontSize: 28 }}>🗺️</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Google Maps</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Open in browser or app</div>
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
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 14, padding: "14px 16px",
                    textDecoration: "none", color: "#f0f9ff",
                  }}
                  onClick={() => setShowMapOptions(false)}
                >
                  <span style={{ fontSize: 28 }}>🍎</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Apple Maps</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Open in Maps app</div>
                  </div>
                </a>
                <button
                  id="vh2o-map-options-cancel-btn"
                  onClick={() => setShowMapOptions(false)}
                  style={{
                    marginTop: 4, padding: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14, color: "#94a3b8",
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
                background: "rgba(0,0,0,0.6)",
                display: "flex", alignItems: "flex-end",
                zIndex: 100,
              }}
              onClick={() => setShowCallOptions(false)}
            >
              <div
                id="vh2o-call-options-sheet"
                style={{
                  width: "100%",
                  background: "#1e293b",
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "20px 20px 0 0",
                  padding: "20px 16px 36px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
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
                    textDecoration: "none", color: "#f0f9ff",
                  }}
                  onClick={() => setShowCallOptions(false)}
                >
                  <span style={{ fontSize: 28 }}>📞</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Call (520) 812-1532</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Variety H2O + Ice Cream</div>
                  </div>
                </a>
                <button
                  id="vh2o-call-options-cancel-btn"
                  onClick={() => setShowCallOptions(false)}
                  style={{
                    marginTop: 4, padding: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14, color: "#94a3b8",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div id="vh2o-settings-section" style={styles.rewardsList}>
              <div id="vh2o-settings-title" style={styles.sectionTitle}>Settings</div>
              {!currentUser && (
                <button id="vh2o-settings-login-btn" onClick={() => navigate("/login")} style={styles.loginBtn}>Login</button>
              )}
              {currentUser?.role === "admin" && (
                <>
                  <div style={styles.sectionTitle}>Register New User</div>
                  <form id="vh2o-settings-admin-register-form" onSubmit={handleAdminRegisterUser} style={{ marginTop: 10 }}>
                    <input
                      id="vh2o-settings-admin-register-name"
                      type="text"
                      placeholder="Full Name"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      style={styles.input}
                      required
                    />
                    <input
                      id="vh2o-settings-admin-register-username"
                      type="email"
                      placeholder="User Email"
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      style={styles.input}
                      autoComplete="email"
                      required
                    />
                    <input
                      id="vh2o-settings-admin-register-password"
                      type="password"
                      placeholder="Password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      style={styles.input}
                      required
                    />
                    <input
                      id="vh2o-settings-admin-register-confirm-password"
                      type="password"
                      placeholder="Confirm Password"
                      value={newUserConfirmPassword}
                      onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                      style={styles.input}
                      required
                    />
                    <button id="vh2o-settings-admin-register-submit" type="submit" style={styles.loginBtn}>Register User</button>
                    {newUserError && <p id="vh2o-settings-admin-register-error" style={{ color: "#f87171", marginTop: 10 }}>{newUserError}</p>}
                    {newUserSuccess && <p id="vh2o-settings-admin-register-success" style={{ color: "#34d399", marginTop: 10 }}>{newUserSuccess}</p>}
                  </form>
                </>
              )}
              {currentUser && <button id="vh2o-settings-logout-btn" onClick={logout} style={styles.loginBtn}>Logout</button>}
            </div>
          )}
        </div>

        {/* Bottom nav bar */}
        <div id="vh2o-bottom-nav" style={styles.bottomNav}>
          <div id="vh2o-bottom-nav-tracker" style={{ ...styles.navItem, ...(activeTab === "tracker" ? styles.navItemActive : {}) }} onClick={() => setActiveTab("tracker")}>
            <span>🏠</span><span style={{ ...styles.navLabel, ...(activeTab === "tracker" ? { color: "#38bdf8" } : {}) }}>Home</span>
          </div>
          <div id="vh2o-bottom-nav-menu" style={{ ...styles.navItem, ...(activeTab === "menu" ? styles.navItemActive : {}) }} onClick={() => setActiveTab("menu")}>
            <span>🍦</span><span style={{ ...styles.navLabel, ...(activeTab === "menu" ? { color: "#38bdf8" } : {}) }}>Menu</span>
          </div>
          <div id="vh2o-bottom-nav-locations" style={{ ...styles.navItem, ...(activeTab === "locations" ? styles.navItemActive : {}) }} onClick={() => setActiveTab("locations")}>
            <span>📍</span><span style={{ ...styles.navLabel, ...(activeTab === "locations" ? { color: "#38bdf8" } : {}) }}>Location</span>
          </div>
          <div id="vh2o-bottom-nav-settings" style={{ ...styles.navItem, ...(activeTab === "settings" ? styles.navItemActive : {}) }} onClick={() => setActiveTab("settings")}>
            <span>⚙️</span><span style={{ ...styles.navLabel, ...(activeTab === "settings" ? { color: "#38bdf8" } : {}) }}>Settings</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RewardsApp() {
  return (
    <UserProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/claim" element={<ClaimAccount />} />
          <Route path="/" element={<MainApp />} />
        </Routes>
      </Router>
    </UserProvider>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(160deg,#0f172a 0%,#1e3a5f 50%,#0f172a 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Nunito', 'Poppins', sans-serif",
    padding: "20px 0",
  },
  phone: {
    width: "min(390px, 100vw)",
    minHeight: "844px",
    background: "#0f172a",
    borderRadius: "clamp(0px, 4vw, 40px)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
    position: "relative",
  },
  header: {
    position: "relative",
    background: "linear-gradient(160deg,#164e63 0%,#1e3a5f 60%,#0f172a 100%)",
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
    background: "linear-gradient(135deg,#38bdf8,#7dd3fc)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 36, boxShadow: "0 0 0 4px rgba(125,211,252,0.25), 0 8px 24px rgba(0,0,0,0.4)",
  },
  tierBadge: {
    marginTop: 8, padding: "3px 12px", borderRadius: 20,
    fontSize: 11, fontWeight: 800, color: "#fff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)", letterSpacing: "0.5px",
  },
  userName: {
    marginTop: 10, fontSize: 20, fontWeight: 800, color: "#f0f9ff",
    letterSpacing: "-0.3px",
  },
  memberSince: {
    fontSize: 11, color: "#7dd3fc", opacity: 0.7, marginBottom: 16,
  },
  pointsPill: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(125,211,252,0.25)",
    borderRadius: 16, padding: "12px 32px",
    display: "flex", flexDirection: "column", alignItems: "center",
    backdropFilter: "blur(10px)", marginBottom: 20,
    margin: "0 16px 20px",
  },
  pointsNum: {
    fontSize: 38, fontWeight: 900, color: "#7dd3fc",
    letterSpacing: "-1px", lineHeight: 1,
    textShadow: "0 0 30px rgba(125,211,252,0.5)",
  },
  pointsLabel: {
    fontSize: 10, fontWeight: 800, color: "#94a3b8",
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
    fontSize: 11, fontWeight: 800, color: "#64748b",
    letterSpacing: "1.5px", textTransform: "uppercase",
    marginBottom: 2,
  },
  rewardCard: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16, padding: "14px",
    display: "flex", alignItems: "center", gap: 12,
    transition: "all 0.2s",
  },
  rewardIcon: { fontSize: 30, width: 44, textAlign: "center" },
  rewardInfo: { flex: 1 },
  rewardName: { fontSize: 14, fontWeight: 700, color: "#f0f9ff" },
  rewardDesc: { fontSize: 11, color: "#64748b", marginTop: 2 },
  sizeOptionsRow: {
    marginLeft: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  sizeOptionBtn: {
    border: "1px solid rgba(56,189,248,0.35)",
    background: "rgba(56,189,248,0.12)",
    color: "#7dd3fc",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 11,
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
    color: "#7dd3fc",
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
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "#f0f9ff",
  },
  bottomNav: {
    display: "flex", background: "rgba(0,0,0,0.6)",
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
  navLabel: { fontSize: 9, fontWeight: 700, color: "#475569", letterSpacing: "0.5px" },
  notificationCard: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
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
    fontSize: 13, fontWeight: 700, color: "#f0f9ff",
  },
  notificationBody: {
    fontSize: 12, fontWeight: 600, color: "#7dd3fc",
    marginTop: 2,
  },
  notificationTime: {
    fontSize: 10, color: "#64748b",
    marginTop: 4,
  },
  notificationDetails: {
    fontSize: 11, color: "#94a3b8",
    marginTop: 4,
  },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: 10,
    border: "1px solid rgba(125,211,252,0.25)",
    borderRadius: 8,
    background: "rgba(255,255,255,0.05)",
    color: "#f0f9ff",
    fontSize: 16,
    outline: "none",
  },
  loginBtn: {
    width: "100%",
    padding: "12px",
    background: "linear-gradient(135deg,#f472b6,#fb923c)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
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


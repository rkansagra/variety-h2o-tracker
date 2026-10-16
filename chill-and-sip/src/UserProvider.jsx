import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { BiometricAuth, BiometryType } from "@aparajita/capacitor-biometric-auth";
import { createEphemeralSupabaseClient, supabase } from "./lib/supabaseClient";
import { authRedirectUrl } from "./lib/urls";
import { capNotificationsPerUser, mapProfileToUser, mapTransactionToNotification } from "./lib/customers";
import { biometricLockStorageKey, biometryLabel } from "./lib/biometrics";
import { UserContext } from "./userContext";

// Owns auth/session state, the customer/profile list, and transaction notifications, and
// exposes every action that talks to Supabase. Components read it with useUser().

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
        .select("id, auth_user_id, email, role, gallons, name, member_since, legacy_id, water_type, claim_code, last_transaction_at, anonymized_at")
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

  // Honors an account-deletion request (/delete-account/). The admin_anonymize_customer()
  // RPC clears the customer's personal details, deletes their login, and forfeits any balance,
  // but keeps the row and its transactions, which are kept for 3 years.
  const anonymizeCustomer = async (profileId) => {
    const { error } = await supabase.rpc("admin_anonymize_customer", {
      target_profile_id: profileId,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    await refreshFromSupabase(currentUser?.authUserId || null);
    return { ok: true };
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

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: authRedirectUrl(),
        },
      });

      if (signUpError) {
        return signUpError.message;
      }

      // With email confirmation on, signUp() returns no session, so claim_profile() would run
      // signed out and fail with "permission denied". The confirmation link signs them in and
      // UnlinkedSessionRedirect brings them back here, where the existing-session path claims.
      if (!signUpData?.session) {
        return `Almost done: we sent a confirmation link to ${normalizedEmail}. Open it on this device, then enter your customer ID and claim code again.`;
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
        anonymizeCustomer,
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

import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { BiometricAuth, BiometryType } from "@aparajita/capacitor-biometric-auth";
import { supabase } from "./lib/supabaseClient";
import { authRedirectUrl } from "./lib/urls";
import { capNotificationsPerUser, mapCustomerRow, mapProfileToUser, mapTransactionToNotification } from "./lib/customers";
import { biometricLockStorageKey, biometryLabel } from "./lib/biometrics";
import { UserContext } from "./userContext";

// Admin customer panel (module-level: no state, so their identity is stable for effects that
// depend on them). The database matches, filters, and sorts (admin_search_customers()),
// so only the matching customers reach the browser. Returns the rows and the total match count
// (which can exceed the rows returned).
const searchCustomers = async ({ query, filter = "all", sort = "name" }) => {
  const { data, error } = await supabase.rpc("admin_search_customers", {
    p_query: query,
    p_filter: filter,
    p_sort: sort,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const rows = data || [];
  return { ok: true, customers: rows.map(mapCustomerRow), totalMatches: Number(rows[0]?.total_matches ?? 0) };
};

// One customer for the details panel, by customer number.
const getCustomer = async (customerId) => {
  const { data, error } = await supabase.rpc("admin_get_customer", { p_legacy_id: customerId });

  if (error) {
    return { ok: false, message: error.message };
  }

  const row = (data || [])[0];
  return row ? { ok: true, customer: mapCustomerRow(row) } : { ok: false, message: "Customer not found" };
};

// The "X active / Y total customers" line.
const fetchCustomerSummary = async () => {
  const { data, error } = await supabase.rpc("admin_customer_summary");

  if (error) {
    return { ok: false, message: error.message };
  }

  const row = (data || [])[0] || {};
  return { ok: true, total: Number(row.total_customers ?? 0), active: Number(row.active_customers ?? 0) };
};

// Owns auth/session state, the signed-in user's own profile and recent transactions, and exposes
// every action that talks to Supabase (including the admin's customer search). Components read
// it with useUser().

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [notifications, setNotifications] = useState([]);
  // True when the signed-in user's recent history couldn't be loaded. Sign-in still succeeds:
  // the profile (and balance) loaded, so the app shows it and says the history is unavailable.
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Email of a signed-in login that no customer record matches (link_my_profile() found
  // nothing). The session is kept so "check again" works once staff save the email, and
  // UnlinkedSessionRedirect sends them to /no-account, which asks them to see staff.
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
    // One pass; after link_my_profile() links a record it runs once more (linkAttempted) to load
    // that record and its history.
    const sync = async (linkAttempted) => {
      try {
        // Signed out: RLS would refuse the reads below (a 401 in the console on every visit), so
        // just clear what a previous user left behind.
        if (!authUserId) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
            setNotifications([]);
            setUnlinkedAuthEmail(null);
            setCurrentUser(null);
            return true;
          }
        }

        let resolvedAuthUserId = authUserId;
        const { data: authData } = await supabase.auth.getUser();
        if (!resolvedAuthUserId) {
          resolvedAuthUserId = authData.user?.id || null;
        }
        const authEmail = authData.user?.email?.toLowerCase() || null;

        if (!resolvedAuthUserId) {
          setNotifications([]);
          setUnlinkedAuthEmail(null);
          setCurrentUser(null);
          return true;
        }

        // Only the signed-in user's own record. (The admin's customer list comes from
        // searchCustomers(), so no browser ever holds every customer.)
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, auth_user_id, email, role, gallons, name, member_since, legacy_id, water_type, last_transaction_at, anonymized_at")
          .eq("auth_user_id", resolvedAuthUserId);

        if (profilesError) {
          throw profilesError;
        }

        const matchedUser = (profiles || []).map(mapProfileToUser)
          .find((user) => user.authUserId === resolvedAuthUserId) || null;

        if (!matchedUser && !linkAttempted) {
          // First sign-in (emailed code or Google): the database links this login to the customer
          // record staff saved its email on, if the email is confirmed and the login has no
          // password. The browser never picks the record. Reload once to pick up the link.
          const { data: linked, error: linkError } = await supabase.rpc("link_my_profile");
          if (linkError) {
            throw linkError;
          }
          if (linked?.id) {
            return sync(true);
          }
        }

        if (!matchedUser) {
          // Signed in, but no customer record has this email. Keep the session and flag it so
          // UnlinkedSessionRedirect shows /no-account ("ask us at the counter") instead of a
          // blank signed-out app.
          setNotifications([]);
          setUnlinkedAuthEmail(authEmail || "your account");
          setCurrentUser(null);
          return true;
        }

        // Their 5 most recent ledger entries (the Home tab's history).
        const { data: transactions, error: transactionsError } = await supabase
          .from("gallon_transactions")
          .select("id, user_profile_id, amount, previous_balance, new_balance, note, created_at, kind, corrects_transaction_id")
          .eq("user_profile_id", matchedUser.profileId)
          .order("created_at", { ascending: false })
          .limit(5);

        // A failed history read mustn't sign the user out of their own account (it did, briefly,
        // when the app asked for columns a database migration hadn't added yet).
        if (transactionsError) {
          console.warn("Couldn't load recent history:", transactionsError);
          setNotifications([]);
          setHistoryUnavailable(true);
        } else {
          setHistoryUnavailable(false);
          setNotifications(capNotificationsPerUser(
          (transactions || [])
              .map((transaction) => mapTransactionToNotification(transaction, { [matchedUser.profileId]: matchedUser }))
              .filter(Boolean)
          ));
        }

        setUnlinkedAuthEmail(null);
        setCurrentUser(matchedUser);
        return true;
      } catch (err) {
        console.warn("Supabase sync failed, keeping local cache:", err);
        return false;
      }
    };
    return sync(false);
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

  // Staff sign-in (email + password). Customers use
  // sendSignInCode()/verifySignInCode(); a password login is never auto-linked to a record.
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

  // Customer sign-in, step 1: email a 6-digit code. shouldCreateUser is on because a customer's
  // first sign-in creates their login; link_my_profile() then decides whether it gets a record.
  const sendSignInCode = async (email) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      return "Enter a valid email";
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true },
    });
    return error ? error.message : true;
  };

  // Customer sign-in, step 2: check the code. Success signs them in; refreshFromSupabase() links
  // the record (or flags unlinkedAuthEmail for the "see staff" screen).
  const verifySignInCode = async (email, code) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const token = String(code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) {
      return "Enter the 6-digit code from the email";
    }

    const { data, error } = await supabase.auth.verifyOtp({ email: normalizedEmail, token, type: "email" });
    if (error) {
      return error.message;
    }

    await refreshFromSupabase(data.user?.id || null);
    return true;
  };

  // "Check again" on the no-account screen, after staff saved this login's email on a record.
  // Returns whether the login is now linked.
  const recheckAccount = async () => {
    const { data: linked, error } = await supabase.rpc("link_my_profile");
    if (error || !linked?.id) {
      return false;
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
  const adjustGallons = async (profileId, amount, note = "") => {
    const { data, error } = await supabase.rpc("admin_adjust_gallons", {
      target_profile_id: profileId,
      delta: amount,
      note: note || null,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, newBalance: data.gallons };
  };

  const fetchUserHistory = async (profileId) => {
    const { data, error } = await supabase
      .from("gallon_transactions")
      .select("id, amount, previous_balance, new_balance, note, created_at, kind, corrects_transaction_id")
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
        kind: transaction.kind || null,
        correctsTransactionId: transaction.corrects_transaction_id ?? null,
      })),
    };
  };

  // Admin: reverses one mistaken purchase or fill. admin_correct_transaction() writes a linked
  // 'correction' entry with the note, adjusts the balance, and refuses to go below zero or to
  // correct an entry twice.
  const correctTransaction = async (transactionId, note) => {
    const { error } = await supabase.rpc("admin_correct_transaction", {
      p_transaction_id: transactionId,
      p_note: note,
    });

    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  };

  // Admin: adds a customer record (name and email, both required). The database assigns the
  // customer number, and the customer can sign in with a code sent to that email right away.
  const addCustomer = async (name, email) => {
    const { data, error } = await supabase.rpc("admin_add_customer", {
      p_name: name,
      p_email: email,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, customerId: data.legacy_id };
  };

  // Admin: saves the email on a customer record with no login yet (e.g. an imported customer).
  // Signing in with a code sent to that email then links the customer's login to it.
  const setCustomerEmail = async (profileId, email) => {
    const { error } = await supabase.rpc("admin_set_customer_email", {
      target_profile_id: profileId,
      p_email: email,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
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

    return { ok: true };
  };

  // "Ask the ledger" (admin only): the admin-assistant Edge Function answers from read-only
  // database tools and reports each tool it called. `history` is earlier { question, answer }
  // turns, so follow-ups like "and last week?" work.
  const askAssistant = async (question, history = []) => {
    const { data, error } = await supabase.functions.invoke("admin-assistant", {
      body: { question, history },
    });

    if (error) {
      // An HTTP error from the function carries its JSON body ({ error }) in error.context.
      let message = "The assistant isn't available right now. Try again later.";
      try {
        const body = await error.context?.json();
        if (body?.error) message = body.error;
      } catch {
        // Not JSON (e.g. a network failure): keep the generic message.
      }
      return { ok: false, message };
    }

    return { ok: true, answer: data.answer, toolCalls: data.toolCalls || [] };
  };

  const updateWaterType = async (profileId, waterType) => {
    const { error } = await supabase
      .from("profiles")
      .update({ water_type: waterType })
      .eq("id", profileId);

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        login,
        loginWithGoogle,
        sendSignInCode,
        verifySignInCode,
        recheckAccount,
        logout,
        adjustGallons,
        fetchUserHistory,
        correctTransaction,
        setCustomerEmail,
        anonymizeCustomer,
        askAssistant,
        updateWaterType,
        notifications,
        historyUnavailable,
        addCustomer,
        searchCustomers,
        getCustomer,
        fetchCustomerSummary,
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

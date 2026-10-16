export const ACTIVE_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

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
    anonymizedAt: profile.anonymized_at || null,
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
// ("nologin" = no linked login yet, i.e. still needs a claim code -- not customers whose data
// was deleted); sort: "name" | "gallons".
export function filterCustomers(users, { query = "", filter = "all", sort = "name" } = {}) {
  const q = String(query).trim().toLowerCase();
  const matches = users.filter((u) => {
    if (u.role !== "user") return false;
    if (filter === "active" && !isActiveCustomer(u)) return false;
    if (filter === "inactive" && isActiveCustomer(u)) return false;
    if (filter === "nologin" && (u.authUserId || u.anonymizedAt)) return false;
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

export const WATER_TYPE_LABELS = {
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

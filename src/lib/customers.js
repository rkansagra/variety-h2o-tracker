// Also the "Ask the ledger" assistant's default for "inactive" (INACTIVE_DAYS in
// supabase/functions/admin-assistant/assistant.ts); keep the two in step.
export const ACTIVE_WINDOW_DAYS = 60;
export const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

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
    anonymizedAt: profile.anonymized_at || null,
  };
}

// A customer is active if they visited (any transaction) within the last 60 days -- visits
// only, so a balance alone doesn't count, and someone who never visited is inactive. Matches
// the assistant's definition. No stored/scheduled status — always derived fresh from the data.
export function isActiveCustomer(user) {
  if (!user.lastTransactionAt) {
    return false;
  }
  return Date.now() - new Date(user.lastTransactionAt).getTime() <= ACTIVE_WINDOW_MS;
}

// One row from admin_search_customers()/admin_get_customer() in the shape the admin panel reads.
// hasLogin stands in for the auth id, which these functions don't return.
export function mapCustomerRow(row) {
  return {
    id: row.legacy_id,
    profileId: row.id,
    name: row.name,
    email: row.email,
    gallons: row.gallons,
    waterType: row.water_type || null,
    hasLogin: Boolean(row.has_login),
    memberSince: row.member_since || "N/A",
    lastTransactionAt: row.last_transaction_at || null,
    anonymizedAt: row.anonymized_at || null,
  };
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

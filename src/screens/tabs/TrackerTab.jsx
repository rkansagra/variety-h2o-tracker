import { useNavigate } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import { useUser } from "../../userContext";
import { ICON_SIZE } from "../../lib/ui";
import { WATER_TYPE_LABELS, ledgerLabel } from "../../lib/customers";
import { styles } from "../../styles";

// "Filled 10 gallons", "Bought 100 gallons", "Correction +50 gallons".
function activityTitle(notif) {
  const size = Math.abs(notif.amount);
  const sign = notif.kind === "correction" ? (notif.amount > 0 ? "+" : "−") : "";
  return { label: ledgerLabel(notif.kind, notif.amount), amount: `${sign}${size} gallon${size === 1 ? "" : "s"}` };
}

// Home (`/`): a signed-in customer's balance and recent activity, or a sign-in prompt for someone
// who tapped Home while signed out. HomeRoute in MainApp sends the admin to Customers.
export default function TrackerTab() {
  const { currentUser, notifications, isLoading, historyUnavailable } = useUser();
  const navigate = useNavigate();
  const isCustomerHome = Boolean(currentUser && currentUser.role !== "admin");
  const history = isCustomerHome ? (notifications || []).filter((n) => n.userId === currentUser.id) : [];
  const firstName = (currentUser?.name || "").trim().split(/\s+/)[0];

  return (
    <div id="vh2o-tracker-home" className={isCustomerHome ? "vh2o-home" : undefined}>
      {isCustomerHome && (
      <div id="vh2o-tracker-profile" className="vh2o-home-profile">
        <div>
          <h1 id="vh2o-tracker-user-name" style={styles.pageTitle}>{firstName ? `Hi, ${firstName}` : "Hi there"}</h1>
          <p style={styles.pageSubtitle}>
            Customer #{currentUser.id}
            {currentUser.memberSince && (
              <span id="vh2o-tracker-member-since"> · member since {currentUser.memberSince}</span>
            )}
          </p>
        </div>
        <section id="vh2o-tracker-points-pill" aria-label="Balance" style={{ ...styles.card, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--vh2o-text-muted)" }}>Prepaid gallons left</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 52, lineHeight: "52px", fontWeight: 800, letterSpacing: "-1px", color: "var(--vh2o-text)", fontVariantNumeric: "tabular-nums" }}>
              {currentUser.gallons.toLocaleString()}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--vh2o-text-muted)" }}>gallons</span>
          </div>
          {currentUser.waterType && (
            <div>
              <span id="vh2o-tracker-water-type" style={styles.accentPill}>
                {WATER_TYPE_LABELS[currentUser.waterType] || currentUser.waterType} Water
              </span>
            </div>
          )}
        </section>
      </div>
      )}
      <div
        id="vh2o-tracker-section"
        className={isCustomerHome ? "vh2o-home-section" : undefined}
        style={isCustomerHome ? undefined : styles.rewardsList}
      >
        {isLoading ? (
          <p style={{ color: "var(--vh2o-text-subtle)", marginTop: 20 }}>Loading…</p>
        ) : !currentUser ? (
          <div id="vh2o-tracker-signed-out" style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8, maxWidth: 440 }}>
            <h1 style={styles.pageTitle}>Your gallons</h1>
            <p style={{ ...styles.pageSubtitle, fontSize: 15, lineHeight: "22px" }}>
              Sign in to see your prepaid balance and recent fills. Use the email we have on file
              for you; we&apos;ll send you a code.
            </p>
            <button id="vh2o-tracker-login-btn" type="button" onClick={() => navigate("/login")} style={styles.loginBtn}>
              Sign in
            </button>
            <button id="vh2o-tracker-browse-menu-btn" type="button" onClick={() => navigate("/menu")} style={styles.secondaryBtn}>
              Browse the menu
            </button>
          </div>
        ) : isCustomerHome ? (
          <>
            <h2 id="vh2o-tracker-history-title" style={styles.sectionTitle}>Recent activity</h2>
            <div id="vh2o-tracker-history" className="vh2o-home-history">
            {history.length > 0 ? (
              <div style={styles.listCard}>
                {history.map((notif, i) => {
                  const { label, amount } = activityTitle(notif);
                  const credit = notif.type === "credit";
                  return (
                    <div id={`vh2o-tracker-notification-card-${notif.id}`} key={notif.id}
                      style={{ ...styles.listRow, ...(i > 0 ? styles.listDivider : {}) }}>
                      <div id={`vh2o-tracker-notification-icon-${notif.id}`} aria-hidden="true" style={{
                        ...styles.notificationIcon,
                        background: credit ? "var(--vh2o-success-tint)" : "var(--vh2o-danger-tint)",
                        color: credit ? "var(--vh2o-success)" : "var(--vh2o-danger)",
                      }}>
                        {credit ? <Plus size={ICON_SIZE.inline + 2} /> : <Minus size={ICON_SIZE.inline + 2} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.notificationTitle}>
                          {label} <span id={`vh2o-tracker-notification-amount-${notif.id}`}>{amount}</span>
                        </div>
                        <div id={`vh2o-tracker-notification-time-${notif.id}`} style={styles.notificationTime}>
                          {notif.displayTime}
                        </div>
                        {notif.kind === "correction" && notif.note && (
                          <div id={`vh2o-tracker-notification-note-${notif.id}`} style={{ ...styles.notificationDetails, fontStyle: "italic" }}>
                            {notif.note}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text-muted)", whiteSpace: "nowrap" }}>
                        {notif.newBalance} left
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : historyUnavailable ? (
              <p id="vh2o-tracker-history-unavailable" style={{ color: "var(--vh2o-text-subtle)" }}>
                Your recent history couldn&apos;t be loaded right now. Your balance above is current.
              </p>
            ) : (
              <p id="vh2o-tracker-history-empty" style={{ color: "var(--vh2o-text-subtle)" }}>
                No activity on your account yet
              </p>
            )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import { useUser } from "../../userContext";
import { ICON_SIZE } from "../../lib/ui";
import { initialsFor } from "../../lib/format";
import { WATER_TYPE_LABELS } from "../../lib/customers";
import { getTier } from "../../lib/tiers";
import { styles } from "../../styles";
import AdminPanel from "../../admin/AdminPanel";

// Home tab: a customer's profile card and recent history, the admin's customer panel, or a
// prompt to log in.
export default function TrackerTab({ adminView, sizeClass }) {
  const { currentUser, notifications, isLoading } = useUser();
  const navigate = useNavigate();
  // A signed-in customer's Home tab (profile card + history), laid out per size class.
  const isCustomerHome = Boolean(currentUser && currentUser.role !== "admin");
  const tier = currentUser ? getTier(currentUser.gallons) : null;

  return (
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
          <AdminPanel view={adminView} sizeClass={sizeClass} />
        )}
      </div>
    </div>
  );
}

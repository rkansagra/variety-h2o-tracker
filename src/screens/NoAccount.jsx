import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Store } from "lucide-react";
import { ICON_SIZE } from "../lib/ui";
import { STORE_ADDRESS_LINES, STORE_HOURS, STORE_PHONE } from "../lib/store";
import { useUser } from "../userContext";
import { styles } from "../styles";
import PrivacyPolicyLink from "../components/PrivacyPolicyLink";

// Shown to someone signed in (emailed code or Google) whose email isn't on any customer record.
// Staff add the email at the counter; "Check again" then links the login (link_my_profile()).
export function NoAccount() {
  const { unlinkedAuthEmail, isLoading, recheckAccount, logout } = useUser();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [stillMissing, setStillMissing] = useState(false);
  // Signing out clears unlinkedAuthEmail; this keeps the redirect below from racing the
  // navigation to /login.
  const [leaving, setLeaving] = useState(false);

  const handleCheckAgain = async () => {
    setChecking(true);
    setStillMissing(false);
    const linked = await recheckAccount();
    setChecking(false);
    if (linked) {
      navigate("/", { replace: true });
      return;
    }
    setStillMissing(true);
  };

  const handleDifferentEmail = async () => {
    setLeaving(true);
    await logout();
    navigate("/login", { replace: true });
  };

  // Nothing to show once signed out or linked (e.g. reloading this page later).
  if (!isLoading && !unlinkedAuthEmail && !leaving) {
    return <Navigate to="/" replace />;
  }

  return (
    <div id="vh2o-no-account-root" className="vh2o-root vh2o-auth" style={styles.root}>
      <div id="vh2o-no-account-phone" className="vh2o-phone" style={styles.phone}>
        <div id="vh2o-no-account-content" style={{ padding: "40px 20px", textAlign: "center" }}>
          <div id="vh2o-no-account-title" style={styles.storeName}>
            <Store size={ICON_SIZE.md} aria-hidden="true" />
            <span>Almost there</span>
          </div>
          <p id="vh2o-no-account-message" style={{ color: "var(--vh2o-text-muted)", fontSize: 14, margin: "24px 0 16px" }}>
            We couldn&apos;t find a prepaid account for{" "}
            <strong style={{ color: "var(--vh2o-text)" }}>{unlinkedAuthEmail}</strong>. Next time you&apos;re in,
            ask us to add this email to your account, then tap Check again.
          </p>
          <div id="vh2o-no-account-store" style={{ ...styles.rewardCard, flexDirection: "column", gap: 4, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)" }}>Variety H2O + Ice Cream</div>
            <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", lineHeight: 1.6 }}>
              {STORE_ADDRESS_LINES.map((line) => <div key={line}>{line}</div>)}
              {STORE_HOURS.map(({ days, hours }) => <div key={days}>{days}: {hours}</div>)}
              <a href={STORE_PHONE.tel} style={{ color: "var(--vh2o-accent)" }}>{STORE_PHONE.display}</a>
            </div>
          </div>
          <button
            id="vh2o-no-account-check-again-btn"
            type="button"
            onClick={handleCheckAgain}
            disabled={checking}
            style={{ ...styles.loginBtn, opacity: checking ? 0.6 : 1 }}
          >
            {checking ? "Checking…" : "Check again"}
          </button>
          {stillMissing && (
            <p id="vh2o-no-account-still-missing" style={{ color: "var(--vh2o-text-subtle)", fontSize: 13, marginTop: 10 }}>
              Still no account with this email. Ask us at the counter to add it.
            </p>
          )}
          <p style={{ marginTop: 16, fontSize: 13 }}>
            <button
              id="vh2o-no-account-different-email-btn"
              type="button"
              onClick={handleDifferentEmail}
              style={{ background: "none", border: "none", color: "var(--vh2o-accent)", textDecoration: "underline", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
            >
              Use a different email
            </button>
          </p>
          <PrivacyPolicyLink id="vh2o-no-account-privacy-link" />
        </div>
      </div>
    </div>
  );
}

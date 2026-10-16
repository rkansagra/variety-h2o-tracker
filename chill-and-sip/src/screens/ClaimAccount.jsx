import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { ICON_SIZE } from "../lib/ui";
import { useUser } from "../userContext";
import { styles } from "../styles";
import PrivacyPolicyLink from "../components/PrivacyPolicyLink";

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

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { ICON_SIZE } from "../lib/ui";
import { useUser } from "../userContext";
import { styles } from "../styles";
import PrivacyPolicyLink from "../components/PrivacyPolicyLink";

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

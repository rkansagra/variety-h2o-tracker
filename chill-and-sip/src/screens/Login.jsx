import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useUser } from "../userContext";
import { styles } from "../styles";
import PrivacyPolicyLink from "../components/PrivacyPolicyLink";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const {
    currentUser,
    login,
    loginWithGoogle,
    isPasswordRecovery,
    completePasswordReset,
  } = useUser();
  const navigate = useNavigate();

  // Google sign-in and emailed confirmation links return here with a session already in place,
  // so once it resolves to a linked profile, go on to the app. (Unlinked logins are sent to
  // /claim by UnlinkedSessionRedirect.) A password-recovery session stays to set the new password.
  useEffect(() => {
    if (currentUser && !isPasswordRecovery) {
      navigate("/", { replace: true });
    }
  }, [currentUser, isPasswordRecovery, navigate]);

  const handleGoogleLogin = async () => {
    setError("");
    const result = await loginWithGoogle();
    if (result !== true) {
      setError(result || "Unable to start Google sign-in");
    }
    // On success the browser navigates to Google -- nothing else to do here.
  };

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
    <div id="vh2o-login-root" className="vh2o-root vh2o-auth" style={styles.root}>
      <div id="vh2o-login-phone" className="vh2o-phone" style={styles.phone}>
        <div id="vh2o-login-content" style={{ padding: "40px 20px", textAlign: "center" }}>
          <div id="vh2o-login-store-name" style={styles.storeName}>
            <span style={{ fontSize: 22 }}>🧊</span>
            <span>Variety H2O + Ice Cream</span>
            <span style={{ fontSize: 22 }}>💧</span>
          </div>
          <form onSubmit={handleSubmit} style={{ marginTop: 40 }}>
            <label htmlFor="vh2o-login-username-input" style={styles.fieldLabel}>Email</label>
            <input
              id="vh2o-login-username-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
              required
            />
            <label htmlFor="vh2o-login-password-input" style={styles.fieldLabel}>Password</label>
            <input
              id="vh2o-login-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              autoComplete="current-password"
              required
            />
            <button id="vh2o-login-submit" type="submit" style={styles.loginBtn}>Login</button>
            {/* Web only: Google refuses OAuth inside embedded webviews (the Capacitor native
                wrapper) with "Error 403: disallowed_useragent". Native Google sign-in would
                need a system-browser/deep-link flow instead. */}
            {!Capacitor.isNativePlatform() && (
              <button
                id="vh2o-login-google-btn"
                type="button"
                onClick={handleGoogleLogin}
                style={styles.googleBtn}
              >
                Continue with Google
              </button>
            )}
            {isPasswordRecovery && (
              <>
                <div id="vh2o-login-recovery-title" style={{ ...styles.sectionTitle, marginTop: 14 }}>Set New Password</div>
                <label htmlFor="vh2o-login-recovery-password-input" style={styles.fieldLabel}>New password</label>
                <input
                  id="vh2o-login-recovery-password-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={styles.input}
                  autoComplete="new-password"
                  required
                />
                <label htmlFor="vh2o-login-recovery-confirm-password-input" style={styles.fieldLabel}>Confirm new password</label>
                <input
                  id="vh2o-login-recovery-confirm-password-input"
                  type="password"
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
            {error && <p id="vh2o-login-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{error}</p>}
            {resetStatus && <p id="vh2o-login-reset-status" style={{ color: "var(--vh2o-success)", marginTop: 10 }}>{resetStatus}</p>}
          </form>
          {!isPasswordRecovery && (
            <p style={{ marginTop: 16, fontSize: 13 }}>
              {/* Carries whatever was typed in the email field over to the reset page. */}
              <Link id="vh2o-login-forgot-link" to="/forgot-password" state={{ email }} style={{ color: "var(--vh2o-accent)" }}>
                Forgot password?
              </Link>
            </p>
          )}
          <PrivacyPolicyLink id="vh2o-login-privacy-link" />
        </div>
      </div>
    </div>
  );
}

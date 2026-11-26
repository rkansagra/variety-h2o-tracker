import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useUser } from "../userContext";
import { styles } from "../styles";
import PrivacyPolicyLink from "../components/PrivacyPolicyLink";
import BrandLogo from "../components/BrandLogo";

const linkButtonStyle = styles.linkBtn;

// Customers sign in with an emailed 6-digit code (or Google on the web); staff use "Staff
// sign-in" (email + password). A password-reset link also lands
// here, in the staff form, to choose the new password.
export function Login() {
  const [mode, setMode] = useState("customer"); // "customer" | "staff"
  const [codeSentTo, setCodeSentTo] = useState(""); // email the code went to; "" = not sent yet
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [resetStatus, setResetStatus] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const {
    currentUser,
    login,
    loginWithGoogle,
    sendSignInCode,
    verifySignInCode,
    isPasswordRecovery,
    completePasswordReset,
  } = useUser();
  const navigate = useNavigate();
  const showStaff = mode === "staff" || isPasswordRecovery;

  // Google sign-in and emailed links return here with a session already in place, so once it
  // resolves to a linked profile, go on to the app. (Unlinked logins are sent to /no-account by
  // UnlinkedSessionRedirect.) A password-recovery session stays to set the new password.
  useEffect(() => {
    if (currentUser && !isPasswordRecovery) {
      navigate("/", { replace: true });
    }
  }, [currentUser, isPasswordRecovery, navigate]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
  };

  const handleGoogleLogin = async () => {
    setError("");
    const result = await loginWithGoogle();
    if (result !== true) {
      setError(result || "Unable to start Google sign-in");
    }
    // On success the browser navigates to Google -- nothing else to do here.
  };

  const handleSendCode = async (e) => {
    e?.preventDefault();
    setError("");
    setNotice("");
    setIsBusy(true);
    const result = await sendSignInCode(email);
    setIsBusy(false);
    if (result !== true) {
      setError(result || "Unable to send a code");
      return;
    }
    setCodeSentTo(email.trim().toLowerCase());
    setCode("");
  };

  const handleResendCode = async () => {
    setError("");
    setIsBusy(true);
    const result = await sendSignInCode(codeSentTo);
    setIsBusy(false);
    if (result !== true) {
      setError(result || "Unable to send a code");
      return;
    }
    setNotice("We sent a new code.");
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setIsBusy(true);
    const result = await verifySignInCode(codeSentTo, code);
    setIsBusy(false);
    if (result !== true) {
      setError(result || "That code didn't work");
    }
    // On success the effect above (or UnlinkedSessionRedirect) moves on.
  };

  const handleStaffSubmit = async (e) => {
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

  const messages = (
    <>
      {error && <p id="vh2o-login-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{error}</p>}
      {notice && <p id="vh2o-login-notice" style={{ color: "var(--vh2o-success)", marginTop: 10 }}>{notice}</p>}
      {resetStatus && <p id="vh2o-login-reset-status" style={{ color: "var(--vh2o-success)", marginTop: 10 }}>{resetStatus}</p>}
    </>
  );

  return (
    <div id="vh2o-login-root" className="vh2o-root vh2o-auth" style={styles.root}>
      <div id="vh2o-login-phone" className="vh2o-phone" style={styles.phone}>
        <div id="vh2o-login-content" style={{ padding: "48px 24px 32px" }}>
          <BrandLogo id="vh2o-login-store-name" className="vh2o-auth-logo" />

          {!showStaff && !codeSentTo && (
            <form id="vh2o-login-code-request-form" onSubmit={handleSendCode}>
              <h1 style={styles.pageTitle}>Sign in</h1>
              <p style={{ ...styles.pageSubtitle, fontSize: 15, margin: "6px 0 20px" }}>
                We&apos;ll email you a 6-digit code. No password to remember.
              </p>
              <label htmlFor="vh2o-login-email-input" style={styles.fieldLabel}>Email</label>
              <input
                id="vh2o-login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                autoComplete="email"
                required
              />
              <button id="vh2o-login-send-code-btn" type="submit" disabled={isBusy} style={{ ...styles.loginBtn, opacity: isBusy ? 0.6 : 1 }}>
                {isBusy ? "Sending…" : "Email me a sign-in code"}
              </button>
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
              {messages}
            </form>
          )}

          {!showStaff && codeSentTo && (
            <form id="vh2o-login-code-verify-form" onSubmit={handleVerifyCode}>
              <h1 style={styles.pageTitle}>Check your email</h1>
              <p id="vh2o-login-code-sent-to" style={{ ...styles.pageSubtitle, fontSize: 15, lineHeight: "22px", margin: "6px 0 20px" }}>
                We sent a 6-digit code to <strong style={{ color: "var(--vh2o-text)" }}>{codeSentTo}</strong>.
                It may take a minute; check your spam folder too.
              </p>
              <label htmlFor="vh2o-login-code-input" style={styles.fieldLabel}>Sign-in code</label>
              <input
                id="vh2o-login-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                style={{ ...styles.input, letterSpacing: 8, fontSize: 22, fontWeight: 700 }}
                required
              />
              <button id="vh2o-login-verify-code-btn" type="submit" disabled={isBusy} style={{ ...styles.loginBtn, opacity: isBusy ? 0.6 : 1 }}>
                {isBusy ? "Checking…" : "Sign in"}
              </button>
              {messages}
              <p style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 20 }}>
                <button id="vh2o-login-resend-code-btn" type="button" onClick={handleResendCode} disabled={isBusy} style={linkButtonStyle}>
                  Send a new code
                </button>
                <button id="vh2o-login-change-email-btn" type="button" onClick={() => { setCodeSentTo(""); setError(""); setNotice(""); }} style={linkButtonStyle}>
                  Use a different email
                </button>
              </p>
            </form>
          )}

          {showStaff && (
            <form id="vh2o-login-staff-form" onSubmit={handleStaffSubmit}>
              <h1 id="vh2o-login-staff-title" style={{ ...styles.pageTitle, marginBottom: 20 }}>Staff sign-in</h1>
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
              {isPasswordRecovery && (
                <>
                  <h2 id="vh2o-login-recovery-title" style={{ ...styles.sectionTitle, margin: "20px 0 12px" }}>Set a new password</h2>
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
              {messages}
            </form>
          )}

          {showStaff && !isPasswordRecovery && (
            <p style={{ marginTop: 16, fontSize: 15 }}>
              {/* Carries whatever was typed in the email field over to the reset page. */}
              <Link id="vh2o-login-forgot-link" to="/forgot-password" state={{ email }} style={{ color: "var(--vh2o-accent-soft)", fontWeight: 700 }}>
                Forgot password?
              </Link>
            </p>
          )}
          {!isPasswordRecovery && (
            <p style={{ marginTop: 24 }}>
              {showStaff ? (
                <button id="vh2o-login-customer-link" type="button" onClick={() => switchMode("customer")} style={linkButtonStyle}>
                  Customer sign-in
                </button>
              ) : (
                <button id="vh2o-login-staff-link" type="button" onClick={() => switchMode("staff")} style={linkButtonStyle}>
                  Staff sign-in
                </button>
              )}
            </p>
          )}
          <PrivacyPolicyLink id="vh2o-login-privacy-link" />
        </div>
      </div>
    </div>
  );
}

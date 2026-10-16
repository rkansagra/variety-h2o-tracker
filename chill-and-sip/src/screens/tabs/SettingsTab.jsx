import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../userContext";
import { biometryLabel } from "../../lib/biometrics";
import { styles } from "../../styles";
import PrivacyPolicyLink from "../../components/PrivacyPolicyLink";

// Settings tab: log in/out, the admin's register-a-customer form, and the biometric lock toggle.
export default function SettingsTab() {
  const {
    currentUser, logout, register,
    biometricAvailable, biometryType, biometricLockEnabled, enableBiometricLock, disableBiometricLock,
  } = useUser();
  const navigate = useNavigate();
  const [newUserName, setNewUserName] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState("");
  const [newUserError, setNewUserError] = useState("");
  const [newUserSuccess, setNewUserSuccess] = useState("");

  const handleAdminRegisterUser = async (e) => {
    e.preventDefault();
    setNewUserError("");
    setNewUserSuccess("");

    const result = await register(newUserName, newUserUsername, newUserPassword, newUserConfirmPassword);
    if (result === true) {
      setNewUserName("");
      setNewUserUsername("");
      setNewUserPassword("");
      setNewUserConfirmPassword("");
      setNewUserSuccess("Customer registered. They can log in now with the email and temporary password you set — give it to them in person.");
      return;
    }

    setNewUserError(result);
  };

  const [biometricSettingsError, setBiometricSettingsError] = useState("");

  const handleBiometricToggle = async () => {
    setBiometricSettingsError("");
    if (biometricLockEnabled) {
      disableBiometricLock();
      return;
    }
    const result = await enableBiometricLock();
    if (result !== true) {
      setBiometricSettingsError(result || "Unable to turn on biometric unlock");
    }
  };

  return (
    <div id="vh2o-settings-section" className="vh2o-settings" style={styles.rewardsList}>
      <div id="vh2o-settings-title" style={styles.sectionTitle}>Settings</div>
      {!currentUser && (
        <button id="vh2o-settings-login-btn" onClick={() => navigate("/login")} style={styles.loginBtn}>Login</button>
      )}
      {currentUser?.role === "admin" && (
        <>
          <div style={styles.sectionTitle}>Register New User</div>
          <form id="vh2o-settings-admin-register-form" onSubmit={handleAdminRegisterUser} style={{ marginTop: 10 }}>
            <label htmlFor="vh2o-settings-admin-register-name" style={styles.fieldLabel}>Full name</label>
            <input
              id="vh2o-settings-admin-register-name"
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              style={styles.input}
              required
            />
            <label htmlFor="vh2o-settings-admin-register-username" style={styles.fieldLabel}>Customer email</label>
            <input
              id="vh2o-settings-admin-register-username"
              type="email"
              value={newUserUsername}
              onChange={(e) => setNewUserUsername(e.target.value)}
              style={styles.input}
              autoComplete="email"
              required
            />
            <label htmlFor="vh2o-settings-admin-register-password" style={styles.fieldLabel}>Password</label>
            <input
              id="vh2o-settings-admin-register-password"
              type="password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              style={styles.input}
              required
            />
            <label htmlFor="vh2o-settings-admin-register-confirm-password" style={styles.fieldLabel}>Confirm password</label>
            <input
              id="vh2o-settings-admin-register-confirm-password"
              type="password"
              value={newUserConfirmPassword}
              onChange={(e) => setNewUserConfirmPassword(e.target.value)}
              style={styles.input}
              required
            />
            <button id="vh2o-settings-admin-register-submit" type="submit" style={styles.loginBtn}>Register User</button>
            {newUserError && <p id="vh2o-settings-admin-register-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{newUserError}</p>}
            {newUserSuccess && <p id="vh2o-settings-admin-register-success" style={{ color: "var(--vh2o-success)", marginTop: 10 }}>{newUserSuccess}</p>}
          </form>
        </>
      )}
      {currentUser && biometricAvailable && (
        <div style={{ marginTop: 20 }}>
          <div id="vh2o-settings-biometric-title" style={styles.sectionTitle}>{biometryLabel(biometryType)}</div>
          <p style={{ color: "var(--vh2o-text-subtle)", marginBottom: 10 }}>
            {biometricLockEnabled
              ? `Your account is locked behind ${biometryLabel(biometryType)} every time the app opens.`
              : `Skip unlocking manually -- use ${biometryLabel(biometryType)} instead.`}
          </p>
          <button id="vh2o-settings-biometric-toggle-btn" onClick={handleBiometricToggle} style={styles.loginBtn}>
            {biometricLockEnabled ? `Turn off ${biometryLabel(biometryType)}` : `Turn on ${biometryLabel(biometryType)}`}
          </button>
          {biometricSettingsError && (
            <p id="vh2o-settings-biometric-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{biometricSettingsError}</p>
          )}
        </div>
      )}
      {currentUser && <button id="vh2o-settings-logout-btn" onClick={logout} style={styles.loginBtn}>Logout</button>}
      <PrivacyPolicyLink id="vh2o-settings-privacy-link" />
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../userContext";
import { biometryLabel } from "../../lib/biometrics";
import { styles } from "../../styles";
import PrivacyPolicyLink from "../../components/PrivacyPolicyLink";

// Settings tab: log in/out and the biometric lock toggle. (Staff add customers from the customer
// panel on Home.)
export default function SettingsTab() {
  const {
    currentUser, logout,
    biometricAvailable, biometryType, biometricLockEnabled, enableBiometricLock, disableBiometricLock,
  } = useUser();
  const navigate = useNavigate();
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

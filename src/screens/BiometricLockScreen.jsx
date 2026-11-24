import { useState, useEffect } from "react";
import { Lock } from "lucide-react";
import { useUser } from "../userContext";
import { biometryLabel } from "../lib/biometrics";
import { ICON_SIZE } from "../lib/ui";
import { styles, css } from "../styles";

// Shown instead of the app whenever a signed-in user has biometric lock turned on and the app
// has just launched or come back to the foreground. Auto-prompts on mount so the OS Face
// ID/Touch ID/fingerprint dialog appears immediately instead of waiting for a tap.
export default function BiometricLockScreen() {
  const { biometryType, unlockWithBiometrics, logout } = useUser();
  const [error, setError] = useState("");

  const showUnlockResult = (result) => {
    if (result !== true) {
      setError(result || "Unable to verify biometrics");
    }
  };

  const attemptUnlock = async () => {
    setError("");
    showUnlockResult(await unlockWithBiometrics());
  };

  useEffect(() => {
    // Not attemptUnlock(): on mount there's no previous error to clear, and clearing it
    // synchronously here would be a pointless extra render.
    void unlockWithBiometrics().then(showUnlockResult);
    // Intentionally run once on mount only -- re-prompting after that is via the retry
    // button, not a dependency change, so unlockWithBiometrics' fresh identity each render
    // shouldn't re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div id="vh2o-biometric-lock-root" className="vh2o-root vh2o-auth" style={styles.root}>
      <style>{css}</style>
      <div id="vh2o-biometric-lock-phone" className="vh2o-phone" style={styles.phone}>
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={styles.storeName}>
            <Lock size={ICON_SIZE.md} aria-hidden="true" />
            <span>Variety H2O + Ice Cream</span>
          </div>
          <p id="vh2o-biometric-lock-message" style={{ color: "var(--vh2o-text-subtle)", margin: "30px 0" }}>
            Unlock with {biometryLabel(biometryType)} to continue.
          </p>
          <button id="vh2o-biometric-lock-unlock-btn" onClick={attemptUnlock} style={styles.loginBtn}>
            Unlock
          </button>
          {error && <p id="vh2o-biometric-lock-error" style={{ color: "var(--vh2o-danger)", marginTop: 10 }}>{error}</p>}
          <button
            id="vh2o-biometric-lock-logout-btn"
            onClick={logout}
            style={{ ...styles.loginBtn, marginTop: 12, background: "transparent", border: "1px solid var(--vh2o-border-accent)" }}
          >
            Log out instead
          </button>
        </div>
      </div>
    </div>
  );
}

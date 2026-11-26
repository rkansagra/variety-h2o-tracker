import { styles } from "../styles";
import BrandLogo from "./BrandLogo";

// What's left on screen if the app crashes (the error boundary in main.jsx catches it and, when
// error reporting is on, reports it), instead of a blank page.
export default function CrashScreen() {
  return (
    <div id="vh2o-crash" className="vh2o-root vh2o-auth" style={styles.root}>
      <div className="vh2o-phone" style={styles.phone}>
        <div style={{ padding: "48px 24px 32px" }}>
          <BrandLogo className="vh2o-auth-logo" />
          <h1 style={styles.pageTitle}>Something went wrong</h1>
          <p style={{ ...styles.pageSubtitle, fontSize: 15, lineHeight: "22px", margin: "6px 0 20px" }}>
            Sorry, the app hit a problem it couldn&apos;t recover from. Reloading usually fixes it.
            Your balance and history are safe.
          </p>
          <button id="vh2o-crash-reload-btn" type="button" style={styles.loginBtn} onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

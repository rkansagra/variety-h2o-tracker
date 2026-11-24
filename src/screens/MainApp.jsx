import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { House, IceCreamCone, MapPin, Settings } from "lucide-react";
import img from '../assets/Variety-H2O-+-Ice-Cream-Logo-Final.png';
import { useUser } from "../userContext";
import { ICON_SIZE, buttonProps, useSizeClass } from "../lib/ui";
import { initialsFor } from "../lib/format";
import { styles, css } from "../styles";
import BiometricLockScreen from "./BiometricLockScreen";
import TrackerTab from "./tabs/TrackerTab";
import MenuTab from "./tabs/MenuTab";
import LocationTab from "./tabs/LocationTab";
import SettingsTab from "./tabs/SettingsTab";

// The logo file's pixel size (1080px wide: the 360px-max banner at 3x).
const LOGO_WIDTH = 1080;
const LOGO_HEIGHT = 470;

// The signed-in (or browsing) app: logo banner or desktop top bar, the active tab, and the bottom
// tab bar. Tabs are state here, not routes.
export function MainApp() {
  const { currentUser, isBiometricLocked } = useUser();
  const [activeTab, setActiveTab] = useState("menu"); // Start with menu when logged out

  // Switch to Home on login, Menu on logout. Adjusted during render (not an effect) so a
  // data refresh that produces a new `currentUser` object for the *same* logged-in account
  // (e.g. after crediting a customer) doesn't yank the admin back to the tracker tab.
  const currentUserId = currentUser?.id ?? null;
  const [prevUserId, setPrevUserId] = useState(currentUserId);
  if (currentUserId !== prevUserId) {
    setPrevUserId(currentUserId);
    setActiveTab(currentUserId ? "tracker" : "menu");
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState("all");
  const [adminSort, setAdminSort] = useState("name");
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  // Phone only: the list and a customer's details are separate views.
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  // "Ask the ledger" conversation: [{ question, answer, toolCalls }].
  const [assistantTurns, setAssistantTurns] = useState([]);
  // Kept here rather than in AdminPanel so the admin's search, selection, and assistant
  // conversation survive switching tabs.
  const adminView = {
    searchQuery, setSearchQuery, adminFilter, setAdminFilter, adminSort, setAdminSort,
    selectedCustomerId, setSelectedCustomerId, showCustomerDetail, setShowCustomerDetail,
    assistantTurns, setAssistantTurns,
  };
  const sizeClass = useSizeClass();
  const isDesktop = sizeClass === "desktop";
  const navigate = useNavigate();

  if (currentUser && isBiometricLocked) {
    return <BiometricLockScreen />;
  }

  return (
    <div id="vh2o-app-root" className="vh2o-root" style={styles.root}>
      <style>{css}</style>

      {/* Phone wrapper */}
      <div id="vh2o-app-phone" className="vh2o-phone" style={styles.phone}>

        {isDesktop ? (
          // Desktop: a top bar replaces both the logo banner and the bottom tab bar.
          <header id="vh2o-top-nav" className="vh2o-topbar">
            <img id="vh2o-top-nav-logo" className="vh2o-topbar-logo" src={img} alt="Variety H2O + Ice Cream" width={LOGO_WIDTH} height={LOGO_HEIGHT} />
            <nav aria-label="Main" className="vh2o-topbar-tabs">
              {[
                ["tracker", House, "Home"],
                ["menu", IceCreamCone, "Menu"],
                ["locations", MapPin, "Location"],
                ["settings", Settings, "Settings"],
              ].map(([tab, icon, label]) => {
                const TabIcon = icon;
                return (
                <button
                  key={tab}
                  id={`vh2o-top-nav-${tab}`}
                  type="button"
                  className="vh2o-topbar-tab"
                  aria-current={activeTab === tab ? "page" : undefined}
                  onClick={() => setActiveTab(tab)}
                >
                  <TabIcon size={18} aria-hidden="true" />
                  {label}
                </button>
                );
              })}
            </nav>
            <div id="vh2o-top-nav-account" className="vh2o-topbar-account">
              {currentUser ? (
                <>
                  <span>{currentUser.name || currentUser.email}</span>
                  <span className="vh2o-topbar-avatar" aria-hidden="true">
                    {initialsFor(currentUser.name, currentUser.email)}
                  </span>
                </>
              ) : (
                <button id="vh2o-top-nav-login-btn" type="button" className="vh2o-topbar-login" onClick={() => navigate("/login")}>
                  Log in
                </button>
              )}
            </div>
          </header>
        ) : (
          /* Wavy header */
          <div id="vh2o-app-header" style={styles.header}>
            <div style={styles.headerBg} />
            <div style={styles.headerContent}>
              <div style={styles.storeName}>
                  {/* width/height are the file's own size, so the browser reserves the space before it loads. */}
                  <img id="vh2o-app-header-logo" className="vh2o-banner-logo" src={img} alt="Variety H2O + Ice Cream" width={LOGO_WIDTH} height={LOGO_HEIGHT} style={{ width: "100%", height: "auto" }}/>
              </div>
            </div>
          </div>
        )}

        {/* Tab content */}
        <div
          id="vh2o-app-content"
          className={`vh2o-content${activeTab === "tracker" && currentUser?.role === "admin" ? " vh2o-content--wide" : ""}`}
          style={styles.content}
        >
          {activeTab === "tracker" && <TrackerTab adminView={adminView} sizeClass={sizeClass} />}
          {activeTab === "menu" && <MenuTab isDesktop={isDesktop} />}
          {activeTab === "locations" && <LocationTab />}
          {activeTab === "settings" && <SettingsTab />}
        </div>

        {/* Bottom nav bar (phone and tablet; desktop uses the top bar) */}
        {!isDesktop && (
        <nav id="vh2o-bottom-nav" aria-label="Main" style={styles.bottomNav}>
          <div id="vh2o-bottom-nav-tracker" style={{ ...styles.navItem, ...(activeTab === "tracker" ? styles.navItemActive : {}) }} {...buttonProps(() => setActiveTab("tracker"))} aria-current={activeTab === "tracker" ? "page" : undefined}>
            <House size={ICON_SIZE.md} color={activeTab === "tracker" ? "var(--vh2o-accent)" : "var(--vh2o-text-subtle)"} aria-hidden="true" /><span style={{ ...styles.navLabel, ...(activeTab === "tracker" ? { color: "var(--vh2o-accent)" } : {}) }}>Home</span>
          </div>
          <div id="vh2o-bottom-nav-menu" style={{ ...styles.navItem, ...(activeTab === "menu" ? styles.navItemActive : {}) }} {...buttonProps(() => setActiveTab("menu"))} aria-current={activeTab === "menu" ? "page" : undefined}>
            <IceCreamCone size={ICON_SIZE.md} color={activeTab === "menu" ? "var(--vh2o-accent)" : "var(--vh2o-text-subtle)"} aria-hidden="true" /><span style={{ ...styles.navLabel, ...(activeTab === "menu" ? { color: "var(--vh2o-accent)" } : {}) }}>Menu</span>
          </div>
          <div id="vh2o-bottom-nav-locations" style={{ ...styles.navItem, ...(activeTab === "locations" ? styles.navItemActive : {}) }} {...buttonProps(() => setActiveTab("locations"))} aria-current={activeTab === "locations" ? "page" : undefined}>
            <MapPin size={ICON_SIZE.md} color={activeTab === "locations" ? "var(--vh2o-accent)" : "var(--vh2o-text-subtle)"} aria-hidden="true" /><span style={{ ...styles.navLabel, ...(activeTab === "locations" ? { color: "var(--vh2o-accent)" } : {}) }}>Location</span>
          </div>
          <div id="vh2o-bottom-nav-settings" style={{ ...styles.navItem, ...(activeTab === "settings" ? styles.navItemActive : {}) }} {...buttonProps(() => setActiveTab("settings"))} aria-current={activeTab === "settings" ? "page" : undefined}>
            <Settings size={ICON_SIZE.md} color={activeTab === "settings" ? "var(--vh2o-accent)" : "var(--vh2o-text-subtle)"} aria-hidden="true" /><span style={{ ...styles.navLabel, ...(activeTab === "settings" ? { color: "var(--vh2o-accent)" } : {}) }}>Settings</span>
          </div>
        </nav>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { House, IceCreamCone, MapPin, Settings, Store, Users } from "lucide-react";
import { useUser } from "../userContext";
import { ICON_SIZE, buttonProps, useSizeClass } from "../lib/ui";
import { initialsFor } from "../lib/format";
import { styles, css } from "../styles";
import BiometricLockScreen from "./BiometricLockScreen";
import TrackerTab from "./tabs/TrackerTab";
import MenuTab from "./tabs/MenuTab";
import LocationTab from "./tabs/LocationTab";
import SettingsTab from "./tabs/SettingsTab";
import AdminPanel from "../admin/AdminPanel";
import MenuEditor from "../admin/MenuEditor";
import BrandLogo from "../components/BrandLogo";

// The four sections, each its own URL. The first one is Home for customers and Customers for the
// admin; its DOM IDs stay `tracker` either way (TEST_IDS.md).
function navItems(isAdmin, adminPath) {
  return [
    isAdmin
      ? { key: "tracker", to: adminPath, match: "/admin", icon: Users, label: "Customers" }
      : { key: "tracker", to: "/", match: "/", icon: House, label: "Home" },
    { key: "menu", to: "/menu", match: "/menu", icon: IceCreamCone, label: "Menu" },
    { key: "locations", to: "/location", match: "/location", icon: MapPin, label: "Location" },
    { key: "settings", to: "/settings", match: "/settings", icon: Settings, label: "Settings" },
  ];
}

function isActive(pathname, match) {
  return match === "/" ? pathname === "/" : pathname === match || pathname.startsWith(`${match}/`);
}

// `/`: a customer's Home, and the admin goes to Customers. Signed out, opening the site lands on
// the menu, but tapping Home later shows a sign-in prompt instead of silently redirecting.
// React Router gives the first location of a visit the key "default".
function HomeRoute({ sizeClass }) {
  const { currentUser, isLoading } = useUser();
  const location = useLocation();
  if (!isLoading && !currentUser && location.key === "default") return <Navigate to="/menu" replace />;
  if (currentUser?.role === "admin") return <Navigate to="/admin" replace />;
  return <TrackerTab sizeClass={sizeClass} />;
}

// `/admin`, `/admin/customers/:customerId`, and `/admin/menu`: admin only. The selected customer
// lives in the URL, so the browser's back button (and Android's) goes from a customer back to the
// list. A switcher at the top moves between Customers and "Menu & hours".
function AdminRoute({ adminView, sizeClass, page = "customers" }) {
  const { currentUser, isLoading } = useUser();
  const { customerId } = useParams();
  const navigate = useNavigate();
  if (isLoading) return null;
  if (currentUser?.role !== "admin") return <Navigate to="/" replace />;
  const selectedCustomerId = customerId && /^\d+$/.test(customerId) ? Number(customerId) : null;
  return (
    <div id="vh2o-tracker-home">
      <div id="vh2o-tracker-section" style={styles.rewardsList}>
        <div id="vh2o-admin-subnav" className="vh2o-admin-subnav" role="group" aria-label="Admin sections">
          <button id="vh2o-admin-subnav-customers" type="button"
            aria-pressed={page === "customers"} onClick={() => navigate("/admin")}>
            <Users size={ICON_SIZE.inline + 4} aria-hidden="true" /> Customers
          </button>
          <button id="vh2o-admin-subnav-menu" type="button"
            aria-pressed={page === "menu"} onClick={() => navigate("/admin/menu")}>
            <Store size={ICON_SIZE.inline + 4} aria-hidden="true" /> Edit menu &amp; hours
          </button>
        </div>
        {page === "menu"
          ? <MenuEditor />
          : <AdminPanel view={{ ...adminView, selectedCustomerId }} sizeClass={sizeClass} />}
      </div>
    </div>
  );
}

// The signed-in (or browsing) app: logo banner or desktop top bar, the current section, and the
// bottom tab bar. Each section is a route under this one.
export function MainApp() {
  const { currentUser, isBiometricLocked } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === "admin";

  // Kept here rather than in AdminPanel so the admin's search, filter, sort, and assistant
  // conversation survive visiting the other sections. The selected customer is in the URL
  // instead; `adminPath` remembers it, so the Customers tab returns to the customer you had open.
  // The search text stays out of the URL on purpose: it often holds a customer's name, and
  // URLs end up in browser history.
  const [searchQuery, setSearchQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState("all");
  const [adminSort, setAdminSort] = useState("name");
  const [assistantTurns, setAssistantTurns] = useState([]);
  const [adminPath, setAdminPath] = useState("/admin");
  const onAdminPage = isActive(location.pathname, "/admin");
  // Adjusted during render rather than in an effect, so the Customers tab's target is right on
  // the same render that shows the page.
  if (onAdminPage && adminPath !== location.pathname) {
    setAdminPath(location.pathname);
  }
  const adminView = {
    searchQuery, setSearchQuery, adminFilter, setAdminFilter, adminSort, setAdminSort,
    assistantTurns, setAssistantTurns,
  };

  const sizeClass = useSizeClass();
  const isDesktop = sizeClass === "desktop";
  const items = navItems(isAdmin, adminPath);

  if (currentUser && isBiometricLocked) {
    return <BiometricLockScreen />;
  }

  return (
    <div id="vh2o-app-root" className="vh2o-root" style={styles.root}>
      <style>{css}</style>

      {/* Phone wrapper */}
      <div id="vh2o-app-phone" className="vh2o-phone" style={styles.phone}>

        {isDesktop ? (
          // Desktop: one top bar with the logo and the tabs (no bottom tab bar).
          <header id="vh2o-top-nav" className="vh2o-topbar">
            <BrandLogo id="vh2o-top-nav-logo" className="vh2o-topbar-logo" />
            <nav aria-label="Main" className="vh2o-topbar-tabs">
              {items.map(({ key, to, match, icon, label }) => {
                const TabIcon = icon;
                return (
                <button
                  key={key}
                  id={`vh2o-top-nav-${key}`}
                  type="button"
                  className="vh2o-topbar-tab"
                  aria-current={isActive(location.pathname, match) ? "page" : undefined}
                  onClick={() => navigate(to)}
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
          // Phone and tablet: a slim bar with the logo; the tabs are at the bottom.
          <header id="vh2o-app-header" className="vh2o-appbar">
            <BrandLogo id="vh2o-app-header-logo" className="vh2o-appbar-logo" />
            {currentUser && (
              <button id="vh2o-app-header-account" type="button" className="vh2o-appbar-avatar"
                aria-label="Settings" onClick={() => navigate("/settings")}>
                {initialsFor(currentUser.name, currentUser.email)}
              </button>
            )}
          </header>
        )}

        {/* Current section */}
        <div
          id="vh2o-app-content"
          className={`vh2o-content${onAdminPage ? " vh2o-content--wide" : ""}`}
          style={styles.content}
        >
          <Routes>
            <Route index element={<HomeRoute sizeClass={sizeClass} />} />
            <Route path="menu" element={<MenuTab isDesktop={isDesktop} />} />
            <Route path="menu/:categoryId" element={<MenuTab isDesktop={isDesktop} />} />
            <Route path="location" element={<LocationTab />} />
            <Route path="settings" element={<SettingsTab />} />
            <Route path="admin" element={<AdminRoute adminView={adminView} sizeClass={sizeClass} />} />
            <Route path="admin/customers/:customerId" element={<AdminRoute adminView={adminView} sizeClass={sizeClass} />} />
            <Route path="admin/menu" element={<AdminRoute adminView={adminView} sizeClass={sizeClass} page="menu" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {/* Bottom nav bar (phone and tablet; desktop uses the top bar) */}
        {!isDesktop && (
        <nav id="vh2o-bottom-nav" aria-label="Main" style={styles.bottomNav}>
          {items.map(({ key, to, match, icon, label }) => {
            const TabIcon = icon;
            const active = isActive(location.pathname, match);
            return (
              <div
                key={key}
                id={`vh2o-bottom-nav-${key}`}
                style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
                {...buttonProps(() => navigate(to))}
                aria-current={active ? "page" : undefined}
              >
                <TabIcon size={ICON_SIZE.md} color={active ? "var(--vh2o-accent)" : "var(--vh2o-text-subtle)"} aria-hidden="true" />
                <span style={{ ...styles.navLabel, ...(active ? { color: "var(--vh2o-accent)" } : {}) }}>{label}</span>
              </div>
            );
          })}
        </nav>
        )}
      </div>
    </div>
  );
}

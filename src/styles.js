// Shared inline style objects and the global CSS string the main app injects. Colors come from the
// --vh2o-* tokens in src/index.css (light by default, dark when the device is), so nothing here
// names a raw color. Size-dependent layout lives in src/index.css too.

const card = {
  background: "var(--vh2o-surface)",
  border: "1px solid var(--vh2o-border)",
  borderRadius: "var(--vh2o-radius-card)",
  boxShadow: "var(--vh2o-shadow)",
};

const pill = {
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const button = {
  minHeight: 48,
  padding: "12px 16px",
  borderRadius: "var(--vh2o-radius-control)",
  fontFamily: "inherit",
  fontSize: 16,
  fontWeight: 800,
  cursor: "pointer",
};

export const styles = {
  // Size-dependent frame properties (width, height, padding, corners, shadow, safe-area insets)
  // live in the .vh2o-root/.vh2o-phone classes in src/index.css so they can change per screen size.
  root: {
    background: "var(--vh2o-bg)",
    display: "flex",
    justifyContent: "center",
    fontFamily: "'Nunito', system-ui, sans-serif",
  },
  phone: {
    background: "var(--vh2o-bg)",
    // clip, not hidden: hidden makes this a scroll container, so the sticky bottom tab bar and
    // top bars would stick to it (which never scrolls) instead of to the window.
    overflow: "clip",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  content: {
    flex: 1, overflowY: "auto",
    padding: "0 0 20px",
  },
  // A screen's padded column of sections.
  rewardsList: {
    padding: "20px 16px 0",
    display: "flex", flexDirection: "column", gap: 12,
  },

  // ---------- Type ----------
  // A screen's title ("Menu", "Visit us", "Sign in").
  pageTitle: { margin: 0, fontSize: 24, lineHeight: "30px", fontWeight: 800, color: "var(--vh2o-text)" },
  pageSubtitle: { margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--vh2o-text-muted)" },
  // A section heading inside a screen.
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "var(--vh2o-text)", margin: "4px 0 0" },

  // ---------- Cards and rows ----------
  card,
  rewardCard: { ...card, padding: 14, display: "flex", alignItems: "center", gap: 12 },
  rewardIcon: { width: 40, height: 40, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--vh2o-accent-tint)", color: "var(--vh2o-accent-soft)" },
  rewardInfo: { flex: 1, minWidth: 0 },
  rewardName: { fontSize: 15, fontWeight: 700, color: "var(--vh2o-text)" },
  rewardDesc: { fontSize: 13, color: "var(--vh2o-text-subtle)", marginTop: 2 },
  // A list inside one card, one row per entry (divider between rows).
  listCard: { ...card, overflow: "hidden" },
  listRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", minHeight: 56, boxSizing: "border-box" },
  listDivider: { borderTop: "1px solid var(--vh2o-border)" },

  // ---------- Pills ----------
  accentPill: { ...pill, background: "var(--vh2o-accent-tint)", color: "var(--vh2o-accent-soft)" },
  neutralPill: { ...pill, background: "var(--vh2o-neutral-tint)", color: "var(--vh2o-text-muted)" },

  // ---------- Menu ----------
  sizeOptionsRow: { marginLeft: "auto", display: "flex", flexDirection: "column", gap: 6 },
  sizeOptionBtn: { ...pill, border: "1px solid var(--vh2o-border)", background: "var(--vh2o-accent-tint)", color: "var(--vh2o-accent-soft)", cursor: "pointer", fontFamily: "inherit" },
  groupPricingBar: { display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 14px", background: "var(--vh2o-accent-tint)", borderRadius: "var(--vh2o-radius-card)" },
  groupPricingPill: { ...pill, padding: "6px 12px", fontSize: 14, background: "var(--vh2o-surface)", color: "var(--vh2o-text)" },
  flavorGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 },
  flavorChip: { ...card, boxShadow: "none", borderRadius: 12, padding: "12px", fontSize: 15, fontWeight: 600, color: "var(--vh2o-text)" },

  // ---------- Bottom tab bar (phone and tablet) ----------
  bottomNav: {
    position: "sticky", bottom: 0, zIndex: 5,
    display: "flex", background: "var(--vh2o-bar)",
    borderTop: "1px solid var(--vh2o-border)",
    padding: "6px 0 14px",
  },
  navItem: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", gap: 3, cursor: "pointer",
  },
  navItemActive: {},
  navLabel: { fontSize: 12, fontWeight: 700, color: "var(--vh2o-text-subtle)" },

  // ---------- History ----------
  notificationCard: { ...card, padding: 14, display: "flex", alignItems: "flex-start", gap: 12 },
  notificationIcon: { width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notificationTitle: { fontSize: 15, fontWeight: 700, color: "var(--vh2o-text)" },
  notificationTime: { fontSize: 13, color: "var(--vh2o-text-subtle)", marginTop: 1 },
  notificationDetails: { fontSize: 13, color: "var(--vh2o-text-muted)", marginTop: 2 },

  // ---------- Forms ----------
  fieldLabel: {
    display: "block", textAlign: "left", fontSize: 14, fontWeight: 700, color: "var(--vh2o-text-muted)",
    margin: "0 0 6px",
  },
  input: {
    width: "100%",
    minHeight: 48,
    padding: "12px 14px",
    marginBottom: 12,
    border: "1px solid var(--vh2o-border-strong)",
    borderRadius: "var(--vh2o-radius-control)",
    background: "var(--vh2o-bg-raised)",
    color: "var(--vh2o-text)",
    fontFamily: "inherit",
    fontSize: 16,
  },

  // ---------- Buttons ----------
  // The main action on a screen (solid accent). Kept as loginBtn: every screen's primary button uses it.
  loginBtn: { ...button, width: "100%", border: "none", background: "var(--vh2o-accent)", color: "var(--vh2o-on-accent)" },
  secondaryBtn: { ...button, width: "100%", border: "1px solid var(--vh2o-border-strong)", background: "var(--vh2o-surface)", color: "var(--vh2o-text)" },
  // Small actions beside content (Edit, Cancel, History).
  subtleBtn: { ...button, minHeight: 44, padding: "8px 14px", fontSize: 14, border: "1px solid var(--vh2o-border-strong)", background: "var(--vh2o-surface)", color: "var(--vh2o-text)" },
  dangerBtn: { ...button, minHeight: 44, padding: "8px 14px", fontSize: 14, border: "1px solid var(--vh2o-danger)", background: "var(--vh2o-danger-tint)", color: "var(--vh2o-danger)" },
  // A text-only action ("Send a new code", "Browse the menu").
  linkBtn: { background: "none", border: "none", padding: 0, color: "var(--vh2o-accent-soft)", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  googleBtn: { ...button, width: "100%", marginTop: 12, border: "1px solid var(--vh2o-border-strong)", background: "#ffffff", color: "#1f2937" },
};

export const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; }
`;

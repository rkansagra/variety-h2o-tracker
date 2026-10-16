// Shared inline style objects and the global CSS string the main app injects. Size-dependent
// layout lives in src/index.css instead.

export const styles = {
  // Size-dependent frame properties (width, height, padding, corners, shadow, safe-area insets)
  // live in the .vh2o-root/.vh2o-phone classes in src/index.css so they can change per screen size.
  root: {
    background: "var(--vh2o-page-gradient)",
    display: "flex",
    justifyContent: "center",
    fontFamily: "'Nunito', 'Poppins', sans-serif",
  },
  phone: {
    background: "var(--vh2o-bg)",
    // clip, not hidden: hidden makes this a scroll container, so the sticky bottom tab bar and
    // desktop top bar would stick to it (which never scrolls) instead of to the window.
    overflow: "clip",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  header: {
    position: "relative",
    background: "var(--vh2o-header-gradient)",
    padding: "0 0 0 0",
    overflow: "hidden",
  },
  headerBg: {
    position: "absolute", inset: 0,
    background: "radial-gradient(ellipse at 50% -20%,rgba(125,211,252,0.18) 0%,transparent 70%)",
  },
  headerContent: {
    position: "relative",
    padding: "48px 20px 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  storeName: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px",
    color: "#e0f2fe", marginBottom: 20,
    textShadow: "0 0 20px rgba(125,211,252,0.4)",
  },
  avatarRing: {
    position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
  },
  avatar: {
    width: 80, height: 80, borderRadius: "50%",
    background: "var(--vh2o-avatar-gradient)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 30, fontWeight: 900, color: "var(--vh2o-bg)", letterSpacing: "1px", boxShadow: "0 0 0 4px rgba(125,211,252,0.25), 0 8px 24px rgba(0,0,0,0.4)",
  },
  tierBadge: {
    marginTop: 8, padding: "3px 12px", borderRadius: 20,
    fontSize: 12, fontWeight: 800, color: "#fff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)", letterSpacing: "0.5px",
  },
  userName: {
    marginTop: 10, fontSize: 20, fontWeight: 800, color: "var(--vh2o-text)",
    letterSpacing: "-0.3px",
  },
  memberSince: {
    fontSize: 12, color: "var(--vh2o-accent-soft)", opacity: 0.7, marginBottom: 16,
  },
  pointsPill: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid var(--vh2o-border-accent)",
    borderRadius: 16, padding: "12px 32px",
    display: "flex", flexDirection: "column", alignItems: "center",
    backdropFilter: "blur(10px)", marginBottom: 20,
    margin: "0 16px 20px",
  },
  pointsNum: {
    fontSize: 38, fontWeight: 900, color: "var(--vh2o-accent-soft)",
    letterSpacing: "-1px", lineHeight: 1,
    textShadow: "0 0 30px rgba(125,211,252,0.5)",
  },
  pointsLabel: {
    fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-muted)",
    letterSpacing: "2px", marginTop: 2,
  },
  content: {
    flex: 1, overflowY: "auto",
    padding: "0 0 20px",
  },
  rewardsList: {
    padding: "16px 16px 0",
    display: "flex", flexDirection: "column", gap: 10,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-subtle)",
    letterSpacing: "1.5px", textTransform: "uppercase",
    marginBottom: 2,
  },
  rewardCard: {
    background: "var(--vh2o-surface)",
    border: "1px solid var(--vh2o-border)",
    borderRadius: 16, padding: "14px",
    display: "flex", alignItems: "center", gap: 12,
    transition: "all 0.2s",
  },
  rewardIcon: { fontSize: 30, width: 44, textAlign: "center" },
  rewardInfo: { flex: 1 },
  rewardName: { fontSize: 14, fontWeight: 700, color: "var(--vh2o-text)" },
  rewardDesc: { fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 },
  sizeOptionsRow: {
    marginLeft: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  sizeOptionBtn: {
    border: "1px solid rgba(56,189,248,0.35)",
    background: "rgba(56,189,248,0.12)",
    color: "var(--vh2o-accent-soft)",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  groupPricingBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: "10px 14px",
    background: "rgba(56,189,248,0.08)",
    border: "1px solid rgba(56,189,248,0.25)",
    borderRadius: 14,
  },
  groupPricingPill: {
    border: "1px solid rgba(56,189,248,0.35)",
    background: "rgba(56,189,248,0.12)",
    color: "var(--vh2o-accent-soft)",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  flavorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: 8,
  },
  flavorChip: {
    background: "var(--vh2o-surface)",
    border: "1px solid var(--vh2o-border)",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--vh2o-text)",
  },
  bottomNav: {
    position: "sticky", bottom: 0, zIndex: 5,
    display: "flex", background: "var(--vh2o-scrim)",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    backdropFilter: "blur(20px)",
    padding: "8px 0 20px",
  },
  navItem: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", gap: 2, cursor: "pointer",
    fontSize: 20,
  },
  navItemActive: {},
  navLabel: { fontSize: 12, fontWeight: 700, color: "var(--vh2o-text-subtle)", letterSpacing: "0.5px" },
  notificationCard: {
    background: "var(--vh2o-surface)",
    border: "1px solid var(--vh2o-border)",
    borderRadius: 16, padding: "14px",
    display: "flex", alignItems: "flex-start", gap: 12,
    transition: "all 0.2s",
    marginBottom: 10,
  },
  notificationIcon: {
    width: 44, height: 44, borderRadius: 12,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 20, flexShrink: 0,
  },
  notificationTitle: {
    fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)",
  },
  notificationBody: {
    fontSize: 12, fontWeight: 600, color: "var(--vh2o-accent-soft)",
    marginTop: 2,
  },
  notificationTime: {
    fontSize: 12, color: "var(--vh2o-text-subtle)",
    marginTop: 4,
  },
  notificationDetails: {
    fontSize: 12, color: "var(--vh2o-text-muted)",
    marginTop: 4,
  },
  fieldLabel: {
    display: "block", textAlign: "left", fontSize: 13, fontWeight: 700, color: "var(--vh2o-text-muted)",
    margin: "0 0 4px 2px",
  },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: 10,
    border: "1px solid var(--vh2o-border-accent)",
    borderRadius: 8,
    background: "var(--vh2o-surface)",
    color: "var(--vh2o-text)",
    fontSize: 16,
  },
  loginBtn: {
    width: "100%",
    padding: "12px",
    background: "var(--vh2o-cta)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  googleBtn: {
    width: "100%",
    padding: "12px",
    marginTop: 10,
    background: "#fff",
    border: "1px solid var(--vh2o-border-accent)",
    borderRadius: 8,
    color: "#1f2937",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
};

export const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; }

  .progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 1s cubic-bezier(0.34,1.56,0.64,1);
    box-shadow: 0 0 8px currentColor;
  }

  .stamp-filled {
    animation: stamp-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
  }

  @keyframes stamp-pop {
    from { transform: scale(0.5); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  .confetti-piece {
    position: absolute;
    width: 8px; height: 8px;
    border-radius: 2px;
    animation: confetti-fall 1.8s ease-in forwards;
    top: -10px;
  }

  @keyframes confetti-fall {
    0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }

  .toast-in {
    animation: toast-slide 0.4s cubic-bezier(0.34,1.56,0.64,1);
  }

  @keyframes toast-slide {
    from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
    to   { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
`;

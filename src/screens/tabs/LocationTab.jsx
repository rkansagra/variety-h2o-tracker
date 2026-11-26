import { useState } from "react";
import { Clock, ExternalLink, Map as MapIcon, MapPin, Navigation, Phone, ShoppingCart, ThumbsUp } from "lucide-react";
import { ICON_SIZE, buttonProps, useDialog } from "../../lib/ui";
import { useMenu } from "../../menuContext";
import { styles } from "../../styles";

// Location tab: address, phone, hours, and links, plus the map-app and call sheets. The details
// come from store_info through MenuProvider (ROADMAP item E), so the admin can edit them.
export default function LocationTab() {
  const { store, status } = useMenu();
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [showCallOptions, setShowCallOptions] = useState(false);
  const mapSheetRef = useDialog(showMapOptions, () => setShowMapOptions(false));
  const callSheetRef = useDialog(showCallOptions, () => setShowCallOptions(false));

  if (!store) {
    return (
      <div id="vh2o-locations-section" style={styles.rewardsList}>
        <p id={`vh2o-locations-${status === "loading" ? "loading" : "unavailable"}`} style={{ color: "var(--vh2o-text-subtle)", marginTop: 20 }}>
          {status === "loading" ? "Loading…" : "The store details can't be loaded right now. Please try again in a moment."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div id="vh2o-locations-section" style={styles.rewardsList}>
        <h1 id="vh2o-locations-title" style={styles.pageTitle}>Visit us</h1>

        <div id="vh2o-locations-cards" className="vh2o-location-cards">
        <div
          id="vh2o-locations-address-card"
          style={{ ...styles.rewardCard, cursor: "pointer" }}
          {...buttonProps(() => setShowMapOptions(true))}
          aria-haspopup="dialog"
        >
          <div aria-hidden="true" style={styles.rewardIcon}><MapPin size={ICON_SIZE.md} /></div>
          <div style={styles.rewardInfo}>
            <div style={styles.rewardName}>{store.addressLines[0]}</div>
            {store.addressLines.slice(1).map((line, i) => <div key={i} style={{ fontSize: 15, color: "var(--vh2o-text-muted)" }}>{line}</div>)}
            <div style={{ ...styles.rewardDesc, color: "var(--vh2o-accent-soft)", fontWeight: 700, marginTop: 4 }}>Get directions</div>
          </div>
          <ExternalLink size={ICON_SIZE.inline} aria-hidden="true" color="var(--vh2o-text-subtle)" />
        </div>

        <div
          id="vh2o-locations-call-card"
          style={{ ...styles.rewardCard, cursor: "pointer" }}
          {...buttonProps(() => setShowCallOptions(true))}
          aria-haspopup="dialog"
        >
          <div aria-hidden="true" style={styles.rewardIcon}><Phone size={ICON_SIZE.md} /></div>
          <div style={styles.rewardInfo}>
            <div style={styles.rewardName}>{store.phone.display}</div>
            <div style={styles.rewardDesc}>Tap to call</div>
          </div>
        </div>

        <div id="vh2o-locations-hours-card" style={{ ...styles.rewardCard, alignItems: "flex-start" }}>
          <div aria-hidden="true" style={styles.rewardIcon}><Clock size={ICON_SIZE.md} /></div>
          <div style={{ ...styles.rewardInfo, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={styles.rewardName}>Hours</div>
            {store.hours.map(({ days, hours }, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 15 }}>
                <span style={{ color: "var(--vh2o-text-muted)" }}>{days}</span>
                <span style={{ color: "var(--vh2o-text)", fontWeight: 700 }}>{hours}</span>
              </div>
            ))}
          </div>
        </div>

        <a
          id="vh2o-locations-order-now-card"
          href={store.orderUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...styles.rewardCard, textDecoration: "none" }}
        >
          <div aria-hidden="true" style={styles.rewardIcon}><ShoppingCart size={ICON_SIZE.md} /></div>
          <div style={styles.rewardInfo}>
            <div style={styles.rewardName}>Order online</div>
            <div style={styles.rewardDesc}>Opens order.online</div>
          </div>
          <ExternalLink size={ICON_SIZE.inline} aria-hidden="true" color="var(--vh2o-text-subtle)" />
        </a>

        <a
          id="vh2o-locations-facebook-card"
          href={store.facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...styles.rewardCard, textDecoration: "none" }}
        >
          <div aria-hidden="true" style={styles.rewardIcon}><ThumbsUp size={ICON_SIZE.md} /></div>
          <div style={styles.rewardInfo}>
            <div style={styles.rewardName}>Follow us on Facebook</div>
            <div style={styles.rewardDesc}>Opens Facebook</div>
          </div>
          <ExternalLink size={ICON_SIZE.inline} aria-hidden="true" color="var(--vh2o-text-subtle)" />
        </a>
        </div>
      </div>

      {/* Map picker bottom sheet */}
      {showMapOptions && (
        <div
          id="vh2o-map-options-overlay"
          style={{
            position: "absolute", inset: 0,
            background: "var(--vh2o-scrim)",
            display: "flex", alignItems: "flex-end",
            zIndex: 100,
          }}
          onClick={() => setShowMapOptions(false)}
        >
          <div
            id="vh2o-map-options-sheet"
            ref={mapSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Open the address in maps"
            style={{
              width: "100%",
              background: "var(--vh2o-sheet)",
              borderTop: "1px solid var(--vh2o-border-strong)",
              borderRadius: "20px 20px 0 0",
              padding: "20px 16px 36px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ ...styles.sectionTitle, marginBottom: 4 }}>
              Open the address in
            </div>
            <a
              id="vh2o-map-options-google-link"
              href={store.mapsGoogleUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "var(--vh2o-surface)",
                border: "1px solid var(--vh2o-border-strong)",
                borderRadius: 14, padding: "14px 16px",
                textDecoration: "none", color: "var(--vh2o-text)",
              }}
              onClick={() => setShowMapOptions(false)}
            >
              <MapIcon size={ICON_SIZE.lg} color="var(--vh2o-accent)" aria-hidden="true" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Google Maps</div>
                <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Open in browser or app</div>
              </div>
            </a>
            <a
              id="vh2o-map-options-apple-link"
              href={store.mapsAppleUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "var(--vh2o-surface)",
                border: "1px solid var(--vh2o-border-strong)",
                borderRadius: 14, padding: "14px 16px",
                textDecoration: "none", color: "var(--vh2o-text)",
              }}
              onClick={() => setShowMapOptions(false)}
            >
              <Navigation size={ICON_SIZE.lg} color="var(--vh2o-accent)" aria-hidden="true" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Apple Maps</div>
                <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Open in Maps app</div>
              </div>
            </a>
            <button
              id="vh2o-map-options-cancel-btn"
              onClick={() => setShowMapOptions(false)}
              style={{
                marginTop: 4, padding: "12px",
                background: "var(--vh2o-surface-subtle)",
                border: "1px solid var(--vh2o-border)",
                borderRadius: 14, color: "var(--vh2o-text-muted)",
                fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Call bottom sheet */}
      {showCallOptions && (
        <div
          id="vh2o-call-options-overlay"
          style={{
            position: "absolute", inset: 0,
            background: "var(--vh2o-scrim)",
            display: "flex", alignItems: "flex-end",
            zIndex: 100,
          }}
          onClick={() => setShowCallOptions(false)}
        >
          <div
            id="vh2o-call-options-sheet"
            ref={callSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Call the store"
            style={{
              width: "100%",
              background: "var(--vh2o-sheet)",
              borderTop: "1px solid var(--vh2o-border-strong)",
              borderRadius: "20px 20px 0 0",
              padding: "20px 16px 36px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ ...styles.sectionTitle, marginBottom: 4 }}>
              Call the store
            </div>
            <a
              id="vh2o-call-options-link"
              href={store.phone.tel}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "var(--vh2o-surface)",
                border: "1px solid var(--vh2o-border-strong)",
                borderRadius: 14, padding: "14px 16px",
                textDecoration: "none", color: "var(--vh2o-text)",
              }}
              onClick={() => setShowCallOptions(false)}
            >
              <Phone size={ICON_SIZE.lg} color="var(--vh2o-accent)" aria-hidden="true" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Call {store.phone.display}</div>
                <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Variety H2O + Ice Cream</div>
              </div>
            </a>
            <button
              id="vh2o-call-options-cancel-btn"
              onClick={() => setShowCallOptions(false)}
              style={{
                marginTop: 4, padding: "12px",
                background: "var(--vh2o-surface-subtle)",
                border: "1px solid var(--vh2o-border)",
                borderRadius: 14, color: "var(--vh2o-text-muted)",
                fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

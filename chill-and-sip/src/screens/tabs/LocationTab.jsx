import { useState } from "react";
import { Clock, ExternalLink, Map as MapIcon, MapPin, Navigation, Phone, ShoppingCart, ThumbsUp } from "lucide-react";
import { ICON_SIZE, buttonProps, useDialog } from "../../lib/ui";
import { styles } from "../../styles";

// Location tab: address, phone, hours, and links, plus the map-app and call sheets.
export default function LocationTab() {
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [showCallOptions, setShowCallOptions] = useState(false);
  const mapSheetRef = useDialog(showMapOptions, () => setShowMapOptions(false));
  const callSheetRef = useDialog(showCallOptions, () => setShowCallOptions(false));

  return (
    <>
      <div id="vh2o-locations-section" style={styles.rewardsList}>
        <div id="vh2o-locations-title" style={styles.sectionTitle}>Store Location</div>

        <div id="vh2o-locations-cards" className="vh2o-location-cards">
        {/* Clickable address card */}
        <div
          id="vh2o-locations-address-card"
          style={{
            ...styles.rewardCard,
            flexDirection: "column",
            alignItems: "center",
            cursor: "pointer",
            border: "1px solid rgba(56,189,248,0.3)",
            gap: 6,
          }}
          {...buttonProps(() => setShowMapOptions(true))}
          aria-haspopup="dialog"
        >
          <MapPin size={ICON_SIZE.lg} color="#38bdf8" aria-hidden="true" />
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--vh2o-text)", textAlign: "center" }}>
            Variety H2O + Ice Cream
          </div>
          <div style={{ fontSize: 12, color: "var(--vh2o-accent)", textAlign: "center", lineHeight: 1.6 }}>
            6330 E Golf Links Rd #A138<br />
            Tucson, AZ 85730
          </div>
          <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>
            Tap to open in maps <ExternalLink size={ICON_SIZE.inline - 2} aria-hidden="true" style={{ verticalAlign: "-1px" }} />
          </div>
        </div>

        <div
          id="vh2o-locations-call-card"
          style={{
            ...styles.rewardCard,
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
            border: "1px solid rgba(52,211,153,0.3)",
          }}
          {...buttonProps(() => setShowCallOptions(true))}
          aria-haspopup="dialog"
        >
          <Phone size={ICON_SIZE.md} color="#34d399" aria-hidden="true" />
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)" }}>(520) 812-1532</div>
          <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Tap to call <ExternalLink size={ICON_SIZE.inline - 2} aria-hidden="true" style={{ verticalAlign: "-1px" }} /></div>
        </div>

        <div id="vh2o-locations-hours-card" style={{ ...styles.rewardCard, flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Clock size={ICON_SIZE.md} color="#94a3b8" aria-hidden="true" />
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)" }}>Hours</div>
          <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", textAlign: "center", lineHeight: 1.6 }}>
            Mon – Sat: 10am – 7pm<br />
            Sun: 12pm – 5pm
          </div>
        </div>

        <a
          id="vh2o-locations-order-now-card"
          href="https://order.online/business/variety-h2o-ice-cream-461440"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...styles.rewardCard,
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            border: "1px solid rgba(251,146,60,0.3)",
            textDecoration: "none",
          }}
        >
          <ShoppingCart size={ICON_SIZE.md} color="#fb923c" aria-hidden="true" />
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)" }}>Order Online</div>
          <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Opens order.online <ExternalLink size={ICON_SIZE.inline - 2} aria-hidden="true" style={{ verticalAlign: "-1px" }} /></div>
        </a>

        <a
          id="vh2o-locations-facebook-card"
          href="https://www.facebook.com/VarietyWaterPlusIceCream/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...styles.rewardCard,
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            border: "1px solid rgba(59,130,246,0.3)",
            textDecoration: "none",
          }}
        >
          <ThumbsUp size={ICON_SIZE.md} color="#60a5fa" aria-hidden="true" />
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)" }}>Follow Us on Facebook</div>
          <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Opens Facebook <ExternalLink size={ICON_SIZE.inline - 2} aria-hidden="true" style={{ verticalAlign: "-1px" }} /></div>
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
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-subtle)", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
              Open Address In…
            </div>
            <a
              id="vh2o-map-options-google-link"
              href="https://maps.app.goo.gl/u6AER73Amus6L5me6"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--vh2o-border-strong)",
                borderRadius: 14, padding: "14px 16px",
                textDecoration: "none", color: "var(--vh2o-text)",
              }}
              onClick={() => setShowMapOptions(false)}
            >
              <MapIcon size={ICON_SIZE.lg} color="#38bdf8" aria-hidden="true" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Google Maps</div>
                <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)", marginTop: 2 }}>Open in browser or app</div>
              </div>
            </a>
            <a
              id="vh2o-map-options-apple-link"
              href="https://maps.apple/p/zxEvbrjs8z53N7"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--vh2o-border-strong)",
                borderRadius: 14, padding: "14px 16px",
                textDecoration: "none", color: "var(--vh2o-text)",
              }}
              onClick={() => setShowMapOptions(false)}
            >
              <Navigation size={ICON_SIZE.lg} color="#38bdf8" aria-hidden="true" />
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
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-subtle)", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
              Contact Us
            </div>
            <a
              id="vh2o-call-options-link"
              href="tel:+15208121532"
              style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "rgba(52,211,153,0.08)",
                border: "1px solid rgba(52,211,153,0.25)",
                borderRadius: 14, padding: "14px 16px",
                textDecoration: "none", color: "var(--vh2o-text)",
              }}
              onClick={() => setShowCallOptions(false)}
            >
              <Phone size={ICON_SIZE.lg} color="#34d399" aria-hidden="true" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Call (520) 812-1532</div>
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

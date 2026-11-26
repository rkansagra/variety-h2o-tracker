import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ICON_SIZE } from "../../lib/ui";
import { slugify } from "../../lib/format";
import { sizesOf } from "../../lib/menu";
import { useMenu } from "../../menuContext";
import { styles } from "../../styles";
import CategoryIcon from "../../components/CategoryIcon";

const money = (n) => `$${n.toFixed(2)}`;

// Menu (`/menu`, `/menu/:categoryId`). Phone/tablet: a list of categories that drills into one
// category. Desktop: the category list beside the selected category's items. The category is in
// the URL, so the back button returns to the list and a category can be linked to directly. The
// menu and the intro text come from the database through MenuProvider (ROADMAP item E).
export default function MenuTab({ isDesktop }) {
  const { status, categories, store, cachedAt } = useMenu();
  // Hidden items reach an admin's browser (for the editor); the menu never shows them.
  const MENU_CATEGORIES = categories.map((c) => ({ ...c, items: c.items.filter((item) => !item.hidden) }));
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const activeCategory = categoryId ?? null;
  const setActiveCategory = (id) => navigate(id ? `/menu/${id}` : "/menu");
  // Desktop always shows a category (the first by default) beside the category list;
  // phone and tablet show the category list until one is picked.
  const menuCategory = isDesktop ? (activeCategory ?? MENU_CATEGORIES[0]?.id ?? null) : activeCategory;

  if (status === "loading" || status === "unavailable") {
    return (
      <div id="vh2o-menu-section" style={styles.rewardsList}>
        <p id={`vh2o-menu-${status}`} style={{ color: "var(--vh2o-text-subtle)", marginTop: 20 }}>
          {status === "loading" ? "Loading the menu…" : "The menu can't be loaded right now. Please try again in a moment."}
        </p>
      </div>
    );
  }
  if (categoryId && !MENU_CATEGORIES.some((c) => c.id === categoryId)) {
    return <Navigate to="/menu" replace />;
  }

  const renderMenuItems = (cat) => {
    // An item with its own price has no sizes (e.g. the snowcone ice-cream add-on);
    // otherwise it uses its own sizes (e.g. Protein Smoothie) or its category's.
    const tiersOf = (item) => sizesOf(item, cat);

    // Group items that share identical pricing (same sizes, or same price/unit) so flavors that
    // all cost the same -- e.g. every milkshake is $8.05/$10.12 by size -- show that pricing once
    // instead of repeating it on every flavor.
    const priceKeyOf = (item) => {
      const tiers = tiersOf(item);
      if (tiers) return `tiers:${tiers.map((t) => `${t.key}:${t.price}`).join(",")}`;
      return `flat:${item.price}:${item.unit ?? ""}`;
    };
    const groups = [];
    const groupIndexByKey = new Map();
    cat.items.forEach((item, i) => {
      const key = priceKeyOf(item);
      if (!groupIndexByKey.has(key)) {
        groupIndexByKey.set(key, groups.length);
        groups.push({ key, entries: [] });
      }
      groups[groupIndexByKey.get(key)].entries.push({ item, i });
    });

    // One item on its own: name and description, price or sizes on the right.
    const renderItemCard = (item, i) => {
      const itemDomKey = `${menuCategory}-${slugify(item.name) || i}`;
      const itemTiers = tiersOf(item);
      return (
        <div id={`vh2o-menu-item-card-${itemDomKey}`} key={i} style={{ ...styles.rewardCard, alignItems: "flex-start" }}>
          <div style={styles.rewardInfo}>
            <div id={`vh2o-menu-item-name-${itemDomKey}`} style={styles.rewardName}>{item.name}</div>
            {item.description && (
              <div id={`vh2o-menu-item-description-${itemDomKey}`} style={{ ...styles.rewardDesc, lineHeight: "18px" }}>
                {item.description}
              </div>
            )}
          </div>
          {itemTiers ? (
            <div style={styles.sizeOptionsRow}>
              {itemTiers.map((tier) => (
                <span id={`vh2o-menu-item-size-btn-${itemDomKey}-${tier.key}`} key={tier.key} style={styles.sizeOptionBtn}>
                  {tier.label} {money(tier.price)}
                </span>
              ))}
            </div>
          ) : (
            <div id={`vh2o-menu-item-price-${itemDomKey}`} style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--vh2o-text)" }}>{money(item.price)}</div>
              {item.unit && <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)" }}>{item.unit}</div>}
            </div>
          )}
        </div>
      );
    };

    return (
      <div id="vh2o-menu-items" className="vh2o-menu-items">
        {groups.map((group, groupIdx) => {
          if (group.entries.length === 1) {
            const { item, i } = group.entries[0];
            return renderItemCard(item, i);
          }
          const sampleItem = group.entries[0].item;
          const sampleTiers = tiersOf(sampleItem);
          return (
            <div key={group.key} className="vh2o-menu-group" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div id={`vh2o-menu-group-pricing-${menuCategory}-${groupIdx}`} style={styles.groupPricingBar}>
                {sampleTiers
                  ? sampleTiers.map((tier) => (
                      <span key={tier.key} style={styles.groupPricingPill}>
                        {tier.label} <span style={{ color: "var(--vh2o-text-muted)" }}>{money(tier.price)}</span>
                      </span>
                    ))
                  : (
                      <span style={styles.groupPricingPill}>{money(sampleItem.price)} {sampleItem.unit}</span>
                    )}
              </div>
              <div style={styles.flavorGrid}>
                {group.entries.map(({ item, i }) => {
                  const itemDomKey = `${menuCategory}-${slugify(item.name) || i}`;
                  return (
                    <div id={`vh2o-menu-item-card-${itemDomKey}`} key={i} style={styles.flavorChip}>
                      <span id={`vh2o-menu-item-name-${itemDomKey}`}>{item.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const intro = (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {status === "cached" && (
        <p id="vh2o-menu-cached-note" style={{ ...styles.neutralPill, alignSelf: "flex-start", whiteSpace: "normal", marginBottom: 8 }}>
          Offline: showing the menu as of {new Date(cachedAt).toLocaleDateString()}. Prices may have changed.
        </p>
      )}
      <h1 id="vh2o-menu-title" style={styles.pageTitle}>Menu</h1>
      {store?.tagline && (
        <p id="vh2o-menu-tagline" style={{ ...styles.pageSubtitle, color: "var(--vh2o-accent-soft)", fontWeight: 700 }}>
          {store.tagline}
        </p>
      )}
      {store?.welcome && (
        <p id="vh2o-menu-welcome" style={styles.pageSubtitle}>{store.welcome}</p>
      )}
    </div>
  );

  if (isDesktop) {
    const cat = MENU_CATEGORIES.find((c) => c.id === menuCategory) || MENU_CATEGORIES[0];
    return (
      <div id="vh2o-menu-section" style={styles.rewardsList}>
        {intro}
        {/* The heading sits over the items only, so the category list lines up with the first item. */}
        <div className="vh2o-menu-desk">
          <h2 id="vh2o-menu-category-title" className="vh2o-menu-desk-title" style={{ ...styles.sectionTitle, fontSize: 20 }}>
            {cat.name}
          </h2>
          <nav id="vh2o-menu-category-list" className="vh2o-menu-cat-list" aria-label="Menu categories">
            {MENU_CATEGORIES.map((c) => (
              <button
                key={c.id}
                id={`vh2o-menu-category-link-${c.id}`}
                type="button"
                className="vh2o-menu-cat-link"
                aria-current={c.id === cat.id ? "true" : undefined}
                onClick={() => setActiveCategory(c.id)}
              >
                <CategoryIcon cat={c} />
                <span className="vh2o-menu-cat-name">{c.name}</span>
                <span className="vh2o-menu-cat-count">{c.items.length}</span>
              </button>
            ))}
          </nav>
          {renderMenuItems(cat)}
        </div>
      </div>
    );
  }

  return (
    <div id="vh2o-menu-section" style={styles.rewardsList}>
      {menuCategory === null ? (
        <>
          {intro}
          <div id="vh2o-menu-categories-grid" className="vh2o-menu-grid" style={styles.listCard}>
            {MENU_CATEGORIES.map((cat, i) => (
              <button
                id={`vh2o-menu-category-card-${cat.id}`}
                key={cat.id}
                type="button"
                className="vh2o-menu-row"
                style={i > 0 ? styles.listDivider : undefined}
                onClick={() => setActiveCategory(cat.id)}
              >
                <CategoryIcon cat={cat} />
                <span id={`vh2o-menu-category-name-${cat.id}`} className="vh2o-menu-row-name">{cat.name}</span>
                <span className="vh2o-menu-cat-count">{cat.items.length} items</span>
                <ChevronRight size={ICON_SIZE.inline + 2} aria-hidden="true" color="var(--vh2o-text-subtle)" />
              </button>
            ))}
          </div>
        </>
      ) : (() => {
        const cat = MENU_CATEGORIES.find((c) => c.id === menuCategory);
        return (
          <>
            <button
              id="vh2o-menu-back-btn"
              type="button"
              onClick={() => setActiveCategory(null)}
              style={{ ...styles.linkBtn, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, minHeight: 44 }}
            >
              <ChevronLeft size={ICON_SIZE.inline + 4} aria-hidden="true" /> Menu
            </button>
            <h1 style={{ ...styles.pageTitle, marginTop: -8 }}>{cat.name}</h1>
            {renderMenuItems(cat)}
          </>
        );
      })()}
    </div>
  );
}

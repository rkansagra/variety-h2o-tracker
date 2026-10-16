import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import { ICON_SIZE, buttonProps } from "../../lib/ui";
import { slugify } from "../../lib/format";
import { CATEGORY_SIZE_TIERS, MENU_CATEGORIES } from "../../menu/menuData";
import { styles } from "../../styles";
import CategoryIcon from "../../components/CategoryIcon";

// Menu tab. Phone/tablet: a category grid that drills into one category. Desktop: the category
// list beside the selected category's items. Leaving the tab unmounts it, which resets the
// drill-down.
export default function MenuTab({ isDesktop }) {
  const [activeCategory, setActiveCategory] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  // Desktop always shows a category (the first by default) beside the category list;
  // phone and tablet show the category grid until one is picked.
  const menuCategory = isDesktop ? (activeCategory ?? MENU_CATEGORIES[0].id) : activeCategory;
  const renderMenuItems = (cat) => (
    <div id="vh2o-menu-items" className="vh2o-menu-items">
          {(() => {
            // Per-item overrides: `flatPrice` opts an item out of the category's
            // size tiers entirely (e.g. the snowcone ice-cream add-on); `customTiers`
            // gives an item its own tier list instead of the category default (e.g.
            // Protein Smoothie is priced differently than regular smoothies).
            const tiersOf = (item) => item.flatPrice !== undefined
              ? null
              : (item.customTiers ?? CATEGORY_SIZE_TIERS[cat.id] ?? null);

            // Group items that share identical pricing (same tiers, or same flat
            // price/unit) so flavors that all cost the same -- e.g. every milkshake
            // is $8.05/$10.12 by size -- show that pricing once instead of repeating
            // it on every flavor row.
            const priceKeyOf = (item) => {
              const tiers = tiersOf(item);
              if (tiers) return `tiers:${tiers.map((t) => `${t.key}:${t.price}`).join(",")}`;
              return `flat:${item.flatPrice ?? item.price}:${item.unit ?? ""}`;
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

            const renderItemCard = (item, i) => {
              const itemSlug = slugify(item.name);
              const itemDomKey = `${menuCategory}-${itemSlug || i}`;
              const itemTiers = tiersOf(item);
              return (
                <div
                  id={`vh2o-menu-item-card-${itemDomKey}`}
                  key={i}
                  style={{ ...styles.rewardCard, cursor: item.description ? "pointer" : "default" }}
                  {...(item.description ? {
                    ...buttonProps(() => setExpandedItem(expandedItem === `${menuCategory}-${i}` ? null : `${menuCategory}-${i}`)),
                    "aria-expanded": expandedItem === `${menuCategory}-${i}`,
                  } : {})}
                >
                  <div aria-hidden="true" style={styles.rewardIcon}><CategoryIcon cat={cat} /></div>
                  <div style={styles.rewardInfo}>
                    <div id={`vh2o-menu-item-name-${itemDomKey}`} style={styles.rewardName}>{item.name}</div>
                    {!itemTiers && (
                      <div id={`vh2o-menu-item-price-${itemDomKey}`} style={styles.rewardDesc}>${(item.flatPrice ?? item.price).toFixed(2)} {item.unit}</div>
                    )}
                    {item.description && expandedItem === `${menuCategory}-${i}` && (
                      <div id={`vh2o-menu-item-description-${itemDomKey}`} style={{ ...styles.rewardDesc, fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                  {itemTiers && (
                    <div style={styles.sizeOptionsRow}>
                      {itemTiers.map((tier) => (
                        <button
                          id={`vh2o-menu-item-size-btn-${itemDomKey}-${tier.key}`}
                          key={tier.key}
                          type="button"
                          style={styles.sizeOptionBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Placeholder for future cart integration.
                            console.log(`Selected ${tier.label} for ${item.name} at $${tier.price.toFixed(2)}`);
                          }}
                        >
                          {tier.label} - ${tier.price.toFixed(2)}
                        </button>
                      ))}
                    </div>
                  )}
                  {item.description && (
                    <div aria-hidden="true" style={{ color: "var(--vh2o-text-subtle)", marginLeft: "auto", display: "flex" }}>
                      {expandedItem === `${menuCategory}-${i}` ? <ChevronUp size={ICON_SIZE.inline + 2} /> : <ChevronDown size={ICON_SIZE.inline + 2} />}
                    </div>
                  )}
                </div>
              );
            };

            return groups.map((group, groupIdx) => {
              // A price shared by only one item isn't "duplicate" -- keep its full
              // card (name + price/size buttons) exactly as before.
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
                          <span key={tier.key} style={styles.groupPricingPill}>{tier.label} · ${tier.price.toFixed(2)}</span>
                        ))
                      : (
                          <span style={styles.groupPricingPill}>${(sampleItem.flatPrice ?? sampleItem.price).toFixed(2)} {sampleItem.unit}</span>
                        )}
                  </div>
                  <div style={styles.flavorGrid}>
                    {group.entries.map(({ item, i }) => {
                      const itemSlug = slugify(item.name);
                      const itemDomKey = `${menuCategory}-${itemSlug || i}`;
                      return (
                        <div id={`vh2o-menu-item-card-${itemDomKey}`} key={i} style={styles.flavorChip}>
                          <span id={`vh2o-menu-item-name-${itemDomKey}`}>{item.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
    </div>
  );
  const intro = (
    <>
        <div id="vh2o-menu-tagline" style={{ fontSize: 13, fontStyle: "italic", color: "var(--vh2o-accent-soft)", textAlign: "center", marginBottom: 4 }}>
          Diligently Purified for an Impeccable Taste
        </div>
        <div id="vh2o-menu-welcome" style={{ fontSize: 12, color: "var(--vh2o-text-muted)", textAlign: "center", lineHeight: 1.6, marginBottom: 12 }}>
          We are a family-owned and operated water purification and desserts shop! Come try
          all of our purified waters: RO, Re-mineralized, and Alkaline!
        </div>
    </>
  );

  if (isDesktop) {
    const cat = MENU_CATEGORIES.find((c) => c.id === menuCategory) || MENU_CATEGORIES[0];
    return (
      <div id="vh2o-menu-section" style={styles.rewardsList}>
        {intro}
        {/* The heading sits over the items only, so the category list lines up with the first item. */}
        <div className="vh2o-menu-desk">
          <div id="vh2o-menu-category-title" className="vh2o-menu-desk-title" style={styles.sectionTitle}>
            <span aria-hidden="true"><CategoryIcon cat={cat} /></span> {cat.name}
          </div>
          <nav id="vh2o-menu-category-list" className="vh2o-menu-cat-list" aria-label="Menu categories">
            {MENU_CATEGORIES.map((c) => (
              <button
                key={c.id}
                id={`vh2o-menu-category-link-${c.id}`}
                type="button"
                className="vh2o-menu-cat-link"
                aria-current={c.id === cat.id ? "true" : undefined}
                onClick={() => { setActiveCategory(c.id); setExpandedItem(null); }}
              >
                <span aria-hidden="true" className="vh2o-menu-cat-emoji"><CategoryIcon cat={c} /></span>
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
          <div id="vh2o-menu-title" style={styles.sectionTitle}>Our Menu</div>
          <div id="vh2o-menu-categories-grid" className="vh2o-menu-grid">
          {MENU_CATEGORIES.map((cat) => (
            <div
              id={`vh2o-menu-category-card-${cat.id}`}
              key={cat.id}
              style={{
                background: "var(--vh2o-surface)",
                border: `1px solid ${cat.color}55`,
                borderRadius: 16,
                padding: "22px 14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              {...buttonProps(() => { setActiveCategory(cat.id); setExpandedItem(null); })}
            >
              <div aria-hidden="true" style={{ fontSize: 38 }}><CategoryIcon cat={cat} /></div>
              <div id={`vh2o-menu-category-name-${cat.id}`} style={{ fontSize: 13, fontWeight: 700, color: "var(--vh2o-text)", textAlign: "center" }}>{cat.name}</div>
              <div style={{ fontSize: 12, color: cat.color, fontWeight: 600 }}>{cat.items.length} items</div>
            </div>
          ))}
          </div>
        </>
      ) : (() => {
        const cat = MENU_CATEGORIES.find((c) => c.id === menuCategory);
        return (
          <>
          <button
            id="vh2o-menu-back-btn"
            onClick={() => { setActiveCategory(null); setExpandedItem(null); }}
            style={{ background: "none", border: "none", color: "var(--vh2o-accent)", cursor: "pointer", fontSize: 14, padding: "4px 0", textAlign: "left", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit", fontWeight: 700 }}
          >
            <ChevronLeft size={ICON_SIZE.inline + 2} aria-hidden="true" /> Back to Menu
          </button>
            <div style={styles.sectionTitle}><span aria-hidden="true"><CategoryIcon cat={cat} /></span> {cat.name}</div>
            {renderMenuItems(cat)}
          </>
        );
      })()}
    </div>
  );
}

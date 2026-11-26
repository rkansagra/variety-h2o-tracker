import { useEffect, useState } from "react";
import { useMenu } from "../menuContext";
import { describeMenuChange, parsePrice, phoneToTel, sizesOf } from "../lib/menu";
import { styles } from "../styles";

// The admin's "Menu & hours" page (`/admin/menu`, ROADMAP item E): store details, then one
// category at a time -- its size prices and its items (edit, hide, remove, add) -- and the recent
// change history. Every save goes through MenuProvider; RLS and column grants refuse anyone but
// the admin, and a database trigger logs each change.

const subtleButton = styles.subtleBtn;
const dangerButton = styles.dangerBtn;
const card = { ...styles.rewardCard, flexDirection: "column", alignItems: "stretch", gap: 8 };
const smallInput = { ...styles.input, padding: "6px", marginBottom: 0, fontFamily: "inherit" };

function Message({ id, result }) {
  if (!result) return null;
  return (
    <p id={id} style={{ margin: 0, fontSize: 12, color: result.ok ? "var(--vh2o-success)" : "var(--vh2o-danger)" }}>
      {result.ok ? "Saved." : result.message}
    </p>
  );
}

function priceSummary(item, category) {
  const sizes = sizesOf(item, category);
  if (sizes) return sizes.map((s) => `${s.label} $${s.price.toFixed(2)}`).join(" · ");
  return `$${item.price.toFixed(2)}${item.unit ? ` ${item.unit}` : ""}`;
}

// ---------- Store details ----------

function StoreForm({ store, onSave }) {
  const [draft, setDraft] = useState(() => ({
    address1: store.addressLines[0] || "", address2: store.addressLines[1] || "",
    phone: store.phone.display, hours: store.hours.map((h) => ({ ...h })),
    tagline: store.tagline, welcome: store.welcome, orderUrl: store.orderUrl,
    facebookUrl: store.facebookUrl, mapsGoogleUrl: store.mapsGoogleUrl, mapsAppleUrl: store.mapsAppleUrl,
  }));
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  const setHour = (i, key) => (e) => setDraft({ ...draft, hours: draft.hours.map((h, j) => (j === i ? { ...h, [key]: e.target.value } : h)) });

  const save = async (e) => {
    e.preventDefault();
    const tel = phoneToTel(draft.phone);
    if (!tel) return setResult({ ok: false, message: "Enter a 10-digit phone number" });
    const hours = draft.hours.map((h) => ({ days: h.days.trim(), hours: h.hours.trim() })).filter((h) => h.days && h.hours);
    if (hours.length === 0) return setResult({ ok: false, message: "Add at least one line of hours" });
    const link = (value) => value.trim() || null;
    for (const value of [draft.orderUrl, draft.facebookUrl, draft.mapsGoogleUrl, draft.mapsAppleUrl]) {
      if (value.trim() && !value.trim().startsWith("https://")) return setResult({ ok: false, message: "Links must start with https://" });
    }
    setSaving(true);
    setResult(await onSave({
      address_line1: draft.address1.trim(), address_line2: draft.address2.trim(),
      phone_display: draft.phone.trim(), phone_tel: tel, hours,
      tagline: draft.tagline.trim() || null, welcome: draft.welcome.trim() || null,
      order_url: link(draft.orderUrl), facebook_url: link(draft.facebookUrl),
      maps_google_url: link(draft.mapsGoogleUrl), maps_apple_url: link(draft.mapsAppleUrl),
    }));
    setSaving(false);
  };

  const field = (key, label, props = {}) => (
    <div key={key}>
      <label htmlFor={`vh2o-admin-store-${key}`} style={styles.fieldLabel}>{label}</label>
      <input id={`vh2o-admin-store-${key}`} value={draft[key]} onChange={set(key)} style={smallInput} {...props} />
    </div>
  );

  return (
    <form id="vh2o-admin-store-form" onSubmit={save} style={card}>
      <div style={styles.sectionTitle}>Store details</div>
      {field("address1", "Street address", { required: true })}
      {field("address2", "City, state, ZIP", { required: true })}
      {field("phone", "Phone", { required: true, inputMode: "tel" })}
      <div>
        <div style={styles.fieldLabel}>Hours</div>
        {draft.hours.map((h, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input id={`vh2o-admin-store-hours-days-${i}`} aria-label={`Days, line ${i + 1}`} value={h.days} onChange={setHour(i, "days")} style={{ ...smallInput, flex: 1 }} />
            <input id={`vh2o-admin-store-hours-hours-${i}`} aria-label={`Hours, line ${i + 1}`} value={h.hours} onChange={setHour(i, "hours")} style={{ ...smallInput, flex: 1 }} />
            <button id={`vh2o-admin-store-hours-remove-${i}`} type="button" style={subtleButton} aria-label={`Remove hours line ${i + 1}`}
              onClick={() => setDraft({ ...draft, hours: draft.hours.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        {draft.hours.length < 7 && (
          <button id="vh2o-admin-store-hours-add" type="button" style={subtleButton}
            onClick={() => setDraft({ ...draft, hours: [...draft.hours, { days: "", hours: "" }] })}>+ Add a line</button>
        )}
      </div>
      {field("tagline", "Tagline (top of the menu)")}
      <div>
        <label htmlFor="vh2o-admin-store-welcome" style={styles.fieldLabel}>Welcome text</label>
        <textarea id="vh2o-admin-store-welcome" value={draft.welcome} onChange={set("welcome")} rows={3} style={{ ...smallInput, resize: "vertical" }} />
      </div>
      {field("orderUrl", "Order Online link")}
      {field("facebookUrl", "Facebook link")}
      {field("mapsGoogleUrl", "Google Maps link")}
      {field("mapsAppleUrl", "Apple Maps link")}
      <button id="vh2o-admin-store-save" type="submit" disabled={saving} style={{ ...styles.loginBtn, marginTop: 4, opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving…" : "Save store details"}
      </button>
      <Message id="vh2o-admin-store-result" result={result} />
    </form>
  );
}

// ---------- Size prices (a category's, or one item's own) ----------

function SizesForm({ idPrefix, sizes, onSave, title }) {
  const [draft, setDraft] = useState(() => sizes.map((s) => ({ ...s, price: s.price.toFixed(2) })));
  const [result, setResult] = useState(null);
  const save = async () => {
    const parsed = draft.map((s) => ({ key: s.key, label: s.label.trim(), price: parsePrice(s.price) }));
    if (parsed.some((s) => !s.label || s.price === undefined || s.price === null)) {
      return setResult({ ok: false, message: "Each size needs a name and a price like 4.50" });
    }
    setResult(await onSave(parsed));
  };
  return (
    <div id={`${idPrefix}-sizes`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={styles.fieldLabel}>{title}</div>
      {draft.map((s, i) => (
        <div key={s.key} style={{ display: "flex", gap: 6 }}>
          <input id={`${idPrefix}-size-${s.key}-label`} aria-label={`Size ${i + 1} name`} value={s.label}
            onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, label: e.target.value } : d)))} style={{ ...smallInput, flex: 2 }} />
          <input id={`${idPrefix}-size-${s.key}-price`} aria-label={`${s.label} price`} value={s.price} inputMode="decimal"
            onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, price: e.target.value } : d)))} style={{ ...smallInput, flex: 1 }} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button id={`${idPrefix}-sizes-save`} type="button" style={subtleButton} onClick={save}>Save sizes</button>
        <Message id={`${idPrefix}-sizes-result`} result={result} />
      </div>
    </div>
  );
}

// ---------- One item ----------

function ItemRow({ item, category, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(null);
  const [result, setResult] = useState(null);
  const hasSizes = Boolean(item.sizeTiers || category.sizeTiers);

  const startEdit = () => {
    setDraft({ name: item.name, price: item.price === null ? "" : item.price.toFixed(2), unit: item.unit, description: item.description, hidden: item.hidden });
    setResult(null);
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const price = parsePrice(draft.price);
    if (price === undefined) return setResult({ ok: false, message: "Enter a price like 4.50" });
    if (price === null && !hasSizes) return setResult({ ok: false, message: "This item needs a price" });
    if (!draft.name.trim()) return setResult({ ok: false, message: "Enter a name" });
    const saved = await onSave(item.id, {
      name: draft.name.trim(), price, unit: draft.unit.trim() || null,
      description: draft.description.trim() || null, hidden: draft.hidden,
    });
    setResult(saved);
    if (saved.ok) setEditing(false);
  };

  return (
    <div id={`vh2o-admin-menu-item-${item.id}`} style={{ ...card, gap: 6, padding: 10, opacity: item.hidden && !editing ? 0.7 : 1 }}>
      {!editing ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--vh2o-text)" }}>
              {item.name}
              {item.hidden && <span id={`vh2o-admin-menu-item-hidden-${item.id}`} className="vh2o-status-pill is-nologin" style={{ marginLeft: 8 }}>Hidden</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--vh2o-text-subtle)" }}>{priceSummary(item, category)}</div>
          </div>
          <button id={`vh2o-admin-menu-item-edit-${item.id}`} type="button" style={subtleButton} onClick={startEdit}>Edit</button>
        </div>
      ) : (
        <form id={`vh2o-admin-menu-item-form-${item.id}`} onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={`vh2o-admin-menu-item-name-${item.id}`} style={{ ...styles.fieldLabel, marginBottom: 0 }}>Name</label>
          <input id={`vh2o-admin-menu-item-name-${item.id}`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={smallInput} required />
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor={`vh2o-admin-menu-item-price-${item.id}`} style={{ ...styles.fieldLabel, marginBottom: 0 }}>
                Price{hasSizes ? " (blank = sizes)" : ""}
              </label>
              <input id={`vh2o-admin-menu-item-price-${item.id}`} value={draft.price} inputMode="decimal" onChange={(e) => setDraft({ ...draft, price: e.target.value })} style={smallInput} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor={`vh2o-admin-menu-item-unit-${item.id}`} style={{ ...styles.fieldLabel, marginBottom: 0 }}>Unit</label>
              <input id={`vh2o-admin-menu-item-unit-${item.id}`} value={draft.unit} placeholder="each" onChange={(e) => setDraft({ ...draft, unit: e.target.value })} style={smallInput} />
            </div>
          </div>
          <label htmlFor={`vh2o-admin-menu-item-description-${item.id}`} style={{ ...styles.fieldLabel, marginBottom: 0 }}>Description</label>
          <textarea id={`vh2o-admin-menu-item-description-${item.id}`} value={draft.description} rows={2} onChange={(e) => setDraft({ ...draft, description: e.target.value })} style={{ ...smallInput, resize: "vertical" }} />
          <label style={{ fontSize: 12, color: "var(--vh2o-text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
            <input id={`vh2o-admin-menu-item-hidden-toggle-${item.id}`} type="checkbox" checked={draft.hidden} onChange={(e) => setDraft({ ...draft, hidden: e.target.checked })} />
            Hidden from the menu
          </label>
          {item.sizeTiers && (
            <SizesForm idPrefix={`vh2o-admin-menu-item-${item.id}`} title="This item's own sizes" sizes={item.sizeTiers}
              onSave={(sizes) => onSave(item.id, { size_tiers: sizes })} />
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button id={`vh2o-admin-menu-item-save-${item.id}`} type="submit" style={{ ...styles.loginBtn, marginTop: 0, flex: 1 }}>Save</button>
            <button id={`vh2o-admin-menu-item-cancel-${item.id}`} type="button" style={subtleButton} onClick={() => { setEditing(false); setConfirmDelete(false); }}>Cancel</button>
            {!confirmDelete ? (
              <button id={`vh2o-admin-menu-item-delete-${item.id}`} type="button" style={dangerButton} onClick={() => setConfirmDelete(true)}>Remove…</button>
            ) : (
              <button id={`vh2o-admin-menu-item-delete-confirm-${item.id}`} type="button" style={dangerButton}
                onClick={async () => setResult(await onDelete(item.id))}>Remove for good</button>
            )}
          </div>
          {confirmDelete && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--vh2o-text-muted)" }}>
              Removing deletes the item. To take it off the menu for a while, tick Hidden instead.
            </p>
          )}
        </form>
      )}
      <Message id={`vh2o-admin-menu-item-result-${item.id}`} result={result} />
    </div>
  );
}

// ---------- Adding an item ----------

function AddItemForm({ category, nextSortOrder, onAdd }) {
  const empty = { name: "", price: "", unit: "", description: "" };
  const [draft, setDraft] = useState(empty);
  const [result, setResult] = useState(null);
  const add = async (e) => {
    e.preventDefault();
    const price = parsePrice(draft.price);
    if (price === undefined) return setResult({ ok: false, message: "Enter a price like 4.50" });
    if (price === null && !category.sizeTiers) return setResult({ ok: false, message: "This item needs a price" });
    const added = await onAdd(category.id, {
      name: draft.name.trim(), price, unit: draft.unit.trim() || null,
      description: draft.description.trim() || null, sort_order: nextSortOrder,
    });
    setResult(added);
    if (added.ok) setDraft(empty);
  };
  return (
    <form id="vh2o-admin-menu-add-form" onSubmit={add} style={{ ...card, padding: 10 }}>
      <div style={styles.fieldLabel}>Add an item to {category.name}</div>
      <input id="vh2o-admin-menu-add-name" aria-label="New item name" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={smallInput} required />
      <div style={{ display: "flex", gap: 6 }}>
        <input id="vh2o-admin-menu-add-price" aria-label="New item price" placeholder={category.sizeTiers ? "Price (blank = sizes)" : "Price"} value={draft.price} inputMode="decimal" onChange={(e) => setDraft({ ...draft, price: e.target.value })} style={{ ...smallInput, flex: 1 }} />
        <input id="vh2o-admin-menu-add-unit" aria-label="New item unit" placeholder="Unit (each)" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} style={{ ...smallInput, flex: 1 }} />
      </div>
      <input id="vh2o-admin-menu-add-description" aria-label="New item description" placeholder="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} style={smallInput} />
      <button id="vh2o-admin-menu-add-submit" type="submit" style={{ ...styles.loginBtn, marginTop: 0 }}>Add item</button>
      <Message id="vh2o-admin-menu-add-result" result={result} />
    </form>
  );
}

// ---------- The page ----------

export default function MenuEditor() {
  const {
    status, categories, store, reloadMenu, addMenuItem, saveMenuItem, deleteMenuItem,
    saveCategorySizes, saveStoreInfo, fetchMenuChanges,
  } = useMenu();
  const [categoryId, setCategoryId] = useState(null);
  const [changes, setChanges] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const category = categories.find((c) => c.id === categoryId) || categories[0] || null;

  // The menu may have loaded before the admin signed in, without hidden items: load it again.
  useEffect(() => {
    void reloadMenu();
  }, [reloadMenu]);

  useEffect(() => {
    let active = true;
    fetchMenuChanges(20).then((result) => {
      if (active) setChanges(result.ok ? result.changes : []);
    });
    return () => {
      active = false;
    };
  }, [historyVersion, fetchMenuChanges]);

  // Each save reloads the menu (in MenuProvider) and the change history (here).
  const afterSave = (action) => async (...args) => {
    const result = await action(...args);
    if (result.ok) setHistoryVersion((v) => v + 1);
    return result;
  };

  if (status === "loading") return <p id="vh2o-admin-menu-loading" className="vh2o-admin-muted">Loading the menu…</p>;
  if (status !== "live" || !category || !store) {
    return <p id="vh2o-admin-menu-unavailable" style={{ color: "var(--vh2o-danger)" }}>The menu can&apos;t be loaded right now, so it can&apos;t be edited. Try again in a moment.</p>;
  }

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || id;
  const nextSortOrder = Math.max(0, ...category.items.map((i) => i.sortOrder)) + 10;

  return (
    <div id="vh2o-admin-menu" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
      <StoreForm key={JSON.stringify(store)} store={store} onSave={afterSave(saveStoreInfo)} />

      <div style={card}>
        <div style={styles.sectionTitle}>Menu</div>
        <label htmlFor="vh2o-admin-menu-category-select" style={styles.fieldLabel}>Category</label>
        <select id="vh2o-admin-menu-category-select" value={category.id} onChange={(e) => setCategoryId(e.target.value)} style={smallInput}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.items.length})</option>)}
        </select>
        {category.sizeTiers && (
          <SizesForm key={`${category.id}-${JSON.stringify(category.sizeTiers)}`} idPrefix={`vh2o-admin-menu-category-${category.id}`}
            title={`${category.name} sizes (every item without its own price)`} sizes={category.sizeTiers}
            onSave={afterSave((sizes) => saveCategorySizes(category.id, sizes))} />
        )}
        <div id="vh2o-admin-menu-items" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {category.items.map((item) => (
            <ItemRow key={item.id} item={item} category={category}
              onSave={afterSave(saveMenuItem)} onDelete={afterSave(deleteMenuItem)} />
          ))}
        </div>
        <AddItemForm key={category.id} category={category} nextSortOrder={nextSortOrder} onAdd={afterSave(addMenuItem)} />
      </div>

      <div id="vh2o-admin-menu-history" style={card}>
        <div style={styles.sectionTitle}>Recent changes</div>
        {changes === null ? (
          <p className="vh2o-admin-muted" style={{ margin: 0 }}>Loading…</p>
        ) : changes.length === 0 ? (
          <p id="vh2o-admin-menu-history-empty" className="vh2o-admin-muted" style={{ margin: 0 }}>No changes made in the app yet.</p>
        ) : (
          changes.map((change) => (
            <div id={`vh2o-admin-menu-history-${change.id}`} key={change.id} style={{ fontSize: 12, color: "var(--vh2o-text-muted)" }}>
              <span style={{ color: "var(--vh2o-text-subtle)" }}>{new Date(change.changed_at).toLocaleString()}</span>
              {" · "}{describeMenuChange(change, categoryName)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

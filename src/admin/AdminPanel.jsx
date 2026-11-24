import { useEffect, useState } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import { useUser } from "../userContext";
import { ICON_SIZE, buttonProps, useDialog } from "../lib/ui";
import { WATER_TYPE_LABELS, isActiveCustomer } from "../lib/customers";
import { styles } from "../styles";
import AdminUserRow from "./AdminUserRow";
import AssistantPanel from "./AssistantPanel";

// The admin's Home tab: the "Ask the ledger" assistant, Add customer, customer search/list beside
// one customer's card, plus the credit/debit confirmation and full-history sheets. The list state
// (search, filter, sort, selection) and the assistant conversation come from MainApp in `view`
// so they survive switching tabs. The database does the searching (searchCustomers()), so only the
// customers a search matched ever reach this screen.
export default function AdminPanel({ view, sizeClass }) {
  const {
    adjustGallons, fetchUserHistory, updateWaterType, setCustomerEmail, anonymizeCustomer, addCustomer,
    searchCustomers, getCustomer, fetchCustomerSummary,
  } = useUser();
  const {
    searchQuery, setSearchQuery, adminFilter, setAdminFilter, adminSort, setAdminSort,
    selectedCustomerId, setSelectedCustomerId, showCustomerDetail, setShowCustomerDetail,
    assistantTurns, setAssistantTurns,
  } = view;
  const [pendingAdjustment, setPendingAdjustment] = useState(null); // { user, amount, note }
  const [adjustmentError, setAdjustmentError] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [historyUser, setHistoryUser] = useState(null);
  const [historyTransactions, setHistoryTransactions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [addCustomerError, setAddCustomerError] = useState("");
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  // Search results, tagged with the search they answer, so a slow response never shows under a
  // newer query.
  const [results, setResults] = useState({ key: "", customers: [], totalMatches: 0, error: "" });
  const [summary, setSummary] = useState(null); // { total, active }
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  // Bumped after every successful edit, so the list, summary, and details panel re-fetch.
  const [dataVersion, setDataVersion] = useState(0);
  const refreshData = () => setDataVersion((v) => v + 1);

  // Nothing is listed until 3+ characters are typed, so customer names and balances aren't on
  // show at a glance to anyone who can see the admin screen. The database enforces it too.
  const trimmedQuery = searchQuery.trim();
  const canSearch = trimmedQuery.length >= 3;
  const searchKey = `${trimmedQuery}|${adminFilter}|${adminSort}|${dataVersion}`;

  useEffect(() => {
    if (!canSearch) {
      return undefined;
    }
    let cancelled = false;
    // A short pause after typing, so each keystroke isn't its own request.
    const timer = setTimeout(async () => {
      const result = await searchCustomers({ query: trimmedQuery, filter: adminFilter, sort: adminSort });
      if (cancelled) return;
      setResults(result.ok
        ? { key: searchKey, customers: result.customers, totalMatches: result.totalMatches, error: "" }
        : { key: searchKey, customers: [], totalMatches: 0, error: result.message || "Search failed" });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canSearch, trimmedQuery, adminFilter, adminSort, searchKey, searchCustomers]);

  useEffect(() => {
    let cancelled = false;
    fetchCustomerSummary().then((result) => {
      if (!cancelled && result.ok) setSummary({ total: result.total, active: result.active });
    });
    return () => {
      cancelled = true;
    };
  }, [dataVersion, fetchCustomerSummary]);

  useEffect(() => {
    if (selectedCustomerId == null) {
      return undefined;
    }
    let cancelled = false;
    getCustomer(selectedCustomerId).then((result) => {
      if (!cancelled && result.ok) setSelectedCustomer(result.customer);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, dataVersion, getCustomer]);
  const confirmSheetRef = useDialog(Boolean(pendingAdjustment), () => {
    if (!isAdjusting) setPendingAdjustment(null);
  });
  const historySheetRef = useDialog(Boolean(historyUser), () => setHistoryUser(null));

  const requestAdjustment = (user, amount, note) => {
    setAdjustmentError("");
    setPendingAdjustment({ user, amount, note });
  };

  const confirmAdjustment = async () => {
    if (!pendingAdjustment) {
      return;
    }
    setIsAdjusting(true);
    setAdjustmentError("");
    const result = await adjustGallons(pendingAdjustment.user.profileId, pendingAdjustment.amount, pendingAdjustment.note);
    setIsAdjusting(false);
    if (!result.ok) {
      setAdjustmentError(result.message || "Unable to apply this change");
      return;
    }
    setPendingAdjustment(null);
    refreshData();
  };

  // Runs an edit, then re-fetches what's on screen if it worked. Returns the edit's result.
  const thenRefresh = async (edit) => {
    const result = await edit;
    if (result.ok) refreshData();
    return result;
  };
  const handleUpdateWaterType = (user, waterType) => thenRefresh(updateWaterType(user.profileId, waterType));
  const handleSetEmail = (user, email) => thenRefresh(setCustomerEmail(user.profileId, email));

  const cancelAddCustomer = () => {
    setIsAddingCustomer(false);
    setNewCustomerName("");
    setNewCustomerEmail("");
    setAddCustomerError("");
  };

  // Saves the new record, then opens it: searching its customer number lists and selects it.
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    setAddCustomerError("");
    setIsSavingCustomer(true);
    const result = await addCustomer(newCustomerName.trim(), newCustomerEmail.trim());
    setIsSavingCustomer(false);
    if (!result.ok) {
      setAddCustomerError(result.message || "Unable to add the customer");
      return;
    }
    cancelAddCustomer();
    refreshData();
    setSearchQuery(String(result.customerId));
    setAdminFilter("all");
    setSelectedCustomerId(result.customerId);
    setShowCustomerDetail(true);
  };
  const handleAnonymizeCustomer = (user) => thenRefresh(anonymizeCustomer(user.profileId));

  const openHistory = async (user) => {
    setHistoryUser(user);
    setHistoryTransactions([]);
    setHistoryError("");
    setHistoryLoading(true);
    const result = await fetchUserHistory(user.profileId);
    setHistoryLoading(false);
    if (!result.ok) {
      setHistoryError(result.message || "Unable to load history");
      return;
    }
    setHistoryTransactions(result.transactions);
  };

  return (
    <>
      <div id="vh2o-admin-manage-users" className="vh2o-admin" style={{ marginTop: 20 }}>
        <div id="vh2o-admin-manage-users-title" style={styles.sectionTitle}>Admin: Customers</div>
        <AssistantPanel turns={assistantTurns} setTurns={setAssistantTurns} />
        {(() => {
          const pct = summary?.total > 0 ? Math.round((summary.active / summary.total) * 100) : 0;
          // Results for an older search (or none yet) aren't shown under the current one.
          const isCurrent = canSearch && results.key === searchKey;
          const shown = isCurrent ? results.customers : [];
          const selected = selectedCustomer?.id === selectedCustomerId
            ? selectedCustomer
            : shown.find((u) => u.id === selectedCustomerId) || null;
          const isPhone = sizeClass === "phone";
          const showList = !isPhone || !showCustomerDetail || !selected;
          const showDetail = !isPhone || (showCustomerDetail && selected);

          const list = (
            <div id="vh2o-admin-customer-list" className="vh2o-admin-list">
              <div id="vh2o-admin-active-summary" className="vh2o-admin-muted" style={{ textAlign: "center" }}>
                {summary ? `${summary.active} active / ${summary.total} total customers (${pct}%)` : "\u00a0"}
              </div>
              {isAddingCustomer ? (
                <form id="vh2o-admin-add-customer-form" onSubmit={handleAddCustomer} className="vh2o-admin-add-customer">
                  <label htmlFor="vh2o-admin-add-customer-name-input" style={styles.fieldLabel}>Name</label>
                  <input
                    id="vh2o-admin-add-customer-name-input"
                    type="text"
                    autoComplete="off"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    style={styles.input}
                    required
                  />
                  <label htmlFor="vh2o-admin-add-customer-email-input" style={styles.fieldLabel}>Email (they sign in with it)</label>
                  <input
                    id="vh2o-admin-add-customer-email-input"
                    type="email"
                    autoComplete="off"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    style={styles.input}
                    required
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button id="vh2o-admin-add-customer-cancel-btn" type="button" onClick={cancelAddCustomer} className="vh2o-chip" style={{ flex: 1 }}>
                      Cancel
                    </button>
                    <button
                      id="vh2o-admin-add-customer-submit"
                      type="submit"
                      disabled={isSavingCustomer}
                      style={{ ...styles.loginBtn, flex: 1, marginTop: 0, opacity: isSavingCustomer ? 0.6 : 1 }}
                    >
                      {isSavingCustomer ? "Adding…" : "Add customer"}
                    </button>
                  </div>
                  {addCustomerError && (
                    <p id="vh2o-admin-add-customer-error" style={{ color: "var(--vh2o-danger)", fontSize: 12, marginTop: 8 }}>{addCustomerError}</p>
                  )}
                </form>
              ) : (
                <button id="vh2o-admin-add-customer-btn" type="button" className="vh2o-chip" onClick={() => setIsAddingCustomer(true)}>
                  + Add customer
                </button>
              )}
              <div>
                <label htmlFor="vh2o-admin-user-search-input" style={styles.fieldLabel}>Search customers</label>
                <input
                  id="vh2o-admin-user-search-input"
                  type="text"
                  placeholder="Type 3+ characters of a name, email, or ID"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ ...styles.input, marginBottom: 0 }}
                />
              </div>
              <div className="vh2o-chip-row" role="group" aria-label="Filter customers">
                {[["all", "All"], ["active", "Active"], ["inactive", "Inactive"], ["nologin", "No login yet"]].map(([value, label]) => (
                  <button
                    key={value}
                    id={`vh2o-admin-filter-${value}`}
                    type="button"
                    className="vh2o-chip"
                    aria-pressed={adminFilter === value}
                    onClick={() => setAdminFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="vh2o-admin-sort">
                <label htmlFor="vh2o-admin-sort-select">Sort</label>
                <select id="vh2o-admin-sort-select" value={adminSort} onChange={(e) => setAdminSort(e.target.value)}>
                  <option value="name">Name</option>
                  <option value="gallons">Gallons</option>
                </select>
                {isCurrent && !results.error && (
                  <span id="vh2o-admin-customer-count" style={{ marginLeft: "auto" }}>
                    {results.totalMatches} of {summary?.total ?? "?"}
                  </span>
                )}
              </div>
              <div className="vh2o-admin-rows">
                {!canSearch ? (
                  <p id="vh2o-admin-user-search-hint" className="vh2o-admin-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                    Type at least 3 characters of a name, email, or ID to look up a customer
                  </p>
                ) : !isCurrent ? (
                  <p id="vh2o-admin-customer-searching" className="vh2o-admin-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                    Searching…
                  </p>
                ) : results.error ? (
                  <p id="vh2o-admin-customer-search-error" style={{ color: "var(--vh2o-danger)", textAlign: "center", padding: "20px 0" }}>
                    {results.error}
                  </p>
                ) : shown.length === 0 ? (
                  <p id="vh2o-admin-customer-empty" className="vh2o-admin-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                    No customers match. Try a different name or filter.
                  </p>
                ) : shown.map((u) => {
                  const rowActive = isActiveCustomer(u);
                  return (
                    <div
                      key={u.id}
                      id={`vh2o-admin-customer-row-${u.id}`}
                      className="vh2o-admin-row"
                      aria-current={!isPhone && u.id === selectedCustomerId ? "true" : undefined}
                      {...buttonProps(() => {
                        setSelectedCustomerId(u.id);
                        setShowCustomerDetail(true);
                      })}
                    >
                      <span className="vh2o-admin-row-name">{u.name} <span className="vh2o-admin-muted">#{u.id}</span></span>
                      <span className="vh2o-admin-row-gallons">{u.gallons.toLocaleString()} gal</span>
                      <span className="vh2o-admin-row-email">{u.email || "No email yet"}</span>
                      <span className="vh2o-admin-row-meta">
                        {WATER_TYPE_LABELS[u.waterType] || "No water type"}
                        {" · "}
                        <span className={`vh2o-status-pill ${u.hasLogin ? (rowActive ? "is-active" : "is-inactive") : "is-nologin"}`}>
                          {u.hasLogin ? (rowActive ? "Active" : "Inactive") : u.anonymizedAt ? "Deleted" : "No login"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );

          const detail = selected ? (
            <div id="vh2o-admin-customer-detail" className="vh2o-admin-detail-panel">
              {isPhone && (
                <button id="vh2o-admin-back-btn" type="button" className="vh2o-admin-back" onClick={() => setShowCustomerDetail(false)}>
                  <ChevronLeft size={ICON_SIZE.inline + 2} aria-hidden="true" /> All customers
                </button>
              )}
              <AdminUserRow
                key={selected.id}
                user={selected}
                onRequestAdjustment={requestAdjustment}
                onViewHistory={openHistory}
                onUpdateWaterType={handleUpdateWaterType}
                onSetEmail={handleSetEmail}
                onAnonymize={handleAnonymizeCustomer}
              />
            </div>
          ) : (
            <p id="vh2o-admin-customer-detail-empty" className="vh2o-admin-detail-panel vh2o-admin-placeholder">
              Select a customer to see their balance, adjust gallons, or view history.
            </p>
          );

          return (
            <div className="vh2o-admin-panels">
              {showList && list}
              {showDetail && detail}
            </div>
          );
        })()}
      </div>

      {/* Credit/debit confirmation sheet */}
      {pendingAdjustment && (
        <div
          id="vh2o-admin-confirm-overlay"
          style={{
            position: "absolute", inset: 0,
            background: "var(--vh2o-scrim)",
            display: "flex", alignItems: "flex-end",
            zIndex: 100,
          }}
          onClick={() => !isAdjusting && setPendingAdjustment(null)}
        >
          <div
            id="vh2o-admin-confirm-sheet"
            ref={confirmSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm gallon adjustment"
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
              Confirm {pendingAdjustment.amount > 0 ? "Bought Today" : "Filled Today"}
            </div>
            <div id="vh2o-admin-confirm-message" style={{ fontSize: 14, color: "var(--vh2o-text)", textAlign: "center", lineHeight: 1.6 }}>
              <strong>{pendingAdjustment.user.name}</strong> {pendingAdjustment.amount > 0 ? "bought" : "filled"} <strong>{Math.abs(pendingAdjustment.amount)} gal</strong> today
              <br />
              New balance: {pendingAdjustment.user.gallons} → {Math.max(0, pendingAdjustment.user.gallons + pendingAdjustment.amount)}
              {pendingAdjustment.note && (
                <>
                  <br />
                  <span style={{ color: "var(--vh2o-text-muted)", fontSize: 12 }}>Note: {pendingAdjustment.note}</span>
                </>
              )}
            </div>
            {adjustmentError && (
              <p id="vh2o-admin-confirm-error" style={{ color: "var(--vh2o-danger)", fontSize: 12, textAlign: "center" }}>{adjustmentError}</p>
            )}
            <button
              id="vh2o-admin-confirm-submit"
              onClick={confirmAdjustment}
              disabled={isAdjusting}
              style={{ ...styles.loginBtn, opacity: isAdjusting ? 0.6 : 1 }}
            >
              {isAdjusting ? "Applying…" : "Confirm"}
            </button>
            <button
              id="vh2o-admin-confirm-cancel"
              onClick={() => setPendingAdjustment(null)}
              disabled={isAdjusting}
              style={{
                padding: "12px",
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

      {/* Full transaction history sheet */}
      {historyUser && (
        <div
          id="vh2o-admin-history-overlay"
          style={{
            position: "absolute", inset: 0,
            background: "var(--vh2o-scrim)",
            display: "flex", alignItems: "flex-end",
            zIndex: 100,
          }}
          onClick={() => setHistoryUser(null)}
        >
          <div
            id="vh2o-admin-history-sheet"
            ref={historySheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Transaction history"
            style={{
              width: "100%",
              maxHeight: "70vh",
              overflowY: "auto",
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
            <div id="vh2o-admin-history-title" style={{ fontSize: 12, fontWeight: 800, color: "var(--vh2o-text-subtle)", letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
              Full History — {historyUser.name}
            </div>
            {historyLoading && (
              <p style={{ color: "var(--vh2o-text-subtle)", textAlign: "center" }}>Loading…</p>
            )}
            {historyError && (
              <p style={{ color: "var(--vh2o-danger)", textAlign: "center" }}>{historyError}</p>
            )}
            {!historyLoading && !historyError && historyTransactions.length === 0 && (
              <p id="vh2o-admin-history-empty" style={{ color: "var(--vh2o-text-subtle)", textAlign: "center" }}>No transactions yet</p>
            )}
            {!historyLoading && historyTransactions.map((tx) => (
              <div id={`vh2o-admin-history-row-${tx.id}`} key={tx.id} style={styles.notificationCard}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...styles.notificationTitle, color: tx.type === "credit" ? "var(--vh2o-accent-soft)" : "var(--vh2o-danger)" }}>
                    {tx.type === "credit"
                      ? <Plus size={ICON_SIZE.inline} aria-hidden="true" style={{ verticalAlign: "-2px" }} />
                      : <Minus size={ICON_SIZE.inline} aria-hidden="true" style={{ verticalAlign: "-2px" }} />}
                    {" "}{tx.type === "credit" ? "Bought" : "Filled"} {Math.abs(tx.amount)} gal
                  </div>
                  <div style={styles.notificationTime}>{tx.displayTime}</div>
                  <div style={styles.notificationDetails}>Balance: {tx.previousBalance} → {tx.newBalance}</div>
                  {tx.note && <div style={{ ...styles.notificationDetails, fontStyle: "italic" }}>{tx.note}</div>}
                </div>
              </div>
            ))}
            <button
              id="vh2o-admin-history-close-btn"
              onClick={() => setHistoryUser(null)}
              style={{
                padding: "12px",
                background: "var(--vh2o-surface-subtle)",
                border: "1px solid var(--vh2o-border)",
                borderRadius: 14, color: "var(--vh2o-text-muted)",
                fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

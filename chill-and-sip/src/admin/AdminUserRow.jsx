import { useState } from "react";
import { isActiveCustomer } from "../lib/customers";
import { styles } from "../styles";

// One customer's admin card: balance, water type, claim code, credit/debit, and data deletion.
export default function AdminUserRow({ user, onRequestAdjustment, onViewHistory, onUpdateWaterType, onGenerateClaimCode, onAnonymize }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  // Deleting a customer's data can't be undone, so it takes typing their customer ID.
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteConfirmed = deleteConfirmText.trim() === String(user.id);

  const submit = (direction) => {
    const parsed = parseInt(amount, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    onRequestAdjustment(user, direction === "credit" ? parsed : -parsed, note.trim());
    setAmount("");
    setNote("");
  };

  const handleGenerateCode = async () => {
    setCodeError("");
    setIsGeneratingCode(true);
    const result = await onGenerateClaimCode(user);
    setIsGeneratingCode(false);
    if (!result.ok) {
      setCodeError(result.message || "Unable to generate code");
      return;
    }
    setGeneratedCode(result.code);
  };

  const cancelDelete = () => {
    setIsConfirmingDelete(false);
    setDeleteConfirmText("");
    setDeleteError("");
  };

  const handleDelete = async () => {
    if (!deleteConfirmed) {
      return;
    }
    setDeleteError("");
    setIsDeleting(true);
    const result = await onAnonymize(user);
    setIsDeleting(false);
    if (!result.ok) {
      setDeleteError(result.message || "Unable to delete this customer's data");
      return;
    }
    cancelDelete();
  };

  const active = isActiveCustomer(user);
  const lastActivity = user.lastTransactionAt ? new Date(user.lastTransactionAt).toLocaleDateString() : "None yet";

  return (
    <div id={`vh2o-admin-user-card-${user.id}`} className="vh2o-admin-detail" style={{ ...styles.rewardCard, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div className="vh2o-admin-detail-head">
        <div style={{ minWidth: 0 }}>
          <div id={`vh2o-admin-user-name-${user.id}`} className="vh2o-admin-detail-name">{user.name}</div>
          <div className="vh2o-admin-muted">#{user.id} · {user.email || "No email yet"}</div>
        </div>
        <div id={`vh2o-admin-user-gallons-${user.id}`} className="vh2o-admin-detail-balance">
          <span className="vh2o-admin-detail-gallons">{user.gallons.toLocaleString()}</span>
          <span className="vh2o-admin-muted">gallons</span>
        </div>
      </div>
      <div className="vh2o-admin-detail-facts">
        <span
          id={`vh2o-admin-user-status-${user.id}`}
          className={`vh2o-status-pill ${active ? "is-active" : "is-inactive"}`}
        >
          {active ? "Active" : "Inactive"}
        </span>
        {user.anonymizedAt ? (
          <span id={`vh2o-admin-user-data-deleted-${user.id}`} className="vh2o-status-pill is-nologin">
            Data deleted {new Date(user.anonymizedAt).toLocaleDateString()}
          </span>
        ) : (
          !user.authUserId && <span className="vh2o-status-pill is-nologin">No login yet</span>
        )}
        <span className="vh2o-admin-muted">Member since {user.memberSince}</span>
        <span className="vh2o-admin-muted">Last activity {lastActivity}</span>
        <button
          id={`vh2o-admin-user-history-btn-${user.id}`}
          type="button"
          onClick={() => onViewHistory(user)}
          style={{
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(148,163,184,0.1)",
            color: "var(--vh2o-text-muted)",
            borderRadius: 10, padding: "6px 10px",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          History
        </button>
      </div>
      <label htmlFor={`vh2o-admin-user-water-type-select-${user.id}`} style={{ ...styles.fieldLabel, marginBottom: -4 }}>Water type</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          id={`vh2o-admin-user-water-type-select-${user.id}`}
          aria-label={`Water type for ${user.name || user.email}`}
          value={user.waterType || ""}
          onChange={(e) => onUpdateWaterType(user, e.target.value || null)}
          style={{ ...styles.input, marginBottom: 0, padding: "6px", flex: 1 }}
        >
          <option value="">No water type</option>
          <option value="purified">Purified</option>
          <option value="remineralized">Remineralized</option>
          <option value="alkaline">Alkaline</option>
        </select>
      </div>
      {!user.authUserId && !user.anonymizedAt && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            id={`vh2o-admin-user-generate-code-btn-${user.id}`}
            type="button"
            onClick={handleGenerateCode}
            disabled={isGeneratingCode}
            style={{
              border: "1px solid rgba(167,139,250,0.4)",
              background: "rgba(167,139,250,0.12)",
              color: "#a78bfa",
              borderRadius: 10, padding: "8px",
              fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              opacity: isGeneratingCode ? 0.6 : 1,
            }}
          >
            {isGeneratingCode ? "Generating…" : user.hasClaimCode ? "Regenerate Claim Code" : "Generate Claim Code"}
          </button>
          {generatedCode && (
            <div
              id={`vh2o-admin-user-claim-code-${user.id}`}
              style={{ fontSize: 14, fontWeight: 800, color: "var(--vh2o-accent-soft)", textAlign: "center", padding: "8px", background: "rgba(56,189,248,0.1)", borderRadius: 8, letterSpacing: 1 }}
            >
              {generatedCode}
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--vh2o-text-subtle)", marginTop: 2, letterSpacing: 0 }}>
                Give this + their Customer ID ({user.id}) to the customer
              </div>
            </div>
          )}
          {codeError && (
            <p id={`vh2o-admin-user-claim-code-error-${user.id}`} style={{ color: "var(--vh2o-danger)", fontSize: 12, textAlign: "center" }}>{codeError}</p>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ width: 90 }}>
          <label htmlFor={`vh2o-admin-user-amount-input-${user.id}`} style={styles.fieldLabel}>Gallons</label>
          <input
            id={`vh2o-admin-user-amount-input-${user.id}`}
            aria-label={`Gallons for ${user.name || user.email}`}
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ ...styles.input, padding: "6px", marginBottom: 0 }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor={`vh2o-admin-user-note-input-${user.id}`} style={styles.fieldLabel}>Note (optional)</label>
          <input
            id={`vh2o-admin-user-note-input-${user.id}`}
            aria-label={`Note for ${user.name || user.email}`}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ ...styles.input, padding: "6px", marginBottom: 0 }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          id={`vh2o-admin-user-credit-btn-${user.id}`}
          type="button"
          onClick={() => submit("credit")}
          style={{
            flex: 1,
            border: "1px solid rgba(52,211,153,0.4)",
            background: "rgba(52,211,153,0.15)",
            color: "var(--vh2o-success)",
            borderRadius: 10, padding: "8px",
            fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Bought Today
        </button>
        <button
          id={`vh2o-admin-user-debit-btn-${user.id}`}
          type="button"
          onClick={() => submit("debit")}
          style={{
            flex: 1,
            border: "1px solid rgba(248,113,113,0.4)",
            background: "rgba(248,113,113,0.12)",
            color: "var(--vh2o-danger)",
            borderRadius: 10, padding: "8px",
            fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Filled Today
        </button>
      </div>
      {!user.anonymizedAt && !isConfirmingDelete && (
        <button
          id={`vh2o-admin-user-delete-data-btn-${user.id}`}
          type="button"
          onClick={() => setIsConfirmingDelete(true)}
          style={{
            border: "none", background: "transparent", color: "var(--vh2o-danger)",
            padding: "8px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            textDecoration: "underline", alignSelf: "center",
          }}
        >
          Delete personal data…
        </button>
      )}
      {!user.anonymizedAt && isConfirmingDelete && (
        <div
          id={`vh2o-admin-user-delete-data-confirm-${user.id}`}
          style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 10, border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.08)" }}
        >
          <p style={{ margin: 0, fontSize: 12, color: "var(--vh2o-text-muted)" }}>
            For an account-deletion request. This removes the customer's name and email, deletes
            their login, and forfeits any remaining balance ({user.gallons.toLocaleString()} gallons).
            Their transactions are kept for records, no longer linked to them. This can't be undone.
          </p>
          <label htmlFor={`vh2o-admin-user-delete-data-input-${user.id}`} style={{ ...styles.fieldLabel, marginBottom: -4 }}>
            Type the customer ID ({user.id}) to confirm
          </label>
          <input
            id={`vh2o-admin-user-delete-data-input-${user.id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            style={{ ...styles.input, padding: "6px", marginBottom: 0 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              id={`vh2o-admin-user-delete-data-cancel-btn-${user.id}`}
              type="button"
              onClick={cancelDelete}
              disabled={isDeleting}
              style={{
                flex: 1,
                border: "1px solid rgba(148,163,184,0.35)", background: "rgba(148,163,184,0.1)",
                color: "var(--vh2o-text-muted)", borderRadius: 10, padding: "8px",
                fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
            <button
              id={`vh2o-admin-user-delete-data-confirm-btn-${user.id}`}
              type="button"
              onClick={handleDelete}
              disabled={!deleteConfirmed || isDeleting}
              style={{
                flex: 1,
                border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.15)",
                color: "var(--vh2o-danger)", borderRadius: 10, padding: "8px",
                fontSize: 12, fontWeight: 800, cursor: deleteConfirmed ? "pointer" : "not-allowed", fontFamily: "inherit",
                opacity: !deleteConfirmed || isDeleting ? 0.6 : 1,
              }}
            >
              {isDeleting ? "Deleting…" : "Delete data"}
            </button>
          </div>
          {deleteError && (
            <p id={`vh2o-admin-user-delete-data-error-${user.id}`} style={{ margin: 0, color: "var(--vh2o-danger)", fontSize: 12, textAlign: "center" }}>{deleteError}</p>
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { ChevronDown, MessageSquareText } from "lucide-react";
import { useUser } from "../userContext";
import { ICON_SIZE } from "../lib/ui";
import { styles } from "../styles";

const EXAMPLES = [
  "How much prepaid balance is outstanding?",
  "Who hasn't come in for 60 days?",
  "What were last week's busiest days?",
];

// Owner-readable names for the admin-assistant Edge Function's tools.
const TOOL_LABELS = {
  balance_summary: "Store totals",
  customers_inactive_since: "Customers not seen since",
  visits_by_day: "Visits by day",
  top_customers: "Top customers",
  customer_lookup: "Customer lookup",
  customer_history: "Customer history",
};

const formatArgs = (args) =>
  Object.entries(args || {}).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ");

// "Ask the ledger": plain-language questions about customers, balances, and visits, answered by
// the admin-assistant Edge Function from read-only lookups. Each answer lists the lookups it
// used. The conversation (`turns`) lives in MainApp so it survives switching tabs.
export default function AssistantPanel({ turns, setTurns }) {
  const { askAssistant } = useUser();
  const [open, setOpen] = useState(turns.length > 0);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  const ask = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || asking) {
      return;
    }
    setAsking(true);
    setError("");
    const history = turns.map(({ question: q, answer }) => ({ question: q, answer })).slice(-4);
    const result = await askAssistant(trimmed, history);
    setAsking(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTurns((previous) => [...previous, { question: trimmed, answer: result.answer, toolCalls: result.toolCalls }]);
    setQuestion("");
  };

  return (
    <section id="vh2o-admin-assistant" className="vh2o-assistant">
      <button
        id="vh2o-admin-assistant-toggle"
        type="button"
        className="vh2o-assistant-toggle"
        aria-expanded={open}
        aria-controls="vh2o-admin-assistant-body"
        onClick={() => setOpen((value) => !value)}
      >
        <MessageSquareText size={ICON_SIZE.md} aria-hidden="true" />
        <span>Ask the ledger</span>
        <ChevronDown size={ICON_SIZE.md} aria-hidden="true" className="vh2o-assistant-chevron" />
      </button>

      {open && (
        <div id="vh2o-admin-assistant-body" className="vh2o-assistant-body">
          <p className="vh2o-admin-muted">
            Ask about customers, balances, and visits. Answers come only from read-only lookups, listed under each
            answer. It can't change anything.
          </p>

          {turns.length === 0 && (
            <div className="vh2o-chip-row" role="group" aria-label="Example questions">
              {EXAMPLES.map((example, index) => (
                <button
                  key={example}
                  id={`vh2o-admin-assistant-example-${index}`}
                  type="button"
                  className="vh2o-chip"
                  disabled={asking}
                  onClick={() => {
                    setQuestion(example);
                    ask(example);
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {turns.length > 0 && (
            <ol id="vh2o-admin-assistant-turns" className="vh2o-assistant-turns">
              {turns.map((turn, index) => (
                <li key={index} id={`vh2o-admin-assistant-turn-${index}`} className="vh2o-assistant-turn">
                  <div id={`vh2o-admin-assistant-question-${index}`} className="vh2o-assistant-question">{turn.question}</div>
                  <div id={`vh2o-admin-assistant-answer-${index}`} className="vh2o-assistant-answer">{turn.answer}</div>
                  {turn.toolCalls.length > 0 && (
                    <details id={`vh2o-admin-assistant-tools-${index}`} className="vh2o-assistant-tools">
                      <summary>Lookups used ({turn.toolCalls.length})</summary>
                      <ul>
                        {turn.toolCalls.map((call, callIndex) => (
                          <li key={callIndex}>
                            {TOOL_LABELS[call.name] || call.name}
                            {" "}<code>{call.name}({formatArgs(call.args)})</code>
                            {" — "}
                            {call.error ? `failed: ${call.error}` : `${call.rowCount ?? 0} row${call.rowCount === 1 ? "" : "s"}`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          )}

          {asking && (
            <p id="vh2o-admin-assistant-loading" className="vh2o-admin-muted" role="status">Looking that up…</p>
          )}
          {error && (
            <p id="vh2o-admin-assistant-error" role="alert" style={{ color: "var(--vh2o-danger)", fontSize: 13 }}>{error}</p>
          )}

          <form
            className="vh2o-assistant-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <label htmlFor="vh2o-admin-assistant-input" style={styles.fieldLabel}>
              {turns.length > 0 ? "Ask a follow-up" : "Your question"}
            </label>
            <textarea
              id="vh2o-admin-assistant-input"
              rows={2}
              maxLength={500}
              value={question}
              disabled={asking}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
              style={{ ...styles.input, marginBottom: 0, resize: "vertical" }}
            />
            <div className="vh2o-assistant-actions">
              <button
                id="vh2o-admin-assistant-submit"
                type="submit"
                disabled={asking || !question.trim()}
                style={{ ...styles.loginBtn, opacity: asking || !question.trim() ? 0.6 : 1 }}
              >
                {asking ? "Asking…" : "Ask"}
              </button>
              {turns.length > 0 && (
                <button
                  id="vh2o-admin-assistant-clear"
                  type="button"
                  className="vh2o-chip"
                  disabled={asking}
                  onClick={() => {
                    setTurns([]);
                    setError("");
                  }}
                >
                  Start over
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

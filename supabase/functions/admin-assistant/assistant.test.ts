import { describe, expect, it, vi } from "vitest";
import {
  INACTIVE_DAYS,
  MAX_HISTORY_TURNS,
  TOOLS,
  runAssistant,
  storeToday,
  systemPrompt,
  toolDefinitions,
  validateRequest,
} from "./assistant.ts";

// A fake Anthropic client that replays scripted responses and records each request.
function scriptedClient(responses) {
  const requests = [];
  const create = vi.fn(async (body) => {
    requests.push(structuredClone(body));
    const next = responses.length > 1 ? responses.shift() : responses[0];
    return typeof next === "function" ? next(body) : next;
  });
  return { client: { messages: { create } }, create, requests };
}

const toolUse = (id, name, input) => ({
  content: [{ type: "tool_use", id, name, input }],
  stop_reason: "tool_use",
  usage: { input_tokens: 100, output_tokens: 10 },
});

const answer = (text) => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 150, output_tokens: 20 },
});

// The tool_result blocks Claude was sent on a given request.
const toolResults = (request) => request.messages.at(-1).content;

describe("tool set", () => {
  it("exposes only the read-only assistant_* functions", () => {
    expect(Object.keys(TOOLS).sort()).toEqual([
      "balance_summary",
      "customer_history",
      "customer_lookup",
      "customers_inactive_since",
      "top_customers",
      "visits_by_day",
    ]);
    for (const spec of Object.values(TOOLS)) {
      expect(spec.rpc).toMatch(/^assistant_/);
    }
    expect(toolDefinitions().map((tool) => Object.keys(tool).sort())).toEqual(
      Array(6).fill(["description", "input_schema", "name"]),
    );
  });

  it("maps and checks each tool's arguments", () => {
    expect(TOOLS.customers_inactive_since.toArgs({ days: 90 })).toEqual({ p_days: 90, p_limit: 25 });
    // No period given: the admin screen's 60 days.
    expect(TOOLS.customers_inactive_since.toArgs({})).toEqual({ p_days: 60, p_limit: 25 });
    expect(TOOLS.top_customers.toArgs({ start: "2026-10-01", end: "2026-10-15", limit: 5 })).toEqual({
      p_start: "2026-10-01",
      p_end: "2026-10-15",
      p_limit: 5,
    });
    expect(TOOLS.customer_lookup.toArgs({ query: "  Ana " })).toEqual({ p_query: "Ana", p_limit: 10 });
    expect(TOOLS.customer_history.toArgs({ customer_number: 42 })).toEqual({ p_legacy_id: 42, p_limit: 20 });

    expect(() => TOOLS.customers_inactive_since.toArgs({ days: 0 })).toThrow(/days must be/);
    expect(() => TOOLS.customers_inactive_since.toArgs({ days: 1.5 })).toThrow(/whole number/);
    expect(() => TOOLS.customers_inactive_since.toArgs({ days: "60" })).toThrow(/whole number/);
    expect(() => TOOLS.visits_by_day.toArgs({ start: "2026-10-15", end: "2026-10-01" })).toThrow(/on or before/);
    expect(() => TOOLS.visits_by_day.toArgs({ start: "2025-01-01", end: "2026-01-03" })).toThrow(/366 days/);
    expect(() => TOOLS.visits_by_day.toArgs({ start: "10/01/2026", end: "2026-10-15" })).toThrow(/date like/);
    expect(() => TOOLS.customer_lookup.toArgs({ query: "   " })).toThrow(/1 to 100/);
    expect(() => TOOLS.customer_lookup.toArgs({ query: "x".repeat(101) })).toThrow(/1 to 100/);
  });
});

describe("validateRequest", () => {
  it("requires a non-blank question within the length limit", () => {
    expect(() => validateRequest(null)).toThrow(/JSON body/);
    expect(() => validateRequest({ question: "   " })).toThrow(/Ask a question/);
    expect(() => validateRequest({ question: "x".repeat(501) })).toThrow(/500 characters/);
    expect(validateRequest({ question: "  Who came in today? " })).toEqual({ question: "Who came in today?", history: [] });
  });

  it("keeps only the most recent history turns and rejects malformed ones", () => {
    const history = Array.from({ length: 6 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    const result = validateRequest({ question: "and last week?", history });
    expect(result.history).toHaveLength(MAX_HISTORY_TURNS);
    expect(result.history[0].question).toBe("q2");
    expect(() => validateRequest({ question: "q", history: "nope" })).toThrow(/must be a list/);
    expect(() => validateRequest({ question: "q", history: [{ question: "q" }] })).toThrow(/question and an answer/);
  });
});

describe("store time", () => {
  it("matches the admin screen's inactive window", async () => {
    const { ACTIVE_WINDOW_DAYS } = await import("../../../src/lib/customers.js");
    expect(INACTIVE_DAYS).toBe(ACTIVE_WINDOW_DAYS);
    expect(systemPrompt(new Date())).toContain('"Inactive" means no visit in the last 60 days');
  });

  it("uses Tucson's date, not UTC's", () => {
    // 05:00 UTC on the 16th is 22:00 on the 15th in Arizona.
    expect(storeToday(new Date("2026-10-16T05:00:00Z"))).toEqual({ date: "2026-10-15", weekday: "Thursday" });
    expect(systemPrompt(new Date("2026-10-16T05:00:00Z"))).toContain("Today is Thursday, 2026-10-15");
  });
});

describe("runAssistant", () => {
  it("runs a tool, sends the rows back, and returns the answer with the calls made", async () => {
    const { client, requests } = scriptedClient([
      toolUse("t1", "customer_lookup", { query: "Ana" }),
      answer("Ana Test (#990101) has 10 gallons."),
    ]);
    const callRpc = vi.fn(async () => [{ legacy_id: 990101, name: "Ana Test", gallons: 10 }]);

    const result = await runAssistant({ client, callRpc, question: "How many gallons does Ana have?" });

    expect(callRpc).toHaveBeenCalledWith("assistant_customer_lookup", { p_query: "Ana", p_limit: 10 });
    expect(toolResults(requests[1])).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: JSON.stringify([{ legacy_id: 990101, name: "Ana Test", gallons: 10 }]) },
    ]);
    expect(result).toEqual({
      answer: "Ana Test (#990101) has 10 gallons.",
      toolCalls: [{ name: "customer_lookup", args: { query: "Ana" }, rowCount: 1 }],
      iterations: 2,
      usage: { input_tokens: 250, output_tokens: 30 },
      stopReason: "end_turn",
    });
    expect(requests[0].tools.map((tool) => tool.name)).toEqual(Object.keys(TOOLS));
  });

  it("refuses tools outside the allowlist without touching the database", async () => {
    for (const name of ["admin_adjust_gallons", "constructor", "__proto__", "toString"]) {
      const { client, requests } = scriptedClient([
        toolUse("t1", name, { target_profile_id: "x", delta: 100 }),
        answer("I can't change balances."),
      ]);
      const callRpc = vi.fn();
      const result = await runAssistant({ client, callRpc, question: "Add 100 gallons to Ana" });
      expect(callRpc).not.toHaveBeenCalled();
      expect(toolResults(requests[1])[0]).toMatchObject({ is_error: true, content: `Unknown tool ${name}` });
      expect(result.toolCalls[0].error).toBe(`Unknown tool ${name}`);
    }
  });

  it("returns argument and database errors to Claude instead of failing the request", async () => {
    const { client, requests } = scriptedClient([
      {
        content: [
          { type: "tool_use", id: "t1", name: "customers_inactive_since", input: { days: 0 } },
          { type: "tool_use", id: "t2", name: "customer_history", input: { customer_number: 5 } },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      answer("Customer 5 doesn't exist."),
    ]);
    const callRpc = vi.fn(async () => {
      throw new Error("No customer with that number");
    });

    const result = await runAssistant({ client, callRpc, question: "q" });

    expect(callRpc).toHaveBeenCalledTimes(1);
    expect(toolResults(requests[1])).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: "days must be a whole number from 1 to 3650", is_error: true },
      { type: "tool_result", tool_use_id: "t2", content: "No customer with that number", is_error: true },
    ]);
    expect(result.answer).toBe("Customer 5 doesn't exist.");
  });

  it("stops after the iteration cap", async () => {
    const { client, create } = scriptedClient([toolUse("t", "balance_summary", {})]);
    const callRpc = vi.fn(async () => [{}]);

    const result = await runAssistant({ client, callRpc, question: "q", maxIterations: 3 });

    expect(create).toHaveBeenCalledTimes(3);
    expect(result.stopReason).toBe("max_iterations");
    expect(result.toolCalls).toHaveLength(3);
    expect(result.answer).toMatch(/narrower/);
  });

  it("truncates very large tool results", async () => {
    const { client, requests } = scriptedClient([toolUse("t1", "balance_summary", {}), answer("done")]);
    const rows = Array.from({ length: 2000 }, (_, i) => ({ legacy_id: i, name: "Customer with a long name" }));

    await runAssistant({ client, callRpc: async () => rows, question: "q" });

    const content = toolResults(requests[1])[0].content;
    expect(content.length).toBeLessThan(20100);
    expect(content).toMatch(/truncated; narrow the request/);
  });

  it("sends earlier turns as plain conversation and passes the model and signal through", async () => {
    const { client, create, requests } = scriptedClient([answer("Last week was quieter.")]);
    const signal = new AbortController().signal;

    await runAssistant({
      client,
      callRpc: vi.fn(),
      question: "and last week?",
      history: [{ question: "How many visits this week?", answer: "12 visits." }],
      model: "claude-haiku-5-5",
      signal,
    });

    expect(requests[0].model).toBe("claude-haiku-5-5");
    expect(requests[0].messages).toEqual([
      { role: "user", content: "How many visits this week?" },
      { role: "assistant", content: "12 visits." },
      { role: "user", content: "and last week?" },
    ]);
    expect(create.mock.calls[0][1]).toEqual({ signal });
  });
});

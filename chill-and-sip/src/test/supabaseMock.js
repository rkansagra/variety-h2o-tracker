import { vi } from "vitest";

// A minimal stand-in for the supabase-js client, shaped to match exactly the chain patterns
// App.jsx actually calls (see grep results this was built from: .from().select().order().limit(),
// .from().select().eq().maybeSingle(), .from().update()/.insert()...eq()/.is(), .rpc(), .auth.*,
// .channel().on().subscribe()). It is NOT a general-purpose supabase-js mock -- extend
// `createQueryBuilder` if a test needs a chain shape that isn't here yet.
//
// Usage in a test file:
//   const { client, state } = createSupabaseMock();
//   vi.mock("../lib/supabaseClient", () => ({ supabase: client, createEphemeralSupabaseClient: () => client }));
//   state.setRows("profiles", [...]);           // array-shaped select().order()/.limit() reads
//   state.setSingle("profiles", { id: "..." });  // single-row select().eq().maybeSingle() reads
//   state.auth.signInWithPasswordResult = { data: { user: { id: "u1" } }, error: null };

function createQueryBuilder(state, table) {
  const chain = [];
  const builder = {
    select: (...args) => (chain.push(["select", args]), builder),
    order: (...args) => (chain.push(["order", args]), builder),
    limit: (...args) => (chain.push(["limit", args]), builder),
    eq: (...args) => (chain.push(["eq", args]), builder),
    is: (...args) => (chain.push(["is", args]), builder),
    insert: (...args) => (chain.push(["insert", args]), builder),
    update: (...args) => (chain.push(["update", args]), builder),
    maybeSingle: (...args) => (chain.push(["maybeSingle", args]), builder),
    // Makes the builder itself awaitable, like the real supabase-js PostgrestFilterBuilder --
    // App.jsx `await`s straight off the end of a chain without a separate execute() call.
    then(onFulfilled, onRejected) {
      const isSingle = chain.some(([name]) => name === "maybeSingle");
      const table_ = isSingle ? state.singleResponses : state.responses;
      const resolver = table_[table];
      const result = typeof resolver === "function"
        ? resolver(chain)
        : resolver ?? { data: isSingle ? null : [], error: null };
      state.calls.push({ table, chain: chain.map(([name]) => name) });
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

export function createSupabaseMock() {
  const state = {
    responses: {}, // table -> { data: [...], error } | (chain) => ({ data, error })
    singleResponses: {}, // table -> { data: {...} | null, error } | (chain) => (...)
    calls: [],
    session: null,
    user: null,
    rpcResults: {}, // fnName -> { data, error } | (args) => ({ data, error })
    authStateCallback: null,
    setRows(table, data, error = null) {
      state.responses[table] = { data, error };
    },
    setSingle(table, data, error = null) {
      state.singleResponses[table] = { data, error };
    },
    // Fires the same callback App.jsx registers via supabase.auth.onAuthStateChange, so a test
    // can simulate a login/logout event without going through a real redirect flow.
    emitAuthStateChange(event, session) {
      state.session = session;
      state.user = session?.user ?? null;
      state.authStateCallback?.(event, session);
    },
  };

  const auth = {
    getUser: vi.fn(async () => ({ data: { user: state.user } })),
    getSession: vi.fn(async () => ({ data: { session: state.session } })),
    onAuthStateChange: vi.fn((cb) => {
      state.authStateCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(async () => auth.signInWithPasswordResult),
    signOut: vi.fn(async () => {
      state.session = null;
      state.user = null;
      return { error: null };
    }),
    signUp: vi.fn(async () => auth.signUpResult),
    resetPasswordForEmail: vi.fn(async () => auth.resetPasswordResult),
    updateUser: vi.fn(async () => auth.updateUserResult),
    signInWithOAuth: vi.fn(async () => auth.signInWithOAuthResult),
    signInWithPasswordResult: { data: { user: null, session: null }, error: null },
    signUpResult: { data: { user: null, session: null }, error: null },
    resetPasswordResult: { error: null },
    updateUserResult: { error: null },
    signInWithOAuthResult: { data: { provider: null, url: null }, error: null },
  };

  const client = {
    auth,
    from: vi.fn((table) => createQueryBuilder(state, table)),
    rpc: vi.fn(async (fnName, args) => {
      const resolver = state.rpcResults[fnName];
      return typeof resolver === "function" ? resolver(args) : resolver ?? { data: null, error: null };
    }),
    channel: vi.fn(() => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
      return ch;
    }),
    removeChannel: vi.fn(),
  };

  return { client, state, auth };
}

// A ready-made singleton for test files that need to both (a) hand `client` to a
// vi.mock("../lib/supabaseClient") factory and (b) configure `state`/`auth` from their own
// test bodies. Vitest hoists vi.mock factories above the rest of the file and only lets them
// reference values they import themselves -- not local consts declared later in the same
// file -- so the factory and the test body each import this same module-level singleton
// independently instead of sharing a local variable. Call resetSupabaseMock() in beforeEach.
export const sharedMock = createSupabaseMock();

export function resetSupabaseMock() {
  vi.clearAllMocks();
  sharedMock.state.responses = {};
  sharedMock.state.singleResponses = {};
  sharedMock.state.calls = [];
  sharedMock.state.session = null;
  sharedMock.state.user = null;
  sharedMock.state.authStateCallback = null;
  Object.assign(sharedMock.auth, {
    signInWithPasswordResult: { data: { user: null, session: null }, error: null },
    signUpResult: { data: { user: null, session: null }, error: null },
    resetPasswordResult: { error: null },
    updateUserResult: { error: null },
    signInWithOAuthResult: { data: { provider: null, url: null }, error: null },
  });
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const sentry = vi.hoisted(() => ({ init: vi.fn(), setTag: vi.fn() }));
vi.mock("@sentry/react", async (importOriginal) => ({ ...(await importOriginal()), init: sentry.init, setTag: sentry.setTag }));

const { scrubString, scrubEvent, scrubBreadcrumb, environmentFor, initErrorReporting, ErrorBoundary } = await import("./lib/errorReporting.js");
const CrashScreen = (await import("./components/CrashScreen.jsx")).default;

describe("error report scrubbing", () => {
  it("removes email addresses and URL query strings", () => {
    expect(scrubString("No account for maria.delgado@example.com")).toBe("No account for [email]");
    expect(scrubString("GET https://x.supabase.co/rest/v1/profiles?email=eq.a@b.com&select=* failed"))
      .toBe("GET https://x.supabase.co/rest/v1/profiles failed");
    expect(scrubString("https://varietyh2o.com/menu/water#top")).toBe("https://varietyh2o.com/menu/water");
  });

  it("drops who it was about and the request's cookies, headers, and body", () => {
    const event = scrubEvent({
      message: "Failed for jane@example.com",
      user: { id: "u-1", email: "jane@example.com", ip_address: "1.2.3.4" },
      request: { url: "https://varietyh2o.com/login?next=/", cookies: { a: "b" }, headers: { Authorization: "Bearer x" }, data: { email: "jane@example.com" } },
      exception: { values: [{ type: "Error", value: "Customer jane@example.com not found" }] },
      extra: { nested: [{ note: "call jane@example.com" }] },
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: "https://varietyh2o.com/login" });
    expect(event.message).toBe("Failed for [email]");
    expect(event.exception.values[0].value).toBe("Customer [email] not found");
    expect(event.extra.nested[0].note).toBe("call [email]");
    expect(JSON.stringify(event)).not.toContain("jane@");
  });

  it("drops console breadcrumbs and scrubs the rest", () => {
    expect(scrubBreadcrumb({ category: "console", message: "Maria Delgado" })).toBeNull();
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "https://x.supabase.co/rest/v1/profiles?legacy_id=eq.214" } }))
      .toEqual({ category: "fetch", data: { url: "https://x.supabase.co/rest/v1/profiles" } });
  });

  it("names the build that reported", () => {
    expect(environmentFor("varietyh2o.com", "web")).toBe("production");
    expect(environmentFor("deploy-preview-50--site.netlify.app", "web")).toBe("preview");
    expect(environmentFor("localhost", "android")).toBe("android");
    expect(environmentFor("localhost", "web")).toBe("other");
  });
});

describe("turning error reporting on", () => {
  beforeEach(() => sentry.init.mockClear());

  it("stays off without a DSN or outside production builds", () => {
    expect(initErrorReporting({ dsn: "", enabled: true })).toBe(false);
    expect(initErrorReporting({ dsn: "https://key@o1.ingest.sentry.io/1", enabled: false })).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("starts with no personal data, no tracing, and the scrubbers", () => {
    expect(initErrorReporting({ dsn: "https://key@o1.ingest.sentry.io/1", enabled: true, platform: "android", release: "abc123" })).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({
      sendDefaultPii: false, tracesSampleRate: 0, environment: "android", release: "abc123",
      beforeSend: scrubEvent, beforeBreadcrumb: scrubBreadcrumb,
    }));
  });
});

describe("crash screen", () => {
  it("replaces a crashed app with a way to reload", () => {
    const Broken = () => { throw new Error("boom"); };
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary fallback={<CrashScreen />}><Broken /></ErrorBoundary>);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(document.getElementById("vh2o-crash-reload-btn")).toBeInTheDocument();
    console.error.mockRestore();
  });
});

import * as Sentry from "@sentry/react";

// Error reporting (ROADMAP item J): uncaught errors from the website and the Android app go to
// Sentry's free tier. Reports must never carry a customer's name or email, so:
//   - nothing identifies the person (no user, no IP, no cookies or headers, no session replay);
//   - console messages aren't recorded (they can hold whatever the app logged);
//   - every string left in a report is scrubbed of email addresses and URL query strings
//     (Supabase filters like ?email=eq... live there).
// It's off unless this is a production build with VITE_SENTRY_DSN set, so local dev, tests, and
// builds without the key send nothing.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_QUERY = /(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/g;

export function scrubString(value) {
  return value.replace(EMAIL, "[email]").replace(URL_QUERY, "$1");
}

// Every string anywhere in the value, scrubbed (objects and arrays are copied, not changed).
export function scrubDeep(value, depth = 0) {
  if (typeof value === "string") return scrubString(value);
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v, depth + 1)]));
}

// A report, made safe to send: who it was about removed, every string scrubbed.
export function scrubEvent(event) {
  const { user: _user, ...rest } = event;
  const scrubbed = scrubDeep(rest);
  if (scrubbed.request) {
    const { cookies: _cookies, headers: _headers, data: _data, ...request } = scrubbed.request;
    scrubbed.request = request;
  }
  return scrubbed;
}

// Breadcrumbs (what happened just before the error), minus console output, scrubbed.
export function scrubBreadcrumb(breadcrumb) {
  if (breadcrumb.category === "console") return null;
  return scrubDeep(breadcrumb);
}

// Which build is reporting: the Android app, a Netlify deploy preview, or the live site.
export function environmentFor(hostname, platform) {
  if (platform === "android") return "android";
  if (hostname === "varietyh2o.com" || hostname === "www.varietyh2o.com") return "production";
  if (hostname.includes("deploy-preview")) return "preview";
  return "other";
}

export function initErrorReporting({ dsn = import.meta.env.VITE_SENTRY_DSN, enabled = import.meta.env.PROD, platform = "web", release } = {}) {
  if (!dsn || !enabled) return false;
  Sentry.init({
    dsn,
    release,
    environment: environmentFor(window.location.hostname, platform),
    sendDefaultPii: false,
    // Errors only: no performance tracing or session replay (privacy, and the free tier's limits).
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  Sentry.setTag("platform", platform);
  return true;
}

export const ErrorBoundary = Sentry.ErrorBoundary;

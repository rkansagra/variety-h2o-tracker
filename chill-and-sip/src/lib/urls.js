import { Capacitor } from "@capacitor/core";

// Absolute URL (not a relative route) so it also opens correctly from inside the Capacitor
// native wrapper, where window.location.origin is not varietyh2o.com. Google Play requires the
// policy to be linked both on the store listing and inside the app.
export const PRIVACY_POLICY_URL = "https://varietyh2o.com/privacy/";

const PRODUCTION_ORIGIN = "https://varietyh2o.com";

// Where Supabase sends people back to after Google sign-in or an emailed link (sign-up
// confirmation, password reset). Must match an entry in Supabase's Redirect URLs allow list,
// or Supabase silently falls back to its Site URL. On the web that's this same site (so deploy
// previews and localhost come back to themselves); inside the Capacitor native wrapper
// window.location.origin is the app's internal https://localhost, which no browser can reach,
// so emailed links point at the live site instead.
export function authRedirectUrl() {
  const origin = Capacitor.isNativePlatform() ? PRODUCTION_ORIGIN : window.location.origin;
  return `${origin}/login`;
}

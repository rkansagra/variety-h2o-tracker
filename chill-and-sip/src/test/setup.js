import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// Global mocks for native-only Capacitor plugins, applied to every test file. Two reasons
// this lives here instead of per-test-file:
//  1. @aparajita/capacitor-biometric-auth's ESM build uses extensionless relative imports
//     that fail under Vitest's module resolution (works fine in actual Vite/Capacitor builds
//     -- this is a Vitest-only quirk), so it can never be imported for real in tests.
//  2. These are native device plugins with no meaningful behavior in jsdom anyway -- default
//     to "web platform, no biometry available" everywhere, matching reality for `npm run test`.
// A test that needs different behavior (e.g. biometry available) can still override these via
// `vi.mocked(...)` after importing them, same as any other mocked module.
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn(() => "web"),
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

// Mirrors the real package's BiometryType enum values (see node_modules/@aparajita/
// capacitor-biometric-auth/dist/esm/definitions.d.ts) so biometryLabel()'s switch in App.jsx
// behaves identically to production even though the plugin itself is mocked.
export const BiometryType = {
  none: 0,
  touchId: 1,
  faceId: 2,
  fingerprintAuthentication: 3,
  faceAuthentication: 4,
  irisAuthentication: 5,
};

vi.mock("@aparajita/capacitor-biometric-auth", () => ({
  BiometryType,
  BiometricAuth: {
    checkBiometry: vi.fn(async () => ({
      isAvailable: false,
      strongBiometryIsAvailable: false,
      biometryType: BiometryType.none,
      biometryTypes: [],
      deviceIsSecure: false,
      reason: "No biometry is available",
      code: "biometryNotAvailable",
    })),
    authenticate: vi.fn(async () => {
      throw new Error("Biometric authentication isn't available on this device.");
    }),
  },
}));

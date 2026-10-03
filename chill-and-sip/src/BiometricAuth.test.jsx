import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { BiometricAuth, BiometryType } from "@aparajita/capacitor-biometric-auth";
import { sharedMock, resetSupabaseMock } from "./test/supabaseMock.js";

// @capacitor/core, @capacitor/app, and @aparajita/capacitor-biometric-auth are all mocked
// globally in src/test/setup.js (defaulting to "web platform, no biometry available") -- this
// file overrides those per test via vi.mocked(...) to exercise the native/available paths.

vi.mock("./lib/supabaseClient", async () => {
  const { sharedMock } = await import("./test/supabaseMock.js");
  return { supabase: sharedMock.client, createEphemeralSupabaseClient: () => sharedMock.client };
});

const { UserProvider, useUser } = await import("./App.jsx");
const { state, auth } = sharedMock;

function Probe({ onReady }) {
  const ctx = useUser();
  useEffect(() => {
    onReady(ctx);
  });
  return null;
}

function renderProvider() {
  let ctx;
  render(
    <UserProvider>
      <Probe onReady={(c) => { ctx = c; }} />
    </UserProvider>
  );
  return { getCtx: () => ctx };
}

async function signInAsLinkedUser(authUserId = "auth-1", email = "jane@example.com") {
  auth.signInWithPasswordResult = { data: { user: { id: authUserId } }, error: null };
  state.user = { id: authUserId, email };
  state.setSingle("profiles", { id: "profile-1" });
  state.setRows("profiles", [
    { id: "profile-1", auth_user_id: authUserId, email, role: "user", gallons: 5, name: "Jane", legacy_id: 1 },
  ]);
  state.setRows("gallon_transactions", []);

  const { getCtx } = renderProvider();
  await waitFor(() => getCtx());
  await act(async () => {
    await getCtx().login(email, "hunter2");
  });
  await waitFor(() => expect(getCtx().currentUser).not.toBeNull());
  return getCtx;
}

beforeEach(() => {
  resetSupabaseMock();
  localStorage.clear();
  vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
  vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
    isAvailable: false,
    strongBiometryIsAvailable: false,
    biometryType: BiometryType.none,
    biometryTypes: [],
    deviceIsSecure: false,
    reason: "No biometry is available",
    code: "biometryNotAvailable",
  });
  vi.mocked(BiometricAuth.authenticate).mockReset();
});

describe("biometric availability", () => {
  it("never checks biometry on the web platform", async () => {
    renderProvider();
    await waitFor(() => expect(sharedMock).toBeTruthy());
    expect(BiometricAuth.checkBiometry).not.toHaveBeenCalled();
  });

  it("reflects checkBiometry()'s result on a native platform", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
      isAvailable: true,
      strongBiometryIsAvailable: true,
      biometryType: BiometryType.faceId,
      biometryTypes: [BiometryType.faceId],
      deviceIsSecure: true,
      reason: "",
      code: "",
    });

    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());
    await waitFor(() => expect(getCtx().biometricAvailable).toBe(true));
    expect(getCtx().biometryType).toBe(BiometryType.faceId);
  });
});

describe("enableBiometricLock", () => {
  it("refuses to enable when the device reports biometry isn't available", async () => {
    const getCtx = await signInAsLinkedUser();

    let result;
    await act(async () => {
      result = await getCtx().enableBiometricLock();
    });

    expect(result).toBe("Biometric authentication isn't available on this device.");
    expect(getCtx().biometricLockEnabled).toBe(false);
    expect(BiometricAuth.authenticate).not.toHaveBeenCalled();
  });

  it("requires a successful authenticate() before turning the preference on, then persists it", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
      isAvailable: true, strongBiometryIsAvailable: true, biometryType: BiometryType.faceId,
      biometryTypes: [BiometryType.faceId], deviceIsSecure: true, reason: "", code: "",
    });
    vi.mocked(BiometricAuth.authenticate).mockResolvedValue(undefined);

    const getCtx = await signInAsLinkedUser("auth-2", "jane2@example.com");
    await waitFor(() => expect(getCtx().biometricAvailable).toBe(true));

    let result;
    await act(async () => {
      result = await getCtx().enableBiometricLock();
    });

    expect(result).toBe(true);
    expect(getCtx().biometricLockEnabled).toBe(true);
    expect(localStorage.getItem("vh2o-biometric-lock:auth-2")).toBe("1");
  });

  it("surfaces the BiometryError message and does not persist when authenticate() rejects", async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
      isAvailable: true, strongBiometryIsAvailable: true, biometryType: BiometryType.touchId,
      biometryTypes: [BiometryType.touchId], deviceIsSecure: true, reason: "", code: "",
    });
    vi.mocked(BiometricAuth.authenticate).mockRejectedValue(new Error("User cancelled"));

    const getCtx = await signInAsLinkedUser("auth-3", "jane3@example.com");
    await waitFor(() => expect(getCtx().biometricAvailable).toBe(true));

    let result;
    await act(async () => {
      result = await getCtx().enableBiometricLock();
    });

    expect(result).toBe("User cancelled");
    expect(getCtx().biometricLockEnabled).toBe(false);
    expect(localStorage.getItem("vh2o-biometric-lock:auth-3")).toBeNull();
  });
});

describe("signing in with biometric lock already enabled", () => {
  it("locks immediately when this user previously turned it on", async () => {
    localStorage.setItem("vh2o-biometric-lock:auth-4", "1");

    const getCtx = await signInAsLinkedUser("auth-4", "jane4@example.com");

    expect(getCtx().biometricLockEnabled).toBe(true);
    expect(getCtx().isBiometricLocked).toBe(true);
  });
});

describe("unlockWithBiometrics / disableBiometricLock", () => {
  it("clears isBiometricLocked once authenticate() succeeds", async () => {
    localStorage.setItem("vh2o-biometric-lock:auth-5", "1");
    vi.mocked(BiometricAuth.authenticate).mockResolvedValue(undefined);

    const getCtx = await signInAsLinkedUser("auth-5", "jane5@example.com");
    expect(getCtx().isBiometricLocked).toBe(true);

    let result;
    await act(async () => {
      result = await getCtx().unlockWithBiometrics();
    });

    expect(result).toBe(true);
    expect(getCtx().isBiometricLocked).toBe(false);
  });

  it("clears both the preference and the lock, and forgets it in storage", async () => {
    localStorage.setItem("vh2o-biometric-lock:auth-6", "1");

    const getCtx = await signInAsLinkedUser("auth-6", "jane6@example.com");
    expect(getCtx().biometricLockEnabled).toBe(true);

    act(() => {
      getCtx().disableBiometricLock();
    });

    expect(getCtx().biometricLockEnabled).toBe(false);
    expect(getCtx().isBiometricLocked).toBe(false);
    expect(localStorage.getItem("vh2o-biometric-lock:auth-6")).toBeNull();
  });

  it("clears the lock state on logout, since there's nothing left to protect", async () => {
    localStorage.setItem("vh2o-biometric-lock:auth-7", "1");

    const getCtx = await signInAsLinkedUser("auth-7", "jane7@example.com");
    expect(getCtx().biometricLockEnabled).toBe(true);

    await act(async () => {
      await getCtx().logout();
    });

    expect(getCtx().biometricLockEnabled).toBe(false);
    expect(getCtx().isBiometricLocked).toBe(false);
  });
});

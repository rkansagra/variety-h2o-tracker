import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BiometryType } from "@aparajita/capacitor-biometric-auth";
import { Capacitor } from "@capacitor/core";
import { createSupabaseMock } from "./test/supabaseMock.js";

// App.jsx imports ./lib/supabaseClient at module scope, which throws immediately if
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY aren't set -- mock it here even though none of
// these particular tests touch Supabase, so this file runs the same with or without a local
// .env and never risks a real network call.
vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client, createEphemeralSupabaseClient: () => client };
});

const {
  mapProfileToUser,
  isActiveCustomer,
  mapTransactionToNotification,
  capNotificationsPerUser,
  slugify,
  getTier,
  biometryLabel,
  authRedirectUrl,
  buttonProps,
} = await import("./App.jsx");

describe("buttonProps", () => {
  it("makes an element focusable and announced as a button", () => {
    const props = buttonProps(() => {});
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
  });

  it("activates on click, Enter, and Space -- but not other keys", () => {
    const onActivate = vi.fn();
    const props = buttonProps(onActivate);
    const key = (k) => ({ key: k, preventDefault: vi.fn() });

    props.onClick();
    props.onKeyDown(key("Enter"));
    props.onKeyDown(key(" "));
    props.onKeyDown(key("a"));

    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it("stops Space from also scrolling the page", () => {
    const event = { key: " ", preventDefault: vi.fn() };
    buttonProps(() => {}).onKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

describe("authRedirectUrl", () => {
  afterEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  });

  it("returns this site's /login on the web, so previews and localhost come back to themselves", () => {
    expect(authRedirectUrl()).toBe(`${window.location.origin}/login`);
  });

  it("returns the live site's /login in the native app, whose own origin no browser can reach", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    expect(authRedirectUrl()).toBe("https://varietyh2o.com/login");
  });
});

describe("mapProfileToUser", () => {
  it("maps a profiles row onto the shape the UI reads", () => {
    const profile = {
      id: "profile-uuid",
      auth_user_id: "auth-uuid",
      email: "Jane@Example.com",
      role: "admin",
      gallons: 12,
      name: "Jane",
      member_since: "1/1/2024",
      legacy_id: 42,
      water_type: "purified",
      last_transaction_at: "2026-01-01T00:00:00Z",
      claim_code: "ABC123",
    };

    expect(mapProfileToUser(profile)).toEqual({
      id: 42,
      profileId: "profile-uuid",
      authUserId: "auth-uuid",
      username: "Jane@Example.com",
      email: "Jane@Example.com",
      role: "admin",
      gallons: 12,
      name: "Jane",
      memberSince: "1/1/2024",
      waterType: "purified",
      lastTransactionAt: "2026-01-01T00:00:00Z",
      hasClaimCode: true,
    });
  });

  it("defaults role to user for anything other than the literal 'admin'", () => {
    expect(mapProfileToUser({ role: "user", legacy_id: 1 }).role).toBe("user");
    expect(mapProfileToUser({ role: "owner", legacy_id: 1 }).role).toBe("user");
    expect(mapProfileToUser({ role: undefined, legacy_id: 1 }).role).toBe("user");
  });

  it("falls back memberSince to 'N/A' and hasClaimCode to false when unset", () => {
    const user = mapProfileToUser({ legacy_id: 1, member_since: null, claim_code: null });
    expect(user.memberSince).toBe("N/A");
    expect(user.hasClaimCode).toBe(false);
  });
});

describe("isActiveCustomer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is active whenever the customer currently holds gallons, regardless of last transaction", () => {
    expect(isActiveCustomer({ gallons: 1, lastTransactionAt: null })).toBe(true);
  });

  it("is inactive with zero gallons and no transaction history", () => {
    expect(isActiveCustomer({ gallons: 0, lastTransactionAt: null })).toBe(false);
  });

  it("is active with zero gallons if the last transaction was within the 31-day window", () => {
    const tenDaysAgo = new Date("2026-06-05T00:00:00Z").toISOString();
    expect(isActiveCustomer({ gallons: 0, lastTransactionAt: tenDaysAgo })).toBe(true);
  });

  it("is inactive with zero gallons once the last transaction falls outside the window", () => {
    const thirtyTwoDaysAgo = new Date("2026-05-14T00:00:00Z").toISOString();
    expect(isActiveCustomer({ gallons: 0, lastTransactionAt: thirtyTwoDaysAgo })).toBe(false);
  });

  it("is active exactly at the 31-day boundary", () => {
    const exactlyBoundary = new Date("2026-06-15T00:00:00Z").getTime() - 31 * 24 * 60 * 60 * 1000;
    expect(isActiveCustomer({ gallons: 0, lastTransactionAt: new Date(exactlyBoundary).toISOString() })).toBe(true);
  });
});

describe("mapTransactionToNotification", () => {
  const usersByProfileId = {
    "profile-1": { id: 1, name: "Jane" },
  };

  it("maps a credit transaction and resolves the user's display name", () => {
    const notification = mapTransactionToNotification(
      {
        id: 100,
        user_profile_id: "profile-1",
        amount: 5,
        previous_balance: 10,
        new_balance: 15,
        note: "Refill",
        created_at: "2026-01-01T12:00:00Z",
      },
      usersByProfileId
    );

    expect(notification).toMatchObject({
      id: 100,
      userId: 1,
      userName: "Jane",
      amount: 5,
      previousBalance: 10,
      newBalance: 15,
      note: "Refill",
      type: "credit",
    });
  });

  it("classifies a negative amount as a debit", () => {
    const notification = mapTransactionToNotification(
      { id: 101, user_profile_id: "profile-1", amount: -3, previous_balance: 10, new_balance: 7, created_at: "2026-01-01T12:00:00Z" },
      usersByProfileId
    );
    expect(notification.type).toBe("debit");
    expect(notification.note).toBe("");
  });

  it("returns null when the transaction references a profile that isn't in the lookup", () => {
    const notification = mapTransactionToNotification(
      { id: 102, user_profile_id: "unknown-profile", amount: 1, previous_balance: 0, new_balance: 1, created_at: "2026-01-01T12:00:00Z" },
      usersByProfileId
    );
    expect(notification).toBeNull();
  });
});

describe("capNotificationsPerUser", () => {
  function notif(id, userId) {
    return { id, userId };
  }

  it("keeps at most 5 notifications per user without disturbing order", () => {
    const notifications = [
      notif(1, "a"), notif(2, "a"), notif(3, "a"), notif(4, "a"), notif(5, "a"), notif(6, "a"),
      notif(7, "b"),
    ];
    const result = capNotificationsPerUser(notifications);
    expect(result.map((n) => n.id)).toEqual([1, 2, 3, 4, 5, 7]);
  });

  it("does not drop anything when every user is under the cap", () => {
    const notifications = [notif(1, "a"), notif(2, "b"), notif(3, "a")];
    expect(capNotificationsPerUser(notifications)).toHaveLength(3);
  });
});

describe("slugify", () => {
  it("lowercases, replaces runs of non-alphanumeric characters with a single dash, and trims edge dashes", () => {
    expect(slugify("Mango Smoothie!")).toBe("mango-smoothie");
    expect(slugify("  Leading/Trailing  ")).toBe("leading-trailing");
    expect(slugify("Already-Slugged")).toBe("already-slugged");
  });

  it("coerces non-string input instead of throwing", () => {
    expect(slugify(42)).toBe("42");
  });
});

describe("getTier", () => {
  it("returns Splash for 0 and the lower boundary of the next tier", () => {
    expect(getTier(0).name).toBe("Splash");
    expect(getTier(199).name).toBe("Splash");
    expect(getTier(200).name).toBe("Frost");
  });

  it("returns the top tier for very large point totals", () => {
    expect(getTier(1000).name).toBe("Blizzard");
    expect(getTier(1_000_000).name).toBe("Blizzard");
  });

  it("falls back to the first tier for an out-of-range (negative) value", () => {
    expect(getTier(-5).name).toBe("Splash");
  });
});

describe("biometryLabel", () => {
  it("names the specific biometry type where the app has a label for it", () => {
    expect(biometryLabel(BiometryType.faceId)).toBe("Face ID");
    expect(biometryLabel(BiometryType.touchId)).toBe("Touch ID");
    expect(biometryLabel(BiometryType.fingerprintAuthentication)).toBe("Fingerprint unlock");
    expect(biometryLabel(BiometryType.faceAuthentication)).toBe("Face unlock");
  });

  it("falls back to a generic label for none/unrecognized types", () => {
    expect(biometryLabel(BiometryType.none)).toBe("Biometric unlock");
    expect(biometryLabel(BiometryType.irisAuthentication)).toBe("Biometric unlock");
  });
});

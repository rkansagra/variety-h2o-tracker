import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { createSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client, createEphemeralSupabaseClient: () => client };
});

const { sizeClassFor, useSizeClass, MainApp, UserContext } = await import("./App.jsx");

describe("sizeClassFor", () => {
  it("splits by width at 600px and 1024px", () => {
    expect(sizeClassFor(390, 844)).toBe("phone");
    expect(sizeClassFor(599, 900)).toBe("phone");
    expect(sizeClassFor(600, 900)).toBe("tablet");
    expect(sizeClassFor(1023, 900)).toBe("tablet");
    expect(sizeClassFor(1024, 900)).toBe("desktop");
    expect(sizeClassFor(2560, 1440)).toBe("desktop");
  });

  it("keeps short windows (e.g. a phone in landscape) on the phone layout", () => {
    expect(sizeClassFor(844, 390)).toBe("phone");
    expect(sizeClassFor(1400, 499)).toBe("phone");
    expect(sizeClassFor(1400, 500)).toBe("desktop");
  });
});

describe("useSizeClass", () => {
  const original = { width: window.innerWidth, height: window.innerHeight };
  const resizeTo = (width, height) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    window.dispatchEvent(new Event("resize"));
  };

  afterEach(() => {
    resizeTo(original.width, original.height);
  });

  it("follows the window as it is resized", () => {
    resizeTo(390, 844);
    const { result } = renderHook(() => useSizeClass());
    expect(result.current).toBe("phone");

    act(() => resizeTo(820, 1180));
    expect(result.current).toBe("tablet");

    act(() => resizeTo(1440, 900));
    expect(result.current).toBe("desktop");
  });
});

describe("Customer screens by size class", () => {
  const original = { width: window.innerWidth, height: window.innerHeight };
  const setWindow = (width, height) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  };
  afterEach(() => setWindow(original.width, original.height));

  const me = { id: 1042, role: "user", name: "Alex Rivera", email: "alex@example.com", gallons: 342, authUserId: "u1", memberSince: "3/14/2025" };
  function renderApp() {
    const context = {
      currentUser: me, users: [me], isLoading: false,
      notifications: [{ id: 1, userId: 1042, type: "debit", amount: -5, previousBalance: 347, newBalance: 342, displayTime: "Today" }],
      logout: vi.fn(), adjustGallons: vi.fn(), fetchUserHistory: vi.fn(), updateWaterType: vi.fn(), generateClaimCode: vi.fn(),
      register: vi.fn(), biometricAvailable: false, biometryType: 0, biometricLockEnabled: false, isBiometricLocked: false,
      enableBiometricLock: vi.fn(), disableBiometricLock: vi.fn(),
    };
    render(
      <MemoryRouter>
        <UserContext.Provider value={context}>
          <MainApp />
        </UserContext.Provider>
      </MemoryRouter>
    );
  }

  it("desktop menu: a category list beside the first category's items, switchable", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    renderApp();

    expect(document.getElementById("vh2o-menu-categories-grid")).not.toBeInTheDocument();
    expect(document.getElementById("vh2o-menu-category-link-water")).toHaveAttribute("aria-current", "true");
    expect(document.getElementById("vh2o-menu-items")).toBeInTheDocument();

    await user.click(document.getElementById("vh2o-menu-category-link-ice-cream"));
    expect(document.getElementById("vh2o-menu-category-link-ice-cream")).toHaveAttribute("aria-current", "true");
    expect(document.getElementById("vh2o-menu-category-title")).toHaveTextContent("Ice Cream");
  });

  it("phone menu: the category grid first, then a category's items with a way back", async () => {
    setWindow(390, 844);
    const user = userEvent.setup();
    renderApp();

    expect(document.getElementById("vh2o-menu-category-list")).not.toBeInTheDocument();
    await user.click(document.getElementById("vh2o-menu-category-card-water"));
    expect(document.getElementById("vh2o-menu-items")).toBeInTheDocument();
    await user.click(document.getElementById("vh2o-menu-back-btn"));
    expect(document.getElementById("vh2o-menu-categories-grid")).toBeInTheDocument();
  });

  it("home keeps the profile and history as separate blocks for the size-class layouts", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    renderApp();
    await user.click(document.getElementById("vh2o-top-nav-tracker"));

    expect(document.getElementById("vh2o-tracker-home")).toHaveClass("vh2o-home");
    expect(document.getElementById("vh2o-tracker-profile")).toHaveClass("vh2o-home-profile");
    expect(document.getElementById("vh2o-tracker-history")).toContainElement(
      document.getElementById("vh2o-tracker-notification-card-1")
    );
  });
});

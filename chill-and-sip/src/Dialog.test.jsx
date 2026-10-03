import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client, createEphemeralSupabaseClient: () => client };
});

const { useDialog, initialsFor } = await import("./App.jsx");

// Minimal page with one bottom sheet wired the way MainApp wires its four sheets.
function Harness({ onClose = () => {} }) {
  const [open, setOpen] = useState(false);
  const ref = useDialog(open, () => {
    onClose();
    setOpen(false);
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open sheet</button>
      {open && (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="Test sheet">
          <button type="button">First</button>
          <button type="button">Last</button>
        </div>
      )}
    </div>
  );
}

describe("useDialog", () => {
  it("moves focus into the sheet when it opens", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));

    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("closes on Escape and returns focus to the control that opened it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Open sheet" });

    await user.click(opener);
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside the sheet", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });
});

describe("initialsFor", () => {
  it("uses the first and last name", () => {
    expect(initialsFor("Jane Doe")).toBe("JD");
    expect(initialsFor("  maria de la cruz ")).toBe("MC");
  });

  it("uses one letter for a single name", () => {
    expect(initialsFor("cher")).toBe("C");
  });

  it("falls back to the email, then to a question mark", () => {
    expect(initialsFor("", "sam@example.com")).toBe("S");
    expect(initialsFor(null, null)).toBe("?");
  });
});

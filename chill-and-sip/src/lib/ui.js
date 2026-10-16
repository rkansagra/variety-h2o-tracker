import { useState, useEffect, useRef } from "react";

// Structural icons (navigation, actions, status) are Lucide SVGs at these sizes, one stroke
// width. Menu-category and reward-tier emoji are illustrative content and stay as emoji.
export const ICON_SIZE = { inline: 14, md: 22, lg: 28 };

// Size classes (see ROADMAP.md, "Layout for tablet and desktop"): decided by the window's own
// size, never by user-agent sniffing. A short window (e.g. a phone in landscape) stays "phone"
// even when it is wide. useSizeClass() is the single source of truth -- RewardsApp mirrors it onto
// <html data-size>, which the layout rules in index.css key off.
export function sizeClassFor(width, height) {
  if (width < 600 || height < 500) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function useSizeClass() {
  const [size, setSize] = useState(() => sizeClassFor(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const onResize = () => setSize(sizeClassFor(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

// Dialog behavior for the bottom sheets: while open, focus moves into the sheet, Tab stays
// inside it, and Escape calls onClose; on close, focus returns to whatever opened it.
export function useDialog(open, onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const sheet = ref.current;
    if (!open || !sheet) return undefined;
    const opener = document.activeElement;
    const focusables = () => [...sheet.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )];
    // Focus the sheet itself (announced as the dialog) rather than its first button, so an
    // Enter meant for the page can't land on e.g. "Confirm" by accident.
    sheet.setAttribute("tabindex", "-1");
    sheet.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [open]);

  return ref;
}

// Props for a click target that can't be a real <button> -- e.g. a card containing block
// elements, which <button> may not contain. Makes it keyboard-focusable, announced as a
// button, and activated by Enter or Space like a native button.
export function buttonProps(onActivate) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(e);
      }
    },
  };
}

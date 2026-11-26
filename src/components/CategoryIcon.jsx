// A menu category's mark: a dot in the category's color (ROADMAP item I replaced the emoji with
// one consistent mark; the app's icons are all Lucide line icons).
export default function CategoryIcon({ cat }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: cat.color }}
    />
  );
}

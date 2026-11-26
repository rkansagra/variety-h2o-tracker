// Up to two initials for the tracker avatar: "Jane Doe" -> "JD", "cher" -> "C"; falls back to
// the email's first letter, then "?".
export function initialsFor(name, email) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0][0].toUpperCase();
  const fromEmail = String(email || "").trim()[0];
  return fromEmail ? fromEmail.toUpperCase() : "?";
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// "March 2024" from a member_since date ("2024-03-14"), or null when unknown. Parsed as a local
// calendar date, so it never shifts a day (or a month) across time zones.
export function formatMemberSince(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

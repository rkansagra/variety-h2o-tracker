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

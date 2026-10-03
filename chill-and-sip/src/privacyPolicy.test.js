/* global process */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// public/privacy/index.html is what varietyh2o.com/privacy/ serves and what the Google Play
// listing links to. This guards against publishing it with an unfilled placeholder or losing
// the disclosures Play reviewers look for. Resolved from cwd (the project root under
// `vitest run`) because import.meta.url isn't a file: URL in Vitest's jsdom environment.
const html = readFileSync(resolve(process.cwd(), "public/privacy/index.html"), "utf8");

describe("public/privacy/index.html", () => {
  it("has no unfilled placeholders", () => {
    expect(html).not.toMatch(/_HERE|TODO|PLACEHOLDER|\[[A-Z ]+\]/);
  });

  it("gives a real contact email", () => {
    expect(html).toMatch(/mailto:[^"@\s]+@[^"@\s]+\.[a-z]{2,}/i);
  });

  it("is self-contained: no external scripts, stylesheets, or trackers", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet/i);
  });

  it("discloses the data categories and providers the app actually uses", () => {
    for (const term of ["Supabase", "Netlify", "Google", "email address", "biometric", "delete"]) {
      expect(html.toLowerCase()).toContain(term.toLowerCase());
    }
  });
});

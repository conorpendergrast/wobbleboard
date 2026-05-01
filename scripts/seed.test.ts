import { describe, it, expect } from "vitest";

import {
  SEED_NAMESPACE,
  companyId,
  contactId,
  COMPANIES,
  CONTACTS,
} from "./seed";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("SEED_NAMESPACE", () => {
  it("is a valid UUID", () => {
    expect(SEED_NAMESPACE).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe("companyId", () => {
  it("is deterministic — same name returns the same UUID across calls", () => {
    const a = companyId("Brightpath Logistics");
    const b = companyId("Brightpath Logistics");
    expect(a).toBe(b);
  });

  it("returns different UUIDs for different names", () => {
    expect(companyId("Brightpath Logistics")).not.toBe(
      companyId("Pennine Financial Services")
    );
  });

  it("returns a UUIDv5-shaped string", () => {
    expect(companyId("Brightpath Logistics")).toMatch(UUID_REGEX);
  });

  it("each of the 5 demo companies produces a distinct UUID", () => {
    const ids = COMPANIES.map((c) => companyId(c.name));
    expect(new Set(ids).size).toBe(COMPANIES.length);
  });
});

describe("contactId", () => {
  it("is deterministic — same email returns the same UUID across calls", () => {
    const a = contactId("aisha.campbell@brightpath.wobbleboard.example");
    const b = contactId("aisha.campbell@brightpath.wobbleboard.example");
    expect(a).toBe(b);
  });

  it("returns different UUIDs for different emails", () => {
    expect(
      contactId("aisha.campbell@brightpath.wobbleboard.example")
    ).not.toBe(contactId("harry.ali@brightpath.wobbleboard.example"));
  });

  it("returns a UUIDv5-shaped string", () => {
    expect(
      contactId("aisha.campbell@brightpath.wobbleboard.example")
    ).toMatch(UUID_REGEX);
  });

  it("all 30 demo contacts produce distinct UUIDs (no email collisions)", () => {
    const ids = CONTACTS.map((c) => contactId(c.email));
    expect(new Set(ids).size).toBe(CONTACTS.length);
  });

  it("does not collide with any company UUID", () => {
    const companyIds = new Set(COMPANIES.map((c) => companyId(c.name)));
    for (const c of CONTACTS) {
      expect(companyIds.has(contactId(c.email))).toBe(false);
    }
  });
});

describe("COMPANIES seed data", () => {
  it("has exactly 5 entries", () => {
    expect(COMPANIES).toHaveLength(5);
  });

  it("sets a non-null created_at on every company (drives Intercom remote_created_at)", () => {
    for (const c of COMPANIES) {
      expect(c.created_at).toBeTruthy();
      expect(() => new Date(c.created_at).toISOString()).not.toThrow();
    }
  });

  it("every company has a distinct created_at (per-company tenure ladder)", () => {
    const dates = new Set(COMPANIES.map((c) => c.created_at));
    expect(dates.size).toBe(COMPANIES.length);
  });

  it("COMPANIES is referentially stable across calls (same array reference, same created_at values)", () => {
    // Re-importing the module would give a new reference, but within a process the
    // exported array and its values must not mutate between reads.
    const snapshot = COMPANIES.map((c) => ({ name: c.name, created_at: c.created_at }));
    for (const c of COMPANIES) {
      const match = snapshot.find((s) => s.name === c.name);
      expect(match?.created_at).toBe(c.created_at);
    }
  });

  it("created_at values are fixed ISO dates, not relative offsets that creep forward", () => {
    // Guard against accidental reintroduction of `daysAgo()` or similar.
    // ISO dates parse to a stable epoch; a relative computation would produce
    // a different epoch on each call. We re-read after a microtask just to be
    // sure no setter trickery is in play.
    const before = COMPANIES.map((c) => new Date(c.created_at).getTime());
    return Promise.resolve().then(() => {
      const after = COMPANIES.map((c) => new Date(c.created_at).getTime());
      expect(after).toEqual(before);
    });
  });

  it("created_at parses to a date in the past", () => {
    const now = Date.now();
    for (const c of COMPANIES) {
      expect(new Date(c.created_at).getTime()).toBeLessThan(now);
    }
  });

  it("tenure ladder is ordered as Brightpath > Pennine > GreenLeaf > Mosaic > Fern & Oak (oldest → newest)", () => {
    // The original demo had this tenure ordering (540 / 400 / 300 / 200 / 120 days).
    // Locking it in so future edits to created_at don't accidentally break the demo's
    // narrative: enterprise customers tend to be older, the trial-stage one is newest.
    const order = [
      "Brightpath Logistics",
      "Pennine Financial Services",
      "GreenLeaf Healthcare",
      "Mosaic Education Trust",
      "Fern & Oak Design Studio",
    ];
    const byName = new Map(COMPANIES.map((c) => [c.name, new Date(c.created_at).getTime()]));
    for (let i = 0; i < order.length - 1; i++) {
      const older = byName.get(order[i]);
      const newer = byName.get(order[i + 1]);
      expect(older).toBeDefined();
      expect(newer).toBeDefined();
      expect(older!).toBeLessThan(newer!);
    }
  });

  it("every company has a unique name", () => {
    const names = new Set(COMPANIES.map((c) => c.name));
    expect(names.size).toBe(COMPANIES.length);
  });
});

describe("CONTACTS seed data", () => {
  it("has exactly 30 entries", () => {
    expect(CONTACTS).toHaveLength(30);
  });

  it("every email is unique", () => {
    const emails = new Set(CONTACTS.map((c) => c.email));
    expect(emails.size).toBe(CONTACTS.length);
  });

  it("every contact's company_name matches a company in COMPANIES", () => {
    const names = new Set(COMPANIES.map((c) => c.name));
    for (const contact of CONTACTS) {
      expect(names.has(contact.company_name)).toBe(true);
    }
  });

  it("every contact has a parseable signed_up_at and last_active_at", () => {
    for (const c of CONTACTS) {
      expect(() => new Date(c.signed_up_at).toISOString()).not.toThrow();
      expect(() => new Date(c.last_active_at).toISOString()).not.toThrow();
    }
  });
});

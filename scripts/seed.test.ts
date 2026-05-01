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

  it("uses the same created_at for all 5 companies (stable across reseeds)", () => {
    const dates = new Set(COMPANIES.map((c) => c.created_at));
    expect(dates.size).toBe(1);
  });

  it("created_at parses to a date in the past", () => {
    const now = Date.now();
    for (const c of COMPANIES) {
      expect(new Date(c.created_at).getTime()).toBeLessThan(now);
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

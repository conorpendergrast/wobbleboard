import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/lib/intercom", () => ({
  intercomRequest: vi.fn(),
}));

import { intercomRequest } from "../src/lib/intercom";
import {
  deleteAndVerifyCompany,
  processCompanyDeletes,
  formatSummary,
  isCleanResult,
  dashboardUrl,
  type CleanupSummary,
} from "./cleanup-intercom";

const mockedIntercom = vi.mocked(intercomRequest);

beforeEach(() => {
  vi.clearAllMocks();
});

function intercomError(status: number, msg = "boom"): Error & { status: number; body: unknown } {
  const e = new Error(`Intercom failed (${status}): ${msg}`) as Error & {
    status: number;
    body: unknown;
  };
  e.status = status;
  e.body = {};
  return e;
}

const EMPTY_SUMMARY_BASE: Omit<CleanupSummary, "companyDeleteResult"> = {
  contactsFound: 0,
  contactDeleteResult: { deleted: 0, failures: [] },
  companiesFound: 0,
  workspaceId: "wkspc-abc",
  noUrls: false,
};

describe("deleteAndVerifyCompany", () => {
  it("returns verified-gone when DELETE 200 then GET 404", async () => {
    mockedIntercom
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(intercomError(404, "not found"));

    const out = await deleteAndVerifyCompany({ id: "c1", name: "Co1" });

    expect(out).toEqual({ status: "verified-gone", id: "c1", name: "Co1" });
    expect(mockedIntercom).toHaveBeenNthCalledWith(1, "DELETE", "/companies/c1");
    expect(mockedIntercom).toHaveBeenNthCalledWith(2, "GET", "/companies/c1");
  });

  it("returns undeletable when DELETE 200 but GET still returns the company (silent no-op)", async () => {
    mockedIntercom
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ id: "c1", name: "Co1", company_id: "supabase-uuid" });

    const out = await deleteAndVerifyCompany({ id: "c1", name: "Co1" });

    expect(out).toEqual({ status: "undeletable", id: "c1", name: "Co1" });
  });

  it("returns verified-gone when DELETE itself returns 404 (already deleted)", async () => {
    mockedIntercom.mockRejectedValueOnce(intercomError(404, "not found"));

    const out = await deleteAndVerifyCompany({ id: "c1", name: "Co1" });

    expect(out).toEqual({ status: "verified-gone", id: "c1", name: "Co1" });
    // Should not bother with the verify GET since DELETE already proved it's gone.
    expect(mockedIntercom).toHaveBeenCalledTimes(1);
  });

  it("returns delete-error on a non-404 DELETE failure", async () => {
    mockedIntercom.mockRejectedValueOnce(intercomError(500, "server error"));

    const out = await deleteAndVerifyCompany({ id: "c1", name: "Co1" });

    expect(out.status).toBe("delete-error");
    if (out.status === "delete-error") {
      expect(out.error).toMatch(/500/);
    }
  });
});

describe("processCompanyDeletes", () => {
  it("all-clean: every company deletes and is verified gone", async () => {
    // For each of 3 companies: DELETE 200, then GET 404.
    mockedIntercom
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(intercomError(404))
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(intercomError(404))
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(intercomError(404));

    const r = await processCompanyDeletes([
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
      { id: "c3", name: "C" },
    ]);

    expect(r).toEqual({
      apiDeleted: 3,
      verifiedGone: 3,
      undeletable: [],
      errors: [],
    });
  });

  it("silent no-op: DELETE returns 200, GET still returns company body — listed as undeletable, not verified gone", async () => {
    mockedIntercom
      .mockResolvedValueOnce({}) // DELETE 200
      .mockResolvedValueOnce({ id: "c1", name: "A" }); // GET still returns

    const r = await processCompanyDeletes([{ id: "c1", name: "A" }]);

    expect(r.apiDeleted).toBe(1);
    expect(r.verifiedGone).toBe(0);
    expect(r.undeletable).toEqual([{ id: "c1", name: "A" }]);
    expect(r.errors).toEqual([]);
  });

  it("mixed: 1 deletes cleanly, 2 silent no-op", async () => {
    mockedIntercom
      // c1: DELETE 200, GET 404 → verified gone
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(intercomError(404))
      // c2: DELETE 200, GET 200 → undeletable
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ id: "c2", name: "B" })
      // c3: DELETE 200, GET 200 → undeletable
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ id: "c3", name: "C" });

    const r = await processCompanyDeletes([
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
      { id: "c3", name: "C" },
    ]);

    expect(r.apiDeleted).toBe(3);
    expect(r.verifiedGone).toBe(1);
    expect(r.undeletable).toEqual([
      { id: "c2", name: "B" },
      { id: "c3", name: "C" },
    ]);
    expect(r.errors).toEqual([]);
  });

  it("404 path: DELETE returns 404 → counted as verifiedGone, not surfaced as undeletable", async () => {
    mockedIntercom.mockRejectedValueOnce(intercomError(404, "not found"));

    const r = await processCompanyDeletes([{ id: "c1", name: "A" }]);

    expect(r.apiDeleted).toBe(1);
    expect(r.verifiedGone).toBe(1);
    expect(r.undeletable).toEqual([]);
    expect(r.errors).toEqual([]);
  });
});

describe("dashboardUrl", () => {
  it("formats a workspace+company URL", () => {
    expect(dashboardUrl("wkspc-abc", "12345")).toBe(
      "https://app.intercom.com/a/apps/wkspc-abc/companies/12345"
    );
  });
});

describe("isCleanResult", () => {
  it("is true when no failures, no undeletable, no errors", () => {
    expect(
      isCleanResult({
        ...EMPTY_SUMMARY_BASE,
        companiesFound: 1,
        companyDeleteResult: {
          apiDeleted: 1,
          verifiedGone: 1,
          undeletable: [],
          errors: [],
        },
      })
    ).toBe(true);
  });

  it("is false when there are undeletable companies", () => {
    expect(
      isCleanResult({
        ...EMPTY_SUMMARY_BASE,
        companiesFound: 1,
        companyDeleteResult: {
          apiDeleted: 1,
          verifiedGone: 0,
          undeletable: [{ id: "c1", name: "A" }],
          errors: [],
        },
      })
    ).toBe(false);
  });

  it("is false when there are contact failures", () => {
    expect(
      isCleanResult({
        ...EMPTY_SUMMARY_BASE,
        contactsFound: 1,
        contactDeleteResult: {
          deleted: 0,
          failures: [{ id: "x", identifier: "x@y.z", error: "boom" }],
        },
        companyDeleteResult: { apiDeleted: 0, verifiedGone: 0, undeletable: [], errors: [] },
      })
    ).toBe(false);
  });
});

describe("formatSummary", () => {
  it("includes dashboard URLs for undeletable companies when workspaceId is set", () => {
    const out = formatSummary({
      ...EMPTY_SUMMARY_BASE,
      companiesFound: 2,
      companyDeleteResult: {
        apiDeleted: 2,
        verifiedGone: 0,
        undeletable: [
          { id: "12345", name: "A" },
          { id: "12346", name: "B" },
        ],
        errors: [],
      },
    });

    expect(out).toContain("Manual cleanup needed");
    expect(out).toContain("https://app.intercom.com/a/apps/wkspc-abc/companies/12345");
    expect(out).toContain("https://app.intercom.com/a/apps/wkspc-abc/companies/12346");
    expect(out).toContain("docs/intercom-api-gotchas.md");
  });

  it("suppresses dashboard URLs when noUrls is true", () => {
    const out = formatSummary({
      ...EMPTY_SUMMARY_BASE,
      noUrls: true,
      companiesFound: 1,
      companyDeleteResult: {
        apiDeleted: 1,
        verifiedGone: 0,
        undeletable: [{ id: "12345", name: "A" }],
        errors: [],
      },
    });

    expect(out).not.toContain("https://");
    expect(out).toContain("12345");
    expect(out).toContain("(A)");
  });

  it("does not show the warning block when there are no undeletable companies", () => {
    const out = formatSummary({
      ...EMPTY_SUMMARY_BASE,
      companiesFound: 1,
      companyDeleteResult: { apiDeleted: 1, verifiedGone: 1, undeletable: [], errors: [] },
    });

    expect(out).toContain("Companies actually gone:  1/1");
    expect(out).not.toContain("Manual cleanup needed");
    expect(out).not.toContain("docs/intercom-api-gotchas.md");
  });

  it("reports honest counts when DELETE silently no-ops", () => {
    const out = formatSummary({
      ...EMPTY_SUMMARY_BASE,
      companiesFound: 5,
      companyDeleteResult: {
        apiDeleted: 5,
        verifiedGone: 0,
        undeletable: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
          { id: "3", name: "C" },
          { id: "4", name: "D" },
          { id: "5", name: "E" },
        ],
        errors: [],
      },
    });

    expect(out).toContain("Companies API-deleted:    5/5");
    expect(out).toContain("Companies actually gone:  0/5");
  });
});

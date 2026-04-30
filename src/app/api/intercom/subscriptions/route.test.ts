import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/intercom', () => ({
  intercomRequest: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(),
}));

import { POST } from './route';
import { intercomRequest } from '@/lib/intercom';
import { createServiceClient } from '@/lib/supabase';

const API_KEY = 'test-connector-key';

beforeAll(() => {
  process.env.INTERCOM_CONNECTOR_API_KEY = API_KEY;
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test helpers ──────────────────────────────────────────────────────────

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

function makeRequest(opts: {
  body?: unknown;
  rawBody?: string;
  contentType?: string | null;
  authHeader?: string | null;
}): NextRequest {
  const headers = new Headers();
  if (opts.contentType !== null) {
    headers.set('content-type', opts.contentType ?? 'application/json');
  }
  if (opts.authHeader !== null) {
    headers.set('authorization', opts.authHeader ?? `Bearer ${API_KEY}`);
  }
  const body =
    opts.rawBody !== undefined
      ? opts.rawBody
      : opts.body !== undefined
        ? JSON.stringify(opts.body)
        : undefined;

  // NextRequest is a thin wrapper over Request; the route only reads
  // headers and `.json()`, so a plain Request typed as NextRequest is enough.
  return new Request('http://test/api/intercom/subscriptions', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

type Existing = {
  plan_tier: string;
  status: string;
  billing_cycle: string;
  renewal_date: string;
  companies: { name: string } | null;
};

type Updated = Omit<Existing, 'companies'>;

interface MockOptions {
  existing?: Existing | null;
  readError?: unknown;
  updated?: Updated | null;
  updateError?: { code?: string; message?: string } | null;
}

function mockSupabase(opts: MockOptions) {
  const single = vi.fn().mockResolvedValue(
    opts.existing !== undefined
      ? { data: opts.existing, error: opts.readError ?? null }
      : { data: null, error: { message: 'no existing mock configured' } }
  );
  const eqRead = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq: eqRead });

  const updateSingle = vi.fn().mockResolvedValue(
    opts.updated !== undefined
      ? { data: opts.updated, error: opts.updateError ?? null }
      : opts.updateError
        ? { data: null, error: opts.updateError }
        : { data: null, error: null }
  );
  const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
  const neq = vi.fn().mockReturnValue({ select: updateSelect });
  const eqUpdate = vi.fn().mockReturnValue({ neq });
  const update = vi.fn().mockReturnValue({ eq: eqUpdate });

  const from = vi.fn((table: string) => {
    if (table !== 'subscriptions') {
      throw new Error(`Unexpected table access: ${table}`);
    }
    return { select, update };
  });

  vi.mocked(createServiceClient).mockReturnValue({ from } as never);

  return { from, select, eqRead, single, update, eqUpdate, neq, updateSelect, updateSingle };
}

const ACTIVE_GROWTH: Existing = {
  plan_tier: 'growth',
  status: 'active',
  billing_cycle: 'monthly',
  renewal_date: '2026-05-12',
  companies: { name: 'Acme' },
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/intercom/subscriptions', () => {
  describe('auth', () => {
    it('returns 401 when authorization header is missing', async () => {
      const supa = mockSupabase({});
      const res = await POST(
        makeRequest({ body: { company_id: VALID_UUID, action: 'cancel' }, authHeader: null })
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorised' });
      expect(supa.from).not.toHaveBeenCalled();
      expect(intercomRequest).not.toHaveBeenCalled();
    });

    it('returns 401 when bearer token is wrong', async () => {
      mockSupabase({});
      const res = await POST(
        makeRequest({
          body: { company_id: VALID_UUID, action: 'cancel' },
          authHeader: 'Bearer wrong-key',
        })
      );
      expect(res.status).toBe(401);
    });

    it('returns 401 when INTERCOM_CONNECTOR_API_KEY env var is unset', async () => {
      const original = process.env.INTERCOM_CONNECTOR_API_KEY;
      delete process.env.INTERCOM_CONNECTOR_API_KEY;
      try {
        mockSupabase({});
        const res = await POST(
          makeRequest({ body: { company_id: VALID_UUID, action: 'cancel' } })
        );
        expect(res.status).toBe(401);
      } finally {
        process.env.INTERCOM_CONNECTOR_API_KEY = original;
      }
    });
  });

  describe('content negotiation', () => {
    it('returns 415 when Content-Type is missing', async () => {
      mockSupabase({});
      const res = await POST(
        makeRequest({ body: { company_id: VALID_UUID, action: 'cancel' }, contentType: null })
      );
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: 'Content-Type must be application/json' });
    });

    it('returns 415 when Content-Type is not application/json', async () => {
      mockSupabase({});
      const res = await POST(
        makeRequest({
          body: { company_id: VALID_UUID, action: 'cancel' },
          contentType: 'text/plain',
        })
      );
      expect(res.status).toBe(415);
    });
  });

  describe('body validation', () => {
    it('returns 400 on malformed JSON', async () => {
      mockSupabase({});
      const res = await POST(makeRequest({ rawBody: '{not json' }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
    });

    it('returns 400 when company_id is missing', async () => {
      mockSupabase({});
      const res = await POST(makeRequest({ body: { action: 'cancel' } }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/company_id is required/);
    });

    it('returns 400 when company_id is not a valid UUID', async () => {
      mockSupabase({});
      const res = await POST(
        makeRequest({ body: { company_id: 'not-a-uuid', action: 'cancel' } })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/valid UUID/);
    });

    it('returns 400 when action is missing or unknown', async () => {
      mockSupabase({});
      const res = await POST(
        makeRequest({ body: { company_id: VALID_UUID, action: 'delete' } })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/change_plan.*cancel/);
    });

    it('returns 400 when change_plan is missing new_plan_tier', async () => {
      mockSupabase({});
      const res = await POST(
        makeRequest({ body: { company_id: VALID_UUID, action: 'change_plan' } })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/new_plan_tier is required/);
    });

    it('returns 400 when new_plan_tier is invalid', async () => {
      mockSupabase({});
      const res = await POST(
        makeRequest({
          body: { company_id: VALID_UUID, action: 'change_plan', new_plan_tier: 'platinum' },
        })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/starter, growth, enterprise/);
    });
  });

  describe('lookup', () => {
    it('returns 404 when no subscription exists for the company', async () => {
      mockSupabase({ existing: null, readError: { message: 'no rows' } });
      const res = await POST(makeRequest({ body: { company_id: VALID_UUID, action: 'cancel' } }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'No subscription found for this company' });
      expect(intercomRequest).not.toHaveBeenCalled();
    });
  });

  describe('change_plan happy path', () => {
    it('updates Supabase and pushes correct attributes to Intercom', async () => {
      const supa = mockSupabase({
        existing: ACTIVE_GROWTH,
        updated: {
          plan_tier: 'enterprise',
          status: 'active',
          billing_cycle: 'monthly',
          renewal_date: '2026-05-12',
        },
      });
      vi.mocked(intercomRequest).mockResolvedValue({});

      const res = await POST(
        makeRequest({
          body: { company_id: VALID_UUID, action: 'change_plan', new_plan_tier: 'enterprise' },
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({
        supabase_updated: true,
        intercom_synced: true,
        message: 'Plan changed to enterprise.',
        company_name: 'Acme',
        subscription: {
          plan_tier: 'enterprise',
          status: 'active',
          billing_cycle: 'monthly',
          renewal_date: '2026-05-12',
        },
      });
      expect(json).not.toHaveProperty('intercom_error');

      // Supabase update was called with the right patch and status guard.
      expect(supa.update).toHaveBeenCalledWith({ plan_tier: 'enterprise' });
      expect(supa.eqUpdate).toHaveBeenCalledWith('company_id', VALID_UUID);
      expect(supa.neq).toHaveBeenCalledWith('status', 'churned');

      // Intercom payload assertion — exact shape that goes to /companies.
      expect(intercomRequest).toHaveBeenCalledWith('POST', '/companies', {
        company_id: VALID_UUID,
        custom_attributes: {
          plan_tier: 'enterprise',
          subscription_status: 'active',
        },
      });
    });
  });

  describe('cancel happy path', () => {
    it('updates status to churned and pushes correct attributes to Intercom', async () => {
      const supa = mockSupabase({
        existing: ACTIVE_GROWTH,
        updated: {
          plan_tier: 'growth',
          status: 'churned',
          billing_cycle: 'monthly',
          renewal_date: '2026-05-12',
        },
      });
      vi.mocked(intercomRequest).mockResolvedValue({});

      const res = await POST(
        makeRequest({ body: { company_id: VALID_UUID, action: 'cancel' } })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({
        supabase_updated: true,
        intercom_synced: true,
        message: 'Subscription cancelled.',
        subscription: { plan_tier: 'growth', status: 'churned' },
      });
      expect(supa.update).toHaveBeenCalledWith({ status: 'churned' });
      expect(intercomRequest).toHaveBeenCalledWith('POST', '/companies', {
        company_id: VALID_UUID,
        custom_attributes: {
          plan_tier: 'growth',
          subscription_status: 'churned',
        },
      });
    });
  });

  describe('conflict cases', () => {
    it('returns 409 when cancelling an already-churned subscription', async () => {
      const supa = mockSupabase({
        existing: { ...ACTIVE_GROWTH, status: 'churned' },
      });
      const res = await POST(
        makeRequest({ body: { company_id: VALID_UUID, action: 'cancel' } })
      );
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'Subscription is already cancelled' });
      expect(supa.update).not.toHaveBeenCalled();
      expect(intercomRequest).not.toHaveBeenCalled();
    });

    it('returns 200 idempotent when change_plan matches current tier (no writes)', async () => {
      const supa = mockSupabase({ existing: ACTIVE_GROWTH });
      const res = await POST(
        makeRequest({
          body: { company_id: VALID_UUID, action: 'change_plan', new_plan_tier: 'growth' },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({
        supabase_updated: false,
        intercom_synced: true,
        message: 'Already on growth plan; no change made.',
        subscription: { plan_tier: 'growth' },
      });
      expect(supa.update).not.toHaveBeenCalled();
      expect(intercomRequest).not.toHaveBeenCalled();
    });

    it('returns 409 when status-guarded UPDATE matches zero rows (concurrent mutation)', async () => {
      const supa = mockSupabase({
        existing: ACTIVE_GROWTH,
        updateError: { code: 'PGRST116', message: 'no rows' },
      });
      const res = await POST(
        makeRequest({
          body: { company_id: VALID_UUID, action: 'change_plan', new_plan_tier: 'enterprise' },
        })
      );
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: 'Subscription state changed concurrently; please retry',
      });
      expect(supa.update).toHaveBeenCalled();
      expect(intercomRequest).not.toHaveBeenCalled();
    });
  });

  describe('failure modes', () => {
    it('returns 500 when Supabase update fails for non-PGRST116 reasons', async () => {
      mockSupabase({
        existing: ACTIVE_GROWTH,
        updateError: { code: '23505', message: 'unique violation' },
      });
      const res = await POST(
        makeRequest({ body: { company_id: VALID_UUID, action: 'cancel' } })
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to update subscription' });
      expect(intercomRequest).not.toHaveBeenCalled();
    });

    it('returns 200 partial-success when Intercom push fails after Supabase write', async () => {
      mockSupabase({
        existing: ACTIVE_GROWTH,
        updated: {
          plan_tier: 'growth',
          status: 'churned',
          billing_cycle: 'monthly',
          renewal_date: '2026-05-12',
        },
      });
      vi.mocked(intercomRequest).mockRejectedValue(
        new Error('Intercom POST /companies failed (502): Bad Gateway')
      );

      const res = await POST(
        makeRequest({ body: { company_id: VALID_UUID, action: 'cancel' } })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({
        supabase_updated: true,
        intercom_synced: false,
        intercom_error: 'Intercom POST /companies failed (502): Bad Gateway',
        message: 'Subscription cancelled. Update will appear in Intercom shortly.',
      });

      // Verify Supabase is NOT rolled back: only one call to from('subscriptions')
      // worth of writes (the original .update). intercomRequest fired exactly once.
      expect(intercomRequest).toHaveBeenCalledTimes(1);
    });
  });
});

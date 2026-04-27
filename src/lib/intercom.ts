const REGION_BASE_URLS: Record<string, string> = {
  us: "https://api.intercom.io",
  eu: "https://api.eu.intercom.io",
  au: "https://api.au.intercom.io",
};

function getBaseUrl(): string {
  const raw = process.env.INTERCOM_REGION ?? "us";
  const region = raw.toLowerCase();
  const url = REGION_BASE_URLS[region];
  if (!url) {
    throw new Error(
      `INTERCOM_REGION must be one of: us, eu, au (got: ${raw})`
    );
  }
  return url;
}

function getToken(): string {
  const token = process.env.INTERCOM_ACCESS_TOKEN;
  if (!token) throw new Error("INTERCOM_ACCESS_TOKEN is not set");
  return token;
}

export async function intercomRequest<T = unknown>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Intercom-Version": "2.11",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const remaining = res.headers.get("X-RateLimit-Remaining");
  if (remaining !== null) {
    const n = parseInt(remaining, 10);
    if (n < 50) {
      console.warn(`⚠ Intercom rate limit low: ${n} requests remaining`);
    }
  }

  if (res.status === 429) {
    const reset = res.headers.get("X-RateLimit-Reset");
    throw new Error(
      `Rate limited by Intercom. Resets at ${reset ? new Date(parseInt(reset, 10) * 1000).toISOString() : "unknown"}`
    );
  }

  // 202 Accepted (events) — no body
  if (res.status === 202) return {} as T;

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.errors?.[0]?.message || data?.message || res.statusText;
    const err = new Error(`Intercom ${method} ${path} failed (${res.status}): ${msg}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data as T;
}

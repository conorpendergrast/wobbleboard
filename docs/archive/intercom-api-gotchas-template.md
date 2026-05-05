# Intercom Data Connector POST bugs — field notes

Capture log for Phase 3d.2: configuring the POST Data Connector for
`/api/intercom/subscriptions`. Notes are written during the session, in shorthand.
Polish happens later.

## Session metadata

- **Date:**
- **Endpoint URL configured:**
- **Auth header configured:**
- **Connector test method:** (Intercom's "Test connector" UI / live Fin conversation / both)

## Pre-flight checklist (test deliberately, don't wait for bugs to find you)

For each, note: did Intercom send what I expected? If not, what did it send?

- [ ] **Content-Type header.** Did Intercom default to `application/json`, send something else, or omit it?
- [ ] **JSON body encoding.** Did the body arrive as raw JSON, double-encoded as a JSON string, or wrapped in some Intercom envelope?
- [ ] **URL handling.** Did the URL arrive intact, or did Intercom modify it (path mangling, query string reordering, trailing slash addition/removal)?
- [ ] **Authorization header.** Did the bearer token arrive in the format the endpoint expects?
- [ ] **Variable substitution.** Did Fin's `{company_id}` etc. get substituted before the POST, or did it arrive literally?
- [ ] **Error response handling.** When the endpoint returns 4xx/5xx, does Intercom surface the response body to Fin, or just the status code?
- [ ] **Timeout behaviour.** What happens if the endpoint takes 6+ seconds to respond?
- [ ] **Empty/missing fields.** What happens when Fin doesn't have a value for a required field?

## Bugs encountered

For each bug, fill in:

### Bug N — [short title]

- **Category:** content-type / body-encoding / URL / auth / substitution / error-handling / timeout / other
- **What I tried:** (the connector configuration / the Fin prompt / the test input)
- **What I expected:** (a sentence)
- **What actually happened:** (a sentence — paste error messages verbatim)
- **Evidence:** (request log / screenshot path / Vercel function log timestamp)
- **Workaround:** (what made it work, or "none found")
- **Severity for consulting clients:** high / medium / low
- **Notes:**

(Repeat the block for each bug.)

## Surprises that aren't bugs

Things that were unintuitive but turned out to be working as designed. Worth
noting because clients will hit them too.

## Open questions for Intercom support / docs

Things that aren't bugs but the docs don't explain.

## Session end

- **Connector working end-to-end?** yes / no / partially
- **Decision on direct POST vs Cloudflare Worker proxy:**
- **Time spent:**

# Changelog

All notable changes to Wobbleboard are documented in this file.

## Unreleased

### Added
- **API Route**: `/api/intercom/subscriptions` (GET) - Fetches subscription information for a company via bearer token authentication
- **Environment Variable**: `INTERCOM_CONNECTOR_API_KEY` - Bearer token for external Intercom integration requests
- **Documentation**: Created `.env.example` template for required environment variables
- **Documentation**: Updated README with project overview, setup instructions, database schema details, and API route documentation

## [0.1.0] - 2026-02-27

### Added
- Phase 3: Frontend dashboard with read-only views of companies, contacts, and subscriptions
- Intercom cleanup script for removing demo data
- Phase 2b: Intercom sync capabilities (events, companies, contacts)
- Phase 1: Initial Wobbleboard application with Supabase schema

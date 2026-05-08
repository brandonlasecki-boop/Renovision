# Analytics QA Checklist (Customer Journey)

Use this when validating tracking quality before trusting conversion metrics.

## Run Automated QA Seed + Assertions

```bash
QA_ANALYTICS_CONFIRM=yes npm run analytics:qa:journey
```

This simulates one clean customer journey and validates:

- one session created
- one page_view row per page visit
- `page_viewed` once per route entry
- `landing_page_viewed` once only when first page is `/`
- max scroll depth persisted
- click count persisted
- funnel events present once each
- customer filtering behavior

## Manual Journey (Browser)

Simulate this flow in a clean browser session:

1. Visit `/`
2. Scroll to ~50%
3. Click main CTA
4. Go to `/try`
5. Start upload
6. Complete upload
7. Select style
8. Start generation
9. Complete generation
10. Click contractor CTA
11. Submit lead

## Manual Verification in Admin

1. Open `/admin/analytics?range=24h&traffic=customer`
2. Confirm:
   - Funnel shows +1 at each step for the journey session
   - Page performance uses `analytics_page_views` data
   - `/` and `/try` each have one page-view row for the visit
   - max scroll and click counts are populated
3. Confirm Admin traffic behavior:
   - Default customer view excludes admin sessions
   - Switching traffic filter to `all` includes admin traffic

## Export Verification

Use export endpoint:

```bash
/api/admin/analytics/export?range=24h
```

Check JSON includes:

- `session_type`
- `normalized_source`
- `data_quality` section
- journey session and events

And defaults:

- customer traffic only
- admin excluded unless `include_admin=true`
- local dev excluded unless `include_local_dev=true`

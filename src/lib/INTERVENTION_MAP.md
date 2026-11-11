# Internal intervention map

- Source: existing `work_orders` with status `afgetekend`. Destination uses the existing `destinationAddress` helper, never an enabled-but-empty worksite fallback. Invoice/customer-only records and Simpla invoice history are not evidence of an intervention.
- Access: admin only, validated by authenticated server functions and admin RLS on the persistent address cache. No public endpoint/dataset. Stable ID paging, 500 work orders per page.
- Map: keyless CARTO Voyager raster tiles (OSM data; tile.openstreetmap.org blocks no-referrer apps) with attribution. Only tile indices reach the tile server; no customer labels/addresses are included. Basemap tile access still reveals approximate viewport to the tile provider. Leaflet imports execute in the browser, clusters handle large location sets.
- No address lookup occurs on loading, filtering or viewing the map. Manual coordinates are the credential-free alternative and are validated; no fabricated demo pins.

## Optional approved geocoding

Configuration is disabled by default. An administrator must approve a provider, its privacy/data-processing terms and any cost, then set these server secrets in Project Settings → Secrets:

- `INTERVENTION_GEOCODER_URL`: administrator-controlled HTTPS address-geocoder adapter endpoint (not arbitrary browser input).
- `INTERVENTION_GEOCODER_DAILY_LIMIT`: integer 1–1000; explicit global daily request cap.
- `INTERVENTION_GEOCODER_KEY`: optional adapter bearer credential. Never exposed to browser.

Adapter contract: POST JSON `{ "address": "full service address", "countryCodes": ["BE", "NL"] }`; returns `{ "lat": 50.0, "lon": 5.0, "precision": "address" }` only for premises-level matches. Approximate postcode/city results are rejected. 10-second timeout, no redirects. Do not configure the public Nominatim bulk endpoint; use an approved private/self-hosted adapter if customer addresses must not leave the organization.

The explicit lookup button submits a maximum of five existing completed-work-order IDs per call. The server resolves destinations itself. A database-locked daily ledger imposes one global request per 1.2 seconds and a 60-second per-address lease; successes are cached without TTL, failures remain visible and retryable. A repeated click reuses successful results. Stop at the global budget; no background job or paid service is activated.

Historical coverage currently starts with actual local completed work orders (27 October 2026 in the audited data). Earlier interventions require an actual service-address/work-order archive; Simpla sales invoices alone are insufficient. No historical archive import is implemented without a real source file.
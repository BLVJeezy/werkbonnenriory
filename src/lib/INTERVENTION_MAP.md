# Internal intervention map

- Source: existing `work_orders` with status `afgetekend`. Destination uses the existing `destinationAddress` helper, never an enabled-but-empty worksite fallback. Invoice/customer-only records and Simpla invoice history are not evidence of an intervention.
- Access: admin only, validated by authenticated server functions and admin RLS on the persistent address cache. No public endpoint/dataset. Stable ID paging, 500 work orders per page.
- Map: Google Maps JavaScript API via the Lovable-managed Google Maps connection. The browser key (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`) is referrer-restricted to Lovable domains; the tracking ID goes along as `channel`. The script loads with `loading=async` plus an init callback, POI clicks are disabled, and Google's logo/copyright stay in place. Markers are app-owned `google.maps.Marker` pins clustered with `@googlemaps/markerclusterer`; no map ID is configured.
- No address lookup occurs on loading, filtering or viewing the map. Manual coordinates are the credential-free alternative and are validated; no fabricated demo pins.

## Google geocoding

Address lookup uses the Google Geocoding API through the connector gateway (`https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json`) with `Authorization: Bearer $LOVABLE_API_KEY` and `X-Connection-Api-Key: $GOOGLE_MAPS_API_KEY`, server-side only. It is active automatically once the Google Maps connection is linked; `INTERVENTION_GEOCODER_DAILY_LIMIT` optionally overrides the default global daily cap of 50 requests (1–1000).

Only premises-level results (`ROOFTOP` or `RANGE_INTERPOLATED`) may become pins; postcode/city-centroid results are rejected via the tested `pickPremisesLocation` helper. 10-second timeout, no redirects.

The explicit lookup button submits a maximum of five existing completed-work-order IDs per call. The server resolves destinations itself. A database-locked daily ledger imposes a per-address lease and the global budget; successes are cached without TTL, failures remain visible and retryable. A repeated click reuses successful results. No background job is activated.

Historical coverage currently starts with actual local completed work orders (27 October 2026 in the audited data). Earlier interventions require an actual service-address/work-order archive; Simpla sales invoices alone are insufficient. No historical archive import is implemented without a real source file.


## Simpla customer addresses

At the admin's explicit request (11 Nov 2026), all Simpla customer addresses (delivery address when filled, else customer address; street required) are shown as locations merged with work-order locations on the same normalized key. They are read server-side via `SIMPLA_API_TOKEN`, memoized 10 minutes, and geocoded by Simpla customer ID so the browser never supplies addresses. Crew/activity/status filters hide them. Default daily geocoding budget is 3500 (max 5000), throttle 200 ms; the bulk button only sends addresses with no cache row, so failures are not re-billed automatically.

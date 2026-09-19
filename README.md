# PawFinder Syria

A local lost-and-found animal reporting app, built with HTML, CSS and vanilla JavaScript. Leaflet provides the map. No build step, accounts, backend, editing/deletion, or deployment.

## Run

Open a terminal in this folder:

```powershell
node server.mjs
```

Visit http://127.0.0.1:4173. Alternatively use VS Code Live Server. **Do not double-click index.html**: JavaScript modules and configuration fetching need HTTP. Internet is required for Leaflet, map tiles, optional fonts, and place search. The form and coordinate fields remain usable if map services fail.

```powershell
npm test
```

Tests use Node's built-in test runner; there are no npm dependencies to install.

## What works

- Submit lost/found reports with title, animal type, description, contact, last-seen date/time, neighborhood, and coordinates.
- Click the map or drag its pin. A map click reverse-geocodes the selected public coordinates and fills Neighborhood / city when a place is available. Keyboard users can enter latitude/longitude.
- **Use my current location** uses the browser's GPS/geolocation permission, then centers the map and fills the nearby neighborhood/city where possible.
- Explicit place-name search calls Nominatim using `fetch`, `async`/`await`, response checks and a timeout. Picking a result centers the map; then choose the exact spot.
- An **I found an animal** button opens the form with Found selected; found reports display a marker but no search circle.
- Add an optional JPG, PNG or WebP photo up to 1 MB. It is saved only in this browser with the report; it is not uploaded to an API.
- Combined text, status, animal, and location filters.
- JSON/localStorage persistence. Reports stay in this browser and origin; changing localhost/127.0.0.1/port changes the storage origin. They are not shared online.
- No preloaded fictional reports or demo labels, as requested.
- Lost reports show an adjustable circle; found reports show only the marker.

## Search-area formula

```js
const hours = (Date.now() - new Date(lastSeen).getTime()) / 3600000;
const radius = Math.min(5000, Math.round(base * (1 + Math.sqrt(hours / 24))));
```

Base: cat 250 m, dog 500 m, other 250 m. These are **illustrative app design choices**, not animal-movement research. They do not represent likelihood or a safe/searchable route. Automatic suggestions cap at 5 km. Manual values can be 100 m–10 km and stay fixed when animal/time changes. “Reset suggestion” restores automatic mode. Coordinates, timestamp, radius and mode are saved. Opening an automatic report recalculates using the current time; an open circle refreshes every minute. Moving the pin moves the circle. Found reports retain the form radius metadata but do not display a circle.

## Service configuration and policies

`config.json` controls the geocoding endpoint, tile URL, and attribution. A replacement geocoder must support the configured Nominatim-compatible query/response contract, or `js/api.js` needs an adapter.

**Nominatim is a community-operated, limited service, not an unrestricted production API.** Its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) was reviewed on 2026-09-19. This app uses explicit button searches, no autocomplete, `countrycodes=sy`, a 1.1-second minimum interval, browser Referer identification, and up to 30 cached searches for 24 hours. It coordinates same-origin tabs using Web Locks where supported and stores the last request time. Never send private details—only public place names. Do not use bulk queries. Attribution appears below the form map.

The public limit is **one request per second across the entire application**, not per visitor. This browser-only implementation is intended for your local presentation; it cannot enforce an aggregate limit across different devices. Before any public/shared deployment, use a provider with suitable terms or an application-wide rate-limited proxy, review current policy, and retain an easy provider-switch mechanism. There is no automatic retry storm.

An explicitly selected map point (including an approved GPS result) makes one reverse-geocoding request to turn latitude/longitude into a nearby neighborhood/city. It sends coordinates to Nominatim; it never sends your contact information, description or photo. Full request/response examples are in [API_FETCH_EXPLAINER.md](API_FETCH_EXPLAINER.md).

OSM [tile policy](https://operations.osmfoundation.org/policies/tiles/) was also reviewed. The app uses the required HTTPS tile URL, visible linked OpenStreetMap attribution, normal browser caching and Referer behavior. It does not prefetch, bulk download, or offer offline tile downloads. Do not disable Referer, override cache behavior, or remove attribution. Third-party services may see your IP and place queries. Fonts can fail without stopping the app.

Leaflet documentation: https://leafletjs.com/reference.html — circle radii are in meters.

## File guide

| File | Responsibility |
| --- | --- |
| `index.html` / `style.css` | Semantic layout, modal form, responsive visual design |
| `js/app.js` | State, DOM rendering, events, forms and orchestration |
| `js/model.js` | Pure validation, radius and filtering functions |
| `js/map.js` | Leaflet loading, tiles, draggable marker and circle |
| `js/api.js` | Geocoding fetch, cache, rate limit and error handling |
| `js/storage.js` | JSON persistence and damaged/blocked storage handling |
| `tests/model.test.js` | Automated business logic, storage and API tests |

User/API content is inserted with `textContent`, never interpolated into HTML. Storage failures leave new reports in memory with a warning. Damaged existing data is not silently overwritten. Browser storage is not encrypted: do not enter sensitive contact information on a shared computer.

## Two-person presentation

1. **Partner A (UI/data):** describe the problem, add a report, explain objects/arrays, `FormData`, validation, event listeners and state → render.
2. **Partner B (map/API):** perform one deliberate Syrian place search, show the Network request, select a result, place/drag the pin, explain `fetch`/JSON, GPS vs reverse geocoding, and the radius formula.
3. Change animal/time in automatic mode; move the slider, change animal again, and show the manual radius stays fixed. Reset the suggestion.
4. Save, combine filters, open the report and refresh the page to demonstrate localStorage.
5. Submit a found report and show there is no circle. Explain browser-only storage and why prediction claims would be misleading.

Understand each function before presenting. Focus on how data flows, not memorizing the entire source. Advanced lecture topics that add no value here are covered in the study guide instead of forced into the app.

## Verification checklist

- Place and drag a marker; circle follows. Search selection only centers the map; direct map selection works without searching.
- Test cat/dog/other at now, 24 hours, and a long interval. Reject future/invalid timestamps.
- Set radius to 100 m and 10 km; change type/time; confirm manual mode remains. Reset to automatic.
- Open saved automatic/manual/lost/found reports, then reload and check persistence.
- Combine all filters; test empty results and reset.
- Check narrow viewport, dialog scrolling, labels, keyboard focus, Escape and coordinate entry.
- Simulate geocoder 429/network errors, blocked Leaflet/tiles, and unavailable/corrupt localStorage. Show readable warnings and no false success claims.

See `VERIFICATION.md` for checks actually run during implementation.

## Publishing with GitHub Pages

The repository remote is already `https://github.com/moner005/PawFinder.git`. To publish, first push the current code to its `main` branch. Then on GitHub: **PawFinder → Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**. GitHub will show the public Pages URL after deployment. Open that URL and test the map/GPS feature over HTTPS.

GitHub Pages provides HTTPS, which browser GPS normally requires. Local reports/photos remain per browser and will not appear for other visitors. Before sharing publicly, review the Nominatim/OSM limits above: the browser-only rate limiter cannot enforce the provider's one-request-per-second limit across all visitors. A proper shared deployment needs a provider or backend that supports that traffic.

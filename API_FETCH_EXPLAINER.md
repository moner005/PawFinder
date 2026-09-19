# What the API `fetch` is doing

This is PawFinder's most important external-data feature.

The app does **not** fetch animal reports, users, images, or secret information. Reports and optional photos are saved only in browser localStorage.

It fetches public map-place information from Nominatim, which uses OpenStreetMap data.

## Place-name search: name → coordinates

When the user types **Damascus** and presses **Search**, PawFinder sends:

```text
GET https://nominatim.openstreetmap.org/search
  ?q=Damascus
  &format=jsonv2
  &countrycodes=sy
  &limit=5
  &accept-language=en
```

It receives JSON like:

```json
[{"display_name":"Damascus, Damascus Governorate, Syria","lat":"33.5138","lon":"36.2765"}]
```

Then it turns that JSON into JavaScript objects:

```js
const places = data.map(place => ({
  label: place.display_name,
  lat: Number(place.lat),
  lng: Number(place.lon)
}));
```

Selecting a result centers Leaflet on the latitude/longitude. The user still clicks the exact last-seen point—searching a city is not precise enough to claim an exact location.

## Map click / GPS: coordinates → neighborhood

When the user clicks the map or presses **Use my current location**, the browser supplies coordinates, such as `33.5138, 36.2765`. PawFinder then fetches:

```text
GET https://nominatim.openstreetmap.org/reverse
  ?lat=33.5138
  &lon=36.2765
  &format=jsonv2
  &zoom=16
  &accept-language=en
```

The reply can contain:

```json
{"address":{"neighbourhood":"Al-Malki","city":"Damascus"}}
```

The app combines those fields and fills Neighborhood / city with `Al-Malki, Damascus`. If no label comes back, the user can type it.

GPS itself is **not fetch**. It uses `navigator.geolocation.getCurrentPosition()` and asks for browser permission. Reverse geocoding is the separate `fetch` request that turns selected coordinates into a readable place.

## The JavaScript flow

```js
const response = await fetch(url, { headers: { Accept: 'application/json' } });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const data = await response.json();
```

- `fetch(url)` sends an HTTP request and returns a Promise.
- The first `await` waits for the HTTP response.
- `response.ok` checks successful HTTP status. Fetch does not automatically reject a 404 or 429.
- The second `await` parses JSON into a JavaScript array/object.
- `try/catch/finally` handles network errors, timeouts, invalid data and UI cleanup.

## Why the app is careful

Nominatim is a community service. PawFinder uses only user-triggered searches/clicks, sends public place names or selected coordinates—not contact details—checks errors, caches searches, and keeps at least 1.1 seconds between requests. It shows OpenStreetMap/Nominatim attribution.

For the presentation: open DevTools **Network**, press Search, select the request, and show its URL and JSON response. Explain: **we fetch location data, transform JSON into JavaScript objects, then use coordinates to update the Leaflet map.**

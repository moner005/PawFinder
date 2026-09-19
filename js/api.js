// Explicit searches only. Never called on typing, and never used for personal data.
export function createPlaceSearch(config, { fetcher = fetch, storage = null, now = Date.now } = {}) {
  const cache = new Map();
  let busy = false;
  let lastRequest = 0;
  return async function searchPlaces(query) {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) throw new Error('Enter at least two characters of a Syrian place name.');
    const key = `${config.geocodingUrl}|${normalized}`;
    if (cache.has(key)) return cache.get(key);
    try {
      const saved = JSON.parse(storage?.getItem('pawfinder-places') || '{}');
      if (saved[key] && now() - saved[key].time < 86400000 && Array.isArray(saved[key].places)) return saved[key].places;
    } catch { /* Storage is optional for search. */ }
    if (busy) throw new Error('A place search is already running.');
    busy = true;
    const run = async () => {
      let previous = lastRequest;
      try { previous = Math.max(previous, Number(storage?.getItem('pawfinder-last-search')) || 0); } catch {}
      if (now() - previous < 1100) throw new Error('Please wait a moment before searching again.');
      lastRequest = now();
      try { storage?.setItem('pawfinder-last-search', String(lastRequest)); } catch {}
      const url = new URL(config.geocodingUrl);
      url.search = new URLSearchParams({q:query.trim(), format:'jsonv2', countrycodes:'sy', limit:'5', 'accept-language':'en'});
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetcher(url, {signal:controller.signal, headers:{Accept:'application/json'}});
        if (!response.ok) throw new Error(`Place search is unavailable (HTTP ${response.status}). Click the map instead.`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Unexpected search response. Click the map instead.');
        const places = data.filter(p => typeof p.display_name === 'string' && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
          .map(p => ({label:p.display_name, lat:Number(p.lat), lng:Number(p.lon)}));
        cache.set(key, places);
        try {
          const saved = JSON.parse(storage?.getItem('pawfinder-places') || '{}');
          saved[key] = {time:now(), places};
          const entries = Object.entries(saved).slice(-30);
          storage?.setItem('pawfinder-places', JSON.stringify(Object.fromEntries(entries)));
        } catch {}
        return places;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('Place search timed out. You can still click the map.');
        throw error;
      } finally { clearTimeout(timeout); }
    };
    try {
      // Coordinates same-origin tabs when supported; public multi-user hosting needs global rate limiting.
      return globalThis.navigator?.locks ? await navigator.locks.request('pawfinder-geocoding', run) : await run();
    } finally { busy = false; }
  };
}

// Reverse geocoding is deliberately triggered by a map/GPS action, never by movement.
// It converts public coordinates into a readable nearby place label for the form.
export function createReverseGeocode(config, { fetcher = fetch, storage = null, now = Date.now } = {}) {
  let busy = false;
  return async function reverseGeocode({ lat, lng }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('A valid map location is needed.');
    if (busy) return null;
    busy = true;
    const run = async () => {
      let previous = 0;
      try { previous = Number(storage?.getItem('pawfinder-last-search')) || 0; } catch {}
      const pause = Math.max(0, 1100 - (now() - previous));
      if (pause) await new Promise(resolve => setTimeout(resolve, pause));
      const requestTime = now();
      try { storage?.setItem('pawfinder-last-search', String(requestTime)); } catch {}
      const url = new URL(config.geocodingUrl.replace(/\/search$/, '/reverse'));
      url.search = new URLSearchParams({ lat:String(lat), lon:String(lng), format:'jsonv2', zoom:'16', 'accept-language':'en' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetcher(url, { signal:controller.signal, headers:{Accept:'application/json'} });
        if (!response.ok) throw new Error(`Location lookup unavailable (HTTP ${response.status}).`);
        const data = await response.json();
        const address = data?.address;
        if (!address || typeof address !== 'object') return null;
        const neighborhood = address.neighbourhood || address.suburb || address.quarter || address.village || address.town || address.city || address.county || address.state;
        const city = address.city || address.town || address.village || address.state;
        return [neighborhood, city].filter((value, index, values) => typeof value === 'string' && values.indexOf(value) === index).join(', ') || data.display_name?.split(',').slice(0, 2).join(', ') || null;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('Location lookup timed out.');
        throw error;
      } finally { clearTimeout(timeout); }
    };
    try { return globalThis.navigator?.locks ? await navigator.locks.request('pawfinder-geocoding', run) : await run(); }
    finally { busy = false; }
  };
}

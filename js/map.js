let libraryPromise;
export function loadMapLibrary() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    const timeout = setTimeout(() => reject(new Error('Map library timed out. Enter coordinates below.')), 12000);
    script.onload = () => { clearTimeout(timeout); resolve(globalThis.L); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('Map unavailable. Check your connection or enter coordinates below.')); };
    document.head.append(script);
  });
  return libraryPromise;
}
export function createMap(L, element, config, message, onPick) {
  const map = L.map(element).setView([34.8, 38.2], 6);
  L.tileLayer(config.tileUrl, { attribution:config.tileAttribution, maxZoom:19 }).on('tileerror', () => {
    message.textContent = 'Map tiles could not load. Your location is still saved; try again when connected. You can also enter coordinates.';
  }).addTo(map);
  let marker = null;
  let circle = null;
  let radius = null;
  const icon = L.divIcon({className:'paw-pin', html:'⌖', iconSize:[32,32], iconAnchor:[16,16]});
  function setPoint(point, center = false) {
    if (!marker) {
      marker = L.marker([point.lat,point.lng], {draggable:!!onPick, icon, title:'Last-seen location', keyboard:true}).addTo(map);
      marker.on('dragend', () => { const {lat,lng} = marker.getLatLng(); setPoint({lat,lng}); onPick?.({lat,lng}); });
    } else marker.setLatLng([point.lat,point.lng]);
    setRadius(radius);
    if (center) map.setView([point.lat,point.lng], 14);
  }
  function setRadius(value) {
    radius = value;
    if (circle) { circle.remove(); circle = null; }
    if (marker && value !== null) circle = L.circle(marker.getLatLng(), {radius:value,color:'#426b48',weight:2,fillColor:'#73936a',fillOpacity:.17,interactive:false}).addTo(map);
  }
  if (onPick) map.on('click', event => { const point = {lat:event.latlng.lat,lng:event.latlng.lng}; setPoint(point); onPick(point); });
  return {
    setPoint, setRadius,
    center(point) { map.setView([point.lat,point.lng], 14); },
    resize() { map.invalidateSize(); },
    clear() { marker?.remove(); circle?.remove(); marker = null; circle = null; radius = null; },
    fit() { if (circle) map.fitBounds(circle.getBounds(), {padding:[30,30],maxZoom:16}); },
  };
}

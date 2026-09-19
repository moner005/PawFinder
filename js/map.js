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
  // The tip, rather than the center of the artwork, marks the exact coordinate.
  // Animate the inner SVG only: Leaflet owns the outer element's position transform.
  const icon = L.divIcon({
    className:'pet-location-pin',
    html:`<span class="pin-ground" aria-hidden="true"></span><svg class="pin-art" viewBox="0 0 48 58" aria-hidden="true"><path class="pin-body" d="M24 2C12 2 3 11 3 23c0 14 21 32 21 32s21-18 21-32C45 11 36 2 24 2Z"/><circle cx="24" cy="23" r="15" fill="white"/><g fill="#245c48"><ellipse cx="15" cy="19" rx="2.8" ry="3.8" transform="rotate(-25 15 19)"/><ellipse cx="21" cy="15" rx="2.7" ry="3.6"/><ellipse cx="28" cy="15" rx="2.7" ry="3.6"/><ellipse cx="34" cy="19" rx="2.8" ry="3.8" transform="rotate(25 34 19)"/><path d="M16 28c0-4 4-8 8-8s8 4 8 8c0 5-5 2-8 2s-8 3-8-2Z"/></g></svg>`,
    iconSize:[48,58], iconAnchor:[24,55], tooltipAnchor:[0,-49]
  });
  function setPoint(point, center = false) {
    if (!marker) {
      marker = L.marker([point.lat,point.lng], {draggable:!!onPick, icon, title:onPick ? 'Last-seen location — drag to move' : 'Last-seen location', keyboard:true}).addTo(map);
      marker.bindTooltip(onPick ? 'Drag to adjust location' : 'Last-seen location', {direction:'top', className:'pet-pin-tooltip'});
      marker.on('dragstart', () => marker.getElement()?.classList.add('is-dragging'));
      marker.on('dragend', () => marker.getElement()?.classList.remove('is-dragging'));
      marker.on('dragend', () => { const {lat,lng} = marker.getLatLng(); setPoint({lat,lng}); onPick?.({lat,lng}); });
    } else marker.setLatLng([point.lat,point.lng]);
    setRadius(radius);
    if (center) map.setView([point.lat,point.lng], 14);
  }
  function setRadius(value) {
    radius = value;
    if (circle) { circle.remove(); circle = null; }
    if (marker && value !== null) circle = L.circle(marker.getLatLng(), {radius:value,color:'#39795d',weight:2,dashArray:'6 7',fillColor:'#67a787',fillOpacity:.13,interactive:false}).addTo(map);
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

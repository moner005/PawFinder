import { suggestedRadius, effectiveRadius, validateReport, filterReports, localDateTime, validCoordinates } from './model.js';
import { loadReports, saveReports } from './storage.js';
import { createPlaceSearch } from './api.js';
import { loadMapLibrary, createMap } from './map.js';

const $ = selector => document.querySelector(selector);
const form = $('#report-form');
const dialog = $('#report-dialog');
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const loaded = loadReports(storage);
let reports = loaded.reports;
let selectedId = null;
let point = null;
let radiusMode = 'auto';
let browseMap;
let formMap;
let searchPlaces;
let searchVersion = 0;
$('#storage-message').textContent = loaded.warning;

function filters() {
  return Object.fromEntries(['text','status','animal','location'].map(key => [key, $(`#filter-${key}`).value]));
}
function render() {
  const visible = filterReports(reports, filters());
  $('#report-count').textContent = `${visible.length} of ${reports.length} reports`;
  $('#empty-state').hidden = visible.length > 0;
  $('#empty-state').textContent = reports.length ? 'No reports match these filters. Try a different place or clear the filters.' : 'No reports yet. Lost a companion or found an animal? Add the first report.';
  $('#cards').replaceChildren();
  for (const report of visible) {
    const card = $('#card-template').content.cloneNode(true);
    card.querySelector('article').classList.toggle('selected', report.id === selectedId);
    card.querySelector('.card-art').classList.add(report.animal);
    const badge = card.querySelector('.status-badge');
    badge.textContent = report.status;
    badge.classList.add(report.status);
    card.querySelector('.animal-emoji').textContent = {cat:'🐈',dog:'🐕',other:'🐾'}[report.animal];
    card.querySelector('.card-location').textContent = `⌖ ${report.location}`;
    card.querySelector('h3').textContent = report.title;
    card.querySelector('.card-description').textContent = report.description;
    card.querySelector('.card-animal').textContent = report.animal === 'other' ? 'Other animal' : report.animal;
    card.querySelector('button').dataset.id = report.id;
    card.querySelector('button').setAttribute('aria-label', `View ${report.title} on map`);
    $('#cards').append(card);
  }
  if (selectedId && !visible.some(report => report.id === selectedId)) {
    selectedId = null;
    browseMap?.clear();
    $('#report-detail').replaceChildren(makeText('h3', 'Choose a report'), makeText('p','Select a matching report to view its location.'));
  }
}
function makeText(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function showReport(report, center = true) {
  selectedId = report.id;
  const radius = effectiveRadius(report);
  browseMap?.setPoint(report.coordinates, center);
  browseMap?.setRadius(radius);
  if (center && radius !== null) browseMap?.fit();
  const detail = $('#report-detail');
  detail.replaceChildren(makeText('h3',report.title), makeText('p',report.description), makeText('p',`Last seen: ${new Date(report.lastSeen).toLocaleString()} · ${report.location}`), makeText('p',`Coordinates: ${report.coordinates.lat.toFixed(5)}, ${report.coordinates.lng.toFixed(5)}`), makeText('p',`Contact: ${report.contact}`,'detail-contact'));
  if (radius !== null) detail.append(makeText('p',`${radius.toLocaleString()} m radius · ${report.radiusMode === 'auto' ? 'Automatic, updated for current elapsed time' : 'Manually adjusted'}. Suggested search area—not a prediction. Adjust for local conditions.`,'area-note'));
  else detail.append(makeText('p','Found animal: location marker only.'));
  render();
}
$('#cards').addEventListener('click', event => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const report = reports.find(item => item.id === button.dataset.id);
  if (report) { showReport(report); if (matchMedia('(max-width:760px)').matches) $('.map-panel').scrollIntoView({behavior:'smooth',block:'start'}); }
});
for (const key of ['text','status','animal','location']) $(`#filter-${key}`).addEventListener('input', render);
$('#clear-filters').addEventListener('click', () => { for (const key of ['text','status','animal','location']) $(`#filter-${key}`).value = ''; render(); });

function syncRadius() {
  const found = $('#report-status').value === 'found';
  $('#radius-panel').hidden = found;
  $('#found-hint').hidden = !found;
  const suggestion = suggestedRadius($('#report-animal').value, $('#last-seen').value);
  if (radiusMode === 'auto' && suggestion !== null) $('#radius').value = suggestion;
  const radius = Number($('#radius').value);
  $('#radius-value').value = `${radius.toLocaleString()} m`;
  $('#radius-mode').textContent = radiusMode === 'manual' ? 'Manually adjusted' : 'Automatic suggestion';
  formMap?.setRadius(found || suggestion === null ? null : radius);
  $('#last-seen').setCustomValidity(suggestion === null ? 'Choose a valid date and time, not in the future.' : '');
}
function selectPoint(next) {
  point = next;
  $('#latitude').value = next.lat.toFixed(6);
  $('#longitude').value = next.lng.toFixed(6);
  $('#coordinate-label').textContent = `Selected: ${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`;
  syncRadius();
}
for (const button of document.querySelectorAll('[data-new-report]')) button.addEventListener('click', () => {
  form.reset(); point = null; radiusMode = 'auto'; searchVersion++;
  $('#last-seen').value = localDateTime();
  $('#last-seen').max = localDateTime();
  $('#form-error').textContent = '';
  $('#place-message').textContent = '';
  $('#place-results').replaceChildren();
  $('#coordinate-label').textContent = 'No location selected yet.';
  formMap?.clear();
  syncRadius();
  dialog.showModal();
  requestAnimationFrame(() => formMap?.resize());
});
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { searchVersion++; });
for (const id of ['report-status','report-animal','last-seen']) $(`#${id}`).addEventListener('input', syncRadius);
$('#radius').addEventListener('input', () => { radiusMode = 'manual'; syncRadius(); });
$('#reset-radius').addEventListener('click', () => { radiusMode = 'auto'; syncRadius(); });
$('#set-coordinates').addEventListener('click', () => {
  const next = {lat:Number($('#latitude').value),lng:Number($('#longitude').value)};
  if (!$('#latitude').value || !$('#longitude').value || !validCoordinates(next)) { $('#form-error').textContent = 'Enter valid latitude (−90 to 90) and longitude (−180 to 180).'; return; }
  selectPoint(next); formMap?.setPoint(next,true); $('#form-error').textContent = '';
});
$('#search-place').addEventListener('click', async () => {
  const version = ++searchVersion;
  const button = $('#search-place');
  if (!searchPlaces) { $('#place-message').textContent = 'Search is not available. Click the map or enter coordinates.'; return; }
  button.disabled = true;
  $('#place-results').replaceChildren();
  $('#place-message').textContent = 'Searching Syrian places…';
  try {
    const places = await searchPlaces($('#place-query').value);
    if (version !== searchVersion) return;
    $('#place-message').textContent = places.length ? 'Choose a place, then click its exact last-seen location on the map.' : 'No places found. Try another spelling, or choose directly on the map.';
    for (const place of places) {
      const result = makeText('button', place.label);
      result.type = 'button';
      result.addEventListener('click', () => {
        formMap?.center(place);
        $('#report-location').value = place.label.slice(0,160);
        $('#place-results').replaceChildren();
        $('#place-message').textContent = 'Map centered. Click the exact last-seen spot to place your pin.';
      });
      $('#place-results').append(result);
    }
  } catch (error) { if (version === searchVersion) $('#place-message').textContent = `${error.message} You can use the map or coordinates instead.`; }
  finally { button.disabled = false; }
});
$('#place-query').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#search-place').click(); } });
form.addEventListener('submit', event => {
  event.preventDefault();
  syncRadius();
  const values = Object.fromEntries(new FormData(form));
  const report = {...values, title:values.title.trim(), description:values.description.trim(), contact:values.contact.trim(), location:values.location.trim(), coordinates:point, radius:Number($('#radius').value), radiusMode, id:crypto.randomUUID()};
  const errors = validateReport(report);
  if (errors.length) { $('#form-error').textContent = errors.join(' '); return; }
  report.lastSeen = new Date(report.lastSeen).toISOString();
  reports = [report, ...reports];
  const saved = !loaded.readOnly && saveReports(storage, reports);
  $('#storage-message').textContent = saved ? 'Report saved in this browser.' : 'Report added for this session only. Browser storage is unavailable; it will not survive a reload.';
  for (const key of ['text','status','animal','location']) $(`#filter-${key}`).value = '';
  dialog.close();
  showReport(report);
  $('#reports').scrollIntoView({behavior:'smooth'});
});
// Refresh automatic circles as time passes. Manual radii remain unchanged.
setInterval(() => {
  $('#last-seen').max = localDateTime();
  if (dialog.open) syncRadius();
  const report = reports.find(item => item.id === selectedId);
  if (report?.radiusMode === 'auto') showReport(report, false);
}, 60000);
render();
async function initializeServices() {
  try {
    const response = await fetch('./config.json');
    if (!response.ok) throw new Error('Could not load service configuration.');
    const config = await response.json();
    searchPlaces = createPlaceSearch(config, {storage});
    $('#geocoding-credit').textContent = config.geocodingAttribution;
    const L = await loadMapLibrary();
    browseMap = createMap(L, 'browse-map', config, $('#browse-map-message'));
    formMap = createMap(L, 'form-map', config, $('#form-map-message'), selectPoint);
    if (point) { formMap.setPoint(point,true); syncRadius(); }
    if (dialog.open) formMap.resize();
    const report = reports.find(item => item.id === selectedId);
    if (report) showReport(report);
  } catch (error) {
    $('#browse-map-message').textContent = `${error.message} Reports and saved coordinates are still available.`;
    $('#form-map-message').textContent = `${error.message} Use the coordinate fields below.`;
  }
}
initializeServices();

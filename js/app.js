import { suggestedRadius, effectiveRadius, validateReport, filterReports, localDateTime, validCoordinates } from './model.js';
import { loadReports, saveReports } from './storage.js';
import { createPlaceSearch, createReverseGeocode } from './api.js';
import { loadMapLibrary, createMap } from './map.js';

const $ = selector => document.querySelector(selector);
const form = $('#report-form');
const dialog = $('#report-dialog');
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const themeToggle = $('#theme-toggle');
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : '';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to night mode');
  themeToggle.title = dark ? 'Switch to light mode' : 'Switch to night mode';
}
const savedTheme = (() => { try { return storage?.getItem('pawfinder-theme'); } catch { return null; } })();
applyTheme(savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { storage?.setItem('pawfinder-theme', next); } catch { /* Theme still works for this visit. */ }
});
const loaded = loadReports(storage);
let reports = loaded.reports;
let selectedId = null;
let point = null;
let radiusMode = 'auto';
let browseMap;
let formMap;
let searchPlaces;
let reverseGeocode;
let searchVersion = 0;
let imageData = '';
let editingId = null;
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
    if (report.imageData) {
      const image = card.querySelector('.report-image');
      image.src = report.imageData;
      image.alt = `Photo attached to ${report.title}`;
      card.querySelector('.card-art').classList.add('has-image');
    }
    card.querySelector('.card-location').textContent = `⌖ ${report.location}`;
    card.querySelector('h3').textContent = report.title;
    card.querySelector('.card-description').textContent = report.description;
    card.querySelector('.card-animal').textContent = report.animal === 'other' ? 'Other animal' : report.animal;
    card.querySelector('.card-contact').textContent = `${report.status === 'found' ? 'Finder' : 'Owner'} contact: ${report.contact}`;
    for (const button of card.querySelectorAll('button[data-action]')) button.dataset.id = report.id;
    card.querySelector('[data-action="view"]').setAttribute('aria-label', `View ${report.title} on map`);
    if (report.status === 'found') card.querySelector('[data-action="found"]').hidden = true;
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
  detail.replaceChildren(makeText('h3',report.title), makeText('p',report.description), makeText('p',`Last seen: ${new Date(report.lastSeen).toLocaleString()} · ${report.location}`), makeText('p',`Coordinates: ${report.coordinates.lat.toFixed(5)}, ${report.coordinates.lng.toFixed(5)}`), makeText('p',`${report.status === 'found' ? 'Finder' : 'Owner'} contact: ${report.contact}`,'detail-contact'));
  if (radius !== null) detail.append(makeText('p',`${radius.toLocaleString()} m radius · ${report.radiusMode === 'auto' ? 'Automatic, updated for current elapsed time' : 'Manually adjusted'}. Suggested search area—not a prediction. Adjust for local conditions.`,'area-note'));
  else detail.append(makeText('p','Found animal: location marker only.'));
  render();
}
$('#cards').addEventListener('click', event => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const report = reports.find(item => item.id === button.dataset.id);
  if (!report) return;
  if (button.dataset.action === 'edit') { openReportForm({report}); return; }
  if (button.dataset.action === 'found') {
    if (!confirm(`Mark “${report.title}” as found? You can still edit its details afterwards.`)) return;
    reports = reports.map(item => item.id === report.id ? {...item, status:'found', foundAt:new Date().toISOString()} : item);
    const updated = reports.find(item => item.id === report.id);
    const saved = !loaded.readOnly && saveReports(storage, reports);
    $('#storage-message').textContent = saved ? 'Report marked as found in this browser.' : 'Report changed for this session only; browser storage is unavailable.';
    showReport(updated);
    return;
  }
  showReport(report);
  if (matchMedia('(max-width:760px)').matches) $('.map-panel').scrollIntoView({behavior:'smooth',block:'start'});
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
async function selectPoint(next) {
  point = next;
  $('#latitude').value = next.lat.toFixed(6);
  $('#longitude').value = next.lng.toFixed(6);
  $('#coordinate-label').textContent = `Selected: ${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`;
  syncRadius();
  if (!reverseGeocode) return;
  const version = ++searchVersion;
  $('#place-message').textContent = 'Finding the nearby neighborhood/city…';
  try {
    const location = await reverseGeocode(next);
    if (version !== searchVersion) return;
    if (location) {
      $('#report-location').value = location.slice(0, 160);
      $('#place-message').textContent = 'Neighborhood / city filled from the selected map point.';
    } else $('#place-message').textContent = 'No nearby neighborhood was returned. Please enter it manually.';
  } catch (error) {
    if (version === searchVersion) $('#place-message').textContent = `${error.message} Please enter the neighborhood/city manually.`;
  }
}
function updateFormLabels() {
  const found = $('#report-status').value === 'found';
  $('#contact-label').textContent = found ? 'Finder contact information' : 'Owner contact information';
  if (editingId) $('#dialog-title').textContent = `Edit ${found ? 'found' : 'lost'} report`;
  else $('#dialog-title').textContent = found ? 'Report a found animal' : 'Report a lost animal';
}
function openReportForm({status = 'lost', report = null} = {}) {
  form.reset(); searchVersion++;
  editingId = report?.id ?? null;
  point = report?.coordinates ? {...report.coordinates} : null;
  imageData = report?.imageData ?? '';
  radiusMode = report?.radiusMode ?? 'auto';
  $('#report-status').value = report?.status ?? status;
  $('#report-animal').value = report?.animal ?? 'cat';
  $('#last-seen').value = report ? localDateTime(new Date(report.lastSeen)) : localDateTime();
  $('#report-location').value = report?.location ?? '';
  form.elements.title.value = report?.title ?? '';
  form.elements.description.value = report?.description ?? '';
  form.elements.contact.value = report?.contact ?? '';
  $('#radius').value = report?.radius ?? 250;
  $('#last-seen').max = localDateTime();
  $('#form-error').textContent = '';
  $('#place-message').textContent = report?.imageData ? 'Existing photo will be kept unless you choose a replacement.' : '';
  $('#place-results').replaceChildren();
  if (point) {
    $('#latitude').value = point.lat.toFixed(6);
    $('#longitude').value = point.lng.toFixed(6);
    $('#coordinate-label').textContent = `Selected: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  } else $('#coordinate-label').textContent = 'No location selected yet.';
  formMap?.clear();
  if (point) formMap?.setPoint(point, true);
  updateFormLabels();
  syncRadius();
  dialog.showModal();
  requestAnimationFrame(() => formMap?.resize());
}
for (const button of document.querySelectorAll('[data-new-report],[data-new-report-status]')) button.addEventListener('click', () => openReportForm({status:button.dataset.newReportStatus || 'lost'}));
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { searchVersion++; });
for (const id of ['report-status','report-animal','last-seen']) $(`#${id}`).addEventListener('input', syncRadius);
$('#report-status').addEventListener('change', () => { updateFormLabels(); syncRadius(); });
$('#radius').addEventListener('input', () => { radiusMode = 'manual'; syncRadius(); });
$('#reset-radius').addEventListener('click', () => { radiusMode = 'auto'; syncRadius(); });
$('#set-coordinates').addEventListener('click', () => {
  const next = {lat:Number($('#latitude').value),lng:Number($('#longitude').value)};
  if (!$('#latitude').value || !$('#longitude').value || !validCoordinates(next)) { $('#form-error').textContent = 'Enter valid latitude (−90 to 90) and longitude (−180 to 180).'; return; }
  selectPoint(next); formMap?.setPoint(next,true); $('#form-error').textContent = '';
});
$('#report-image').addEventListener('change', event => {
  const [file] = event.target.files;
  imageData = '';
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 1024 * 1024) {
    event.target.value = '';
    $('#form-error').textContent = 'Choose a JPG, PNG, or WebP image smaller than 1 MB.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { imageData = String(reader.result); $('#form-error').textContent = 'Photo ready to save locally with this report.'; };
  reader.onerror = () => { imageData = ''; $('#form-error').textContent = 'That photo could not be read. Try another image.'; };
  reader.readAsDataURL(file);
});
$('#use-gps').addEventListener('click', () => {
  const button = $('#use-gps');
  if (!navigator.geolocation) { $('#place-message').textContent = 'GPS is not available in this browser. Click the map or enter coordinates.'; return; }
  button.disabled = true;
  $('#place-message').textContent = 'Requesting your current location…';
  navigator.geolocation.getCurrentPosition(position => {
    const next = {lat:position.coords.latitude, lng:position.coords.longitude};
    formMap?.setPoint(next, true);
    selectPoint(next);
    button.disabled = false;
  }, error => {
    button.disabled = false;
    $('#place-message').textContent = error.code === error.PERMISSION_DENIED ? 'Location permission was not granted. Click the map instead.' : 'Current location could not be found. Click the map instead.';
  }, {enableHighAccuracy:true, timeout:10000, maximumAge:60000});
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
  const report = {...values, image:undefined, imageData, title:values.title.trim(), description:values.description.trim(), contact:values.contact.trim(), location:values.location.trim(), coordinates:point, radius:Number($('#radius').value), radiusMode, id:editingId ?? crypto.randomUUID()};
  const errors = validateReport(report);
  if (errors.length) { $('#form-error').textContent = errors.join(' '); return; }
  report.lastSeen = new Date(report.lastSeen).toISOString();
  const editing = Boolean(editingId);
  reports = editing ? reports.map(item => item.id === report.id ? {...item, ...report} : item) : [report, ...reports];
  const saved = !loaded.readOnly && saveReports(storage, reports);
  $('#storage-message').textContent = saved ? `Report ${editing ? 'updated' : 'saved'} in this browser.` : `Report ${editing ? 'updated' : 'added'} for this session only. Browser storage is unavailable; it will not survive a reload.`;
  for (const key of ['text','status','animal','location']) $(`#filter-${key}`).value = '';
  editingId = null;
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
    reverseGeocode = createReverseGeocode(config, {storage});
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

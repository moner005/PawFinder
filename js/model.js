export const ANIMALS = ['cat', 'dog', 'other'];
export const BASE_RADIUS = { cat: 250, dog: 500, other: 250 };
export function suggestedRadius(animal, lastSeen, now = Date.now()) {
  const timestamp = new Date(lastSeen).getTime();
  if (!Number.isFinite(timestamp) || timestamp > now) return null;
  const hours = (now - timestamp) / 3600000;
  return Math.min(5000, Math.round((BASE_RADIUS[animal] ?? 250) * (1 + Math.sqrt(hours / 24))));
}
export function effectiveRadius(report, now = Date.now()) {
  if (report.status === 'found') return null;
  return report.radiusMode === 'manual' ? report.radius : suggestedRadius(report.animal, report.lastSeen, now);
}
export function validCoordinates(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}
export function validateReport(report, now = Date.now()) {
  const errors = [];
  for (const [key, min, max] of [['title', 3, 80], ['description', 10, 1000], ['contact', 3, 160], ['location', 2, 160]]) {
    if (typeof report[key] !== 'string' || report[key].trim().length < min || report[key].length > max) errors.push(`${key[0].toUpperCase() + key.slice(1)} must be ${min}–${max} characters.`);
  }
  if (!['lost', 'found'].includes(report.status)) errors.push('Choose lost or found.');
  if (!ANIMALS.includes(report.animal)) errors.push('Choose an animal type.');
  if (typeof report.lastSeen !== 'string' || !report.lastSeen || suggestedRadius(report.animal, report.lastSeen, now) === null) errors.push('Last-seen time must be valid and cannot be in the future.');
  if (!validCoordinates(report.coordinates)) errors.push('Choose a location on the map, or enter valid coordinates.');
  if (!['auto', 'manual'].includes(report.radiusMode)) errors.push('Invalid radius mode.');
  if (!Number.isFinite(report.radius) || report.radius < 100 || report.radius > 10000) errors.push('Radius must be between 100 m and 10,000 m.');
  return errors;
}
export function filterReports(reports, { text = '', status = '', animal = '', location = '' }) {
  const query = text.trim().toLowerCase();
  const place = location.trim().toLowerCase();
  return reports.filter(report => (!status || report.status === status)
    && (!animal || report.animal === animal)
    && report.location.toLowerCase().includes(place)
    && `${report.title} ${report.description} ${report.location}`.toLowerCase().includes(query));
}
export function localDateTime(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

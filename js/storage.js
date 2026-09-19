import { validateReport } from './model.js';
export const STORAGE_KEY = 'pawfinder-syria-reports-v1';
export function loadReports(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { reports: [], warning: '' };
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.some(r => !r || typeof r.id !== 'string' || validateReport(r).length)) throw new Error('Invalid data');
    if (new Set(data.map(r => r.id)).size !== data.length) throw new Error('Duplicate IDs');
    return { reports: data, warning: '' };
  } catch {
    return { reports: [], warning: 'Saved data is unavailable or damaged. It has not been overwritten. New reports will stay in memory for this session.', readOnly: true };
  }
}
export function saveReports(storage, reports) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(reports)); return true; }
  catch { return false; }
}

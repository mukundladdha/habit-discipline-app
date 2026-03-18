/**
 * lib/dashboard-cache.js
 *
 * Backward-compatibility shim.
 * All logic has moved to lib/local-store.js.
 * Importing code (calendar page, stats page) works without any changes.
 */
export {
  getCache      as getCachedDashboard,
  setCache      as setCachedDashboard,
  clearCache    as clearCachedDashboard,
  getCachedStats,
  getCachedCalendar,
} from './local-store';

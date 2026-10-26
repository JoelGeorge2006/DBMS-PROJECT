/**
 * MINERVA — National Mineral Geospatial Intelligence
 * Course: BACSE202 - Database Systems
 * Frontend API Service Connector (apiService.js)
 */

const API_BASE = '';

/**
 * Global helper for JSON fetches with error handling
 */
/**
 * fetch() wrapper: JSON in and out, errors carry .status and the server's message.
 * A 401 from anything except the sign-in routes means the session ended; the app
 * listens for 'minerva:unauthorized' and shows the login page.
 */
async function request(endpoint, { method = 'GET', params, body } = {}) {
  const url = new URL(endpoint, window.location.origin);
  Object.entries(params || {}).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') url.searchParams.append(key, val);
  });
  const response = await fetch(url.toString(), {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !url.pathname.startsWith('/api/auth/')) {
    window.dispatchEvent(new CustomEvent('minerva:unauthorized'));
  }

  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const err = new Error((data && (data.error || data.message)) || `HTTP ${response.status}`);
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

const apiGet = (endpoint, params = {}) => request(endpoint, { params });

export const apiService = {
  /**
   * 1. Dashboard KPI Telemetry Metrics
   * Returns active mines, tracked cratons, active concessions, and annual ore yield
   */
  async getKpiMetrics() {
    return apiGet('/api/kpi/metrics');
  },


  /**
   * 3. Mines Master Grid
   * @param {Object} filters - { search, state, mineral, status, limit, offset }
   */
  async getMines(filters = {}) {
    return apiGet('/api/mines', filters);
  },

  /**
   * 4. Single Mine Detailed Dossier
   * @param {string} mineId - e.g. "MN-0182"
   */
  async getMineDossier(mineId) {
    if (!mineId) throw new Error('mineId is required');
    return apiGet(`/api/mines/${encodeURIComponent(mineId)}/dossier`);
  },

  /**
   * 5. Stream CSV Export URL
   * @param {Object} filters
   */
  getMinesExportUrl(filters = {}) {
    const url = new URL('/api/mines/export', window.location.origin);
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '' && val !== 'ALL') {
        url.searchParams.append(key, val);
      }
    });
    return url.toString();
  },

  /**
   * 8. 3NF Entity Tables for Entity Switcher Tabs
   * @param {'mines'|'minerals'|'locations'|'companies'|'leases'|'production'} entity
   */
  async getEntityTable(entity) {
    switch (entity) {
      case 'minerals':
        return apiGet('/api/minerals');
      case 'locations':
        return apiGet('/api/locations');
      case 'companies':
        return apiGet('/api/companies');
      case 'leases':
        return apiGet('/api/leases');
      case 'production':
        return apiGet('/api/production');
      case 'mines':
      default:
        return apiGet('/api/mines');
    }
  },

  /**
   * 9. Analytical SQL Views
   */
  async getDistrictOccurrences() {
    return apiGet('/api/analytics/district-occurrences');
  },

  async getCrossStateProduction() {
    return apiGet('/api/analytics/cross-state-production');
  },

  async getLeaseCompliance() {
    return apiGet('/api/analytics/lease-compliance');
  },

  /** Public statistics through the database views: states, commodities, auctions, royalty, reserves, national-production */
  async getDataset(name) {
    return apiGet(`/api/data/${encodeURIComponent(name)}`);
  },

  // --- Backend visibility -----------------------------------------------------
  /** Tables, views, columns, constraints and enum types from the live catalog */
  async getSchema() {
    return apiGet('/api/backend/schema');
  },

  /** View definitions, triggers (with function source) and indexes */
  async getSchemaObjects() {
    return apiGet('/api/backend/objects');
  },

  /** First rows of a table or view */
  async getRelationRows(name, limit = 50) {
    return apiGet(`/api/backend/relations/${encodeURIComponent(name)}/rows`, { limit });
  },

  /** SQL statements run by the backend after entry `after` */
  async getSqlLog(after = 0) {
    return apiGet('/api/backend/sql-log', { after });
  },

  // --- Authentication --------------------------------------------------------
  async me() {
    return apiGet('/api/auth/me');
  },

  async login(username, pin) {
    return request('/api/auth/login', { method: 'POST', body: { username, pin } });
  },

  async logout() {
    return request('/api/auth/logout', { method: 'POST' });
  },

  async requestPinReset(username) {
    return request('/api/auth/reset/request', { method: 'POST', body: { username } });
  },

  async confirmPinReset(username, code, pin) {
    return request('/api/auth/reset/confirm', { method: 'POST', body: { username, code, pin } });
  },

  /**
   * 10. Interactive Read-Only SQL Terminal
   * @param {string} sqlQuery
   */
  async executeSql(sqlQuery) {
    return request('/api/sql/query', { method: 'POST', body: { query: sqlQuery } });
  },

  /**
   * 11. Ping Real-time Latency (Round-Trip)
   */
  async pingLatency() {
    const start = performance.now();
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const duration = Math.round(performance.now() - start);
      return { ok: res.ok, duration };
    } catch {
      return { ok: false, duration: null };
    }
  }
};

export default apiService;

/**
 * MINERVA — National Mineral Geospatial Intelligence
 * Course: BACSE202 - Database Systems
 * Frontend API Service Connector (apiService.js)
 */

const API_BASE = '';

/**
 * Global helper for JSON fetches with error handling
 */
async function apiGet(endpoint, params = {}) {
  const url = new URL(endpoint, window.location.origin);
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      url.searchParams.append(key, val);
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

export const apiService = {
  /**
   * 1. Dashboard KPI Telemetry Metrics
   * Returns active mines, tracked cratons, active concessions, and annual ore yield
   */
  async getKpiMetrics() {
    return apiGet('/api/kpi/metrics');
  },

  /**
   * 2. Geospatial Nodes & Lease Polygons
   * @param {Object} filters - { mineral, state, district, show_mines, show_hotspots, show_leases }
   */
  async getGisNodes(filters = {}) {
    return apiGet('/api/gis/nodes', filters);
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
   * 6. Archival Publications
   */
  async getReports() {
    return apiGet('/api/reports');
  },

  /**
   * 7. Report Download URL
   */
  getReportDownloadUrl(reportId) {
    return `/api/reports/${encodeURIComponent(reportId)}/download`;
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

  /** BST range search over a mineral assay column */
  async getBstRange(attr, min, max) {
    return apiGet('/api/dsa/bst/range', { attr, min, max });
  },

  /**
   * 10. Interactive Read-Only SQL Terminal
   * @param {string} sqlQuery
   */
  async executeSql(sqlQuery) {
    const response = await fetch('/api/sql/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query: sqlQuery })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    return data;
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

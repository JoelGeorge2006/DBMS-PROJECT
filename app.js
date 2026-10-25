/**
 * MINERVA — National Mineral Geospatial Intelligence Grid
 * Production Geospatial System Synthesizing Image 1 (UI Chrome) & Image 2 (LUMINA Basemap)
 */

import apiService from './apiService.js';
import { AlertQueueManager, AlertPriority } from './dsa/Queue.js';
import { QueryHistoryManager } from './dsa/Stack.js';
import { AVLTree } from './dsa/AVLTree.js';
import { BinarySearchTree } from './dsa/BinarySearchTree.js';

// ============================================================================
// 0. Alerts — toasts are shown one at a time from a priority queue
// ============================================================================
const alertQueue = new AlertQueueManager();

const TOAST_PRIORITY = {
  error: AlertPriority.CRITICAL,
  warning: AlertPriority.WARNING,
  success: AlertPriority.INFO,
  info: AlertPriority.INFO,
};

function showToast(message, type = 'info') {
  alertQueue.add(message, TOAST_PRIORITY[type] ?? AlertPriority.INFO, { type });
}

function initAlerts() {
  const container = document.getElementById('toastContainer');
  const btn = document.getElementById('navAlertsBtn');
  const panel = document.getElementById('navAlertsPanel');
  const list = document.getElementById('navAlertsList');
  const count = document.getElementById('navAlertsCount');
  let unread = 0;

  alertQueue.setDisplayHandlers(
    (alert) => {
      if (!container) return;
      const el = document.createElement('div');
      el.className = `toast toast-${alert.type || 'info'}`;
      el.textContent = alert.message;
      el.addEventListener('click', () => alertQueue.dismissCurrent());
      container.replaceChildren(el);
    },
    () => {
      if (container) container.replaceChildren();
      unread++;
    }
  );

  const renderPanel = () => {
    if (count) {
      count.textContent = unread;
      count.classList.toggle('hidden', unread === 0);
    }
    if (!list) return;
    if (alertQueue.log.length === 0) {
      list.innerHTML = '<li class="nav-alerts-empty">No alerts yet</li>';
      return;
    }
    list.innerHTML = alertQueue.log
      .map((a) => {
        const time = new Date(a.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `<li class="nav-alert-item"><span class="nav-alert-level level-${a.label.toLowerCase()}">${a.label}</span><span class="nav-alert-msg">${escapeHtml(a.message)}</span><span class="nav-alert-time">${time}</span></li>`;
      })
      .join('');
  };
  alertQueue.onChange(renderPanel);
  renderPanel();

  if (btn && panel) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = panel.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        unread = 0;
        renderPanel();
      }
    });
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target)) {
        panel.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

let mineAlertsQueued = false;

/** Raise alerts for mines whose status needs attention (from the MINE table) */
async function queueMineAlerts() {
  if (mineAlertsQueued) return;
  mineAlertsQueued = true;
  try {
    const res = await apiService.getMines();
    (res.data || []).forEach((m) => {
      if (m.status === 'Expiring') {
        alertQueue.critical(`${m.mineId} ${m.mineName}: lease is expiring`, { type: 'error' });
      } else if (m.status === 'Under Maintenance') {
        alertQueue.warning(`${m.mineId} ${m.mineName}: under maintenance, production halted`, { type: 'warning' });
      }
    });
  } catch {
    mineAlertsQueued = false;
  }
}

// ============================================================================
// 1. Map state
// ============================================================================
let map;
let networkLayerGroup;
let currentBasemap = 'satellite';
const DEFAULT_VIEW = { center: [22.0, 80.0], zoom: 5 };

const appState = {
  activeNode: null,
};

// ============================================================================
// 3. Map Initialization (Leaflet + Esri World Imagery Basemap)
// ============================================================================
function initGeospatialMap() {
  // Center over Indian subcontinent
  map = L.map('map', {
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    minZoom: 4.5,
    maxZoom: 16,
    zoomControl: false, // We use custom Image 1 top-right floating controls
    attributionControl: false,
  });

  networkLayerGroup = L.layerGroup().addTo(map);

  // Basemap Tiles: Esri High-Resolution World Imagery
  setBasemap('satellite');

  // Setup DOM Event Listeners
  setupEventListeners();

  // Mines and transport network from the database
  initTransportNetwork();
}

function setBasemap(type) {
  if (window.baseTileLayer) {
    map.removeLayer(window.baseTileLayer);
  }

  const mapEl = document.getElementById('map');
  mapEl.classList.remove('dark-tactical');

  if (type === 'satellite') {
    window.baseTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Esri World Imagery'
    }).addTo(map);
  } else if (type === 'tactical') {
    mapEl.classList.add('dark-tactical');
    window.baseTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tactical Filter'
    }).addTo(map);
  } else {
    // Street / Carto Hybrid
    window.baseTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: 'Carto Voyager'
    }).addTo(map);
  }
}

// ============================================================================
// 7. Node Telemetry Inspector Card
// ============================================================================
const inspectorCard = document.getElementById('nodeInspectorCard');
const inspectTitle = document.getElementById('inspectTitle');
const inspectSubtitle = document.getElementById('inspectSubtitle');
const inspectCompany = document.getElementById('inspectCompany');
const inspectMineral = document.getElementById('inspectMineral');
const inspectLease = document.getElementById('inspectLease');
const inspectYield = document.getElementById('inspectYield');
const btnCloseInspect = document.getElementById('btnCloseInspect');
const btnInspectZoom = document.getElementById('btnInspectZoom');
const btnInspectDb = document.getElementById('btnInspectDb');

function openNodeInspector(node) {
  appState.activeNode = node;

  const card = document.getElementById('nodeInspectorCard');
  const t = document.getElementById('inspectTitle');
  const sub = document.getElementById('inspectSubtitle');
  const c = document.getElementById('inspectCompany');
  const m = document.getElementById('inspectMineral');
  const l = document.getElementById('inspectLease');
  const y = document.getElementById('inspectYield');

  if (t) t.textContent = node.name;
  if (sub) sub.textContent = `${node.district}, ${node.state}`;
  if (c) c.textContent = node.company;
  if (m) m.textContent = node.mineral;
  if (l) l.textContent = node.leaseId;
  if (y) y.textContent = node.yield;

  if (card) card.classList.remove('hidden');

  // Slight camera pan to position card neatly
  if (map && node.coords) {
    map.panTo(node.coords, { animate: true, duration: 0.6 });
  }
}

if (btnCloseInspect) {
  btnCloseInspect.addEventListener('click', () => {
    const card = document.getElementById('nodeInspectorCard');
    if (card) card.classList.add('hidden');
    appState.activeNode = null;
  });
}

if (btnInspectZoom) {
  btnInspectZoom.addEventListener('click', () => {
    if (appState.activeNode && map) {
      map.flyTo(appState.activeNode.coords, 9.5, { duration: 1.4 });
    }
  });
}

if (btnInspectDb) {
  btnInspectDb.addEventListener('click', () => {
    const card = document.getElementById('nodeInspectorCard');
    if (card) card.classList.add('hidden');
    switchView('database');
    if (appState.activeNode) {
      focusMineByName(appState.activeNode.name);
    }
  });
}

// ============================================================================
// 8. Event Handlers, Cascading Filters & Reactive Camera
// ============================================================================
function setupEventListeners() {
  // Top-right map controls
  document.getElementById('ctrlZoomIn').addEventListener('click', () => map.zoomIn());
  document.getElementById('ctrlZoomOut').addEventListener('click', () => map.zoomOut());
  document.getElementById('ctrlRecenter').addEventListener('click', () => {
    map.flyTo(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom, { duration: 1.2 });
  });

  const ctrlLayerToggle = document.getElementById('ctrlLayerToggle');
  ctrlLayerToggle.addEventListener('click', () => {
    currentBasemap = currentBasemap === 'satellite' ? 'tactical' : currentBasemap === 'tactical' ? 'hybrid' : 'satellite';
    setBasemap(currentBasemap);
  });

  // Global search (Ctrl + K): one handler, acts on whichever view is open
  const globalSearchInput = document.getElementById('globalSearchInput');
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      globalSearchInput.focus();
    }
  });

  let searchDebounceTimer = null;
  globalSearchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => dispatchSearchQuery(globalSearchInput.value.trim(), false), 200);
  });
  globalSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchDebounceTimer);
      dispatchSearchQuery(globalSearchInput.value.trim(), true);
    } else if (e.key === 'Escape') {
      globalSearchInput.value = '';
      dispatchSearchQuery('', false);
      globalSearchInput.blur();
    }
  });

  // Left dock navigation
  document.getElementById('dockBtnMap').addEventListener('click', () => switchView('map', true));
  document.getElementById('dockBtnDatabase').addEventListener('click', () => switchView('database', true));
  document.getElementById('dockBtnReports').addEventListener('click', () => switchView('reports', true));
  document.getElementById('dockBtnAuth').addEventListener('click', signOut);
}

/** Search the open view. On the map only Enter jumps to a mine, so typing doesn't move the camera. */
function dispatchSearchQuery(query, submitted) {
  const q = query.toLowerCase();
  const isOpen = (id) => !document.getElementById(id)?.classList.contains('hidden');

  if (isOpen('databaseExplorerView')) {
    searchQuery = query;
    if (activeEntityTab === 'mines') {
      renderMinesTable(filterMines(q));
    } else {
      document.querySelectorAll('#masterTableTbody tr').forEach((row) => {
        row.classList.toggle('hidden', !!q && !row.textContent.toLowerCase().includes(q));
      });
    }
  } else if (isOpen('reportsView')) {
    renderPublicationsList(
      ARCHIVAL_PUBLICATIONS_DATA.filter((p) =>
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.jurisdiction.toLowerCase().includes(q) ||
        p.period.toLowerCase().includes(q)
      )
    );
  } else if (isOpen('mapView') && submitted && q) {
    const found = filterMines(q)[0];
    if (found) {
      locateMineOnMap(found);
    } else {
      showToast(`No mine matches "${query}"`, 'warning');
    }
  }
}

// ============================================================================
// 9. View Switcher (Mines & Concessions Master vs Geospatial Satellite Map vs Archival Reports)
// ============================================================================
const AUTH_SESSION_KEY = 'minerva-authenticated';

function isAuthenticated() {
  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function signOut() {
  try {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  } catch {}
  mineAlertsQueued = false;
  switchView('auth', true);
}

function markAuthenticated() {
  try {
    sessionStorage.setItem(AUTH_SESSION_KEY, '1');
  } catch {}
  queueMineAlerts();
}

function switchView(viewName, updateHistory = true) {
  // Every view except the login gate requires an authenticated session
  if (viewName !== 'auth' && !isAuthenticated()) viewName = 'auth';
  document.body.classList.toggle('auth-mode', viewName === 'auth');

  const dbView = document.getElementById('databaseExplorerView');
  const mapView = document.getElementById('mapView');
  const reportsView = document.getElementById('reportsView');
  const authView = document.getElementById('authView');

  const dockBtnMap = document.getElementById('dockBtnMap');
  const dockBtnDatabase = document.getElementById('dockBtnDatabase');
  const dockBtnReports = document.getElementById('dockBtnReports');
  const dockBtnAuth = document.getElementById('dockBtnAuth');

  // Clear active states on dock
  [dockBtnMap, dockBtnDatabase, dockBtnReports, dockBtnAuth].forEach((btn) => {
    if (btn) btn.classList.remove('active');
  });

  // Hide all views
  [dbView, mapView, reportsView, authView].forEach((view) => {
    if (view) {
      view.classList.add('hidden');
      view.classList.remove('active');
    }
  });

  if (viewName === 'database') {
    if (dbView) {
      dbView.classList.remove('hidden');
      dbView.classList.add('active');
    }
    if (dockBtnDatabase) dockBtnDatabase.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (viewName === 'map') {
    if (mapView) {
      mapView.classList.remove('hidden');
      mapView.classList.add('active');
    }
    if (dockBtnMap) dockBtnMap.classList.add('active');

    if (map) {
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }
  } else if (viewName === 'reports') {
    if (reportsView) {
      reportsView.classList.remove('hidden');
      reportsView.classList.add('active');
    }
    if (dockBtnReports) dockBtnReports.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (viewName === 'auth') {
    if (authView) {
      authView.classList.remove('hidden');
      authView.classList.add('active');
    }
    if (dockBtnAuth) dockBtnAuth.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // A search typed in one view shouldn't silently filter the next one
  const search = document.getElementById('globalSearchInput');
  if (search && search.value) {
    search.value = '';
    dispatchSearchQuery('', false);
  }

  // Update browser URL history
  if (updateHistory) {
    const targetHash = '#' + viewName;
    try {
      history.pushState({ view: viewName }, '', targetHash);
    } catch {
      window.location.hash = targetHash;
    }
  }
}

// Browser Back/Forward navigation listener
window.addEventListener('popstate', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'database' || hash === 'reports' || hash === 'auth' || hash === 'map') {
    switchView(hash, false);
  } else {
    switchView('map', false);
  }
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'database' || hash === 'reports' || hash === 'auth' || hash === 'map') {
    switchView(hash, false);
  }
});

// ============================================================================
// 10. Relational Master Dataset & Detail Dossier Data (3NF Schema)
// ============================================================================
const MINES_MASTER_DATA = [
  {
    mineId: 'MN-0182',
    mineName: 'Keonjhar North Block',
    primaryMineral: 'Iron Ore (Hematite 64.2%)',
    mineralCategory: 'Iron Ore',
    mineralDotColor: 'rust',
    state: 'Odisha',
    district: 'Keonjhar',
    stateDistrict: 'Odisha, Keonjhar',
    operatingLessee: 'Odisha Mining Corp',
    leaseValidity: '2018 — 2038',
    status: 'Operational',
    statusClass: 'operational',
    coords: [22.016, 85.426],
    dossier: {
      category: 'DETAIL DOSSIER',
      fullName: 'Keonjhar North Block (MN-0182)',
      assay: {
        fe: '64.8%',
        sio2: '2.1%',
        al2o3: '1.8%',
        phosphorus: '0.04%',
        moisture: '3.2%'
      },
      lease: {
        id: 'OR-KJ-2004-981',
        executed: '14 Oct 2004',
        validTill: '13 Oct 2044',
        royaltyRate: '15% ASP',
        area: '1,482.40 Hectares'
      },
      production: {
        currentOutput: '6.4 MT (2024 YTD)',
        history: [
          { year: "'21", mt: 4.8 },
          { year: "'22", mt: 5.4 },
          { year: "'23", mt: 5.9 },
          { year: "'24", mt: 6.4 }
        ]
      },
      clearance: {
        title: 'Forest Clearance Stage-II',
        subtitle: 'Approved • CTO Valid till 2028',
        approved: true
      }
    }
  },
  {
    mineId: 'MN-0294',
    mineName: 'Bailadila Deposit 14',
    primaryMineral: 'Iron Ore (Magnetite 68%)',
    mineralCategory: 'Iron Ore',
    mineralDotColor: 'rust',
    state: 'Chhattisgarh',
    district: 'Dantewada',
    stateDistrict: 'Chhattisgarh, Dantewada',
    operatingLessee: 'NMDC Limited',
    leaseValidity: '2015 — 2045',
    status: 'Operational',
    statusClass: 'operational',
    coords: [18.705, 81.245],
    dossier: {
      category: 'DETAIL DOSSIER',
      fullName: 'Bailadila Deposit 14 (MN-0294)',
      assay: {
        fe: '68.2%',
        sio2: '1.4%',
        al2o3: '1.1%',
        phosphorus: '0.02%',
        moisture: '2.1%'
      },
      lease: {
        id: 'CG-DW-2015-402',
        executed: '05 Jun 2015',
        validTill: '04 Jun 2045',
        royaltyRate: '15% ASP',
        area: '2,120.00 Hectares'
      },
      production: {
        currentOutput: '9.8 MT (2024 YTD)',
        history: [
          { year: "'21", mt: 8.1 },
          { year: "'22", mt: 8.9 },
          { year: "'23", mt: 9.3 },
          { year: "'24", mt: 9.8 }
        ]
      },
      clearance: {
        title: 'Forest Clearance Stage-II',
        subtitle: 'Approved • CTO Valid till 2030',
        approved: true
      }
    }
  },
  {
    mineId: 'MN-0411',
    mineName: 'Khetri Underground Complex',
    primaryMineral: 'Copper (Chalcopyrite 2.4%)',
    mineralCategory: 'Copper',
    mineralDotColor: 'teal',
    state: 'Rajasthan',
    district: 'Jhunjhunu',
    stateDistrict: 'Rajasthan, Jhunjhunu',
    operatingLessee: 'Hindustan Copper Ltd',
    leaseValidity: '2012 — 2037',
    status: 'Under Maintenance',
    statusClass: 'maintenance',
    coords: [27.985, 75.795],
    dossier: {
      category: 'DETAIL DOSSIER',
      fullName: 'Khetri Underground Complex (MN-0411)',
      assay: {
        fe: '18.5%',
        sio2: '34.2%',
        al2o3: '5.4%',
        phosphorus: '0.01%',
        moisture: '4.2%'
      },
      lease: {
        id: 'RJ-JJ-2012-114',
        executed: '20 Aug 2012',
        validTill: '19 Aug 2037',
        royaltyRate: '4.5% LME',
        area: '890.50 Hectares'
      },
      production: {
        currentOutput: '1.8 MT (2024 YTD)',
        history: [
          { year: "'21", mt: 2.4 },
          { year: "'22", mt: 2.1 },
          { year: "'23", mt: 2.0 },
          { year: "'24", mt: 1.8 }
        ]
      },
      clearance: {
        title: 'Environmental Overhaul Clearance',
        subtitle: 'Inspection Pending • CTO Review 2026',
        approved: false
      }
    }
  },
  {
    mineId: 'MN-0523',
    mineName: 'Panchpatmali Bauxite',
    primaryMineral: 'Bauxite (Gibbsite 52%)',
    mineralCategory: 'Bauxite',
    mineralDotColor: 'amber',
    state: 'Odisha',
    district: 'Koraput',
    stateDistrict: 'Odisha, Koraput',
    operatingLessee: 'NALCO',
    leaseValidity: '2019 — 2049',
    status: 'Operational',
    statusClass: 'operational',
    coords: [18.825, 82.915],
    dossier: {
      category: 'DETAIL DOSSIER',
      fullName: 'Panchpatmali Bauxite (MN-0523)',
      assay: {
        fe: '14.6%',
        sio2: '2.8%',
        al2o3: '52.4%',
        phosphorus: '0.03%',
        moisture: '5.1%'
      },
      lease: {
        id: 'OR-KP-2019-771',
        executed: '12 Jan 2019',
        validTill: '11 Jan 2049',
        royaltyRate: '12% ASP',
        area: '1,845.00 Hectares'
      },
      production: {
        currentOutput: '7.2 MT (2024 YTD)',
        history: [
          { year: "'21", mt: 6.2 },
          { year: "'22", mt: 6.7 },
          { year: "'23", mt: 7.0 },
          { year: "'24", mt: 7.2 }
        ]
      },
      clearance: {
        title: 'Forest Clearance Stage-II',
        subtitle: 'Approved • CTO Valid till 2032',
        approved: true
      }
    }
  },
  {
    mineId: 'MN-0887',
    mineName: 'Sukinda Chromite',
    primaryMineral: 'Chromite (Metallurgical)',
    mineralCategory: 'Chromite',
    mineralDotColor: 'brown',
    state: 'Odisha',
    district: 'Jajpur',
    stateDistrict: 'Odisha, Jajpur',
    operatingLessee: 'Tata Steel Mining',
    leaseValidity: '2020 — 2040',
    status: 'Operational',
    statusClass: 'operational',
    coords: [21.010, 85.820],
    dossier: {
      category: 'DETAIL DOSSIER',
      fullName: 'Sukinda Chromite (MN-0887)',
      assay: {
        fe: '15.2%',
        sio2: '3.5%',
        al2o3: '8.4%',
        phosphorus: '0.01%',
        moisture: '2.8%'
      },
      lease: {
        id: 'OR-JP-2020-339',
        executed: '01 Apr 2020',
        validTill: '31 Mar 2040',
        royaltyRate: '15% ASP',
        area: '650.00 Hectares'
      },
      production: {
        currentOutput: '1.4 MT (2024 YTD)',
        history: [
          { year: "'21", mt: 1.1 },
          { year: "'22", mt: 1.2 },
          { year: "'23", mt: 1.3 },
          { year: "'24", mt: 1.4 }
        ]
      },
      clearance: {
        title: 'Forest Clearance Stage-II',
        subtitle: 'Approved • Zero Effluent Discharge',
        approved: true
      }
    }
  },
  {
    mineId: 'MN-1104',
    mineName: 'Zawar Lead-Zinc',
    primaryMineral: 'Lead-Zinc Ore',
    mineralCategory: 'Lead-Zinc',
    mineralDotColor: 'gray',
    state: 'Rajasthan',
    district: 'Udaipur',
    stateDistrict: 'Rajasthan, Udaipur',
    operatingLessee: 'Hindustan Zinc Ltd',
    leaseValidity: '2017 — 2047',
    status: 'Expiring',
    statusClass: 'expiring',
    coords: [24.350, 73.710],
    dossier: {
      category: 'DETAIL DOSSIER',
      fullName: 'Zawar Lead-Zinc (MN-1104)',
      assay: {
        fe: '9.4%',
        sio2: '18.2%',
        al2o3: '3.1%',
        phosphorus: '0.02%',
        moisture: '3.5%'
      },
      lease: {
        id: 'RJ-UD-2017-088',
        executed: '15 Nov 2017',
        validTill: '14 Nov 2047',
        royaltyRate: '9.5% LME',
        area: '1,200.00 Hectares'
      },
      production: {
        currentOutput: '4.1 MT (2024 YTD)',
        history: [
          { year: "'21", mt: 3.8 },
          { year: "'22", mt: 4.0 },
          { year: "'23", mt: 4.1 },
          { year: "'24", mt: 4.1 }
        ]
      },
      clearance: {
        title: 'Lease Renewal Compliance Review',
        subtitle: 'Under Tripartite Examination',
        approved: false
      }
    }
  },
  {
    mineId: 'MN-1248',
    mineName: 'Singhbhum Iron Craton',
    primaryMineral: 'Iron & Manganese',
    mineralCategory: 'Iron Ore',
    mineralDotColor: 'rust',
    state: 'Jharkhand',
    district: 'West Singhbhum',
    stateDistrict: 'Jharkhand, West Singhbhum',
    operatingLessee: 'SAIL Raw Materials',
    leaseValidity: '2021 — 2051',
    status: 'Operational',
    statusClass: 'operational',
    coords: [22.146, 85.524],
    dossier: {
      category: 'DETAIL DOSSIER',
      fullName: 'Singhbhum Iron Craton (MN-1248)',
      assay: {
        fe: '63.5%',
        sio2: '2.8%',
        al2o3: '2.1%',
        phosphorus: '0.05%',
        moisture: '3.0%'
      },
      lease: {
        id: 'JH-WS-2021-902',
        executed: '10 May 2021',
        validTill: '09 May 2051',
        royaltyRate: '15% ASP',
        area: '2,450.00 Hectares'
      },
      production: {
        currentOutput: '14.5 MT (2024 YTD)',
        history: [
          { year: "'21", mt: 11.2 },
          { year: "'22", mt: 12.8 },
          { year: "'23", mt: 13.9 },
          { year: "'24", mt: 14.5 }
        ]
      },
      clearance: {
        title: 'Forest Clearance Stage-II',
        subtitle: 'Approved • Full EC Compliance',
        approved: true
      }
    }
  }
];

// Additional Entity Data for Switcher Tabs
const MINERALS_ENTITY_DATA = [
  { id: 'MIN-01', name: 'Iron Ore (Hematite & Magnetite)', category: 'Ferrous Metal', majorBelts: 'Odisha-Jharkhand, Bailadila, Bellary-Hospet', grade: '64% - 68% Fe High Grade', status: 'Core Strategic' },
  { id: 'MIN-02', name: 'Copper (Chalcopyrite & Malachite)', category: 'Non-Ferrous Base Metal', majorBelts: 'Khetri Fold Belt, Malanjkhand, Singhbhum', grade: '1.8% - 2.5% Cu', status: 'Strategic Reserve' },
  { id: 'MIN-03', name: 'Bauxite (Gibbsite & Boehmite)', category: 'Alumina Feedstock', majorBelts: 'Eastern Ghats Belt, Koraput, Lohardaga', grade: '48% - 54% Al2O3', status: 'High Export' },
  { id: 'MIN-04', name: 'Chromite (Metallurgical Ore)', category: 'Strategic Alloy Metal', majorBelts: 'Sukinda Valley (98% National Reserve)', grade: 'Cr:Fe ratio > 3:1 (>48% Cr2O3)', status: 'Defense Critical' },
  { id: 'MIN-05', name: 'Lead-Zinc (Sphalerite & Galena)', category: 'Strategic Base Metal', majorBelts: 'Zawar & Rampura Agucha, Rajasthan', grade: 'High-purity concentrate (>55% Zn)', status: 'High Demand' },
  { id: 'MIN-06', name: 'Manganese (Pyrolusite & Psilomelane)', category: 'Ferro-alloy Base', majorBelts: 'Keonjhar (Odisha), Balaghat (MP)', grade: '44% - 48% Mn', status: 'Core Strategic' }
];

const LOCATIONS_ENTITY_DATA = [
  { id: 'LOC-OD-01', location: 'Odisha, Keonjhar', craton: 'Singhbhum-Orissa Craton', activeMines: 148, totalArea: '34,200 Ha', hubStatus: 'Prime Core Hub' },
  { id: 'LOC-CG-01', location: 'Chhattisgarh, Dantewada', craton: 'Bastar Craton', activeMines: 42, totalArea: '18,900 Ha', hubStatus: 'High-Grade Iron Hub' },
  { id: 'LOC-JH-01', location: 'Jharkhand, West Singhbhum', craton: 'Kolhan Iron Basin', activeMines: 86, totalArea: '26,400 Ha', hubStatus: 'Historic Mining Belt' },
  { id: 'LOC-RJ-01', location: 'Rajasthan, Jhunjhunu', craton: 'North Delhi Fold Belt', activeMines: 28, totalArea: '11,200 Ha', hubStatus: 'Primary Copper Belt' },
  { id: 'LOC-OD-02', location: 'Odisha, Koraput', craton: 'Eastern Ghats Mobile Belt', activeMines: 34, totalArea: '14,800 Ha', hubStatus: 'Major Alumina Zone' },
  { id: 'LOC-RJ-02', location: 'Rajasthan, Udaipur', craton: 'Aravalli Supergroup', activeMines: 39, totalArea: '16,500 Ha', hubStatus: 'Dominant Zinc-Lead Hub' }
];

const COMPANIES_ENTITY_DATA = [
  { id: 'CMP-01', company: 'NMDC Limited', ownership: 'Central PSU (Navratna)', hq: 'Hyderabad, Telangana', concessions: 32, annualYield: '45.2 MT' },
  { id: 'CMP-02', company: 'Odisha Mining Corporation (OMC)', ownership: 'State PSU (Odisha)', hq: 'Bhubaneswar, Odisha', concessions: 28, annualYield: '34.8 MT' },
  { id: 'CMP-03', company: 'Steel Authority of India Ltd (SAIL)', ownership: 'Central PSU (Maharatna)', hq: 'New Delhi', concessions: 48, annualYield: '38.4 MT' },
  { id: 'CMP-04', company: 'Tata Steel Mining Limited', ownership: 'Private Enterprise', hq: 'Jamshedpur / Mumbai', concessions: 24, annualYield: '26.1 MT' },
  { id: 'CMP-05', company: 'National Aluminium Company (NALCO)', ownership: 'Central PSU (Navratna)', hq: 'Bhubaneswar, Odisha', concessions: 12, annualYield: '7.6 MT' },
  { id: 'CMP-06', company: 'Hindustan Copper Limited', ownership: 'Central PSU (Miniratna)', hq: 'Kolkata, West Bengal', concessions: 8, annualYield: '3.5 MT' },
  { id: 'CMP-07', company: 'Hindustan Zinc Limited (Vedanta)', ownership: 'Private Joint Venture', hq: 'Udaipur, Rajasthan', concessions: 16, annualYield: '14.8 MT' }
];

const LEASES_ENTITY_DATA = [
  { leaseId: 'OR-KJ-2004-981', concession: 'Keonjhar North Block', lessee: 'Odisha Mining Corp', validTill: '13 Oct 2044', area: '1,482.40 Ha', royalty: '15% ASP', status: 'Operational' },
  { leaseId: 'CG-DW-2015-402', concession: 'Bailadila Deposit 14', lessee: 'NMDC Limited', validTill: '04 Jun 2045', area: '2,120.00 Ha', royalty: '15% ASP', status: 'Operational' },
  { leaseId: 'RJ-JJ-2012-114', concession: 'Khetri Underground Complex', lessee: 'Hindustan Copper Ltd', validTill: '19 Aug 2037', area: '890.50 Ha', royalty: '4.5% LME', status: 'Under Maintenance' },
  { leaseId: 'OR-KP-2019-771', concession: 'Panchpatmali Bauxite', lessee: 'NALCO', validTill: '11 Jan 2049', area: '1,845.00 Ha', royalty: '12% ASP', status: 'Operational' },
  { leaseId: 'OR-JP-2020-339', concession: 'Sukinda Chromite', lessee: 'Tata Steel Mining', validTill: '31 Mar 2040', area: '650.00 Ha', royalty: '15% ASP', status: 'Operational' },
  { leaseId: 'RJ-UD-2017-088', concession: 'Zawar Lead-Zinc', lessee: 'Hindustan Zinc Ltd', validTill: '14 Nov 2047', area: '1,200.00 Ha', royalty: '9.5% LME', status: 'Expiring' },
  { leaseId: 'JH-WS-2021-902', concession: 'Singhbhum Iron Craton', lessee: 'SAIL Raw Materials', validTill: '09 May 2051', area: '2,450.00 Ha', royalty: '15% ASP', status: 'Operational' }
];

const PRODUCTION_ENTITY_DATA = [
  { logId: 'PRD-2024-01', mine: 'Keonjhar North Block', mineral: 'Iron Ore (Hematite 64.2%)', grossMt: '6.4 MT', dispatchedMt: '6.2 MT', royaltyPaid: '₹142.8 Cr', compliance: '100% IBM Verified' },
  { logId: 'PRD-2024-02', mine: 'Bailadila Deposit 14', mineral: 'Iron Ore (Magnetite 68%)', grossMt: '9.8 MT', dispatchedMt: '9.5 MT', royaltyPaid: '₹224.5 Cr', compliance: '100% IBM Verified' },
  { logId: 'PRD-2024-03', mine: 'Khetri Underground', mineral: 'Copper (Chalcopyrite 2.4%)', grossMt: '1.8 MT', dispatchedMt: '1.7 MT', royaltyPaid: '₹38.2 Cr', compliance: 'CTO Inspection Pending' },
  { logId: 'PRD-2024-04', mine: 'Panchpatmali Bauxite', mineral: 'Bauxite (Gibbsite 52%)', grossMt: '7.2 MT', dispatchedMt: '7.1 MT', royaltyPaid: '₹86.4 Cr', compliance: '100% IBM Verified' },
  { logId: 'PRD-2024-05', mine: 'Sukinda Chromite', mineral: 'Chromite (Metallurgical)', grossMt: '1.4 MT', dispatchedMt: '1.4 MT', royaltyPaid: '₹54.1 Cr', compliance: '100% IBM Verified' },
  { logId: 'PRD-2024-06', mine: 'Zawar Lead-Zinc', mineral: 'Lead-Zinc Ore', grossMt: '4.1 MT', dispatchedMt: '3.9 MT', royaltyPaid: '₹91.7 Cr', compliance: 'Tripartite Review Active' },
  { logId: 'PRD-2024-07', mine: 'Singhbhum Iron Craton', mineral: 'Iron & Manganese', grossMt: '14.5 MT', dispatchedMt: '14.1 MT', royaltyPaid: '₹318.9 Cr', compliance: '100% IBM Verified' }
];

// ============================================================================
// 11. Database Explorer Controller & Dossier Inspector
// ============================================================================
let currentMinesList = [...MINES_MASTER_DATA];
let selectedMineId = 'MN-0182';
let activeEntityTab = 'mines';
let searchQuery = '';

async function fetchMinesData() {
  try {
    const json = await apiService.getMines();
    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      currentMinesList = json.data;
    }
  } catch (err) {
    console.warn('API /api/mines fetch failed; using embedded master records:', err);
  }
}

/** Mines whose id, name, mineral, location or lessee contain q (lower-case) */
function filterMines(q) {
  if (!q) return currentMinesList;
  return currentMinesList.filter((m) =>
    [m.mineId, m.mineName, m.primaryMineral, m.stateDistrict, m.operatingLessee, m.dossier?.lease?.id]
      .some((field) => String(field || '').toLowerCase().includes(q))
  );
}

function initDatabaseExplorer() {
  const masterTbody = document.getElementById('masterTableTbody');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnToggleSqlConsole = document.getElementById('btnToggleSqlConsole');
  const sqlConsoleModal = document.getElementById('sqlConsoleModal');
  const btnCloseSqlModal = document.getElementById('btnCloseSqlModal');
  const btnRunSql = document.getElementById('btnRunSql');
  const sqlInput = document.getElementById('sqlInput');
  const sqlResultsBox = document.getElementById('sqlResultsBox');
  const btnDossierLocate = document.getElementById('btnDossierLocate');
  const btnDossierDownload = document.getElementById('btnDossierDownload');

  // Render initial master table
  renderMinesTable(currentMinesList);

  // Set initial dossier for MN-0182
  const initialMine = currentMinesList.find((m) => m.mineId === selectedMineId) || currentMinesList[0];
  if (initialMine) {
    updateDossier(initialMine);
  }

  // Fetch live API records in background
  fetchMinesData().then(() => {
    renderMinesTable(filterMines(searchQuery.toLowerCase()));
    const selected = currentMinesList.find((m) => m.mineId === selectedMineId) || currentMinesList[0];
    if (selected) updateDossier(selected);
  });

  // Entity switcher tabs
  const tabButtons = document.querySelectorAll('.entity-tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      activeEntityTab = targetTab;

      // Update active styling
      tabButtons.forEach((b) => b.classList.toggle('active', b === btn));

      const bstPanel = document.getElementById('bstPanel');
      if (bstPanel) bstPanel.classList.toggle('hidden', targetTab !== 'minerals');

      renderEntityView(targetTab).then(() => {
        if (targetTab === 'minerals') runBstSearch();
      });
    });
  });

  initBstSearch();

  // Export CSV Action
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      exportMasterCsv();
    });
  }

  // SQL Console Modal
  if (btnToggleSqlConsole && sqlConsoleModal) {
    btnToggleSqlConsole.addEventListener('click', () => {
      sqlConsoleModal.showModal();
    });
  }

  if (btnCloseSqlModal && sqlConsoleModal) {
    btnCloseSqlModal.addEventListener('click', () => {
      sqlConsoleModal.close();
    });
  }

  if (btnRunSql && sqlInput && sqlResultsBox) {
    initSqlHistory(sqlInput, sqlResultsBox, btnRunSql);
  }

  // Dossier Buttons
  if (btnDossierLocate) {
    btnDossierLocate.addEventListener('click', () => {
      const cur = currentMinesList.find((m) => m.mineId === selectedMineId) || currentMinesList[0];
      if (cur) locateMineOnMap(cur);
    });
  }

  if (btnDossierDownload) {
    btnDossierDownload.addEventListener('click', () => {
      const cur = currentMinesList.find((m) => m.mineId === selectedMineId) || currentMinesList[0];
      if (cur) downloadMineDossier(cur);
    });
  }

}

// Render Master Mines Table strictly matching media_1792515683588.png
function renderMinesTable(mines) {
  const table = document.getElementById('masterGridTable');
  const tbody = document.getElementById('masterTableTbody');
  if (!tbody || !table) return;

  const pill = document.getElementById('masterRecordsPill');
  if (pill) {
    pill.textContent = mines.length === currentMinesList.length
      ? `${mines.length} mines`
      : `${mines.length} of ${currentMinesList.length} mines`;
  }

  // Restore Mines Master Header
  const thead = table.querySelector('thead');
  thead.innerHTML = `
    <tr>
      <th class="th-mono">MINE ID</th>
      <th>MINE NAME</th>
      <th>PRIMARY MINERAL</th>
      <th>STATE & DISTRICT</th>
      <th>OPERATING LESSEE</th>
      <th class="th-mono">LEASE VALIDITY</th>
      <th>STATUS</th>
      <th class="th-actions">ACTIONS</th>
    </tr>
  `;

  tbody.innerHTML = '';

  if (mines.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 32px; color: var(--text-label);">No mines found matching search parameters.</td></tr>`;
    return;
  }

  mines.forEach((m) => {
    const tr = document.createElement('tr');
    tr.dataset.mineId = m.mineId;
    if (m.mineId === selectedMineId) {
      tr.classList.add('row-selected');
    }

    // Dot class
    const dotClass = `dot-${m.mineralDotColor || 'rust'}`;

    tr.innerHTML = `
      <td class="td-mine-id">${m.mineId}</td>
      <td class="td-mine-name">${m.mineName}</td>
      <td>
        <div class="td-mineral">
          <span class="mineral-dot ${dotClass}"></span>
          <span>${m.primaryMineral}</span>
        </div>
      </td>
      <td>${m.stateDistrict}</td>
      <td>${m.operatingLessee}</td>
      <td class="td-lease-val">${m.leaseValidity}</td>
      <td>
        <span class="status-pill ${m.statusClass}">${m.status}</span>
      </td>
      <td>
        <div class="row-actions-group">
          <button type="button" class="btn-row-action btn-view-dossier" title="Quick View Dossier" aria-label="View Details">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button type="button" class="btn-row-action btn-locate-map" title="Locate on Geospatial Map" aria-label="Locate on Map">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </button>
        </div>
      </td>
    `;

    // Row click selects mine and updates dossier
    tr.addEventListener('click', (e) => {
      // If clicking directly on locate button, handle separately
      if (e.target.closest('.btn-locate-map')) {
        locateMineOnMap(m);
        return;
      }
      selectMine(m);
    });

    tbody.appendChild(tr);
  });
}

// Select Mine & Update Right Detail Dossier
function selectMine(mine) {
  selectedMineId = mine.mineId;

  // Update row highlights
  document.querySelectorAll('#masterTableTbody tr').forEach((row) => {
    if (row.dataset.mineId === mine.mineId) {
      row.classList.add('row-selected');
    } else {
      row.classList.remove('row-selected');
    }
  });

  updateDossier(mine);
}

// Update Detail Dossier panel
function updateDossier(mine) {
  const d = mine.dossier;
  if (!d) return;

  // Header Title
  const dossierTitle = document.getElementById('dossierTitle');
  if (dossierTitle) {
    dossierTitle.textContent = d.fullName || `${mine.mineName} (${mine.mineId})`;
  }

  // Card 1: Assay
  const assayFe = document.getElementById('assayFe');
  const assaySio2 = document.getElementById('assaySio2');
  const assayAl2o3 = document.getElementById('assayAl2o3');
  const assayPhosphorus = document.getElementById('assayPhosphorus');
  const assayMoisture = document.getElementById('assayMoisture');

  if (assayFe && d.assay) assayFe.textContent = d.assay.fe || '—';
  if (assaySio2 && d.assay) assaySio2.textContent = d.assay.sio2 || '—';
  if (assayAl2o3 && d.assay) assayAl2o3.textContent = d.assay.al2o3 || '—';
  if (assayPhosphorus && d.assay) {
    assayPhosphorus.innerHTML = `Phosphorus Content: <strong>${d.assay.phosphorus || '—'}</strong>`;
  }
  if (assayMoisture && d.assay) {
    assayMoisture.innerHTML = `Moisture: <strong>${d.assay.moisture || '—'}</strong>`;
  }

  // Card 2: Lease Metrics
  const leaseIdVal = document.getElementById('leaseIdVal');
  const leaseExecutedVal = document.getElementById('leaseExecutedVal');
  const leaseValidTillVal = document.getElementById('leaseValidTillVal');
  const leaseRoyaltyVal = document.getElementById('leaseRoyaltyVal');
  const leaseAreaVal = document.getElementById('leaseAreaVal');

  if (leaseIdVal && d.lease) leaseIdVal.textContent = d.lease.id || '—';
  if (leaseExecutedVal && d.lease) leaseExecutedVal.textContent = d.lease.executed || '—';
  if (leaseValidTillVal && d.lease) leaseValidTillVal.textContent = d.lease.validTill || '—';
  if (leaseRoyaltyVal && d.lease) leaseRoyaltyVal.textContent = d.lease.royaltyRate || '—';
  if (leaseAreaVal && d.lease) leaseAreaVal.textContent = d.lease.area || '—';

  // Card 3: Annual Production MT
  const prodYtdVal = document.getElementById('prodYtdVal');
  const sparklineChart = document.getElementById('sparklineChart');

  if (prodYtdVal && d.production) {
    prodYtdVal.textContent = d.production.currentOutput || '—';
  }

  if (sparklineChart && d.production && Array.isArray(d.production.history)) {
    sparklineChart.innerHTML = '';
    const maxMt = Math.max(...d.production.history.map((h) => h.mt));

    d.production.history.forEach((item, idx) => {
      const isLatest = idx === d.production.history.length - 1;
      const heightPercent = Math.max(25, Math.round((item.mt / maxMt) * 100));

      const group = document.createElement('div');
      group.className = 'sparkline-bar-group';
      group.innerHTML = `
        <div class="sparkline-bar ${isLatest ? 'highlight' : ''}" style="height: ${heightPercent}%;" title="${item.year}: ${item.mt} MT"></div>
        <span class="sparkline-year">${item.year}</span>
      `;
      sparklineChart.appendChild(group);
    });
  }

  // Card 4: Environmental & Regulatory Clearance
  const clearanceTitle = document.getElementById('clearanceTitle');
  const clearanceSub = document.getElementById('clearanceSub');
  const clearanceBadge = document.getElementById('clearanceBadge');

  if (clearanceTitle && d.clearance) {
    clearanceTitle.textContent = d.clearance.title;
  }
  if (clearanceSub && d.clearance) {
    clearanceSub.textContent = d.clearance.subtitle;
  }

  if (clearanceBadge && d.clearance) {
    if (d.clearance.approved) {
      clearanceBadge.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B7A43" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="9 12 12 15 16 10"></polyline>
        </svg>
      `;
    } else {
      clearanceBadge.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#966805" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      `;
    }
  }
}

// Locate Mine on Geospatial Satellite Map
function locateMineOnMap(mine) {
  switchView('map');
  if (!mine.coords || !map) return;
  map.flyTo(mine.coords, 9.5, { duration: 1.4 });
  setTimeout(() => openNodeInspector(mineToInspectorNode(mine)), 450);
}

/** Shape a mine record (from /api/mines) for the map inspector card */
function mineToInspectorNode(mine) {
  return {
    id: mine.mineId,
    name: mine.mineName,
    state: mine.state,
    district: mine.district,
    coords: mine.coords,
    company: mine.operatingLessee,
    mineral: mine.primaryMineral,
    leaseId: mine.dossier?.lease?.id || '—',
    yield: mine.dossier?.production?.currentOutput || '—',
  };
}

// Focus Mine by Name from Geospatial Map Inspector
function focusMineByName(name) {
  const match = currentMinesList.find((m) => m.mineName.toLowerCase().includes(name.toLowerCase()));
  if (match) {
    selectMine(match);
  }
}

// Export Master Records to CSV (Streaming from backend API)
function exportMasterCsv() {
  window.open(apiService.getMinesExportUrl({ search: searchQuery }), '_blank');
  showToast(searchQuery ? `Exporting mines matching "${searchQuery}"` : 'Exporting all mines as CSV', 'success');
}

// Download Dossier as Text Report
function downloadMineDossier(mine) {
  const d = mine.dossier;
  const content = `========================================================================
MINERVA — NATIONAL MINERAL GEOSPATIAL INTELLIGENCE DOSSIER
========================================================================
Mine ID:             ${mine.mineId}
Mine Name:           ${mine.mineName}
Primary Mineral:     ${mine.primaryMineral}
State & District:    ${mine.stateDistrict}
Operating Lessee:    ${mine.operatingLessee}
Current Status:      ${mine.status}
Coordinates:         ${mine.coords.join(', ')}

------------------------------------------------------------------------
1. MINERAL RESERVE GRADE & ASSAY
------------------------------------------------------------------------
Fe Grade:            ${d.assay.fe}
SiO2 (Silica):       ${d.assay.sio2}
Al2O3 (Alumina):     ${d.assay.al2o3}
Phosphorus:          ${d.assay.phosphorus}
Moisture Content:    ${d.assay.moisture}

------------------------------------------------------------------------
2. LINKED LEASE CONCESSION METRICS
------------------------------------------------------------------------
Lease ID:            ${d.lease.id}
Executed:            ${d.lease.executed}
Valid Till:          ${d.lease.validTill}
Royalty Rate:        ${d.lease.royaltyRate}
Concession Area:     ${d.lease.area}

------------------------------------------------------------------------
3. ANNUAL PRODUCTION (MT)
------------------------------------------------------------------------
Current 2024 Output: ${d.production.currentOutput}
Historical Output:
${d.production.history.map((h) => `  * FY ${h.year}: ${h.mt} MT`).join('\n')}

------------------------------------------------------------------------
4. ENVIRONMENTAL & REGULATORY CLEARANCE
------------------------------------------------------------------------
Classification:      ${d.clearance.title}
Status:              ${d.clearance.subtitle}
EC Compliance:       ${d.clearance.approved ? 'APPROVED & AUDITED' : 'UNDER REVIEW'}

========================================================================
Ministry of Mines & Indian Bureau of Mines Registry (WGS84 Reference)
Generated: ${new Date().toUTCString()}
========================================================================
`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MINERVA_Dossier_${mine.mineId}_${mine.mineName.replace(/\s+/g, '_')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Dossier downloaded: ${mine.mineName} (${mine.mineId})`, 'success');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Render Other Entities when switching tabs
async function renderEntityView(tabName) {
  const table = document.getElementById('masterGridTable');
  const thead = table.querySelector('thead');
  const tbody = document.getElementById('masterTableTbody');
  const pill = document.getElementById('masterRecordsPill');
  if (!table || !thead || !tbody) return;

  if (tabName === 'mines') {
    renderMinesTable(filterMines(searchQuery.toLowerCase()));
    return;
  }

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 28px; color: var(--text-label);">Loading 3NF ${tabName} data from relational database...</td></tr>`;

  try {
    const json = await apiService.getEntityTable(tabName);
    const data = (json && Array.isArray(json.data)) ? json.data : [];
    if (pill) pill.textContent = `${data.length} Relational Records`;

    if (tabName === 'minerals') {
      thead.innerHTML = `
        <tr>
          <th class="th-mono">MINERAL ID</th>
          <th>MINERAL NAME</th>
          <th>CATEGORY</th>
          <th class="th-mono">FE %</th>
          <th class="th-mono">SIO2 %</th>
          <th class="th-mono">AL2O3 %</th>
          <th class="th-mono">PHOSPHORUS %</th>
          <th class="th-mono">MOISTURE %</th>
        </tr>
      `;
      tbody.innerHTML = data.map((m) => `
        <tr data-mineral-id="${escapeHtml(m.mineral_id)}">
          <td class="td-mine-id">${escapeHtml(m.mineral_id)}</td>
          <td><strong>${escapeHtml(m.mineral_name)}</strong></td>
          <td><span style="color: var(--copper-primary); font-weight: 600;">${escapeHtml(m.mineral_type)}</span></td>
          <td class="td-lease-val">${m.fe_pct !== null ? m.fe_pct + '%' : '—'}</td>
          <td class="td-lease-val">${m.sio2_pct !== null ? m.sio2_pct + '%' : '—'}</td>
          <td class="td-lease-val">${m.al2o3_pct !== null ? m.al2o3_pct + '%' : '—'}</td>
          <td class="td-lease-val">${m.phosphorus_pct !== null ? m.phosphorus_pct + '%' : '—'}</td>
          <td class="td-lease-val">${m.moisture_pct !== null ? m.moisture_pct + '%' : '—'}</td>
        </tr>
      `).join('');
    } else if (tabName === 'locations') {
      thead.innerHTML = `
        <tr>
          <th class="th-mono">LOCATION ID</th>
          <th>STATE</th>
          <th>DISTRICT</th>
          <th>CRATON REGION</th>
          <th class="th-mono">LATITUDE</th>
          <th class="th-mono">LONGITUDE</th>
        </tr>
      `;
      tbody.innerHTML = data.map((l) => `
        <tr>
          <td class="td-mine-id">${escapeHtml(l.location_id)}</td>
          <td><strong>${escapeHtml(l.state)}</strong></td>
          <td>${escapeHtml(l.district)}</td>
          <td><span style="color: var(--espresso-dark); font-weight:600;">${escapeHtml(l.craton_region)}</span></td>
          <td class="td-lease-val">${l.latitude.toFixed(3)}° N</td>
          <td class="td-lease-val">${l.longitude.toFixed(3)}° E</td>
        </tr>
      `).join('');
    } else if (tabName === 'companies') {
      thead.innerHTML = `
        <tr>
          <th class="th-mono">COMPANY ID</th>
          <th>COMPANY NAME</th>
          <th>COMPANY TYPE</th>
          <th>REGISTERED OFFICE</th>
          <th>STATUS</th>
        </tr>
      `;
      tbody.innerHTML = data.map((c) => `
        <tr>
          <td class="td-mine-id">${escapeHtml(c.company_id)}</td>
          <td><strong>${escapeHtml(c.company_name)}</strong></td>
          <td><span style="color: var(--copper-primary); font-weight:600;">${escapeHtml(c.company_type)}</span></td>
          <td>${escapeHtml(c.registered_office)}</td>
          <td><span class="status-pill operational">ACTIVE REGISTRY</span></td>
        </tr>
      `).join('');
    } else if (tabName === 'leases') {
      thead.innerHTML = `
        <tr>
          <th class="th-mono">LEASE ID</th>
          <th class="th-mono">COMPANY ID</th>
          <th class="th-mono">EXECUTION DATE</th>
          <th class="th-mono">VALID TILL</th>
          <th>ROYALTY RATE</th>
          <th>LEASE AREA</th>
          <th>FOREST CLEARANCE</th>
        </tr>
      `;
      tbody.innerHTML = data.map((l) => `
        <tr>
          <td class="td-mine-id">${escapeHtml(l.lease_id)}</td>
          <td class="td-mine-id">${escapeHtml(l.company_id)}</td>
          <td class="td-lease-val">${escapeHtml(l.execution_date)}</td>
          <td class="td-lease-val" style="font-weight:700;">${escapeHtml(l.valid_till)}</td>
          <td>${l.royalty_rate_pct}% ASP</td>
          <td class="td-lease-val">${Number(l.lease_area_hectares).toLocaleString()} Ha</td>
          <td><span class="status-pill operational">${escapeHtml(l.forest_clearance_stage)}</span></td>
        </tr>
      `).join('');
    } else if (tabName === 'production') {
      thead.innerHTML = `
        <tr>
          <th class="th-mono">PROD ID</th>
          <th class="th-mono">MINE ID</th>
          <th class="th-mono">MINERAL ID</th>
          <th class="th-mono">FISCAL YEAR</th>
          <th>QUANTITY (MT)</th>
          <th>DISPATCH (MT)</th>
        </tr>
      `;
      tbody.innerHTML = data.map((p) => `
        <tr>
          <td class="td-mine-id">${escapeHtml(p.prod_id)}</td>
          <td class="td-mine-id">${escapeHtml(p.mine_id)}</td>
          <td class="td-mine-id">${escapeHtml(p.mineral_id)}</td>
          <td class="td-lease-val"><strong>FY ${p.fiscal_year}</strong></td>
          <td style="color: var(--copper-primary); font-weight:700;">${p.quantity_mt} MT</td>
          <td class="td-lease-val">${p.dispatch_mt} MT</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.warn(`Failed to fetch 3NF table ${tabName}:`, err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: #B92520;">Error loading ${tabName} table from database.</td></tr>`;
  }
}

// Transport network on the map: corridor graph from the server, Dijkstra routes
const networkState = { nodes: [], edges: [], byId: new Map(), routeLayer: null, mstLayer: null, mstRun: 0 };

async function initTransportNetwork() {
  const form = document.getElementById('routeForm');
  const fromSel = document.getElementById('routeFrom');
  const toSel = document.getElementById('routeTo');
  const clearBtn = document.getElementById('routeClear');
  const sub = document.getElementById('networkSub');
  if (!form || !fromSel || !toSel) return;

  try {
    const net = await apiService.getMineNetwork();
    networkState.nodes = net.nodes;
    networkState.edges = net.edges;
    networkState.byId = new Map(net.nodes.map((n) => [n.id, n]));
    if (sub) {
      sub.textContent = `${net.nodes.length} mines, ${net.edges.length} corridors. Each mine links to its ${net.neighbours} nearest mines; distances are straight-line km.`;
    }
  } catch (err) {
    if (sub) sub.textContent = `Could not load the network: ${err.message}`;
    return;
  }

  const options = networkState.nodes
    .map((n) => `<option value="${escapeHtml(n.id)}">${escapeHtml(n.name)} (${escapeHtml(n.state)})</option>`)
    .join('');
  fromSel.innerHTML = options;
  toSel.innerHTML = options;
  if (networkState.nodes.length > 1) toSel.selectedIndex = networkState.nodes.length - 1;

  drawCorridors();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (fromSel.value === toSel.value) {
      showRouteMessage('Pick two different mines.');
      return;
    }
    try {
      const res = await apiService.getShortestRoute(fromSel.value, toSel.value);
      showRoute(res);
    } catch (err) {
      showRouteMessage(`Route failed: ${err.message}`);
    }
  });

  if (clearBtn) clearBtn.addEventListener('click', clearRoute);

  initMstPane(options);
  document.querySelectorAll('.net-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchNetworkTab(tab.dataset.netTab));
  });
}

function switchNetworkTab(name) {
  document.querySelectorAll('.net-tab').forEach((t) => {
    const on = t.dataset.netTab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  // Show the chosen tab's form; results stay hidden until the user runs it
  document.querySelectorAll('[data-net-pane]').forEach((el) => {
    el.classList.toggle('hidden', !(el.dataset.netPane === name && el.tagName === 'FORM'));
  });
  clearRoute();
  clearMst();
  if (name === 'mst') drawMineDots();
  const sub = document.getElementById('networkSub');
  if (sub && networkState.nodes.length) {
    sub.textContent = name === 'mst'
      ? `The shortest total set of links that connects all ${networkState.nodes.length} mines, chosen from every possible pair.`
      : `${networkState.nodes.length} mines, ${networkState.edges.length} corridors. Each mine links to its 3 nearest mines; distances are straight-line km.`;
  }
}

function initMstPane(options) {
  const form = document.getElementById('mstForm');
  const algo = document.getElementById('mstAlgorithm');
  const root = document.getElementById('mstRoot');
  const rootField = document.getElementById('mstRootField');
  if (!form || !algo || !root) return;

  root.innerHTML = options;
  algo.addEventListener('change', () => {
    if (rootField) rootField.classList.toggle('hidden', algo.value !== 'prim');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await apiService.getMst(algo.value, root.value);
      showMst(res);
    } catch (err) {
      document.getElementById('mstSteps').innerHTML = '';
      document.getElementById('mstTotal').textContent = `Could not build the network: ${err.message}`;
      document.getElementById('mstResult').classList.remove('hidden');
    }
  });
}

/** Draw MST edges one at a time in the order the algorithm picked them */
function showMst(res) {
  clearMst();
  const run = ++networkState.mstRun;
  const steps = document.getElementById('mstSteps');
  const totalEl = document.getElementById('mstTotal');
  const name = (id) => networkState.byId.get(id)?.name || id;

  drawMineDots();
  networkState.mstLayer = L.featureGroup().addTo(map);
  fitToNetworkView(L.latLngBounds(networkState.nodes.map(latLng)));

  steps.innerHTML = res.edges
    .map((e, i) => `<li data-step="${i}"><span>${i + 1}. ${escapeHtml(name(e.from))} – ${escapeHtml(name(e.to))}</span><span class="net-km">${e.weight.toLocaleString()} km</span></li>`)
    .join('');
  const extra = res.algorithm === 'kruskal'
    ? ` · ${res.cycleEdgesRejected} links skipped because they would close a loop`
    : ` · grown from ${name(res.root)}`;
  totalEl.textContent = `${res.totalKm.toLocaleString()} km total, ${res.edges.length} links (linking every pair: ${res.allPairsKm.toLocaleString()} km)${extra}`;
  document.getElementById('mstResult').classList.remove('hidden');

  res.edges.forEach((e, i) => {
    setTimeout(() => {
      if (run !== networkState.mstRun || !networkState.mstLayer) return;
      const pts = [latLng(networkState.byId.get(e.from)), latLng(networkState.byId.get(e.to))];
      L.polyline(pts, { color: '#211A14', weight: 7, opacity: 0.55, interactive: false }).addTo(networkState.mstLayer);
      L.polyline(pts, { color: '#F7F4EE', weight: 3.5, interactive: false }).addTo(networkState.mstLayer);
      raiseMineDots();
      steps.querySelector(`[data-step="${i}"]`)?.classList.add('done');
    }, 350 * (i + 1));
  });
}

function clearMst() {
  networkState.mstRun++;
  if (networkState.mstLayer) networkState.mstLayer.remove();
  networkState.mstLayer = null;
  const result = document.getElementById('mstResult');
  if (result) result.classList.add('hidden');
}

const latLng = (n) => [n.lat, n.lng];

/** Fit bounds while keeping clear of the network card (left) and filter dock (bottom) */
function fitToNetworkView(bounds) {
  map.fitBounds(bounds, { paddingTopLeft: [440, 60], paddingBottomRight: [90, 220], maxZoom: 7 });
}

function drawCorridors(highlight = new Set()) {
  networkLayerGroup.clearLayers();
  networkState.edges.forEach((e) => {
    const a = networkState.byId.get(e.from);
    const b = networkState.byId.get(e.to);
    const on = highlight.has(`${e.from}|${e.to}`) || highlight.has(`${e.to}|${e.from}`);
    if (on) return; // drawn by the route layer
    L.polyline([latLng(a), latLng(b)], { color: '#F4F1EA', weight: 1.5, opacity: 0.7, dashArray: '4 6', interactive: false })
      .addTo(networkLayerGroup);
  });
  drawMineDots(false);
}

function raiseMineDots() {
  networkLayerGroup.eachLayer((layer) => {
    if (layer instanceof L.CircleMarker) layer.bringToFront();
  });
}

function drawMineDots(clear = true) {
  if (clear) networkLayerGroup.clearLayers();
  networkState.nodes.forEach((n) => {
    L.circleMarker(latLng(n), { radius: 6, color: '#211A14', weight: 2, fillColor: '#FFFFFF', fillOpacity: 1 })
      .bindTooltip(`${n.name} · ${n.id}`, { direction: 'top', offset: [0, -6] })
      .on('click', () => {
        const mine = currentMinesList.find((m) => m.mineId === n.id);
        if (mine) openNodeInspector(mineToInspectorNode(mine));
      })
      .addTo(networkLayerGroup);
  });
}

function showRoute(res) {
  const result = document.getElementById('routeResult');
  const hopsEl = document.getElementById('routeHops');
  const totalEl = document.getElementById('routeTotal');
  const clearBtn = document.getElementById('routeClear');
  if (networkState.routeLayer) networkState.routeLayer.remove();

  if (!res.reachable) {
    showRouteMessage('These mines are not connected by any corridor.');
    return;
  }

  const highlight = new Set(res.hops.map((h) => `${h.from}|${h.to}`));
  drawCorridors(highlight);
  const points = res.path.map(latLng);
  networkState.routeLayer = L.featureGroup([
    L.polyline(points, { color: '#211A14', weight: 7, opacity: 0.55, interactive: false }),
    L.polyline(points, { color: '#F7F4EE', weight: 3.5, opacity: 1, interactive: false }),
  ]).addTo(map);
  raiseMineDots();
  fitToNetworkView(networkState.routeLayer.getBounds());

  const name = (id) => networkState.byId.get(id)?.name || id;
  hopsEl.innerHTML = res.hops
    .map((h) => `<li><span>${escapeHtml(name(h.from))} → ${escapeHtml(name(h.to))}</span><span class="net-km">${h.distanceKm.toLocaleString()} km</span></li>`)
    .join('');
  const n = res.hops.length;
  totalEl.textContent = `${res.distanceKm.toLocaleString()} km in ${n} hop${n === 1 ? '' : 's'} · Dijkstra settled ${res.nodesSettled} of ${networkState.nodes.length} mines`;
  result.classList.remove('hidden');
  if (clearBtn) clearBtn.classList.remove('hidden');
}

function showRouteMessage(text) {
  const result = document.getElementById('routeResult');
  document.getElementById('routeHops').innerHTML = '';
  document.getElementById('routeTotal').textContent = text;
  result.classList.remove('hidden');
}

function clearRoute() {
  if (networkState.routeLayer) networkState.routeLayer.remove();
  networkState.routeLayer = null;
  drawCorridors();
  document.getElementById('routeResult')?.classList.add('hidden');
  document.getElementById('routeClear')?.classList.add('hidden');
}

// Assay range search: the server builds a BST over the chosen assay column
function initBstSearch() {
  const form = document.getElementById('bstQueryForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runBstSearch();
  });
  const attr = document.getElementById('bstAttr');
  if (attr) attr.addEventListener('change', runBstSearch);
}

async function runBstSearch() {
  const attr = document.getElementById('bstAttr')?.value || 'fe_pct';
  const min = Number(document.getElementById('bstMin')?.value);
  const max = Number(document.getElementById('bstMax')?.value);
  const stats = document.getElementById('bstStats');

  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    if (stats) stats.textContent = 'Enter a range where From is not greater than To.';
    return;
  }

  try {
    const res = await apiService.getBstRange(attr, min, max);
    const matchIds = new Set(res.matches.map((m) => m.id));
    const matchMinerals = new Set(res.matches.map((m) => String(m.mineral.mineral_id)));

    const visited = new Set(res.visited);
    const shortName = (label) => label.replace(/\s*\(.*\)\s*/, '').split(' ').slice(0, 2).join(' ');
    drawTree(document.getElementById('bstTreeSvg'), res.tree, {
      classOf: (n) => (matchIds.has(n.id) ? 'match' : visited.has(n.id) ? 'visited' : 'skipped'),
      edgeOn: (a, b) => visited.has(a.id) && visited.has(b.id),
      keyOf: (n) => n.key,
      labelOf: (n) => shortName(n.label),
      titleOf: (n) => `${n.label}: ${n.key}%`,
    });

    document.querySelectorAll('#masterTableTbody tr[data-mineral-id]').forEach((row) => {
      row.classList.toggle('row-match', matchMinerals.has(row.dataset.mineralId));
    });

    if (stats) {
      const n = res.matches.length;
      stats.textContent = `${n} mineral${n === 1 ? '' : 's'} with ${res.attributeLabel} ${min}–${max}% · BST checked ${res.bstComparisons} of ${res.size} nodes (linear scan: ${res.linearComparisons}) · height ${res.height}`;
    }
  } catch (err) {
    if (stats) stats.textContent = `Search failed: ${err.message}`;
  }
}

/** Lay out nodes by in-order position (x) and depth (y), then draw as SVG */
function drawTree(svg, root, { classOf, edgeOn = () => false, keyOf, labelOf, titleOf, badgeOf = null, colW = 104 }) {
  if (!svg) return;
  const nodes = [];
  let order = 0;
  const layout = (node, depth) => {
    if (!node) return;
    layout(node.left, depth + 1);
    node.x = order++;
    node.depth = depth;
    nodes.push(node);
    layout(node.right, depth + 1);
  };
  layout(root, 0);

  const rowH = 52;
  const pad = 22;
  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
  const width = Math.max(1, nodes.length) * colW;
  const height = (maxDepth + 1) * rowH + pad;
  const px = (n) => n.x * colW + colW / 2;
  const py = (n) => n.depth * rowH + pad;

  const edges = nodes
    .flatMap((n) => [n.left, n.right].filter(Boolean).map((c) =>
      `<line x1="${px(n)}" y1="${py(n)}" x2="${px(c)}" y2="${py(c)}" class="bst-edge${edgeOn(n, c) ? ' on' : ''}"/>`))
    .join('');

  const circles = nodes
    .map((n) => {
      const badge = badgeOf ? `<text x="${px(n) + 22}" y="${py(n) - 12}" class="tree-badge">${escapeHtml(badgeOf(n))}</text>` : '';
      return `<g class="bst-node ${classOf(n)}">
        <title>${escapeHtml(titleOf(n))}</title>
        <circle cx="${px(n)}" cy="${py(n)}" r="17"/>
        <text x="${px(n)}" y="${py(n) + 4}" class="bst-key">${escapeHtml(keyOf(n))}</text>
        <text x="${px(n)}" y="${py(n) + 32}" class="bst-label">${escapeHtml(labelOf(n))}</text>
        ${badge}
      </g>`;
    })
    .join('');

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML = edges + circles;
}

// Lease expiry index: AVL tree keyed by "valid_till|lease_id" (unique, date-ordered)
const leaseIndex = new AVLTree();
let leaseRecords = [];

const leaseKey = (lease) => `${lease.valid_till}|${lease.lease_id}`;

async function initLeaseExpiryIndex() {
  const form = document.getElementById('avlQueryForm');
  const select = document.getElementById('avlLeaseSelect');
  const toggle = document.getElementById('avlToggleBtn');
  if (!form || !select || !toggle) return;

  try {
    const [leases, companies] = await Promise.all([
      apiService.getEntityTable('leases'),
      apiService.getEntityTable('companies'),
    ]);
    const companyName = new Map((companies.data || []).map((c) => [c.company_id, c.company_name]));
    // /api/leases returns rows sorted by valid_till: the worst case for a plain BST
    leaseRecords = (leases.data || []).map((l) => ({ ...l, company_name: companyName.get(l.company_id) || '' }));
  } catch (err) {
    const stats = document.getElementById('avlStats');
    if (stats) stats.textContent = `Could not load leases: ${err.message}`;
    return;
  }

  leaseRecords.forEach((l) => leaseIndex.insert(leaseKey(l), l));
  const buildRotations = leaseIndex.totalRotations;

  select.innerHTML = leaseRecords
    .map((l) => `<option value="${escapeHtml(leaseKey(l))}">${escapeHtml(l.lease_id)} · ${escapeHtml(l.valid_till)}</option>`)
    .join('');

  const syncToggle = () => {
    toggle.textContent = leaseIndex.has(select.value) ? 'Remove from index' : 'Add to index';
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    renderLeaseRange();
  });
  select.addEventListener('change', syncToggle);
  toggle.addEventListener('click', () => {
    const key = select.value;
    const lease = leaseRecords.find((l) => leaseKey(l) === key);
    if (!lease) return;
    if (leaseIndex.has(key)) leaseIndex.delete(key);
    else leaseIndex.insert(key, lease);
    syncToggle();
    renderLeaseIndex(describeRotations(leaseIndex.lastRotations));
    renderLeaseRange();
  });

  syncToggle();
  renderLeaseIndex(`${buildRotations} rotation${buildRotations === 1 ? '' : 's'} while building`);
  renderLeaseRange();
}

function describeRotations(rotations) {
  if (rotations.length === 0) return 'no rotation needed';
  return rotations.map((r) => `rotate ${r.direction} at ${r.pivot.split('|')[0]}`).join(', ');
}

function renderLeaseIndex(lastChange) {
  const stats = document.getElementById('avlStats');

  // Same keys inserted in date order into a plain BST, for comparison
  const plain = new BinarySearchTree();
  leaseIndex.inOrder().forEach((n) => plain.insert(n.key, null));

  if (stats) {
    stats.textContent = `${leaseIndex.size()} leases · AVL height ${leaseIndex.height()} vs ${plain.height()} for an unbalanced BST · ${lastChange}`;
  }

  drawTree(document.getElementById('avlTreeSvg'), leaseIndex.toJSON((n) => n.data.lease_id), {
    classOf: () => 'visited',
    keyOf: (n) => n.key.slice(0, 4),
    labelOf: (n) => n.label,
    titleOf: (n) => `${n.label} expires ${n.key.split('|')[0]} (balance ${n.balance})`,
    badgeOf: (n) => (n.balance > 0 ? `+${n.balance}` : String(n.balance)),
    colW: 118,
  });
}

function renderLeaseRange() {
  const list = document.getElementById('avlResults');
  if (!list) return;
  const from = Number(document.getElementById('avlFromYear')?.value);
  const to = Number(document.getElementById('avlToYear')?.value);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
    list.innerHTML = '<li class="avl-empty">Enter a year range where From is not after To.</li>';
    return;
  }
  // "|" sorts after any lease id character, so this upper bound covers the whole last year
  const hits = leaseIndex.rangeQuery(`${from}-01-01`, `${to}-12-31|~`);
  list.innerHTML = hits.length
    ? hits
        .map((n) => `<li><span class="avl-date">${escapeHtml(n.data.valid_till)}</span><span class="avl-lease">${escapeHtml(n.data.lease_id)}</span><span class="avl-company">${escapeHtml(n.data.company_name)}</span></li>`)
        .join('')
    : `<li class="avl-empty">No leases in the index expire between ${from} and ${to}.</li>`;
}

// SQL console history: two stacks give undo / redo over executed queries
const sqlHistory = new QueryHistoryManager();

function initSqlHistory(sqlInput, resultsBox, btnRun) {
  const btnUndo = document.getElementById('btnSqlUndo');
  const btnRedo = document.getElementById('btnSqlRedo');
  const historyBox = document.getElementById('sqlHistory');
  const historyList = document.getElementById('sqlHistoryList');
  const historyCount = document.getElementById('sqlHistoryCount');

  const render = () => {
    if (btnUndo) btnUndo.disabled = !sqlHistory.canUndo();
    if (btnRedo) btnRedo.disabled = !sqlHistory.canRedo();
    const recent = sqlHistory.recent(8);
    if (historyBox) historyBox.classList.toggle('hidden', recent.length === 0);
    if (historyCount) historyCount.textContent = `(${sqlHistory.history.size()})`;
    if (historyList) {
      historyList.innerHTML = recent
        .map((q, i) => `<li><button type="button" class="sql-history-item${i === 0 ? ' current' : ''}" data-index="${i}">${escapeHtml(q.replace(/\s+/g, ' '))}</button></li>`)
        .join('');
      historyList.querySelectorAll('.sql-history-item').forEach((item) => {
        item.addEventListener('click', () => {
          sqlInput.value = recent[Number(item.dataset.index)];
          sqlInput.focus();
        });
      });
    }
  };

  const run = async () => {
    const query = sqlInput.value.trim();
    const ok = await executeSqlQuery(query, resultsBox);
    if (ok) sqlHistory.record(query);
    render();
  };

  const step = (query) => {
    if (query === null) return;
    sqlInput.value = query;
    render();
  };

  btnRun.addEventListener('click', run);
  if (btnUndo) btnUndo.addEventListener('click', () => step(sqlHistory.undo()));
  if (btnRedo) btnRedo.addEventListener('click', () => step(sqlHistory.redoQuery()));

  sqlInput.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      step(sqlHistory.undo());
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      step(sqlHistory.redoQuery());
    }
  });

  render();
}

// Execute Relational SQL Query in Console. Resolves true on success.
async function executeSqlQuery(query, resultsContainer) {
  if (!query || !query.trim()) {
    resultsContainer.innerHTML = `<div class="sql-results-placeholder">Please enter a valid SQL query.</div>`;
    return false;
  }

  resultsContainer.innerHTML = `<div class="sql-results-placeholder">Running…</div>`;

  try {
    const res = await apiService.executeSql(query);

    if (!res.columns || res.columns.length === 0) {
      resultsContainer.innerHTML = `
        <div class="sql-results-meta">Query completed in ${res.executionTimeMs}ms &bull; 0 rows returned</div>
        <div class="sql-results-placeholder">Query executed successfully but returned an empty dataset.</div>
      `;
      return true;
    }

    const theadHtml = res.columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
    const tbodyHtml = res.rows
      .map(
        (row) => `
        <tr>
          ${res.columns
            .map((col) => {
              const val = row[col];
              const isId = col.toLowerCase().includes('id');
              const displayVal = val !== null && val !== undefined ? escapeHtml(String(val)) : '<span style="color:#A0988E">NULL</span>';
              return `<td class="${isId ? 'td-mine-id' : ''}">${displayVal}</td>`;
            })
            .join('')}
        </tr>
      `
      )
      .join('');

    resultsContainer.innerHTML = `
      <div class="sql-results-meta">Query executed in ${res.executionTimeMs}ms &bull; ${res.rowCount} rows returned</div>
      <div style="overflow-x: auto; max-height: 280px;">
        <table class="db-master-table" style="font-size:0.75rem;">
          <thead><tr>${theadHtml}</tr></thead>
          <tbody>${tbodyHtml}</tbody>
        </table>
      </div>
    `;
    return true;
  } catch (err) {
    resultsContainer.innerHTML = `
      <div class="sql-results-meta" style="color: #B92520;">Query Execution Error</div>
      <div style="padding: 12px; background: #FDECEB; color: #B92520; border-radius: 8px; font-family: var(--font-mono); font-size: 0.78rem;">
        &#9888; ${escapeHtml(err.message)}
      </div>
    `;
    return false;
  }
}

// ============================================================================
// 13. Archival Publications & Past Reports Controller
// ============================================================================
const ARCHIVAL_PUBLICATIONS_DATA = [
  {
    id: 'PUB-2026-01',
    title: 'Annual Iron Ore Production & Dispatch Ledger',
    jurisdiction: 'Odisha (Keonjhar)',
    period: 'FY 2025–26',
    meta: 'Odisha (Keonjhar)  •  FY 2025–26',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2026/041',
    date: '15 Jan 2026',
    pages: 42,
    size: '4.8 MB',
    format: 'PDF',
    summary: 'Audited gross production, grade distribution (64.2% Fe Hematite), environmental dispatch permits, and royalty remittances for the Keonjhar Iron Ore Sector.',
    metrics: [
      { key: 'Gross Extracted Output', val: '48.20 Million Metric Tonnes' },
      { key: 'Dispatch Clearance Pass', val: '100% Biometric e-Transit Pass Verified' },
      { key: 'Net Royalty Remittance', val: '₹1,420.84 Crores to State Treasury' },
      { key: 'Regulatory Compliance', val: '99.8% IBM Benchmark Index' }
    ]
  },
  {
    id: 'PUB-2026-02',
    title: 'Concession Validity & Expiry Timeline Review',
    jurisdiction: 'Pan-India',
    period: 'Q2 2026',
    meta: 'Pan-India  •  Q2 2026',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2026/028',
    date: '02 Apr 2026',
    pages: 68,
    size: '6.2 MB',
    format: 'PDF',
    summary: 'National audit of 842 major mineral concessions under Section 8A of the MMDR Act, flagging upcoming 2030 auction transitions and compliance clearances.',
    metrics: [
      { key: 'Audited Concession Leases', val: '842 Active Major Mineral Leases' },
      { key: 'Expiring Within 5-Yr Cycle', val: '42 Concessions Scheduled for Re-Auction' },
      { key: 'Protected Compliant Leases', val: '780 Compliant Leases Protected' },
      { key: 'Reconciliation Status', val: 'National Registry Cleared' }
    ]
  },
  {
    id: 'PUB-2025-03',
    title: 'Copper & Multi-Metal Reserve Extraction Index',
    jurisdiction: 'Rajasthan (Khetri)',
    period: 'Bi-Annual 2025',
    meta: 'Rajasthan (Khetri)  •  Bi-Annual 2025',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2025/119',
    date: '18 Nov 2025',
    pages: 36,
    size: '3.9 MB',
    format: 'PDF',
    summary: 'Sub-surface geological extraction log, chalcopyrite ore beneficiation yields, underground shaft structural monitoring, and tailings pond safety compliance.',
    metrics: [
      { key: 'Processed Copper Ore', val: '18,450 Metric Tonnes (2.4% Cu Grade)' },
      { key: 'Smelter Recovery Ratio', val: '94.2% Theoretical Recovery' },
      { key: 'Underground Active Shafts', val: '4 Fully Monitored Shafts' },
      { key: 'Tailings Stability Index', val: 'Zero-Seepage Certified' }
    ]
  },
  {
    id: 'PUB-2025-04',
    title: 'Bauxite Lease Boundary & Buffer Overlap Report',
    jurisdiction: 'Odisha (Koraput)',
    period: 'Annual 2025',
    meta: 'Odisha (Koraput)  •  Annual 2025',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2025/084',
    date: '10 Dec 2025',
    pages: 54,
    size: '5.4 MB',
    format: 'PDF',
    summary: 'DGPS and satellite cadastral boundary verification over the Panchpatmali bauxite plateau, validating 50-meter buffer demarcations against tribal and forest reserves.',
    metrics: [
      { key: 'DGPS Validated Area', val: '1,845.00 Hectares (Panchpatmali Ridge)' },
      { key: 'Boundary Pillars Checked', val: '100% Boundary Pillars Georeferenced' },
      { key: 'Buffer Zone Verification', val: 'Zero Encroachment Beyond Concession' },
      { key: 'Environmental Status', val: 'Stage-II Forest Clearance Compliant' }
    ]
  },
  {
    id: 'PUB-2025-05',
    title: 'Cross-State Mineral Royalty Collection Reconciliation',
    jurisdiction: 'Karnataka & Chhattisgarh',
    period: 'FY 2024–25',
    meta: 'Karnataka & Chhattisgarh  •  FY 2024–25',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2025/002',
    date: '28 Mar 2025',
    pages: 82,
    size: '8.1 MB',
    format: 'PDF',
    summary: 'Tripartite inter-state reconciliation report covering District Mineral Foundation (DMF) and National Mineral Exploration Trust (NMET) cess disbursements.',
    metrics: [
      { key: 'Reconciled Royalty Amount', val: '₹2,845.60 Crores Reconciled' },
      { key: 'DMF Welfare Allocation', val: '₹1,980.20 Crores to Mining Districts' },
      { key: 'NMET Exploration Fund', val: '₹142.28 Crores for Greenfield Basins' },
      { key: 'Audit Discrepancy Margin', val: '0.00% (Full Settlement Verified)' }
    ]
  }
];

let activeSelectedPublication = ARCHIVAL_PUBLICATIONS_DATA[0];

async function initArchivalReports() {
  const container = document.getElementById('reportsListContainer');
  const pdfModal = document.getElementById('pdfPreviewModal');
  const btnClosePdfModal = document.getElementById('btnClosePdfModal');
  const btnPrintPdfDoc = document.getElementById('btnPrintPdfDoc');
  const btnDownloadPdfDoc = document.getElementById('btnDownloadPdfDoc');

  // Render initial records
  renderPublicationsList(ARCHIVAL_PUBLICATIONS_DATA);

  // Fetch live reports from relational backend
  try {
    const res = await apiService.getReports();
    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
      ARCHIVAL_PUBLICATIONS_DATA.splice(0, ARCHIVAL_PUBLICATIONS_DATA.length, ...res.data);
      renderPublicationsList(ARCHIVAL_PUBLICATIONS_DATA);
    }
  } catch (err) {
    console.warn('API /api/reports fetch fallback:', err);
  }

  // Close modal handler
  if (btnClosePdfModal && pdfModal) {
    btnClosePdfModal.addEventListener('click', () => {
      pdfModal.close();
    });
  }

  // Print Document handler
  if (btnPrintPdfDoc) {
    btnPrintPdfDoc.addEventListener('click', () => {
      window.print();
    });
  }

  // Download PDF file handler
  if (btnDownloadPdfDoc) {
    btnDownloadPdfDoc.addEventListener('click', () => {
      if (activeSelectedPublication) {
        downloadPublicationFile(activeSelectedPublication);
      }
    });
  }

}

function renderPublicationsList(list) {
  const container = document.getElementById('reportsListContainer');
  if (!container) return;

  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">No archival publications matching filter.</div>`;
    return;
  }

  list.forEach((pub) => {
    const article = document.createElement('article');
    article.className = 'report-row';
    article.dataset.id = pub.id;
    article.innerHTML = `
      <div class="report-left-col">
        <h2 class="report-item-title">${escapeHtml(pub.title)}</h2>
        <div class="report-item-meta">
          <span>${escapeHtml(pub.jurisdiction)}</span>
          <span class="meta-separator">&bull;</span>
          <span>${escapeHtml(pub.period)}</span>
        </div>
      </div>
      <div class="report-right-col">
        <button type="button" class="btn-download-pdf" aria-label="Download ${escapeHtml(pub.title)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download</span>
        </button>
      </div>
    `;

    // Row opens the preview; the button downloads directly
    article.addEventListener('click', (e) => {
      if (e.target.closest('.btn-download-pdf')) {
        e.stopPropagation();
        downloadPublicationFile(pub);
        return;
      }
      openPublicationInspector(pub);
    });

    container.appendChild(article);
  });
}

function openPublicationInspector(pub) {
  activeSelectedPublication = pub;
  const pdfModal = document.getElementById('pdfPreviewModal');
  if (!pdfModal) return;

  document.getElementById('pdfDocTitle').textContent = pub.title;
  document.getElementById('pdfDocMeta').textContent = `${pub.registryNo} • ${pub.jurisdiction} • ${pub.period}`;
  document.getElementById('pdfDocSummary').textContent = pub.summary;

  const metricsGrid = document.getElementById('pdfMetricsGrid');
  if (metricsGrid && Array.isArray(pub.metrics)) {
    metricsGrid.innerHTML = pub.metrics.map((m) => `
      <div class="pdf-metric-card">
        <span class="pdf-metric-key">${escapeHtml(m.key)}</span>
        <span class="pdf-metric-val">${escapeHtml(m.val)}</span>
      </div>
    `).join('');
  }

  pdfModal.showModal();
}

function downloadPublicationFile(pub) {
  const content = `MINERVA — Indian Mineral Resource Management Database
${'='.repeat(60)}
Document:      ${pub.title}
Registry no.:  ${pub.registryNo}
Jurisdiction:  ${pub.jurisdiction}
Period:        ${pub.period}
Date:          ${pub.date}

SUMMARY
${pub.summary}

FIGURES
${pub.metrics.map((m) => `* ${m.key.padEnd(28)}: ${m.val}`).join('\n')}
`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MINERVA_${pub.id}_${pub.title.replace(/\s+/g, '_')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Downloaded ${pub.title}`, 'success');
}

// ============================================================================
// 14. Application Boot
// ============================================================================

// ============================================================================
// 13b. Auth Workstation (Prompt 1 Frontend Interactions)
// ============================================================================
// Demo accounts. PINs can be changed through "Forgot PIN?" for the current page session.
const DEMO_ACCOUNTS = {
  'USR-1024': { pin: 'minerva@2026', name: 'Joel George', role: 'Database Administrator' },
  'INS-4088': { pin: 'inspector@2026', name: 'R. K. Sharma', role: 'Mining Lease Inspector' },
  'GEO-9921': { pin: 'surveyor@2026', name: 'Ananya Sen', role: 'Geological Field Surveyor' },
};

function initAuthWorkstation() {
  const form = document.getElementById('authSignInForm');
  const idInput = document.getElementById('authIdentifierInput');
  const passInput = document.getElementById('authPasscodeInput');
  const toggleBtn = document.getElementById('authTogglePasswordBtn');
  const eyeIcon = document.getElementById('authEyeIcon');
  const eyeOffIcon = document.getElementById('authEyeOffIcon');

  // Password visibility toggle
  let showPass = false;
  if (toggleBtn && passInput) {
    toggleBtn.addEventListener('click', () => {
      showPass = !showPass;
      passInput.type = showPass ? 'text' : 'password';
      if (eyeIcon) eyeIcon.classList.toggle('hidden', showPass);
      if (eyeOffIcon) eyeOffIcon.classList.toggle('hidden', !showPass);
    });
  }

  initPinReset(idInput);

  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = idInput ? idInput.value.trim().toUpperCase() : '';
    const passVal = passInput ? passInput.value : '';
    const btnText = document.getElementById('authBtnText');
    const btnLoading = document.getElementById('authBtnLoading');
    const errBanner = document.getElementById('authErrorBanner');
    const submitBtn = document.getElementById('authSubmitBtn');

    if (submitBtn) submitBtn.disabled = true;
    if (btnText) btnText.classList.add('hidden');
    if (btnLoading) btnLoading.classList.remove('hidden');
    if (errBanner) errBanner.classList.add('hidden');

    setTimeout(() => {
      if (submitBtn) submitBtn.disabled = false;
      if (btnText) btnText.classList.remove('hidden');
      if (btnLoading) btnLoading.classList.add('hidden');

      const account = DEMO_ACCOUNTS[idVal];
      if (account && passVal === account.pin) {
        showToast(`Welcome, ${account.name}`, 'success');
        markAuthenticated();
        switchView('database', true);
      } else if (errBanner) {
        errBanner.classList.remove('hidden');
      }
    }, 400);
  });
}

function initPinReset(signInIdInput) {
  const modal = document.getElementById('forgotPinModal');
  const openBtn = document.getElementById('authForgotPinBtn');
  const closeBtn = document.getElementById('closeForgotPinBtn');
  const cancelBtn = document.getElementById('cancelForgotPinBtn');
  const sendBtn = document.getElementById('sendOtpBtn');
  const saveBtn = document.getElementById('confirmResetBtn');
  const otpStep = document.getElementById('otpStep');
  const idInput = document.getElementById('resetIdentifierInput');
  const otpInput = document.getElementById('resetOtpInput');
  const otpHint = document.getElementById('resetOtpHint');
  const newPinInput = document.getElementById('newPinInput');
  const errorEl = document.getElementById('resetError');
  if (!modal || !openBtn || !sendBtn || !saveBtn) return;

  let pendingCode = null;
  let pendingId = null;

  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.classList.toggle('hidden', !msg);
  };

  const reset = () => {
    pendingCode = null;
    pendingId = null;
    idInput.value = signInIdInput?.value.trim() || '';
    idInput.disabled = false;
    otpInput.value = '';
    newPinInput.value = '';
    otpStep.classList.add('hidden');
    sendBtn.classList.remove('hidden');
    saveBtn.classList.add('hidden');
    showError('');
  };

  openBtn.addEventListener('click', () => {
    reset();
    modal.showModal();
  });
  [closeBtn, cancelBtn].forEach((btn) => btn?.addEventListener('click', () => modal.close()));

  sendBtn.addEventListener('click', () => {
    const id = idInput.value.trim().toUpperCase();
    if (!DEMO_ACCOUNTS[id]) {
      showError('No account with that identifier.');
      return;
    }
    pendingId = id;
    pendingCode = String(Math.floor(100000 + Math.random() * 900000));
    idInput.disabled = true;
    otpHint.textContent = `Your code: ${pendingCode}`;
    otpStep.classList.remove('hidden');
    sendBtn.classList.add('hidden');
    saveBtn.classList.remove('hidden');
    showError('');
    otpInput.focus();
  });

  saveBtn.addEventListener('click', () => {
    if (otpInput.value.trim() !== pendingCode) {
      showError('That code is not correct.');
      return;
    }
    if (newPinInput.value.length < 6) {
      showError('The new PIN must be at least 6 characters.');
      return;
    }
    DEMO_ACCOUNTS[pendingId].pin = newPinInput.value;
    if (signInIdInput) signInIdInput.value = pendingId;
    const pass = document.getElementById('authPasscodeInput');
    if (pass) pass.value = '';
    modal.close();
    showToast('PIN updated. Sign in with your new PIN.', 'success');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initAlerts();
  if (isAuthenticated()) queueMineAlerts();
  initGeospatialMap();
  initDatabaseExplorer();
  initArchivalReports();
  initLeaseExpiryIndex();
  initAuthWorkstation();

  // Check URL pathname or hash for direct view routing
  const path = window.location.pathname;
  const hash = window.location.hash;

  if (path === '/database' || hash === '#database' || path.includes('database.html')) {
    switchView('database', false);
  } else if (path === '/reports' || hash === '#reports' || path.includes('reports.html')) {
    switchView('reports', false);
  } else if (path === '/auth' || hash === '#auth' || path.includes('auth.html') || !isAuthenticated()) {
    // Login page is the default entry point
    switchView('auth', false);
  } else {
    switchView('map', false);
  }
});


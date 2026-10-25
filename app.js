/**
 * MINERVA — National Mineral Geospatial Intelligence Grid
 * Production Geospatial System Synthesizing Image 1 (UI Chrome) & Image 2 (LUMINA Basemap)
 */

import apiService from './apiService.js';
import { AlertQueueManager, AlertPriority, Queue, PriorityQueue } from './dsa/Queue.js';
import { QueryHistoryManager, Stack } from './dsa/Stack.js';
import { Graph, dijkstra } from './dsa/Dijkstra.js';
import { primMST, UnionFind } from './dsa/MST.js';
import { DSA_CONCEPTS, DSA_GROUPS } from './dsa/registry.js';
import { AVLTree } from './dsa/AVLTree.js';
import { BinarySearchTree } from './dsa/BinarySearchTree.js';

// ============================================================================
// 0. Alerts — toasts are shown one at a time from a priority queue
// ============================================================================
const alertQueue = new AlertQueueManager();
let openAlertsPanel = () => {};

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
    if (alertQueue.log.isEmpty()) {
      list.innerHTML = '<li class="nav-alerts-empty">No alerts yet</li>';
      return;
    }
    list.innerHTML = alertQueue.recent()
      .map((a) => {
        const time = new Date(a.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `<li class="nav-alert-item"><span class="nav-alert-level level-${a.label.toLowerCase()}">${a.label}</span><span class="nav-alert-msg">${escapeHtml(a.message)}</span><span class="nav-alert-time">${time}</span></li>`;
      })
      .join('');
  };
  alertQueue.onChange(renderPanel);
  renderPanel();

  if (btn && panel) {
    const setOpen = (open) => {
      panel.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        unread = 0;
        renderPanel();
      }
    };
    openAlertsPanel = () => setOpen(true);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(panel.classList.contains('hidden'));
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

  // Left dock navigation
  document.getElementById('dockBtnMap').addEventListener('click', () => switchView('map', true));
  document.getElementById('dockBtnDatabase').addEventListener('click', () => switchView('database', true));
  document.getElementById('dockBtnLeases').addEventListener('click', () => switchView('leases', true));
  document.getElementById('dockBtnDsa').addEventListener('click', () => switchView('dsa', true));
  document.getElementById('dockBtnAuth').addEventListener('click', signOut);

  initSearch();
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

const VIEWS = {
  map: { view: 'mapView', dock: 'dockBtnMap' },
  database: { view: 'databaseExplorerView', dock: 'dockBtnDatabase' },
  leases: { view: 'leasesView', dock: 'dockBtnLeases' },
  dsa: { view: 'dsaView', dock: 'dockBtnDsa' },
  auth: { view: 'authView', dock: null },
};

// Old links keep working
const VIEW_ALIASES = { reports: 'leases' };

let currentView = null;
// Where to go after signing in, when a protected view was requested while signed out
let postLoginView = null;

function resolveView(name) {
  const resolved = VIEW_ALIASES[name] || name;
  return VIEWS[resolved] ? resolved : null;
}

function takePostLoginView() {
  const next = postLoginView && postLoginView !== 'auth' ? postLoginView : 'database';
  postLoginView = null;
  return next;
}

function switchView(requested, updateHistory = true) {
  let viewName = resolveView(requested) || 'map';
  // Every view except the login gate requires an authenticated session
  if (viewName !== 'auth' && !isAuthenticated()) {
    postLoginView = viewName;
    viewName = 'auth';
  }
  document.body.classList.toggle('auth-mode', viewName === 'auth');

  Object.entries(VIEWS).forEach(([name, cfg]) => {
    const on = name === viewName;
    const el = document.getElementById(cfg.view);
    if (el) {
      el.classList.toggle('hidden', !on);
      el.classList.toggle('active', on);
    }
    if (cfg.dock) document.getElementById(cfg.dock)?.classList.toggle('active', on);
  });

  if (viewName === 'map') {
    if (map) setTimeout(() => map.invalidateSize(), 100);
  } else {
    window.scrollTo({ top: 0 });
  }

  currentView = viewName;
  if (viewName === 'dsa') renderDsaView();

  // A search typed in one view shouldn't silently filter the next one
  resetSearchForView();

  if (updateHistory) {
    const targetHash = '#' + viewName;
    try {
      history.pushState({ view: viewName }, '', targetHash);
    } catch {
      window.location.hash = targetHash;
    }
  } else if (viewName !== 'auth' && location.hash && location.hash !== '#' + viewName) {
    // Normalise aliases such as #reports -> #leases
    history.replaceState({ view: viewName }, '', '#' + viewName);
  }
}

// Browser Back/Forward navigation listener
window.addEventListener('popstate', () => {
  switchView(resolveView(window.location.hash.replace('#', '')) || 'map', false);
});

window.addEventListener('hashchange', () => {
  const name = resolveView(window.location.hash.replace('#', ''));
  if (name && name !== currentView) switchView(name, false);
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
        updateSearchScope();
        reapplySearch();
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
    tbody.innerHTML = searchQuery
      ? `<tr class="search-empty"><td colspan="8">No mines match “${escapeHtml(searchQuery)}”. <button type="button" class="btn-link-inline" data-clear-search>Clear search</button></td></tr>`
      : `<tr class="search-empty"><td colspan="8">No mines in the database.</td></tr>`;
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

  // Never let these forms submit natively (that reloads the page), even before the data arrives
  [form, document.getElementById('mstForm')].forEach((f) => f?.addEventListener('submit', (e) => e.preventDefault()));

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
  dsaLive.mst = res;
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

  dsaLive.route = res;
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
    dsaLive.bst = res;
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
// Lower-case text typed in the search bar while the Lease expiry view is open
let leaseSearch = '';

const leaseKey = (lease) => `${lease.valid_till}|${lease.lease_id}`;
const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const yearsUntil = (isoDate) => (new Date(isoDate) - new Date()) / YEAR_MS;

async function initLeaseExpiryIndex() {
  const form = document.getElementById('avlQueryForm');
  const select = document.getElementById('avlLeaseSelect');
  const toggle = document.getElementById('avlToggleBtn');
  if (!form || !select || !toggle) return;

  try {
    const [leases, companies, mines] = await Promise.all([
      apiService.getEntityTable('leases'),
      apiService.getEntityTable('companies'),
      apiService.getMines(),
    ]);
    const companyName = new Map((companies.data || []).map((c) => [c.company_id, c.company_name]));
    const mineByLease = new Map((mines.data || []).map((m) => [m.dossier?.lease?.id, m]));
    // /api/leases returns rows sorted by valid_till: the worst case for a plain BST
    leaseRecords = (leases.data || []).map((l) => {
      const mine = mineByLease.get(l.lease_id);
      return {
        ...l,
        company_name: companyName.get(l.company_id) || '',
        mine_id: mine?.mineId || null,
        mine_name: mine?.mineName || '',
      };
    });
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
    leaseDateRange = null;
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
    renderLeaseSummary();
    renderLeaseIndex(describeRotations(leaseIndex.lastRotations));
    renderLeaseRange();
  });

  document.getElementById('avlResults')?.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-mine-id]');
    if (row) openMineInDatabase(row.dataset.mineId);
  });

  syncToggle();
  renderLeaseSummary();
  renderLeaseIndex(`${buildRotations} rotation${buildRotations === 1 ? '' : 's'} while building`);
  renderLeaseRange();
}

// A tile click sets an exact date range; the year inputs and Find button set whole years
let leaseDateRange = null;

const isoDay = (d) => d.toISOString().slice(0, 10);
function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

/** The four summary ranges. Counts and clicks both use these, through the AVL range query. */
function leaseTiles() {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  // "|~" sorts after any "date|lease id" key with that date, so the end day is included
  const upTo = (d) => `${isoDay(d)}|~`;
  return [
    { label: 'Expired', min: '0000-01-01', max: upTo(yesterday), text: `ended before ${isoDay(today)}` },
    ...[1, 5, 10].map((n) => ({
      label: `Within ${n} year${n === 1 ? '' : 's'}`,
      min: isoDay(today),
      max: upTo(addYears(today, n)),
      text: `end between ${isoDay(today)} and ${isoDay(addYears(today, n))}`,
    })),
  ];
}

function renderLeaseSummary() {
  const box = document.getElementById('leaseSummary');
  if (!box) return;
  const tiles = leaseTiles();
  box.innerHTML = tiles
    .map((t, i) => `<button type="button" class="lease-tile" data-tile="${i}" title="Show leases that ${escapeHtml(t.text)}">
        <span class="lease-tile-count">${leaseIndex.rangeQuery(t.min, t.max).length}</span>
        <span class="lease-tile-label">${escapeHtml(t.label)}</span>
      </button>`)
    .join('') + `<p class="lease-summary-note">${nextExpiryNote()} · ${leaseIndex.size()} leases in the index, as of ${isoDay(new Date())}</p>`;
  box.querySelectorAll('.lease-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      leaseDateRange = tiles[Number(tile.dataset.tile)];
      document.getElementById('avlFromYear').value = leaseDateRange.min.slice(0, 4) === '0000' ? 2000 : leaseDateRange.min.slice(0, 4);
      document.getElementById('avlToYear').value = leaseDateRange.max.slice(0, 4);
      if (leaseSearch) clearSearch();
      renderLeaseRange();
    });
  });
}

/** Earliest lease that hasn't ended yet: an in-order walk of the AVL index from today */
function nextExpiryNote() {
  const [next] = leaseIndex.firstN(1, new Date().toISOString().slice(0, 10));
  if (!next) return 'No lease in the index ends after today';
  const l = next.data;
  return `Next to expire: ${escapeHtml(l.lease_id)}${l.mine_name ? ` (${escapeHtml(l.mine_name)})` : ''} on ${escapeHtml(l.valid_till)}, in ${yearsUntil(l.valid_till).toFixed(1)} years`;
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
  const body = document.getElementById('avlResults');
  const stats = document.getElementById('avlRangeStats');
  if (!body) return;

  let hits;
  if (leaseSearch) {
    // Searching ignores the year range: walk the index in date order and keep matches
    hits = leaseIndex.inOrder().filter((n) =>
      [n.data.lease_id, n.data.mine_name, n.data.mine_id, n.data.company_name]
        .some((f) => String(f || '').toLowerCase().includes(leaseSearch))
    );
    if (stats) stats.textContent = `${hits.length} lease${hits.length === 1 ? '' : 's'} match “${leaseSearch}” (year range ignored while searching)`;
    setSearchCount(hits.length, leaseIndex.size());
  } else if (leaseDateRange) {
    hits = leaseIndex.rangeQuery(leaseDateRange.min, leaseDateRange.max);
    if (stats) stats.textContent = `${hits.length} of ${leaseIndex.size()} indexed leases ${leaseDateRange.text}`;
  } else {
    const from = Number(document.getElementById('avlFromYear')?.value);
    const to = Number(document.getElementById('avlToYear')?.value);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
      body.innerHTML = '<tr class="search-empty"><td colspan="5">Enter a year range where From is not after To.</td></tr>';
      if (stats) stats.textContent = '';
      return;
    }
    // "|" sorts after any lease id character, so this upper bound covers the whole last year
    hits = leaseIndex.rangeQuery(`${from}-01-01`, `${to}-12-31|~`);
    if (stats) stats.textContent = `${hits.length} of ${leaseIndex.size()} indexed leases end between ${from} and ${to}`;
  }

  if (hits.length === 0) {
    body.innerHTML = leaseSearch
      ? `<tr class="search-empty"><td colspan="5">No leases match “${escapeHtml(leaseSearch)}”. <button type="button" class="btn-link-inline" data-clear-search>Clear search</button></td></tr>`
      : '<tr class="search-empty"><td colspan="5">No leases in the index end in this range.</td></tr>';
    return;
  }

  body.innerHTML = hits
    .map((n) => {
      const l = n.data;
      const years = yearsUntil(l.valid_till);
      const left = years < 0 ? 'Expired' : years.toFixed(1);
      const attrs = l.mine_id ? ` data-mine-id="${escapeHtml(l.mine_id)}" tabindex="0" title="Open ${escapeHtml(l.mine_name)} in the database"` : '';
      return `<tr${attrs}>
        <td class="mono">${escapeHtml(l.lease_id)}</td>
        <td>${escapeHtml(l.mine_name || '—')}</td>
        <td>${escapeHtml(l.company_name)}</td>
        <td class="mono">${escapeHtml(l.valid_till)}</td>
        <td class="num${years < 5 ? ' soon' : ''}">${left}</td>
      </tr>`;
    })
    .join('');
  if (leaseSearch) highlightMatches(body, leaseSearch);
}

/** Show a mine in the database view's mines tab with its dossier open */
function openMineInDatabase(mineId) {
  const mine = currentMinesList.find((m) => m.mineId === mineId);
  if (!mine) return;
  switchView('database', true);
  if (activeEntityTab !== 'mines') {
    document.querySelector('.entity-tab-btn[data-tab="mines"]')?.click();
  }
  selectMine(mine);
  document.querySelector(`#masterTableTbody tr[data-mine-id="${CSS.escape(mineId)}"]`)?.scrollIntoView({ block: 'center' });
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
        switchView(takePostLoginView(), true);
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
  initLeaseExpiryIndex();
  initAuthWorkstation();
  initDsaView();

  // Direct links: #map, #database, #leases (#reports), #dsa
  const fromHash = resolveView(window.location.hash.replace('#', ''));
  const fromPath = resolveView(window.location.pathname.replace(/^\/|\.html$/g, ''));
  // Signed out with no deep link: just show the login (sign-in then goes to the database)
  switchView(fromHash || fromPath || (isAuthenticated() ? 'map' : 'auth'), false);
});


// ============================================================================
// 12. Global search: the scope follows the open view
// ============================================================================
const ENTITY_SCOPE = {
  mines: 'Mines',
  minerals: 'Minerals',
  locations: 'Places',
  companies: 'Companies',
  leases: 'Leases',
  production: 'Production',
};

let suggestItems = [];
let suggestIndex = -1;
// The query the visible suggestion list was built for
let suggestQuery = '';

const searchInput = () => document.getElementById('globalSearchInput');
const searchText = () => (searchInput()?.value || '').trim();

function searchScope() {
  if (currentView === 'database') {
    const label = ENTITY_SCOPE[activeEntityTab] || 'Records';
    return {
      label,
      placeholder: activeEntityTab === 'mines' ? 'Filter mines by name, mineral, place or lessee' : `Filter ${label.toLowerCase()}`,
    };
  }
  if (currentView === 'leases') return { label: 'Leases', placeholder: 'Search leases by ID, mine or company' };
  if (currentView === 'dsa') return { label: 'Concepts', placeholder: 'Search concepts, e.g. heap or shortest path' };
  return { label: 'Mines', placeholder: 'Find a mine by name, mineral, place or lessee' };
}

function updateSearchScope() {
  const { label, placeholder } = searchScope();
  const chip = document.getElementById('searchScope');
  if (chip) chip.textContent = label;
  const input = searchInput();
  if (input) {
    input.placeholder = placeholder;
    input.setAttribute('aria-label', `Search ${label.toLowerCase()}`);
  }
}

function initSearch() {
  const input = searchInput();
  const clearBtn = document.getElementById('searchClearBtn');
  const kbd = document.getElementById('searchKbd');
  const toggleBtn = document.getElementById('searchToggleBtn');
  const suggest = document.getElementById('searchSuggest');
  if (!input) return;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  if (kbd) kbd.textContent = isMac ? '⌘K' : 'Ctrl K';

  const focusSearch = () => {
    document.body.classList.add('search-open');
    toggleBtn?.setAttribute('aria-expanded', 'true');
    input.focus();
    input.select();
  };

  window.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('auth-mode')) return;
    const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      focusSearch();
    } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      focusSearch();
    }
  });

  let debounce = null;
  input.addEventListener('input', () => {
    updateSearchChrome();
    clearTimeout(debounce);
    debounce = setTimeout(() => dispatchSearchQuery(searchText(), false), 150);
  });

  input.addEventListener('keydown', (e) => {
    const open = suggest && !suggest.classList.contains('hidden') && suggestItems.length > 0;
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      suggestIndex = (suggestIndex + step + suggestItems.length) % suggestItems.length;
      renderSuggestActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounce);
      dispatchSearchQuery(searchText(), true);
    } else if (e.key === 'Escape') {
      if (searchText()) {
        clearSearch();
      } else {
        input.blur();
      }
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      // Focus came straight back (e.g. the clear button refocuses the input): keep the bar open
      if (document.activeElement === input) return;
      hideSuggestions();
      if (!searchText()) {
        document.body.classList.remove('search-open');
        toggleBtn?.setAttribute('aria-expanded', 'false');
      }
    }, 150);
  });

  clearBtn?.addEventListener('click', () => {
    clearSearch();
    input.focus();
  });

  toggleBtn?.addEventListener('click', focusSearch);

  // Pick a suggestion with the mouse (mousedown so the input's blur doesn't hide the list first)
  suggest?.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-index]');
    if (!li) return;
    e.preventDefault();
    chooseMine(suggestItems[Number(li.dataset.index)]);
  });

  // Any "Clear search" link inside an empty-results message
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear-search]')) clearSearch();
  });

  // Lease rows open with Enter as well as a click
  document.getElementById('avlResults')?.addEventListener('keydown', (e) => {
    const row = e.target.closest('tr[data-mine-id]');
    if (row && e.key === 'Enter') openMineInDatabase(row.dataset.mineId);
  });

  updateSearchScope();
}

function updateSearchChrome() {
  const has = searchText().length > 0;
  document.getElementById('searchClearBtn')?.classList.toggle('hidden', !has);
  document.getElementById('searchKbd')?.classList.toggle('hidden', has);
  if (!has) setSearchCount(null);
}

/** "3 of 8" at the right of the bar while a query is active */
function setSearchCount(shown, total) {
  const el = document.getElementById('searchCount');
  if (!el) return;
  if (shown === null || !searchText()) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = `${shown} of ${total}`;
  el.classList.remove('hidden');
}

function dispatchSearchQuery(query, submitted) {
  const q = query.toLowerCase();
  updateSearchChrome();
  if (currentView !== 'map') hideSuggestions();

  if (currentView === 'database') {
    searchQuery = query;
    filterDatabaseView(q);
  } else if (currentView === 'leases') {
    leaseSearch = q;
    renderLeaseRange();
  } else if (currentView === 'dsa') {
    dsaFilter = q;
    renderDsaList();
  } else if (currentView === 'map') {
    mapSearch(q, submitted);
  }
}

function filterDatabaseView(q) {
  const tbody = document.getElementById('masterTableTbody');
  if (!tbody) return;
  if (activeEntityTab === 'mines') {
    const list = filterMines(q);
    renderMinesTable(list);
    if (q) setSearchCount(list.length, currentMinesList.length);
  } else {
    tbody.querySelector('tr.search-empty')?.remove();
    const rows = [...tbody.querySelectorAll('tr')];
    let shown = 0;
    rows.forEach((row) => {
      const hit = !q || row.textContent.toLowerCase().includes(q);
      row.classList.toggle('hidden', !hit);
      if (hit) shown++;
    });
    if (q) {
      setSearchCount(shown, rows.length);
      if (shown === 0) {
        const cols = document.querySelectorAll('#masterGridTable thead th').length || 1;
        tbody.insertAdjacentHTML('beforeend', `<tr class="search-empty"><td colspan="${cols}">No ${escapeHtml((ENTITY_SCOPE[activeEntityTab] || 'records').toLowerCase())} match “${escapeHtml(q)}”. <button type="button" class="btn-link-inline" data-clear-search>Clear search</button></td></tr>`);
      }
    }
  }
  highlightMatches(tbody, q);
}

/** Re-run the current query after a table re-renders (e.g. switching entity tabs) */
function reapplySearch() {
  if (currentView === 'database' && searchText()) dispatchSearchQuery(searchText(), false);
}

function mapSearch(q, submitted) {
  if (!q) {
    hideSuggestions();
    return;
  }
  const matches = filterMines(q);
  setSearchCount(matches.length, currentMinesList.length);
  if (submitted) {
    // Only trust the highlighted suggestion if the list was built for this exact query
    const pick = (suggestQuery === q && suggestItems[suggestIndex]) || matches[0];
    if (pick) chooseMine(pick);
    else showToast(`No mine matches “${q}”`, 'warning');
    return;
  }
  showSuggestions(matches.slice(0, 5), q);
}

function showSuggestions(list, q) {
  const box = document.getElementById('searchSuggest');
  if (!box) return;
  suggestItems = list;
  suggestQuery = q;
  suggestIndex = list.length ? 0 : -1;
  box.innerHTML = list.length
    ? list
        .map((m, i) => `<li role="option" id="suggest-${i}" data-index="${i}" class="search-suggest-item">
            <span class="suggest-name">${highlightText(m.mineName, q)}</span>
            <span class="suggest-meta">${highlightText(m.primaryMineral, q)} · ${highlightText(m.stateDistrict, q)}</span>
          </li>`)
        .join('')
    : `<li class="search-suggest-empty">No mines match “${escapeHtml(q)}”</li>`;
  box.classList.remove('hidden');
  searchInput()?.setAttribute('aria-expanded', 'true');
  renderSuggestActive();
}

function renderSuggestActive() {
  const box = document.getElementById('searchSuggest');
  box?.querySelectorAll('[data-index]').forEach((li) => {
    const on = Number(li.dataset.index) === suggestIndex;
    li.classList.toggle('active', on);
    li.setAttribute('aria-selected', String(on));
  });
  const input = searchInput();
  if (input) {
    if (suggestIndex >= 0) input.setAttribute('aria-activedescendant', `suggest-${suggestIndex}`);
    else input.removeAttribute('aria-activedescendant');
  }
}

function hideSuggestions() {
  document.getElementById('searchSuggest')?.classList.add('hidden');
  searchInput()?.setAttribute('aria-expanded', 'false');
  searchInput()?.removeAttribute('aria-activedescendant');
  suggestItems = [];
  suggestQuery = '';
  suggestIndex = -1;
}

function chooseMine(mine) {
  if (!mine) return;
  hideSuggestions();
  searchInput()?.blur();
  locateMineOnMap(mine);
}

function clearSearch() {
  const input = searchInput();
  if (input) input.value = '';
  dispatchSearchQuery('', false);
}

/** Called on every view switch: empty the bar and undo any filtering it applied */
function resetSearchForView() {
  updateSearchScope();
  const input = searchInput();
  if (input) input.value = '';
  if (searchQuery) {
    searchQuery = '';
    filterDatabaseView('');
  }
  if (leaseSearch) {
    leaseSearch = '';
    renderLeaseRange();
  }
  if (dsaFilter) {
    dsaFilter = '';
    renderDsaList();
  }
  hideSuggestions();
  updateSearchChrome();
  document.body.classList.remove('search-open');
}

/** Escaped text with the first match of q wrapped in <mark> */
function highlightText(text, q) {
  const value = String(text ?? '');
  const i = q ? value.toLowerCase().indexOf(q) : -1;
  if (i === -1) return escapeHtml(value);
  return `${escapeHtml(value.slice(0, i))}<mark class="search-hit">${escapeHtml(value.slice(i, i + q.length))}</mark>${escapeHtml(value.slice(i + q.length))}`;
}

/** Wrap every match of q in the container's text (skipping buttons and icons); removes old marks first */
function highlightMatches(container, q) {
  if (!container) return;
  container.querySelectorAll('mark.search-hit').forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
  container.normalize();
  if (!q) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement.closest('button, svg') || !node.nodeValue.toLowerCase().includes(q)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    const frag = document.createDocumentFragment();
    let from = 0;
    let at;
    while ((at = lower.indexOf(q, from)) !== -1) {
      frag.append(text.slice(from, at));
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = text.slice(at, at + q.length);
      frag.append(mark);
      from = at + q.length;
    }
    frag.append(text.slice(from));
    node.replaceWith(frag);
  });
}

// ============================================================================
// 13. DSA guide: renders from dsa/registry.js
// ============================================================================
const dsaLive = { bst: null, route: null, mst: null };
let dsaSelected = DSA_CONCEPTS[0].id;
let dsaFilter = '';
const dsaSourceCache = new Map();

function initDsaView() {
  document.getElementById('dsaList')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-dsa-id]');
    if (!item) return;
    dsaSelected = item.dataset.dsaId;
    renderDsaView();
  });
}

function dsaMatches(c, q) {
  return !q || [c.name, c.group, c.summary, c.usedIn, c.file].some((f) => f.toLowerCase().includes(q));
}

function renderDsaList() {
  const list = document.getElementById('dsaList');
  if (!list) return;
  const visible = DSA_CONCEPTS.filter((c) => dsaMatches(c, dsaFilter));
  if (dsaFilter) setSearchCount(visible.length, DSA_CONCEPTS.length);
  if (visible.length === 0) {
    list.innerHTML = `<p class="dsa-muted">No concepts match “${escapeHtml(dsaFilter)}”. <button type="button" class="btn-link-inline" data-clear-search>Clear search</button></p>`;
    return;
  }
  list.innerHTML = DSA_GROUPS.map((group) => {
    const items = visible.filter((c) => c.group === group);
    if (items.length === 0) return '';
    return `<div class="dsa-group">
        <h2 class="dsa-group-title">${escapeHtml(group)}</h2>
        ${items
          .map((c) => `<button type="button" class="dsa-item${c.id === dsaSelected ? ' active' : ''}" data-dsa-id="${c.id}"${c.id === dsaSelected ? ' aria-current="true"' : ''}>${highlightText(c.name, dsaFilter)}</button>`)
          .join('')}
      </div>`;
  }).join('');
}

function renderDsaView() {
  renderDsaList();
  renderDsaDetail(DSA_CONCEPTS.find((c) => c.id === dsaSelected) || DSA_CONCEPTS[0]);
}

function renderDsaDetail(c) {
  const box = document.getElementById('dsaDetail');
  if (!box) return;
  const live = DSA_LIVE[c.id]?.();
  const liveHtml = Array.isArray(live)
    ? `<dl class="dsa-live">${live.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>`
    : `<p class="dsa-muted">${escapeHtml(DSA_LIVE_HINT[c.id] || 'Nothing recorded yet.')}</p>`;

  box.innerHTML = `
    <p class="dsa-kicker">${escapeHtml(c.group)}</p>
    <h2 class="dsa-title">${escapeHtml(c.name)}</h2>
    <p class="dsa-summary">${escapeHtml(c.summary)}</p>

    <section class="dsa-section dsa-used">
      <div>
        <h3>Where MINERVA uses it</h3>
        <p>${escapeHtml(c.usedIn)}</p>
      </div>
      <button type="button" class="btn-bst-search" id="dsaTryBtn">Try it</button>
    </section>

    <section class="dsa-section">
      <h3>Operations</h3>
      <table class="dsa-ops">
        <thead><tr><th>Operation</th><th>Time</th><th>Space</th></tr></thead>
        <tbody>${c.ops.map(([op, t, sp]) => `<tr><td>${escapeHtml(op)}</td><td class="mono">${escapeHtml(t)}</td><td class="mono">${escapeHtml(sp)}</td></tr>`).join('')}</tbody>
      </table>
    </section>

    <section class="dsa-section">
      <h3>Demo</h3>
      <div class="dsa-demo" id="dsaDemo"></div>
    </section>

    <section class="dsa-section">
      <h3>In this session</h3>
      ${liveHtml}
    </section>

    <section class="dsa-section">
      <h3>Source <span class="dsa-file">dsa/${escapeHtml(c.file)} · ${escapeHtml(c.symbol)}</span></h3>
      <pre class="dsa-code" id="dsaCode">Loading…</pre>
    </section>`;

  document.getElementById('dsaTryBtn').addEventListener('click', () => DSA_TRY[c.id]?.());
  DSA_DEMOS[c.id]?.(document.getElementById('dsaDemo'));
  loadDsaSource(c);
}

async function loadDsaSource(c) {
  const pre = document.getElementById('dsaCode');
  try {
    if (!dsaSourceCache.has(c.file)) dsaSourceCache.set(c.file, await apiService.getDsaSource(c.file));
    // The user may have picked another concept while this loaded
    if (document.getElementById('dsaCode') !== pre) return;
    pre.textContent = excerptSymbol(dsaSourceCache.get(c.file), c.symbol);
  } catch (err) {
    pre.textContent = `Could not load dsa/${c.file}: ${err.message}`;
  }
}

/** The declaration of `symbol` (class, function or method) with its doc comment, brace-matched */
function excerptSymbol(src, symbol, maxLines = 48) {
  const lines = src.split('\n');
  const decl = new RegExp(`^\\s*(export\\s+)?(default\\s+)?(class|function)\\s+${symbol}\\b|^\\s+${symbol}\\s*\\(`);
  const start = lines.findIndex((l) => decl.test(l));
  if (start === -1) return lines.slice(0, maxLines).join('\n');

  let end = start;
  let depth = 0;
  let opened = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') {
        depth++;
        opened = true;
      } else if (ch === '}') {
        depth--;
      }
    }
    end = i;
    if (opened && depth <= 0) break;
  }

  let top = start;
  while (top > 0 && /^\s*(\/\*\*|\*|\/\/)/.test(lines[top - 1])) top--;

  const out = lines.slice(top, end + 1);
  const indent = Math.min(...out.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
  const trimmed = out.map((l) => l.slice(indent));
  return trimmed.length > maxLines ? `${trimmed.slice(0, maxLines).join('\n')}\n// …` : trimmed.join('\n');
}

// --- Live numbers: real state of the running app -----------------------------
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function mstLive(algorithm) {
  const r = dsaLive.mst;
  if (!r || r.algorithm !== algorithm) return null;
  const rows = [
    ['Network length', `${r.totalKm.toLocaleString()} km`],
    ['Links chosen', r.edges.length],
    ['Linking every pair instead', `${r.allPairsKm.toLocaleString()} km`],
  ];
  if (algorithm === 'kruskal') rows.push(['Links skipped (would close a loop)', r.cycleEdgesRejected]);
  return rows;
}

const DSA_LIVE = {
  stack: () => [
    ['Queries in the history stack', sqlHistory.history.size()],
    ['Queries in the redo stack', sqlHistory.redo.size()],
  ],
  queue: () => [
    ['Alerts in the history queue', alertQueue.log.size()],
    ['Queue capacity', alertQueue.logLimit],
  ],
  'priority-queue': () => [
    ['Alerts waiting in the heap', alertQueue.pending.size()],
    ['Showing now', alertQueue.current ? `${alertQueue.current.label}: ${alertQueue.current.message}` : 'nothing'],
  ],
  bst: () =>
    dsaLive.bst && [
      ['Last search', `${dsaLive.bst.attributeLabel} ${dsaLive.bst.min}–${dsaLive.bst.max}%`],
      ['Nodes checked', `${dsaLive.bst.bstComparisons} of ${dsaLive.bst.size} (a linear scan checks ${dsaLive.bst.linearComparisons})`],
      ['Tree height', dsaLive.bst.height],
    ],
  avl: () =>
    leaseIndex.size() > 0 && [
      ['Leases in the index', leaseIndex.size()],
      ['Height', leaseIndex.height()],
      ['Rotations so far', leaseIndex.totalRotations],
    ],
  graph: () =>
    networkState.nodes.length > 0 && [
      ['Mines (nodes)', networkState.nodes.length],
      ['Corridors (edges)', networkState.edges.length],
    ],
  dijkstra: () => {
    const r = dsaLive.route;
    if (!r || !r.reachable) return null;
    return [
      ['Last route', `${r.path[0].name} → ${r.path[r.path.length - 1].name}`],
      ['Length', `${r.distanceKm.toLocaleString()} km in ${plural(r.hops.length, 'hop')}`],
      ['Mines settled', `${r.nodesSettled} of ${networkState.nodes.length}`],
    ];
  },
  prim: () => mstLive('prim'),
  kruskal: () => mstLive('kruskal'),
  'union-find': () => mstLive('kruskal'),
};

const DSA_LIVE_HINT = {
  bst: 'Run an assay search on the Minerals tab (or press Try it).',
  avl: 'Lease data is still loading.',
  graph: 'Map data is still loading.',
  dijkstra: 'Find a route on the map (or press Try it).',
  prim: "Build the minimum network with Prim's on the map (or press Try it).",
  kruskal: "Build the minimum network with Kruskal's on the map (or press Try it).",
  'union-find': "Build the minimum network with Kruskal's on the map (or press Try it).",
};

// --- "Try it": open the feature, already set up ------------------------------
function setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (el && [...el.options].some((o) => o.value === value)) el.value = value;
}

function openNetworkTab(tab, then) {
  switchView('map', true);
  switchNetworkTab(tab);
  if (!then) return;
  if (networkState.nodes.length === 0) {
    showToast('Map data is still loading. Try again in a moment.', 'warning');
    return;
  }
  setTimeout(then, 150);
}

function runMstWith(algorithm) {
  const sel = document.getElementById('mstAlgorithm');
  if (sel) {
    sel.value = algorithm;
    sel.dispatchEvent(new Event('change'));
  }
  document.getElementById('mstForm')?.requestSubmit();
}

const DSA_TRY = {
  stack: () => {
    switchView('database', true);
    document.getElementById('sqlConsoleModal')?.showModal();
    document.getElementById('sqlInput')?.focus();
  },
  // The bell menu closes on any outside click, so open it after this click finishes
  queue: () => setTimeout(openAlertsPanel, 0),
  'priority-queue': () => setTimeout(openAlertsPanel, 0),
  bst: () => {
    switchView('database', true);
    setSelectValue('bstAttr', 'fe_pct');
    document.getElementById('bstMin').value = 50;
    document.getElementById('bstMax').value = 70;
    if (activeEntityTab === 'minerals') runBstSearch();
    else document.querySelector('.entity-tab-btn[data-tab="minerals"]')?.click();
  },
  avl: () => switchView('leases', true),
  graph: () => openNetworkTab('route'),
  dijkstra: () =>
    openNetworkTab('route', () => {
      setSelectValue('routeFrom', 'MN-1104');
      setSelectValue('routeTo', 'MN-0887');
      document.getElementById('routeForm')?.requestSubmit();
    }),
  prim: () => openNetworkTab('mst', () => runMstWith('prim')),
  kruskal: () => openNetworkTab('mst', () => runMstWith('kruskal')),
  'union-find': () => openNetworkTab('mst', () => runMstWith('kruskal')),
};

// --- Step-by-step demos (they use the real dsa/ classes) ----------------------
function demoShell(container, buttons) {
  const bar = document.createElement('div');
  bar.className = 'dsa-demo-controls';
  const controls = {};
  buttons.forEach(([key, label, fn]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-sql-history';
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.append(b);
    controls[key] = b;
  });
  const stage = document.createElement('div');
  stage.className = 'dsa-demo-stage';
  const msg = document.createElement('p');
  msg.className = 'dsa-demo-msg';
  msg.setAttribute('aria-live', 'polite');
  container.replaceChildren(bar, stage, msg);
  return { stage, msg, controls };
}

const cells = (items, tagOf) =>
  items
    .map((v, i) => {
      const tag = tagOf(i);
      return `<li class="demo-cell${tag ? ' marked' : ''}">${escapeHtml(v)}${tag ? `<span class="demo-tag">${tag}</span>` : ''}</li>`;
    })
    .join('');

function stackDemo(container) {
  const stack = new Stack();
  let n = 0;
  const ui = demoShell(container, [
    ['push', 'Push', () => {
      if (stack.size() >= 6) return draw('The demo stops at 6 items. Pop one first.');
      stack.push(`Q${++n}`);
      draw(`Pushed Q${n} on top.`);
    }],
    ['pop', 'Pop', () => {
      const v = stack.pop();
      draw(v ? `Popped ${v}: the last item in is the first out.` : 'The stack is empty.');
    }],
  ]);
  function draw(message) {
    const items = stack.toArray().reverse();
    ui.stage.innerHTML = items.length
      ? `<ol class="demo-stack">${cells(items, (i) => (i === 0 ? 'top' : ''))}</ol>`
      : '<p class="dsa-muted">Empty</p>';
    ui.msg.textContent = message;
  }
  stack.push(`Q${++n}`);
  stack.push(`Q${++n}`);
  draw('Two queries have run. Push runs another; Pop is Undo.');
}

function queueDemo(container) {
  const queue = new Queue();
  let n = 0;
  const ui = demoShell(container, [
    ['enqueue', 'Enqueue', () => {
      if (queue.size() >= 6) return draw('The demo stops at 6 items. Dequeue one first.');
      queue.enqueue(`A${++n}`);
      draw(`A${n} joined at the back.`);
    }],
    ['dequeue', 'Dequeue', () => {
      const v = queue.dequeue();
      draw(v ? `${v} left from the front: first in, first out.` : 'The queue is empty.');
    }],
  ]);
  function draw(message) {
    const items = queue.toArray();
    const last = items.length - 1;
    ui.stage.innerHTML =
      (items.length
        ? `<ol class="demo-queue">${cells(items, (i) => (i === 0 && i === last ? 'front · back' : i === 0 ? 'front' : i === last ? 'back' : ''))}</ol>`
        : '<p class="dsa-muted">Empty</p>') +
      `<p class="dsa-muted">head index ${queue._head}, tail index ${queue._tail}. Dequeue only moves the head, so nothing shifts.</p>`;
    ui.msg.textContent = message;
  }
  ['A1', 'A2', 'A3'].forEach((v) => queue.enqueue(v));
  n = 3;
  draw('Three alerts waiting. The front one leaves first.');
}

function priorityQueueDemo(container) {
  const pq = new PriorityQueue();
  const LETTER = { [AlertPriority.CRITICAL]: 'C', [AlertPriority.WARNING]: 'W', [AlertPriority.INFO]: 'I' };
  let n = 0;
  const add = (p) => {
    const label = `${LETTER[p]}${++n}`;
    pq.enqueue(label, p);
    return label;
  };
  const ui = demoShell(container, [
    ['c', 'Add CRITICAL', () => draw(`Added ${add(AlertPriority.CRITICAL)}: it sifts up past less urgent parents.`)],
    ['w', 'Add WARNING', () => draw(`Added ${add(AlertPriority.WARNING)}.`)],
    ['i', 'Add INFO', () => draw(`Added ${add(AlertPriority.INFO)}.`)],
    ['d', 'Dequeue', () => {
      const v = pq.dequeue();
      draw(v ? `Took ${v} from index 0: always the most urgent. The last item moved to the root and sifted down.` : 'The heap is empty.');
    }],
  ]);
  function draw(message) {
    const heap = pq._heap;
    const toTree = (i) =>
      i < heap.length ? { id: i, key: heap[i].value, label: `[${i}]`, left: toTree(2 * i + 1), right: toTree(2 * i + 2) } : null;
    ui.stage.innerHTML = heap.length
      ? `<ol class="demo-queue demo-array">${cells(heap.map((h) => h.value), (i) => `[${i}]`)}</ol><div class="bst-tree-wrap"><svg class="bst-tree"></svg></div>`
      : '<p class="dsa-muted">Empty heap</p>';
    const svg = ui.stage.querySelector('svg');
    if (svg) {
      drawTree(svg, toTree(0), {
        classOf: (node) => (node.id === 0 ? 'match' : 'visited'),
        keyOf: (node) => node.key,
        labelOf: (node) => node.label,
        titleOf: (node) => `${node.key} at index ${node.label}`,
        colW: 60,
      });
    }
    ui.msg.textContent = `${message} C = critical, W = warning, I = info; the number is arrival order.`;
  }
  add(AlertPriority.INFO);
  add(AlertPriority.WARNING);
  add(AlertPriority.INFO);
  add(AlertPriority.CRITICAL);
  draw('Four alerts arrived in the order I1, W2, I3, C4.');
}

function treeCompareDemo(container) {
  const SORTED = [10, 20, 30, 40, 50, 60, 70];
  const MIXED = [40, 20, 60, 10, 30, 50, 70];
  let keys = SORTED;
  let next = 0;
  let bst;
  let avl;
  const reset = () => {
    bst = new BinarySearchTree();
    avl = new AVLTree();
    next = 0;
  };
  const insertNext = () => {
    if (next >= keys.length) return false;
    const k = keys[next++];
    bst.insert(k, null);
    avl.insert(k, null);
    return k;
  };
  const ui = demoShell(container, [
    ['step', 'Insert next', () => {
      const k = insertNext();
      if (k === false) return draw('All keys inserted. Reset to start again.');
      draw(`Inserted ${k}. AVL: ${describeRotations(avl.lastRotations.map((r) => ({ ...r, pivot: String(r.pivot) })))}.`);
    }],
    ['all', 'Insert all', () => {
      while (insertNext() !== false);
      draw(`All keys inserted. ${avl.totalRotations} AVL rotations in total.`);
    }],
    ['order', 'Use mixed order', () => {
      keys = keys === SORTED ? MIXED : SORTED;
      ui.controls.order.textContent = keys === SORTED ? 'Use mixed order' : 'Use sorted order';
      reset();
      draw(`Order: ${keys.join(', ')}.`);
    }],
    ['reset', 'Reset', () => {
      reset();
      draw(`Order: ${keys.join(', ')}.`);
    }],
  ]);
  function draw(message) {
    ui.stage.innerHTML = `<div class="demo-pair">
        <div><p class="demo-caption">Binary search tree · height ${bst.height()}</p><div class="bst-tree-wrap"><svg class="bst-tree" data-tree="bst"></svg></div></div>
        <div><p class="demo-caption">AVL tree · height ${avl.height()}</p><div class="bst-tree-wrap"><svg class="bst-tree" data-tree="avl"></svg></div></div>
      </div>`;
    const opts = { classOf: () => 'visited', keyOf: (n) => n.key, labelOf: () => '', titleOf: (n) => String(n.key), colW: 40 };
    if (bst.size()) drawTree(ui.stage.querySelector('[data-tree="bst"]'), bst.toJSON(), opts);
    if (avl.size()) {
      drawTree(ui.stage.querySelector('[data-tree="avl"]'), avl.toJSON(), {
        ...opts,
        badgeOf: (n) => (n.balance > 0 ? `+${n.balance}` : String(n.balance)),
      });
    }
    ui.msg.textContent = message;
  }
  reset();
  draw(`Same keys into both trees. Sorted input (${SORTED.join(', ')}) is the worst case for a plain BST.`);
}

// A small fixed graph for the graph demos
const DEMO_POS = { A: [40, 50], B: [150, 22], C: [270, 45], D: [60, 160], E: [180, 125], F: [300, 160] };
const DEMO_EDGES = [
  ['A', 'B', 4], ['A', 'D', 2], ['B', 'C', 5], ['B', 'E', 3], ['D', 'E', 6],
  ['C', 'E', 4], ['C', 'F', 7], ['E', 'F', 2], ['B', 'D', 3],
];
const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function demoGraph() {
  const g = new Graph();
  Object.keys(DEMO_POS).forEach((k) => g.addNode(k));
  DEMO_EDGES.forEach(([a, b, w]) => g.addEdge(a, b, w));
  return g;
}

function drawDemoGraph(stage, { nodeClass = () => '', edgeClass = () => '', nodeNote = () => '' } = {}) {
  const edges = DEMO_EDGES.map(([a, b, w]) => {
    const [x1, y1] = DEMO_POS[a];
    const [x2, y2] = DEMO_POS[b];
    return `<g class="demo-edge ${edgeClass(edgeKey(a, b))}">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
        <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 5}">${w}</text>
      </g>`;
  }).join('');
  const nodes = Object.entries(DEMO_POS).map(([id, [x, y]]) => {
    const note = nodeNote(id);
    return `<g class="demo-node ${nodeClass(id)}">
        <circle cx="${x}" cy="${y}" r="14"/>
        <text x="${x}" y="${y + 4}">${id}</text>
        ${note !== '' ? `<text class="demo-note" x="${x}" y="${y + 30}">${escapeHtml(note)}</text>` : ''}
      </g>`;
  }).join('');
  stage.innerHTML = `<svg class="demo-graph" viewBox="0 0 340 200" role="img" aria-label="Example graph">${edges}${nodes}</svg>`;
}

function graphDemo(container) {
  const g = demoGraph();
  const ids = Object.keys(DEMO_POS);
  let at = -1;
  const ui = demoShell(container, [
    ['next', 'Next node', () => {
      at = (at + 1) % ids.length;
      draw();
    }],
  ]);
  function draw() {
    const id = ids[at];
    const nbrs = id ? g.neighbours(id) : new Map();
    drawDemoGraph(ui.stage, {
      nodeClass: (n) => (n === id ? 'current' : nbrs.has(n) ? 'reached' : ''),
      edgeClass: (k) => (id && k.split('|').includes(id) ? 'on' : ''),
    });
    ui.stage.insertAdjacentHTML(
      'beforeend',
      `<pre class="demo-adj">${ids.map((n) => `${n} → ${[...g.neighbours(n)].map(([v, w]) => `${v} ${w}`).join(', ')}`).join('\n')}</pre>`
    );
    ui.msg.textContent = id
      ? `${id} has ${plural(nbrs.size, 'neighbour')}: reading its adjacency list costs O(${nbrs.size}).`
      : 'The adjacency list stores, for each node, its neighbours and edge weights.';
  }
  draw();
}

function dijkstraDemo(container) {
  const g = demoGraph();
  const run = dijkstra(g, 'A', 'F');
  const dist = Object.fromEntries(Object.keys(DEMO_POS).map((n) => [n, dijkstra(g, 'A', n).distance]));
  let shown = 0;
  const pathEdges = new Set(run.path.slice(1).map((n, i) => edgeKey(run.path[i], n)));
  const ui = demoShell(container, [
    ['step', 'Step', () => {
      if (shown < run.settledOrder.length) shown++;
      draw();
    }],
    ['all', 'Run to F', () => {
      shown = run.settledOrder.length;
      draw();
    }],
    ['reset', 'Reset', () => {
      shown = 0;
      draw();
    }],
  ]);
  function draw() {
    const settled = new Set(run.settledOrder.slice(0, shown));
    const done = shown === run.settledOrder.length;
    drawDemoGraph(ui.stage, {
      nodeClass: (n) => (done && run.path.includes(n) ? 'current' : settled.has(n) ? 'reached' : ''),
      edgeClass: (k) => (done && pathEdges.has(k) ? 'on' : ''),
      nodeNote: (n) => (settled.has(n) ? String(dist[n]) : ''),
    });
    if (shown === 0) ui.msg.textContent = 'Find the shortest path from A to F. Each step settles the closest unsettled node.';
    else if (!done) {
      const n = run.settledOrder[shown - 1];
      ui.msg.textContent = `Settled ${n} at distance ${dist[n]} (taken from the front of the priority queue).`;
    } else {
      ui.msg.textContent = `F settled: shortest path ${run.path.join(' → ')} = ${run.distance}. ${shown} of 6 nodes were settled.`;
    }
  }
  draw();
}

function primDemo(container) {
  const g = demoGraph();
  const mst = primMST(g, 'A');
  let shown = 0;
  const ui = demoShell(container, [
    ['step', 'Add edge', () => {
      if (shown < mst.edges.length) shown++;
      draw();
    }],
    ['all', 'Finish', () => {
      shown = mst.edges.length;
      draw();
    }],
    ['reset', 'Reset', () => {
      shown = 0;
      draw();
    }],
  ]);
  function draw() {
    const chosen = mst.edges.slice(0, shown);
    const inTree = new Set(['A', ...chosen.flatMap((e) => [e.from, e.to])]);
    const keys = new Set(chosen.map((e) => edgeKey(e.from, e.to)));
    drawDemoGraph(ui.stage, {
      nodeClass: (n) => (inTree.has(n) ? 'reached' : ''),
      edgeClass: (k) => (keys.has(k) ? 'on' : ''),
    });
    if (shown === 0) ui.msg.textContent = 'Start from A. Each step adds the cheapest edge leaving the tree.';
    else {
      const e = chosen[shown - 1];
      const total = chosen.reduce((sum, x) => sum + x.weight, 0);
      ui.msg.textContent = `Added ${e.from}–${e.to} (${e.weight}). Tree total: ${total}.${shown === mst.edges.length ? ' All 6 nodes connected with 5 edges.' : ''}`;
    }
  }
  draw();
}

function kruskalDemo(container, showGroups = false) {
  const g = demoGraph();
  const sorted = g.edges().sort((a, b) => a.weight - b.weight);
  let uf;
  let status;
  let i;
  const reset = () => {
    uf = new UnionFind(Object.keys(DEMO_POS));
    status = new Map();
    i = 0;
  };
  const step = () => {
    if (i >= sorted.length || uf.components === 1) return null;
    const e = sorted[i++];
    const ok = uf.union(e.from, e.to);
    status.set(edgeKey(e.from, e.to), ok ? 'on' : 'rejected');
    return { e, ok };
  };
  const ui = demoShell(container, [
    ['step', 'Next edge', () => draw(step())],
    ['all', 'Finish', () => {
      let last = null;
      for (let r = step(); r; r = step()) last = r;
      draw(last);
    }],
    ['reset', 'Reset', () => {
      reset();
      draw(null);
    }],
  ]);
  function groups() {
    const by = new Map();
    Object.keys(DEMO_POS).forEach((n) => {
      const root = uf.find(n);
      by.set(root, [...(by.get(root) || []), n]);
    });
    return [...by.values()].map((m) => `{${m.join(', ')}}`).join(' ');
  }
  function draw(result) {
    drawDemoGraph(ui.stage, { edgeClass: (k) => status.get(k) || '' });
    ui.stage.insertAdjacentHTML(
      'beforeend',
      `<ol class="demo-edge-list">${sorted
        .map((e) => {
          const st = status.get(edgeKey(e.from, e.to));
          return `<li class="${st || ''}">${e.from}–${e.to} <span class="mono">${e.weight}</span>${st === 'on' ? ' taken' : st === 'rejected' ? ' skipped' : ''}</li>`;
        })
        .join('')}</ol>${showGroups ? `<p class="demo-caption">Groups: ${groups()}</p>` : ''}`
    );
    if (!result && uf.components === 1) {
      ui.msg.textContent = `Done: ${status.size} edges tried, ${[...status.values()].filter((v) => v === 'rejected').length} skipped. One group connects all 6 nodes.`;
    } else if (!result) {
      ui.msg.textContent = 'Edges are tried shortest first. An edge is taken only if its ends are in different groups.';
    } else if (result.ok) {
      ui.msg.textContent = `Took ${result.e.from}–${result.e.to} (${result.e.weight}): union() merged two groups.${uf.components === 1 ? ' One group left: done.' : ''}`;
    } else {
      ui.msg.textContent = `Skipped ${result.e.from}–${result.e.to} (${result.e.weight}): find() gives the same root for both ends, so it would close a loop.`;
    }
  }
  reset();
  draw(null);
}

const DSA_DEMOS = {
  stack: stackDemo,
  queue: queueDemo,
  'priority-queue': priorityQueueDemo,
  bst: treeCompareDemo,
  avl: treeCompareDemo,
  graph: graphDemo,
  dijkstra: dijkstraDemo,
  prim: primDemo,
  kruskal: (c) => kruskalDemo(c, false),
  'union-find': (c) => kruskalDemo(c, true),
};

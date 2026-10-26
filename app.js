/**
 * MINERVA — National Mineral Geospatial Intelligence Grid
 * Production Geospatial System Synthesizing Image 1 (UI Chrome) & Image 2 (LUMINA Basemap)
 */

import apiService from './apiService.js';

// ============================================================================
// 0. Toasts: one at a time, a new message replaces the one showing
// ============================================================================
let toastTimer = null;

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  el.addEventListener('click', clearToast);
  container.replaceChildren(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(clearToast, 2800);
}

function clearToast() {
  clearTimeout(toastTimer);
  document.getElementById('toastContainer')?.replaceChildren();
}

// ============================================================================
// 1. Map state
// ============================================================================
let map;
let mineLayer;
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
    // Smooth wheel/trackpad zoom: fractional levels, and more scrolling per level
    // (the defaults jump a whole level per small trackpad movement)
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 120,
    wheelDebounceTime: 60,
    zoomControl: false, // We use custom Image 1 top-right floating controls
    attributionControl: false, // added below with the data sources' required credits
  });

  mineLayer = L.layerGroup().addTo(map);
  L.control
    .attribution({ position: 'bottomright', prefix: false })
    .addAttribution('Mines © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL), <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> · Imagery © Esri')
    .addTo(map);

  // Basemap Tiles: Esri High-Resolution World Imagery
  setBasemap('satellite');

  // Setup DOM Event Listeners
  setupEventListeners();

  // The mines load after sign-in (loadAppData)
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
  const src = document.getElementById('inspectSource');
  const chip = document.getElementById('inspectCategory');

  if (t) t.textContent = node.name;
  if (sub) sub.textContent = `${node.district}, ${node.state}`;
  if (chip) chip.textContent = node.isSample ? `${node.status} · sample record` : node.status;
  if (c) c.textContent = node.company || 'Not recorded';
  if (m) m.textContent = node.mineral;
  if (l) l.textContent = node.leaseId;
  if (y) y.textContent = node.yield;
  if (src) src.innerHTML = sourceLink(node.source);

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
    // By id: many imported mines share a name ("Unnamed coal mine")
    const match = appState.activeNode && currentMinesList.find((m) => m.mineId === appState.activeNode.id);
    if (match) selectMine(match);
  });
}

// ============================================================================
// 8. Event Handlers, Cascading Filters & Reactive Camera
// ============================================================================
function setupEventListeners() {
  // Top-right map controls
  document.getElementById('ctrlZoomIn').addEventListener('click', () => map.zoomIn(1));
  document.getElementById('ctrlZoomOut').addEventListener('click', () => map.zoomOut(1));
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
  document.getElementById('dockBtnSchema').addEventListener('click', () => switchView('schema', true));

  initSearch();
}

// ============================================================================
// 9. View Switcher (Mines & Concessions Master vs Geospatial Satellite Map vs Archival Reports)
// ============================================================================
// The signed-in user, from /api/auth/me or /api/auth/login. The session itself is an
// httpOnly cookie the page can't read; the server checks it on every API call.
let currentUser = null;
let appDataLoaded = false;

const isAuthenticated = () => currentUser !== null;
const can = (permission) => Boolean(currentUser?.permissions?.includes(permission));

function startSession(user) {
  currentUser = user;
  renderUserMenu();
  loadAppData();
}

/**
 * Forget the user locally and show the login page, with an optional message.
 * keepRoute: leave the URL as it was (session expired) so signing in returns there.
 */
function endSession(message, keepRoute = false) {
  // Signing back in should only need the PIN
  const idInput = document.getElementById('authIdentifierInput');
  if (idInput && currentUser) idInput.value = currentUser.username;
  currentUser = null;
  // Nothing from the previous user stays on screen
  clearToast();
  clearSqlConsole();
  closeSqlLog(true);
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  closeNavPanels();
  renderUserMenu();
  showAuthMessage(message);
  switchView('auth', !keepRoute);
}

async function signOut() {
  // Stop polling first: the session is gone once the server answers
  closeSqlLog(true);
  try {
    await apiService.logout();
  } catch {
    // The server may already have dropped the session; signing out locally is enough
  }
  endSession(null);
}

// Any API call answered 401 (session expired or revoked): back to the login page,
// remembering where the user was so signing in returns there
window.addEventListener('minerva:unauthorized', () => {
  if (!currentUser) return;
  postLoginView = currentView;
  endSession('Your session ended. Sign in again to continue.', true);
});

/** Data that needs a signed-in user; loaded once per page */
function loadAppData() {
  if (appDataLoaded) return;
  appDataLoaded = true;
  loadMinesData();
  initLeaseView();
}

const VIEWS = {
  map: { view: 'mapView', dock: 'dockBtnMap' },
  database: { view: 'databaseExplorerView', dock: 'dockBtnDatabase' },
  leases: { view: 'leasesView', dock: 'dockBtnLeases' },
  schema: { view: 'schemaView', dock: 'dockBtnSchema' },
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
  if (viewName === 'schema') openSchemaView();

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
    [m.mineId, m.mineName, m.mineralRecorded === false ? '' : m.primaryMineral, m.stateDistrict, m.operatingLessee, m.dossier?.lease?.id]
      .some((field) => String(field || '').toLowerCase().includes(q))
  );
}

async function loadMinesData() {
  await fetchMinesData();
  drawMineDots();
  renderMinesTable(filterMines(searchQuery.toLowerCase()));
  const selected = currentMinesList.find((m) => m.mineId === selectedMineId) || currentMinesList[0];
  if (selected) updateDossier(selected);
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


  // Entity switcher tabs
  const tabButtons = document.querySelectorAll('.entity-tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      activeEntityTab = targetTab;

      // Update active styling
      tabButtons.forEach((b) => b.classList.toggle('active', b === btn));

      renderEntityView(targetTab).then(() => {
        updateSearchScope();
        reapplySearch();
      });
    });
  });

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
    initSqlConsole(sqlInput, sqlResultsBox, btnRunSql);
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
      <td class="td-mine-id">${escapeHtml(m.mineId)}</td>
      <td class="td-mine-name">${escapeHtml(m.mineName)}${m.isSample ? ' <span class="sample-tag" title="Synthetic sample record">sample</span>' : ''}</td>
      <td>
        <div class="td-mineral">
          <span class="mineral-dot ${dotClass}"></span>
          <span class="${m.mineralRecorded === false ? 'muted' : ''}">${escapeHtml(m.primaryMineral)}</span>
        </div>
      </td>
      <td>${escapeHtml(m.stateDistrict)}</td>
      <td class="${m.operatingLessee ? '' : 'muted'}">${escapeHtml(m.operatingLessee || '—')}</td>
      <td class="td-lease-val">${escapeHtml(m.leaseValidity || '—')}</td>
      <td>
        <span class="status-pill ${m.statusClass}">${escapeHtml(m.status)}</span>
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

  // Record: always shown
  const recordList = document.getElementById('recordList');
  if (recordList) {
    const rows = [
      ['Mineral', mine.mineralRecorded === false ? 'Not recorded' : mine.primaryMineral],
      ['Grade', d.gradeDescription],
      ['Type', mine.mineType && mine.mineType !== 'Unknown' ? mine.mineType : null],
      ['Status', mine.isSample ? `${mine.status} (sample record)` : mine.status],
      ['Operator', mine.operatingLessee],
      ['Location', PRECISION_LABEL[mine.precision] || null],
      ['Source', mine.source ? sourceLink(mine.source) : null, true],
    ].filter(([, v]) => v);
    recordList.innerHTML = rows
      .map(([k, v, html]) => `<div class="lease-kv-row"><span class="kv-label">${k}:</span><span class="kv-val">${html ? v : escapeHtml(v)}</span></div>`)
      .join('');
  }

  // Cards for facts the database may not hold for this mine
  const hasProduction = Boolean(d.production?.history?.length);
  const show = (id, on) => document.getElementById(id)?.classList.toggle('hidden', !on);
  show('assayCard', Boolean(d.assay));
  show('leaseCard', Boolean(d.lease));
  show('productionCard', hasProduction);
  show('clearanceCard', Boolean(d.clearance));
  const missing = [!d.assay && 'assay', !d.lease && 'lease', !hasProduction && 'production'].filter(Boolean);
  const missingEl = document.getElementById('dossierMissing');
  if (missingEl) {
    const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} or ${missing[missing.length - 1]}` : missing[0];
    missingEl.textContent = missing.length ? `No ${list} record${missing.length === 1 ? '' : 's'} in the database for this mine.` : '';
    missingEl.classList.toggle('hidden', missing.length === 0);
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
    leaseId: mine.dossier?.lease?.id || 'No lease record',
    yield: mine.dossier?.production?.history?.length ? mine.dossier.production.currentOutput : 'No records',
    status: mine.status,
    isSample: mine.isSample,
    source: mine.source,
  };
}

/** "OpenStreetMap ↗" link (or plain text for the sample data) */
function sourceLink(source) {
  if (!source) return '—';
  const label = escapeHtml(source.name);
  return source.url
    ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(source.licence || '')}">${label} ↗</a>`
    : label;
}

const PRECISION_LABEL = { exact: 'Exact (mapped site)', approximate: 'Approximate', district: 'District centre only' };


// Export Master Records to CSV (Streaming from backend API)
function exportMasterCsv() {
  window.open(apiService.getMinesExportUrl({ search: searchQuery }), '_blank');
  showToast(searchQuery ? `Exporting mines matching "${searchQuery}"` : 'Exporting all mines as CSV', 'success');
}

// Download Dossier as Text Report
function downloadMineDossier(mine) {
  const d = mine.dossier;
  const line = (label, value) => `${(label + ':').padEnd(20)} ${value ?? 'Not recorded'}`;
  const section = (title, body) => `\n${title}\n${'-'.repeat(60)}\n${body}\n`;
  const content = [
    `MINERVA — mine dossier`,
    '='.repeat(60),
    line('Mine ID', mine.mineId),
    line('Mine name', mine.mineName),
    line('Primary mineral', mine.primaryMineral),
    line('State & district', mine.stateDistrict),
    line('Operator', mine.operatingLessee),
    line('Status', mine.isSample ? `${mine.status} (synthetic sample record)` : mine.status),
    line('Coordinates', `${mine.coords.join(', ')} (${PRECISION_LABEL[mine.precision] || 'precision not recorded'})`),
    line('Source', mine.source ? `${mine.source.name}${mine.source.url ? ` — ${mine.source.url}` : ''}` : null),
    line('Licence', mine.source?.licence),
    section('ASSAY', d.assay
      ? [line('Fe', d.assay.fe), line('SiO2', d.assay.sio2), line('Al2O3', d.assay.al2o3), line('Phosphorus', d.assay.phosphorus), line('Moisture', d.assay.moisture)].join('\n')
      : 'No assay record.'),
    section('LEASE', d.lease
      ? [line('Lease ID', d.lease.id), line('Executed', d.lease.executed), line('Valid till', d.lease.validTill), line('Royalty rate', d.lease.royaltyRate), line('Area', d.lease.area)].join('\n')
      : 'No lease record.'),
    section('PRODUCTION', d.production?.history?.length
      ? [line('Latest', d.production.currentOutput), ...d.production.history.map((h) => `  FY ${h.year}: ${h.mt} MT`)].join('\n')
      : 'No production records.'),
    `Generated ${new Date().toISOString()}`,
    '',
  ].join('\n');

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

  document.getElementById('datasetCaption')?.classList.toggle('hidden', !tabName.startsWith('ds-'));
  if (tabName === 'mines') {
    renderMinesTable(filterMines(searchQuery.toLowerCase()));
    return;
  }
  if (tabName.startsWith('ds-')) {
    await renderDataset(tabName.slice(3));
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
        <tr>
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

// Mines on the map: one dot per mine, coloured by mineral
// Map dot fill per mineral family (same palette as the table's mineral dots)
const MINERAL_FILL = {
  rust: '#B85D36',
  teal: '#1B7A43',
  amber: '#D9822B',
  brown: '#704A33',
  gray: '#7A7269',
  coal: '#2B2622',
  gold: '#B8962E',
  stone: '#CFC3B1',
  atomic: '#5E6B8A',
  none: '#FFFFFF',
};

function drawMineDots() {
  if (!mineLayer) return;
  mineLayer.clearLayers();
  currentMinesList.forEach((mine) => {
    if (!Number.isFinite(mine.coords?.[0]) || !Number.isFinite(mine.coords?.[1])) return;
    const fill = MINERAL_FILL[mine.mineralDotColor] || MINERAL_FILL.none;
    L.circleMarker(mine.coords, { radius: 5, color: '#211A14', weight: 1.5, fillColor: fill, fillOpacity: 1 })
      .bindTooltip(`${mine.mineName} · ${mine.mineId}`, { direction: 'top', offset: [0, -6] })
      .on('click', () => openNodeInspector(mineToInspectorNode(mine)))
      .addTo(mineLayer);
  });
}

// Lease expiry view: every lease in the LEASE table, ordered by end date
let leaseRecords = [];
// Lower-case text typed in the search bar while the Lease expiry view is open
let leaseSearch = '';
// A tile click sets an exact date range; the year inputs and Find button set whole years
let leaseDateRange = null;

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const yearsUntil = (isoDate) => (new Date(isoDate) - new Date()) / YEAR_MS;

async function initLeaseView() {
  const form = document.getElementById('leaseQueryForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    leaseDateRange = null;
    renderLeaseRange();
  });
  document.getElementById('leaseResults')?.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-mine-id]');
    if (row) openMineInDatabase(row.dataset.mineId);
  });

  try {
    const [leases, companies, mines] = await Promise.all([
      apiService.getEntityTable('leases'),
      apiService.getEntityTable('companies'),
      apiService.getMines(),
    ]);
    const companyName = new Map((companies.data || []).map((c) => [c.company_id, c.company_name]));
    const mineByLease = new Map((mines.data || []).map((m) => [m.dossier?.lease?.id, m]));
    leaseRecords = (leases.data || [])
      .filter((l) => l.valid_till)
      .map((l) => {
        const mine = mineByLease.get(l.lease_id);
        return {
          ...l,
          company_name: companyName.get(l.company_id) || '',
          mine_id: mine?.mineId || null,
          mine_name: mine?.mineName || '',
        };
      })
      .sort((a, b) => a.valid_till.localeCompare(b.valid_till) || a.lease_id.localeCompare(b.lease_id));
  } catch (err) {
    const stats = document.getElementById('leaseRangeStats');
    if (stats) stats.textContent = `Could not load leases: ${err.message}`;
    return;
  }

  renderLeaseSummary();
  renderLeaseRange();
}

const isoDay = (d) => d.toISOString().slice(0, 10);
function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

/** Leases ending between two ISO days, both included */
const leasesEndingBetween = (min, max) => leaseRecords.filter((l) => l.valid_till >= min && l.valid_till <= max);

/** The four summary ranges. Counts and clicks both use these. */
function leaseTiles() {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  return [
    { label: 'Expired', min: '0000-01-01', max: isoDay(yesterday), text: `ended before ${isoDay(today)}` },
    ...[1, 5, 10].map((n) => ({
      label: `Within ${n} year${n === 1 ? '' : 's'}`,
      min: isoDay(today),
      max: isoDay(addYears(today, n)),
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
        <span class="lease-tile-count">${leasesEndingBetween(t.min, t.max).length}</span>
        <span class="lease-tile-label">${escapeHtml(t.label)}</span>
      </button>`)
    .join('') + `<p class="lease-summary-note">${nextExpiryNote()} · ${leaseRecords.length} leases, as of ${isoDay(new Date())}</p>`;
  box.querySelectorAll('.lease-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      leaseDateRange = tiles[Number(tile.dataset.tile)];
      document.getElementById('leaseFromYear').value = leaseDateRange.min.slice(0, 4) === '0000' ? 2000 : leaseDateRange.min.slice(0, 4);
      document.getElementById('leaseToYear').value = leaseDateRange.max.slice(0, 4);
      if (leaseSearch) clearSearch();
      renderLeaseRange();
    });
  });
}

/** Earliest lease that hasn't ended yet */
function nextExpiryNote() {
  const today = isoDay(new Date());
  const l = leaseRecords.find((x) => x.valid_till >= today);
  if (!l) return 'No lease ends after today';
  return `Next to expire: ${escapeHtml(l.lease_id)}${l.mine_name ? ` (${escapeHtml(l.mine_name)})` : ''} on ${escapeHtml(l.valid_till)}, in ${yearsUntil(l.valid_till).toFixed(1)} years`;
}

function renderLeaseRange() {
  const body = document.getElementById('leaseResults');
  const stats = document.getElementById('leaseRangeStats');
  if (!body) return;

  let hits;
  if (leaseSearch) {
    // Searching ignores the year range
    hits = leaseRecords.filter((l) =>
      [l.lease_id, l.mine_name, l.mine_id, l.company_name].some((f) => String(f || '').toLowerCase().includes(leaseSearch))
    );
    if (stats) stats.textContent = `${hits.length} lease${hits.length === 1 ? '' : 's'} match “${leaseSearch}” (year range ignored while searching)`;
    setSearchCount(hits.length, leaseRecords.length);
  } else if (leaseDateRange) {
    hits = leasesEndingBetween(leaseDateRange.min, leaseDateRange.max);
    if (stats) stats.textContent = `${hits.length} of ${leaseRecords.length} leases ${leaseDateRange.text}`;
  } else {
    const from = Number(document.getElementById('leaseFromYear')?.value);
    const to = Number(document.getElementById('leaseToYear')?.value);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
      body.innerHTML = '<tr class="search-empty"><td colspan="5">Enter a year range where From is not after To.</td></tr>';
      if (stats) stats.textContent = '';
      return;
    }
    hits = leasesEndingBetween(`${from}-01-01`, `${to}-12-31`);
    if (stats) stats.textContent = `${hits.length} of ${leaseRecords.length} leases end between ${from} and ${to}`;
  }

  if (hits.length === 0) {
    body.innerHTML = leaseSearch
      ? `<tr class="search-empty"><td colspan="5">No leases match “${escapeHtml(leaseSearch)}”. <button type="button" class="btn-link-inline" data-clear-search>Clear search</button></td></tr>`
      : '<tr class="search-empty"><td colspan="5">No leases end in this range.</td></tr>';
    return;
  }

  body.innerHTML = hits
    .map((l) => {
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

// SQL console: Run button or Ctrl/Cmd+Enter
function initSqlConsole(sqlInput, resultsBox, btnRun) {
  const run = () => executeSqlQuery(sqlInput.value.trim(), resultsBox);
  btnRun.addEventListener('click', run);
  sqlInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });
}

/** Empty the console's results (on sign-out) */
function clearSqlConsole() {
  const box = document.getElementById('sqlResultsBox');
  if (box) box.innerHTML = '<div class="sql-results-placeholder">Ready to execute query.</div>';
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
              const text = val !== null && typeof val === 'object' ? JSON.stringify(val) : String(val);
              const displayVal = val !== null && val !== undefined ? escapeHtml(text) : '<span style="color:#A0988E">NULL</span>';
              return `<td class="${isId ? 'td-mine-id' : ''}">${displayVal}</td>`;
            })
            .join('')}
        </tr>
      `
      )
      .join('');

    resultsContainer.innerHTML = `
      <div class="sql-results-meta">Query executed in ${res.executionTimeMs}ms &bull; ${res.rowCount} rows returned${res.truncated ? ' (first 1,000 shown)' : ''}</div>
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
function showAuthMessage(message) {
  const banner = document.getElementById('authErrorBanner');
  const text = document.getElementById('authErrorMessageText');
  if (text && message) text.textContent = message;
  banner?.classList.toggle('hidden', !message);
}

const minutes = (ms) => Math.max(1, Math.ceil(ms / 60000));

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
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnText = document.getElementById('authBtnText');
    const btnLoading = document.getElementById('authBtnLoading');
    const submitBtn = document.getElementById('authSubmitBtn');

    if (submitBtn) submitBtn.disabled = true;
    btnText?.classList.add('hidden');
    btnLoading?.classList.remove('hidden');
    showAuthMessage(null);

    try {
      const res = await apiService.login(idInput.value.trim(), passInput.value);
      passInput.value = '';
      startSession(res.user);
      showToast(`Welcome, ${res.user.name}`, 'success');
      switchView(takePostLoginView(), true);
    } catch (err) {
      if (err.status === 429) {
        showAuthMessage(`Too many failed attempts. Try again in ${minutes(err.body?.retryAfterMs || 0)} min.`);
      } else if (err.status === 401) {
        const left = err.body?.attemptsLeft;
        showAuthMessage(left > 0 && left <= 3
          ? `Wrong identifier or PIN. ${left} attempt${left === 1 ? '' : 's'} left before a 15-minute lock.`
          : 'Wrong identifier or PIN.');
      } else {
        showAuthMessage(`Could not sign in: ${err.message}`);
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      btnText?.classList.remove('hidden');
      btnLoading?.classList.add('hidden');
    }
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

  let pendingId = null;

  const showError = (msg) => {
    errorEl.textContent = msg || '';
    errorEl.classList.toggle('hidden', !msg);
  };

  const reset = () => {
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

  sendBtn.addEventListener('click', async () => {
    const id = idInput.value.trim();
    if (!id) return showError('Enter your user identifier.');
    sendBtn.disabled = true;
    try {
      const res = await apiService.requestPinReset(id);
      pendingId = id;
      idInput.disabled = true;
      // Demo: there is no e-mail/SMS, so the server returns the code to show here
      otpHint.textContent = `Your code: ${res.demoCode} (valid ${res.expiresInMinutes} min)`;
      otpStep.classList.remove('hidden');
      sendBtn.classList.add('hidden');
      saveBtn.classList.remove('hidden');
      showError('');
      otpInput.focus();
    } catch (err) {
      showError(err.status === 429 ? `Too many attempts. Try again in ${minutes(err.body?.retryAfterMs || 0)} min.` : err.message);
    } finally {
      sendBtn.disabled = false;
    }
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await apiService.confirmPinReset(pendingId, otpInput.value.trim(), newPinInput.value);
      if (signInIdInput) signInIdInput.value = pendingId;
      const pass = document.getElementById('authPasscodeInput');
      if (pass) pass.value = '';
      modal.close();
      showToast('PIN updated. Sign in with your new PIN.', 'success');
    } catch (err) {
      showError(err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// --- Top-bar panels: only one open at a time --------------------------------
const navPanelClosers = [];

function closeNavPanels(except = null) {
  navPanelClosers.forEach((close) => close !== except && close());
}

// --- User menu (top bar) -----------------------------------------------------
function initUserMenu() {
  const btn = document.getElementById('navUserBtn');
  const panel = document.getElementById('navUserPanel');
  if (!btn || !panel) return;
  const close = () => setOpen(false);
  const setOpen = (open) => {
    if (open) closeNavPanels(close);
    panel.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
  };
  navPanelClosers.push(close);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.classList.contains('hidden'));
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target)) setOpen(false);
  });
  document.getElementById('navSignOutBtn')?.addEventListener('click', () => {
    setOpen(false);
    signOut();
  });
  openUserMenu = () => setOpen(true);
}

let openUserMenu = () => {};

function renderUserMenu() {
  const u = currentUser;
  const initials = u ? u.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '';
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('navUserInitials', initials);
  set('navUserName', u?.name || '');
  set('navUserRole', u ? `${u.roleLabel} · ${u.username}` : '');
  // The SQL console is admin-only; the server enforces it, the button just isn't offered
  document.getElementById('btnToggleSqlConsole')?.classList.toggle('hidden', !can('sql'));
}

document.addEventListener('DOMContentLoaded', async () => {
  initGeospatialMap();
  initDatabaseExplorer();
  initAuthWorkstation();
  initUserMenu();
  initSchemaView();
  initSqlLog();

  // Already signed in? (the session cookie is httpOnly, so ask the server)
  try {
    const res = await apiService.me();
    if (res.user) startSession(res.user);
    else renderUserMenu();
  } catch {
    renderUserMenu();
  }

  // Direct links: #map, #database, #leases (#reports), #schema
  const fromHash = resolveView(window.location.hash.replace('#', ''));
  const fromPath = resolveView(window.location.pathname.replace(/^\/|\.html$/g, ''));
  // Signed out with no deep link: just show the login (sign-in then goes to the database)
  switchView(fromHash || fromPath || (isAuthenticated() ? 'map' : 'auth'), false);
});


// ============================================================================
// 12. Global search: filters the open table; on the map, Enter finds a mine
// ============================================================================
const ENTITY_SCOPE = {
  mines: 'Mines',
  minerals: 'Minerals',
  locations: 'Places',
  companies: 'Companies',
  leases: 'Leases',
  production: 'Production',
  'ds-states': 'States',
  'ds-commodities': 'Commodities',
  'ds-auctions': 'Auctions',
  'ds-royalty': 'Royalty rates',
  'ds-reserves': 'Reserves',
  'ds-national-production': 'National output',
};

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
  return { label: 'Mines', placeholder: 'Find a mine by name, ID, mineral or place, then press Enter' };
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
    debounce = setTimeout(() => dispatchSearchQuery(searchText(), false), 120);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounce);
      dispatchSearchQuery(searchText(), true);
    } else if (e.key === 'Escape') {
      if (searchText()) clearSearch();
      else input.blur();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      // Focus came straight back (e.g. the clear button refocuses the input): keep the bar open
      if (document.activeElement === input) return;
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

  // Any "Clear search" link inside an empty-results message
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear-search]')) clearSearch();
  });

  // Lease rows open with Enter as well as a click
  document.getElementById('leaseResults')?.addEventListener('keydown', (e) => {
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

/** "3 of 8" at the right of the bar while a table filter is active */
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

  if (currentView === 'database') {
    searchQuery = query;
    filterDatabaseView(q);
  } else if (currentView === 'leases') {
    leaseSearch = q;
    renderLeaseRange();
  } else if (submitted && q) {
    // Map: fly to the first matching mine
    const [mine] = filterMines(q);
    if (mine) locateMineOnMap(mine);
    else showToast(`No mine matches “${query}”`, 'warning');
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
  if (currentView === 'database' && searchText()) filterDatabaseView(searchText().toLowerCase());
}

function undoViewFilters() {
  if (searchQuery) {
    searchQuery = '';
    filterDatabaseView('');
  }
  if (leaseSearch) {
    leaseSearch = '';
    renderLeaseRange();
  }
  setSearchCount(null);
}

function clearSearch() {
  const input = searchInput();
  if (input) input.value = '';
  undoViewFilters();
  updateSearchChrome();
}

/** Called on every view switch: empty the bar and undo any filtering it applied */
function resetSearchForView() {
  const input = searchInput();
  if (input) input.value = '';
  undoViewFilters();
  updateSearchChrome();
  updateSearchScope();
  document.body.classList.remove('search-open');
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
// 14. Public statistics tabs (database views over official publications)
// ============================================================================
const fmtNum = (v, digits = 0) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: digits }));
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const fmtYes = (v) => (v ? 'Yes' : '—');

// [column, label, 'num' for right-aligned numbers, formatter]
const DATASETS = {
  states: {
    view: 'v_state_mining_profile',
    source: 'Indian Bureau of Mines, Indian Mineral Industry at a Glance 2022-23 (Tables 3, 5 and 9). Mines on map: this database.',
    columns: [
      ['value_rank', 'Rank', 'num'],
      ['state_name', 'State'],
      ['production_value_2022_23_crore', 'Production value 2022-23 (₹ cr)', 'num', fmtNum],
      ['share_of_india_pct', 'Share of India', 'num', fmtPct],
      ['lease_count', 'Mining leases', 'num', fmtNum],
      ['lease_area_ha', 'Lease area (ha)', 'num', fmtNum],
      ['reporting_mines_2022_23', 'Reporting mines', 'num', fmtNum],
      ['mines_on_map', 'Mines on map', 'num', fmtNum],
      ['critical_blocks_auctioned', 'Critical blocks auctioned', 'num', fmtNum],
    ],
  },
  commodities: {
    view: 'v_commodity_overview',
    source: 'Economic Survey 2023-24 (production value), MMDR Act Second Schedule (royalty), IBM 2022-23 (leases), PIB (auctions). Critical: Ministry of Mines list (2023).',
    columns: [
      ['commodity_name', 'Commodity'],
      ['category', 'Category'],
      ['is_critical', 'Critical', '', fmtYes],
      ['production_value_2023_24_crore', 'Production value 2023-24 (₹ cr)', 'num', (v) => fmtNum(v, 1)],
      ['current_royalty', 'Current royalty rate'],
      ['mining_leases', 'Mining leases', 'num', fmtNum],
      ['mines_on_map', 'Mines on map', 'num', fmtNum],
      ['blocks_auctioned', 'Blocks auctioned', 'num', fmtNum],
    ],
  },
  auctions: {
    view: 'v_auction_results',
    source: 'Press Information Bureau: Tranche IV (7 Nov 2024) and Tranche V (27 May 2025) results. A preferred bidder still has conditions to meet before the licence is granted.',
    columns: [
      ['block_name', 'Block'],
      ['state', 'State'],
      ['minerals', 'Minerals'],
      ['preferred_bidder', 'Preferred bidder'],
      ['final_price_offer_pct', 'Final price offer', 'num', fmtPct],
      ['bidder_type', 'Bidder type'],
      ['concession_type', 'Type', '', (v) => (v === 'ML' ? 'Mining lease' : 'Composite licence')],
      ['tranche', 'Tranche', 'num'],
      ['announced_on', 'Announced'],
    ],
  },
  royalty: {
    view: 'royalty_rate',
    source: 'MMDR Act, 1957, Second Schedule: 2009 and 2015 rates as compiled by CSEP (2020), Annex-B; 2024 critical-mineral rates from PIB (29 Feb 2024).',
    columns: [
      ['schedule_year', 'Schedule', 'num'],
      ['commodity', 'Commodity'],
      ['grade', 'Grade'],
      ['rate_text', 'Rate'],
    ],
  },
  reserves: {
    view: 'mineral_reserve',
    source: 'National Mineral Inventory as on 1 April 2020 (IBM, Table 1). Blank: none estimated in that category.',
    columns: [
      ['commodity_name', 'Commodity'],
      ['form', 'Form'],
      ['unit', 'Unit'],
      ['reserves', 'Reserves', 'num', fmtNum],
      ['remaining_resources', 'Remaining resources', 'num', fmtNum],
      ['total_resources', 'Total resources', 'num', fmtNum],
    ],
  },
  'national-production': {
    view: 'national_production',
    source: 'Economic Survey 2023-24, Statistical Appendix, Table 1.32 (major minerals under MCDR). 2022-23 and 2023-24 are provisional.',
    columns: [
      ['fiscal_year', 'Year'],
      ['product_name', 'Product'],
      ['commodity_name', 'Commodity'],
      ['quantity', 'Quantity', 'num', fmtNum],
      ['unit', 'Unit'],
      ['value_rs_thousand', 'Value (₹ cr)', 'num', (v) => (v === null ? '—' : fmtNum(v / 10000, 1))],
      ['is_provisional', 'Provisional', '', fmtYes],
    ],
  },
};

async function renderDataset(name) {
  const cfg = DATASETS[name];
  const thead = document.querySelector('#masterGridTable thead');
  const tbody = document.getElementById('masterTableTbody');
  const pill = document.getElementById('masterRecordsPill');
  const caption = document.getElementById('datasetCaption');
  if (!cfg || !thead || !tbody) return;

  thead.innerHTML = `<tr>${cfg.columns.map(([, label, cls]) => `<th class="${cls === 'num' ? 'th-num' : ''}">${escapeHtml(label.toUpperCase())}</th>`).join('')}</tr>`;
  tbody.innerHTML = `<tr><td colspan="${cfg.columns.length}" class="td-loading">Loading ${escapeHtml(name)}…</td></tr>`;
  if (caption) caption.innerHTML = `Source: ${escapeHtml(cfg.source)} Read through <code>${cfg.view}</code>.`;

  try {
    const res = await apiService.getDataset(name);
    if (activeEntityTab !== `ds-${name}`) return; // another tab was opened meanwhile
    if (pill) pill.textContent = `${res.count} rows`;
    tbody.innerHTML = res.data
      .map((row) => `<tr>${cfg.columns
        .map(([key, , cls, fmt]) => {
          const v = row[key];
          const text = fmt ? fmt(v) : v === null || v === undefined || v === '' ? '—' : v;
          return `<td class="${cls === 'num' ? 'td-num' : ''}">${escapeHtml(String(text))}</td>`;
        })
        .join('')}</tr>`)
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${cfg.columns.length}" class="td-loading td-error">Could not load ${escapeHtml(name)}: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// ============================================================================
// 15. Schema view: ER diagram and database objects, read from the live catalog
// ============================================================================
// Layout columns (left to right) and the group each table belongs to
const ER_COLUMNS = [
  ['production', 'mine_mineral', 'mine', 'mine_alias', 'mine_media'],
  ['mineral', 'lease', 'location'],
  ['commodity', 'mining_company', 'state', 'data_source'],
  ['mineral_product', 'national_production', 'mineral_reserve', 'royalty_rate', 'commodity_mining_lease_stat', 'block_auction_commodity'],
  ['block_auction', 'state_production_value', 'state_mining_lease_stat', 'state_reporting_mines'],
  ['app_user', 'user_session', 'pin_reset', 'audit_log', 'row_change_log'],
];
const ER_GROUP = {
  ref: ['commodity', 'mining_company', 'state', 'data_source', 'location'],
  core: ['production', 'mine_mineral', 'mine', 'mine_alias', 'mine_media', 'mineral', 'lease'],
  system: ['app_user', 'user_session', 'pin_reset', 'audit_log', 'row_change_log'],
};
const erGroupOf = (name) => Object.keys(ER_GROUP).find((g) => ER_GROUP[g].includes(name)) || 'stats';
const ER = { W: 236, HEAD: 30, ROW: 17, PAD: 8, COL_GAP: 120, ROW_GAP: 30 };

const schemaState = { schema: null, objects: null, loading: null, layout: new Map(), selected: null, view: { x: 0, y: 0, k: 1 } };

function initSchemaView() {
  document.querySelectorAll('.schema-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchSchemaTab(tab.dataset.schemaTab));
  });
  document.getElementById('erZoomIn')?.addEventListener('click', () => zoomEr(1.25));
  document.getElementById('erZoomOut')?.addEventListener('click', () => zoomEr(0.8));
  document.getElementById('erFit')?.addEventListener('click', fitEr);

  const canvas = document.getElementById('erCanvas');
  if (canvas) {
    // Drag to pan; a press that barely moves is a click on a table
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.er-zoom')) return;
      drag = { x: e.clientX, y: e.clientY, vx: schemaState.view.x, vy: schemaState.view.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        schemaState.view.x = drag.vx + dx;
        schemaState.view.y = drag.vy + dy;
        applyErView();
        canvas.classList.add('panning');
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) {
        const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-er-table]');
        selectErTable(hit ? hit.dataset.erTable : null);
      }
      drag = null;
      canvas.classList.remove('panning');
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomEr(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
  }

  // Links and buttons inside the detail panes
  document.getElementById('erDetail')?.addEventListener('click', (e) => {
    const link = e.target.closest('[data-goto-table]');
    if (link) {
      selectErTable(link.dataset.gotoTable, true);
      return;
    }
    const browse = e.target.closest('[data-browse]');
    if (browse) browseRelation(browse.dataset.browse, document.getElementById('erRows'));
  });
  document.getElementById('viewList')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-view]');
    if (item) showViewObject(item.dataset.view);
  });
  document.getElementById('viewDetail')?.addEventListener('click', (e) => {
    const run = e.target.closest('[data-browse]');
    if (run) browseRelation(run.dataset.browse, document.getElementById('viewRows'));
  });
  document.getElementById('triggerList')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-trigger]');
    if (item) showTriggerObject(Number(item.dataset.trigger));
  });
}

function switchSchemaTab(name) {
  document.querySelectorAll('.schema-tab').forEach((t) => {
    const on = t.dataset.schemaTab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('[data-schema-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.schemaPane !== name));
}

/** Load the catalog once per page (the first time the view opens) */
async function openSchemaView() {
  if (schemaState.schema || schemaState.loading) return;
  const sub = document.getElementById('schemaSub');
  schemaState.loading = Promise.all([apiService.getSchema(), apiService.getSchemaObjects()]);
  try {
    const [schema, objects] = await schemaState.loading;
    schemaState.schema = schema;
    schemaState.objects = objects;
  } catch (err) {
    if (sub) sub.textContent = `Could not read the schema: ${err.message}`;
    schemaState.loading = null;
    return;
  }
  const { database, relations, constraints, enums } = schemaState.schema;
  const tables = relations.filter((r) => r.kind === 'table');
  const fks = constraints.filter((c) => c.type === 'f');
  if (sub) {
    sub.textContent = `${database.version} on Supabase · schema ${database.schema} · ${tables.length} tables, ${fks.length} foreign keys, `
      + `${relations.length - tables.length} views, ${schemaState.objects.triggers.length} triggers, ${schemaState.objects.indexes.length} indexes, `
      + `${enums.length} enum types · ${database.schemaSize} of data`;
  }
  const footer = document.getElementById('footerDb');
  if (footer) footer.textContent = `${database.version} • Supabase • schema ${database.schema}`;
  drawEr();
  fitEr();
  renderViewObjects();
  renderTriggerObjects();
  renderIndexObjects();
  renderTypeObjects();
}

const keysOf = (table) => {
  const cons = schemaState.schema.constraints.filter((c) => c.table_name === table);
  const pk = new Set(cons.filter((c) => c.type === 'p').flatMap((c) => c.columns));
  const fk = new Set(cons.filter((c) => c.type === 'f').flatMap((c) => c.columns));
  return { pk, fk };
};

function drawEr() {
  const svg = document.getElementById('erSvg');
  const { relations, constraints } = schemaState.schema;
  const byName = new Map(relations.filter((r) => r.kind === 'table').map((r) => [r.name, r]));
  // Tables missing from the layout (added later) go in an extra column
  const placed = new Set(ER_COLUMNS.flat());
  const columns = [...ER_COLUMNS, [...byName.keys()].filter((n) => !placed.has(n))].filter((c) => c.length);

  schemaState.layout.clear();
  columns.forEach((names, ci) => {
    let y = 0;
    names.filter((n) => byName.has(n)).forEach((name) => {
      const t = byName.get(name);
      const h = ER.HEAD + t.columns.length * ER.ROW + ER.PAD;
      const colY = new Map(t.columns.map((c, i) => [c.name, y + ER.HEAD + i * ER.ROW + ER.ROW / 2 + 2]));
      schemaState.layout.set(name, { x: ci * (ER.W + ER.COL_GAP), y, w: ER.W, h, colY });
      y += h + ER.ROW_GAP;
    });
  });

  const edges = constraints.filter((c) => c.type === 'f' && schemaState.layout.has(c.table_name) && schemaState.layout.has(c.ref_table))
    .map((c) => {
      const a = schemaState.layout.get(c.table_name);
      const b = schemaState.layout.get(c.ref_table);
      const y1 = a.colY.get(c.columns[0]);
      const y2 = b.colY.get(c.ref_columns[0]);
      let x1;
      let x2;
      let bend;
      if (a.x === b.x) {
        // Same column: loop out on the right
        x1 = a.x + a.w;
        x2 = b.x + b.w;
        bend = `C ${x1 + 60} ${y1}, ${x2 + 60} ${y2}`;
      } else if (b.x > a.x) {
        x1 = a.x + a.w;
        x2 = b.x;
        const mid = (x1 + x2) / 2;
        bend = `C ${mid} ${y1}, ${mid} ${y2}`;
      } else {
        x1 = a.x;
        x2 = b.x + b.w;
        const mid = (x1 + x2) / 2;
        bend = `C ${mid} ${y1}, ${mid} ${y2}`;
      }
      const title = `${c.table_name}.${c.columns.join(', ')} → ${c.ref_table}.${c.ref_columns.join(', ')} (ON DELETE ${c.on_delete})`;
      return `<path class="er-edge${c.columns.includes('source_id') ? ' er-edge-source' : ''}" data-from="${c.table_name}" data-to="${c.ref_table}"
        d="M ${x1} ${y1} ${bend} ${x2} ${y2}" marker-start="url(#erMany)" marker-end="url(#erOne)"><title>${escapeHtml(title)}</title></path>`;
    })
    .join('');

  const boxes = [...schemaState.layout.entries()].map(([name, L]) => {
    const t = byName.get(name);
    const { pk, fk } = keysOf(name);
    const rows = t.columns.map((col, i) => {
      const y = ER.HEAD + i * ER.ROW + 13;
      const key = pk.has(col.name) ? '<tspan class="er-pk">PK</tspan>' : fk.has(col.name) ? '<tspan class="er-fk">FK</tspan>' : '';
      const type = col.type.replace('character varying', 'varchar').replace('timestamp with time zone', 'timestamptz').replace('double precision', 'float8');
      return `<text x="8" y="${y}" class="er-col${pk.has(col.name) ? ' is-pk' : ''}">${key ? `${key} ` : ''}${escapeHtml(col.name)}</text>
        <text x="${ER.W - 8}" y="${y}" class="er-type">${escapeHtml(type)}</text>`;
    }).join('');
    // The row count only goes in the header when the name leaves room for it
    const count = t.rows === null || name.length > 22 ? '' : `${t.rows.toLocaleString('en-IN')} rows`;
    return `<g class="er-table grp-${erGroupOf(name)}" data-er-table="${name}" transform="translate(${L.x}, ${L.y})">
      <title>${escapeHtml(`${name}${t.rows === null ? '' : ` (${t.rows} rows)`}: ${t.comment || ''}`)}</title>
      <rect class="er-box" width="${L.w}" height="${L.h}" rx="8"/>
      <path class="er-head" d="M0 8 a8 8 0 0 1 8 -8 h${L.w - 16} a8 8 0 0 1 8 8 v${ER.HEAD - 8} h-${L.w} z"/>
      <text x="10" y="19" class="er-name">${escapeHtml(name)}</text>
      <text x="${L.w - 10}" y="19" class="er-count">${count}</text>
      ${rows}
    </g>`;
  }).join('');

  svg.innerHTML = `<defs>
      <marker id="erMany" viewBox="0 0 12 12" refX="1" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
        <path d="M12 6 L1 1 M12 6 L1 6 M12 6 L1 11" class="er-marker"/></marker>
      <marker id="erOne" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto">
        <path d="M6 1 L6 11 M9 1 L9 11" class="er-marker"/></marker>
    </defs>
    <g id="erRoot"><g class="er-edges">${edges}</g>${boxes}</g>`;
  applyErView();
  if (schemaState.selected) highlightEr(schemaState.selected);
}

function applyErView() {
  const { x, y, k } = schemaState.view;
  document.getElementById('erRoot')?.setAttribute('transform', `translate(${x}, ${y}) scale(${k})`);
}

function zoomEr(factor, cx, cy) {
  const canvas = document.getElementById('erCanvas');
  if (!canvas) return;
  const v = schemaState.view;
  const px = cx ?? canvas.clientWidth / 2;
  const py = cy ?? canvas.clientHeight / 2;
  const k = Math.min(2.5, Math.max(0.15, v.k * factor));
  // Keep the point under the cursor fixed
  v.x = px - ((px - v.x) * k) / v.k;
  v.y = py - ((py - v.y) * k) / v.k;
  v.k = k;
  applyErView();
}

function fitEr(names = null) {
  const canvas = document.getElementById('erCanvas');
  const boxes = [...schemaState.layout.entries()].filter(([n]) => !names || names.includes(n)).map(([, b]) => b);
  if (!canvas || !boxes.length) return;
  const minX = Math.min(...boxes.map((b) => b.x)) - 40;
  const minY = Math.min(...boxes.map((b) => b.y)) - 30;
  const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 80;
  const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + 30;
  const k = Math.min(canvas.clientWidth / (maxX - minX), canvas.clientHeight / (maxY - minY), names ? 1.1 : 1);
  schemaState.view = { k, x: (canvas.clientWidth - (maxX - minX) * k) / 2 - minX * k, y: (canvas.clientHeight - (maxY - minY) * k) / 2 - minY * k };
  applyErView();
}

/** The selected table, its relationships and its neighbours stand out; the rest fades */
function highlightEr(name) {
  const svg = document.getElementById('erSvg');
  if (!svg) return;
  const near = new Set(name ? [name] : []);
  svg.querySelectorAll('.er-edge').forEach((e) => {
    const on = name && (e.dataset.from === name || e.dataset.to === name);
    e.classList.toggle('on', Boolean(on));
    if (on) {
      near.add(e.dataset.from);
      near.add(e.dataset.to);
    }
  });
  svg.classList.toggle('has-selection', Boolean(name));
  svg.querySelectorAll('.er-table').forEach((g) => {
    g.classList.toggle('selected', g.dataset.erTable === name);
    g.classList.toggle('near', near.has(g.dataset.erTable));
  });
}

function selectErTable(name, focus = false) {
  schemaState.selected = name;
  highlightEr(name);
  const panel = document.getElementById('erDetail');
  if (!panel) return;
  if (!name) {
    panel.innerHTML = '<p class="er-hint">Click a table to see its columns, keys, relationships and rows. Drag to move the diagram, scroll to zoom.</p>';
    return;
  }
  if (focus) {
    const near = [name, ...schemaState.schema.constraints.filter((c) => c.type === 'f' && (c.table_name === name || c.ref_table === name))
      .flatMap((c) => [c.table_name, c.ref_table])];
    fitEr([...new Set(near)]);
  }
  const t = schemaState.schema.relations.find((r) => r.name === name);
  const cons = schemaState.schema.constraints.filter((c) => c.table_name === name);
  const { pk, fk } = keysOf(name);
  const refs = cons.filter((c) => c.type === 'f');
  const referencedBy = schemaState.schema.constraints.filter((c) => c.type === 'f' && c.ref_table === name);
  const checks = cons.filter((c) => c.type === 'c' || c.type === 'u');
  const triggers = schemaState.objects.triggers.filter((tr) => tr.table_name === name);
  const indexes = schemaState.objects.indexes.filter((ix) => ix.table_name === name);
  const tableLink = (n) => `<button type="button" class="er-link" data-goto-table="${n}">${escapeHtml(n)}</button>`;
  const canBrowse = !t.adminOnly || can('sql');

  panel.innerHTML = `
    <h2 class="er-detail-name">${escapeHtml(name)}</h2>
    <p class="er-detail-meta">table · ${t.rows === null ? '' : `${t.rows.toLocaleString('en-IN')} rows · `}${escapeHtml(erGroupLabel(erGroupOf(name)))}</p>
    ${t.comment ? `<p class="er-detail-comment">${escapeHtml(t.comment)}</p>` : ''}
    <h3>Columns</h3>
    <table class="er-cols">
      ${t.columns.map((c) => `<tr>
        <td class="er-cols-key">${pk.has(c.name) ? '<b class="er-key pk">PK</b>' : ''}${fk.has(c.name) ? '<b class="er-key fk">FK</b>' : ''}</td>
        <td class="er-cols-name" title="${escapeHtml(c.comment || '')}">${escapeHtml(c.name)}</td>
        <td class="er-cols-type">${escapeHtml(c.type)}${c.nullable ? '' : ' <span class="er-nn">NOT NULL</span>'}${c.identity ? ' <span class="er-nn">IDENTITY</span>' : ''}</td>
      </tr>`).join('')}
    </table>
    ${refs.length ? `<h3>References</h3><ul class="er-rel">${refs.map((c) => `<li>${escapeHtml(c.columns.join(', '))} → ${tableLink(c.ref_table)}.${escapeHtml(c.ref_columns.join(', '))} <span class="er-ondelete">on delete ${escapeHtml(c.on_delete.toLowerCase())}</span></li>`).join('')}</ul>` : ''}
    ${referencedBy.length ? `<h3>Referenced by</h3><ul class="er-rel">${referencedBy.map((c) => `<li>${tableLink(c.table_name)}.${escapeHtml(c.columns.join(', '))} <span class="er-ondelete">on delete ${escapeHtml(c.on_delete.toLowerCase())}</span></li>`).join('')}</ul>` : ''}
    ${checks.length ? `<h3>Constraints</h3><ul class="er-code-list">${checks.map((c) => `<li><span class="er-con-name">${escapeHtml(c.name)}</span><code>${highlightSql(c.definition)}</code></li>`).join('')}</ul>` : ''}
    ${triggers.length ? `<h3>Triggers</h3><ul class="er-code-list">${triggers.map((tr) => `<li><code>${highlightSql(tr.definition)}</code></li>`).join('')}</ul>` : ''}
    ${indexes.length ? `<h3>Indexes</h3><ul class="er-code-list">${indexes.map((ix) => `<li><code>${highlightSql(ix.definition)}</code></li>`).join('')}</ul>` : ''}
    <div class="er-browse">
      ${canBrowse ? `<button type="button" class="btn-schema" data-browse="${name}">Show rows</button>` : '<p class="er-hint">Only an administrator can browse account tables.</p>'}
    </div>
    <div id="erRows"></div>`;
}

const erGroupLabel = (g) => ({ ref: 'Reference', core: 'Mines & leases', stats: 'Public statistics', system: 'Accounts & audit' })[g];

/** First rows of a table or view, with the SQL that fetched them */
async function browseRelation(name, box) {
  if (!box) return;
  box.innerHTML = '<p class="er-hint">Running…</p>';
  try {
    const res = await apiService.getRelationRows(name, 50);
    const cols = res.rows.length ? Object.keys(res.rows[0]) : [];
    const cell = (v) => {
      if (v === null || v === undefined) return '<span class="null">NULL</span>';
      const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return escapeHtml(text.length > 120 ? `${text.slice(0, 117)}…` : text);
    };
    box.innerHTML = `
      <p class="rows-meta"><code>${highlightSql(res.sql)}</code> · ${res.rows.length} rows · ${res.ms} ms</p>
      ${res.rows.length ? `<div class="rows-wrap"><table class="rows-table">
        <thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${res.rows.map((r) => `<tr>${cols.map((c) => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>` : '<p class="er-hint">No rows.</p>'}`;
  } catch (err) {
    box.innerHTML = `<p class="er-hint td-error">${escapeHtml(err.message)}</p>`;
  }
}

function renderViewObjects() {
  const list = document.getElementById('viewList');
  if (!list) return;
  list.innerHTML = schemaState.objects.views
    .map((v) => `<li><button type="button" data-view="${v.name}"><b>${escapeHtml(v.name)}</b><span>${escapeHtml(v.comment || '')}</span></button></li>`)
    .join('');
  if (schemaState.objects.views.length) showViewObject(schemaState.objects.views[0].name);
}

function showViewObject(name) {
  const v = schemaState.objects.views.find((x) => x.name === name);
  const box = document.getElementById('viewDetail');
  if (!v || !box) return;
  document.querySelectorAll('#viewList [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  box.innerHTML = `
    <h2 class="er-detail-name">${escapeHtml(v.name)}</h2>
    ${v.comment ? `<p class="er-detail-comment">${escapeHtml(v.comment)}</p>` : ''}
    <pre class="sql-block">CREATE VIEW ${escapeHtml(v.name)} AS\n${highlightSql(v.definition.trim())}</pre>
    <button type="button" class="btn-schema" data-browse="${v.name}">Run view</button>
    <div id="viewRows"></div>`;
}

function renderTriggerObjects() {
  const list = document.getElementById('triggerList');
  if (!list) return;
  list.innerHTML = schemaState.objects.triggers
    .map((t, i) => `<li><button type="button" data-trigger="${i}"><b>${escapeHtml(t.name)}</b><span>on ${escapeHtml(t.table_name)} · ${escapeHtml(t.function_name)}()</span></button></li>`)
    .join('');
  if (schemaState.objects.triggers.length) showTriggerObject(0);
}

function showTriggerObject(i) {
  const t = schemaState.objects.triggers[i];
  const box = document.getElementById('triggerDetail');
  if (!t || !box) return;
  document.querySelectorAll('#triggerList [data-trigger]').forEach((b) => b.classList.toggle('active', Number(b.dataset.trigger) === i));
  const sharing = schemaState.objects.triggers.filter((x) => x.function_name === t.function_name).map((x) => x.table_name);
  box.innerHTML = `
    <h2 class="er-detail-name">${escapeHtml(t.name)} <span class="er-detail-meta">on ${escapeHtml(t.table_name)}</span></h2>
    <pre class="sql-block">${highlightSql(t.definition)};</pre>
    <h3>Function ${escapeHtml(t.function_name)}()${sharing.length > 1 ? ` <span class="er-detail-meta">used on ${sharing.map(escapeHtml).join(', ')}</span>` : ''}</h3>
    <pre class="sql-block">${highlightSql(t.function_definition.trim())}</pre>`;
}

function renderIndexObjects() {
  const box = document.getElementById('indexTable');
  if (!box) return;
  box.innerHTML = `<table class="rows-table obj-table">
    <thead><tr><th>Index</th><th>Table</th><th>Definition</th><th class="th-num">Size</th><th class="th-num">Scans</th></tr></thead>
    <tbody>${schemaState.objects.indexes.map((ix) => `<tr>
      <td><b>${escapeHtml(ix.name)}</b></td>
      <td>${escapeHtml(ix.table_name)}</td>
      <td><code>${highlightSql(ix.definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON minerva\.\S+ /, (m, u) => (u ? 'UNIQUE ' : '')))}</code></td>
      <td class="td-num">${escapeHtml(ix.size)}</td>
      <td class="td-num">${ix.scans === null ? '—' : ix.scans.toLocaleString('en-IN')}</td>
    </tr>`).join('')}</tbody></table>
    <p class="er-hint">Scans: how many times PostgreSQL has used each index since its statistics were last reset.</p>`;
}

function renderTypeObjects() {
  const box = document.getElementById('typeTable');
  if (!box) return;
  const usedBy = (type) => schemaState.schema.relations
    .flatMap((r) => r.columns.filter((c) => c.type === type).map((c) => `${r.name}.${c.name}`));
  box.innerHTML = `<table class="rows-table obj-table">
    <thead><tr><th>Enum type</th><th>Values</th><th>Used by</th></tr></thead>
    <tbody>${schemaState.schema.enums.map((e) => `<tr>
      <td><b>${escapeHtml(e.name)}</b></td>
      <td>${e.labels.map((l) => `<span class="enum-chip">${escapeHtml(l)}</span>`).join(' ')}</td>
      <td>${usedBy(e.name).map((u) => `<code>${escapeHtml(u)}</code>`).join(', ')}</td>
    </tr>`).join('')}</tbody></table>`;
}

const SQL_KEYWORDS = 'SELECT|FROM|WHERE|JOIN|LEFT|INNER|ON|AND|OR|NOT|AS|GROUP|BY|ORDER|HAVING|CASE|WHEN|THEN|ELSE|END|WITH|CREATE|OR REPLACE|VIEW|TRIGGER|FUNCTION|BEFORE|AFTER|INSERT|UPDATE|DELETE|OF|FOR|EACH|ROW|EXECUTE|RETURNS|LANGUAGE|BEGIN|RETURN|IF|EXISTS|NULL|IS|INTO|VALUES|DECLARE|INDEX|USING|UNIQUE|OVER|DESC|ASC|LIMIT|OFFSET|DISTINCT|PRIMARY|FOREIGN|KEY|REFERENCES|CHECK|BETWEEN|IN|RAISE|EXCEPTION|COALESCE|NULLS|LAST|FIRST|TRUE|FALSE|INTERVAL|DATE|PERFORM|ELSIF|STABLE|IMMUTABLE|VOLATILE|SET';
const SQL_TOKEN = new RegExp(`(&#39;(?:[^&]|&(?!#39;))*?&#39;)|(--[^\\n]*)|\\b(${SQL_KEYWORDS})\\b`, 'gi');

/** Escaped SQL with keywords, strings and comments marked for colouring */
function highlightSql(sql) {
  return escapeHtml(sql).replace(SQL_TOKEN, (m, str, comment, kw) => {
    if (str) return `<span class="sql-str">${str}</span>`;
    if (comment) return `<span class="sql-com">${comment}</span>`;
    return `<span class="sql-kw">${kw}</span>`;
  });
}

// ============================================================================
// 16. SQL log drawer: the statements the backend runs, polled while open
// ============================================================================
const sqlLog = { open: false, paused: false, after: 0, timer: null, entries: [] };
const SQL_LOG_KEEP = 300;
const isSessionCheck = (e) => /^SELECT s\.token_hash|^UPDATE user_session SET last_seen/.test(e.sql);

function initSqlLog() {
  document.getElementById('navSqlLogBtn')?.addEventListener('click', () => (sqlLog.open ? closeSqlLog() : openSqlLog()));
  document.getElementById('sqlLogClose')?.addEventListener('click', () => closeSqlLog());
  document.getElementById('sqlLogClear')?.addEventListener('click', () => {
    sqlLog.entries = [];
    renderSqlLog();
  });
  document.getElementById('sqlLogPause')?.addEventListener('click', (e) => {
    sqlLog.paused = !sqlLog.paused;
    e.currentTarget.textContent = sqlLog.paused ? 'Resume' : 'Pause';
    if (!sqlLog.paused) pollSqlLog();
  });
  document.getElementById('sqlLogHideAuth')?.addEventListener('change', renderSqlLog);
  document.getElementById('sqlLogList')?.addEventListener('click', (e) => {
    e.target.closest('.sql-log-item')?.classList.toggle('expanded');
  });
}

function openSqlLog() {
  if (!currentUser) return;
  sqlLog.open = true;
  document.getElementById('sqlLogDrawer')?.classList.remove('hidden');
  document.getElementById('navSqlLogBtn')?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('sql-log-open');
  renderSqlLog();
  pollSqlLog();
}

/** reset: forget the entries too (on sign-out) */
function closeSqlLog(reset = false) {
  sqlLog.open = false;
  clearTimeout(sqlLog.timer);
  document.getElementById('sqlLogDrawer')?.classList.add('hidden');
  document.getElementById('navSqlLogBtn')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('sql-log-open');
  if (reset) {
    sqlLog.entries = [];
    sqlLog.after = 0;
    renderSqlLog();
  }
}

async function pollSqlLog() {
  clearTimeout(sqlLog.timer);
  if (!sqlLog.open || sqlLog.paused || !currentUser) return;
  try {
    const res = await apiService.getSqlLog(sqlLog.after);
    if (res.entries.length) {
      sqlLog.after = res.entries[res.entries.length - 1].id;
      sqlLog.entries = [...res.entries.reverse(), ...sqlLog.entries].slice(0, SQL_LOG_KEEP);
      renderSqlLog();
    }
  } catch {
    // A 401 is handled globally; otherwise try again on the next tick
  }
  sqlLog.timer = setTimeout(pollSqlLog, 1500);
}

function renderSqlLog() {
  const list = document.getElementById('sqlLogList');
  const count = document.getElementById('navSqlLogCount');
  const hideAuth = document.getElementById('sqlLogHideAuth')?.checked;
  const shown = sqlLog.entries.filter((e) => !(hideAuth && isSessionCheck(e)));
  if (count) {
    count.textContent = sqlLog.entries.length;
    count.classList.toggle('hidden', !sqlLog.open || sqlLog.entries.length === 0);
  }
  if (!list) return;
  if (!shown.length) {
    list.innerHTML = '<li class="sql-log-empty">No queries yet. Use the app and the SQL it runs appears here.</li>';
    return;
  }
  list.innerHTML = shown
    .map((e) => {
      const time = new Date(e.at).toLocaleTimeString([], { hour12: false }) + `.${String(new Date(e.at).getMilliseconds()).padStart(3, '0')}`;
      const params = e.params.length ? `<span class="sql-log-params">[${e.params.map((p) => escapeHtml(JSON.stringify(p))).join(', ')}]</span>` : '';
      return `<li class="sql-log-item${e.error ? ' has-error' : ''}" title="Click to expand">
        <span class="sql-log-time">${time}</span>
        <span class="sql-log-ms${e.ms > 200 ? ' slow' : ''}">${e.ms} ms</span>
        <span class="sql-log-rows">${e.error ? 'error' : `${e.rows} row${e.rows === 1 ? '' : 's'}`}</span>
        <span class="sql-log-route">${escapeHtml(e.route)}${e.user ? ` · ${escapeHtml(e.user)}` : ''}</span>
        <code class="sql-log-sql">${highlightSql(e.sql)} ${params}${e.error ? `<span class="sql-log-error">${escapeHtml(e.error)}</span>` : ''}</code>
      </li>`;
    })
    .join('');
}

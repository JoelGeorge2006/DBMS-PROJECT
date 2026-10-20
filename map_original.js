/**
 * MINERVA — National Mineral Geospatial Intelligence Grid
 * Production Geospatial System Synthesizing Image 1 (UI Chrome) & Image 2 (LUMINA Basemap)
 */

// ============================================================================
// 1. Geospatial Telemetry Dataset (From DBMS Schema & Real Cratons)
// ============================================================================
const TELEMETRY_NODES = [
  // --- ODISHA / JHARKHAND IRON & BAUXITE CRATON (Image 1 Focus) ---
  {
    id: 'NODE-JH-01',
    name: 'Noamundi Iron Mine',
    state: 'Jharkhand',
    district: 'West Singhbhum',
    coords: [22.146, 85.524],
    count: 48,
    company: 'Tata Steel Ltd.',
    mineral: 'Iron Ore (Hematite 64% Fe)',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 04-JH-1998',
    yield: '18.4M MT/Yr',
    sensorsOnline: 48,
    colorType: 'amber',
    craton: 'Singhbhum Craton',
    status: 'Active Concession'
  },
  {
    id: 'NODE-OR-01',
    name: 'Joda East Iron Mine',
    state: 'Odisha',
    district: 'Keonjhar',
    coords: [22.016, 85.426],
    count: 50,
    company: 'Tata Steel Ltd.',
    mineral: 'Iron Ore (Hematite 62% Fe)',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 04-OR-2004',
    yield: '16.2M MT/Yr',
    sensorsOnline: 50,
    colorType: 'amber',
    craton: 'Keonjhar Sector',
    status: 'Active Concession'
  },
  {
    id: 'NODE-JH-02',
    name: 'Kiriburu - Meghahatuburu Complex',
    state: 'Jharkhand',
    district: 'West Singhbhum',
    coords: [22.067, 85.289],
    count: 52,
    company: 'Steel Authority of India Limited (SAIL)',
    mineral: 'Iron Ore (High-Grade Lumps)',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 02-JH-1988',
    yield: '21.0M MT/Yr',
    sensorsOnline: 52,
    colorType: 'amber',
    craton: 'Singhbhum Craton',
    status: 'Active Concession'
  },
  {
    id: 'NODE-OR-02',
    name: 'Barsan Iron Concession',
    state: 'Odisha',
    district: 'Sundergarh',
    coords: [21.845, 85.120],
    count: 51,
    company: 'Steel Authority of India Limited',
    mineral: 'Iron Ore (High-Grade Fine)',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 07-OR-2001',
    yield: '12.5M MT/Yr',
    sensorsOnline: 51,
    colorType: 'amber',
    craton: 'Keonjhar Sector',
    status: 'Active Concession'
  },
  {
    id: 'NODE-OR-03',
    name: 'Panchpatmali Bauxite Mine',
    state: 'Odisha',
    district: 'Koraput',
    coords: [18.825, 82.915],
    count: 51,
    company: 'National Aluminium Company Ltd (NALCO)',
    mineral: 'Bauxite (Alumina Ore 46% Al2O3)',
    mineralCategory: 'Bauxite',
    leaseId: 'LEASE: 02-OR-1998',
    yield: '7.3M MT/Yr',
    sensorsOnline: 51,
    colorType: 'copper',
    craton: 'Eastern Ghats Bauxite Belt',
    status: 'Active Concession'
  },
  {
    id: 'NODE-JH-03',
    name: 'Serengdag Bauxite Ridge',
    state: 'Jharkhand',
    district: 'Gumla',
    coords: [23.235, 84.580],
    count: 42,
    company: 'Hindalco Industries Ltd.',
    mineral: 'Bauxite (Metallurgical Grade)',
    mineralCategory: 'Bauxite',
    leaseId: 'LEASE: 03-JH-2006',
    yield: '5.1M MT/Yr',
    sensorsOnline: 42,
    colorType: 'copper',
    craton: 'Chotanagpur Plateau',
    status: 'Active Concession'
  },
  {
    id: 'NODE-JH-04',
    name: 'Mosaboni Copper Complex',
    state: 'Jharkhand',
    district: 'East Singhbhum',
    coords: [22.520, 86.455],
    count: 38,
    company: 'Hindustan Copper Limited (HCL)',
    mineral: 'Copper Ore (Chalcopyrite)',
    mineralCategory: 'Copper Ore',
    leaseId: 'LEASE: 05-JH-1992',
    yield: '2.4M MT/Yr',
    sensorsOnline: 38,
    colorType: 'copper',
    craton: 'Singhbhum Copper Belt',
    status: 'Active Concession'
  },

  // --- CHHATTISGARH MINERAL BELT ---
  {
    id: 'NODE-CG-01',
    name: 'Bailadila Iron Ore Deposit (Sector 5 & 14)',
    state: 'Chhattisgarh',
    district: 'Dantewada',
    coords: [18.705, 81.245],
    count: 51,
    company: 'NMDC Limited',
    mineral: 'Iron Ore (67% Fe Super Blue Dust)',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 06-CG-2008',
    yield: '32.0M MT/Yr',
    sensorsOnline: 51,
    colorType: 'amber',
    craton: 'Bailadila Range',
    status: 'Active Concession'
  },
  {
    id: 'NODE-CG-02',
    name: 'Chilhati Limestone Quarry',
    state: 'Chhattisgarh',
    district: 'Bilaspur',
    coords: [22.080, 82.150],
    count: 40,
    company: 'NUVaco Vista Corp Ltd.',
    mineral: 'Limestone (Cement Grade)',
    mineralCategory: 'Limestone',
    leaseId: 'LEASE: 09-CG-2015',
    yield: '4.2M MT/Yr',
    sensorsOnline: 40,
    colorType: 'default',
    craton: 'Chhattisgarh Basin',
    status: 'Active Concession'
  },
  {
    id: 'NODE-CG-03',
    name: 'Samri - Tatijhariya Bauxite Mines',
    state: 'Chhattisgarh',
    district: 'Balrampur',
    coords: [23.410, 83.650],
    count: 45,
    company: 'Hindalco Industries Ltd.',
    mineral: 'Bauxite (Gibbsite)',
    mineralCategory: 'Bauxite',
    leaseId: 'LEASE: 04-CG-2003',
    yield: '3.8M MT/Yr',
    sensorsOnline: 45,
    colorType: 'copper',
    craton: 'Mainpat Plateau',
    status: 'Active Concession'
  },

  // --- KARNATAKA CRATON (Directly Replicating Image 2 Cluster) ---
  {
    id: 'NODE-KA-01',
    name: 'Bellary - Sandur Iron Complex',
    state: 'Karnataka',
    district: 'Bellary',
    coords: [15.085, 76.540],
    count: 83,
    company: 'NMDC / JSW Steel Limited',
    mineral: 'Iron Ore (High Grade Hematite)',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 08-KA-2012',
    yield: '28.5M MT/Yr',
    sensorsOnline: 83,
    colorType: 'amber',
    craton: 'Bellary Complex',
    status: 'Active Concession'
  },
  {
    id: 'NODE-KA-02',
    name: 'Donimalai Extraction Shaft',
    state: 'Karnataka',
    district: 'Bellary',
    coords: [15.050, 76.620],
    count: 24,
    company: 'NMDC Limited',
    mineral: 'Iron Ore (Pellet Feed Grade)',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 03-KA-2016',
    yield: '7.0M MT/Yr',
    sensorsOnline: 24,
    colorType: 'amber',
    craton: 'Bellary Complex',
    status: 'Active Concession'
  },
  {
    id: 'NODE-KA-03',
    name: 'Kudremukh - Chikmagalur Reserve',
    state: 'Karnataka',
    district: 'Chikmagalur',
    coords: [13.210, 75.250],
    count: 37,
    company: 'KIOCL Limited',
    mineral: 'Iron Ore (Magnetite Beneficiation)',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 01-KA-1990',
    yield: '4.8M MT/Yr',
    sensorsOnline: 37,
    colorType: 'amber',
    craton: 'Western Dharwar Craton',
    status: 'Active Concession'
  },
  {
    id: 'NODE-KA-04',
    name: 'Chitradurga Polymetallic Hub',
    state: 'Karnataka',
    district: 'Chitradurga',
    coords: [14.220, 76.400],
    count: 47,
    company: 'Hutti Gold Mines & Mineral Corp',
    mineral: 'Copper Ore & Base Metals',
    mineralCategory: 'Copper Ore',
    leaseId: 'LEASE: 05-KA-2008',
    yield: '1.2M MT/Yr',
    sensorsOnline: 47,
    colorType: 'copper',
    craton: 'Chitradurga Schist Belt',
    status: 'Active Concession'
  },
  {
    id: 'NODE-KA-05',
    name: 'Belgaum / Khanapur Craton Node',
    state: 'Karnataka',
    district: 'Belgaum',
    coords: [15.850, 74.500],
    count: 63,
    company: 'Indal / Hindalco Smelting Feed',
    mineral: 'Bauxite (Lateritic Alumina)',
    mineralCategory: 'Bauxite',
    leaseId: 'LEASE: 09-KA-2005',
    yield: '2.9M MT/Yr',
    sensorsOnline: 63,
    colorType: 'copper',
    craton: 'North Dharwar Belt',
    status: 'Active Concession'
  },
  {
    id: 'NODE-KA-06',
    name: 'Kalaburagi Limestone Corridor',
    state: 'Karnataka',
    district: 'Kalaburagi',
    coords: [17.330, 76.830],
    count: 51,
    company: 'The India Cements Limited',
    mineral: 'Limestone (Sedimentary)',
    mineralCategory: 'Limestone',
    leaseId: 'LEASE: 02-KA-2011',
    yield: '6.4M MT/Yr',
    sensorsOnline: 51,
    colorType: 'default',
    craton: 'Bhima Basin',
    status: 'Active Concession'
  },
  {
    id: 'NODE-KA-07',
    name: 'Dharwad Telemetry Station',
    state: 'Karnataka',
    district: 'Dharwad',
    coords: [15.450, 75.010],
    count: 54,
    company: 'Karnataka State Minerals Dev Corp',
    mineral: 'Manganese & Iron Ore',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 11-KA-2014',
    yield: '3.1M MT/Yr',
    sensorsOnline: 54,
    colorType: 'amber',
    craton: 'Central Dharwar Hub',
    status: 'Active Concession'
  },
  {
    id: 'NODE-KA-08',
    name: 'Uttara Kannada Coastal Station',
    state: 'Karnataka',
    district: 'Uttara Kannada',
    coords: [14.800, 74.130],
    count: 46,
    company: 'Port Logistics & Mineral Terminal',
    mineral: 'Iron Ore Export Terminal',
    mineralCategory: 'Iron Ore',
    leaseId: 'LEASE: 14-KA-2018',
    yield: '11.2M MT/Yr',
    sensorsOnline: 46,
    colorType: 'default',
    craton: 'Karwar Export Hub',
    status: 'Active Concession'
  },

  // --- RAJASTHAN MINERAL BELT (Image 1 Focus) ---
  {
    id: 'NODE-RJ-01',
    name: 'Khetri Copper Complex (Main Shaft)',
    state: 'Rajasthan',
    district: 'Jhunjhunu',
    coords: [27.985, 75.795],
    count: 51,
    company: 'Hindustan Copper Limited (HCL)',
    mineral: 'Copper Ore (Chalcopyrite & Bornite)',
    mineralCategory: 'Copper Ore',
    leaseId: 'LEASE: 01-RJ-1996',
    yield: '4.8M MT/Yr',
    sensorsOnline: 51,
    colorType: 'copper',
    craton: 'Khetri Copper Belt',
    status: 'Active Concession'
  },
  {
    id: 'NODE-RJ-02',
    name: 'Khetri West Sector & Kolihan Shaft',
    state: 'Rajasthan',
    district: 'Jhunjhunu',
    coords: [27.915, 75.720],
    count: 46,
    company: 'Hindustan Copper Limited',
    mineral: 'Copper Ore (Sulfide Grade)',
    mineralCategory: 'Copper Ore',
    leaseId: 'LEASE: 01-RJ-1996',
    yield: '3.2M MT/Yr',
    sensorsOnline: 46,
    colorType: 'copper',
    craton: 'Khetri Copper Belt',
    status: 'Active Concession'
  },
  {
    id: 'NODE-RJ-03',
    name: 'Kayad Lead-Zinc Deep Mine',
    state: 'Rajasthan',
    district: 'Ajmer',
    coords: [26.530, 74.690],
    count: 40,
    company: 'Hindustan Zinc Ltd (HZL / Vedanta)',
    mineral: 'Lead Zinc Ore (Sphalerite & Galena)',
    mineralCategory: 'Lead Zinc Ore',
    leaseId: 'LEASE: 10-RJ-2014',
    yield: '1.4M MT/Yr',
    sensorsOnline: 40,
    colorType: 'amber',
    craton: 'Aravalli Mineral Belt',
    status: 'Active Concession'
  },
  {
    id: 'NODE-RJ-04',
    name: 'Gotan High-Purity Limestone',
    state: 'Rajasthan',
    district: 'Jodhpur',
    coords: [26.650, 73.730],
    count: 34,
    company: 'Marwar Cement Ltd',
    mineral: 'Limestone (Chemical & White Cement)',
    mineralCategory: 'Limestone',
    leaseId: 'LEASE: 12-RJ-2010',
    yield: '2.9M MT/Yr',
    sensorsOnline: 34,
    colorType: 'default',
    craton: 'Marwar Supergroup',
    status: 'Active Concession'
  },

  // --- BIHAR & TELANGANA BELTS ---
  {
    id: 'NODE-BR-01',
    name: 'Rohtas Quarry Basin',
    state: 'Bihar',
    district: 'Rohtas',
    coords: [24.950, 84.020],
    count: 28,
    company: 'Dalmia Cement Bharat Limited',
    mineral: 'Limestone (Flux & Portland Grade)',
    mineralCategory: 'Limestone',
    leaseId: 'LEASE: 05-BR-2007',
    yield: '3.5M MT/Yr',
    sensorsOnline: 28,
    colorType: 'default',
    craton: 'Vindhyan Basin',
    status: 'Active Concession'
  },
  {
    id: 'NODE-TS-01',
    name: 'Godavari Mineral Corridor',
    state: 'Telangana',
    district: 'Mancherial',
    coords: [18.870, 79.450],
    count: 44,
    company: 'Telangana State Mineral Dev Corp',
    mineral: 'Limestone & Coal Strata',
    mineralCategory: 'Limestone',
    leaseId: 'LEASE: 06-TS-2015',
    yield: '8.2M MT/Yr',
    sensorsOnline: 44,
    colorType: 'default',
    craton: 'Pranhita-Godavari Valley',
    status: 'Active Concession'
  }
];

// Vector Concession Polygons (Image 1 & 2 Dash Outlines)
const CONCESSION_POLYGONS = [
  {
    name: 'Khetri Copper Belt',
    leaseCode: 'LEASE: 01-RJ-1996',
    mineral: 'Copper Ore',
    coords: [
      [28.12, 75.60],
      [28.18, 75.92],
      [27.82, 76.05],
      [27.75, 75.68]
    ],
    color: '#386641',
    fillColor: 'rgba(56, 102, 65, 0.14)',
    center: [27.95, 75.75]
  },
  {
    name: 'Singhbhum Craton & Keonjhar Sector',
    leaseCode: 'LEASE: 04-OR-2004',
    mineral: 'Iron Ore',
    coords: [
      [22.35, 85.10],
      [22.45, 85.75],
      [21.65, 85.80],
      [21.60, 85.05]
    ],
    color: '#B07D53',
    fillColor: 'rgba(176, 125, 83, 0.15)',
    center: [22.05, 85.45]
  },
  {
    name: 'Bailadila Range Concession',
    leaseCode: 'LEASE: 06-CG-2008',
    mineral: 'Iron Ore',
    coords: [
      [18.95, 81.10],
      [18.90, 81.45],
      [18.45, 81.40],
      [18.50, 81.05]
    ],
    color: '#B07D53',
    fillColor: 'rgba(176, 125, 83, 0.14)',
    center: [18.70, 81.25]
  },
  {
    name: 'Bellary Complex (Sandur Basin)',
    leaseCode: 'LEASE: 08-KA-2012',
    mineral: 'Iron Ore',
    coords: [
      [15.35, 76.35],
      [15.30, 76.85],
      [14.85, 76.78],
      [14.90, 76.28]
    ],
    color: '#B07D53',
    fillColor: 'rgba(176, 125, 83, 0.16)',
    center: [15.10, 76.55]
  }
];

// Vector State Boundary Coordinates for Karnataka (Image 2 outline)
const KARNATAKA_BOUNDARY = [
  [18.45, 77.40], [17.80, 77.65], [17.30, 77.20], [16.50, 77.50],
  [15.80, 76.90], [15.20, 77.30], [14.60, 77.10], [14.00, 77.50],
  [13.80, 78.20], [13.20, 78.40], [12.70, 77.70], [11.60, 77.10],
  [11.80, 76.20], [12.20, 75.80], [12.50, 75.00], [13.40, 74.70],
  [14.20, 74.40], [14.90, 74.10], [15.80, 74.20], [16.20, 74.80],
  [16.80, 75.50], [17.40, 76.20], [18.10, 76.90], [18.45, 77.40]
];

// Inter-Hub Dynamic Spline Connections
const NETWORK_CONNECTIONS = [
  // Rajasthan Copper to Gujarat/Sindh ports
  [[27.985, 75.795], [26.530, 74.690]],
  [[26.530, 74.690], [24.950, 84.020]],
  // Central corridor: Singhbhum - Keonjhar - Bailadila
  [[22.146, 85.524], [22.016, 85.426]],
  [[22.016, 85.426], [21.845, 85.120]],
  [[21.845, 85.120], [18.825, 82.915]],
  [[18.825, 82.915], [18.705, 81.245]],
  // Bailadila to Bellary Sandur Complex
  [[18.705, 81.245], [15.085, 76.540]],
  // Bellary internal hub to Kudremukh & Coastal Mangalore
  [[15.085, 76.540], [15.050, 76.620]],
  [[15.085, 76.540], [14.220, 76.400]],
  [[14.220, 76.400], [13.210, 75.250]],
  [[15.085, 76.540], [14.800, 74.130]],
  [[15.850, 74.500], [15.450, 75.010]],
  [[15.450, 75.010], [15.085, 76.540]],
  [[15.085, 76.540], [17.330, 76.830]]
];

// ============================================================================
// 2. State & Map Layer Management
// ============================================================================
let map;
let markerLayerGroup;
let hotspotLayerGroup;
let concessionLayerGroup;
let splineLayerGroup;
let boundaryLayerGroup;
let currentBasemap = 'satellite';

const appState = {
  selectedMineral: 'ALL',
  selectedState: 'ALL',
  selectedDistrict: 'ALL',
  showMines: true,
  showHotspots: true,
  showLeases: true,
  activeNode: null,
};

// ============================================================================
// 3. Map Initialization (Leaflet + Esri World Imagery Basemap)
// ============================================================================
function initGeospatialMap() {
  // Center over Indian subcontinent
  map = L.map('map', {
    center: [20.8, 80.0],
    zoom: 5.4,
    minZoom: 4.5,
    maxZoom: 16,
    zoomControl: false, // We use custom Image 1 top-right floating controls
    attributionControl: false,
  });

  // Layer Groups
  hotspotLayerGroup = L.layerGroup().addTo(map);
  concessionLayerGroup = L.layerGroup().addTo(map);
  boundaryLayerGroup = L.layerGroup().addTo(map);
  splineLayerGroup = L.layerGroup().addTo(map);
  markerLayerGroup = L.layerGroup().addTo(map);

  // Basemap Tiles: Esri High-Resolution World Imagery
  setBasemap('satellite');

  // Draw GeoJSON-style vector state boundaries & concessions
  renderBoundariesAndConcessions();

  // Draw Dynamic Network Connector Splines
  renderNetworkSplines();

  // Plot Tactical Nodes and Hotspots
  updatePlottedLayers();

  // Setup DOM Event Listeners
  setupEventListeners();

  // Simulated live telemetry latency jitter
  startTelemetrySimulation();
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
// 4. Vector Boundaries & Concession Outlines (Image 1 & 2 Synthesized)
// ============================================================================
function renderBoundariesAndConcessions() {
  boundaryLayerGroup.clearLayers();
  concessionLayerGroup.clearLayers();
  hotspotLayerGroup.clearLayers();

  // 1. Karnataka State Outline (Direct Reference: Image 2 Dashed White Vector)
  const karnatakaPolygon = L.polygon(KARNATAKA_BOUNDARY, {
    color: 'rgba(255, 255, 255, 0.85)',
    weight: 1.6,
    dashArray: '5, 5',
    fillColor: 'transparent',
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  });
  boundaryLayerGroup.addLayer(karnatakaPolygon);

  // 2. Specific Concession Blocks & Hotspots (Direct Reference: Image 1)
  CONCESSION_POLYGONS.forEach((c) => {
    // Concession Dashed Polygon
    const poly = L.polygon(c.coords, {
      color: c.color,
      weight: 1.5,
      dashArray: '4, 4',
      fillColor: c.fillColor,
      fillOpacity: 1,
      interactive: true,
    });

    // Concession tooltip
    poly.bindTooltip(
      `<div class="concession-lease-badge">${c.leaseCode}</div>`,
      { permanent: true, direction: 'top', className: 'custom-leaflet-tooltip' }
    );

    poly.on('click', () => {
      showToast(`Selected Concession: ${c.name} (${c.leaseCode})`, 'info');
      map.flyToBounds(poly.getBounds(), { padding: [80, 80], duration: 1.2 });
    });

    concessionLayerGroup.addLayer(poly);

    // ST-DBSCAN Style Soft Density Hotspot Radial Glow Overlay
    const hotspotCircle = L.circle(c.center, {
      radius: c.mineral === 'Copper Ore' ? 38000 : 54000,
      color: 'transparent',
      fillColor: c.color,
      fillOpacity: 0.22,
      interactive: false,
    });
    hotspotLayerGroup.addLayer(hotspotCircle);
  });
}

// ============================================================================
// 5. Dynamic Network Connector Splines (Image 2 Curved Links)
// ============================================================================
function renderNetworkSplines() {
  splineLayerGroup.clearLayers();

  NETWORK_CONNECTIONS.forEach((coords) => {
    // Polyline connecting adjacent telemetry clusters
    const spline = L.polyline(coords, {
      color: 'rgba(237, 230, 220, 0.55)',
      weight: 1.3,
      dashArray: '4, 6',
      lineCap: 'round',
      interactive: false,
    });
    splineLayerGroup.addLayer(spline);
  });
}

// ============================================================================
// 6. Tactical Telemetry Nodes with Numerical Counts (Image 2 & 1)
// ============================================================================
function updatePlottedLayers() {
  markerLayerGroup.clearLayers();

  // Filter based on UI State
  const filteredNodes = TELEMETRY_NODES.filter((n) => {
    const matchMineral = appState.selectedMineral === 'ALL' || n.mineralCategory === appState.selectedMineral;
    const matchState = appState.selectedState === 'ALL' || n.state === appState.selectedState;
    const matchDistrict = appState.selectedDistrict === 'ALL' || n.district === appState.selectedDistrict;
    return matchMineral && matchState && matchDistrict;
  });

  // Update Footer Count
  document.getElementById('totalPlottedDisplay').textContent = (filteredNodes.length * 78 + 12).toLocaleString();

  if (!appState.showMines) return;

  filteredNodes.forEach((node) => {
    // Tactical Node HTML Icon
    const customIcon = L.divIcon({
      className: 'tactical-div-icon',
      html: `
        <div class="tactical-node-marker">
          <div class="node-halo"></div>
          <div class="node-circle ${node.colorType === 'copper' ? 'node-copper' : node.colorType === 'amber' ? 'node-amber' : ''}">
            ${node.count}
          </div>
          <div class="node-label-pill">${node.craton || node.name}</div>
        </div>
      `,
      iconSize: [60, 60],
      iconAnchor: [30, 30],
    });

    const marker = L.marker(node.coords, { icon: customIcon });

    marker.on('click', () => {
      openNodeInspector(node);
    });

    markerLayerGroup.addLayer(marker);
  });
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

  inspectTitle.textContent = node.name;
  inspectSubtitle.textContent = `${node.district}, ${node.state}`;
  inspectCompany.textContent = node.company;
  inspectMineral.textContent = node.mineral;
  inspectLease.textContent = node.leaseId;
  inspectYield.textContent = node.yield;

  inspectorCard.classList.remove('hidden');

  // Slight camera pan to position card neatly
  map.panTo(node.coords, { animate: true, duration: 0.6 });
}

btnCloseInspect.addEventListener('click', () => {
  inspectorCard.classList.add('hidden');
  appState.activeNode = null;
});

btnInspectZoom.addEventListener('click', () => {
  if (appState.activeNode) {
    map.flyTo(appState.activeNode.coords, 9.5, { duration: 1.4 });
    showToast(`Isolating Craton: ${appState.activeNode.craton}`, 'info');
  }
});

btnInspectDb.addEventListener('click', () => {
  inspectorCard.classList.add('hidden');
  openDatabaseDrawer(appState.activeNode ? appState.activeNode.name : '');
});

// ============================================================================
// 8. Event Handlers, Cascading Filters & Reactive Camera
// ============================================================================
function setupEventListeners() {
  const mineralSelect = document.getElementById('filterMineralSelect');
  const stateSelect = document.getElementById('filterStateSelect');
  const districtSelect = document.getElementById('filterDistrictSelect');
  const btnReset = document.getElementById('btnFilterReset');

  // Mineral Select Reactive Filter
  mineralSelect.addEventListener('change', (e) => {
    appState.selectedMineral = e.target.value;
    updatePlottedLayers();

    // Reactive flyTo based on mineral belt
    if (appState.selectedMineral === 'Iron Ore') {
      map.flyTo([21.8, 85.3], 7.5, { duration: 1.5 });
      showToast('Filtering: Major Iron Ore Cratons (Odisha-Jharkhand-Bailadila)', 'info');
    } else if (appState.selectedMineral === 'Copper Ore') {
      map.flyTo([27.95, 75.75], 8.5, { duration: 1.5 });
      showToast('Filtering: Khetri Copper Belt (Rajasthan)', 'info');
    } else if (appState.selectedMineral === 'Bauxite') {
      map.flyTo([18.9, 82.9], 7.8, { duration: 1.5 });
      showToast('Filtering: Bauxite High-Alumina Belts', 'info');
    }
  });

  // State Select Reactive Filter
  stateSelect.addEventListener('change', (e) => {
    appState.selectedState = e.target.value;
    updatePlottedLayers();

    // Camera transitions matching state boundaries
    if (appState.selectedState === 'Karnataka') {
      map.flyTo([14.8, 75.8], 6.8, { duration: 1.4 });
      showToast('Focusing: Karnataka Mineral Corridor & Sandur Basin', 'info');
    } else if (appState.selectedState === 'Odisha') {
      map.flyTo([21.0, 84.8], 7.2, { duration: 1.4 });
      showToast('Focusing: Odisha Mineral Concessions (Keonjhar / Koraput)', 'info');
    } else if (appState.selectedState === 'Jharkhand') {
      map.flyTo([23.2, 85.4], 7.4, { duration: 1.4 });
      showToast('Focusing: Jharkhand Singhbhum Iron & Chotanagpur Belt', 'info');
    } else if (appState.selectedState === 'Rajasthan') {
      map.flyTo([26.8, 74.8], 7.0, { duration: 1.4 });
      showToast('Focusing: Rajasthan Aravalli & Khetri Belts', 'info');
    } else if (appState.selectedState === 'Chhattisgarh') {
      map.flyTo([20.5, 82.0], 7.0, { duration: 1.4 });
      showToast('Focusing: Chhattisgarh Bailadila Range & Balrampur', 'info');
    } else {
      map.flyTo([20.8, 80.0], 5.4, { duration: 1.4 });
    }
  });

  // District Select Reactive Filter
  districtSelect.addEventListener('change', (e) => {
    appState.selectedDistrict = e.target.value;
    updatePlottedLayers();

    if (appState.selectedDistrict !== 'ALL') {
      const match = TELEMETRY_NODES.find((n) => n.district === appState.selectedDistrict);
      if (match) {
        map.flyTo(match.coords, 9.2, { duration: 1.5 });
        showToast(`Targeting District Hub: ${match.district}`, 'info');
      }
    }
  });

  // Reset Button
  btnReset.addEventListener('click', () => {
    mineralSelect.value = 'ALL';
    stateSelect.value = 'ALL';
    districtSelect.value = 'ALL';
    appState.selectedMineral = 'ALL';
    appState.selectedState = 'ALL';
    appState.selectedDistrict = 'ALL';
    updatePlottedLayers();
    map.flyTo([20.8, 80.0], 5.4, { duration: 1.5 });
    showToast('Resetting telemetry grid to Pan-India view', 'info');
  });

  // Layer Toggle Chips
  const toggleMinesChip = document.getElementById('toggleMinesChip');
  const toggleHotspotsChip = document.getElementById('toggleHotspotsChip');
  const toggleLeasesChip = document.getElementById('toggleLeasesChip');

  toggleMinesChip.addEventListener('click', () => {
    appState.showMines = !appState.showMines;
    toggleMinesChip.classList.toggle('active', appState.showMines);
    updatePlottedLayers();
  });

  toggleHotspotsChip.addEventListener('click', () => {
    appState.showHotspots = !appState.showHotspots;
    toggleHotspotsChip.classList.toggle('active', appState.showHotspots);
    if (appState.showHotspots) {
      map.addLayer(hotspotLayerGroup);
    } else {
      map.removeLayer(hotspotLayerGroup);
    }
  });

  toggleLeasesChip.addEventListener('click', () => {
    appState.showLeases = !appState.showLeases;
    toggleLeasesChip.classList.toggle('active', appState.showLeases);
    if (appState.showLeases) {
      map.addLayer(concessionLayerGroup);
      map.addLayer(boundaryLayerGroup);
    } else {
      map.removeLayer(concessionLayerGroup);
      map.removeLayer(boundaryLayerGroup);
    }
  });

  // Top-Right Map Controls
  document.getElementById('ctrlZoomIn').addEventListener('click', () => map.zoomIn());
  document.getElementById('ctrlZoomOut').addEventListener('click', () => map.zoomOut());
  document.getElementById('ctrlRecenter').addEventListener('click', () => {
    map.flyTo([20.8, 80.0], 5.4, { duration: 1.2 });
  });

  const ctrlLayerToggle = document.getElementById('ctrlLayerToggle');
  ctrlLayerToggle.addEventListener('click', () => {
    currentBasemap = currentBasemap === 'satellite' ? 'tactical' : currentBasemap === 'tactical' ? 'hybrid' : 'satellite';
    setBasemap(currentBasemap);
    showToast(`Basemap mode: ${currentBasemap.toUpperCase()}`, 'info');
  });

  // Prime Craton Tag Quick Zoom
  document.getElementById('primeBeltTag').addEventListener('click', () => {
    map.flyTo([22.05, 85.45], 8.2, { duration: 1.5 });
    showToast('Focusing Prime Zone: Odisha-Jharkhand Iron Belt', 'info');
  });

  // Global Search (Ctrl + K)
  const globalSearchInput = document.getElementById('globalSearchInput');
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      globalSearchInput.focus();
    }
  });

  globalSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = globalSearchInput.value.trim().toLowerCase();
      if (!q) return;

      const found = TELEMETRY_NODES.find(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.mineral.toLowerCase().includes(q) ||
          n.district.toLowerCase().includes(q) ||
          n.state.toLowerCase().includes(q) ||
          n.leaseId.toLowerCase().includes(q)
      );

      if (found) {
        map.flyTo(found.coords, 9.5, { duration: 1.5 });
        openNodeInspector(found);
        showToast(`Located: ${found.name}`, 'success');
      } else {
        showToast('No exact coordinate match found in national grid.', 'error');
      }
    }
  });

  // Left Vertical Dock Navigation
  document.getElementById('dockBtnMap').addEventListener('click', () => {
    document.querySelectorAll('.dock-btn').forEach((b) => b.classList.remove('active'));
    document.getElementById('dockBtnMap').classList.add('active');
    map.flyTo([20.8, 80.0], 5.4, { duration: 1.2 });
  });

  document.getElementById('dockBtnDatabase').addEventListener('click', () => {
    openDatabaseDrawer();
  });

  document.getElementById('btnOpenDatabaseModal').addEventListener('click', () => {
    openDatabaseDrawer();
  });

  document.getElementById('dockBtnReports').addEventListener('click', () => {
    showToast('Generating Indian Bureau of Mines (IBM) Quarterly Telemetry Report...', 'info');
  });

  document.getElementById('dockBtnAuth').addEventListener('click', () => {
    document.getElementById('authModal').showModal();
  });

  document.getElementById('btnCloseAuthModal').addEventListener('click', () => {
    document.getElementById('authModal').close();
  });

  document.getElementById('btnSwitchAccount').addEventListener('click', () => {
    document.getElementById('authModal').close();
    showToast('Switching workstation user session...', 'info');
  });

  document.getElementById('btnLockWorkstation').addEventListener('click', () => {
    document.getElementById('authModal').close();
    showToast('Workstation locked. Session secured with AES-256.', 'info');
  });
}

// ============================================================================
// 9. Slide-Over Database Explorer Drawer
// ============================================================================
const databaseDrawer = document.getElementById('databaseDrawer');
const btnCloseDrawer = document.getElementById('btnCloseDrawer');
const drawerTableBody = document.getElementById('drawerTableBody');
const drawerSearchInput = document.getElementById('drawerSearchInput');
const drawerRecordCount = document.getElementById('drawerRecordCount');

function openDatabaseDrawer(filterQuery = '') {
  databaseDrawer.classList.remove('hidden');
  drawerSearchInput.value = filterQuery;
  renderDrawerTable(filterQuery);
}

btnCloseDrawer.addEventListener('click', () => {
  databaseDrawer.classList.add('hidden');
});

function renderDrawerTable(query = '') {
  const q = query.toLowerCase().trim();
  const rows = TELEMETRY_NODES.filter((n) => {
    if (!q) return true;
    return (
      n.name.toLowerCase().includes(q) ||
      n.company.toLowerCase().includes(q) ||
      n.mineral.toLowerCase().includes(q) ||
      n.district.toLowerCase().includes(q) ||
      n.state.toLowerCase().includes(q)
    );
  });

  drawerRecordCount.textContent = `${rows.length} Registered Mines`;
  drawerTableBody.innerHTML = '';

  if (rows.length === 0) {
    drawerTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">No records found matching query.</td></tr>`;
    return;
  }

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td><strong>${r.name}</strong></td>
      <td>${r.district}, ${r.state}</td>
      <td>${r.company}</td>
      <td><span style="font-weight:600; color: var(--copper-primary);">${r.mineralCategory}</span></td>
      <td><span style="color: var(--accent-green); font-weight:600;">&bull; ${r.status}</span></td>
    `;

    tr.addEventListener('click', () => {
      databaseDrawer.classList.add('hidden');
      map.flyTo(r.coords, 9.5, { duration: 1.4 });
      openNodeInspector(r);
    });

    drawerTableBody.appendChild(tr);
  });
}

drawerSearchInput.addEventListener('input', (e) => {
  renderDrawerTable(e.target.value);
});

// ============================================================================
// 10. Toast Notification System
// ============================================================================
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');

  let icon = '&bull;';
  if (type === 'success') icon = '&#10003;';
  if (type === 'error') icon = '&#9888;';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Simulated real-time telemetry latency jitter
function startTelemetrySimulation() {
  const latencyDisplay = document.getElementById('latencyDisplay');
  setInterval(() => {
    const jitter = Math.floor(98 + Math.random() * 24);
    if (latencyDisplay) {
      latencyDisplay.textContent = `${jitter}ms`;
    }
  }, 4500);
}

// ============================================================================
// 11. App Boot
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initGeospatialMap();
});

# MINERVA v2 — Implementation Plan

> **Status (2026-10-26)**
> - Done: Phase 0 (lease view, DSA tab, search bar, logo), Phase 1 (468 mines from OSM/Wikidata, schema v2, R*Tree), Phase 2 (server-side auth, LRU sessions, sliding-window lockout, roles), Phase 3 (Trie search, typo correction, recent searches), Phase 4 (notification rules, heap scheduler, read state; delivered by 30 s polling instead of SSE), clusters from Phase 6 (grid clustering + convex hull on the existing Leaflet map), orphaned pages removed (Phase 8).
> - Not done: Phase 5 (MapLibre migration, komoot-style sidebar, QuadTree k-NN), DBSCAN mining belts (rest of Phase 6), Phase 7 (3D terrain, deck.gl layers, elevation profile), moving the browser tests into the repo (Phase 8).

National mine coverage, a komoot-style map, real authentication, live search and notifications, and a 3D map, each built on a data structure or algorithm.

---

## 0. Where we are today

| Area | Current state (commit `01c5ec0`) | Gap |
|---|---|---|
| Data | 8 mines, 10 locations, 9 companies, 8 leases in `minerva.db` | Nowhere near national coverage |
| Map | Leaflet 2D, satellite tiles, 8 mine dots, transport-network card | No clusters, no sidebar, no click card, no 3D |
| Login | Client-side `DEMO_ACCOUNTS` object in `app.js`; session is a `sessionStorage` flag | Anyone can bypass it from DevTools; API routes are unprotected |
| Search | One handler, substring filter over the 8 mines in the browser | No suggestions, no typo tolerance, doesn't scale |
| Notifications | Priority-queue toasts, built from mine status once at login | Not persisted, no read/unread, not live |
| DSA already in place | Stack, Queue/PriorityQueue (heap), BST, AVL, Dijkstra, Prim, Kruskal, Union-Find | — |

Constraints we keep from earlier feedback:
- **Minimalist.** No glowing or pulsing UI, no fake numbers.
- **Honest data.** Every figure comes from the database or is labelled as an estimate.
- **Phased delivery.** Push to git after each phase, before the next one starts.

---

## 1. Target experience (inspired by the komoot screenshot)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▣ MINERVA     [ Search mines, minerals, districts, lease IDs… ⌘K ]  🔔3  (JG)▾│
├───────────────────────┬──────────────────────────────────────────────────────┤
│ ‹ collapse            │ [Map content ▾]                     [Route] [Measure]│
│ ┌───────────────────┐ │                                                  N ◉ │
│ │ terrain thumbnail │ │      ( 23 )  ← cluster, coloured by top mineral  ⊕ + │
│ └───────────────────┘ │         ╲                                          − │
│ Keonjhar North Block  │   ● ● ●  ╲  ← hovering a cluster draws its hull       │
│ Iron ore · Operational│   ●  [ click card ]                                   │
│ ───────────────────── │      Keonjhar North Block                             │
│ LEASE                 │      Iron ore 64.8% Fe · Odisha                       │
│ OR-KJ-2004-981        │      Lease to 2044 · 6.4 MT (2024)                    │
│ 2004 → 2044  ███████░ │      [Details]  [Route from here]                     │
│ 18 y left · 15% ASP   │                                                       │
│ 1,482 ha · Stage-II   │ ┌────┐                                                │
│ ───────────────────── │ │Lay-│ ← layer thumbnail (Topo / Satellite / 3D)      │
│ PRODUCTION  ▂▃▅▆ 6.4MT│ │ers │                                                │
│ ───────────────────── │ └────┘                                                │
│ NEARBY (k-nearest)    ├──────────────────────────────────────────────────────┤
│ ① Singhbhum  17.6 km  │ 542 km   3 hops   ↑ 610 m  ↓ 820 m  ▁▂▃▅▃▂▁ elevation │
│ ② Sukinda   119.1 km  │ distance  links    gain     loss    profile     [▾]  │
└───────────────────────┴──────────────────────────────────────────────────────┘
```

What we take from komoot:
- **Collapsible left sidebar.** A list view, or a detail view with numbered waypoints and a photo or thumbnail header.
- **Floating chip** at the top-left of the map: "Map content ▾".
- **Action buttons** at the top-right of the map.
- **Compass, locate and zoom stack** on the right edge.
- **Layer thumbnail switcher** at the bottom-left.
- **Bottom stats bar** with an elevation profile when a route is active.
- **Topographic basemap** (komoot's SwissTopo look) as the default.

---

## 2. Phase plan

Each phase ends with:
- unit tests, API tests and a browser run-through,
- `git commit` and `git push` before the next phase starts.

| Phase | Theme | New DSA | Size |
|---|---|---|---|
| 0 | Quick changes: login logo, Reports → Lease expiry view, DSA guide tab, better search bar | — (the guide documents existing DSA) | S |
| 1 | National mine dataset + schema v2 | Hash map dedupe, R*Tree spatial index | L |
| 2 | Real authentication | LRU cache (hash map + doubly linked list), sliding-window queue, RBAC set | M |
| 3 | Dynamic search | Trie, Levenshtein (DP), top-k min-heap, LRU recent searches | M |
| 4 | Live notifications | Min-heap scheduler, priority queue, SSE fan-out | M |
| 5 | Map engine + komoot layout (2D) | QuadTree, k-nearest neighbours | L |
| 6 | Clusters and mining belts | Grid/zoom clustering, DBSCAN, convex hull (monotone chain) | M |
| 7 | 3D visualisation | Polyline sampling for the elevation profile, great-circle interpolation | L |
| 8 | Hardening, regression, docs | — | S |

Order rationale:
- Phase 0 is small and visible, and works on the current Leaflet app, so it ships first.
- Data comes next because every later phase needs volume to be meaningful.
- Auth comes before notifications because read/unread state is per user.
- The map engine is replaced (phase 5) before clusters and 3D, so we don't build them twice.

---

## Phase 0 — Quick changes

### 0.1 Login logo

- The login card's brand panel currently draws an inline two-arch SVG. Replace it with the MINERVA mark, which is already in the repo as `minerva-logo.png` (500 × 500, black on transparent). The nav bar already uses that file.
- Use `<img src="minerva-logo.png" alt="MINERVA">` at about 44 px, keeping the existing title and subtitle beside it.
- Optional: trace the mark into a real vector `minerva-logo.svg`. Today's `minerva-logo.svg` only wraps the PNG as base64, so it doesn't stay sharp when scaled. A white variant (`minerva-logo-white.png/svg`) exists only in the parent clone. Copy it in if a dark background needs it.

### 0.2 Reports view becomes the Lease expiry view

Remove the archival publications completely and keep only the AVL lease index.

- **Front end, remove:**
  - the publications list,
  - the document preview dialog (`#pdfPreviewModal`, its print and download buttons),
  - `ARCHIVAL_PUBLICATIONS_DATA`, `renderPublicationsList`, `openPublicationInspector`, `downloadPublicationFile` and their CSS.
- **Back end, remove:** `GET /api/reports`, `GET /api/reports/:id/download`, the `/api/publications` redirects, the `ARCHIVAL_PUBLICATIONS` array, and `apiService.getReports` / `getReportDownloadUrl`.
- **Rename:** the dock button "Reports" becomes **"Lease expiry"** (calendar/clock icon), and the route `#reports` becomes `#leases`, with `#reports` redirecting so old links still work.
- **The view, top to bottom:**
  1. Title "Lease expiry index" with a one-line explanation.
  2. Summary row of real counts: expiring within 1 / 5 / 10 years, already expired.
  3. Year-range search, with the results table showing lease, mine, company, end date and years left.
  4. Add/remove a lease, with the rotation it caused.
  5. The AVL tree drawing with balance factors, and the height compared with an unbalanced BST.
- Clicking a lease row opens its mine (map sidebar, or database dossier until phase 5 lands).
- The global search on this view filters leases by ID, mine or company.
- Once phase 1 imports more mines, this view shows only leases that have real dates; mines without a lease record are left out, not given guessed dates.

### 0.3 New "DSA concepts" tab

A fifth dock item, **DSA** (route `#dsa`), that explains every data structure and algorithm in the project and links each to where it runs.

- **Layout.** A left list of concepts grouped by kind:
  - Linear: stack, queue
  - Trees: BST, AVL, Trie, QuadTree, R*Tree
  - Heaps: priority queue, scheduler
  - Hashing: LRU cache, hash map, hash set
  - Graphs: Dijkstra, Prim, Kruskal, union-find
  - Geometry and clustering: convex hull, DBSCAN, grid clustering
  - Dynamic programming: Levenshtein

  Selecting a concept shows its detail panel on the right.
- **Each detail panel has:**
  - What it is, in two or three sentences.
  - **Where MINERVA uses it**, with a **"Try it"** button that opens that feature already set up. For example, it opens the Minerals tab with Fe 50–70% filled in, or the map route planner with two mines selected.
  - **Operations and complexity**, as a small table (insert / search / delete, time and space).
  - **A small live demo** that reuses the existing SVG tree and graph renderers, with step buttons:
    - push/pop on a stack;
    - enqueue alerts and watch the heap reorder;
    - insert keys into BST vs AVL side by side to show the skew;
    - step through Dijkstra on a 6-node graph;
    - Kruskal accepting and rejecting edges.
  - **Live numbers from the running app**, all real:
    - SQL history depth,
    - pending alerts in the queue,
    - BST/AVL height,
    - nodes Dijkstra settled on the last route,
    - LRU session-cache hit rate and Trie node count (once phases 2–3 exist).
  - **Source.** File path (`dsa/AVLTree.js`) and the key function, shown as a short code excerpt loaded from the file.
- **Content source.** A single registry, `dsa/registry.js`, lists each concept with its name, group, file, feature route, complexity table and description. The tab renders from it, and every later phase adds its entries there. That keeps the tab, the README DSA table and the report in sync.
- Minimalist, like the rest: text and small diagrams, no animations except the step-by-step demos.

### 0.4 Better top search bar

Phase 3 adds the Trie-backed suggestions. This step fixes the bar itself, so it is useful straight away:

- **Scope chip** inside the bar showing what it searches in the current view ("Mines", "Minerals", "Leases", "DSA"). The placeholder changes with it, e.g. "Search leases by ID, mine or company".
- **Clear (×) button** when there is text; **Esc** clears; **/** and **Ctrl/⌘K** focus the bar. The `Ctrl + K` badge becomes a smaller `⌘K` / `Ctrl K` hint that hides while typing.
- **Result count** shown at the right of the bar ("3 of 8") while filtering a table, and **"No matches — clear search"** in the table instead of an empty state.
- **Map view:** Enter jumps to the best match, as now. A short dropdown also lists the top 5 matching mines, so you can pick one instead of guessing (phase 3 replaces this with the full grouped suggestions).
- **Highlight** the matched text in table rows.
- **Narrow screens:** the bar collapses to a search icon that expands over the top bar.
- On the DSA tab the bar filters the concept list.

**Done when:**
- The login shows the MINERVA mark.
- Nothing calls `/api/reports` and no publication code is left (grep).
- Every "Try it" button lands on a working, already-set-up feature.
- Search works with its scope label in every view.
- Browser run-through with no console errors, then commit and push.

---

## Phase 1 — National mine dataset

### 1.1 How many mines, and from where

Target: **as many real, named, geolocated mines in India as public data allows**, with every row traceable to a source. Coverage is built in tiers:

| Tier | Source | What it gives | Location precision |
|---|---|---|---|
| A | Indian Bureau of Mines (IBM) publications: *Indian Minerals Yearbook* state/mineral chapters and the mine directory / list of reporting mines | Mine name, mineral, state, district, lessee (and often lease area) | District. Geocode to the district centroid. |
| B | Company disclosures (Coal India subsidiaries, NMDC, SAIL, NALCO, HZL, HCL, MOIL, state PSUs) | Major mines with production figures | Mine. Coordinates from the company site or a map. |
| C | OpenStreetMap through the Overpass API: `landuse=quarry`, `industrial=mine`, `man_made=mineshaft` with a `name`, filtered to India | Polygons and points with real coordinates | Exact |
| D | Wikipedia / Wikidata lists of mines in India (Wikidata items with coordinates) | Notable mines with coordinates and links | Exact |

Guidance:
- IBM's reporting-mine count for major non-fuel minerals is in the low thousands depending on the year. Coal adds several hundred more. Check the current figures in the latest yearbook before quoting any.
- A realistic first import is **300–1,000 mines** with coordinates (tiers B–D), plus district-level points from tier A for the rest.
- Every row carries `source`, `source_url` and `location_precision` (`exact` / `approximate` / `district`). The UI shows district-level points with a hollow marker and the note "location approximate (district)".
- **Licensing.** OSM data is ODbL and needs attribution ("© OpenStreetMap contributors") on the map and in the README. Wikidata is CC0. For IBM and company documents, store facts only, not copied text, and record the source link.
- Data we don't have stays empty. Do not invent lease or production figures for imported mines. The existing 8 synthetic sample leases stay, marked `is_sample = 1`.

### 1.2 Schema v2 (3NF kept)

Changes to `schema.sql`, applied by a migration script so `minerva.db` keeps existing rows:

```sql
-- MINE: lease becomes optional (many imported mines have no public lease record)
ALTER: MINE.lease_id  -> NULL allowed, still UNIQUE
ADD:   MINE.location_precision TEXT CHECK (location_precision IN ('exact','approximate','district'))
ADD:   MINE.mine_type TEXT CHECK (mine_type IN ('Opencast','Underground','Mixed','Unknown'))
ADD:   MINE.source_id INTEGER REFERENCES DATA_SOURCE(source_id)
ADD:   MINE.is_sample INTEGER NOT NULL DEFAULT 0

CREATE TABLE DATA_SOURCE (source_id, name, url, licence, retrieved_on);
CREATE TABLE MINE_ALIAS  (mine_id, alias);           -- alternative spellings, for search
CREATE TABLE MINE_MEDIA  (media_id, mine_id, url, author, licence, source_url); -- Wikimedia Commons only

-- Spatial index for viewport and nearest-neighbour queries (verified: R*Tree works in this better-sqlite3 build)
CREATE VIRTUAL TABLE MINE_RTREE USING rtree(id, min_lng, max_lng, min_lat, max_lat);
```

`LOCATION` (state, district) already exists. The import fills in all districts it encounters, each with a centroid.

### 1.3 Import pipeline

`scripts/import/` (Node, run with `npm run import:mines`):
1. `fetch-osm.js`: run the Overpass query, write `data/raw/osm_mines.json`.
2. `fetch-wikidata.js`: run the SPARQL query for mines located in India, write `data/raw/wikidata_mines.json`.
3. `data/curated/*.csv`: hand-curated rows for tiers A and B (name, mineral, state, district, lessee, lat, lng, source_url).
4. `normalise.js`:
   - normalise names (lowercase, strip "mine/block/OCP/UG", transliteration variants);
   - deduplicate with a **hash map keyed by normalised name + district**, then merge any two points within 2 km that share a mineral (checked with the R*Tree);
   - map mineral names onto the `MINERAL` table.
5. `load.js`: insert in one transaction, rebuild `MINE_RTREE`, print a per-state count report.

### 1.4 API changes

- `GET /api/mines?bbox=minLng,minLat,maxLng,maxLat&zoom=…&mineral=…&state=…`: viewport query through `MINE_RTREE`, returns GeoJSON.
- `GET /api/mines/:id`: full record (lease, production, minerals, media, source).
- Existing routes are kept. `/api/dsa/*` graph routes switch to a k-nearest graph (see phase 5), since a complete graph over 1,000 mines is about 500k edges.

**Done when:** a state-by-state count report exists; the map can load all mines; every mine shows its source.

---

## Phase 2 — Real authentication

Move auth to the server. The client never sees PINs.

### 2.1 Tables

```sql
CREATE TABLE APP_USER (
  user_id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','inspector','surveyor','viewer')),
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT, created_at TEXT NOT NULL
);
CREATE TABLE USER_SESSION (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES APP_USER,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen TEXT NOT NULL);
CREATE TABLE PIN_RESET (user_id INTEGER, code_hash TEXT, expires_at TEXT, used INTEGER DEFAULT 0);
CREATE TABLE AUDIT_LOG (log_id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, ip TEXT, at TEXT);
```

The three demo accounts are seeded with **hashed** PINs:
- `USR-1024` (admin)
- `INS-4088` (inspector)
- `GEO-9921` (surveyor)

### 2.2 How it works

| Piece | Implementation | DSA |
|---|---|---|
| Password storage | `crypto.scrypt` with a per-user salt; compare with `crypto.timingSafeEqual` | — |
| Sign-in | `POST /api/auth/login` sets an `httpOnly`, `SameSite=Strict` cookie containing a random 32-byte token. Only the token's SHA-256 is stored. | — |
| Session lookup | Every API request needs its session checked. An **LRU cache** in front of `USER_SESSION`, built as a hash map plus a doubly linked list: O(1) get, put and evict, capacity about 1,000, TTL checked on read. | LRU cache |
| Brute-force protection | A **sliding-window queue** per username and per IP holds attempt timestamps. Expired ones are dequeued from the front. Five failures in 15 minutes locks the account for 15 minutes; the remaining time is shown. | Queue |
| Roles | `requirePermission()` middleware. Permissions are a **set** per role. SQL console = admin only; everyone can view. Lease editing (admin/inspector) is deferred: there is no lease-editing feature yet, so no `edit_leases` permission is defined until there is. | Hash set |
| PIN reset | `POST /api/auth/reset/request` creates a 6-digit code (hashed, 10-minute expiry, single use). It's still a demo with no email, so the code is shown on screen, and the page says so. `POST /api/auth/reset/confirm` checks the code and sets the new PIN. | — |
| Sign-out | `POST /api/auth/logout` deletes the session row and evicts it from the LRU. | — |
| Client | `GET /api/auth/me` on load decides whether to show the login page or the app. The `sessionStorage` flag and `DEMO_ACCOUNTS` are removed. | — |

### 2.3 Login page states

These all go in the existing minimalist card: no extra buttons, the inline error under the field, and the Enter key works throughout.
1. **Sign in**: identifier, PIN, show/hide, "Forgot PIN?", errors ("Wrong identifier or PIN", "Locked — try again in 12 min").
2. **Reset PIN**: two steps, as now, but checked on the server.
3. **Session expired**: on any 401 from the API, the app returns to sign-in with "Your session expired" and keeps the hash route, so you land back where you were.
4. **User menu** in the top bar: name, role and Sign out (the dock sign-out button moves here).

**Done when:**
- API calls without a cookie return 401.
- The sixth wrong PIN locks the account.
- An inspector can't open the SQL console.
- Unit tests pass for the LRU and sliding window.

---

## Phase 3 — Dynamic search

### 3.1 Server-side index

`dsa/Trie.js`, built at startup from every searchable term:
- mine names, aliases and IDs,
- lease IDs,
- mineral names,
- state and district names,
- company names.

Each Trie node keeps the **top-k entity IDs** for its prefix, ranked by weight: production, then whether the mine is operational, then name length. The ranking uses a small **min-heap of size k**, so a prefix lookup costs O(prefix length + k) with no subtree scan.

- **Typo tolerance.** If a prefix returns fewer than k results, fall back to **Levenshtein distance**, computed by DP with an early cutoff at distance 2, over a candidate set. The candidates are tokens sharing the first letter, from a bucketed list. So "keonjar" finds "Keonjhar" and "hemetite" finds "Hematite".
- **Freshness.** The index rebuilds after the import script runs or when a lease changes. Rebuilds are incremental: insert or remove a single term.
- **Endpoint.** `GET /api/search/suggest?q=keo&limit=8` returns results grouped as **Mines · Minerals · Places · Companies · Leases**, with the matched part marked.
- **Comparison.** SQLite FTS5 is also available (verified). The report can compare Trie and FTS5 latency, as the BST phase compared against a linear scan.

### 3.2 Search UI

- Suggestions dropdown under the search bar (debounced 120 ms), using the same groups as the endpoint.
- Keyboard: ↑/↓, Enter, Esc. Ctrl/⌘K focuses the bar.
- What selecting a result does depends on its type:
  - **Mine:** fly to it, open the sidebar detail and the click card.
  - **District or state:** fit the map to its bounds and list its mines in the sidebar.
  - **Mineral:** filter the map to that mineral.
  - **Company:** list that company's mines.
  - **Lease:** open the mine that holds the lease.
- **Recent searches.** Shown when the box is empty. Stored per user as an **LRU list** (most recent first, no duplicates, max 8) in a `SEARCH_HISTORY` table.
- In the database and lease-expiry views the same bar still filters the open table (phase 0 behaviour), with suggestions on top.
- The scope chip from phase 0 becomes a scope switcher: *This view* or *Everything*.
- Add Trie, Levenshtein and the LRU list to `dsa/registry.js`, so they appear on the DSA tab with a demo: type a prefix and watch the Trie walk.

**Done when:** the Trie, Levenshtein and LRU-list unit tests pass; typos within distance 2 resolve; every suggestion type navigates correctly.

---

## Phase 4 — Live notifications

### 4.1 What raises a notification (rules over real data)

| Rule | Priority |
|---|---|
| Lease `valid_till` within 1 year | CRITICAL |
| Lease `valid_till` within 5 years | WARNING |
| CTO (consent to operate) expired or within 90 days | CRITICAL |
| Mine status changed (e.g. to Under Maintenance) | WARNING |
| Production fell by more than 20% year on year (PRODUCTION table) | WARNING |
| Data import finished (N mines added) | INFO |
| New sign-in to your account from a new IP | INFO |

### 4.2 Mechanism

- `NOTIFICATION (notification_id, user_id NULL = everyone, rule, priority, mine_id, message, created_at)` and `NOTIFICATION_READ (notification_id, user_id, read_at)`.
- **Scheduler.** A **min-heap keyed by the next time each rule must be re-checked**: lease-expiry checks fire at the threshold dates, the production check runs daily. The server pops due items, evaluates the rule, inserts notifications and pushes the next check time. No polling of the whole table.
- **Delivery.** `GET /api/notifications/stream` uses **Server-Sent Events**. The server keeps a set of open connections per user and fans each new notification out to them. The existing `AlertQueueManager` (priority queue) still decides toast order on the client.
- **Bell panel.**
  - The unread count comes from the server and is shown as the badge.
  - Two tabs: *All* and *Unread*.
  - "Mark all read".
  - Clicking a notification opens the related mine.
  - Paginated list (cursor = `created_at`).
- If an admin changes a mine's status in the database view, inspectors who are signed in see a toast within a second.

**Done when:** the heap scheduler test passes (rules fire in due order); the read state persists across sign-out/sign-in; SSE reconnects after a server restart.

---

## Phase 5 — Map engine and komoot-style layout (2D first)

### 5.1 Switch from Leaflet to MapLibre GL JS

Leaflet can't do terrain or GPU-rendered layers with thousands of features. MapLibre GL JS is open source and needs no API key. It also renders the 3D work in phase 7, so we migrate once.

- **Install** `maplibre-gl` through npm; Vite bundles it.
  - Pin a release that is at least a few weeks old. The latest is 6.16.0, published on the day this plan was written.
- **Basemaps** (layer thumbnail switcher):
  1. **Topo**: the default, like komoot. A vector style from a keyless provider such as OpenFreeMap, or OpenTopoMap raster tiles.
  2. **Satellite**: the Esri World Imagery we use today.
  3. **Dark**: for presentations.

  Attribution is always visible: OSM, Esri, and the tile provider.
- **Data loading.** Mines come in as a GeoJSON source fed by `/api/mines?bbox=…` on `moveend` (debounced). Already-loaded viewports are cached so panning back costs nothing.

### 5.2 Layout components

| Component | Behaviour |
|---|---|
| **Left sidebar** (collapsible, like komoot's "‹") | **List mode:** mines in the current viewport or selected cluster, sorted by distance from the map centre. Each row shows a number, name, mineral dot and status. **Detail mode** (after a click), top to bottom: header (Wikimedia photo if licensed, else a small static terrain thumbnail of the site); name, status chip, mineral grade; **Lease card** with ID, executed → valid till, a progress bar of the lease period with years left, royalty, area, forest clearance, CTO validity; **Production** sparkline by year; **Minerals** with grades; **Nearby mines**, the k-nearest from the QuadTree, numbered ① ② ③ like komoot waypoints, each with distance; actions: *Route from here*, *Open in database*, *Download dossier*. |
| **Click card** (the "hover board") | Hovering a mine shows a one-line tooltip (name, mineral). Clicking opens a small card anchored to the mine: name, mineral and grade, state, lease end, latest production, and two buttons (*Details*, which opens the sidebar, and *Route from here*). One card at a time; Esc closes it. |
| **Map content ▾** chip | Toggles for: Mines · Clusters · Mining belts · Corridors · Heatmap · 3D columns · Lease areas. The state is saved per user. |
| **Right control stack** | Compass (click to reset bearing and pitch), locate-me, zoom +/−, 2D/3D toggle. |
| **Bottom stats bar** | Hidden by default. **Route active:** distance, links, Dijkstra nodes settled, elevation gain and loss, elevation profile (see phase 7). **Cluster or belt selected:** mine count, top minerals, total latest production, leases expiring within 5 years. |
| **Route mode** | Click *Route from here*, then click a destination mine on the map. The transport-network card shrinks into this flow. Prim/Kruskal stay under *Map content → Corridors*. |

### 5.3 DSA in this phase

- **`dsa/QuadTree.js`** (point quadtree over lng/lat):
  - viewport queries on the client, and **k-nearest neighbours** using a best-first search with a priority queue, which reuses our heap;
  - feeds "Nearby mines" in the sidebar;
  - builds the k-nearest corridor graph for Dijkstra in O(n log n) instead of O(n²).
- **Graph scaling at about 1,000 mines:**
  - Dijkstra runs on the k-nearest graph (k = 6).
  - Prim switches to the **O(V²) array version** on the complete graph. That is about a million operations, fine for 1,000 nodes, and the right choice for dense graphs; good material for the report.
  - Kruskal runs on the k-nearest graph, with a connectivity check through Union-Find (if the graph is disconnected the result is a forest, and the UI says so).

**Done when:** every phase 1–4 feature still works on the new map; every control in the layout is wired (Playwright test clicks each one); 1,000+ mines pan smoothly.

---

## Phase 6 — Clusters and mining belts (the highlight)

Two kinds of grouping, so the map reads clearly at every zoom.

### 6.1 Zoom clusters (density)

- Cluster bubbles show a count. Bubble size grows with count; colour is the cluster's **dominant mineral** (same palette as the mineral dots, no glow).
- **Implementation choice.** Either our own grid clustering per zoom level, using the QuadTree to bucket points, or MapLibre's built-in GeoJSON clustering, which is backed by `supercluster` (a KD-tree).
  - For the DSA report: build `dsa/GridCluster.js` ourselves and benchmark it against `supercluster`.
- **Hover a cluster:** draw the **convex hull** of its members, a light fill with a 1.5 px outline. The hull is computed with **Andrew's monotone chain** in O(n log n) (`dsa/ConvexHull.js`).
- **Click a cluster:** zoom to its bounds; the sidebar lists its members; the bottom bar shows cluster stats.

### 6.2 Mining belts (geology-like groupings)

- **DBSCAN** (`dsa/DBSCAN.js`) on haversine distance, with eps around 40 km and minPts 4, run per mineral family. This finds belts such as the iron-ore belt of Odisha–Jharkhand, the Bellary–Hospet iron belt and the Korba coalfield.
  - Neighbour lookups use the QuadTree, so the run is O(n log n) on average.
- **Drawing:**
  - each belt is drawn as its convex hull (optionally smoothed with a buffer), with a label: "Iron ore belt · 41 mines";
  - noise points (mines in no belt) are drawn normally.
- **Clicking a belt** gives the same sidebar and bottom bar as a cluster, plus "longest internal corridor" and "MST length of the belt", reusing Prim.
- Belt names come from a small curated lookup when a hull overlaps a known region. Otherwise the label is the dominant district.

**Done when:** unit tests pass for the convex hull (against brute force), DBSCAN (known clusters on a synthetic set) and grid clustering; hovering and clicking clusters and belts works with no overlapping labels.

---

## Phase 7 — 3D visualisation

All of this sits behind the **2D/3D toggle**. 2D topo stays the default, to keep the minimalist feel and work on low-end laptops. 3D respects `prefers-reduced-motion`.

| Feature | How | Notes |
|---|---|---|
| **Terrain** | MapLibre `raster-dem` source plus `map.setTerrain({ exaggeration: 1.4 })`, a hillshade layer and sky/fog. Source: open terrain tiles such as AWS Terrain Tiles (Terrarium encoding), no key. | Pitch up to 70°, rotate with right-drag or two fingers. |
| **3D production columns** | deck.gl `ColumnLayer` through `@deck.gl/mapbox` `MapboxOverlay`, interleaved with MapLibre. Height = latest production (log scale); colour = mineral. | Mines without production data get no column, never a guessed one. |
| **3D density** | deck.gl `HexagonLayer`: hex bins extruded by mine count, colour by count. | Replaces the flat heatmap when 3D is on. |
| **Routes and networks as arcs** | Dijkstra route and MST edges as deck.gl `ArcLayer`, or `PathLayer` draped on the terrain. A `TripsLayer` can animate a "haul" moving along the route. | Animation runs once, then stops. |
| **Lease areas** | If OSM supplies a polygon: a `fill-extrusion` a few metres high in the status colour. Otherwise none. Area-equivalent circles are optional and labelled "approximate". | — |
| **Camera** | Selecting a mine flies there with pitch 55° and a slight bearing. *Fly along route* moves the camera along the sampled route. *Orbit* rotates slowly around the selected mine. | Every camera move can be interrupted. |
| **Globe intro** | MapLibre's globe projection at low zoom, so first load zooms from the globe into India. Then Mercator. | Optional; skipped on reduced motion. |
| **Elevation profile** | Sample the route every ~500 m with great-circle interpolation, query terrain height (`map.queryTerrainElevation`), and draw an SVG area chart in the bottom bar. Hovering the chart moves a marker along the route; gain and loss come from summing positive and negative steps. | This is the komoot bottom-bar profile. Values are approximate (DEM resolution). |

Performance budget:
- 60 fps on 1,000 mines in 2D, 30 fps or more in 3D on an integrated GPU.
- Layers are built once and updated with `setData`, not recreated.
- Fall back to 2D if WebGL2 is unavailable.

**Done when:** the toggle flips cleanly both ways; all 2D features still work in 3D (clicks pick the columns too); screenshots for the report are taken in both modes.

---

## Phase 8 — Hardening and documentation

- Move the browser and unit tests (currently ad hoc) into the repo: `tests/unit/*.test.js` (`node:test`) and `tests/e2e/*.spec.js` (Playwright). Add `npm test`.
- Accessibility:
  - every control reachable by keyboard;
  - the click card is a dialog with focus return;
  - colour-blind-safe mineral palette;
  - contrast checked in 2D and 3D.
- README: data sources and licences, how to run the import, and screenshots. The DSA table is generated from `dsa/registry.js`, the same source as the DSA tab.
- DSA tab completeness check: every module in `dsa/` has a registry entry, a working "Try it" link and a demo (a test fails if one is missing).
- Clean-up: delete the orphaned `map.html`, `database.html`, `reports.html`, `auth*.html/js` and `*_original.*`, after you confirm nothing else uses them.

---

## 3. Full DSA map after v2

Every row also appears on the in-app **DSA tab** (phase 0.3) with a "Try it" link, a demo and live numbers.

| Structure / algorithm | Feature | Complexity |
|---|---|---|
| Stack (two-stack undo/redo) | SQL console history | O(1) |
| Queue, priority queue (binary heap) | Toast order, brute-force window, k-NN search frontier | O(1) / O(log n) |
| BST | Mineral assay range search | O(h + k) |
| AVL tree | Lease expiry view (the former Reports view) | O(log n + k) |
| Dijkstra | Shortest route | O((V + E) log V) |
| Prim (heap and O(V²) array), Kruskal + Union-Find | Minimum network | O(E log V) / O(V²) |
| **Hash map** | Import deduplication | O(1) average |
| **R*Tree** (SQLite) | Viewport and bbox queries on the server | O(log n + k) |
| **LRU cache** (hash map + doubly linked list) | Session lookup, recent searches | O(1) |
| **Sliding-window queue** | Login rate limiting / lockout | O(1) amortised |
| **Hash set** | Role permissions | O(1) |
| **Trie with top-k** | Search suggestions | O(m + k) |
| **Levenshtein (DP)** | Typo-tolerant search | O(m·n), cut off at 2 |
| **Min-heap scheduler** | Notification rules | O(log n) per event |
| **QuadTree** + best-first k-NN | Nearby mines, corridor graph, client viewport | O(log n) average |
| **Grid clustering** (vs supercluster KD-tree) | Zoom clusters | O(n) per zoom |
| **DBSCAN** | Mining belts | O(n log n) average with QuadTree |
| **Convex hull** (monotone chain) | Cluster and belt highlight | O(n log n) |

---

## 4. Decisions to confirm (recommended defaults in bold)

1. **Mine scope.** **All major minerals plus coal**, with minor minerals (stone, sand) excluded because OSM has thousands of unnamed quarries; or include everything.
2. **Basemap provider.** **Keyless (OpenFreeMap / OpenTopoMap + Esri imagery)**, or MapTiler with a free API key for a nicer topo and terrain.
3. **3D by default.** **Off, with a 2D/3D toggle**, or on.
4. **Photos in the sidebar.** **Wikimedia Commons only, with attribution**, falling back to a terrain thumbnail; or no photos.
5. **Self-registration.** **No: an admin creates users**, or add a sign-up page with admin approval.
6. **Old orphaned pages.** **Delete in phase 8**, or keep.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Public mine lists rarely include coordinates | Tiered precision with district centroids, clearly marked; prioritise OSM and Wikidata for exact points |
| Licensing of scraped data | Store facts with sources only; attribution in the UI; ODbL notice for OSM-derived data |
| Leaflet → MapLibre rewrite breaks existing features | Phase 5 has to reach parity before anything new; the Playwright suite from phases 1–4 is the gate |
| 3D performance on low-end machines | Off by default, WebGL2 check, layer budget, reduced-motion support |
| Brand-new library versions | Pin releases a few weeks old; Vite builds from `package-lock.json` |

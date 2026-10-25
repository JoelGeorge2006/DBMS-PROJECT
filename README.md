# Indian Mineral Resource Management Database

## Project Overview
This project focuses on designing and implementing a relational database for managing information about Indian mineral resources, mines, mining companies, locations, leases, and production records.

## Technologies Used
- MySQL 8.0
- MySQL Workbench
- GitHub

## Database Tables
The database contains the following seven tables:
1. `Location` — Stores state and district information.
2. `MiningCompany` — Stores mining company details.
3. `Mineral` — Stores mineral names and categories.
4. `Lease` — Stores mining lease details.
5. `Mine` — Stores mine information and its relationships.
6. `MineMineral` — Maps mines to the minerals they contain.
7. `Production` — Stores production quantities by year and mineral.

## SQL Files
- `01_create_tables.sql` — Creates the database tables.
- `02_insert_sample_data.sql` — Inserts sample data.

## Setup Instructions
1. Install MySQL Server and MySQL Workbench.
2. Run `01_create_tables.sql`.
3. Run `02_insert_sample_data.sql`.
4. Run the remaining SQL files to test the queries.

## Data
`minerva.db` holds **468 mines** across 20 states: 440 from OpenStreetMap, 20 from Wikidata and 8 synthetic sample records (marked "sample" in the UI). Imported mines carry their source link, licence and location precision; they have no lease, assay or production rows because public data does not provide them, and the app says so instead of guessing. Only the 8 sample records have leases and production, and those are synthetic, not official statistics.

Refresh the import with `npm run import:fetch` then `npm run import:mines`. Sources, licences and scope: [data/SOURCES.md](data/SOURCES.md); counts per state: [data/processed/report.md](data/processed/report.md). The schema (v2) is in `schema.sql`; older databases are migrated on server start (`db/migrate.js`).

Map data © OpenStreetMap contributors (ODbL 1.0). Wikidata content is CC0.

---

## MINERVA web app

A single-page front end (`index.html`, `app.js`) over an Express + SQLite API (`server.js`, `minerva.db`, schema in `schema.sql`).

### Running locally
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) (the dev server listens on this machine only; add `-- --host` to expose it). The login page comes first.

### Sign-in
Demo accounts (PINs are stored as scrypt hashes, never sent to the page):

| Identifier | PIN | Role |
|---|---|---|
| `USR-1024` | `minerva@2026` | Database administrator (SQL console) |
| `INS-4088` | `inspector@2026` | Mining lease inspector |
| `GEO-9921` | `surveyor@2026` | Geological field surveyor |

Sessions are httpOnly cookies checked by the server on every `/api` call. Five wrong PINs for one account from one address lock that pair for 15 minutes. "Forgot PIN?" is a demo: no e-mail is sent, so the code is shown on screen, and it is refused for administrator accounts; reset those with `npm run reset-pin -- USR-1024 'new-pin'`.

### Views
- **Map**: every mine from the `MINE` table on a satellite basemap. Below zoom 9 nearby mines group into numbered clusters coloured by their main mineral; hover a cluster to outline it, click to zoom in. Click a mine for its details. The transport network card finds the shortest route between two mines and builds the minimum network that connects them all.
- **Database**: mines, minerals, locations, companies, leases and production tables; mine dossier with source and location precision; CSV export (respects the search box); read-only SQL console (administrators only).
- **Lease expiry** (`#leases`): leases indexed by end date in an AVL tree, with expiry summary, year-range search and add/remove to see rotations. Click a lease to open its mine.
- **DSA** (`#dsa`): every data structure and algorithm in the project, with where it is used, a "Try it" button, a step-by-step demo, live numbers and the source excerpt. Content comes from `dsa/registry.js`.
- **Notifications** (bell): raised by rules over the data (leases ending, consent to operate expired or ending, mine status, production drops, sign-ins from a new address). All/Unread, mark read, click to open the mine.

The search bar suggests mines, minerals, places, companies and leases as you type (a Trie on the server, with typo correction), and shows your recent searches when empty. In the database, lease and DSA views it also filters the open table; the label at its left switches between "this view" and "everything". `/` or Ctrl/⌘K focuses it, Esc clears it.

### Data structures and algorithms (`dsa/`)
| Module | Where it is used |
|---|---|
| `Stack.js`: stack, two-stack undo/redo | SQL console history (Undo / Redo, Ctrl+↑ / Ctrl+↓) |
| `Queue.js`: O(1) queue, binary-heap priority queue | Alerts: shown one at a time, CRITICAL before WARNING before INFO; recent-alert history is a bounded queue |
| `BinarySearchTree.js` | Database → Minerals: assay range search (`GET /api/dsa/bst/range`) |
| `AVLTree.js` | Lease expiry view: range search, next expiry, add/remove with rotations |
| `Dijkstra.js`: weighted graph, haversine, Dijkstra | Map → Shortest route (`GET /api/dsa/network`, `GET /api/dsa/shortest-route`) |
| `MST.js`: Prim's, Kruskal's, union-find | Map → Minimum network (`GET /api/dsa/mst`) |
| `LRUCache.js`: hash map + doubly linked list | Session lookups on every API request |
| `SlidingWindow.js`: queue per key | Sign-in lockout and PIN-reset limits |
| `Trie.js`: trie with top-k heaps, Levenshtein distance | Search suggestions and typo correction (`GET /api/search/suggest`) |
| `ConvexHull.js`: grid clustering, monotone-chain hull | Map clusters and their outlines |
| `registry.js` | Content of the DSA tab (`GET /api/dsa/source/:file` serves the excerpts, `GET /api/dsa/stats` the live numbers) |

Distances are straight-line (great-circle) kilometres between mine coordinates, not road or rail distances.

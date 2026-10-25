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

## Data Disclaimer
Lease and production records created for demonstration purposes are synthetic sample data and should not be interpreted as official mining statistics.

---

## MINERVA web app

A single-page front end (`index.html`, `app.js`) over an Express + SQLite API (`server.js`, `minerva.db`, schema in `schema.sql`).

### Running locally
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000). The login page comes first; demo account `USR-1024` / `minerva@2026` (also `INS-4088` / `inspector@2026`, `GEO-9921` / `surveyor@2026`).

### Views
- **Map**: the 8 mines from the `MINE` table on a satellite basemap. Click a mine for its details. The transport network card finds the shortest route between two mines and builds the minimum network that connects them all.
- **Database**: mines, minerals, locations, companies, leases and production tables; mine dossier; CSV export (respects the search box); read-only SQL console.
- **Reports**: publication summaries (preview and download as text) and the lease expiry index.

### Data structures and algorithms (`dsa/`)
| Module | Where it is used |
|---|---|
| `Stack.js`: stack, two-stack undo/redo | SQL console history (Undo / Redo, Ctrl+↑ / Ctrl+↓) |
| `Queue.js`: O(1) queue, binary-heap priority queue | Alerts: shown one at a time, CRITICAL before WARNING before INFO |
| `BinarySearchTree.js` | Database → Minerals: assay range search (`GET /api/dsa/bst/range`) |
| `AVLTree.js` | Reports → Lease expiry index: range search, add/remove with rotations |
| `Dijkstra.js`: weighted graph, haversine, Dijkstra | Map → Shortest route (`GET /api/dsa/network`, `GET /api/dsa/shortest-route`) |
| `MST.js`: Prim's, Kruskal's, union-find | Map → Minimum network (`GET /api/dsa/mst`) |

Distances are straight-line (great-circle) kilometres between mine coordinates, not road or rail distances.

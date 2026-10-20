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

## MINERVA — National Mineral Geospatial Intelligence Grid

A full-screen, production-ready geospatial landing page synthesizing **MINERVA's frosted-glass UI system** with **LUMINA's satellite terrain network topology**.

### Running Locally
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Key Capabilities & Visual Architecture
1. **Basemap & Network Topology (Synthesized from Reference Image 2):**
   * **Real Satellite Basemap:** High-resolution Esri World Imagery centered over the Indian subcontinent with subtle warm-grade desaturation (`filter: saturate(0.88) sepia(0.12) contrast(1.06) brightness(0.96)`) complementing the MINERVA palette.
   * **Vector Boundaries & Concessions:** Dashed vector outlines mapping Karnataka jurisdiction (`stroke-dasharray: 5, 5`) and concession cratons (Keonjhar Sector, Singhbhum, Bailadila Range, Khetri Copper Belt, Bellary Complex).
   * **Tactical Node Clusters:** Circular telemetry node markers with live counts (`51`, `48`, `52`, `83`, `46`, `24`), halo glow rings on active clusters, and ST-DBSCAN style density hotspot overlays.
   * **Dynamic Network Connector Splines:** Operational linkage splines with animated flow dashes connecting extraction nodes to regional hubs and coastal terminals.

2. **UI Chrome & Navigation Components (Synthesized from Reference Image 1):**
   * **Top Navigation Bar:** MINERVA "M" badge logo, subtitle `NATIONAL MINERAL GEOSPATIAL INTELLIGENCE`, search pill (`Ctrl + K`), and live telemetry status badge (`109ms • SYNC ON`).
   * **Left Vertical Dock:** 4-slot dock with active terracotta pill highlight (`#A78D78`) for Map View, Database Registry drawer, Reports, and Security Clearance portal.
   * **Top-Left Strategic Intelligence Card:** Glassmorphic card displaying real-time metrics (`1,248 Active Mines`, `64 Tracked Belts`, `842 Concessions`, `1.28B MT Yield`), Prime craton focus tag, and database action CTA.
   * **Bottom Cascading Filter Dock:** Interactive selectors for `MINERAL / ORE`, `STATE GRID`, and `DISTRICT HUB`, paired with toggles for `Mines`, `Hotspots`, `Leases`, and `Reset`.
   * **Interactive Node Telemetry Inspector:** Floating popover card detailing mine name, lessee, mineral grade, lease ID, and annual yield on marker click.
   * **Database Explorer Drawer:** Slide-over table with real-time synchronized records from `01_create_tables.sql` and `02_insert_sample_data.sql`.



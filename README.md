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
The database runs on **PostgreSQL 17 (Supabase)** in its own schema, `minerva`: 27 tables in 3NF, 8 views, 8 triggers, 61 indexes and 8 enum types. The full DDL is in [db/schema.sql](db/schema.sql).

**Mines.** There are **468 mines** across 20 states: 440 from OpenStreetMap, 20 from Wikidata and 8 synthetic sample records (marked "sample" in the UI). Imported mines carry their source link, licence and location precision; they have no lease, assay or production rows because public data does not provide them, and the app says so instead of guessing. Only the 8 sample records have leases and production, and those are synthetic, not official statistics.

**Official statistics.** These come from government publications, each row linked to its source:
- national production of 32 mineral products (2021-22 to 2023-24)
- value of mineral production by state (2018-19 to 2022-23)
- mining leases by state and by mineral
- reporting mines by state
- the National Mineral Inventory reserves
- royalty rates from the MMDR Act Second Schedule (2009, 2015 and the 2024 critical minerals)
- the 18 critical-mineral blocks auctioned in Tranches IV and V

The `state` and `commodity` tables link these to the mines. Sources, checks and gaps are in [data/public/README.md](data/public/README.md).

Refresh the mine import with `npm run import:fetch` then `npm run import:mines`. Sources, licences and scope: [data/SOURCES.md](data/SOURCES.md); counts per state: [data/processed/report.md](data/processed/report.md).

Map data © OpenStreetMap contributors (ODbL 1.0). Wikidata content is CC0.

---

## MINERVA web app

A single-page front end (`index.html`, `app.js`) over an Express API (`server.js`) on PostgreSQL (Supabase). Database access goes through `db/pool.js`, which records every statement for the SQL log.

### Running locally
1. Create a free project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env` and paste in the project's **Session pooler** connection string. URL-encode special characters in the password, e.g. `#` becomes `%23`. `.env` is never committed.
3. Run:

```bash
npm install
npm run db:setup   # creates the minerva schema and loads all data (drops it first if it exists)
npm run dev
```

The server checks the database's TLS certificate against Supabase's root CA in `supabase-ca.crt`. If your project uses a different CA, download it from Project Settings → Database → SSL Configuration and replace that file.
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
- **Map**: every mine from the `MINE` table on a satellite basemap, one dot per mine coloured by its main mineral. Click a mine for its details.
- **Database**: mines, minerals, locations, companies, leases and production tables; mine dossier with source and location precision; CSV export (respects the search box); read-only SQL console (administrators only, Ctrl/⌘+Enter runs the query).
- **Lease expiry** (`#leases`): every lease by end date, with an expiry summary and year-range search. Click a lease to open its mine.
- **Official statistics** (tabs in the database view): states, commodities, auctions, royalty rates, reserves and national output. Each tab is read through a database view, and its source is shown under the tabs.
- **Schema** (`#schema`): read live from the PostgreSQL catalog.
  - **ER diagram:** drag to pan, scroll to zoom. Click a table for its columns, keys, relationships, constraints, triggers, indexes and its first rows.
  - **Views:** each definition, with a button to run it.
  - **Triggers:** each trigger with its PL/pgSQL function.
  - **Indexes:** each index with its size and how often it has been used.
  - **Types:** the enum types.
- **SQL log** (top bar): every SQL statement the backend runs, newest first. Each entry shows the API request that ran it, the user, its timing, its row count and its parameters.

The SQL console runs a single statement in a read-only transaction, as the role `minerva_reader`. That role cannot read accounts, sessions or reset codes, and each query has a 5-second limit.

The search bar filters the open table in the database and lease views. On the map, press Enter to fly to the first mine whose name, ID, mineral, place or lessee matches. `/` or Ctrl/⌘K focuses it, Esc clears it.

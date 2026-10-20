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

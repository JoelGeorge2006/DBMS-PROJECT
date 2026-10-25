-- ============================================================================
-- MINERVA — Indian Mineral Resource Management Database
-- Course: BACSE202 - Database Systems
-- Schema v2: 3NF relational model (DDL, indexes, spatial index, triggers, views, seed DML)
-- DBMS target: SQLite (better-sqlite3). PRAGMA user_version = 2.
--
-- v2: national mine import (OpenStreetMap, Wikidata). Unknown facts are NULL
-- instead of invented values: an imported mine may have no lease, company or
-- recorded mineral. Every mine records its data source and location precision.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. DROP EXISTING OBJECTS (clean initialisation)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_district_mineral_occurrence;
DROP VIEW IF EXISTS v_cross_state_production;
DROP VIEW IF EXISTS v_lease_lifecycle_compliance;
DROP VIEW IF EXISTS v_mines_master;

DROP TRIGGER IF EXISTS trg_mine_rtree_insert;
DROP TRIGGER IF EXISTS trg_mine_rtree_update;
DROP TRIGGER IF EXISTS trg_mine_rtree_delete;
DROP TABLE IF EXISTS MINE_RTREE;

DROP TABLE IF EXISTS MINE_MEDIA;
DROP TABLE IF EXISTS MINE_ALIAS;
DROP TABLE IF EXISTS PRODUCTION;
DROP TABLE IF EXISTS MINE_MINERAL;
DROP TABLE IF EXISTS MINE;
DROP TABLE IF EXISTS LEASE;
DROP TABLE IF EXISTS MINERAL;
DROP TABLE IF EXISTS MINING_COMPANY;
DROP TABLE IF EXISTS LOCATION;
DROP TABLE IF EXISTS DATA_SOURCE;

-- ----------------------------------------------------------------------------
-- 2. DDL (3NF relations with integrity constraints)
-- ----------------------------------------------------------------------------

-- Entity 0: DATA_SOURCE (where a record came from, and under which licence)
CREATE TABLE DATA_SOURCE (
    source_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    url TEXT,
    licence TEXT NOT NULL,
    retrieved_on TEXT
);

-- Entity 1: LOCATION (state + district; craton is NULL when not classified)
CREATE TABLE LOCATION (
    location_id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    craton_region TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    CONSTRAINT uq_location_state_district UNIQUE (state, district)
);

-- Entity 2: MINING_COMPANY (lessees and operators)
CREATE TABLE MINING_COMPANY (
    company_id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL UNIQUE,
    company_type TEXT NOT NULL CHECK(company_type IN ('Central PSU', 'State PSU', 'Private', 'Joint Venture', 'Unknown')),
    registered_office TEXT
);

-- Entity 3: LEASE (statutory concession agreements and clearances)
CREATE TABLE LEASE (
    lease_id TEXT PRIMARY KEY,
    company_id INTEGER NOT NULL,
    execution_date DATE NOT NULL,
    valid_till DATE NOT NULL,
    royalty_rate_pct REAL NOT NULL CHECK(royalty_rate_pct >= 0.0 AND royalty_rate_pct <= 100.0),
    lease_area_hectares REAL NOT NULL CHECK(lease_area_hectares > 0.0),
    forest_clearance_stage TEXT NOT NULL DEFAULT 'Stage-II Approved',
    cto_valid_till DATE NOT NULL,
    CONSTRAINT fk_lease_company FOREIGN KEY (company_id)
        REFERENCES MINING_COMPANY(company_id) ON DELETE CASCADE,
    CONSTRAINT chk_lease_validity CHECK(valid_till > execution_date)
);

-- Entity 4: MINERAL (assay columns are NULL when no typical grade is recorded)
CREATE TABLE MINERAL (
    mineral_id INTEGER PRIMARY KEY AUTOINCREMENT,
    mineral_name TEXT NOT NULL UNIQUE,
    mineral_type TEXT NOT NULL,
    fe_pct REAL CHECK(fe_pct BETWEEN 0.0 AND 100.0),
    sio2_pct REAL CHECK(sio2_pct BETWEEN 0.0 AND 100.0),
    al2o3_pct REAL CHECK(al2o3_pct BETWEEN 0.0 AND 100.0),
    phosphorus_pct REAL CHECK(phosphorus_pct BETWEEN 0.0 AND 100.0),
    moisture_pct REAL CHECK(moisture_pct BETWEEN 0.0 AND 100.0)
);

-- Entity 5: MINE (company and lease are optional: public data rarely includes them)
CREATE TABLE MINE (
    mine_id TEXT PRIMARY KEY,
    mine_name TEXT NOT NULL,
    location_id INTEGER NOT NULL,
    company_id INTEGER,
    lease_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK(status IN ('Operational', 'Under Maintenance', 'Expiring', 'Revoked', 'Closed', 'Unknown')),
    mine_type TEXT NOT NULL DEFAULT 'Unknown' CHECK(mine_type IN ('Opencast', 'Underground', 'Mixed', 'Unknown')),
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    location_precision TEXT NOT NULL DEFAULT 'exact' CHECK(location_precision IN ('exact', 'approximate', 'district')),
    source_id INTEGER NOT NULL,
    source_ref TEXT,
    source_url TEXT,
    is_sample INTEGER NOT NULL DEFAULT 0 CHECK(is_sample IN (0, 1)),
    CONSTRAINT fk_mine_location FOREIGN KEY (location_id)
        REFERENCES LOCATION(location_id) ON DELETE RESTRICT,
    CONSTRAINT fk_mine_company FOREIGN KEY (company_id)
        REFERENCES MINING_COMPANY(company_id) ON DELETE SET NULL,
    CONSTRAINT fk_mine_lease FOREIGN KEY (lease_id)
        REFERENCES LEASE(lease_id) ON DELETE SET NULL,
    CONSTRAINT fk_mine_source FOREIGN KEY (source_id)
        REFERENCES DATA_SOURCE(source_id) ON DELETE RESTRICT
);

-- Entity 6: MINE_MINERAL (junction: many-to-many mine <-> mineral)
CREATE TABLE MINE_MINERAL (
    mine_id TEXT NOT NULL,
    mineral_id INTEGER NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 1 CHECK(is_primary IN (0, 1)),
    ore_grade_description TEXT,
    PRIMARY KEY (mine_id, mineral_id),
    CONSTRAINT fk_mm_mine FOREIGN KEY (mine_id)
        REFERENCES MINE(mine_id) ON DELETE CASCADE,
    CONSTRAINT fk_mm_mineral FOREIGN KEY (mineral_id)
        REFERENCES MINERAL(mineral_id) ON DELETE CASCADE
);

-- Entity 7: PRODUCTION (yearly extraction and dispatch)
CREATE TABLE PRODUCTION (
    prod_id INTEGER PRIMARY KEY AUTOINCREMENT,
    mine_id TEXT NOT NULL,
    mineral_id INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL CHECK(fiscal_year >= 2000 AND fiscal_year <= 2100),
    quantity_mt REAL NOT NULL CHECK(quantity_mt >= 0.0),
    dispatch_mt REAL NOT NULL CHECK(dispatch_mt >= 0.0),
    CONSTRAINT fk_prod_mine FOREIGN KEY (mine_id)
        REFERENCES MINE(mine_id) ON DELETE CASCADE,
    CONSTRAINT fk_prod_mineral FOREIGN KEY (mineral_id)
        REFERENCES MINERAL(mineral_id) ON DELETE CASCADE,
    CONSTRAINT uq_prod_mine_mineral_fy UNIQUE (mine_id, mineral_id, fiscal_year)
);

-- Entity 8: MINE_ALIAS (other names / spellings, used by search)
CREATE TABLE MINE_ALIAS (
    mine_id TEXT NOT NULL,
    alias TEXT NOT NULL,
    PRIMARY KEY (mine_id, alias),
    CONSTRAINT fk_alias_mine FOREIGN KEY (mine_id)
        REFERENCES MINE(mine_id) ON DELETE CASCADE
);

-- Entity 9: MINE_MEDIA (photos with licence and attribution; Wikimedia Commons only)
CREATE TABLE MINE_MEDIA (
    media_id INTEGER PRIMARY KEY AUTOINCREMENT,
    mine_id TEXT NOT NULL,
    url TEXT NOT NULL,
    author TEXT,
    licence TEXT NOT NULL,
    source_url TEXT NOT NULL,
    CONSTRAINT fk_media_mine FOREIGN KEY (mine_id)
        REFERENCES MINE(mine_id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 3. B-TREE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX idx_location_state_district ON LOCATION(state, district);
CREATE INDEX idx_lease_valid_till ON LEASE(valid_till);
CREATE INDEX idx_production_mine_fy ON PRODUCTION(mine_id, fiscal_year);
CREATE INDEX idx_mine_coords ON MINE(latitude, longitude);
CREATE INDEX idx_mine_status ON MINE(status);
CREATE INDEX idx_mine_company_fk ON MINE(company_id);
CREATE INDEX idx_mine_location_fk ON MINE(location_id);
CREATE INDEX idx_mine_source_fk ON MINE(source_id);
CREATE INDEX idx_lease_company_fk ON LEASE(company_id);
CREATE INDEX idx_mm_mineral_fk ON MINE_MINERAL(mineral_id);

-- ----------------------------------------------------------------------------
-- 4. SPATIAL INDEX (R*Tree) kept in sync with MINE by triggers
--    id = MINE.rowid; a point is stored as a zero-size box.
-- ----------------------------------------------------------------------------
CREATE VIRTUAL TABLE MINE_RTREE USING rtree(id, min_lng, max_lng, min_lat, max_lat);

-- INSERT OR REPLACE deletes the old row without firing the delete trigger,
-- so the insert trigger also clears any index entry that no longer has a mine.
CREATE TRIGGER trg_mine_rtree_insert AFTER INSERT ON MINE BEGIN
    DELETE FROM MINE_RTREE WHERE id NOT IN (SELECT rowid FROM MINE);
    INSERT OR REPLACE INTO MINE_RTREE (id, min_lng, max_lng, min_lat, max_lat)
    VALUES (NEW.rowid, NEW.longitude, NEW.longitude, NEW.latitude, NEW.latitude);
END;

CREATE TRIGGER trg_mine_rtree_update AFTER UPDATE OF latitude, longitude ON MINE BEGIN
    UPDATE MINE_RTREE SET min_lng = NEW.longitude, max_lng = NEW.longitude,
        min_lat = NEW.latitude, max_lat = NEW.latitude
    WHERE id = NEW.rowid;
END;

CREATE TRIGGER trg_mine_rtree_delete AFTER DELETE ON MINE BEGIN
    DELETE FROM MINE_RTREE WHERE id = OLD.rowid;
END;

-- ----------------------------------------------------------------------------
-- 5. VIEWS (LEFT JOINs: a mine without a lease or company still appears)
-- ----------------------------------------------------------------------------

-- View A: v_mines_master (one row per mine for the UI grid and API)
CREATE VIEW v_mines_master AS
SELECT
    m.rowid AS mine_rowid,
    m.mine_id,
    m.mine_name,
    min.mineral_name AS primary_mineral,
    min.mineral_type,
    mm.ore_grade_description,
    l.state,
    l.district,
    (l.state || ', ' || l.district) AS state_district,
    l.craton_region,
    c.company_name AS operating_lessee,
    c.company_type,
    CASE WHEN le.lease_id IS NULL THEN NULL
         ELSE strftime('%Y', le.execution_date) || ' — ' || strftime('%Y', le.valid_till) END AS lease_validity,
    le.lease_id,
    le.execution_date,
    le.valid_till,
    CASE WHEN le.lease_id IS NULL THEN NULL ELSE le.royalty_rate_pct || '% ASP' END AS royalty_rate,
    le.royalty_rate_pct,
    CASE WHEN le.lease_id IS NULL THEN NULL ELSE printf('%,.2f', le.lease_area_hectares) || ' Hectares' END AS area_formatted,
    le.lease_area_hectares,
    le.forest_clearance_stage,
    le.cto_valid_till,
    m.status,
    m.mine_type,
    m.latitude,
    m.longitude,
    m.location_precision,
    m.is_sample,
    m.source_ref,
    m.source_url,
    ds.name AS source_name,
    ds.licence AS source_licence,
    min.fe_pct,
    min.sio2_pct,
    min.al2o3_pct,
    min.phosphorus_pct,
    min.moisture_pct
FROM MINE m
JOIN LOCATION l ON m.location_id = l.location_id
JOIN DATA_SOURCE ds ON m.source_id = ds.source_id
LEFT JOIN MINING_COMPANY c ON m.company_id = c.company_id
LEFT JOIN LEASE le ON m.lease_id = le.lease_id
LEFT JOIN MINE_MINERAL mm ON m.mine_id = mm.mine_id AND mm.is_primary = 1
LEFT JOIN MINERAL min ON mm.mineral_id = min.mineral_id;

-- View B: v_district_mineral_occurrence (mines per district and mineral)
CREATE VIEW v_district_mineral_occurrence AS
SELECT
    l.state,
    l.district,
    min.mineral_name,
    COUNT(DISTINCT m.mine_id) AS total_mines,
    SUM(le.lease_area_hectares) AS total_concession_area,
    SUM(p.quantity_mt) AS total_extraction_2024_mt
FROM LOCATION l
JOIN MINE m ON l.location_id = m.location_id
JOIN MINE_MINERAL mm ON m.mine_id = mm.mine_id
JOIN MINERAL min ON mm.mineral_id = min.mineral_id
LEFT JOIN LEASE le ON m.lease_id = le.lease_id
LEFT JOIN PRODUCTION p ON m.mine_id = p.mine_id AND p.fiscal_year = 2024
GROUP BY l.state, l.district, min.mineral_name;

-- View C: v_cross_state_production (yearly output per state)
CREATE VIEW v_cross_state_production AS
SELECT
    l.state,
    p.fiscal_year,
    COUNT(DISTINCT m.mine_id) AS active_mines_count,
    ROUND(SUM(p.quantity_mt), 2) AS total_extracted_mt,
    ROUND(SUM(p.dispatch_mt), 2) AS total_dispatched_mt,
    ROUND(SUM(p.dispatch_mt) * 100.0 / NULLIF(SUM(p.quantity_mt), 0), 1) AS dispatch_efficiency_pct
FROM PRODUCTION p
JOIN MINE m ON p.mine_id = m.mine_id
JOIN LOCATION l ON m.location_id = l.location_id
GROUP BY l.state, p.fiscal_year;

-- View D: v_lease_lifecycle_compliance (lease expiry tracking)
CREATE VIEW v_lease_lifecycle_compliance AS
SELECT
    m.mine_id,
    m.mine_name,
    c.company_name,
    le.lease_id,
    le.execution_date,
    le.valid_till,
    le.forest_clearance_stage,
    le.cto_valid_till,
    ROUND((julianday(le.valid_till) - julianday('now')) / 365.25, 1) AS years_remaining,
    CASE
        WHEN date(le.valid_till) <= date('now', '+1 year') THEN 'Renewal due within 1 year'
        WHEN date(le.valid_till) <= date('now', '+5 years') THEN 'Renewal due within 5 years'
        ELSE 'More than 5 years left'
    END AS compliance_risk_tier
FROM LEASE le
JOIN MINE m ON le.lease_id = m.lease_id
LEFT JOIN MINING_COMPANY c ON le.company_id = c.company_id;

-- ----------------------------------------------------------------------------
-- 6. SEED DATA (synthetic sample records; national mines come from the import scripts)
-- ----------------------------------------------------------------------------

-- 0. Data sources
INSERT INTO DATA_SOURCE (source_id, name, url, licence, retrieved_on) VALUES
(1, 'MINERVA sample data', NULL, 'Synthetic demonstration data, not official statistics', NULL),
(2, 'OpenStreetMap', 'https://www.openstreetmap.org/copyright', 'ODbL 1.0 (© OpenStreetMap contributors)', NULL),
(3, 'Wikidata', 'https://www.wikidata.org', 'CC0 1.0', NULL);

-- A. Locations
INSERT INTO LOCATION (location_id, state, district, craton_region, latitude, longitude) VALUES
(1, 'Odisha', 'Keonjhar', 'Singhbhum-Orissa Craton (Iron Ore Belt)', 22.016, 85.426),
(2, 'Chhattisgarh', 'Dantewada', 'Bastar Craton (Bailadila Range)', 18.705, 81.245),
(3, 'Rajasthan', 'Jhunjhunu', 'North Delhi Fold Belt (Khetri Copper Belt)', 27.985, 75.795),
(4, 'Odisha', 'Koraput', 'Eastern Ghats Mobile Belt (Bauxite Plateau)', 18.825, 82.915),
(5, 'Odisha', 'Jajpur', 'Sukinda Ultramafic Complex (Chromite Valley)', 21.010, 85.820),
(6, 'Rajasthan', 'Udaipur', 'Aravalli Supergroup (Zawar Zinc Belt)', 24.350, 73.710),
(7, 'Jharkhand', 'West Singhbhum', 'Kolhan Basin (Singhbhum Craton)', 22.146, 85.524),
(8, 'Karnataka', 'Bellary', 'Dharwar Craton (Sandur Schist Belt)', 15.139, 76.921),
(9, 'Madhya Pradesh', 'Balaghat', 'Central Indian Suture Zone', 21.800, 80.180),
(10, 'Goa', 'North Goa', 'Western Dharwar Craton', 15.550, 73.950);

-- B. Mining Companies
INSERT INTO MINING_COMPANY (company_id, company_name, company_type, registered_office) VALUES
(1, 'Odisha Mining Corp', 'State PSU', 'OMC House, Bhubaneswar, Odisha'),
(2, 'NMDC Limited', 'Central PSU', 'Khanij Bhavan, Castle Hills, Hyderabad, Telangana'),
(3, 'Hindustan Copper Ltd', 'Central PSU', 'Tamra Bhavan, 1 Ashutosh Chowdhury Ave, Kolkata'),
(4, 'NALCO', 'Central PSU', 'NALCO Bhawan, Nayapalli, Bhubaneswar, Odisha'),
(5, 'Tata Steel Mining', 'Private', 'Bombay House, 24 Homi Mody Street, Mumbai'),
(6, 'Hindustan Zinc Ltd', 'Private', 'Yashad Bhawan, Udaipur, Rajasthan'),
(7, 'SAIL Raw Materials', 'Central PSU', 'Ispat Bhawan, Lodhi Road, New Delhi'),
(8, 'Vedanta Limited', 'Private', 'Core-6, SCOPE Complex, New Delhi'),
(9, 'MOIL Limited', 'Central PSU', 'MOIL Bhavan, 1A Katol Road, Nagpur');

-- C. Leases
INSERT INTO LEASE (lease_id, company_id, execution_date, valid_till, royalty_rate_pct, lease_area_hectares, forest_clearance_stage, cto_valid_till) VALUES
('OR-KJ-2004-981', 1, '2004-10-14', '2044-10-13', 15.0, 1482.40, 'Forest Clearance Stage-II (Approved)', '2028-12-31'),
('CG-DW-2015-402', 2, '2015-06-05', '2045-06-04', 15.0, 2120.00, 'Forest Clearance Stage-II (Approved)', '2030-05-31'),
('RJ-JJ-2012-114', 3, '2012-08-20', '2037-08-19', 4.5, 890.50, 'Environmental Overhaul (Under Review)', '2026-08-31'),
('OR-KP-2019-771', 4, '2019-01-12', '2049-01-11', 12.0, 1845.00, 'Forest Clearance Stage-II (Approved)', '2032-12-31'),
('OR-JP-2020-339', 5, '2020-04-01', '2040-03-31', 15.0, 650.00, 'Forest Clearance Stage-II (Approved)', '2030-03-31'),
('RJ-UD-2017-088', 6, '2017-11-15', '2047-11-14', 9.5, 1200.00, 'Lease Renewal Compliance Review', '2027-11-15'),
('JH-WS-2021-902', 7, '2021-05-10', '2051-05-09', 15.0, 2450.00, 'Forest Clearance Stage-II (Approved)', '2031-05-10'),
('KA-BL-2016-554', 2, '2016-03-10', '2046-03-09', 15.0, 1640.00, 'Forest Clearance Stage-II (Approved)', '2031-03-31');

-- D. Minerals
INSERT INTO MINERAL (mineral_id, mineral_name, mineral_type, fe_pct, sio2_pct, al2o3_pct, phosphorus_pct, moisture_pct) VALUES
(1, 'Iron Ore (Hematite 64.2%)', 'Metallic / Ferrous', 64.8, 2.1, 1.8, 0.04, 3.2),
(2, 'Iron Ore (Magnetite 68%)', 'Metallic / Ferrous', 68.2, 1.4, 1.1, 0.02, 2.1),
(3, 'Copper (Chalcopyrite 2.4%)', 'Metallic / Base Metal', 18.5, 34.2, 5.4, 0.01, 4.2),
(4, 'Bauxite (Gibbsite 52%)', 'Metallic / Alumina Feedstock', 14.6, 2.8, 52.4, 0.03, 5.1),
(5, 'Chromite (Metallurgical)', 'Metallic / Strategic Alloy', 15.2, 3.5, 8.4, 0.01, 2.8),
(6, 'Lead-Zinc Ore', 'Metallic / Base Metal', 9.4, 18.2, 3.1, 0.02, 3.5),
(7, 'Iron & Manganese', 'Metallic / Ferro-Alloy', 63.5, 2.8, 2.1, 0.05, 3.0),
(8, 'Manganese Ore (High Grade)', 'Metallic / Ferro-Alloy', 4.5, 8.2, 2.4, 0.08, 4.0);

-- E. Mines (synthetic sample records: is_sample = 1, source 1)
INSERT INTO MINE (mine_id, mine_name, location_id, company_id, lease_id, status, latitude, longitude, source_id, is_sample) VALUES
('MN-0182', 'Keonjhar North Block', 1, 1, 'OR-KJ-2004-981', 'Operational', 22.016, 85.426, 1, 1),
('MN-0294', 'Bailadila Deposit 14', 2, 2, 'CG-DW-2015-402', 'Operational', 18.705, 81.245, 1, 1),
('MN-0411', 'Khetri Underground Complex', 3, 3, 'RJ-JJ-2012-114', 'Under Maintenance', 27.985, 75.795, 1, 1),
('MN-0523', 'Panchpatmali Bauxite', 4, 4, 'OR-KP-2019-771', 'Operational', 18.825, 82.915, 1, 1),
('MN-0887', 'Sukinda Chromite', 5, 5, 'OR-JP-2020-339', 'Operational', 21.010, 85.820, 1, 1),
('MN-1104', 'Zawar Lead-Zinc', 6, 6, 'RJ-UD-2017-088', 'Expiring', 24.350, 73.710, 1, 1),
('MN-1248', 'Singhbhum Iron Craton', 7, 7, 'JH-WS-2021-902', 'Operational', 22.146, 85.524, 1, 1),
('MN-1450', 'Donimalai Iron Mine', 8, 2, 'KA-BL-2016-554', 'Operational', 15.050, 76.620, 1, 1);

-- F. Mine-Mineral Junction
INSERT INTO MINE_MINERAL (mine_id, mineral_id, is_primary, ore_grade_description) VALUES
('MN-0182', 1, 1, 'Lump and Fine Hematite Ore (Fe > 64%)'),
('MN-0294', 2, 1, 'High Grade Magnetite Dense Ore (Fe > 68%)'),
('MN-0411', 3, 1, 'Sub-surface Chalcopyrite Concentrate (Cu ~2.4%)'),
('MN-0523', 4, 1, 'Gibbsitic Bauxite Refractory Feed (Al2O3 > 52%)'),
('MN-0887', 5, 1, 'Metallurgical Grade Friable Chromite (Cr:Fe 3:1)'),
('MN-1104', 6, 1, 'Sphalerite & Galena Composite Run-of-Mine'),
('MN-1248', 7, 1, 'Banded Iron Formation with Pyrolusite Layers'),
('MN-1450', 1, 1, 'High Grade Hematite Blue Dust Deposit');

-- G. Production (Full 4-Year entries for sparklines: 2021, 2022, 2023, 2024)
INSERT INTO PRODUCTION (mine_id, mineral_id, fiscal_year, quantity_mt, dispatch_mt) VALUES
-- MN-0182: Keonjhar North Block
('MN-0182', 1, 2021, 4.80, 4.65),
('MN-0182', 1, 2022, 5.40, 5.20),
('MN-0182', 1, 2023, 5.90, 5.75),
('MN-0182', 1, 2024, 6.40, 6.20),

-- MN-0294: Bailadila Deposit 14
('MN-0294', 2, 2021, 8.10, 7.90),
('MN-0294', 2, 2022, 8.90, 8.70),
('MN-0294', 2, 2023, 9.30, 9.10),
('MN-0294', 2, 2024, 9.80, 9.50),

-- MN-0411: Khetri Underground Complex
('MN-0411', 3, 2021, 2.40, 2.30),
('MN-0411', 3, 2022, 2.10, 2.05),
('MN-0411', 3, 2023, 2.00, 1.90),
('MN-0411', 3, 2024, 1.80, 1.70),

-- MN-0523: Panchpatmali Bauxite
('MN-0523', 4, 2021, 6.20, 6.10),
('MN-0523', 4, 2022, 6.70, 6.55),
('MN-0523', 4, 2023, 7.00, 6.90),
('MN-0523', 4, 2024, 7.20, 7.10),

-- MN-0887: Sukinda Chromite
('MN-0887', 5, 2021, 1.10, 1.05),
('MN-0887', 5, 2022, 1.20, 1.15),
('MN-0887', 5, 2023, 1.30, 1.28),
('MN-0887', 5, 2024, 1.40, 1.40),

-- MN-1104: Zawar Lead-Zinc
('MN-1104', 6, 2021, 3.80, 3.70),
('MN-1104', 6, 2022, 4.00, 3.90),
('MN-1104', 6, 2023, 4.10, 4.00),
('MN-1104', 6, 2024, 4.10, 3.90),

-- MN-1248: Singhbhum Iron Craton
('MN-1248', 7, 2021, 11.20, 10.90),
('MN-1248', 7, 2022, 12.80, 12.40),
('MN-1248', 7, 2023, 13.90, 13.50),
('MN-1248', 7, 2024, 14.50, 14.10),

-- MN-1450: Donimalai Iron Mine
('MN-1450', 1, 2021, 5.10, 4.90),
('MN-1450', 1, 2022, 5.60, 5.40),
('MN-1450', 1, 2023, 6.00, 5.80),
('MN-1450', 1, 2024, 6.20, 6.00);

PRAGMA user_version = 2;

-- End of schema.sql

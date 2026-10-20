INSERT INTO Location (state_name, district_name) VALUES
('Chhattisgarh', 'Bilaspur'),
('Chhattisgarh', 'Kabirdham'),
('Chhattisgarh', 'Balrampur'),
('Bihar', 'Rohtas'),
('Jharkhand', 'Gumla'),
('Jharkhand', 'Lohardaga'),
('Jharkhand', 'Giridih'),
('Jharkhand', 'West Singhbhum'),
('Jharkhand', 'East Singhbhum'),
('Telangana', 'Adilabad'),
('Telangana', 'Komaram Bheem Asifabad'),
('Telangana', 'Vikarabad'),
('Telangana', 'Mancherial'),
('Telangana', 'Peddapalli'),
('Odisha', 'Koraput'),
('Odisha', 'Keonjhar'),
('Odisha', 'Sundergarh'),
('Rajasthan', 'Jodhpur'),
('Rajasthan', 'Ajmer');
INSERT INTO MiningCompany (company_name, headquarters_state) VALUES
('NUVaco Vista', NULL),
('Mahavir Minerals', NULL),
('Hindalco Industries Ltd.', NULL),
('Dalmia Cement Bharat Limited', NULL),
('G.K Popat (lessee)', NULL),
('Ajit Kumar Saha', NULL),
('Steel Authority of India Limited', NULL),
('Hindustan Copper Limited', NULL),
('Aditya Minerals Private Limited', NULL),
('S.Y. Minerals Private Limited', NULL),
('Tatipamula Satyanarayana', NULL),
('The India Cements Limited', NULL),
('Telangana State Mineral Development Corporation Limited', NULL),
('NALCO', NULL),
('Tarini Minerals', NULL),
('Tata Steel Ltd.', NULL),
('Marwar Cement Ltd', NULL),
('HZL', NULL);
INSERT INTO Mineral (mineral_name, mineral_category) VALUES
('Limestone', 'Non-metallic'),
('Bauxite', 'Non-metallic'),
('Graphite', 'Non-metallic'),
('Iron Ore', 'Metallic'),
('Manganese Ore', 'Metallic'),
('Feldspar', 'Non-metallic'),
('Quartz', 'Non-metallic'),
('Copper Ore', 'Metallic'),
('Lead Zinc Ore', 'Metallic');
INSERT INTO Mine (mine_name, location_id, company_id, lease_id)
SELECT s.mine_name, l.location_id, c.company_id, NULL
FROM (
    SELECT 'CHILHATI' AS mine_name, 'Chhattisgarh' AS state_name,
           'Bilaspur' AS district_name, 'NUVaco Vista' AS company_name
    UNION ALL SELECT 'DALDALI', 'Chhattisgarh', 'Kabirdham',
           'Mahavir Minerals'
    UNION ALL SELECT 'TATIJHARIYA', 'Chhattisgarh', 'Balrampur',
           'Hindalco Industries Ltd.'
    UNION ALL SELECT 'SAMRI', 'Chhattisgarh', 'Balrampur',
           'Hindalco Industries Ltd.'
    UNION ALL SELECT 'Murlipahadi Limestone Mine', 'Bihar', 'Rohtas',
           'Dalmia Cement Bharat Limited'
    UNION ALL SELECT 'Harup Bauxite Mine', 'Jharkhand', 'Gumla',
           'G.K Popat (lessee)'
    UNION ALL SELECT 'Sherandag Bauxite Mine', 'Jharkhand', 'Lohardaga',
           'Hindalco Industries Ltd.'
    UNION ALL SELECT 'Paisara (4.16 Ha)', 'Jharkhand', 'Giridih',
           'Ajit Kumar Saha'
    UNION ALL SELECT 'Topailore Iron Ore (14.15 Ha)', 'Jharkhand',
           'West Singhbhum', 'Steel Authority of India Limited'
    UNION ALL SELECT 'Gua Iron Ore Mine (Durgaiburu 1443.756 Ha)',
           'Jharkhand', 'West Singhbhum',
           'Steel Authority of India Limited'
    UNION ALL SELECT 'Surda Copper Mine', 'Jharkhand',
           'East Singhbhum', 'Hindustan Copper Limited'
    UNION ALL SELECT 'Pimperakunta Guda Mine', 'Telangana', 'Adilabad',
           'Aditya Minerals Private Limited'
    UNION ALL SELECT 'Jamdapur Mine', 'Telangana', 'Adilabad',
           'S.Y. Minerals Private Limited'
    UNION ALL SELECT 'Narayanapur Limestone Mine', 'Telangana',
           'Komaram Bheem Asifabad', 'Tatipamula Satyanarayana'
    UNION ALL SELECT 'Vishnupuram Limestone Mine', 'Telangana',
           'Vikarabad', 'The India Cements Limited'
    UNION ALL SELECT 'Devapur', 'Telangana', 'Mancherial',
           'Telangana State Mineral Development Corporation Limited'
    UNION ALL SELECT 'Basantnagar', 'Telangana', 'Peddapalli',
           'The India Cements Limited'
    UNION ALL SELECT 'Pottangi', 'Odisha', 'Koraput', 'NALCO'
    UNION ALL SELECT 'Nuagaon', 'Odisha', 'Sundergarh', 'Tarini Minerals'
    UNION ALL SELECT 'Bolani', 'Odisha', 'Keonjhar',
           'Steel Authority of India Limited'
    UNION ALL SELECT 'Ghodawat Limestone Mine', 'Rajasthan', 'Jodhpur',
           'Marwar Cement Ltd'
    UNION ALL SELECT 'Kayad', 'Rajasthan', 'Ajmer', 'HZL'
) s
JOIN Location l
  ON l.state_name = s.state_name
 AND l.district_name = s.district_name
JOIN MiningCompany c
  ON c.company_name = s.company_name;
INSERT INTO MineMineral (mine_id, mineral_id)
SELECT mi.mine_id, m.mineral_id
FROM (
    SELECT 'CHILHATI' AS mine_name, 'Limestone' AS mineral_name
    UNION ALL SELECT 'DALDALI', 'Bauxite'
    UNION ALL SELECT 'TATIJHARIYA', 'Bauxite'
    UNION ALL SELECT 'SAMRI', 'Bauxite'
    UNION ALL SELECT 'Murlipahadi Limestone Mine', 'Limestone'
    UNION ALL SELECT 'Harup Bauxite Mine', 'Bauxite'
    UNION ALL SELECT 'Sherandag Bauxite Mine', 'Bauxite'
    UNION ALL SELECT 'Paisara (4.16 Ha)', 'Feldspar'
    UNION ALL SELECT 'Paisara (4.16 Ha)', 'Quartz'
    UNION ALL SELECT 'Topailore Iron Ore (14.15 Ha)', 'Iron Ore'
    UNION ALL SELECT 'Gua Iron Ore Mine (Durgaiburu 1443.756 Ha)',
           'Iron Ore'
    UNION ALL SELECT 'Surda Copper Mine', 'Copper Ore'
    UNION ALL SELECT 'Pimperakunta Guda Mine', 'Manganese Ore'
    UNION ALL SELECT 'Jamdapur Mine', 'Manganese Ore'
    UNION ALL SELECT 'Narayanapur Limestone Mine', 'Limestone'
    UNION ALL SELECT 'Vishnupuram Limestone Mine', 'Limestone'
    UNION ALL SELECT 'Devapur', 'Limestone'
    UNION ALL SELECT 'Basantnagar', 'Limestone'
    UNION ALL SELECT 'Pottangi', 'Bauxite'
    UNION ALL SELECT 'Nuagaon', 'Manganese Ore'
    UNION ALL SELECT 'Bolani', 'Manganese Ore'
    UNION ALL SELECT 'Bolani', 'Iron Ore'
    UNION ALL SELECT 'Ghodawat Limestone Mine', 'Limestone'
    UNION ALL SELECT 'Kayad', 'Lead Zinc Ore'
) s
JOIN Mine mi ON mi.mine_name = s.mine_name
JOIN Mineral m ON m.mineral_name = s.mineral_name;


USE MineralResourceDB;

INSERT INTO Lease
    (lease_number, start_date, end_date, lease_status)
VALUES
    ('DEMO-LEASE-001', '2022-01-01', '2032-12-31', 'Active'),
    ('DEMO-LEASE-002', '2021-04-01', '2031-03-31', 'Active'),
    ('DEMO-LEASE-003', '2020-07-01', '2030-06-30', 'Active'),
    ('DEMO-LEASE-004', '2023-01-01', '2033-12-31', 'Active'),
    ('DEMO-LEASE-005', '2015-01-01', '2025-12-31', 'Expired'),
    ('DEMO-LEASE-006', '2024-04-01', '2034-03-31', 'Active'),
    ('DEMO-LEASE-007', '2019-06-01', '2029-05-31', 'Active'),
    ('DEMO-LEASE-008', '2022-09-01', '2032-08-31', 'Active');


INSERT INTO Production
    (mine_id, mineral_id, production_year, quantity, unit)
SELECT
    mi.mine_id,
    m.mineral_id,
    2024,
    125000.00,
    'tonnes'
FROM Mine mi
JOIN MineMineral mm ON mi.mine_id = mm.mine_id
JOIN Mineral m ON mm.mineral_id = m.mineral_id
WHERE mi.mine_name = 'CHILHATI'
  AND m.mineral_name = 'Limestone';

INSERT INTO Production
    (mine_id, mineral_id, production_year, quantity, unit)
SELECT
    mi.mine_id,
    m.mineral_id,
    2024,
    85000.00,
    'tonnes'
FROM Mine mi
JOIN MineMineral mm ON mi.mine_id = mm.mine_id
JOIN Mineral m ON mm.mineral_id = m.mineral_id
WHERE mi.mine_name = 'DALDALI'
  AND m.mineral_name = 'Bauxite';

INSERT INTO Production
    (mine_id, mineral_id, production_year, quantity, unit)
SELECT
    mi.mine_id,
    m.mineral_id,
    2025,
    96000.00,
    'tonnes'
FROM Mine mi
JOIN MineMineral mm ON mi.mine_id = mm.mine_id
JOIN Mineral m ON mm.mineral_id = m.mineral_id
WHERE mi.mine_name = 'TATIJHARIYA'
  AND m.mineral_name = 'Bauxite';

INSERT INTO Production
    (mine_id, mineral_id, production_year, quantity, unit)
SELECT
    mi.mine_id,
    m.mineral_id,
    2025,
    74000.00,
    'tonnes'
FROM Mine mi
JOIN MineMineral mm ON mi.mine_id = mm.mine_id
JOIN Mineral m ON mm.mineral_id = m.mineral_id
WHERE mi.mine_name = 'SAMRI'
  AND m.mineral_name = 'Bauxite';

INSERT INTO Production
    (mine_id, mineral_id, production_year, quantity, unit)
SELECT
    mi.mine_id,
    m.mineral_id,
    2024,
    110000.00,
    'tonnes'
FROM Mine mi
JOIN MineMineral mm ON mi.mine_id = mm.mine_id
JOIN Mineral m ON mm.mineral_id = m.mineral_id
WHERE mi.mine_name = 'Gua Iron Ore Mine (Durgaiburu 1443.756 Ha)'
  AND m.mineral_name = 'Iron Ore';

INSERT INTO Production
    (mine_id, mineral_id, production_year, quantity, unit)
SELECT
    mi.mine_id,
    m.mineral_id,
    2025,
    62000.00,
    'tonnes'
FROM Mine mi
JOIN MineMineral mm ON mi.mine_id = mm.mine_id
JOIN Mineral m ON mm.mineral_id = m.mineral_id
WHERE mi.mine_name = 'Surda Copper Mine'
  AND m.mineral_name = 'Copper Ore';
  



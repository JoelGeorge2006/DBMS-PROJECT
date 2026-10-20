CREATE DATABASE MineralResourceDB;
USE MineralResourceDB;

CREATE TABLE Location (
    location_id INT PRIMARY KEY AUTO_INCREMENT,
    state_name VARCHAR(100) NOT NULL,
    district_name VARCHAR(100) NOT NULL
);
CREATE TABLE MiningCompany (
    company_id INT PRIMARY KEY AUTO_INCREMENT,
    company_name VARCHAR(150) NOT NULL,
    headquarters_state VARCHAR(100)
);
CREATE TABLE  Mineral (
    mineral_id INT PRIMARY KEY AUTO_INCREMENT,
    mineral_name VARCHAR(100) NOT NULL UNIQUE,
    mineral_category VARCHAR(100)
);
CREATE TABLE IF NOT EXISTS Lease (
    lease_id INT PRIMARY KEY AUTO_INCREMENT,
    lease_number VARCHAR(100) NOT NULL UNIQUE,
    start_date DATE,
    end_date DATE,
    lease_status VARCHAR(30)
);
CREATE TABLE IF NOT EXISTS Mine (
    mine_id INT PRIMARY KEY AUTO_INCREMENT,
    mine_name VARCHAR(150) NOT NULL,
    location_id INT NOT NULL,
    company_id INT NOT NULL,
    lease_id INT,
    FOREIGN KEY (location_id)
        REFERENCES Location(location_id),
    FOREIGN KEY (company_id)
        REFERENCES MiningCompany(company_id),
    FOREIGN KEY (lease_id)
        REFERENCES Lease(lease_id)
);
CREATE TABLE IF NOT EXISTS MineMineral (
    mine_id INT NOT NULL,
    mineral_id INT NOT NULL,
    PRIMARY KEY (mine_id, mineral_id),
    FOREIGN KEY (mine_id)
        REFERENCES Mine(mine_id),
    FOREIGN KEY (mineral_id)
        REFERENCES Mineral(mineral_id)
);
CREATE TABLE IF NOT EXISTS Production (
    production_id INT PRIMARY KEY AUTO_INCREMENT,
    mine_id INT NOT NULL,
    mineral_id INT NOT NULL,
    production_year INT NOT NULL,
    quantity DECIMAL(15,2) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    FOREIGN KEY (mine_id, mineral_id)
        REFERENCES MineMineral(mine_id, mineral_id)
);
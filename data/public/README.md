# Public mining statistics

Official figures transcribed from government publications into CSV, then loaded by
`npm run db:setup` into the tables named below. Nothing here is estimated or
synthetic. Where a source leaves a value blank, the CSV and the database leave it blank too.

| File | Rows | Table | Source |
|---|---|---|---|
| `national_production.csv` | 94 | `national_production`, `mineral_product` | [Economic Survey 2023-24, Statistical Appendix, Table 1.32](https://indiabudget.gov.in/economicsurvey/doc/stat/tab132.pdf): production of major minerals under MCDR, 2021-22 to 2023-24 (2022-23 and 2023-24 provisional). Value in ₹ thousand. |
| `state_production_value.csv` | 115 | `state_production_value` | [IBM, Indian Mineral Industry at a Glance 2022-23](https://ibm.gov.in/writereaddata/files/17501634866851601e3668eIMIG_2223_Annex_IIMYB.pdf), Table 9: value of mineral production by state, 2018-19 to 2022-23, ₹ crore. Excludes atomic minerals; from 2020-21 also excludes fuel minerals. |
| `state_mining_leases.csv` | 23 | `state_mining_lease_stat` | Same publication, Table 3: mining leases by state as on 31-03-2023 (provisional; excludes fuel, atomic and minor minerals). |
| `state_reporting_mines.csv` | 48 | `state_reporting_mines` | Same publication, Table 5: reporting mines by state, 2021-22 and 2022-23. |
| `mineral_mining_leases.csv` | 37 | `commodity_mining_lease_stat` | Same publication, Table 2: mining leases by mineral as on 31-03-2023. |
| `mineral_reserves.csv` | 59 | `mineral_reserve` | Same publication, Table 1: National Mineral Inventory (UNFC) as on 01-04-2020. A blank value is "-" in the source; `note = not estimated` is "N.E.". |
| `royalty_rates.csv` | 106 | `royalty_rate` | MMDR Act, 1957, Second Schedule. 2009 and 2015 rates from [CSEP, Minerals Royalty Rates in India (2020)](https://csep.org/wp-content/uploads/2020/09/Minerals-royalty-rates-in-India-CSEP-NEW-22-sep.pdf), Annex-B. 2024 critical-mineral rates and the 12% default (Item 55) from [PIB, 29 Feb 2024](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2010126). |
| `critical_mineral_auctions.csv` | 18 | `block_auction`, `block_auction_commodity` | PIB results of [Tranche IV (7 Nov 2024)](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2071441) and [Tranche V (27 May 2025)](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2131723) of the critical and strategic mineral block auctions. |

All sources were retrieved on 2026-10-27.

## Checks made when transcribing

- **National production:** the yearly values add up to the table's "Value in thousand" totals. They are within ₹2 thousand, the difference coming from rounding in the source.
- **Value by state:** the state rows add up to the "All India" row in each year, within ₹2 crore of rounding.
- **Leases by state and by mineral:** both add up exactly to their totals (2,995 leases, 293,811.54 ha; metallic 932, non-metallic 2,063).
- **Reporting mines:** the state rows add up exactly to the "All India" row (1,323 and 1,408).

## Known gaps and choices

- **Tungsten royalty (2009 and 2015):** the CSEP paper gives ₹20 per unit per cent of WO₃ in its schedule annex, and ₹25 in its summary table. The row keeps that wording and leaves the number empty.
- **Royalty rates notified in 2022 and 2023** (glauconite, potash, molybdenum, PGM; lithium, niobium, REE) are not included: the source used here does not state them.
- **Auctions:** Tranches I–III are not included, because no official per-block table was found for them. A preferred bidder still has conditions to meet (e.g. performance security) before the licence is granted.
- **Mineral names:** each name is mapped to one row of the `commodity` table by `db/commodities.js`. For example, "Rock Phosphate" maps to Phosphorite, "Halite" to Rock Salt, and "Lead and Zinc Ore" to "Lead & Zinc". Iron ore reserves keep the source's split into Haematite and Magnetite as the `form` column.
- **Critical minerals:** `commodity.is_critical` marks the minerals on the Ministry of Mines list of 30 critical minerals (2023) that appear in these tables.

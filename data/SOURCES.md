# Mine data sources

| Source | What it gives | Licence | File |
|---|---|---|---|
| OpenStreetMap (Overpass API) | Mines and quarries in India with coordinates, `resource=*`, operator, disused/abandoned tags | ODbL 1.0, © OpenStreetMap contributors | `raw/osm_mines.json` |
| OpenStreetMap boundaries (Overpass `is_in`) | State (admin level 4) and district (admin level 5) for each mine | ODbL 1.0 | `raw/admin_lookup.json` |
| Wikidata (SPARQL) | Items that are a mine in India, with coordinates, product, operator | CC0 1.0 | `raw/wikidata_mines.json` |
| Curated (`curated/*.csv`) | Hand-sourced rows (IBM yearbooks, company reports); each row must cite `source_url` | Facts only, cited | `curated/mines_curated.csv` |
| MINERVA sample data | The 8 original records with leases and production | Synthetic, for demonstration | `../schema.sql` |

## Scope

Major minerals and coal only. Features tagged as minor minerals (clay, building
stone, sand, gravel, aggregate, granite, marble, laterite...) are skipped, as are
named quarries whose name gives no major mineral. A feature with no mineral tag is
kept when its operator only mines one mineral (e.g. a Coal India subsidiary -> coal);
the mine's grade note then says "Mineral inferred from the operator". Wikidata items
with no product or mineral in their label are skipped: they are often coalfields,
company "Area" offices or townships rather than single mines. See `scripts/import/minerals.js`.

Duplicates: points of the same mineral within 2 km merge when either is unnamed or
their names match after removing generic and mineral words ("Sasti Coal Mine" =
"Sasti"). A Wikidata item merges into an OSM mine with the same name within 15 km.
Two OSM spellings are mapped onto the existing districts: Kendujhar -> Keonjhar,
Ballari -> Bellary.

## What is not invented

Imported mines have no lease, assay or production rows: public data does not give
them, so the database stores NULL and the UI says "not recorded". Status is
`Closed` when OSM/Wikidata mark the site disused or abandoned, otherwise `Unknown`.
Every mine stores its source, a link to the source record, and its location precision.

## Refresh

```bash
npm run import:fetch   # download OSM + Wikidata extracts (network)
npm run import:mines   # normalise + dedupe, look up districts (network, cached), load into minerva.db
```

`processed/report.md` lists mines per state and mineral after each load.
